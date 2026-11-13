"""อเวจี (2026-11-12): the old 11 bosses become mini bosses, the MVP boss ยมทูตเคียวโลหิต (Lv 100) with skills,
two new monsters for the map, new card + hat + scythe-themed loot. Idempotent."""
import json, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / 'src/data/gamedata.json'
d = json.loads(p.read_text())
M, I, S = d['monsters'], d['items'], d['spawns']

# old bosses -> mini bosses (texts only; boss:true keeps their mechanics)
for k, it in I.items():
    if 'desc' in it and 'abyss' not in k and k != 'hat_reaper_hood':
        it['desc'] = it['desc'].replace('ดรอปจากบอส MVP', 'ดรอปจากมินิบอส').replace('บอส MVP', 'มินิบอส').replace('(บอส)', '(มินิบอส)')

M['abyss_wraith'] = {
    'name': 'วิญญาณโซ่ตรวน', 'level': 95, 'hp': 19800, 'atk': 430, 'def': 66, 'exp': 4300, 'jobExp': 3200,
    'zeny': [200, 520], 'speed': 80, 'aggressive': True, 'color': '#8a3cff', 'size': 1.3,
    'model': 'Flying_Ghost_Skull', 'tint': '#5a1a8a', 'glow': '#b04dff', 'element': ['ghost', 3],
    'drops': [['soul_chain_link', 0.5], ['honey_lemon', 0.1], ['pure_tuning_ore', 0.06], ['gold_velvet', 0.06], ['crystal_earring', 0.01], ['card_abyss_wraith', 0.004]],
}
M['abyss_knight'] = {
    'name': 'อัศวินเคียวเงา', 'level': 97, 'hp': 23500, 'atk': 470, 'def': 74, 'exp': 4900, 'jobExp': 3700,
    'zeny': [240, 600], 'speed': 75, 'aggressive': True, 'color': '#3a0f1e', 'size': 1.5,
    'model': 'Big_Ninja', 'tint': '#4a1028', 'glow': '#ff2a4a', 'element': ['shadow', 3],
    'drops': [['blood_scythe_shard', 0.5], ['honey_lemon', 0.1], ['pure_tuning_ore', 0.06], ['gold_velvet', 0.06], ['card_abyss_knight', 0.004]],
}
M['abyss_reaper'] = {
    'name': 'ยมทูตเคียวโลหิต', 'level': 100, 'hp': 520000, 'atk': 820, 'def': 110, 'exp': 160000, 'jobExp': 120000,
    'zeny': [8000, 20000], 'speed': 60, 'aggressive': True, 'color': '#7a1030', 'size': 2.2, 'glow': '#b04dff',
    'element': ['shadow', 4], 'boss': True, 'mvp': True,
    'skills': ['scythe_sweep', 'soul_chain', 'hellfire', 'judgement'],
    'drops': [['blood_scythe_shard', 1.0], ['soul_chain_link', 1.0], ['card_abyss_reaper', 0.03], ['hat_reaper_hood', 0.04],
              ['pure_tuning_ore', 0.3], ['gold_velvet', 0.3], ['gtr_spike', 0.1], ['bss_sire5', 0.1], ['outfit_shadow_battle', 0.08], ['crystal_earring', 0.1]],
}
I['soul_chain_link'] = {'name': 'ห่วงโซ่วิญญาณ', 'type': 'loot', 'price': 900, 'color': '#8a3cff', 'weight': 2,
    'desc': 'ห่วงโซ่เย็นเฉียบที่ยังส่งเสียงกรุ๊งกริ๊งเป็นจังหวะ หลุดมาจากวิญญาณในอเวจี (ขายได้)'}
I['blood_scythe_shard'] = {'name': 'เศษใบเคียวโลหิต', 'type': 'loot', 'price': 1200, 'color': '#b0102a', 'weight': 2,
    'desc': 'เศษใบเคียวสีเลือด คมจนตัดเสียงได้ จากอเวจี (ขายได้)'}
I['card_abyss_wraith'] = {'name': 'การ์ดวิญญาณโซ่ตรวน', 'type': 'card', 'price': 3000, 'color': '#8a3cff', 'weight': 1,
    'desc': 'โซ่ที่ตรวนวิญญาณไว้ไม่ยอมปล่อย · เสียบได้ในช่องการ์ดของชุด เสียบแล้วถอดไม่ได้', 'card': {'slot': 'armor', 'bonus': {'vit': 4, 'maxHp': 600, 'pvpDefPct': 4}}}
I['card_abyss_knight'] = {'name': 'การ์ดอัศวินเคียวเงา', 'type': 'card', 'price': 3000, 'color': '#4a1028', 'weight': 1,
    'desc': 'เงาที่ฟันไม่เคยพลาด · เสียบได้ในช่องการ์ดของอาวุธ เสียบแล้วถอดไม่ได้', 'card': {'slot': 'weapon', 'bonus': {'dex': 3, 'atkPct': 6}}}
I['card_abyss_reaper'] = {'name': 'การ์ดยมทูตเคียวโลหิต', 'type': 'card', 'price': 8000, 'color': '#7a1030', 'weight': 1,
    'desc': 'ใบเคียวที่เกี่ยววิญญาณเป็นจังหวะเพลงสุดท้าย (บอส MVP แห่งอเวจี) · เสียบได้ในช่องการ์ดของอาวุธ เสียบแล้วถอดไม่ได้',
    'card': {'slot': 'weapon', 'bonus': {'str': 5, 'dex': 5, 'atkPct': 12, 'pvpAtkPct': 12}}}
I['hat_reaper_hood'] = {'name': 'เขายมทูตแห่งอเวจี', 'type': 'head', 'def': 14, 'price': 8000, 'color': '#7a1030', 'weight': 20, 'slots': 2,
    'bonus': {'str': 7, 'dex': 7, 'maxHp': 400, 'pvpDefPct': 6}, 'hat': {'kind': 'horns', 'c': ['#2a0a14', '#b04dff'], 'v': 'big'}, 'mvp': True,
    'desc': 'เขาโค้งสีดำของยมทูต คาดด้วยแถบไฟม่วง หมวกที่หายากที่สุดในโลก (ดรอปจากบอส MVP ยมทูตเคียวโลหิต Lv 100 แห่งอเวจี, ไม่มีขายในร้าน)'}

S[:] = [s for s in S if s['map'] != 'abyss']
S += [
    {'map': 'abyss', 'monster': 'abyss_wraith', 'count': 14, 'area': [6, 6, 36, 36]},
    {'map': 'abyss', 'monster': 'abyss_wraith', 'count': 10, 'area': [48, 48, 78, 78]},
    {'map': 'abyss', 'monster': 'abyss_knight', 'count': 14, 'area': [48, 6, 78, 36]},
    {'map': 'abyss', 'monster': 'abyss_knight', 'count': 10, 'area': [6, 48, 36, 78]},
    {'map': 'abyss', 'monster': 'flame_demon', 'count': 6, 'area': [20, 30, 64, 54]},
    {'map': 'abyss', 'monster': 'abyss_reaper', 'count': 1, 'area': [38, 38, 46, 46], 'respawnSec': 3600},
]
p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
print('ok', sum(1 for m in M.values() if m.get('boss')))
