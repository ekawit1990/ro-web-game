"""
One-off data pass (2026-11-05): run from the repo root on the gamedata.json from before this change
(git show a212b3f:src/data/gamedata.json > /tmp/old.json; python3 tools/world_expand_2026_11.py /tmp/old.json).

- elements on every monster (and a few skills, the new weapons, converters, armour cards)
- wild maps 1.5x bigger: spawn areas scaled, 1.5x as many monsters
- 5 new maps' monsters (Lv 30-99) + the lava crablet on the volcano, their cards and loot
- refine materials: no longer sold; 5% drop from Lv 10-30 (+1..+4), new high materials 5% from Lv 40-99 (+5..+10)
- every monster +50% HP, -30% Base/Job EXP (applied last, to the new monsters too)
"""
import json
import sys

src = sys.argv[1] if len(sys.argv) > 1 else 'src/data/gamedata.json'
d = json.load(open(src, encoding='utf-8'))
M, I, S, SK = d['monsters'], d['items'], d['spawns'], d['skills']

# ------------------------------------------------------------ elements of the old monsters
OLD_EL = {
    'jelly': ('water', 1), 'drop': ('water', 1), 'cat': ('neutral', 1), 'chick': ('wind', 1), 'dog': ('neutral', 1),
    'mushy': ('earth', 1), 'rabbit': ('neutral', 1), 'pigeon': ('wind', 1), 'buzzer': ('wind', 1), 'frog': ('water', 1),
    'king_jelly': ('water', 2),
    'bat': ('shadow', 1), 'owl': ('wind', 1), 'dove': ('wind', 1), 'rocky': ('earth', 1), 'monkroose': ('earth', 1),
    'mossy': ('earth', 1), 'wizard': ('shadow', 1), 'ninja': ('shadow', 1), 'elder_tree': ('earth', 2),
    'tuba_toad': ('water', 1), 'metronome': ('neutral', 1), 'squidle': ('water', 1), 'alien': ('poison', 1),
    'mosquito': ('poison', 1), 'orc': ('earth', 1), 'glub_evo': ('water', 2), 'marsh_queen': ('water', 3),
    'drum_golem': ('earth', 2), 'howler': ('wind', 1), 'alpaking': ('wind', 1), 'sand_drop': ('earth', 1),
    'goleling': ('earth', 2), 'tribal': ('neutral', 2), 'big_ninja': ('shadow', 1), 'rock_dragon': ('fire', 2),
    'penguin': ('water', 1), 'ice_jelly': ('water', 2), 'hywirl': ('ghost', 1), 'bluedemon': ('water', 2),
    'yeti': ('water', 1), 'alpaking_evo': ('wind', 2), 'snow_queen': ('water', 3),
    'fire_bat': ('fire', 1), 'ghost_skull': ('undead', 1), 'magma_golem': ('fire', 2), 'demon': ('shadow', 2),
    'flame_metronome': ('fire', 2), 'orc_skull': ('undead', 1), 'metal_lord': ('shadow', 3),
}
for k, (el, lv) in OLD_EL.items():
    M[k]['element'] = [el, lv]

# ------------------------------------------------------------ skill elements
for k, el in {'high_voice': 'wind', 'bending': 'fire', 'double_kick': 'earth', 'straight_beat': 'earth', 'note_blast': 'holy'}.items():
    SK[k]['element'] = el

# ------------------------------------------------------------ wild maps 1.5x
WILD_MAPS = {'field', 'forest', 'marsh', 'canyon', 'snow', 'volcano'}
for s in S:
    if s['map'] in WILD_MAPS:
        s['area'] = [round(v * 1.5) for v in s['area']]
        if not M[s['monster']].get('boss'):
            s['count'] = round(s['count'] * 1.5)

# ------------------------------------------------------------ new items
def item(id, **kw):
    I[id] = kw

# refine materials: the old ones can't be bought any more, two new ones for +5..+10
I['tuning_ore']['desc'] = 'หินแร่ที่สั่นตรงคีย์พอดี ใช้ตีบวกอาวุธ +1 ถึง +4 (ใช้ 1 ก้อนต่อครั้ง) · ไม่มีขาย ดร็อปจากมอนสเตอร์ Lv 10-30'
I['velvet_patch']['desc'] = 'ผ้ากำมะหยี่หนานุ่ม ใช้ตีบวกชุด หมวก หูฟัง รองเท้า +1 ถึง +4 (ใช้ 1 ผืนต่อครั้ง) · ไม่มีขาย ดร็อปจากมอนสเตอร์ Lv 10-30'
item('pure_tuning_ore', name='หินจูนเสียงบริสุทธิ์', type='loot', price=600, color='#7fe3ff', weight=2,
     desc='หินจูนเสียงที่ใสจนสั่นได้ทุกคีย์ ใช้ตีบวกอาวุธ +5 ถึง +10 (ใช้ 1 ก้อนต่อครั้ง) · ไม่มีขาย ดร็อปจากมอนสเตอร์ Lv 40-99')
item('gold_velvet', name='ผ้ากำมะหยี่ทองซับเสียง', type='loot', price=600, color='#ffca28', weight=2,
     desc='ผ้ากำมะหยี่ปักดิ้นทอง เก็บเสียงได้เงียบสนิท ใช้ตีบวกชุด หมวก หูฟัง รองเท้า +5 ถึง +10 · ไม่มีขาย ดร็อปจากมอนสเตอร์ Lv 40-99')

# element converters
CONVERTERS = {
    'fire': ('flame_oil', 'น้ำมันเปลวไฟ', '#ff6a2a', 'ทาบนอาวุธแล้วโจมตีเป็นธาตุไฟ 10 นาที แรงกับธาตุดินและอมตะ'),
    'water': ('frost_powder', 'ผงน้ำแข็งใส', '#4fa3ff', 'โรยบนอาวุธแล้วโจมตีเป็นธาตุน้ำ 10 นาที แรงกับธาตุไฟ'),
    'earth': ('rock_sand', 'ทรายหินผา', '#b8894f', 'ถูบนอาวุธแล้วโจมตีเป็นธาตุดิน 10 นาที แรงกับธาตุลม'),
    'wind': ('storm_feather', 'ขนนกพายุ', '#7be07b', 'ผูกกับอาวุธแล้วโจมตีเป็นธาตุลม 10 นาที แรงกับธาตุน้ำ'),
    'holy': ('holy_water', 'น้ำมนต์โน้ตทอง', '#ffe27a', 'พรมบนอาวุธแล้วโจมตีเป็นธาตุศักดิ์สิทธิ์ 10 นาที แรงกับธาตุมืดและอมตะ'),
}
for el, (id, name, color, desc) in CONVERTERS.items():
    item(id, name=name, type='consumable', price=400, color=color, weight=3, endow=el, desc=desc)

# Lv 50+ weapons with an element, one per class, from the new maps' bosses
NEW_WEAPONS = {
    'crystal_dagger': dict(name='มีดคริสตัลก้อง', atk=58, classes=['teen'], element='water', color='#9be7ff', desc='มีดสั้นคริสตัลจากถ้ำเสียงก้อง เย็นเฉียบ โจมตีเป็นธาตุน้ำ'),
    'banshee_mic': dict(name='ไมค์บันชีกรีดร้อง', atk=82, classes=['singer'], element='ghost', color='#d1c4e9', desc='ไมค์ที่ขังเสียงกรีดร้องของบันชี โจมตีเป็นธาตุวิญญาณ'),
    'inferno_guitar': dict(name='กีตาร์นรกลาวา', atk=95, classes=['guitarist'], element='fire', color='#ff5722', desc='กีตาร์ที่หลอมจากหินลาวา สายร้อนจนเรืองแสง โจมตีเป็นธาตุไฟ'),
    'thunder_sticks': dict(name='ไม้กลองสายฟ้า', atk=86, classes=['drummer'], element='wind', color='#b2ff59', desc='ไม้กลองที่ฟ้าผ่าลงกลางพายุ ตีเร็วจนเกิดลม โจมตีเป็นธาตุลม'),
    'kraken_bass': dict(name='เบสหนวดคราเคน', atk=84, classes=['bassist'], element='water', color='#26c6da', desc='เบสที่สายทำจากหนวดหมึกยักษ์ ทุ้มลึกเหมือนใต้ทะเล โจมตีเป็นธาตุน้ำ'),
    'cathedral_organ': dict(name='ออร์แกนวิหารร้าง', atk=30, matk=98, classes=['keyboardist'], element='holy', color='#fff3c4', desc='คีย์บอร์ดจากออร์แกนในวิหารเก่า เสียงศักดิ์สิทธิ์ โจมตีเป็นธาตุศักดิ์สิทธิ์'),
}
for id, w in NEW_WEAPONS.items():
    item(id, type='weapon', price=3000, weight=70, slots=1, **w)
# an armour with its own element, from the volcano lord
item('magma_plate', name='เกราะแมกมาเมทัล', type='armor', def_=0, price=2500, color='#ff7043', weight=90, slots=1, element='fire',
     desc='เกราะหินแมกมาที่ยังอุ่นอยู่ สวมแล้วตัวเป็นธาตุไฟ (โดนไฟเบาลงมาก แต่แพ้น้ำ)')
I['magma_plate']['def'] = 14
del I['magma_plate']['def_']

# ------------------------------------------------------------ new monsters
# id: (name, Lv, element, lv, model, tint, glow, size, speed, aggressive, map, loot id, loot name, loot desc, card slot, card bonus, boss)
NEW = [
    # volcano: the armoured lava crabs from the reference picture
    ('lava_crablet', 'ปูลาวาจิ๋ว', 33, 'fire', 1, 'Blob_GreenSpikyBlob', '#ff7a2e', '#ff4400', 1.0, 55, True, 'volcano',
     'crab_shell', 'กระดองปูลาวา', 'กระดองแข็งที่ยังมีลาวาไหลในร่อง', 'shoes', {'def': 3, 'maxHp': 150}, False),
    # beach Lv 30-45
    ('sea_jelly', 'แมงกะพรุนซินธ์', 31, 'water', 2, 'Blob_PinkBlob', '#7fe8ff', '#3fc6ff', 0.9, 50, False, 'beach',
     'synth_gel', 'เจลซินธ์', 'เจลใสที่สั่นเป็นเสียงซินธ์', 'accessory', {'int': 2, 'maxSp': 40}, False),
    ('conch_fish', 'ปลาหอยสังข์บีท', 32, 'water', 1, 'Blob_Fish', '#ffb36b', None, 0.95, 60, False, 'beach',
     'conch_shell', 'เปลือกหอยสังข์', 'หอยสังข์เป่าแล้วได้ยินเสียงเบส', 'head', {'vit': 2, 'mdef': 2}, False),
    ('gull', 'นกนางนวลเสียงแหลม', 34, 'wind', 1, 'Flying_Pigeon', '#f2f7ff', None, 0.9, 85, True, 'beach',
     'gull_feather', 'ขนนกนางนวล', 'ขนนกขาวที่หอบเสียงคลื่นมาด้วย', 'shoes', {'agi': 2, 'flee': 3}, False),
    ('surf_frog', 'กบโต้คลื่นเร็กเก้', 35, 'water', 1, 'Big_Frog', '#3fd0c0', None, 1.1, 65, False, 'beach',
     'reggae_skin', 'หนังกบเร็กเก้', 'หนังกบลายเขียวเหลืองแดง', 'armor', {'vit': 2, 'maxHpPct': 4}, False),
    ('storm_squid', 'หมึกพายุดีเจ', 37, 'wind', 2, 'Flying_Squidle', '#5c7cff', '#8fb0ff', 1.0, 75, True, 'beach',
     'dj_ink', 'หมึกดีเจ', 'หมึกที่สาดออกมาเป็นจังหวะสแครช', 'weapon', {'dex': 2, 'hit': 5}, False),
    ('coral_golem', 'ปะการังเบสหนัก', 39, 'earth', 2, 'Big_Cactoro', '#ff7f8a', None, 1.25, 40, True, 'beach',
     'coral_piece', 'กิ่งปะการังเบส', 'ปะการังแข็งที่ก้องเสียงต่ำ', 'armor', {'def': 3, 'vit': 1}, False),
    ('kraken', 'ราชันย์หมึกยักษ์ซาวด์เวฟ', 45, 'water', 3, 'Big_Fish', '#7a5cff', '#5a3cff', 2.3, 50, True, 'beach',
     'kraken_tentacle', 'หนวดราชันย์หมึก', 'หนวดหมึกยักษ์ ยังดิ้นตามจังหวะเพลง', 'accessory', {'vit': 3, 'maxHpPct': 8}, True),
    # cave Lv 40-58
    ('crystal_bat', 'ค้างคาวคริสตัลก้อง', 41, 'wind', 1, 'Flying_Ghost', '#9fe8ff', '#6fd8ff', 0.95, 95, True, 'cave',
     'crystal_wing', 'ปีกคริสตัล', 'ปีกใสเหมือนแก้ว กระพือแล้วเสียงก้อง', 'shoes', {'agi': 3}, False),
    ('echo_slime', 'สไลม์เสียงสะท้อน', 43, 'poison', 1, 'Blob_GreenSpikyBlob', '#b06bff', '#8a3cff', 1.0, 45, False, 'cave',
     'echo_gel', 'เมือกเสียงสะท้อน', 'เมือกพิษที่พูดอะไรใส่ก็ตอบกลับ', 'weapon', {'atk': 8, 'crit': 2}, False),
    ('gem_golem', 'โกเลมอัญมณีเบส', 46, 'earth', 2, 'Flying_Goleling', '#c38bff', '#b06bff', 1.1, 55, True, 'cave',
     'amethyst', 'อเมทิสต์ก้องกังวาน', 'อัญมณีม่วงที่สั่นเป็นโน้ตเบส', 'armor', {'def': 4, 'mdef': 2}, False),
    ('cave_orc', 'ออร์คขุดแร่กลองศึก', 48, 'earth', 1, 'Blob_Orc', '#8f9aa8', None, 1.1, 60, True, 'cave',
     'miner_lamp', 'ตะเกียงคนขุดแร่', 'ตะเกียงเก่าที่ยังติดอยู่', 'head', {'str': 2, 'dex': 1}, False),
    ('glow_mush', 'เห็ดเรืองแสงไซคีเดลิก', 50, 'poison', 2, 'Blob_Mushnub', '#7dff8a', '#3cff6a', 1.0, 40, False, 'cave',
     'glow_spore', 'สปอร์เรืองแสง', 'สปอร์ที่ส่องแสงเป็นจังหวะ', 'accessory', {'int': 2, 'dex': 2}, False),
    ('shadow_ninja', 'นินจาเงาคริสตัล', 53, 'shadow', 1, 'Big_Ninja', '#3a3a5a', '#7a6aff', 1.2, 95, True, 'cave',
     'shadow_shuriken', 'ดาวกระจายเงา', 'ดาวกระจายคริสตัลดำ', 'weapon', {'agi': 2, 'crit': 4}, False),
    ('crystal_king', 'ราชาคริสตัลเสียงก้อง', 58, 'earth', 3, 'Big_Demon', '#a8e6ff', '#7fd8ff', 2.4, 45, True, 'cave',
     'echo_crown', 'มงกุฎคริสตัลก้อง', 'มงกุฎที่ก้องเสียงไปทั้งถ้ำ', 'head', {'int': 3, 'dex': 3, 'maxSpPct': 8}, True),
    # deadwood Lv 50-68
    ('wisp', 'ผีไฟโน้ตหลง', 52, 'ghost', 1, 'Flying_Ghost', '#a8ffcf', '#6dffb0', 0.85, 80, True, 'deadwood',
     'lost_note', 'โน้ตหลงทาง', 'โน้ตที่หลุดจากเพลงที่ไม่มีใครร้องจบ', 'accessory', {'luk': 3, 'crit': 2}, False),
    ('crow_skull', 'อีกาโครงกระดูกแร็พ', 55, 'shadow', 1, 'Flying_Ghost_Skull', '#5a5070', '#a07aff', 0.95, 90, True, 'deadwood',
     'bone_mic', 'ไมค์กระดูก', 'ไมค์จิ๋วที่ทำจากกระดูกอีกา', 'weapon', {'atk': 10, 'hit': 3}, False),
    ('rot_alien', 'ต้นไม้ผีพิษร้องโหยหวน', 57, 'poison', 2, 'Big_Alien', '#7a6a4a', None, 1.2, 45, False, 'deadwood',
     'rotten_root', 'รากไม้ผุ', 'รากไม้ดำที่ยังร้องเพลงเศร้า', 'armor', {'vit': 3}, False),
    ('zombie_yeti', 'เยติซอมบี้แจ๊ส', 59, 'undead', 1, 'Big_Yeti', '#9aa88a', None, 1.3, 55, True, 'deadwood',
     'zombie_fur', 'ขนเยติซอมบี้', 'ขนเยติที่เน่าแต่ยังนุ่ม', 'armor', {'maxHpPct': 6}, False),
    ('bog_witch', 'แม่มดหนองเพลงศพ', 61, 'shadow', 2, 'Blob_Wizard', '#4a2a6a', '#b04aff', 1.0, 55, True, 'deadwood',
     'funeral_score', 'โน้ตเพลงศพ', 'โน้ตเพลงที่เขียนด้วยหมึกดำ', 'weapon', {'matk': 14, 'int': 1}, False),
    ('bone_dino', 'ไดโนกระดูกเดธเมทัล', 63, 'undead', 2, 'Big_Dino', '#e8e0c8', None, 1.4, 75, True, 'deadwood',
     'death_bone', 'กระดูกเดธเมทัล', 'กระดูกที่สลักลายสายฟ้า', 'weapon', {'str': 2, 'atk': 8}, False),
    ('banshee_queen', 'ราชินีบันชีเสียงกรีดร้อง', 68, 'ghost', 3, 'Flying_Hywirl', '#e8e0ff', '#c8b0ff', 2.3, 55, True, 'deadwood',
     'banshee_veil', 'ผ้าคลุมบันชี', 'ผ้าคลุมขาวที่ยังกรีดร้องเบา ๆ', 'armor', {'flee': 6, 'maxSpPct': 6}, True),
    # ruins (the abandoned castle town) Lv 65-82
    ('opera_phantom', 'วิญญาณนักร้องโอเปร่า', 66, 'ghost', 2, 'Flying_Glub_Evolved', '#dfe8ff', '#a8c8ff', 1.0, 70, True, 'ruins',
     'opera_mask', 'หน้ากากโอเปร่า', 'หน้ากากครึ่งหน้าของนักร้องที่หายไป', 'head', {'int': 3, 'mdef': 3}, False),
    ('hollow_knight', 'อัศวินเกราะไร้ร่าง', 69, 'undead', 1, 'Big_Tribal', '#9aa4b0', None, 1.35, 55, True, 'ruins',
     'rusty_crest', 'ตราอัศวินขึ้นสนิม', 'ตราประจำตระกูลของอัศวินเก่า', 'armor', {'def': 5, 'vit': 1}, False),
    ('bell_gargoyle', 'การ์กอยล์ระฆังโบสถ์', 71, 'earth', 3, 'Flying_Goleling_Evolved', '#8a8a90', None, 1.15, 65, True, 'ruins',
     'bell_clapper', 'ลูกตุ้มระฆัง', 'ลูกตุ้มระฆังหินที่ตีแล้วดังทั้งเมือง', 'shoes', {'vit': 2, 'def': 2}, False),
    ('skull_bandsman', 'ทหารกะโหลกวงโยธวาทิต', 73, 'undead', 2, 'Big_Orc_Skull', '#e0dccf', None, 1.35, 60, True, 'ruins',
     'march_drum', 'กลองเดินแถวผุพัง', 'กลองสแนร์เก่าของวงโยธวาทิตผี', 'weapon', {'atk': 12, 'aspd': 3}, False),
    ('dark_bishop', 'บาทหลวงมืดเพลงสวด', 76, 'shadow', 3, 'Blob_Wizard', '#2a2030', '#7a3cff', 1.15, 55, True, 'ruins',
     'dark_hymnal', 'หนังสือเพลงสวดมืด', 'หนังสือเพลงสวดที่อ่านกลับหลัง', 'accessory', {'int': 3, 'matkPct': 4}, False),
    ('bell_angel', 'เทวดาระฆังทอง', 78, 'holy', 2, 'Flying_Pigeon', '#ffe27a', '#ffd84a', 1.1, 80, False, 'ruins',
     'angel_bell', 'ระฆังทองเทวดา', 'ระฆังเล็กที่สั่นแล้วใจสงบ', 'accessory', {'luk': 2, 'maxSp': 60, 'mdef': 2}, False),
    ('phantom_king', 'ราชาไร้บัลลังก์แห่งโอเปร่า', 82, 'undead', 4, 'Big_Demon', '#5a3a7a', '#c060ff', 2.6, 50, True, 'ruins',
     'phantom_crown', 'มงกุฎราชาไร้บัลลังก์', 'มงกุฎที่ไม่มีใครกล้าสวม', 'armor', {'str': 3, 'vit': 3, 'maxHpPct': 10}, True),
    # inferno Lv 80-99
    ('lava_crab', 'ปูลาวาเกราะหนาม', 81, 'fire', 2, 'Blob_GreenSpikyBlob', '#ff6a1e', '#ff3a00', 1.4, 55, True, 'inferno',
     'lava_carapace', 'เกราะปูลาวา', 'กระดองหนามที่ร้อนจนจับไม่ได้', 'armor', {'def': 6}, False),
    ('magma_slime', 'สไลม์แมกมาเดือด', 84, 'fire', 2, 'Blob_GreenBlob', '#ff8a1e', '#ff5a00', 1.2, 50, True, 'inferno',
     'boiling_gel', 'เจลแมกมาเดือด', 'เจลร้อนที่ยังเดือดปุด ๆ', 'weapon', {'atk': 14}, False),
    ('hell_hound', 'หมาเพลิงนรกแบล็กเมทัล', 86, 'fire', 3, 'Blob_Dog', '#b0201a', '#ff3a1a', 1.4, 95, True, 'inferno',
     'hellfire_fang', 'เขี้ยวเพลิงนรก', 'เขี้ยวที่ลุกเป็นไฟเมื่อคำราม', 'weapon', {'str': 3, 'crit': 3}, False),
    ('flame_demon', 'ปีศาจเปลวเพลิงกีตาร์', 89, 'fire', 3, 'Flying_Demon', '#d02a10', '#ff6a1a', 1.3, 85, True, 'inferno',
     'demon_pick', 'ปิ๊กปีศาจ', 'ปิ๊กกีตาร์สีเลือดจากปีศาจ', 'accessory', {'str': 2, 'atkPct': 4}, False),
    ('obsidian_golem', 'โกเลมหินออบซิเดียน', 92, 'earth', 4, 'Big_Orc', '#2a2226', '#ff4a1a', 1.6, 40, True, 'inferno',
     'obsidian_core', 'แกนออบซิเดียน', 'หินดำมันวาวที่ร้อนข้างใน', 'shoes', {'vit': 3, 'maxHpPct': 5}, False),
    ('lava_dragon', 'มังกรลาวาวัยรุ่น', 95, 'fire', 4, 'Flying_Dragon', '#ff7a1a', '#ff4a00', 1.5, 80, True, 'inferno',
     'lava_scale', 'เกล็ดมังกรลาวา', 'เกล็ดที่หลอมจากลาวาเย็นตัว', 'armor', {'def': 5, 'mdef': 3}, False),
    ('inferno_lord', 'จักรพรรดิภูเขาไฟเมทัล', 99, 'fire', 4, 'Flying_Dragon_Evolved', '#ff3a1a', '#ff6a00', 3.0, 55, True, 'inferno',
     'volcano_heart', 'หัวใจภูเขาไฟ', 'หัวใจลาวาที่ยังเต้นเป็นจังหวะดับเบิลเบส', 'weapon', {'str': 4, 'atkPct': 8}, True),
]

# the old curve, extended: what a monster of level L looks like before the +50% HP / -30% EXP pass
def stats(L, boss):
    hp = round(40 * L + 0.8 * L * L)
    atk = round(3.2 * L + 0.012 * L * L)
    df = round(0.7 * L)
    exp = round(0.6 * L * L)
    if boss:
        return dict(hp=hp * 10, atk=round(atk * 1.6), def_=round(df * 1.4), exp=exp * 13)
    return dict(hp=hp, atk=atk, def_=df, exp=exp)

# what each map's boss drops besides its loot and card
BOSS_DROPS = {
    'kraken': [('kraken_bass', 0.25), ('frost_powder', 0.5), ('outfit_beach_lace', 0.06), ('outfit_leopard_swim', 0.06)],
    'crystal_king': [('crystal_dagger', 0.3), ('rock_sand', 0.5), ('outfit_frost_princess', 0.06), ('outfit_cyber_mint', 0.06)],
    'banshee_queen': [('banshee_mic', 0.25), ('holy_water', 0.5), ('outfit_gothic', 0.06), ('outfit_witch', 0.06)],
    'phantom_king': [('cathedral_organ', 0.25), ('thunder_sticks', 0.25), ('outfit_night_general', 0.06), ('outfit_crimson_prince', 0.06)],
    'inferno_lord': [('inferno_guitar', 0.25), ('magma_plate', 0.2), ('outfit_red_evening', 0.06), ('outfit_shadow_battle', 0.06)],
}
CONVERTER_OF = {el: c[0] for el, c in CONVERTERS.items()}
# per map: spawn boxes (on the 84 x 84 wild layout) handed out in order
BOXES = [[12, 8, 40, 26], [44, 8, 72, 26], [12, 30, 40, 50], [44, 30, 72, 50], [12, 54, 40, 74], [44, 54, 72, 74]]
BOSS_BOX = [62, 62, 76, 76]
per_map = {}
for (id, name, L, el, elv, model, tint, glow, size, speed, aggr, mp, loot, lootName, lootDesc, slot, bonus, boss) in NEW:
    st = stats(L, boss)
    zeny = [L * 2, L * 5] if not boss else [L * 25, L * 60]
    drops = [[loot, 1.0 if boss else 0.5]]
    if boss:
        drops += [[a, b] for a, b in BOSS_DROPS.get(id, [])]
        drops += [['honey_lemon', 0.5], ['crystal_earring', 0.05]]
    else:
        drops += [['honey_lemon', 0.1]]
        if el in CONVERTER_OF:
            drops += [[CONVERTER_OF[el], 0.03]]
        if L >= 60:
            drops += [['crystal_earring', 0.008]]
    drops += [['card_' + id, 0.05 if boss else 0.004]]
    m = dict(name=name, level=L, hp=st['hp'], atk=st['atk'], def_=st['def_'], exp=st['exp'], jobExp=round(st['exp'] * 0.75),
             zeny=zeny, speed=speed, aggressive=aggr, color=tint, size=size, model=model, tint=tint, element=[el, elv], drops=drops)
    if glow:
        m['glow'] = glow
    if boss:
        m['boss'] = True
    m['def'] = m.pop('def_')
    M[id] = m
    item(loot, name=lootName, type='loot', price=max(60, L * 6) * (5 if boss else 1), color=tint, weight=1 if not boss else 5, desc=lootDesc)
    card = dict(slot=slot, bonus=bonus)
    if slot == 'armor' and el != 'neutral':
        card['element'] = el
    slot_th = {'weapon': 'อาวุธ', 'armor': 'ชุด', 'head': 'หมวก/หูฟัง', 'shoes': 'รองเท้า', 'accessory': 'เครื่องประดับ'}[slot]
    extra = ' · เสียบในชุดแล้วตัวเป็นธาตุ' + {'water': 'น้ำ', 'earth': 'ดิน', 'fire': 'ไฟ', 'wind': 'ลม', 'poison': 'พิษ', 'holy': 'ศักดิ์สิทธิ์', 'shadow': 'มืด', 'ghost': 'วิญญาณ', 'undead': 'อมตะ'}[el] if 'element' in card else ''
    item('card_' + id, name='การ์ด' + name, type='card', price=5000 if boss else 1500, color=tint, weight=1,
         desc=f'{lootDesc}{" (บอส)" if boss else ""} · เสียบได้ในช่องการ์ดของ{slot_th} เสียบแล้วถอดไม่ได้{extra}', card=card)
    if mp == 'volcano':
        S.append(dict(map='volcano', monster=id, count=12, area=[16, 52, 48, 72]))
        continue
    if boss:
        S.append(dict(map=mp, monster=id, count=1, area=BOSS_BOX, respawnSec=420 + (L - 45) * 3))
    else:
        i = per_map.get(mp, 0)
        per_map[mp] = i + 1
        S.append(dict(map=mp, monster=id, count=12, area=BOXES[i]))

# the volcano was rebuilt round a big volcano in the north-east and a lava river: its own spawn boxes
VOLCANO = {'fire_bat': [6, 24, 34, 36], 'ghost_skull': [6, 4, 40, 18], 'magma_golem': [38, 22, 54, 34], 'demon': [56, 30, 78, 46],
           'flame_metronome': [6, 52, 34, 76], 'orc_skull': [38, 64, 62, 78], 'lava_crablet': [36, 42, 70, 66], 'metal_lord': [66, 64, 78, 78]}
for sp in S:
    if sp['map'] == 'volcano':
        sp['area'] = VOLCANO[sp['monster']]
# the beach: the sea takes the east side
BEACH = {'sea_jelly': [40, 4, 60, 26], 'conch_fish': [40, 28, 60, 50], 'gull': [8, 4, 36, 26], 'surf_frog': [40, 52, 58, 72],
         'storm_squid': [8, 52, 36, 78], 'coral_golem': [8, 28, 36, 38], 'kraken': [44, 64, 58, 78]}
for sp in S:
    if sp['map'] == 'beach':
        sp['area'] = BEACH[sp['monster']]
# the inferno's volcano fills the middle of the north side
INFERNO = {'lava_crab': [4, 4, 24, 30], 'magma_slime': [60, 4, 80, 30]}
for sp in S:
    if sp['map'] == 'inferno' and sp['monster'] in INFERNO:
        sp['area'] = INFERNO[sp['monster']]

# ------------------------------------------------------------ refine materials as drops
for k, m in M.items():
    m['drops'] = [x for x in m['drops'] if x[0] not in ('tuning_ore', 'velvet_patch', 'pure_tuning_ore', 'gold_velvet')]
    if 10 <= m['level'] <= 30:
        m['drops'] += [['tuning_ore', 0.05], ['velvet_patch', 0.05]]
    elif 40 <= m['level'] <= 99:
        m['drops'] += [['pure_tuning_ore', 0.05], ['gold_velvet', 0.05]]
d['shop'] = [x for x in d['shop'] if x not in ('tuning_ore', 'velvet_patch')] + [c[0] for c in CONVERTERS.values()]

# ------------------------------------------------------------ +50% HP, -30% EXP for everyone
for m in M.values():
    m['hp'] = round(m['hp'] * 1.5)
    m['exp'] = max(1, round(m['exp'] * 0.7))
    m['jobExp'] = max(1, round(m['jobExp'] * 0.7))

json.dump(d, open('src/data/gamedata.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open('src/data/gamedata.json', 'a').write('\n')
print('monsters', len(M), 'items', len(I), 'spawns', len(S))
