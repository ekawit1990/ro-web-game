"""Halves every monster's Base EXP and Job EXP (2026-11-14, user's ask: -50%).

Reads the gamedata.json from before the change, so running it again gives the same result:
  git show b3fc635:src/data/gamedata.json > /tmp/old.json
  python3 tools/monster_exp_half.py /tmp/old.json
  node scripts/gen-seed.mjs
Rounded half up, at least 1. Also writes the SQL update for monster_defs to the path given second (optional).
"""
import json
import sys

OLD = sys.argv[1]
SQL = sys.argv[2] if len(sys.argv) > 2 else None
PATH = 'src/data/gamedata.json'

old = json.load(open(OLD, encoding='utf-8'))['monsters']
data = json.load(open(PATH, encoding='utf-8'))
half = lambda v: max(1, int(v * 0.5 + 0.5))
rows = []
for key, m in data['monsters'].items():
    o = old.get(key, m)
    m['exp'] = half(o['exp'])
    m['jobExp'] = half(o['jobExp'])
    rows.append(f"  ('{key}', {m['exp']}, {m['jobExp']})")
json.dump(data, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('halved', len(rows), 'monsters')

if SQL:
    with open(SQL, 'w', encoding='utf-8') as f:
        f.write('-- Music Land: every monster gives 50% less Base EXP and Job EXP (2026-11-14)\n')
        f.write('-- Run once in Supabase SQL Editor. Safe to run again (sets the new values, does not halve twice).\n\n')
        f.write('update public.monster_defs as d set exp = v.exp, job_exp = v.job_exp\nfrom (values\n')
        f.write(',\n'.join(rows))
        f.write('\n) as v(id, exp, job_exp)\nwhere d.id = v.id;\n')
    print('wrote', SQL)
