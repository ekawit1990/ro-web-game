-- Music Land: buying from the bot shops in town (game server only). Paste into Supabase > SQL Editor and press Run. Safe to run again.
-- The bots sell ป้ามะลิ's list (item_defs.shop_kind = 'shop') at 90% of the shop price (botShopPrice in server/src/bots.ts).
create or replace function public.bot_shop_buy(p_user uuid, p_char uuid, p_item text, p_qty int) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters; v_price int;
begin
  c := public._own_char(p_char, p_user);
  select greatest(1, (i.price * 9) / 10) into v_price from public.item_defs i where i.id = p_item and i.shop_kind = 'shop';
  if v_price is null or p_qty < 1 or p_qty > 999 then raise exception 'ซื้อไม่ได้'; end if;
  if c.zeny < v_price * p_qty then raise exception 'เงินไม่พอ'; end if;
  update public.characters set zeny = zeny - v_price * p_qty where id = p_char returning * into c;
  perform public._add_item(p_char, p_item, p_qty);
  return c;
end $$;
revoke execute on function public.bot_shop_buy(uuid, uuid, text, int) from public, anon, authenticated;
grant execute on function public.bot_shop_buy(uuid, uuid, text, int) to service_role;
