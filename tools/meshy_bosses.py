"""Gives the 11 mini-bosses the user's "Crowned Monsters" Meshy sculpt (2026-11-18): one model each
(public/models/monsters/MB_<id>.glb.gz, cut and baked like the normal monsters, crowns are part of the model).

    python3 tools/meshy_bosses.py
"""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
# sheet piece (left to right, top to bottom) -> mini-boss, how it moves, its voice, a tint if the piece is re-coloured
BOSSES = [
    ('king_jelly', 'hop', 'squeak', None),        # spiky blue mushroom head
    ('elder_tree', 'walk', 'growl', None),        # mushroom man with a mace
    ('marsh_queen', 'walk', 'blub', None),        # blue shark man
    ('rock_dragon', 'walk', 'roar', None),        # orange winged dragon
    ('banshee_queen', 'fly', 'wail', None),       # green screaming bat
    ('metal_lord', 'walk', 'growl', None),        # tiki-mask demon
    ('kraken', 'walk', 'blub', None),             # purple shark man
    ('snow_queen', 'walk', 'wail', '#9fdcff'),    # trident demon, iced over
    ('crystal_king', 'walk', 'crunch', None),     # purple crystal golem
    ('phantom_king', 'walk', 'growl', None),      # trident demon with wings
    ('inferno_lord', 'walk', 'roar', None),       # red winged dragon
]

p = ROOT / 'src/data/gamedata.json'
d = json.loads(p.read_text())
for key, move, voice, tint in BOSSES:
    m = d['monsters'][key]
    m['model'] = f'MB_{key}'
    m['move'] = move
    m['voice'] = voice
    m['shape'] = 'jelly'
    m.pop('modelScale', None)
    if tint:
        m['tint'] = tint
    else:
        m.pop('tint', None)
    print(key, m['name'], m['model'])
p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
