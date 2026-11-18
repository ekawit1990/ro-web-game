"""2026-11-18: two new equipment slots.
  * glasses (แว่นตา): 12 music-themed glasses, one per mini boss + the MVP boss, drop only (3D from code: src/three/glasses.ts).
  * mount (พาหนะ): 3 scooters (Meshy AI models the user generated), All Stats +20, only the MVP boss drops them.
Idempotent: re-running replaces the same items and drops.
Usage: python3 tools/add_glasses_mounts.py src/data/gamedata.json"""
import json, sys
path = sys.argv[1]
d = json.load(open(path, encoding='utf8'))

G = [
  # id, boss, rate, name, kind, colours, bonus, desc
  ('gls_piano_shutter', 'king_jelly', 0.05, 'แว่นบานเกล็ดคีย์เปียโน', 'shutter', ['#fafafa', '#212121'],
   {'dex': 2, 'luk': 2}, 'แว่นบานเกล็ดลายคีย์เปียโนขาวดำ ใส่แล้วเห็นโลกเป็นจังหวะ'),
  ('gls_forest_round', 'elder_tree', 0.05, 'แว่นกลมกรอบไม้ป่าโบราณ', 'round', ['#8d6e63', '#c5e1a5', '#66bb6a'],
   {'int': 2, 'vit': 2}, 'แว่นกลมกรอบไม้เก่าแก่ มีใบไม้งอกที่ขาแว่น เลนส์สีเขียวอ่อน'),
  ('gls_shark_cateye', 'marsh_queen', 0.05, 'แว่นตาแมวฉลามบึง', 'cateye', ['#26a69a', '#b2ebf2', '#004d40'],
   {'agi': 3, 'dex': 2}, 'แว่นทรงตาแมวสีเขียวน้ำทะเล ปลายแหลมเหมือนครีบฉลาม'),
  ('gls_rock_flame', 'rock_dragon', 0.05, 'แว่นกันแดดเปลวร็อก', 'flame', ['#212121', '#ff7043', '#ffca28'],
   {'str': 3, 'crit': 3}, 'แว่นกันแดดดำ ขอบบนเป็นเปลวไฟส้มเหลือง ใส่แล้วอยากโซโล่กีตาร์'),
  ('gls_snow_star', 'snow_queen', 0.05, 'แว่นดาวหิมะโซปราโน', 'star', ['#e3f2fd', '#81d4fa', '#ffffff'],
   {'int': 3, 'dex': 3}, 'เลนส์รูปดาวสีฟ้าน้ำแข็ง ประกายระยิบเหมือนเสียงโซปราโน'),
  ('gls_metal_visor', 'metal_lord', 0.05, 'แว่นไวเซอร์หมุดเมทัล', 'visor', ['#37474f', '#ef5350', '#b0bec5'],
   {'str': 4, 'vit': 3}, 'แว่นแผ่นเดียวสีดำ ขอบตอกหมุดเหล็ก เส้นไฟแดงพาดกลาง สายเมทัลตัวจริง'),
  ('gls_kraken_goggle', 'kraken', 0.05, 'แว่นดำน้ำคลื่นเสียง', 'goggle', ['#1565c0', '#80deea', '#ffb300'],
   {'vit': 4, 'agi': 3}, 'แว่นดำน้ำกรอบน้ำเงิน เลนส์ใสสะท้อนคลื่นเสียงใต้ทะเล'),
  ('gls_crystal_hex', 'crystal_king', 0.05, 'แว่นคริสตัลหกเหลี่ยม', 'hex', ['#b39ddb', '#e1bee7', '#7e57c2'],
   {'int': 4, 'dex': 4}, 'แว่นหกเหลี่ยมกรอบคริสตัลม่วง สะท้อนเสียงก้องเป็นประกาย'),
  ('gls_banshee_heart', 'banshee_queen', 0.05, 'แว่นหัวใจเสียงกรีดร้อง', 'heart', ['#ad1457', '#f48fb1', '#fce4ec'],
   {'luk': 5, 'agi': 4}, 'แว่นรูปหัวใจสีชมพูเข้ม ใส่แล้วเสียงกรีดร้องกลายเป็นเพลงรัก'),
  ('gls_opera_monocle', 'phantom_king', 0.05, 'โมโนเคิลโอเปร่าราตรี', 'monocle', ['#ffd54f', '#e1f5fe', '#4a148c'],
   {'int': 5, 'dex': 5}, 'แว่นข้างเดียวกรอบทอง ห้อยโซ่ทองคล้องหู ของคู่ราชาแห่งโอเปร่า'),
  ('gls_lava_speaker', 'inferno_lord', 0.05, 'แว่นลำโพงลาวา', 'speaker', ['#3e2723', '#ff5722', '#ffab40'],
   {'str': 6, 'vit': 5}, 'เลนส์เป็นดอกลำโพงสีลาวาเรืองแสง สั่นตามจังหวะกลองภูเขาไฟ'),
  ('gls_abyss_vinyl', 'abyss_reaper', 0.04, 'แว่นแผ่นเสียงยมทูต', 'vinyl', ['#120a10', '#ff1744', '#b04dff'],
   {'str': 6, 'agi': 6, 'dex': 6}, 'เลนส์เป็นแผ่นเสียงไวนิลดำ ร่องเสียงเรืองแดง ม่วง แว่นที่หายากที่สุดในโลก'),
]

V = [
  # id, name, model, colour, rate, desc
  ('mount_silver_sprint', 'สกู๊ตเตอร์ซิลเวอร์สปรินต์', 'scooter_silver', '#b0bec5', 0.02,
   'สกู๊ตเตอร์สีเงินทรงสปอร์ต เบาและคล่องตัว'),
  ('mount_red_scooter', 'สกู๊ตเตอร์แดงเพลิง', 'scooter_red', '#e53935', 0.02,
   'สกู๊ตเตอร์สีแดงสด ขี่ผ่านที่ไหนใครก็หันมอง'),
  ('mount_retro_blue', 'สกู๊ตเตอร์เรโทรฟ้าเหลือง', 'scooter_retro', '#42a5f5', 0.02,
   'สกู๊ตเตอร์ทรงคลาสสิกสีฟ้าคาดเหลือง ขี่ชิลๆ ฟังเพลงไปด้วย'),
]

ids = {g[0] for g in G} | {v[0] for v in V}
for mon in d['monsters'].values():
    mon['drops'] = [x for x in mon['drops'] if x[0] not in ids]
for k in [k for k, it in d['items'].items() if it['type'] in ('glasses', 'mount') and k not in ids]:
    del d['items'][k]

for gid, boss, rate, name, kind, colours, bonus, desc in G:
    mon = d['monsters'][boss]
    assert mon.get('boss'), boss
    lv = mon['level']
    mon['drops'].append([gid, rate])
    where = ('บอส MVP ' if mon.get('mvp') else 'มินิบอส ') + mon['name']
    it = {'name': name, 'type': 'glasses', 'def': 1 + lv // 25, 'price': 5000, 'color': colours[0], 'weight': 10, 'slots': 1,
          'bonus': dict(bonus), 'glasses': {'kind': kind, 'c': colours}, 'mvp': True,
          'reqLevel': max(1, lv - 10), 'desc': desc + f' (ดรอปจาก{where} เท่านั้น, ไม่มีขายในร้าน)'}
    if lv >= 60:
        it['bonus']['maxHp'] = lv * 3
    d['items'][gid] = it

reaper = d['monsters']['abyss_reaper']
assert reaper.get('mvp')
for vid, name, model, colour, rate, desc in V:
    reaper['drops'].append([vid, rate])
    d['items'][vid] = {'name': name, 'type': 'mount', 'price': 50000, 'color': colour, 'weight': 50,
                       'bonus': {k: 20 for k in ('str', 'agi', 'vit', 'int', 'dex', 'luk')}, 'mount': {'model': model},
                       'mvp': True, 'desc': desc + ' สวมใส่แล้ว All Status +20 กดปุ่ม 🛵 ขี่รถ เดินเร็วขึ้น 150%'
                       f' (ดรอปจากบอส MVP {reaper["name"]} เท่านั้น, ไม่มีขายในร้าน)'}

json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok', len(G), 'glasses', len(V), 'mounts')
