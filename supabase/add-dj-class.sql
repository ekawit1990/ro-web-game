-- Music Land 2026-11-15: the DJ class (ดีเจ) + the keyboardist's ทำนองผ่อนคลาย.
-- Paste into Supabase > SQL Editor and press Run (safe to run again). Same as running the whole setup.sql.

-- DJ weapons (DJ controllers): the start weapon and the shop one, and the boss drops
insert into public.item_defs (id, type, price, classes, in_shop, weight, slots, card_slot, gender, shop_kind) values ('mini_dj', 'weapon', 60, array['dj'], true, 60, 1, null, null, 'weapons') on conflict (id) do update set type = excluded.type, price = excluded.price, classes = excluded.classes, in_shop = excluded.in_shop, weight = excluded.weight, slots = excluded.slots, card_slot = excluded.card_slot, gender = excluded.gender, shop_kind = excluded.shop_kind;
insert into public.item_defs (id, type, price, classes, in_shop, weight, slots, card_slot, gender, shop_kind) values ('dj_controller', 'weapon', 750, array['dj'], true, 60, 2, null, null, 'weapons') on conflict (id) do update set type = excluded.type, price = excluded.price, classes = excluded.classes, in_shop = excluded.in_shop, weight = excluded.weight, slots = excluded.slots, card_slot = excluded.card_slot, gender = excluded.gender, shop_kind = excluded.shop_kind;
insert into public.item_defs (id, type, price, classes, in_shop, weight, slots, card_slot, gender, shop_kind) values ('dj_neon', 'weapon', 4000, array['dj'], false, 70, 1, null, null, null) on conflict (id) do update set type = excluded.type, price = excluded.price, classes = excluded.classes, in_shop = excluded.in_shop, weight = excluded.weight, slots = excluded.slots, card_slot = excluded.card_slot, gender = excluded.gender, shop_kind = excluded.shop_kind;
insert into public.item_defs (id, type, price, classes, in_shop, weight, slots, card_slot, gender, shop_kind) values ('dj_grand', 'weapon', 4000, array['dj'], false, 70, 1, null, null, null) on conflict (id) do update set type = excluded.type, price = excluded.price, classes = excluded.classes, in_shop = excluded.in_shop, weight = excluded.weight, slots = excluded.slots, card_slot = excluded.card_slot, gender = excluded.gender, shop_kind = excluded.shop_kind;

-- the class itself (start stats, start weapon)
insert into public.class_defs (id, base_stats, start_weapon) values ('dj', '{"str":1,"agi":4,"vit":3,"int":10,"dex":7,"luk":3}', 'mini_dj') on conflict (id) do update set base_stats = excluded.base_stats, start_weapon = excluded.start_weapon;

-- its 8 skills and the keyboardist's new one
insert into public.skill_defs (id, cls, max_level) values ('calm_melody', 'keyboardist', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_edm', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_cha3', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_joja', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_chill', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_love_song', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_parade', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_serenade', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;
insert into public.skill_defs (id, cls, max_level) values ('dj_booth', 'dj', 10) on conflict (id) do update set cls = excluded.cls, max_level = excluded.max_level;

-- bosses that now also drop DJ controllers
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('king_jelly', 20, 263, 197, 400, 900, '[["golden_clef",1],["golden_mic",0.15],["electric_guitar",0.15],["synth",0.15],["five_string_bass",0.15],["steel_sticks",0.15],["rock_boots",0.05],["crystal_earring",0.05],["cat_headphones",0.05],["card_king_jelly",0.05],["outfit_night_general",0.06],["outfit_bunny_lolita",0.06],["tuning_ore",0.05],["velvet_patch",0.05],["gtr_offset_mini",0.08],["stk_pink",0.08],["bss_mikro",0.08],["hat_jelly_crown",0.05],["mic_inst",0.08],["dj_controller",0.15]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('elder_tree', 24, 750, 562, 480, 1200, '[["ancient_bark",1],["headphones",0.2],["electric_guitar",0.12],["synth",0.12],["rock_boots",0.05],["crystal_earring",0.05],["cat_headphones",0.05],["card_elder_tree",0.05],["outfit_crimson_prince",0.06],["outfit_forest_elf",0.06],["tuning_ore",0.05],["velvet_patch",0.05],["gtr_ttype",0.08],["stk_green",0.08],["hat_ancient_laurel",0.05],["mic_inst",0.08],["dj_controller",0.12]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('metal_lord', 40, 2083, 1563, 800, 2000, '[["metal_soul",1],["golden_mic",0.3],["electric_guitar",0.3],["synth",0.3],["five_string_bass",0.3],["steel_sticks",0.3],["rock_boots",0.05],["crystal_earring",0.05],["cat_headphones",0.05],["card_metal_lord",0.05],["outfit_vampire_count",0.06],["outfit_halloween_vampire",0.06],["pure_tuning_ore",0.05],["gold_velvet",0.05],["gtr_stype",0.08],["kbd_red",0.08],["hat_metal_helm",0.05],["mic_silverband",0.08],["dj_controller",0.3]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('kraken', 45, 2764, 2073, 1125, 2700, '[["kraken_tentacle",1],["kraken_bass",0.25],["frost_powder",0.5],["outfit_beach_lace",0.06],["outfit_leopard_swim",0.06],["honey_lemon",0.5],["crystal_earring",0.05],["card_kraken",0.05],["pure_tuning_ore",0.05],["gold_velvet",0.05],["gtr_flametop",0.08],["kbd_white",0.08],["hat_kraken_tricorn",0.05],["mic_stick",0.08],["dj_neon",0.08]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('crystal_king', 58, 4591, 3443, 1450, 3480, '[["echo_crown",1],["crystal_dagger",0.3],["rock_sand",0.5],["outfit_frost_princess",0.06],["outfit_cyber_mint",0.06],["honey_lemon",0.5],["crystal_earring",0.05],["card_crystal_king",0.05],["pure_tuning_ore",0.05],["gold_velvet",0.05],["gtr_arrow",0.08],["kbd_slim",0.08],["bss_jazz5",0.08],["hat_crystal_crown",0.05],["mic_ball",0.08],["dj_neon",0.08]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('phantom_king', 82, 9177, 6883, 2050, 4920, '[["phantom_crown",1],["cathedral_organ",0.25],["thunder_sticks",0.25],["outfit_night_general",0.06],["outfit_crimson_prince",0.06],["honey_lemon",0.5],["crystal_earring",0.05],["card_phantom_king",0.05],["pure_tuning_ore",0.05],["gold_velvet",0.05],["gtr_singlecut",0.08],["stk_black",0.08],["kbd_stage",0.08],["hat_phantom_top",0.05],["mic_vintage",0.08],["dj_grand",0.08]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('inferno_lord', 99, 13379, 10035, 2475, 5940, '[["volcano_heart",1],["inferno_guitar",0.25],["magma_plate",0.2],["outfit_red_evening",0.06],["outfit_shadow_battle",0.06],["honey_lemon",0.5],["crystal_earring",0.05],["card_inferno_lord",0.05],["pure_tuning_ore",0.05],["gold_velvet",0.05],["gtr_vshape",0.08],["gtr_spike",0.08],["bss_sire5",0.08],["hat_inferno_chada",0.05],["mic_vintage",0.08],["dj_grand",0.08]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;
insert into public.monster_defs (id, level, exp, job_exp, zeny_min, zeny_max, drops) values ('abyss_reaper', 100, 40000, 30000, 8000, 20000, '[["blood_scythe_shard",1],["soul_chain_link",1],["card_abyss_reaper",0.03],["hat_reaper_hood",0.04],["pure_tuning_ore",0.3],["gold_velvet",0.3],["gtr_spike",0.1],["bss_sire5",0.1],["outfit_shadow_battle",0.08],["crystal_earring",0.1],["mic_vintage",0.1],["dj_grand",0.1]]') on conflict (id) do update set level = excluded.level, exp = excluded.exp, job_exp = excluded.job_exp, zeny_min = excluded.zeny_min, zeny_max = excluded.zeny_max, drops = excluded.drops;

-- the job change accepts the DJ (in the city of magic, like the keyboardist)
create or replace function public.change_job(p_char uuid, p_cls text) returns public.characters
language plpgsql security definer set search_path = public as $$
declare c public.characters; d public.class_defs; v_town text;
begin
  c := public._own_char(p_char);
  if c.cls <> 'teen' then raise exception 'เปลี่ยนอาชีพไปแล้ว'; end if;
  if p_cls not in ('singer', 'guitarist', 'drummer', 'bassist', 'keyboardist', 'dj') then raise exception 'ไม่มีอาชีพนี้'; end if;
  if c.level < 10 or c.job_quest < 30 then raise exception 'ยังทำเควสไม่สำเร็จ'; end if;
  -- each class is handed out in its own town (JOB_TOWN in src/data/index.ts): drummers in the desert,
  -- keyboardists and DJs in the city of magic, everyone else in the first town
  -- (the town goes into a variable first: inside IF ... THEN, plpgsql would stop at the CASE's own THEN)
  v_town := case p_cls when 'drummer' then 'desert' when 'keyboardist' then 'magic' when 'dj' then 'magic' else 'town' end;
  if c.map <> v_town then
    raise exception 'ต้องเปลี่ยนอาชีพนี้ที่%', case v_town when 'desert' then 'เมืองทะเลทรายตะโพน' when 'magic' then 'เมืองคีย์มนตรา' else 'เมืองเมโลเดีย' end;
  end if;
  select * into d from public.class_defs where id = p_cls;
  update public.inventory inv set equipped = false
    from public.item_defs i
    where inv.character_id = p_char and inv.equipped and i.id = inv.item_id and i.type = 'weapon';
  insert into public.inventory (character_id, item_id, qty, equipped) values (p_char, d.start_weapon, 1, true);
  -- a fresh start for the new class: every stat back to 1 with its points refunded, and the Teen skills
  -- are dropped with their skill points refunded (only the new class's skills can be learned)
  update public.characters set cls = p_cls, job_level = 1, job_exp = 0, job_quest = -1,
    stat_points = stat_points + public._stat_refund(str) + public._stat_refund(agi) + public._stat_refund(vit)
      + public._stat_refund("int") + public._stat_refund(dex) + public._stat_refund(luk),
    str = 1, agi = 1, vit = 1, "int" = 1, dex = 1, luk = 1,
    skill_points = skill_points + (select coalesce(sum(greatest(0, e.value::int)), 0) from jsonb_each_text(skills) e
      where e.key in (select id from public.skill_defs where cls = 'teen')),
    skills = (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(skills) e
      where e.key not in (select id from public.skill_defs where cls = 'teen'))
    where id = p_char returning * into c;
  return c;
end $$;
