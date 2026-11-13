"""Adds the 50 music hats (2026-11-10) to gamedata.json and the monster drop tables.
Each hat: own 3D look (ItemDef.hat -> src/three/hats.ts), stats by the dropping monster's level, card slots
(1 from normal monsters, 2 from MVP bosses), drop only (not in any shop). Idempotent: re-running replaces them."""
import json, sys
path = sys.argv[1]
d = json.load(open(path, encoding='utf8'))
M = d['monsters']

# id, name, kind, colours, variant, monster, stats to raise (first gets most), description
H = [
  ('hat_note_cap', 'หมวกแก๊ปโน้ตแดง', 'cap', ['#e53935', '#fafafa', '#ffd600'], '', 'jelly', ['dex', 'luk'], 'หมวกแก๊ปสีแดงปักตัวโน้ตสีทอง ของคนเพิ่งเริ่มเล่นดนตรี'),
  ('hat_mint_beanie', 'บีนนี่มินต์ป๊อป', 'beanie', ['#7fd8be', '#4db6ac', '#ffffff'], '', 'drop', ['agi', 'luk'], 'หมวกไหมพรมสีมินต์มีปอมปอม ใส่แล้วอารมณ์ดีเหมือนเพลงป๊อป'),
  ('hat_cat_band', 'คาดผมหูแมวฮัมเพลง', 'ears', ['#ff9f43', '#ffe0c2', '#6d4c41'], 'cat', 'cat', ['agi', 'dex'], 'คาดผมหูแมวสีส้ม ได้ยินเสียงฮัมเพลงไกลขึ้น'),
  ('hat_chick', 'ลูกเจี๊ยบนักร้องบนหัว', 'critter', ['#ffe066', '#ff9800', '#ff7043'], 'chick', 'chick', ['luk', 'int'], 'ลูกเจี๊ยบตัวน้อยนั่งร้องเพลงอยู่บนหัว ไม่ยอมลงง่าย ๆ'),
  ('hat_beat_bandana', 'ผ้าโพกหัวบีทบ็อกซ์', 'bandana', ['#1e88e5', '#ffffff'], '', 'dog', ['str', 'agi'], 'ผ้าโพกหัวลายจุดของนักบีทบ็อกซ์ข้างถนน'),
  ('hat_mushroom', 'หมวกเห็ดเงียบ', 'mushroom', ['#c62828', '#fff8e1', '#ffd54f'], '', 'mushy', ['vit', 'int'], 'หมวกทรงดอกเห็ดแดงจุดขาว ใส่แล้วเสียงรอบตัวเบาลง'),
  ('hat_bunny_band', 'คาดผมหูกระต่ายจังหวะ', 'ears', ['#fafafa', '#f8bbd0', '#ec407a'], 'bunny', 'rabbit', ['agi', 'luk'], 'คาดผมหูกระต่ายยาว กระดิกตามจังหวะเพลง'),
  ('hat_spring_notes', 'คาดผมสปริงตัวโน้ต', 'antenna', ['#7e57c2', '#ff4081', '#40c4ff'], '', 'pigeon', ['dex', 'luk'], 'คาดผมมีสปริงสองเส้น ปลายเป็นตัวโน้ตเด้งดึ๋งทุกก้าว'),
  ('hat_bee_beanie', 'บีนนี่ลายผึ้งหึ่ง', 'beanie', ['#ffca28', '#212121', '#212121'], 'stripes', 'buzzer', ['agi', 'dex'], 'หมวกไหมพรมลายเหลืองดำ ได้ยินเสียงหึ่งเบา ๆ ตลอดเวลา'),
  ('hat_frog', 'หมวกกบเบส', 'critter', ['#66bb6a', '#1b5e20', '#26c6da'], 'frog', 'frog', ['vit', 'luk'], 'กบเบสตัวกลมนั่งบนหัว ร้องอ๊บด้วยเสียงทุ้มต่ำ'),
  ('hat_bat_wings', 'ปีกค้างคาวโซนิค', 'wings', ['#4a3b5c', '#212121'], '', 'bat', ['agi', 'int'], 'ปีกค้างคาวคู่เล็กติดคาดผม รับคลื่นเสียงสะท้อนได้ไว'),
  ('hat_owl_beret', 'เบเรต์นกฮูกเบสทุ้ม', 'beret', ['#3949ab', '#ffd54f'], '', 'owl', ['int', 'dex'], 'เบเรต์สีน้ำเงินกลัดเข็มตัวโน้ต สไตล์นักดนตรีแจ๊สยามดึก'),
  ('hat_flower_chorus', 'มงกุฎดอกไม้คอรัส', 'flowers', ['#f48fb1', '#fff59d', '#ffffff'], '', 'mossy', ['int', 'vit'], 'มงกุฎดอกไม้สีหวาน ร้องประสานเสียงได้กลมกล่อมขึ้น'),
  ('hat_wizard_note', 'หมวกพ่อมดโน้ตม่วง', 'witch', ['#5e35b1', '#ffd54f', '#ffeb3b'], '', 'wizard', ['int', 'dex'], 'หมวกปลายแหลมสีม่วงประดับดาวและตัวโน้ต ร่ายเพลงเวทย์คล่องขึ้น'),
  ('hat_metronome_top', 'หมวกทรงสูงเมโทรนอม', 'tophat', ['#263238', '#c62828', '#8d6e63'], 'metronome', 'metronome', ['dex', 'agi'], 'หมวกทรงสูงติดเมโทรนอมจิ๋ว ตีจังหวะได้แม่นยำ'),
  ('hat_tuba_bell', 'หมวกปากแตรทูบา', 'horn', ['#e0b040', '#8d6e1f', '#cfd8dc'], '', 'tuba_toad', ['vit', 'str'], 'ปากแตรทูบาทองเหลืองใส่เป็นหมวก ดังทุกครั้งที่ลมพัด'),
  ('hat_ninja_band', 'ผ้าคาดหัวนินจาเงา', 'bandana', ['#263238', '#b0bec5', '#ff5252'], 'plate', 'ninja', ['agi', 'str'], 'ผ้าคาดหัวนินจามีแผ่นเหล็กสลักโน้ต ก้าวเท้าเงียบไม่มีเสียง'),
  ('hat_jazz_fedora', 'เฟดอร่าแจ๊ส', 'fedora', ['#5d4037', '#212121', '#ff7043'], '', 'squidle', ['dex', 'luk'], 'หมวกเฟดอร่าของนักแซกโซโฟนแจ๊ส เสียบขนนกสีส้ม'),
  ('hat_alien_goggles', 'แว่นกันลมเอเลี่ยน', 'goggles', ['#5d4037', '#76ff03', '#37474f'], '', 'alien', ['dex', 'int'], 'แว่นกันลมเลนส์เขียวเรืองแสง มองเห็นคลื่นเสียงเป็นสี'),
  ('hat_viking_drum', 'หมวกไวกิ้งกลองศึก', 'viking', ['#9e9e9e', '#795548', '#fff3e0'], '', 'orc', ['str', 'vit'], 'หมวกเหล็กมีเขาโค้ง ของนักตีกลองศึกในบึง'),
  ('hat_mariachi', 'ซอมเบรโรมาเรียชี', 'cowboy', ['#e8c070', '#c62828', '#43a047'], 'sombrero', 'drum_golem', ['vit', 'luk'], 'หมวกปีกกว้างสุด ๆ ของวงมาเรียชี กันแดดทะเลทรายได้ทั้งวง'),
  ('hat_cowboy_solo', 'หมวกคาวบอยโซโล', 'cowboy', ['#8d6e63', '#3e2723', '#ffd54f'], '', 'howler', ['str', 'dex'], 'หมวกคาวบอยปีกงอน ใส่แล้วอยากเล่นโซโลกีตาร์กลางทุ่ง'),
  ('hat_ngob', 'งอบนักร้องลูกทุ่ง', 'ngob', ['#d7b36a', '#8d6e3c'], '', 'alpaking', ['vit', 'agi'], 'งอบสานไม้ไผ่ของนักร้องลูกทุ่ง กันแดดเวลาร้องเพลงกลางทุ่ง'),
  ('hat_party_cone', 'หมวกปาร์ตี้ตัวโน้ต', 'party', ['#ab47bc', '#ffeb3b', '#00e5ff'], '', 'sand_drop', ['luk', 'agi'], 'หมวกกรวยปาร์ตี้ลายทาง ใส่ไปงานคอนเสิร์ตวันเกิด'),
  ('hat_tribal_plume', 'มงกุฎขนนกกลองเผ่า', 'flowers', ['#e65100', '#ffb300', '#4e342e'], 'laurel', 'tribal', ['str', 'vit'], 'มงกุฎใบไม้และขนนกของนักรบตีกลองเผ่า'),
  ('hat_yeti_beanie', 'บีนนี่ขนเยติ', 'beanie', ['#eceff1', '#90a4ae', '#ffffff'], '', 'penguin', ['vit', 'int'], 'หมวกไหมพรมขนฟูสีขาว อุ่นจนร้องเพลงได้กลางพายุหิมะ'),
  ('hat_samurai', 'หมวกเกราะซามูไรคอร์ด', 'viking', ['#37474f', '#b71c1c', '#ffd54f'], 'samurai', 'big_ninja', ['str', 'dex'], 'หมวกเกราะซามูไรประดับพระจันทร์เสี้ยวสีทอง'),
  ('hat_ice_tiara', 'ทีอาร่าน้ำแข็งเสียงสูง', 'tiara', ['#b3e5fc', '#4fc3f7', '#ffffff'], '', 'ice_jelly', ['int', 'dex'], 'ทีอาร่าน้ำแข็งใส ส่งเสียงกังวานเวลาร้องโน้ตสูง'),
  ('hat_santa_bell', 'หมวกซานต้าระฆังเงิน', 'santa', ['#d32f2f', '#ffffff', '#ffd54f'], '', 'yeti', ['luk', 'vit'], 'หมวกแดงขอบขาวห้อยกระดิ่ง ร้องเพลงคริสต์มาสได้ทั้งปี'),
  ('hat_flame_crown', 'มงกุฎเปลวเมทัล', 'flamecrown', ['#ff5722', '#ffca28', '#3e2723'], '', 'fire_bat', ['str', 'dex'], 'มงกุฎเปลวไฟลุกโชน ร้อนแรงเหมือนริฟฟ์เมทัล'),
  ('hat_pumpkin', 'หมวกฟักทองร็อก', 'pumpkin', ['#ff8f00', '#33691e', '#ffeb3b'], '', 'ghost_skull', ['luk', 'int'], 'ฟักทองแกะสลักหน้ายิ้ม ส่องแสงในคอนเสิร์ตกลางคืน'),
  ('hat_devil_horns', 'เขาปีศาจเมทัล', 'horns', ['#b71c1c', '#212121'], '', 'demon', ['str', 'luk'], 'คาดผมเขาปีศาจคู่ ชูมือเมทัลแล้วยิ่งดูโหด'),
  ('hat_punk_spikes', 'คาดผมหนามพังก์', 'mohawk', ['#212121', '#e91e63', '#cfd8dc'], '', 'orc_skull', ['str', 'agi'], 'คาดผมหนามตั้งเป็นแนวโมฮอว์ก ของวงพังก์ใต้ดิน'),
  ('hat_synth_cloud', 'เมฆโน้ตลอยฟ้า', 'cloud', ['#ffffff', '#7c4dff', '#00b0ff'], '', 'sea_jelly', ['int', 'luk'], 'ก้อนเมฆน้อยลอยเหนือหัว โปรยตัวโน้ตลงมาแทนฝน'),
  ('hat_captain', 'หมวกกัปตันวงดุริยางค์', 'captain', ['#fafafa', '#1a237e', '#ffd54f'], '', 'conch_fish', ['dex', 'vit'], 'หมวกกัปตันสีขาวติดตราโน้ตทอง นำวงดุริยางค์เรือ'),
  ('hat_gull_tricorn', 'หมวกสามมุมนางนวล', 'tricorn', ['#3e2723', '#ffd54f', '#ffffff'], '', 'gull', ['agi', 'dex'], 'หมวกสามมุมของนักร้องเพลงกะลาสี'),
  ('hat_reggae_beanie', 'บีนนี่เร็กเก้', 'beanie', ['#2e7d32', '#ffeb3b', '#e53935'], 'rasta', 'surf_frog', ['luk', 'vit'], 'หมวกไหมพรมแถบเขียวเหลืองแดง ฟังเร็กเก้แล้วชิลล์'),
  ('hat_dj_goggles', 'แว่นดีเจพายุ', 'goggles', ['#212121', '#e040fb', '#455a64'], 'dj', 'storm_squid', ['dex', 'agi'], 'แว่นดีเจเลนส์ชมพูนีออน คุมเพลงกลางพายุได้ไม่สะดุด'),
  ('hat_speaker', 'หมวกลำโพงเบสหนัก', 'speaker', ['#263238', '#546e7a', '#90a4ae'], '', 'coral_golem', ['vit', 'str'], 'ลำโพงตู้เล็กวางบนหัว เบสแน่นจนพื้นสะเทือน'),
  ('hat_crystal_band', 'มงกุฎคริสตัลค้างคาว', 'crown', ['#7e57c2', '#b388ff', '#e1bee7'], 'crystal', 'crystal_bat', ['int', 'agi'], 'มงกุฎแท่งคริสตัลสีม่วงที่สะท้อนเสียงก้องถ้ำ'),
  ('hat_echo_halo', 'วงแหวนเสียงสะท้อน', 'halo', ['#b2ff59', '#69f0ae'], 'echo', 'echo_slime', ['int', 'luk'], 'วงแหวนเรืองแสงลอยเหนือหัว แผ่คลื่นเสียงออกเป็นวง'),
  ('hat_gem_turban', 'ผ้าโพกอัญมณีเบส', 'turban', ['#00897b', '#ffd54f', '#e53935'], '', 'gem_golem', ['vit', 'int'], 'ผ้าโพกหัวพันหลายชั้นประดับทับทิม ของนักเบสพเนจร'),
  ('hat_snare', 'หมวกกลองแสนร์', 'drum', ['#c62828', '#fafafa', '#e3c18f'], '', 'cave_orc', ['str', 'agi'], 'กลองแสนร์ใบจิ๋วบนหัวพร้อมไม้กลองไขว้ ตีได้จริง!'),
  ('hat_jester', 'หมวกตัวตลกกระดิ่ง', 'jester', ['#8e24aa', '#ffb300', '#ffeb3b'], '', 'glow_mush', ['luk', 'agi'], 'หมวกตัวตลกสองแฉกห้อยกระดิ่ง ดังกรุ๊งกริ๊งทุกครั้งที่ขยับ'),
  ('hat_vinyl', 'หมวกแผ่นเสียงหลงทาง', 'vinyl', ['#141414', '#ff7043'], '', 'wisp', ['dex', 'int'], 'แผ่นเสียงไวนิลเก่าใส่เป็นหมวก ยังเล่นเพลงได้อยู่'),
  ('hat_rap_cap', 'แก๊ปแร็พกลับหลัง', 'cap', ['#212121', '#ffd54f', '#ffd54f'], 'back', 'crow_skull', ['agi', 'str'], 'แก๊ปสีดำใส่กลับหลังประดับดาวทอง ฟลูว์แร็พลื่นไหล'),
  ('hat_bog_witch', 'หมวกแม่มดเพลงศพ', 'witch', ['#2e4d2c', '#6d4c41', '#c6ff00'], '', 'bog_witch', ['int', 'luk'], 'หมวกแม่มดสีเขียวหม่น ร้องเพลงศพในหนองน้ำ'),
  ('hat_opera_beret', 'เบเรต์กำมะหยี่โอเปร่า', 'beret', ['#880e4f', '#ffd54f'], '', 'opera_phantom', ['int', 'dex'], 'เบเรต์กำมะหยี่แดงเลือดนก ของนักร้องโอเปร่าวิญญาณ'),
  ('hat_knight_helm', 'หมวกอัศวินไร้ร่าง', 'viking', ['#90a4ae', '#455a64', '#1565c0'], 'knight', 'hollow_knight', ['vit', 'str'], 'หมวกเกราะอัศวินประดับพู่ขนนก ไม่มีใครรู้ว่าเจ้าของเดิมเป็นใคร'),
  ('hat_bell_fez', 'หมวกเฟซระฆังทอง', 'fez', ['#b71c1c', '#ffd54f'], '', 'bell_gargoyle', ['vit', 'luk'], 'หมวกเฟซสีแดงห้อยระฆังทองเล็ก ๆ ดังทุกชั่วโมง'),
  ('hat_shako', 'หมวกวงโยธวาทิต', 'shako', ['#1a237e', '#ffd54f', '#ffffff'], '', 'skull_bandsman', ['str', 'dex'], 'หมวกทรงสูงประดับพู่ขนนกของวงโยธวาทิต เดินแถวตามจังหวะกลองเดินแถว'),
  ('hat_hymn_board', 'หมวกบัณฑิตเพลงสวด', 'mortarboard', ['#212121', '#ffd54f'], '', 'dark_bishop', ['int', 'dex'], 'หมวกบัณฑิตสีดำพู่ทอง จบปริญญาดนตรีสวดเพลงมืด'),
  ('hat_angel_halo', 'รัศมีเทวดาระฆัง', 'halo', ['#ffd54f', '#ffffff'], 'wings', 'bell_angel', ['int', 'luk'], 'รัศมีทองพร้อมปีกเล็กข้างหัว ร้องเพลงสวรรค์ได้ไพเราะ'),
  ('hat_hell_horns', 'เขาหมาเพลิงแบล็กเมทัล', 'horns', ['#ff3d00', '#3e2723'], 'big', 'hell_hound', ['str', 'agi'], 'เขาโค้งใหญ่สีเพลิงของวงแบล็กเมทัลจากนรก'),
  # MVP bosses: 2 card slots, more stats, a little PVP defence
  ('hat_jelly_crown', 'มงกุฎทองราชาเพี้ยน', 'crown', ['#ffc107', '#e53935', '#2196f3'], '', 'king_jelly', ['luk', 'vit'], 'มงกุฎทองของราชาเห็ด ร้องเพี้ยนแค่ไหนก็ยังเป็นราชา'),
  ('hat_ancient_laurel', 'มงกุฎใบไม้โบราณ', 'flowers', ['#558b2f', '#9ccc65', '#ffeb3b'], 'laurel', 'elder_tree', ['vit', 'int'], 'มงกุฎใบไม้จากต้นไม้พันปี ได้ยินเสียงป่าร้องเพลง'),
  ('hat_marsh_tiara', 'ทีอาร่ามุกบึง', 'tiara', ['#b0bec5', '#26c6da', '#fff8e1'], '', 'marsh_queen', ['int', 'agi'], 'ทีอาร่าเงินประดับไข่มุกจากก้นบึง'),
  ('hat_dragon_horns', 'เขามังกรร็อกแอนด์โรล', 'horns', ['#ffb300', '#4e342e'], 'big', 'rock_dragon', ['str', 'vit'], 'เขามังกรสีทองคู่ใหญ่ ร็อกแอนด์โรลไม่มีวันตาย'),
  ('hat_snow_crown', 'มงกุฎเกล็ดหิมะโซปราโน', 'crown', ['#e3f2fd', '#81d4fa', '#ffffff'], 'crystal', 'snow_queen', ['int', 'dex'], 'มงกุฎน้ำแข็งของราชินีหิมะ เสียงโซปราโนทะลุฟ้า'),
  ('hat_metal_helm', 'หมวกเกราะหนามเมทัล', 'mohawk', ['#424242', '#e0e0e0', '#b71c1c'], 'helm', 'metal_lord', ['str', 'vit'], 'หมวกเกราะเหล็กหนามแหลมของจอมมารเมทัล'),
  ('hat_kraken_tricorn', 'หมวกสามมุมราชันย์ทะเล', 'tricorn', ['#0d47a1', '#ffd54f', '#4dd0e1'], '', 'kraken', ['dex', 'str'], 'หมวกสามมุมสีน้ำเงินขลิบทองของราชันย์แห่งท้องทะเล'),
  ('hat_crystal_crown', 'มงกุฎคริสตัลเสียงก้อง', 'crown', ['#ce93d8', '#ea80fc', '#80deea'], 'crystal', 'crystal_king', ['int', 'vit'], 'มงกุฎคริสตัลแท้ ทุกเสียงที่ร้องจะก้องกังวานสามเท่า'),
  ('hat_banshee_halo', 'รัศมีวิญญาณบันชี', 'halo', ['#b388ff', '#4a148c'], 'wings', 'banshee_queen', ['int', 'agi'], 'รัศมีม่วงพร้อมปีกวิญญาณ ได้ยินเสียงกรีดร้องจากอีกภพ'),
  ('hat_phantom_top', 'หมวกทรงสูงราชาโอเปร่า', 'tophat', ['#1a1a1a', '#ffd54f', '#fafafa'], 'mask', 'phantom_king', ['dex', 'int'], 'หมวกทรงสูงขลิบทองกับหน้ากากครึ่งหน้า ของราชาไร้บัลลังก์'),
  ('hat_inferno_chada', 'ชฎาเพลิงจักรพรรดิ', 'chada', ['#ffc107', '#ff7043', '#d50000'], 'flame', 'inferno_lord', ['str', 'int'], 'ชฎาทองยอดเปลวไฟ ของจักรพรรดิแห่งภูเขาไฟ หมวกที่หายากที่สุดในโลก'),
]
assert len(H) == len({h[0] for h in H}), 'duplicate id'
STAT_POINTS = lambda lv: 1 + lv // 12
ids = {h[0] for h in H}
for m in M.values():
    m['drops'] = [x for x in m['drops'] if x[0] not in ids]
for hid, name, kind, cols, var, mon, stats, desc in H:
    m = M[mon]
    lv, boss = m['level'], bool(m.get('boss'))
    pts = STAT_POINTS(lv) + (3 if boss else 0)
    bonus = {stats[0]: (pts + 1) // 2, stats[1]: pts // 2}
    bonus = {k: v for k, v in bonus.items() if v > 0}
    if lv >= 45: bonus['maxHp' if stats[0] in ('str', 'vit', 'agi') else 'maxSp'] = lv * (3 if stats[0] in ('str', 'vit', 'agi') else 1)
    if boss: bonus['pvpDefPct'] = 3 if lv < 40 else 5
    look = {'kind': kind, 'c': cols}
    if var: look['v'] = var
    it = {'name': name, 'type': 'head', 'def': 1 + lv // 10 + (2 if boss else 0), 'price': 200 + lv * 30 + (2000 if boss else 0),
          'color': cols[0], 'weight': 20 if kind not in ('speaker', 'viking', 'drum', 'horn', 'mohawk') else 40,
          'slots': 2 if boss else 1, 'bonus': bonus, 'hat': look,
          'desc': desc + f' (ดรอปจาก{"บอส MVP " if boss else ""}{m["name"]} Lv {lv}, ไม่มีขายในร้าน)'}
    if boss: it['mvp'] = True
    d['items'][hid] = it
    rate = 0.05 if boss else (0.01 if lv < 30 else 0.007 if lv < 60 else 0.005)
    m['drops'].append([hid, rate])
json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok', len(H))
