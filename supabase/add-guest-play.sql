-- "เริ่มเล่นทันที" (play now without signing up), 2026-11-23.
-- Guest accounts are ordinary Supabase users made by the game server (/auth/guest) with
-- user_metadata.guest = true. At Base Lv 10 the game asks them to bind a username +
-- password + phone (/auth/link); the user id stays the same, so characters and items stay.
--
-- This file only adds the clean-up that keeps abandoned guests from piling up. The game
-- server calls it every 6 hours with the service role. Safe to run more than once.
--   * a guest who never made a character, 2 days after the account was made
--   * a guest whose best character is below Lv 10 and who hasn't signed in for 30 days
-- Guests at Lv 10+ are never removed automatically, and bound accounts are never touched.

create or replace function public.cleanup_guest_accounts()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select u.id
    from auth.users u
    where u.raw_user_meta_data ->> 'guest' = 'true'
      and not exists (select 1 from public.accounts a where a.user_id = u.id)
      and (
        (u.created_at < now() - interval '2 days'
          and not exists (select 1 from public.characters c where c.user_id = u.id))
        or (coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
          and coalesce((select max(c.level) from public.characters c where c.user_id = u.id), 0) < 10)
      )
    limit 500
  loop
    begin
      delete from auth.users where id = r.id; -- characters, inventory, ... go with it (on delete cascade)
      n := n + 1;
    exception when others then
      raise notice 'cleanup_guest_accounts: skipped % (%)', r.id, sqlerrm;
    end;
  end loop;
  return n;
end;
$$;

revoke all on function public.cleanup_guest_accounts() from public, anon, authenticated;
grant execute on function public.cleanup_guest_accounts() to service_role;
