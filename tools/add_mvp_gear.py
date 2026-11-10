"""Adds the MVP drumsticks (6), keyboards (4) and basses (6) to gamedata.json and the boss drop tables.
Idempotent: re-running replaces the same items/drops. Same style as add_mvp_guitars.py."""
import json, sys
path = sys.argv[1]
d = json.load(open(path, encoding='utf8'))
G = [
  # id, cls, shape, name, atk, matk, element, bonus, colour, boss, desc
  ('stk_pink', 'drummer', 'stick_pink', 'ไม้กลองสีชมพู "ซากุระบีต"', 44, 0, 'holy', {'agi': 2, 'luk': 2}, '#f27aa6', 'king_jelly', 'ไม้กลองคู่สีชมพูหวาน หัวไม้ธรรมชาติ ตีเบาๆ แต่จังหวะแม่น โจมตีเป็นธาตุศักดิ์สิทธิ์'),
  ('stk_green', 'drummer', 'stick_green', 'ไม้กลองสีเขียว "ใบไม้ไหว"', 48, 0, 'wind', {'agi': 3, 'aspd': 2}, '#8fdc6a', 'elder_tree', 'ไม้กลองคู่สีเขียวอ่อน เบาเหมือนใบไม้ ตีรัวได้เร็ว โจมตีเป็นธาตุลม'),
  ('stk_blue', 'drummer', 'stick_blue', 'ไม้กลองสีฟ้า "คลื่นน้ำใส"', 52, 0, 'water', {'dex': 3, 'hit': 5}, '#56c2ee', 'marsh_queen', 'ไม้กลองคู่สีฟ้าน้ำทะเล จังหวะลื่นไหลเหมือนคลื่น โจมตีเป็นธาตุน้ำ'),
  ('stk_red', 'drummer', 'stick_red', 'ไม้กลองสีแดง "เพลิงร็อก"', 58, 0, 'fire', {'str': 3, 'crit': 3}, '#e8361f', 'rock_dragon', 'ไม้กลองคู่สีแดงเพลิง ตีแรงจนกลองแทบลุกเป็นไฟ โจมตีเป็นธาตุไฟ'),
  ('stk_purple', 'drummer', 'stick_purple', 'ไม้กลองสีม่วง "วิญญาณลาเวนเดอร์"', 88, 0, 'ghost', {'agi': 4, 'aspd': 3}, '#c7a2ec', 'banshee_queen', 'ไม้กลองคู่สีม่วงลาเวนเดอร์ ได้ยินเสียงสะท้อนจากอีกภพ โจมตีเป็นธาตุวิญญาณ'),
  ('stk_black', 'drummer', 'stick_black', 'ไม้กลองดำกากเพชร "ราตรีระยิบ"', 96, 0, 'shadow', {'str': 4, 'atkPct': 8}, '#1c1c22', 'phantom_king', 'ไม้กลองคู่สีดำโรยกากเพชรระยิบระยับ ของหายากจากราชาไร้บัลลังก์ โจมตีเป็นธาตุมืด'),
  ('kbd_red', 'keyboardist', 'kb_red', 'คีย์บอร์ดสีแดง "เปลวเพลง"', 22, 72, 'fire', {'int': 3, 'matkPct': 4}, '#c8202a', 'metal_lord', 'คีย์บอร์ดตัวบางสีแดงสด ลำโพงในตัว เสียงร้อนแรง โจมตีเป็นธาตุไฟ'),
  ('kbd_white', 'keyboardist', 'kb_white', 'คีย์บอร์ดสีขาว "เปียโนเมฆ"', 24, 78, 'water', {'int': 3, 'maxSpPct': 8}, '#f4f4f0', 'kraken', 'เปียโนไฟฟ้าสีขาว 61 คีย์ ลำโพงสองข้าง เสียงนุ่มใส โจมตีเป็นธาตุน้ำ'),
  ('kbd_slim', 'keyboardist', 'kb_slim', 'คีย์บอร์ดสีดำ "สลิมไนท์"', 27, 86, 'earth', {'int': 4, 'dex': 2}, '#141416', 'crystal_king', 'คีย์บอร์ดสีดำตัวบางเบา พกพาง่าย เสียงหนักแน่น โจมตีเป็นธาตุดิน'),
  ('kbd_stage', 'keyboardist', 'kb_stage', 'คีย์บอร์ดสเตจ "แกรนด์ราตรี"', 32, 102, 'shadow', {'int': 5, 'matkPct': 8}, '#1a1b1f', 'phantom_king', 'เปียโนไฟฟ้าตัวใหญ่สำหรับขึ้นเวที สีดำขลิบเงิน เสียงยิ่งใหญ่ โจมตีเป็นธาตุมืด'),
  ('bss_mikro', 'bassist', 'mikro', 'เบสจิ๋ว "วอลนัท"', 45, 0, 'earth', {'agi': 2, 'vit': 2}, '#5e3c22', 'king_jelly', 'เบสสเกลสั้นตัวเล็ก ไม้วอลนัท หัว 2+2 ถือง่ายฟาดคล่อง โจมตีเป็นธาตุดิน'),
  ('bss_pbass', 'bassist', 'pbass', 'เบสคลาสสิก "ซันเบิร์สต์"', 52, 0, 'water', {'vit': 3, 'maxHpPct': 5}, '#c8561c', 'marsh_queen', 'เบส 4 สายทรงคลาสสิก ปิ๊กอัพแยกคู่ ลายซันเบิร์สต์ เสียงทุ้มหนา โจมตีเป็นธาตุน้ำ'),
  ('bss_sr', 'bassist', 'sr', 'เบสเขายาว "อำพัน"', 58, 0, 'fire', {'str': 3, 'crit': 3}, '#d08a30', 'rock_dragon', 'เบสตัวบางเขายาวแหลม สีอำพันไล่เฉด เบามือ โจมตีเป็นธาตุไฟ'),
  ('bss_jag_short', 'bassist', 'jag_short', 'เบสออฟเซ็ตสั้น "เงินจันทร์"', 64, 0, 'wind', {'agi': 3, 'aspd': 2}, '#c9cdd3', 'snow_queen', 'เบสสเกลสั้นทรงเอวเบี้ยว สีเงินเมทัลลิก ปิ๊กการ์ดดำ โจมตีเป็นธาตุลม'),
  ('bss_jazz5', 'bassist', 'jazz5', 'เบส 5 สาย "ไม้แอชทอง"', 84, 0, 'earth', {'vit': 4, 'maxHpPct': 8}, '#e9d2a2', 'crystal_king', 'เบส 5 สายไม้แอชสีธรรมชาติ คอเมเปิลอินเลย์บล็อก เสียงคมชัด โจมตีเป็นธาตุดิน'),
  ('bss_sire5', 'bassist', 'sire5', 'เบส 5 สาย "มหาสมุทรลึก"', 108, 0, 'shadow', {'str': 5, 'atkPct': 8}, '#1d5f8e', 'inferno_lord', 'เบส 5 สายสเกลยาวสีน้ำเงินลายไม้ ของรางวัลสูงสุดจากจักรพรรดิภูเขาไฟ โจมตีเป็นธาตุมืด'),
]
RATE = 0.08
ids = {g[0] for g in G}
for m in d['monsters'].values():
    m['drops'] = [x for x in m['drops'] if x[0] not in ids]
for gid, cls, shape, name, atk, matk, el, bonus, color, boss, desc in G:
    it = {'name': name, 'type': 'weapon', 'atk': atk, 'price': 4000, 'classes': [cls], 'color': color, 'weight': 70,
          'slots': 1, 'shape': shape, 'mvp': True, 'bonus': bonus,
          'desc': desc + f' (ดรอปจากบอส MVP {d["monsters"][boss]["name"]})'}
    if matk: it['matk'] = matk
    if el != 'neutral': it['element'] = el
    d['items'][gid] = it
    assert d['monsters'][boss].get('boss'), boss
    d['monsters'][boss]['drops'].append([gid, RATE])
json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok', len(G))
