"""One Meshy model per monster (the user's own generations, 2026-11-22): replaces the pieces cut from the 77-monster
and 11-mini-boss sheets. Models are reduced with tools/meshy/optimize_single.mjs (normal monsters 8,000 triangles,
mini-bosses 14,000, 1024 px texture; a few thin-seamed ones go through Blender decimate first) and gzipped to
public/models/monsters/<model>.glb.gz. Which file became which model: tools/meshy/singles_2026-11-22.tsv.

Where a new design doesn't match the slot's old look, the monster takes the design's name (card and loot text follow).
Stats, drops, spawns and elements stay.

    python3 tools/meshy_singles.py
"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meshy_monsters import model_colour

ROOT = pathlib.Path(__file__).resolve().parent.parent
# monster key -> (new name, kind, move, look for the card)
RENAME = {
    'bog_witch': ('นักรบกระดูกเน่า', 'โครงกระดูก', 'walk', 'นักรบโครงกระดูกเน่าเปื่อยในชุดเกราะขาด'),
    'lava_crab': ('แมงป่องเพลิง', 'ทะเลทราย', 'walk', 'แมงป่องดำหางส้มลุกเป็นไฟ'),
    'goleling': ('เห็ดหมวกฝัน', 'พืช', 'hop', 'เห็ดหมวกฟ้าลายจุดม่วง ยิ้มกว้างน่ารัก'),
    'gem_golem': ('มัมมี่เพลิง', 'มัมมี่', 'walk', 'มัมมี่ผ้าพันทองเดินถือไม้เท้า'),
    'opera_phantom': ('ผู้พิทักษ์ผลึกน้ำแข็ง', 'อสูร', 'walk', 'อสูรขนขาวเกราะผลึกน้ำแข็งสีฟ้า'),
    'sea_jelly': ('อสูรน้ำแข็ง', 'อสูร', 'walk', 'อสูรตัวใหญ่ปกคลุมด้วยผลึกน้ำแข็งแหลม'),
    'tribal': ('อัศวินมัมมี่ทราย', 'มัมมี่', 'walk', 'มัมมี่นักรบผ้าพันสีทราย'),
    'cave_orc': ('อัศวินกระดูกครูเสด', 'โครงกระดูก', 'walk', 'อัศวินโครงกระดูกถือดาบและโล่กางเขน'),
    'magma_slime': ('แมงป่องทมิฬ', 'ทะเลทราย', 'walk', 'แมงป่องดำก้ามม่วงเรืองแสง'),
    'big_ninja': ('ฟาโรห์ทรายพิโรธ', 'มัมมี่', 'walk', 'ฟาโรห์มัมมี่ทองคำผู้กางแขนสาปแช่ง'),
    'fire_bat': ('หมาป่าเงา', 'อสูร', 'walk', 'หมาป่าขนน้ำเงินเข้มดวงตาเรืองแสง'),
}
SHARE = {'flame_demon': 'ML048'}  # ลูกตาปีก is the same design as ลูกตาบิน


def main():
    p = ROOT / 'src/data/gamedata.json'
    d = json.loads(p.read_text())
    M, I = d['monsters'], d['items']
    by_model = {}
    for line in (ROOT / 'tools/meshy/singles_2026-11-22.tsv').read_text().splitlines():
        _, src, model = line.split('\t')
        by_model[model] = src
    for key, m in M.items():
        model = SHARE.get(key, m.get('model'))
        if model not in by_model:
            continue
        m['model'] = model
        mp = ROOT / f'public/models/monsters/{model}.glb.gz'
        m['color'] = model_colour(mp)
        if model.startswith('MB_'):
            m.pop('tint', None)  # the new sculpts carry their own colours (the old snow queen was an iced re-colour)
        if key in RENAME:
            name, kind, move, look = RENAME[key]
            old = m['name']
            m['name'], m['kind'], m['move'] = name, kind, move
            card = I.get(f'card_{key}')
            if card:
                card['name'] = f'การ์ด{name}'
                rest = card['desc'].split(' · ', 1)
                card['desc'] = look + (' · ' + rest[1] if len(rest) > 1 else '')
            for it, _ in m['drops']:
                if I[it]['type'] == 'loot' and old in I[it].get('desc', ''):
                    I[it]['desc'] = I[it]['desc'].replace(old, name)
            print(f'{key:14s} {model} {old} -> {name}')
        if card := I.get(f'card_{key}'):
            card['color'] = m['color']
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
    old = ROOT / 'public/models/monsters/ML073.glb.gz'
    if old.exists():
        old.unlink()


if __name__ == '__main__':
    main()
