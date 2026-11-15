"""2026-11-15: the DJ (ดีเจ), a class-2 magic class: 8 skills from the user's xlsx (skill_defs_rows), DJ controllers as
weapons (held like the keyboardist's keyboard), plus one new keyboardist skill (party SP regen).
Idempotent: re-running replaces the same class/items/skills/drops.
Usage: python3 tools/add_dj_class.py src/data/gamedata.json"""
import json, sys

path = sys.argv[1]
d = json.load(open(path, encoding='utf8'))

# ------------------------------------------------------------------ the class
d['classes']['dj'] = {
    'name': 'ดีเจ',
    'desc': 'สายเวทย์โจมตี: ร่ายเวทย์วงกว้าง 9 ช่อง สายฟ้า อุกกาบาต หนามดิน พายุหิมะ กำแพงไฟ และบูธกันการโจมตีประชิด',
    'color': '#8f7dff',
    'hpMod': 0.85,
    'spMod': 1.5,
    'range': 5.5,
    'attackType': 'magic',
    'projectile': 'chord',
    'startWeapon': 'mini_dj',
    'baseStats': {'str': 1, 'agi': 4, 'vit': 3, 'int': 10, 'dex': 7, 'luk': 3},
    'fxColor': '#8f7dff',
}

# ------------------------------------------------------------------ weapons: DJ controllers (no makers' names)
W = [
    # id, name, atk, matk, price, slots, colour, shape, element, bonus, mvp, [(monster, rate)], desc
    ('mini_dj', 'ดีเจคอนโทรลเลอร์จิ๋ว', 6, 15, 60, 1, '#2b2d33', 'dj_mini', None, None, False, [],
     'ดีเจคอนโทรลเลอร์ตัวเล็ก 2 แผ่นหมุน พกพาง่าย ใช้ร่ายเวทเสียงได้'),
    ('dj_controller', 'ดีเจคอนโทรลเลอร์ 2 แทร็ก', 13, 46, 750, 2, '#1c1d22', 'dj_basic', None, None, False,
     [('king_jelly', 0.15), ('elder_tree', 0.12), ('metal_lord', 0.3)],
     'คอนโทรลเลอร์ 2 แทร็กพร้อมมิกเซอร์กลาง แผ่นหมุนใหญ่ จอสีบอกจังหวะ พลังเวทสูง'),
    ('dj_neon', 'ดีเจคอนโทรลเลอร์นีออน "ไนท์คลับ"', 24, 80, 4000, 1, '#14141a', 'dj_neon', 'wind', {'int': 3, 'matkPct': 5, 'pvpAtkPct': 5}, True,
     [('kraken', 0.08), ('crystal_king', 0.08)],
     'คอนโทรลเลอร์สีดำไฟนีออนฟ้าชมพูรอบแผ่นหมุน เปิดเพลงทีไรฟลอร์ระเบิด โจมตีเป็นธาตุลม'),
    ('dj_grand', 'ดีเจบูธใหญ่ "เทศกาลเสียง"', 32, 104, 4000, 1, '#f2f0ea', 'dj_grand', 'fire', {'int': 5, 'matkPct': 8, 'pvpAtkPct': 5}, True,
     [('phantom_king', 0.08), ('inferno_lord', 0.08), ('abyss_reaper', 0.1)],
     'ชุดดีเจ 4 แทร็กตัวใหญ่สีขาวขลิบทอง จอกลางกว้าง ใช้เปิดเพลงบนเวทีเทศกาล โจมตีเป็นธาตุไฟ'),
]
ids = {w[0] for w in W}
for mon in d['monsters'].values():
    mon['drops'] = [x for x in mon['drops'] if x[0] not in ids]
for wid, name, atk, matk, price, slots, color, shape, el, bonus, mvp, drops, desc in W:
    where = []
    for boss, rate in drops:
        mon = d['monsters'][boss]
        mon['drops'].append([wid, rate])
        where.append(('บอส MVP ' if mon.get('mvp') else 'มินิบอส ' if mon.get('boss') else '') + mon['name'])
    it = {'name': name, 'type': 'weapon', 'atk': atk, 'matk': matk, 'price': price, 'classes': ['dj'], 'color': color,
          'weight': 60 if not mvp else 70, 'slots': slots, 'shape': shape,
          'desc': desc + (' (ดรอปจาก' + ', '.join(where) + ')' if mvp else '')}
    if el:
        it['element'] = el
    if bonus:
        it['bonus'] = bonus
    if mvp:
        it['mvp'] = True
    d['items'][wid] = it
# the cheap two sit in the weapon shop next to the keyboards
ws = [x for x in d['weaponShop'] if x not in ids]
at = ws.index('synth') + 1
d['weaponShop'] = ws[:at] + ['mini_dj', 'dj_controller'] + ws[at:]

# ------------------------------------------------------------------ DJ skills (the user's xlsx, 2026-11-15)
CAST = 'ร่ายเวทย์ 3 วินาที (DEX ยิ่งสูงยิ่งร่ายไว ขยับ = ยกเลิก)'
HITS = 'ตกลงมา 1 ครั้งต่อเลเวลสกิล (Lv 10 = 10 ครั้ง) ความแรงคิดจาก M.Atk (INT) คูลดาวน์ 3 วินาที'
AOE = dict(cls='dj', type='aoe', magic=True, maxLevel=10, sp=[18, 4], range=9, cooldown=3000, power=[70, 3],
           radius=2, square=True, ground=True, wavesPerLv=True, waveMs=300, castMs=3000, castDex=True)
S = {
    'dj_edm': dict(AOE, name='EDM', icon='⚡', element='wind', fx='dj_lightning',
                   desc=f'{CAST} กดสกิลแล้วคลิกที่พื้น (ไม่ต้องมีเป้าหมาย) วางวงแหวนเวทย์ 16 ช่อง (4x4) แล้วสายฟ้าธาตุลมฟาดใส่มอนสเตอร์ทุกตัวในวง {HITS}'),
    'dj_cha3': dict(AOE, name='3 ช่า', icon='☄️', element='fire', fx='dj_meteor', status={'kind': 'stun', 'chance': 50, 'sec': 3},
                    desc=f'{CAST} กดสกิลแล้วคลิกที่พื้น (ไม่ต้องมีเป้าหมาย) วางวงแหวนเวทย์ 16 ช่อง (4x4) เรียกฝูงอุกกาบาตยักษ์ธาตุไฟ {HITS} มอนสเตอร์มีโอกาสมึนงง 50% นาน 3 วินาที (บอสไม่ติด)'),
    'dj_joja': dict(AOE, name='โจ๊ะๆ', icon='🪨', element='earth', fx='dj_spikes', status={'kind': 'stun', 'chance': 50, 'sec': 3},
                    desc=f'{CAST} กดสกิลแล้วคลิกที่พื้น (ไม่ต้องมีเป้าหมาย) วางวงแหวนเวทย์ 16 ช่อง (4x4) หนามแหลมธาตุดินพุ่งขึ้นจากพื้น {HITS} มอนสเตอร์มีโอกาสมึนงง 50% นาน 3 วินาที (บอสไม่ติด)'),
    'dj_chill': dict(AOE, name='เบาๆสบายๆ', icon='❄️', element='water', fx='dj_blizzard', status={'kind': 'freeze', 'chance': 80, 'sec': 5},
                     desc=f'{CAST} กดสกิลแล้วคลิกที่พื้น (ไม่ต้องมีเป้าหมาย) วางวงแหวนเวทย์ 16 ช่อง (4x4) เรียกพายุหิมะธาตุน้ำ {HITS} มอนสเตอร์มีโอกาสแช่แข็ง 80% นาน 5 วินาที (บอสไม่ติด)'),
    'dj_love_song': dict(cls='dj', name='เพลงรัก', icon='💗', type='passive', maxLevel=10, passive={'spRegenPct': 5},
                         desc='สกิลติดตัว: SP ฟื้นเร็วขึ้น 5% ต่อเลเวล (Lv 10 = +50%) และฟื้นส่วนที่เพิ่มขึ้นระหว่างต่อสู้ด้วย'),
    'dj_parade': dict(cls='dj', name='รถแห่', icon='🔥', type='wall', ground=True, magic=True, maxLevel=10, sp=[10, 2], range=7, cooldown=2000,
                      power=[50, 5], element='fire', knockback=1, castMs=1000, castDex=True, fx='dj_firewall',
                      wall={'length': 5, 'secPerLv': 2},
                      desc='ร่าย 1 วินาที กดเลือกจุดบนพื้น (ไม่ต้องมีเป้าหมาย) สร้างกำแพงไฟ 5 แท่งขวางตรงจุดนั้น ถ้าไกลเกินระยะจะวางที่ขอบระยะ มอนสเตอร์ที่เดินชนกำแพงโดนไฟ (คิดจาก M.Atk) และกระเด็นถอยหลัง 1 ช่อง กำแพงอยู่ได้ 2 วินาทีต่อเลเวล (Lv 10 = 20 วินาที) คูลดาวน์ 2 วินาที'),
    'dj_serenade': dict(cls='dj', name='เปิดเพลงให้สาว', icon='🎆', type='single', magic=True, maxLevel=10, sp=[12, 3], range=9,
                        cooldown=5000, power=[100, 0], element='fire', bolts=True, ground=True, waveMs=180, castMs=3000, castDex=True, fx='dj_firebolt',
                        desc=f'{CAST} คลิกที่พื้นใกล้มอนสเตอร์ตัวไหนก็ได้ (ไม่ต้องมีเป้าหมาย) แท่งไฟธาตุไฟตกลงมาจากฟ้าใส่มอนสเตอร์ตัวที่อยู่ใกล้จุดนั้นที่สุด 1 ตัว 1 แท่งต่อเลเวลสกิล (Lv 10 = 10 แท่ง) แท่งละ 100% M.Atk (INT) คูลดาวน์ 5 วินาที'),
    'dj_booth': dict(cls='dj', name='บูทดีเจ', icon='🎧', type='ward', ground=True, maxLevel=10, sp=[15, 3], range=7, cooldown=2000,
                     castMs=1000, castDex=True, fx='dj_booth', ward={'blocksPerLv': 2, 'secPerLv': 5, 'radius': 0.75},
                     desc='ร่าย 1 วินาที กดเลือกจุดบนพื้น (ไม่ต้องมีเป้าหมาย ไกลเกินระยะจะวางที่ขอบระยะ) วางวงแหวนเวทย์ 1 ช่อง ใครยืนในวงจะไม่โดนการโจมตีกายภาพระยะประชิด กันได้ 2 ครั้งต่อเลเวล (Lv 10 = 20 ครั้ง) อยู่ได้ 5 วินาทีต่อเลเวล หรือจนกันครบ'),
    # keyboardist: one more party buff, SP comes back faster (the user's ask, 2026-11-15)
    'calm_melody': dict(cls='keyboardist', name='ทำนองผ่อนคลาย', icon='💙', type='buff_party', maxLevel=10, sp=[20, 3], cooldown=1000,
                        buff={'spRegenPct': 10, 'durationSec': 180}, fx='calm', castMs=1000, castDex=True,
                        desc='SP ฟื้นเร็วขึ้น 10% ต่อเลเวล (Lv 10 = เร็วขึ้น 2 เท่า และฟื้นส่วนที่เพิ่มระหว่างต่อสู้ด้วย) ให้ตัวเองและเพื่อนในปาร์ตี้ทุกคนในแผนที่พร้อมกัน นาน 180 วินาที (3 นาที)'),
}
for k in [k for k, s in d['skills'].items() if s['cls'] == 'dj']:
    del d['skills'][k]
# the keyboardist's new buff goes in after โซโล่, the DJ's skills at the end
sk = {}
for k, v in d['skills'].items():
    if k == 'calm_melody':
        continue
    sk[k] = v
    if k == 'solo':
        sk['calm_melody'] = S['calm_melody']
for k, v in S.items():
    if v['cls'] == 'dj':
        sk[k] = v
d['skills'] = sk

out = json.dumps(d, ensure_ascii=False, indent=1)
open(path, 'w', encoding='utf8').write(out)
print('ok', len(W), 'weapons', len(S), 'skills')
