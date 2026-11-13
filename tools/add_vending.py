"""Player shops + Teen shop passives (2026-11-13). Idempotent.
- open_shop (every class, cls 'all'): sell your own items from a stall over your head, 2 + Lv kinds of item.
- haggle (Teen passive): ป้ามะลิ's item shop list costs 2.5% less per level.
- sweet_talk (Teen passive): items sold to any NPC shop fetch 2.5% more per level."""
import json, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / 'src/data/gamedata.json'
d = json.loads(p.read_text())
S = d['skills']

S['open_shop'] = {
    'cls': 'all', 'name': 'เปิดแผงขายของ', 'icon': '🏪',
    'desc': 'ตั้งร้านขายของจากกระเป๋าให้ผู้เล่นคนอื่นมาซื้อ ป้ายร้านจะลอยเหนือหัว วางของได้ 2 + เลเวลสกิล ชนิด (Lv 10 = 12 ชนิด) '
            'เปิดได้เฉพาะในเมือง ระหว่างเปิดร้านจะนั่งอยู่กับที่ ถ้าเดิน โจมตี หรือใช้สกิล ร้านจะปิด (ทุกอาชีพเรียนได้ เปลี่ยนอาชีพแล้วสกิลยังอยู่)',
    'type': 'vend', 'maxLevel': 10,
}
S['haggle'] = {
    'cls': 'teen', 'name': 'ต่อราคาเก่ง', 'icon': '🏷️',
    'desc': '(ติดตัว) ซื้อของในร้านของใช้ป้ามะลิ (และร้านของใช้ในเมืองอื่นที่ขายของชุดเดียวกัน) ถูกลง 2.5% ต่อเลเวล (Lv 10 = ลด 25%)',
    'type': 'passive', 'maxLevel': 10, 'passive': {'npcBuyPct': 2.5},
}
S['sweet_talk'] = {
    'cls': 'teen', 'name': 'ปากหวานขายเก่ง', 'icon': '💰',
    'desc': '(ติดตัว) ขายของให้ร้าน NPC ได้ราคาแพงขึ้น 2.5% ต่อเลเวล (Lv 10 = แพงขึ้น 25%)',
    'type': 'passive', 'maxLevel': 10, 'passive': {'npcSellPct': 2.5},
}
p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
print('ok', sum(1 for s in S.values() if s['cls'] == 'teen'), 'teen skills')
