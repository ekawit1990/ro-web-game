"""PVP bonuses (2026-11-10): MVP weapons hit players harder, boss cards and some gear add PVP attack/defence.
Idempotent: run again any time. Usage: python3 tools/add_pvp_bonus.py"""
import json, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / 'src/data/gamedata.json'
d = json.loads(p.read_text())
it, mons = d['items'], d['monsters']
def setb(k, key, v):
    b = it[k].setdefault('bonus', {}) if it[k].get('type') != 'card' else it[k]['card']['bonus']
    b[key] = v
for k, v in it.items():
    if v.get('mvp') and v.get('type') == 'weapon':
        atk = v.get('atk') or v.get('matk') or 46
        setb(k, 'pvpAtkPct', max(5, min(15, 5 + round((atk - 46) / 66 * 10))))
bosses = [m for m in mons.values() if m.get('boss')]
for m in bosses:
    for drop, _ in m['drops']:
        c = it.get(drop)
        if c and c.get('type') == 'card':
            setb(drop, 'pvpAtkPct' if c['card']['slot'] == 'weapon' else 'pvpDefPct', 10 if c['card']['slot'] == 'weapon' else 8)
for k, key, v in [('leather_jacket', 'pvpDefPct', 3), ('magma_plate', 'pvpDefPct', 8), ('pick_necklace', 'pvpAtkPct', 3),
                  ('metronome_charm', 'pvpDefPct', 3), ('star_earring', 'pvpAtkPct', 4), ('crystal_earring', 'pvpDefPct', 4)]:
    if k in it: setb(k, key, v)
json.dump(d, open(p, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('ok')
