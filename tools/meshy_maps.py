"""2026-11-18: put the Meshy monsters on maps that fit them (sea creatures on the beach and the new cove, the
undead in the ruined towns, ice on the snow peak, fire on the volcano...). Rewrites the normal-monster spawns of
the hunting maps in src/data/gamedata.json; town/arena spawns and the inferno/abyss/field ones stay as they are.
Run: python3 tools/meshy_maps.py"""
import json, math, pathlib

P = pathlib.Path(__file__).resolve().parent.parent / 'src/data/gamedata.json'

# map -> (monster ids, boss id or None, spawn box the monsters may use)
PLAN = {
    'forest':    (['bat', 'dove', 'rocky', 'mossy', 'ninja', 'sand_drop', 'goleling'], 'elder_tree', (8, 6, 76, 76)),
    'beach':     (['owl', 'wizard', 'metronome', 'tuba_toad', 'alien', 'mosquito', 'orc', 'squidle', 'glub_evo', 'penguin'], 'marsh_queen', (6, 6, 56, 76)),
    'canyon':    (['monkroose', 'drum_golem', 'alpaking', 'tribal', 'big_ninja'], 'rock_dragon', (8, 6, 76, 76)),
    'ghosttown': (['ice_jelly', 'hywirl', 'yeti', 'bluedemon', 'alpaking_evo', 'ghost_skull', 'fire_bat'], None, (8, 8, 76, 76)),
    'snow':      (['magma_golem', 'demon', 'orc_skull', 'sea_jelly'], 'snow_queen', (8, 6, 76, 76)),
    'volcano':   (['howler', 'flame_metronome', 'conch_fish', 'lava_crablet', 'gull'], 'metal_lord', (6, 6, 76, 78)),
    'marsh':     (['surf_frog', 'storm_squid', 'coral_golem', 'crystal_bat'], 'kraken', (8, 6, 76, 76)),
    'cave':      (['echo_slime', 'gem_golem', 'cave_orc', 'bone_dino'], 'crystal_king', (8, 6, 76, 76)),
    'ruins':     (['glow_mush', 'wisp', 'shadow_ninja', 'crow_skull', 'rot_alien', 'bog_witch'], 'banshee_queen', (8, 8, 76, 76)),
    'deadwood':  (['zombie_yeti', 'opera_phantom', 'hollow_knight', 'bell_gargoyle'], 'phantom_king', (8, 6, 76, 76)),
    'cove':      (['skull_bandsman', 'dark_bishop', 'bell_angel'], None, (6, 8, 56, 66)),
}
# where each map's boss walks (the beach's south-east corner is sea)
BOSS_AREA = {'beach': [36, 60, 50, 74], 'ruins': [62, 62, 76, 76]}
# about 84 monsters a map, like before (7 kinds x 12)
TOTAL = 84


def boxes(n, box):
    """n spawn areas tiling the box in a near-square grid."""
    x0, y0, x1, y1 = box
    cols = math.ceil(math.sqrt(n * (x1 - x0) / (y1 - y0)))
    rows = math.ceil(n / cols)
    out = []
    for i in range(n):
        r, c = divmod(i, cols)
        w = (x1 - x0) / cols
        h = (y1 - y0) / rows
        out.append([round(x0 + c * w), round(y0 + r * h), round(x0 + (c + 1) * w) - 2, round(y0 + (r + 1) * h) - 2])
    return out


def main():
    d = json.loads(P.read_text())
    old = d['spawns']
    boss_spawn = {s['monster']: s for s in old if s.get('respawnSec')}
    moved = {m for ms, _, _ in PLAN.values() for m in ms} | {b for _, b, _ in PLAN.values() if b}
    assert len(moved) == sum(len(ms) for ms, _, _ in PLAN.values()) + sum(1 for _, b, _ in PLAN.values() if b), 'a monster is on two maps'
    keep = [s for s in old if s['map'] not in PLAN and s['monster'] not in moved]
    new = []
    for mp, (ms, boss, box) in PLAN.items():
        count = max(12, round(TOTAL / len(ms)))
        for mon, area in zip(ms, boxes(len(ms), box)):
            assert mon in d['monsters'], mon
            new.append({'map': mp, 'monster': mon, 'count': count, 'area': area})
        if boss:
            b = dict(boss_spawn[boss])
            b['map'] = mp
            b['area'] = BOSS_AREA.get(mp, [66, 66, 78, 78])
            new.append(b)
    d['spawns'] = keep + new
    P.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
    for mp, (ms, boss, _) in PLAN.items():
        lv = [d['monsters'][m]['level'] for m in ms]
        print(f'{mp:10} Lv {min(lv)}-{max(lv)}  boss {boss}  ' + ', '.join(d['monsters'][m]['name'] for m in ms))


main()
