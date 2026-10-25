-- Music Land: schema + game rules. Safe to run again (and on top of an older version).
--
-- Clients can only SELECT their own rows; every change goes through the
-- security definer functions below, so EXP, zeny and drops are decided here.
-- Menu actions (create, stats, skills, shop, equip) are called by the browser.
-- Combat results, potions, death, HP/position and trades are called only by the
-- Colyseus game server with the service role key, passing the player's user id.

create table if not exists public.class_defs (
  id text primary key,
  base_stats jsonb not null,
  start_weapon text not null
);

create table if not exists public.item_defs (
  id text primary key,
  type text not null,
  price int not null,
  classes text[],
  in_shop boolean not null default false
);
alter table public.item_defs add column if not exists weight int not null default 1;
alter table public.item_defs drop constraint if exists item_defs_type_check;
alter table public.item_defs add constraint item_defs_type_check
  check (type in ('consumable', 'loot', 'weapon', 'armor', 'head', 'accessory'));

create table if not exists public.monster_defs (
  id text primary key,
  exp int not null,
  zeny_min int not null,
  zeny_max int not null,
  drops jsonb not null default '[]'
);
alter table public.monster_defs add column if not exists job_exp int not null default 0;

create table if not exists public.skill_defs (
  id text primary key,
  cls text not null,
  max_level int not null
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
  pos_x real not null default 22.5,
  pos_y real not null default 26.5,
  last_kill_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.characters add column if not exists luk int not null default 1;
alter table public.characters add column if not exists gender text not null default 'm';
alter table public.characters add column if not exists hair int not null default 0;
alter table public.characters add column if not exists hair_color int not null default 0;
alter table public.characters add column if not exists face int not null default 0;
alter table public.characters add column if not exists job_level int not null default 1;
alter table public.characters add column if not exists job_exp int not null default 0;
alter table public.characters add column if not exists skill_points int not null default 0;
alter table public.characters add column if not exists skills jsonb not null default '{}';
alter table public.characters add column if not exists map text not null default 'town';
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
alter table public.skill_defs enable row level security;
alter table public.characters enable row level security;
alter table public.inventory enable row level security;

drop policy if exists "defs readable" on public.class_defs;
create policy "defs readable" on public.class_defs for select using (true);
drop policy if exists "defs readable" on public.item_defs;
create policy "defs readable" on public.item_defs for select using (true);
drop policy if exists "defs readable" on public.monster_defs;
create policy "defs readable" on public.monster_defs for select using (true);
drop policy if exists "defs readable" on public.skill_defs;
create policy "defs readable" on public.skill_defs for select using (true);

drop policy if exists "own characters" on public.characters;
create policy "own characters" on public.characters for select to authenticated using (user_id = auth.uid());
drop policy if exists "delete own characters" on public.characters;
create policy "delete own characters" on public.characters for delete to authenticated using (user_id = auth.uid());

drop policy if exists "own inventory" on public.inventory;
create policy "own inventory" on public.inventory for select to authenticated
  using (exists (select 1 from public.characters c where c.id = character_id and c.user_id = auth.uid()));

revoke insert, update on public.characters, public.inventory from anon, authenticated;

-- older versions of these functions had other parameters
drop function if exists public.create_character(text, text);
drop function if exists public.report_kill(uuid, text);
drop function if exists public.use_item(uuid, uuid);
drop function if exists public.save_state(uuid, int, int, real, real);
drop function if exists public.save_state(uuid, uuid, int, int, real, real);
drop function if exists public.on_death(uuid);
drop function if exists public._own_char(uuid);

-- ---------------------------------------------------------------- formulas (match src/data/index.ts)

create or replace function public.exp_to_next(lvl int) returns int
language sql immutable as $$ select floor(15 * power(lvl::float8, 1.9))::int + 10 $$;

create or replace function public.job_exp_to_next(lvl int) returns int
language sql immutable as $$ select floor(12 * power(lvl::float8, 1.8))::int + 8 $$;

create or replace function public.stat_cost(cur int) returns int
language sql immutable as $$ select (cur - 1) / 10 + 2 $$;

-- ---------------------------------------------------------------- helpers

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
  if t in ('weapon', 'armor', 'head', 'accessory') then
    insert into public.inventory (character_id, item_id, qty)
      select p_char, p_item, 1 from generate_series(1, p_qty);
  else
    update public.inventory set qty = qty + p_qty where character_id = p_char and item_id = p_item;
    if not found then
      insert into public.inventory (character_id, item_id, qty) values (p_char, p_item, p_qty);
    end if;
  end if;
end $$;

create or replace function public._char_json(c public.characters) returns jsonb
language sql immutable as $$ select to_jsonb(c) - 'user_id' - 'last_kill_at' - 'created_at' $$;

revoke execute on function public._own_char(uuid, uuid) from public, anon, authenticated;
revoke execute on function public._add_item(uuid, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- menu actions (browser)

create or replace function public.create_character(
  p_name text, p_cls text, p_gender text, p_hair int, p_hair_color int, p_face int
) returns public.characters
language plpgsql security definer set search_path = public as $$
declare d public.class_defs; c public.characters;
begin
  if auth.uid() is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  p_name := btrim(p_name);
  if char_length(p_name) not between 2 and 16 then raise exception 'ชื่อต้องยาว 2-16 ตัวอักษร'; end if;
  if (select count(*) from public.characters where user_id = auth.uid()) >= 3 then
    raise exception 'สร้างได้สูงสุด 3 ตัวละคร';
  end if;
  if exists (select 1 from public.characters where name = p_name) then raise exception 'ชื่อนี้ถูกใช้แล้ว'; end if;
  if p_gender not in ('m', 'f') or p_hair not between 0 and 5 or p_hair_color not between 0 and 7 or p_face not between 0 and 3 then
    raise exception 'หน้าตาไม่ถูกต้อง';
  end if;
  select * into d from public.class_defs where id = p_cls;
  if not found then raise exception 'ไม่มีอาชีพนี้'; end if;

  insert into public.characters (user_id, name, cls, str, agi, vit, "int", dex, luk, gender, hair, hair_color, face)
  values (auth.uid(), p_name, p_cls,
    (d.base_stats->>'str')::int, (d.base_stats->>'agi')::int, (d.base_stats->>'vit')::int,
    (d.base_stats->>'int')::int, (d.base_stats->>'dex')::int, (d.base_stats->>'luk')::int,
    p_gender, p_hair, p_hair_color, p_face)
  returning * into c;

  insert into public.inventory (character_id, item_id, qty, equipped) values (c.id, d.start_weapon, 1, true);
  perform public._add_item(c.id, 'water', 5);
  return c;
end $$;

create or replace function public.allocate_stat(p_char uuid, p_stat text) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters; cur int; cost int;
begin
  c := public._own_char(p_char);
  if p_stat not in ('str', 'agi', 'vit', 'int', 'dex', 'luk') then raise exception 'bad stat'; end if;
  execute format('select %I from public.characters where id = $1', p_stat) into cur using p_char;
  if cur >= 99 then raise exception 'สเตตัสเต็มแล้ว'; end if;
  cost := public.stat_cost(cur);
  if c.stat_points < cost then raise exception 'แต้มสเตตัสไม่พอ (ต้องใช้ %)', cost; end if;
  execute format('update public.characters set %I = %I + 1, stat_points = stat_points - $2 where id = $1', p_stat, p_stat)
    using p_char, cost;
  select * into c from public.characters where id = p_char;
  return c;
end $$;

create or replace function public.learn_skill(p_char uuid, p_skill text) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters; s public.skill_defs; cur int;
begin
  c := public._own_char(p_char);
  select * into s from public.skill_defs where id = p_skill;
  if not found or s.cls <> c.cls then raise exception 'อาชีพนี้เรียนสกิลนี้ไม่ได้'; end if;
  cur := coalesce((c.skills->>p_skill)::int, 0);
  if cur >= s.max_level then raise exception 'สกิลเต็มแล้ว'; end if;
  if c.skill_points < 1 then raise exception 'แต้มสกิลไม่พอ'; end if;
  update public.characters
    set skills = skills || jsonb_build_object(p_skill, cur + 1), skill_points = skill_points - 1
    where id = p_char returning * into c;
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

create or replace function public.set_equipped(p_char uuid, p_inv uuid, p_equipped boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c public.characters; r public.inventory; it public.item_defs;
begin
  c := public._own_char(p_char);
  select * into r from public.inventory where id = p_inv and character_id = p_char;
  if not found then raise exception 'ไม่พบไอเท็ม'; end if;
  select * into it from public.item_defs where id = r.item_id;
  if it.type not in ('weapon', 'armor', 'head', 'accessory') then raise exception 'สวมใส่ไม่ได้'; end if;
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

-- ---------------------------------------------------------------- game server only

create or replace function public.report_kill(p_user uuid, p_char uuid, p_monster text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.characters; m public.monster_defs; d jsonb;
  got text[] := '{}'; z int; start_level int; start_job int;
  max_level constant int := 99; max_job constant int := 50;
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
  start_job := c.job_level;
  c.zeny := c.zeny + z;
  if c.level < max_level then c.exp := c.exp + m.exp; end if;
  while c.level < max_level and c.exp >= public.exp_to_next(c.level) loop
    c.exp := c.exp - public.exp_to_next(c.level);
    c.level := c.level + 1;
    c.stat_points := c.stat_points + c.level / 5 + 3;
  end loop;
  if c.level >= max_level then c.exp := 0; end if;
  if c.job_level < max_job then c.job_exp := c.job_exp + m.job_exp; end if;
  while c.job_level < max_job and c.job_exp >= public.job_exp_to_next(c.job_level) loop
    c.job_exp := c.job_exp - public.job_exp_to_next(c.job_level);
    c.job_level := c.job_level + 1;
    c.skill_points := c.skill_points + 1;
  end loop;
  if c.job_level >= max_job then c.job_exp := 0; end if;

  update public.characters
    set zeny = c.zeny, exp = c.exp, level = c.level, stat_points = c.stat_points,
        job_exp = c.job_exp, job_level = c.job_level, skill_points = c.skill_points, last_kill_at = now()
    where id = p_char returning * into c;

  return jsonb_build_object(
    'character', public._char_json(c), 'drops', to_jsonb(got), 'zeny', z, 'exp', m.exp, 'jobExp', m.job_exp,
    'leveledUp', c.level > start_level, 'jobLeveledUp', c.job_level > start_job);
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

create or replace function public.save_state(
  p_user uuid, p_char uuid, p_hp int, p_sp int, p_map text, p_x real, p_y real
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._own_char(p_char, p_user);
  update public.characters
    set hp = greatest(p_hp, 1), sp = greatest(p_sp, 0), map = p_map,
        pos_x = least(greatest(p_x, 0), 200), pos_y = least(greatest(p_y, 0), 200)
    where id = p_char;
end $$;

create or replace function public.on_death(p_user uuid, p_char uuid) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters;
begin
  c := public._own_char(p_char, p_user);
  update public.characters
    set exp = greatest(0, exp - floor(public.exp_to_next(level) * 0.05)::int), map = 'town', pos_x = 22.5, pos_y = 26.5
    where id = p_char returning * into c;
  return c;
end $$;

-- Swap items and zeny between two characters in one transaction.
-- p_items_*: [{"inv": "<inventory id>", "qty": n}, ...] offered by that side.
create or replace function public.trade_execute(
  p_user_a uuid, p_char_a uuid, p_items_a jsonb, p_zeny_a int,
  p_user_b uuid, p_char_b uuid, p_items_b jsonb, p_zeny_b int
) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.characters; b public.characters;
  side int; giver uuid; taker uuid; offer jsonb; o jsonb; r public.inventory; t text; q int;
begin
  if p_char_a = p_char_b then raise exception 'แลกกับตัวเองไม่ได้'; end if;
  -- lock both in a fixed order to avoid deadlocks
  if p_char_a < p_char_b then
    a := public._own_char(p_char_a, p_user_a); b := public._own_char(p_char_b, p_user_b);
  else
    b := public._own_char(p_char_b, p_user_b); a := public._own_char(p_char_a, p_user_a);
  end if;
  if p_zeny_a < 0 or p_zeny_b < 0 or a.zeny < p_zeny_a or b.zeny < p_zeny_b then raise exception 'เงินไม่พอ'; end if;

  for side in 1..2 loop
    if side = 1 then giver := p_char_a; taker := p_char_b; offer := p_items_a;
    else giver := p_char_b; taker := p_char_a; offer := p_items_b; end if;
    for o in select * from jsonb_array_elements(coalesce(offer, '[]')) loop
      q := (o->>'qty')::int;
      select * into r from public.inventory where id = (o->>'inv')::uuid and character_id = giver for update;
      if not found or r.equipped or q < 1 or q > r.qty then raise exception 'ไอเท็มที่แลกไม่ถูกต้อง'; end if;
      select type into t from public.item_defs where id = r.item_id;
      if t in ('weapon', 'armor', 'head', 'accessory') then
        update public.inventory set character_id = taker, equipped = false where id = r.id;
      else
        if q = r.qty then delete from public.inventory where id = r.id;
        else update public.inventory set qty = qty - q where id = r.id; end if;
        perform public._add_item(taker, r.item_id, q);
      end if;
    end loop;
  end loop;

  update public.characters set zeny = zeny - p_zeny_a + p_zeny_b where id = p_char_a;
  update public.characters set zeny = zeny - p_zeny_b + p_zeny_a where id = p_char_b;
end $$;

-- ---------------------------------------------------------------- permissions

revoke execute on function public.create_character(text, text, text, int, int, int) from public, anon;
revoke execute on function public.allocate_stat(uuid, text) from public, anon;
revoke execute on function public.learn_skill(uuid, text) from public, anon;
revoke execute on function public.buy_item(uuid, text, int) from public, anon;
revoke execute on function public.sell_item(uuid, uuid, int) from public, anon;
revoke execute on function public.set_equipped(uuid, uuid, boolean) from public, anon;
grant execute on function public.create_character(text, text, text, int, int, int) to authenticated;
grant execute on function public.allocate_stat(uuid, text) to authenticated;
grant execute on function public.learn_skill(uuid, text) to authenticated;
grant execute on function public.buy_item(uuid, text, int) to authenticated;
grant execute on function public.sell_item(uuid, uuid, int) to authenticated;
grant execute on function public.set_equipped(uuid, uuid, boolean) to authenticated;

revoke execute on function public.report_kill(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.use_item(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.save_state(uuid, uuid, int, int, text, real, real) from public, anon, authenticated;
revoke execute on function public.on_death(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.trade_execute(uuid, uuid, jsonb, int, uuid, uuid, jsonb, int) from public, anon, authenticated;
grant execute on function public.report_kill(uuid, uuid, text) to service_role;
grant execute on function public.use_item(uuid, uuid, uuid) to service_role;
grant execute on function public.save_state(uuid, uuid, int, int, text, real, real) to service_role;
grant execute on function public.on_death(uuid, uuid) to service_role;
grant execute on function public.trade_execute(uuid, uuid, jsonb, int, uuid, uuid, jsonb, int) to service_role;
