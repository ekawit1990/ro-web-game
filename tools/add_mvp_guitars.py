"""Adds the 12 MVP guitars (one per body shape) to gamedata.json and puts them on the boss drop tables.
Idempotent: re-running replaces the same items/drops."""
import json, sys
path = sys.argv[1]
d = json.load(open(path, encoding='utf8'))
G = [
  # id, shape, name, atk, element, bonus, colour, boss, desc
  ('gtr_offset_mini', 'offset_mini', 'กีตาร์ออฟเซ็ตจิ๋ว "ซีโฟม"', 46, 'wind', {'agi': 3}, '#9fd8d0', 'king_jelly', 'กีตาร์ตัวเล็กเอวเบี้ยว สีเขียวน้ำทะเล เบามือ ฟาดได้คล่อง โจมตีเป็นธาตุลม'),
  ('gtr_ttype', 'ttype', 'กีตาร์ทรง T "บัตเตอร์สก็อตช์"', 50, 'earth', {'str': 2, 'vit': 2}, '#e3a33a', 'elder_tree', 'กีตาร์ตัวแบนเรียบ ไม้สีเนยทอง ปิ๊กการ์ดดำ เสียงแหลมใสแต่หนักแน่น โจมตีเป็นธาตุดิน'),
  ('gtr_thinline', 'thinline', 'กีตาร์ทรง T กลวงครึ่ง "ไข่มุก"', 54, 'water', {'dex': 3, 'maxSpPct': 5}, '#f2ecd8', 'marsh_queen', 'กีตาร์ทรง T เจาะช่องเสียงรูปตัว f ปิ๊กการ์ดมุก เสียงกังวานเหมือนน้ำ โจมตีเป็นธาตุน้ำ'),
  ('gtr_doublehorn', 'doublehorn', 'กีตาร์เขาคู่ "เชอร์รี่ร็อก"', 60, 'fire', {'str': 3, 'crit': 3}, '#8a1c24', 'rock_dragon', 'กีตาร์ตัวบางเขาแหลมสองข้าง สีเชอร์รี่ ร็อกจัดจ้าน โจมตีเป็นธาตุไฟ'),
  ('gtr_offset', 'offset', 'กีตาร์ออฟเซ็ต "ตะวันลับฟ้า"', 64, 'water', {'agi': 2, 'dex': 2, 'aspd': 2}, '#c2662a', 'snow_queen', 'กีตาร์เอวเบี้ยวตัวยาว ลายซันเบิร์สต์ แผงโครเมียมเงาวับ โจมตีเป็นธาตุน้ำ'),
  ('gtr_stype', 'stype', 'กีตาร์ทรง S "ซันเบิร์สต์"', 70, 'neutral', {'str': 1, 'agi': 1, 'vit': 1, 'int': 1, 'dex': 1, 'luk': 1}, '#b5501c', 'metal_lord', 'กีตาร์ทรงคลาสสิกเขาคู่ ปิ๊กอัพ 3 ตัว ลายซันเบิร์สต์ ใช้ได้ทุกแนวเพลง ค่าสถานะทุกอย่าง +1'),
  ('gtr_flametop', 'flametop', 'กีตาร์ลายเปลว "คลื่นมหาสมุทร"', 76, 'water', {'atkPct': 5, 'dex': 2}, '#1f4fa0', 'kraken', 'กีตาร์ไม้ลายเปลวสีน้ำเงินมหาสมุทร ฮาร์ดแวร์ทอง ทุ้มลึกเหมือนคลื่น โจมตีเป็นธาตุน้ำ'),
  ('gtr_arrow', 'arrow', 'กีตาร์ทรงลูกศร "สายฟ้าขาว"', 84, 'earth', {'crit': 5, 'hit': 5, 'str': 2}, '#eeeae0', 'crystal_king', 'กีตาร์ทรงเหลี่ยมคมเหมือนหัวลูกศร สีขาว ปิ๊กการ์ดดำ ฟาดทีเดียวแตกกระจาย โจมตีเป็นธาตุดิน'),
  ('gtr_hollow', 'hollow', 'กีตาร์ตัวกลวง "หงส์ขาว"', 90, 'holy', {'maxHpPct': 8, 'int': 3}, '#f4f1e6', 'banshee_queen', 'กีตาร์ตัวกลวงขนาดใหญ่ สีขาวขลิบทอง คันโยกเสียงสั่น เสียงอบอุ่นศักดิ์สิทธิ์ โจมตีเป็นธาตุศักดิ์สิทธิ์'),
  ('gtr_singlecut', 'singlecut', 'กีตาร์ซิงเกิลคัท "ราตรีทองคำ"', 98, 'shadow', {'atkPct': 8, 'vit': 3}, '#141418', 'phantom_king', 'กีตาร์ตัวหนักเว้าข้างเดียว สีดำขลิบครีม ฮาร์ดแวร์ทอง เสียงหนาแน่นทรงพลัง โจมตีเป็นธาตุมืด'),
  ('gtr_vshape', 'vshape', 'กีตาร์ทรง V "ม้าลายสายฟ้า"', 106, 'wind', {'agi': 4, 'aspd': 3, 'crit': 3}, '#f0e6c8', 'inferno_lord', 'กีตาร์ทรงตัววีลายขาวดำเหมือนม้าลาย ฟาดเร็วเหมือนสายฟ้า โจมตีเป็นธาตุลม'),
  ('gtr_spike', 'spike', 'กีตาร์หนามปีศาจ "จอมเวทหนาม"', 112, 'shadow', {'str': 5, 'atkPct': 8}, '#101012', 'inferno_lord', 'กีตาร์ทรงหนามแหลมรอบตัว สีดำลวดลายขาว ของรางวัลสูงสุดจากจักรพรรดิภูเขาไฟ โจมตีเป็นธาตุมืด'),
]
RATE = 0.08
ids = {g[0] for g in G}
for m in d['monsters'].values():
    m['drops'] = [x for x in m['drops'] if x[0] not in ids]
for gid, shape, name, atk, el, bonus, color, boss, desc in G:
    it = {'name': name, 'type': 'weapon', 'atk': atk, 'price': 4000, 'classes': ['guitarist'], 'color': color, 'weight': 70,
          'slots': 1, 'shape': shape, 'mvp': True, 'bonus': bonus,
          'desc': desc + f' (ดรอปจากบอส MVP {d["monsters"][boss]["name"]})'}
    if el != 'neutral': it['element'] = el
    d['items'][gid] = it
    assert d['monsters'][boss].get('boss'), boss
    d['monsters'][boss]['drops'].append([gid, RATE])
json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok', len(G))
