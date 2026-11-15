-- Admin panel (admin.html): admins edit items / cards / skills / monsters / drop rates / classes.
-- Run once in the Supabase SQL Editor. Safe to run again.
--
-- How it works
--   public.game_overrides  one row per edited def (the whole JSON object, replaces the gamedata.json version).
--                          Everyone can read it (the game client and server load it); nobody can write it
--                          directly: only admin_save_def(), which checks public.game_admins.
--   admin_save_def()       saves the row AND copies the numbers the database rules use (price, weight, type,
--                          classes, req level, card slot / monster exp, zeny, drops / skill max level / class
--                          stats) into item_defs, monster_defs, skill_defs, class_defs, so SQL and the game agree.
--   game_override_log      history of every save (who, when, what) for admins.
--
-- Make yourself an admin (change "your_username" to the game username you log in with):
--   insert into public.game_admins (user_id)
--   select id from auth.users where email = 'your_username@player.musicland.invalid'
--   on conflict do nothing;

create table if not exists public.game_admins (
  user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.game_admins enable row level security;
drop policy if exists "admins see themselves" on public.game_admins;
create policy "admins see themselves" on public.game_admins for select using (user_id = auth.uid());

create or replace function public.is_game_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.game_admins where user_id = auth.uid());
$$;
grant execute on function public.is_game_admin() to authenticated;

create table if not exists public.game_overrides (
  kind text not null check (kind in ('items', 'skills', 'monsters', 'classes')),
  id text not null check (id ~ '^[a-z0-9_]{1,64}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null,
  primary key (kind, id)
);
alter table public.game_overrides enable row level security;
drop policy if exists "overrides readable" on public.game_overrides;
create policy "overrides readable" on public.game_overrides for select using (true);
-- no insert/update/delete policies: writes go through admin_save_def()

create table if not exists public.game_override_log (
  id bigserial primary key,
  kind text not null,
  def_id text not null,
  action text not null, -- 'save' | 'revert'
  data jsonb,
  by_user uuid references auth.users on delete set null,
  at timestamptz not null default now()
);
alter table public.game_override_log enable row level security;
drop policy if exists "admins read log" on public.game_override_log;
create policy "admins read log" on public.game_override_log for select using (public.is_game_admin());

-- p_revert = true: p_data is the shipped gamedata.json version; the rule tables get it back and the override row goes.
create or replace function public.admin_save_def(p_kind text, p_id text, p_data jsonb, p_revert boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_classes text[];
begin
  if not public.is_game_admin() then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น'; end if;
  if p_kind not in ('items', 'skills', 'monsters', 'classes') then raise exception 'ชนิดข้อมูลไม่ถูกต้อง'; end if;
  if p_id !~ '^[a-z0-9_]{1,64}$' then raise exception 'รหัสไม่ถูกต้อง'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'ข้อมูลต้องเป็น JSON object'; end if;

  if p_kind = 'items' then
    v_classes := case when jsonb_typeof(p_data->'classes') = 'array'
      then array(select jsonb_array_elements_text(p_data->'classes')) else null end;
    insert into public.item_defs (id, type, price, classes, in_shop, weight, slots, card_slot, gender, req_level)
    values (p_id, p_data->>'type', (p_data->>'price')::int, v_classes, false,
      coalesce((p_data->>'weight')::int, 1), coalesce((p_data->>'slots')::int, 0), p_data->'card'->>'slot',
      p_data->>'gender', coalesce((p_data->>'reqLevel')::int, 1))
    on conflict (id) do update set type = excluded.type, price = excluded.price, classes = excluded.classes,
      weight = excluded.weight, slots = excluded.slots, card_slot = excluded.card_slot, gender = excluded.gender,
      req_level = excluded.req_level;
  elsif p_kind = 'monsters' then
    update public.monster_defs set
      level = (p_data->>'level')::int, exp = (p_data->>'exp')::int, job_exp = (p_data->>'jobExp')::int,
      zeny_min = (p_data->'zeny'->>0)::int, zeny_max = (p_data->'zeny'->>1)::int, drops = coalesce(p_data->'drops', '[]')
    where id = p_id;
    if not found then raise exception 'ไม่มีมอนสเตอร์ % ในเกม (เพิ่มมอนใหม่จากหน้าแอดมินไม่ได้)', p_id; end if;
  elsif p_kind = 'skills' then
    update public.skill_defs set cls = p_data->>'cls', max_level = (p_data->>'maxLevel')::int where id = p_id;
    if not found then raise exception 'ไม่มีสกิล % ในเกม', p_id; end if;
  else
    update public.class_defs set base_stats = p_data->'baseStats', start_weapon = p_data->>'startWeapon' where id = p_id;
    if not found then raise exception 'ไม่มีอาชีพ % ในเกม', p_id; end if;
  end if;

  if p_revert then
    delete from public.game_overrides where kind = p_kind and id = p_id;
  else
    insert into public.game_overrides (kind, id, data, updated_at, updated_by)
    values (p_kind, p_id, p_data, now(), auth.uid())
    on conflict (kind, id) do update set data = excluded.data, updated_at = now(), updated_by = auth.uid();
  end if;
  insert into public.game_override_log (kind, def_id, action, data, by_user)
  values (p_kind, p_id, case when p_revert then 'revert' else 'save' end, p_data, auth.uid());
end $$;
revoke all on function public.admin_save_def(text, text, jsonb, boolean) from public, anon;
grant execute on function public.admin_save_def(text, text, jsonb, boolean) to authenticated;

-- An item an admin added (not in gamedata.json) can be removed again, as long as nobody owns one.
create or replace function public.admin_delete_item(p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_game_admin() then raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น'; end if;
  if exists (select 1 from public.inventory where item_id = p_id or p_id = any(cards))
     or exists (select 1 from public.account_storage where item_id = p_id or p_id = any(cards)) then
    raise exception 'ยังมีผู้เล่นถือไอเท็มนี้อยู่ ลบไม่ได้';
  end if;
  delete from public.game_overrides where kind = 'items' and id = p_id;
  delete from public.item_defs where id = p_id;
  insert into public.game_override_log (kind, def_id, action, data, by_user) values ('items', p_id, 'delete', null, auth.uid());
end $$;
revoke all on function public.admin_delete_item(text) from public, anon;
grant execute on function public.admin_delete_item(text) to authenticated;
