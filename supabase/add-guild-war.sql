-- Music Land: guilds and the guild war (2026-11-10). Run once in the Supabase SQL Editor (safe to run again).
-- Only the game server (service role) reads and writes these tables; browsers get guild data from the server.

create table if not exists public.guilds (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  leader uuid references public.characters (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint guilds_name_len check (char_length(name) between 2 and 16)
);
create unique index if not exists guilds_name_key on public.guilds (lower(name));

create table if not exists public.guild_members (
  char_id uuid primary key references public.characters (id) on delete cascade,
  guild_id uuid not null references public.guilds (id) on delete cascade,
  joined_at timestamptz not null default now()
);
create index if not exists guild_members_guild on public.guild_members (guild_id);

-- who holds each war castle ('gvg' = ปราสาทแห่งเสียง)
create table if not exists public.guild_castles (
  castle text primary key,
  guild_id uuid references public.guilds (id) on delete set null,
  since timestamptz not null default now()
);

alter table public.guilds enable row level security;
alter table public.guild_members enable row level security;
alter table public.guild_castles enable row level security;
revoke all on public.guilds, public.guild_members, public.guild_castles from anon, authenticated;
grant all on public.guilds, public.guild_members, public.guild_castles to service_role;

-- Makes a guild: takes the fee and makes the character its leader, all in one go.
create or replace function public.guild_create(p_user uuid, p_char uuid, p_name text, p_cost int) returns uuid
language plpgsql security definer set search_path = public as $$
declare c public.characters; g uuid;
begin
  c := public._own_char(p_char, p_user);
  if p_cost < 0 then raise exception 'bad fee'; end if;
  if exists (select 1 from public.guild_members where char_id = p_char) then raise exception 'คุณอยู่ในกิลด์แล้ว'; end if;
  if c.zeny < p_cost then raise exception 'Zeny ไม่พอ (ค่าสร้างกิลด์ % z)', p_cost; end if;
  if exists (select 1 from public.guilds where lower(name) = lower(trim(p_name))) then raise exception 'ชื่อกิลด์นี้มีคนใช้แล้ว'; end if;
  insert into public.guilds (name, leader) values (trim(p_name), p_char) returning id into g;
  insert into public.guild_members (char_id, guild_id) values (p_char, g);
  update public.characters set zeny = zeny - p_cost where id = p_char;
  return g;
end $$;
revoke execute on function public.guild_create(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function public.guild_create(uuid, uuid, text, int) to service_role;

insert into public.guild_castles (castle, guild_id) values ('gvg', null) on conflict (castle) do nothing;
