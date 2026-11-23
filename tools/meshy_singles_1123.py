"""Second batch of single Meshy models (the user's generations, 2026-11-23): the 28 normal monsters that still wore a
piece of the old 77-monster sheet get a model of their own. The design rarely matches the slot's old look (a penguin
became a bunny swordsman), so the monster takes the design's name, kind, gait and voice; its card and its own loot
item follow. Stats, drops, spawns and elements stay.

Models are reduced with tools/meshy/optimize_single.mjs (8,000 triangles, 1024 px texture; the ones meshopt can't
bring down go through tools/meshy/decimate_blender.py first) and gzipped over public/models/monsters/<model>.glb.gz.
Which file became which model: tools/meshy/singles_2026-11-23.tsv.

    python3 tools/meshy_singles_1123.py
"""
import json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from meshy_monsters import model_colour

ROOT = pathlib.Path(__file__).resolve().parent.parent
# key -> (name, kind, move, voice, card look, loot name, modelScale or None)
# modelScale shrinks a long, low body (scaled by height it would be several tiles long)
NEW = {
    'bat': ('แมงมุมอเมทิสต์', 'แมลง', 'walk', 'crunch', 'แมงมุมดำหลังผลึกอเมทิสต์สีม่วงเรืองแสง', 'ผลึกหลังแมงมุม', 0.8),
    'dove': ('ตั๊กแตนมรกต', 'แมลง', 'walk', 'buzz', 'ตั๊กแตนตำข้าวสีเขียวมรกต ขาหน้าเป็นเคียว', 'ขาเคียวตั๊กแตน', None),
    'rocky': ('ด้วงขุดดิน', 'แมลง', 'walk', 'crunch', 'ด้วงกระดองน้ำตาลตัวเตี้ย ขุดดินเก่ง', 'กระดองด้วงดิน', 0.6),
    'monkroose': ('หมาป่าดุร้าย', 'สัตว์', 'walk', 'growl', 'หมาป่าขนดำยุ่ง เขี้ยวยาว ย่อตัวพร้อมขย้ำ', 'เขี้ยวหมาป่าดุร้าย', 0.85),
    'mossy': ('ดอกตูมนักสู้', 'พืช', 'hop', 'squish', 'ต้นไม้ดอกตูมสีเขียว อ้าปากมีฟัน กางแขนใบไม้', 'กลีบดอกตูม', None),
    'ninja': ('ก็อบลินนักธนู', 'เผ่าพันธุ์', 'walk', 'squeak', 'ก็อบลินในชุดหนัง สะพายธนูและกระบอกลูกศร', 'ลูกศรก็อบลิน', None),
    'owl': ('กระต่ายนักดาบ', 'สัตว์', 'walk', 'squeak', 'กระต่ายขาวเทาแบกดาบใหญ่ในชุดหนัง', 'ขนกระต่ายนักดาบ', None),
    'wizard': ('เด็กซอมบี้', 'ซอมบี้', 'walk', 'wail', 'เด็กซอมบี้ผมน้ำตาล ตาเหลือง ผิวเปื่อย', 'ผ้าขาดเด็กซอมบี้', None),
    'metronome': ('ด้วงคลานทราย', 'แมลง', 'walk', 'crunch', 'ด้วงขายาวหนวดยาว คลานบนหาดทราย', 'หนวดด้วงทราย', 0.8),
    'tuba_toad': ('หีบสมบัติมิมิค', 'ปีศาจ', 'hop', 'crunch', 'หีบสมบัติไม้รัดเหล็กที่จริงคือปีศาจ', 'กุญแจหีบมิมิค', None),
    'alien': ('แมงมุมกระดองแดง', 'แมลง', 'walk', 'crunch', 'แมงมุมกระดองดำลายแดง ขาแหลมคม', 'กระดองแดง', 0.8),
    'mosquito': ('รูปปั้นนักบวชคลุมหน้า', 'ผี', 'plant', 'wail', 'รูปปั้นหินนักบวชคลุมผ้าถือคัมภีร์บนแท่น', 'เศษหินรูปปั้น', None),
    'squidle': ('ก็อบลินนักปรุงพิษ', 'เผ่าพันธุ์', 'walk', 'squeak', 'ก็อบลินสวมหมวกเหล็ก ถือไม้เท้ากะโหลกและขวดยาพิษ', 'ขวดยาพิษก็อบลิน', None),
    'glub_evo': ('หมาป่าเทา', 'สัตว์', 'walk', 'growl', 'หมาป่าขนเทาเข้ม ย่างเดินล่าเหยื่อ', 'ขนหมาป่าเทา', 0.85),
    'penguin': ('ทหารกระดูกโล่เหล็ก', 'โครงกระดูก', 'walk', 'rattle', 'โครงกระดูกใส่หมวกเหล็ก ถือขวานและโล่ไม้', 'กระดูกทหาร', None),
    'howler': ('ขุนศึกออร์คเขี้ยวเหล็ก', 'เผ่าพันธุ์', 'walk', 'roar', 'ออร์คเกราะหนังถือขวานและโล่กลม', 'เขี้ยวออร์ค', None),
    'conch_fish': ('แมงมุมใบมีด', 'แมลง', 'walk', 'crunch', 'แมงมุมขายาวเรียวคมดั่งใบมีด', 'ขาใบมีด', None),
    'surf_frog': ('อสูรหนามกรงเล็บ', 'อสูร', 'walk', 'growl', 'อสูรสี่ขาผิวขรุขระมีหนามทั่วตัว', 'หนามอสูร', 0.85),
    'storm_squid': ('ผู้พิทักษ์พฤกษา', 'พืช', 'walk', 'crunch', 'ยักษ์ต้นไม้เปลือกไม้หนา มีมอสและใบไม้ขึ้นบนหัว', 'เปลือกไม้ผู้พิทักษ์', None),
    'crystal_bat': ('มนุษย์หมาป่าขาว', 'อสูร', 'walk', 'growl', 'มนุษย์หมาป่าขนขาวผอมสูง กรงเล็บยาว', 'ขนหมาป่าขาว', None),
    'echo_slime': ('มนุษย์หมาป่าจันทร์ดำ', 'อสูร', 'walk', 'growl', 'มนุษย์หมาป่าขนดำยุ่ง ออกล่าใต้แสงจันทร์', 'เล็บหมาป่าจันทร์ดำ', None),
    'bone_dino': ('ยักษ์ทุบกระดูกแดนร้าง', 'อสูร', 'walk', 'roar', 'ยักษ์เกราะเหล็กดำประดับกระดูก ตัวหนาใหญ่', 'เกราะกระดูกแดนร้าง', None),
    'zombie_yeti': ('ขุนพลน้ำแข็ง', 'อสูร', 'walk', 'roar', 'ยักษ์ผิวฟ้าในเกราะน้ำแข็งและขนสัตว์', 'เกราะน้ำแข็งขุนพล', None),
    'hollow_knight': ('กูลป่าตาย', 'ผี', 'walk', 'wail', 'กูลผิวเทาซีดตัวผอม ย่อตัวคืบคลานในป่าตาย', 'กรงเล็บกูล', None),
    'bell_angel': ('ยักษ์ผลึกน้ำแข็ง', 'ธาตุ', 'walk', 'crunch', 'ยักษ์ร่างผลึกน้ำแข็งสีฟ้า แกนพลังเรืองแสงกลางอก', 'ผลึกน้ำแข็งยักษ์', None),
    'hell_hound': ('จอมทัพออร์คมงกุฎเหล็ก', 'เผ่าพันธุ์', 'walk', 'roar', 'ออร์คในเกราะหนามและเสื้อคลุมขนสัตว์ ถือขวานใหญ่', 'มงกุฎเหล็กออร์ค', None),
    'obsidian_golem': ('มังกรปีกพิฆาต', 'มังกร', 'fly', 'roar', 'มังกรปีกค้างคาวสีน้ำตาลเข้ม หางยาว', 'เกล็ดมังกรพิฆาต', None),
    'lava_dragon': ('ขุนศึกออร์คหุ้มเกราะ', 'เผ่าพันธุ์', 'walk', 'roar', 'ออร์คหุ้มเกราะเหล็กทั้งตัว ถือขวานด้ามยาว', 'เกราะเหล็กออร์ค', None),
}


def main():
    p = ROOT / 'src/data/gamedata.json'
    d = json.loads(p.read_text())
    M, I = d['monsters'], d['items']
    for key, (name, kind, move, voice, look, loot, scale) in NEW.items():
        m = M[key]
        mp = ROOT / f'public/models/monsters/{m["model"]}.glb.gz'
        old = m['name']
        m.update(name=name, kind=kind, move=move, voice=voice, color=model_colour(mp))
        if scale:
            m['modelScale'] = scale
        else:
            m.pop('modelScale', None)
        card = I.get(f'card_{key}')
        if card:
            card['name'] = f'การ์ด{name}'
            rest = card['desc'].split(' · ', 1)
            card['desc'] = look + (' · ' + rest[1] if len(rest) > 1 else '')
            card['color'] = m['color']
        for it, _ in m['drops']:
            if I[it]['type'] == 'loot' and old in I[it].get('desc', ''):
                I[it]['name'] = loot
                I[it]['desc'] = I[it]['desc'].replace(old, name)
        print(f'{key:14s} {m["model"]} {old} -> {name}')
    p.write_text(json.dumps(d, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
