"""2026-11-13: 7 boss microphones for the singer (shapes after the user's pictures of stage mics, no makers' names),
dropped by the mini bosses and the MVP boss. Idempotent: re-running replaces the same items/drops.
Usage: python3 tools/add_mvp_mics.py src/data/gamedata.json"""
import json, sys
path = sys.argv[1]
d = json.load(open(path, encoding='utf8'))
M = [
  # id (= shape), name, atk, element, bonus, colour, [(boss, rate)], desc
  ('mic_inst', 'ไมค์จ่อกลอง "สแนร์ช็อต"', 44, 'neutral', {'dex': 2, 'hit': 5}, '#26262b',
   [('king_jelly', 0.08), ('elder_tree', 0.08)], 'ไมค์ทรงกระบอกตรงสีดำ ตะแกรงเจาะร่องสองแถว ใช้จ่อกลองหรือแอมป์ ขว้างแล้วเสียงคมกระแทก'),
  ('mic_stick', 'ไมค์สตูดิโอ "ก้านเหล็ก"', 50, 'water', {'dex': 3, 'aspd': 2}, '#4b5057',
   [('marsh_queen', 0.08), ('kraken', 0.08)], 'ไมค์ก้านเรียวสีเทาเข้ม หัวตะแกรงดำทรงกระบอก ทนทานใช้ได้ทุกเวที โจมตีเป็นธาตุน้ำ'),
  ('mic_red', 'ไมค์ตะแกรงแดง "หัวใจร็อก"', 58, 'fire', {'str': 2, 'dex': 3, 'crit': 3}, '#c4141f',
   [('rock_dragon', 0.08)], 'ไมค์ตัวดำ ตะแกรงเงินโปร่งเห็นตาข่ายสีแดงด้านใน ร้องทีไรไฟลุก โจมตีเป็นธาตุไฟ'),
  ('mic_taper', 'ไมค์ทรงเรียว "หมอกเงิน"', 64, 'water', {'dex': 3, 'maxSpPct': 5}, '#757b82',
   [('snow_queen', 0.08)], 'ไมค์ร้องทรงเรียวสีเทาเงิน หัวตาข่ายดำ เสียงใสเย็นเหมือนหมอกหน้าหนาว โจมตีเป็นธาตุน้ำ'),
  ('mic_silverband', 'ไมค์คาดเงิน "ราตรีเงิน"', 72, 'shadow', {'dex': 4, 'crit': 4}, '#3c4047',
   [('metal_lord', 0.08)], 'ไมค์ตัวเทาดำ หัวตาข่ายดำ คาดวงแหวนสีเงินใต้หัว เสียงหนักแน่นแบบเมทัล โจมตีเป็นธาตุมืด'),
  ('mic_ball', 'ไมค์หัวบอล "ตำนานเวที"', 84, 'earth', {'dex': 4, 'atkPct': 5}, '#c8ccd1',
   [('crystal_king', 0.08), ('banshee_queen', 0.08)], 'ไมค์ร้องหัวบอลตะแกรงเงินในตำนาน อยู่คู่ทุกเวทีมาหลายสิบปี โจมตีเป็นธาตุดิน'),
  ('mic_vintage', 'ไมค์วินเทจโครเมียม "ราชาร็อกแอนด์โรล"', 104, 'holy', {'dex': 5, 'atkPct': 8}, '#d4d9de',
   [('phantom_king', 0.08), ('inferno_lord', 0.08), ('abyss_reaper', 0.1)], 'ไมค์โครเมียมยุคเก่า หัวทรงรีเซาะร่องบนขาตั้งรูปตัว U ของรางวัลสูงสุดของนักร้อง โจมตีเป็นธาตุศักดิ์สิทธิ์'),
]
ids = {m[0] for m in M}
for mon in d['monsters'].values():
    mon['drops'] = [x for x in mon['drops'] if x[0] not in ids]
for mid, name, atk, el, bonus, color, drops, desc in M:
    where = []
    for boss, rate in drops:
        mon = d['monsters'][boss]
        assert mon.get('boss'), boss
        mon['drops'].append([mid, rate])
        where.append(('บอส MVP ' if mon.get('mvp') else 'มินิบอส ') + mon['name'])
    it = {'name': name, 'type': 'weapon', 'atk': atk, 'price': 4000, 'classes': ['singer'], 'color': color, 'weight': 30,
          'slots': 1, 'shape': mid, 'mvp': True, 'bonus': bonus, 'desc': desc + ' (ดรอปจาก' + ', '.join(where) + ')'}
    if el != 'neutral': it['element'] = el
    d['items'][mid] = it
json.dump(d, open(path, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok', len(M))
