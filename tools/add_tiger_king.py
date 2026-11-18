"""2026-11-18: ราชาเสือโคร่ง (tiger king), an MVP boss Lv 99 in ทุ่งเมโลดี้ (field), and its tiger-striped drops.
  * the boss: Meshy AI model (public/models/monsters/Tiger_Warlord.glb.gz, rigged by tools/rig_tiger.mjs),
    4 skills (MONSTER_SKILLS tiger_*), not aggressive (the field is the starter map), respawn 1 hour
  * drops: a tiger weapon for each of the 6 classes, tiger costume (boy / girl), tiger glasses, tiger head hat,
    3 tiger-striped scooters (0.01% each) and the tiger king card (0.01%, shoes: Str +50, MaxHP +50%, ดูดเลือด 10%)
The user set the scooter and card rates; the other rates are mine, in line with the abyss reaper (the other MVP).
Idempotent: re-running replaces the same items, drops and spawn.
Usage: python3 tools/add_tiger_king.py src/data/gamedata.json"""
import json, sys
path = sys.argv[1]
d = json.load(open(path, encoding='utf8'))

BOSS = 'tiger_king'
WHERE = '(ดรอปจากบอส MVP ราชาเสือโคร่ง Lv 99 แห่งทุ่งเมโลดี้ เท่านั้น, ไม่มีขายในร้าน)'
ALL = ['str', 'agi', 'vit', 'int', 'dex', 'luk']

items = {
  # ---- loot (always drops, for selling)
  'tiger_king_fang': {'name': 'เขี้ยวราชาเสือโคร่ง', 'type': 'loot', 'price': 1500, 'color': '#fff4e2', 'weight': 2,
                      'desc': 'เขี้ยวขาวยาวคมกริบของราชาเสือโคร่ง ร้องคำรามทีเดียวทั้งทุ่งเงียบกริบ (ขายได้)'},
  'tiger_king_pelt': {'name': 'ผืนหนังลายพยัคฆ์', 'type': 'loot', 'price': 1500, 'color': '#f08a1c', 'weight': 5,
                      'desc': 'ผืนหนังลายเสือสีส้มดำเงาวับ นุ่มแต่เหนียวจนดาบฟันไม่เข้า (ขายได้)'},
  # ---- weapons, one per class (3D: shape ids built in mics.ts / guitarShapes.ts / sticks.ts / keyboard.ts / djdeck.ts)
  'mic_tiger': {'name': 'ไมค์พยัคฆ์คำราม', 'type': 'weapon', 'atk': 100, 'classes': ['singer'], 'shape': 'mic_tiger', 'weight': 30,
                'element': 'earth', 'bonus': {'dex': 5, 'str': 3, 'atkPct': 6, 'pvpAtkPct': 12},
                'desc': 'ไมค์ด้ามลายเสือส้มดำ หัวตะแกรงสีทองเหมือนแผงคอราชาเสือ ร้องทีไรเหมือนเสือคำราม โจมตีเป็นธาตุดิน'},
  'gtr_tiger': {'name': 'กีตาร์ทรงกรงเล็บ "ลายพยัคฆ์"', 'type': 'weapon', 'atk': 108, 'classes': ['guitarist'], 'shape': 'tiger', 'weight': 70,
                'element': 'earth', 'bonus': {'str': 4, 'atkPct': 6, 'crit': 3, 'pvpAtkPct': 13},
                'desc': 'กีตาร์ไฟฟ้าทรงหนามแหลมเหมือนกรงเล็บ ลายเสือส้มดำเคลือบเงา ฮาร์ดแวร์ทอง โจมตีเป็นธาตุดิน'},
  'bss_tiger': {'name': 'เบส 5 สาย "ลายพยัคฆ์"', 'type': 'weapon', 'atk': 104, 'classes': ['bassist'], 'shape': 'tiger', 'weight': 70,
                'element': 'earth', 'bonus': {'str': 4, 'vit': 3, 'atkPct': 6, 'pvpAtkPct': 13},
                'desc': 'เบส 5 สายบอดี้ลายเสือส้มดำ ฮาร์ดแวร์ทอง เสียงต่ำหนักเหมือนเสียงขู่ในลำคอ โจมตีเป็นธาตุดิน'},
  'stk_tiger': {'name': 'ไม้กลองคู่ "ลายพยัคฆ์"', 'type': 'weapon', 'atk': 94, 'classes': ['drummer'], 'shape': 'stick_tiger', 'weight': 70,
                'element': 'earth', 'bonus': {'agi': 4, 'str': 3, 'aspd': 3, 'pvpAtkPct': 12},
                'desc': 'ไม้กลองคู่ลายเสือส้มดำ ปลายหัวสีทอง ตีรัวได้เร็วเหมือนเสือตะปบ โจมตีเป็นธาตุดิน'},
  'kbd_tiger': {'name': 'คีย์บอร์ด "ลายพยัคฆ์"', 'type': 'weapon', 'atk': 30, 'matk': 98, 'classes': ['keyboardist'], 'shape': 'kb_tiger', 'weight': 70,
                'element': 'earth', 'bonus': {'int': 5, 'matkPct': 7, 'pvpAtkPct': 6},
                'desc': 'คีย์บอร์ดตัวถังลายเสือส้มดำ ขอบทอง ทุกคีย์ดังก้องเหมือนเสียงป่า โจมตีเป็นธาตุดิน'},
  'dj_tiger': {'name': 'ดีเจคอนโทรลเลอร์ "ลายพยัคฆ์"', 'type': 'weapon', 'atk': 30, 'matk': 100, 'classes': ['dj'], 'shape': 'dj_tiger', 'weight': 70,
               'element': 'earth', 'bonus': {'int': 5, 'matkPct': 7, 'pvpAtkPct': 6},
               'desc': 'ชุดดีเจ 4 แทร็กตัวถังลายเสือ จานหมุนสีทอง เปิดเพลงทีไรฟลอร์คำรามทั้งงาน โจมตีเป็นธาตุดิน'},
  # ---- tiger costume (VRoid outfit, tools/make_tiger_outfits.py)
  'outfit_tiger_m': {'name': 'ชุดคอสตูมพยัคฆ์ (ชาย)', 'type': 'armor', 'def': 18, 'weight': 60, 'gender': 'm', 'vrm': 'tiger_outfit_m.vrm.gz',
                     'slots': 1, 'bonus': {'str': 6, 'agi': 6, 'vit': 6, 'maxHpPct': 6},
                     'desc': 'แจ็กเก็ตลายเสือส้มดำ ปกและแขนเสื้อสีดำ กางเกงดำแถบส้ม รองเท้าลายเสือ (ใส่แล้วเปลี่ยนเสื้อผ้าทั้งชุด หน้าและผมยังเป็นของเรา)'},
  'outfit_tiger_f': {'name': 'ชุดคอสตูมพยัคฆ์ (หญิง)', 'type': 'armor', 'def': 18, 'weight': 60, 'gender': 'f', 'vrm': 'tiger_outfit_f.vrm.gz',
                     'slots': 1, 'bonus': {'str': 6, 'agi': 6, 'dex': 6, 'maxHpPct': 6},
                     'desc': 'แจ็กเก็ตครอปลายเสือ เสื้อในขาว กระโปรงพลีตลายเสือ ถุงเท้ายาวสีดำ (ใส่แล้วเปลี่ยนเสื้อผ้าทั้งชุด หน้าและผมยังเป็นของเรา)'},
  # ---- glasses and hat (3D from code: glasses.ts kind 'tiger', hats.ts kind 'tigerhead')
  'gls_tiger': {'name': 'แว่นตาลายพยัคฆ์', 'type': 'glasses', 'def': 4, 'weight': 10, 'slots': 1,
                'bonus': {'str': 6, 'agi': 6, 'luk': 6, 'maxHp': 300}, 'glasses': {'kind': 'tiger', 'c': ['#f08a1c', '#ffc94a', '#141010']},
                'desc': 'แว่นทรงตาเสือ กรอบลายเสือส้มดำ เลนส์สีอำพันเหมือนตาเสือตอนกลางคืน'},
  'hat_tiger_head': {'name': 'หมวกหัวราชาเสือ', 'type': 'head', 'def': 14, 'weight': 20, 'slots': 2,
                     'bonus': {'str': 7, 'vit': 7, 'maxHp': 400, 'pvpDefPct': 6}, 'hat': {'kind': 'tigerhead', 'c': ['#f08a1c', '#141010', '#fff4e2']},
                     'desc': 'หมวกหัวเสือขนนุ่มลายส้มดำ หูกลม ตาอำพัน เขี้ยวขาวห้อยหน้าผาก ใส่แล้วเหมือนราชาแห่งทุ่ง'},
  # ---- the card
  'card_tiger_king': {'name': 'การ์ดราชาเสือโคร่ง', 'type': 'card', 'price': 10000, 'color': '#f08a1c', 'weight': 1,
                      'card': {'slot': 'shoes', 'bonus': {'str': 50, 'maxHpPct': 50, 'lifestealPct': 10}},
                      'desc': 'ราชาแห่งทุ่งเมโลดี้ ขวานยักษ์ฟาดลงทีเดียวแผ่นดินแยก (บอส MVP) · เสียบได้ในช่องการ์ดของรองเท้า · ดูดเลือด 10% ของดาเมจที่ทำได้กลับมาเป็น HP · เสียบแล้วถอดไม่ได้'},
}
# 3 tiger-striped scooters: the same 3 models, painted tiger (mounts.ts skin 'tiger')
MOUNTS = [
  ('mount_tiger_sprint', 'สกู๊ตเตอร์สปรินต์ลายพยัคฆ์', 'scooter_silver', 'สกู๊ตเตอร์ทรงสปอร์ตทาลายเสือส้มดำ เบาและเร็วเหมือนเสือวิ่ง'),
  ('mount_tiger_red', 'สกู๊ตเตอร์เพลิงลายพยัคฆ์', 'scooter_red', 'สกู๊ตเตอร์ทาลายเสือส้มดำเงาวับ ขี่ผ่านที่ไหนทุกคนต้องหลีกทาง'),
  ('mount_tiger_retro', 'สกู๊ตเตอร์เรโทรลายพยัคฆ์', 'scooter_retro', 'สกู๊ตเตอร์ทรงคลาสสิกทาลายเสือ ขี่ชิลๆ แต่ดุดัน'),
]
for mid, name, model, desc in MOUNTS:
  items[mid] = {'name': name, 'type': 'mount', 'price': 50000, 'color': '#f08a1c', 'weight': 50,
                'bonus': {k: 20 for k in ALL}, 'mount': {'model': model, 'skin': 'tiger'},
                'desc': desc + ' สวมใส่แล้ว All Status +20 กดปุ่ม 🛵 ขี่รถ เดินเร็วขึ้น 150%'}

for k, it in items.items():
  it.setdefault('price', 4000 if it['type'] in ('weapon', 'armor') else 8000 if it['type'] in ('head',) else 5000)
  it.setdefault('color', '#f08a1c')
  if it['type'] in ('weapon', 'armor', 'head', 'glasses', 'mount'):
    it['mvp'] = True
    it['desc'] += ' ' + WHERE
  if it['type'] in ('weapon', 'armor', 'glasses'):
    it['slots'] = it.get('slots', 1)
    it['reqLevel'] = 90
  if it['type'] == 'head':
    it['reqLevel'] = 95
  if it['type'] == 'mount':
    it['reqLevel'] = 1
  d['items'][k] = it

DROPS = [
  ['tiger_king_fang', 1.0], ['tiger_king_pelt', 1.0],
  ['pure_tuning_ore', 0.3], ['gold_velvet', 0.3],
  ['mic_tiger', 0.05], ['gtr_tiger', 0.05], ['bss_tiger', 0.05], ['stk_tiger', 0.05], ['kbd_tiger', 0.05], ['dj_tiger', 0.05],
  ['outfit_tiger_m', 0.05], ['outfit_tiger_f', 0.05],
  ['gls_tiger', 0.04], ['hat_tiger_head', 0.04],
  ['mount_tiger_sprint', 0.0001], ['mount_tiger_red', 0.0001], ['mount_tiger_retro', 0.0001],
  ['card_tiger_king', 0.0001],
]
d['monsters'][BOSS] = {
  'name': 'ราชาเสือโคร่ง', 'level': 99, 'hp': 450000, 'atk': 760, 'def': 100, 'exp': 36000, 'jobExp': 27000,
  'zeny': [7000, 18000], 'speed': 70,
  # the field is where new players start: it only fights back when someone attacks it
  'aggressive': False,
  'color': '#f08a1c', 'size': 2.1, 'element': ['earth', 3], 'boss': True, 'mvp': True,
  'skills': ['tiger_cleave', 'tiger_pounce', 'tiger_claws', 'tiger_roar'],
  'drops': DROPS, 'model': 'Tiger_Warlord', 'modelScale': 1.8, 'voice': 'roar', 'kind': 'สัตว์', 'rarity': 'MVP',
}
d['spawns'] = [s for s in d['spawns'] if s['monster'] != BOSS]
d['spawns'].append({'map': 'field', 'monster': BOSS, 'count': 1, 'area': [62, 36, 80, 56], 'respawnSec': 3600})

json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok', len(items), 'items,', len(DROPS), 'drops')
