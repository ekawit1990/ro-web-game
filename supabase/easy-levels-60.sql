-- Music Land: Lv 1-60 level up with 50% less EXP. Run once in Supabase SQL Editor (safe to run again).
-- (Monster HP is not in the database: it ships with the server on Render.)
create or replace function public.exp_to_next(lvl int) returns int
language sql immutable as $$
  select case when lvl <= 60 then ((floor(15 * power(lvl::float8, 1.9))::int + 10) * public.exp_hard(lvl)) / 2
    else (floor(15 * power(lvl::float8, 1.9))::int + 10) * public.exp_hard(lvl) end
$$;
