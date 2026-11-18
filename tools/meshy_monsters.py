"""Replaces the 77 normal monsters with the Meshy AI monster set (2026-11-18).

    python3 tools/meshy_monsters.py Music_Land_Master_Monster_Database_From_Image.xlsx

Row N of the sheet (MLM-00N, ordered by level like the old monster gallery) takes over the N-th normal monster's
slot: the monster id, stats, spawns, EXP, card effect and drop table stay (they are balanced and players already own
the cards), while name, level, element, model, size, movement and voice come from the sheet and
tools/meshy_monsters_table.py. The slot's own loot item and card are renamed to fit the new monster.
Writes src/data/gamedata.json and supabase/meshy-monsters.sql (monster levels for monster_defs).
Models: public/models/monsters/ML001..ML077.glb.gz (tools/blender/meshy_split.py + meshy_bake.py).
"""
import gzip, io, json, pathlib, struct, sys
import openpyxl
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meshy_monsters_table import T, ELEMENT

ROOT = pathlib.Path(__file__).resolve().parent.parent
# the old normal monsters in level order (the gallery the sheet was drawn from)
ORDER = '''jelly drop cat chick dog mushy rabbit pigeon buzzer frog bat owl dove rocky monkroose mossy wizard metronome
tuba_toad ninja squidle alien mosquito orc drum_golem glub_evo howler alpaking sand_drop goleling tribal penguin
big_ninja ice_jelly hywirl bluedemon yeti alpaking_evo fire_bat ghost_skull magma_golem demon flame_metronome orc_skull
sea_jelly conch_fish lava_crablet gull surf_frog storm_squid coral_golem crystal_bat echo_slime gem_golem cave_orc
glow_mush wisp shadow_ninja crow_skull rot_alien zombie_yeti bog_witch bone_dino opera_phantom hollow_knight
bell_gargoyle skull_bandsman dark_bishop bell_angel lava_crab magma_slime hell_hound flame_demon obsidian_golem
lava_dragon abyss_wraith abyss_knight'''.split()
assert len(ORDER) == 77


# Which new monsters fit each hunting map: (sheet elements, sheet kinds). The sheet's row order already follows
# level; inside that, monsters are swapped between slots of about the same level so each map keeps its theme
# (sea creatures on the beach, ice ones in the snow, the undead in the dead wood...).
THEME = {
    'field': ({'ปกติ', 'น้ำ', 'ธรรมชาติ', 'ลม', 'ไฟ'}, {'สไลม์', 'สัตว์', 'พืช', 'แมลง'}),
    'forest': ({'ธรรมชาติ', 'ลม', 'ปกติ', 'ดิน', 'มืด'}, {'สัตว์', 'พืช', 'แมลง', 'ปีศาจ'}),
    'marsh': ({'น้ำ', 'พิษ'}, {'ทะเล', 'สัตว์', 'พืช'}),
    'canyon': ({'ดิน', 'ปกติ', 'ไฟ', 'ธรรมชาติ', 'พิษ'}, {'เผ่าพันธุ์', 'ทะเลทราย', 'โกเลม', 'พืช', 'สัตว์'}),
    'snow': ({'น้ำแข็ง', 'น้ำ'}, {'สัตว์', 'โกเลม', 'สไลม์'}),
    'volcano': ({'ไฟ', 'มืด'}, {'ปีศาจ', 'ธาตุ', 'โกเลม', 'อสูร'}),
    'beach': ({'น้ำ', 'แสง'}, {'ทะเล', 'สไลม์'}),
    'cave': ({'ดิน', 'มืด', 'น้ำแข็ง', 'ไฟ'}, {'โกเลม', 'ยักษ์', 'ปีศาจ', 'สไลม์', 'ธาตุ'}),
    'deadwood': ({'มืด', 'พิษ', 'ธรรมชาติ'}, {'ซอมบี้', 'มัมมี่', 'ผี', 'โครงกระดูก', 'พืช'}),
    'ruins': ({'มืด', 'แสง', 'ธรรมชาติ', 'น้ำแข็ง'}, {'โครงกระดูก', 'มนุษย์', 'ผี', 'ธาตุ', 'พืช', 'มังกร'}),
    'inferno': ({'ไฟ', 'ดิน'}, {'มังกร', 'ปีศาจ', 'ทะเลทราย', 'ทะเล'}),
    'abyss': ({'มืด', 'น้ำแข็ง'}, {'ผี', 'มังกร', 'อสูร'}),
}


def assign(rows, M, spawns):
    """Sheet row index -> slot key: close in level, fitting the slot's map."""
    import numpy as np
    from scipy.optimize import linear_sum_assignment
    home = {}
    for s in spawns:
        home.setdefault(s['monster'], s['map'])
    cost = np.zeros((len(rows), len(ORDER)))
    for i, r in enumerate(rows):
        _id, _o, _name, level, kind, el = r[:6]
        for j, key in enumerate(ORDER):
            els, kinds = THEME.get(home.get(key, ''), (set(), set()))
            theme = (0 if el in els else 12) + (0 if kind in kinds else 8)
            cost[i, j] = 4 * abs(level - M[key]['level']) + theme
    ri, ci = linear_sum_assignment(cost)
    return {i: ORDER[j] for i, j in zip(ri, ci)}, home


def model_colour(path):
    """Average colour of a model's baked texture (the drawn stand-in body and the minimap dot use it)."""
    from PIL import Image
    b = gzip.decompress(path.read_bytes())
    jlen = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jlen])
    bin0 = 20 + jlen + 8
    bv = j['bufferViews'][j['images'][0]['bufferView']]
    img = Image.open(io.BytesIO(b[bin0 + bv.get('byteOffset', 0): bin0 + bv.get('byteOffset', 0) + bv['byteLength']])).convert('RGB')
    px = [p for p in img.resize((32, 32)).getdata() if sum(p) > 60]  # skip the unused black of the atlas
    r, g, bl = (sum(p[i] for p in px) // max(1, len(px)) for i in range(3))
    return f'#{r:02x}{g:02x}{bl:02x}'


def main(xlsx):
    rows = [r for r in openpyxl.load_workbook(xlsx, data_only=True)['Monster_Master'].iter_rows(min_row=2, values_only=True) if r[0]]
    assert len(rows) == 77, len(rows)
    p = ROOT / 'src/data/gamedata.json'
    d = json.loads(p.read_text())
    M, I = d['monsters'], d['items']
    slot, home = assign(rows, M, d['spawns'])
    sql = ['-- Music Land: Meshy monster set (2026-11-18). Monster levels from the master sheet; run once in the Supabase SQL editor.']
    for n, (mid, _o, name, level, mtype, el, look, rarity) in enumerate(rows, 1):
        key = slot[n - 1]
        m = M[key]
        loot, size, move, voice, glow = T[n]
        old_name = m['name']
        m['name'] = name
        old_level = m['level']
        if m['level'] != level:
            sql.append(f"update public.monster_defs set level = {level} where id = '{key}';")
        m['level'] = level
        m['element'] = [ELEMENT[el], (m.get('element') or ['neutral', 1])[1]]
        m['model'] = f'ML{n:03d}'
        m['size'] = size
        m['move'] = move
        m['voice'] = voice
        m['kind'] = mtype
        m['rarity'] = rarity
        m['shape'] = 'jelly'  # the drawn stand-in while the model loads: a plain blob in the model's colour
        for k in ('modelScale', 'tint'):
            m.pop(k, None)
        if glow:
            m['glow'] = glow
        else:
            m.pop('glow', None)
        mp = ROOT / f'public/models/monsters/ML{n:03d}.glb.gz'
        if mp.exists():
            m['color'] = model_colour(mp)
        # the slot's own loot (dropped only by this monster) and its card get the new monster's name
        users = {it: [k for k, v in M.items() if any(x == it for x, _ in v['drops'])] for it, _ in m['drops']}
        own = [it for it, _ in m['drops'] if I[it]['type'] == 'loot' and users[it] == [key]]
        if own:
            I[own[0]]['name'] = loot
            I[own[0]]['desc'] = f'ของที่ได้จาก{name} ขายให้ร้านค้าได้'
        card = I.get(f'card_{key}')
        if card:
            card['name'] = f'การ์ด{name}'
            rest = card['desc'].split(' · ', 1)
            card['desc'] = look + (' · ' + rest[1] if len(rest) > 1 else '')
            card['color'] = m['color']
        print(f'{n:2d} {home.get(key, "-"):8s} {key:16s} {old_name} -> {name} ({mtype}/{el}) Lv{level} slot Lv{old_level}')
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
    (ROOT / 'supabase/meshy-monsters.sql').write_text('\n'.join(sql) + '\n')
    print('sql lines', len(sql) - 1)


if __name__ == '__main__':
    main(sys.argv[1])
