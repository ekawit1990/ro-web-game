-- Music Land: schema + game rules.
-- Clients can only SELECT their own rows; every change goes through the
-- security definer functions below, so EXP, zeny and drops are decided here.
-- Menu actions (create, stats, shop, equip) are called by the browser.
-- Combat results (kills, potions, death, HP/position) are called only by the
-- Colyseus game server with the service role key, passing the player's user id.

create table if not exists public.class_defs (
  id text primary key,
  base_stats jsonb not null,
  start_weapon text not null
);

create table if not exists public.item_defs (
  id text primary key,
  type text not null check (type in ('consumable', 'loot', 'weapon', 'armor')),
  price int not null,
  classes text[],
  in_shop boolean not null default false
);

create table if not exists public.monster_defs (
  id text primary key,
  exp int not null,
  zeny_min int not null,
  zeny_max int not null,
  drops jsonb not null default '[]'
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null unique check (char_length(name) between 2 and 16),
  cls text not null references public.class_defs (id),
  level int not null default 1,
  exp int not null default 0,
  zeny int not null default 100,
  stat_points int not null default 0,
  str int not null, agi int not null, vit int not null, "int" int not null, dex int not null,
  hp int not null default -1,
  sp int not null default -1,
  pos_x real not null default 5.5,
  pos_y real not null default 5.5,
  last_kill_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists characters_user_idx on public.characters (user_id);

create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  item_id text not null references public.item_defs (id),
  qty int not null check (qty > 0),
  equipped boolean not null default false
);
create index if not exists inventory_char_idx on public.inventory (character_id);

alter table public.class_defs enable row level security;
alter table public.item_defs enable row level security;
alter table public.monster_defs enable row level security;
alter table public.characters enable row level security;
alter table public.inventory enable row level security;

drop policy if exists "defs readable" on public.class_defs;
create policy "defs readable" on public.class_defs for select using (true);
drop policy if exists "defs readable" on public.item_defs;
create policy "defs readable" on public.item_defs for select using (true);
drop policy if exists "defs readable" on public.monster_defs;
create policy "defs readable" on public.monster_defs for select using (true);

drop policy if exists "own characters" on public.characters;
create policy "own characters" on public.characters for select to authenticated using (user_id = auth.uid());
drop policy if exists "delete own characters" on public.characters;
create policy "delete own characters" on public.characters for delete to authenticated using (user_id = auth.uid());

drop policy if exists "own inventory" on public.inventory;
create policy "own inventory" on public.inventory for select to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));

revoke insert, update on public.characters, public.inventory from anon, authenticated;

-- ---------------------------------------------------------------- helpers

-- Must match expToNext() in src/data/index.ts
create or replace function public.exp_to_next(lvl int) returns int
language sql immutable as $$ select floor(15 * power(lvl::float8, 1.9))::int + 10 $$;

create or replace function public._own_char(p_char uuid, p_user uuid default null) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters;
begin
  select * into c from public.characters where id = p_char and user_id = coalesce(p_user, auth.uid()) for update;
  if not found then raise exception 'ไม่พบตัวละคร'; end if;
  return c;
end $$;

create or replace function public._add_item(p_char uuid, p_item text, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare t text;
begin
  select type into t from public.item_defs where id = p_item;
  if t is null then raise exception 'unknown item %', p_item; end if;
  if t in ('weapon', 'armor') then
    insert into public.inventory (character_id, item_id, qty)
      select p_char, p_item, 1 from generate_series(1, p_qty);
  else
    update public.inventory set qty = qty + p_qty where character_id = p_char and item_id = p_item;
    if not found then
      insert into public.inventory (character_id, item_id, qty) values (p_char, p_item, p_qty);
    end if;
  end if;
end $$;

revoke execute on function public._own_char(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._add_item(uuid, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- game actions

create or replace function public.create_character(p_name text, p_cls text) returns public.characters
language plpgsql security definer set search_path = public as $$
declare d public.class_defs; c public.characters; inv_id uuid;
begin
  if auth.uid() is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  p_name := btrim(p_name);
  if char_length(p_name) not between 2 and 16 then raise exception 'ชื่อต้องยาว 2-16 ตัวอักษร'; end if;
  if (select count(*) from public.characters where user_id = auth.uid()) >= 3 then
    raise exception 'สร้างได้สูงสุด 3 ตัวละคร';
  end if;
  if exists (select 1 from public.characters where name = p_name) then raise exception 'ชื่อนี้ถูกใช้แล้ว'; end if;
  select * into d from public.class_defs where id = p_cls;
  if not found then raise exception 'ไม่มีอาชีพนี้'; end if;

  insert into public.characters (user_id, name, cls, str, agi, vit, "int", dex)
  values (auth.uid(), p_name, p_cls,
    (d.base_stats->>'str')::int, (d.base_stats->>'agi')::int, (d.base_stats->>'vit')::int,
    (d.base_stats->>'int')::int, (d.base_stats->>'dex')::int)
  returning * into c;

  insert into public.inventory (character_id, item_id, qty, equipped)
    values (c.id, d.start_weapon, 1, true) returning id into inv_id;
  perform public._add_item(c.id, 'water', 5);
  return c;
end $$;

create or replace function public.report_kill(p_user uuid, p_char uuid, p_monster text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.characters; m public.monster_defs; d jsonb;
  got text[] := '{}'; z int; start_level int; max_level constant int := 50;
begin
  c := public._own_char(p_char, p_user);
  select * into m from public.monster_defs where id = p_monster;
  if not found then raise exception 'unknown monster'; end if;

  for d in select * from jsonb_array_elements(m.drops) loop
    if random() < (d->>1)::float8 then
      got := got || (d->>0);
      perform public._add_item(p_char, d->>0, 1);
    end if;
  end loop;

  z := m.zeny_min + floor(random() * (m.zeny_max - m.zeny_min + 1))::int;
  start_level := c.level;
  c.zeny := c.zeny + z;
  if c.level < max_level then c.exp := c.exp + m.exp; end if;
  while c.level < max_level and c.exp >= public.exp_to_next(c.level) loop
    c.exp := c.exp - public.exp_to_next(c.level);
    c.level := c.level + 1;
    c.stat_points := c.stat_points + 5;
  end loop;
  if c.level >= max_level then c.exp := 0; end if;

  update public.characters
    set zeny = c.zeny, exp = c.exp, level = c.level, stat_points = c.stat_points, last_kill_at = now()
    where id = p_char returning * into c;

  return jsonb_build_object(
    'character', to_jsonb(c) - 'user_id' - 'last_kill_at' - 'created_at',
    'drops', to_jsonb(got), 'zeny', z, 'exp', m.exp, 'leveledUp', c.level > start_level);
end $$;

create or replace function public.allocate_stat(p_char uuid, p_stat text) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters; cur int;
begin
  c := public._own_char(p_char);
  if p_stat not in ('str', 'agi', 'vit', 'int', 'dex') then raise exception 'bad stat'; end if;
  if c.stat_points < 1 then raise exception 'แต้มสเตตัสไม่พอ'; end if;
  execute format('select %I from public.characters where id = $1', p_stat) into cur using p_char;
  if cur >= 99 then raise exception 'สเตตัสเต็มแล้ว'; end if;
  execute format('update public.characters set %I = %I + 1, stat_points = stat_points - 1 where id = $1', p_stat, p_stat)
    using p_char;
  select * into c from public.characters where id = p_char;
  return c;
end $$;

create or replace function public.buy_item(p_char uuid, p_item text, p_qty int) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters; v_price int;
begin
  c := public._own_char(p_char);
  select i.price into v_price from public.item_defs i where i.id = p_item and i.in_shop;
  if v_price is null or p_qty < 1 or p_qty > 99 then raise exception 'ซื้อไม่ได้'; end if;
  if c.zeny < v_price * p_qty then raise exception 'เงินไม่พอ'; end if;
  update public.characters set zeny = zeny - v_price * p_qty where id = p_char returning * into c;
  perform public._add_item(p_char, p_item, p_qty);
  return c;
end $$;

create or replace function public.sell_item(p_char uuid, p_inv uuid, p_qty int) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters; r public.inventory; v_price int;
begin
  c := public._own_char(p_char);
  select * into r from public.inventory where id = p_inv and character_id = p_char for update;
  if not found or r.equipped or p_qty < 1 or p_qty > r.qty then raise exception 'ขายไม่ได้'; end if;
  select i.price into v_price from public.item_defs i where i.id = r.item_id;
  if r.qty = p_qty then delete from public.inventory where id = p_inv;
  else update public.inventory set qty = qty - p_qty where id = p_inv; end if;
  update public.characters set zeny = zeny + (v_price / 2) * p_qty where id = p_char returning * into c;
  return c;
end $$;

create or replace function public.use_item(p_user uuid, p_char uuid, p_inv uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r public.inventory;
begin
  perform public._own_char(p_char, p_user);
  select inv.* into r from public.inventory inv join public.item_defs i on i.id = inv.item_id
    where inv.id = p_inv and inv.character_id = p_char and i.type = 'consumable' for update of inv;
  if not found then raise exception 'ใช้ไม่ได้'; end if;
  if r.qty = 1 then delete from public.inventory where id = p_inv;
  else update public.inventory set qty = qty - 1 where id = p_inv; end if;
  return r.item_id;
end $$;

create or replace function public.set_equipped(p_char uuid, p_inv uuid, p_equipped boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.characters; r public.inventory; it public.item_defs;
begin
  c := public._own_char(p_char);
  select * into r from public.inventory where id = p_inv and character_id = p_char;
  if not found then raise exception 'ไม่พบไอเท็ม'; end if;
  select * into it from public.item_defs where id = r.item_id;
  if it.type not in ('weapon', 'armor') then raise exception 'สวมใส่ไม่ได้'; end if;
  if p_equipped and it.classes is not null and not (c.cls = any (it.classes)) then
    raise exception 'อาชีพนี้ใช้ไม่ได้';
  end if;
  if p_equipped then
    update public.inventory inv set equipped = false
      from public.item_defs i
      where inv.character_id = p_char and inv.equipped and i.id = inv.item_id and i.type = it.type;
  end if;
  update public.inventory set equipped = p_equipped where id = p_inv;
end $$;

create or replace function public.save_state(p_user uuid, p_char uuid, p_hp int, p_sp int, p_x real, p_y real) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._own_char(p_char, p_user);
  update public.characters
    set hp = greatest(p_hp, 1), sp = greatest(p_sp, 0),
        pos_x = least(greatest(p_x, 0), 50), pos_y = least(greatest(p_y, 0), 40)
    where id = p_char;
end $$;

create or replace function public.on_death(p_user uuid, p_char uuid) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters;
begin
  c := public._own_char(p_char, p_user);
  update public.characters
    set exp = greatest(0, exp - floor(public.exp_to_next(level) * 0.05)::int), pos_x = 5.5, pos_y = 5.5
    where id = p_char returning * into c;
  return c;
end $$;

-- browser (signed-in player)
revoke execute on function public.create_character(text, text) from public, anon;
revoke execute on function public.allocate_stat(uuid, text) from public, anon;
revoke execute on function public.buy_item(uuid, text, int) from public, anon;
revoke execute on function public.sell_item(uuid, uuid, int) from public, anon;
revoke execute on function public.set_equipped(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_character(text, text) to authenticated;
grant execute on function public.allocate_stat(uuid, text) to authenticated;
grant execute on function public.buy_item(uuid, text, int) to authenticated;
grant execute on function public.sell_item(uuid, uuid, int) to authenticated;
grant execute on function public.set_equipped(uuid, uuid, boolean) to authenticated;

-- game server only (service role)
revoke execute on function public.report_kill(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.use_item(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.save_state(uuid, uuid, int, int, real, real) from public, anon, authenticated;
revoke execute on function public.on_death(uuid, uuid) from public, anon, authenticated;
grant execute on function public.report_kill(uuid, uuid, text) to service_role;
grant execute on function public.use_item(uuid, uuid, uuid) to service_role;
grant execute on function public.save_state(uuid, uuid, int, int, real, real) to service_role;
grant execute on function public.on_death(uuid, uuid) to service_role;
