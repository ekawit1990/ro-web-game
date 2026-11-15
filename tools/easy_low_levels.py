"""2026-11-15: monsters of Lv 1-60 have 50% less HP (the EXP table change is in expToNext / exp_to_next).
Reads the gamedata.json from before the change, so running it again gives the same result:
  git show fa9e8d2:src/data/gamedata.json > /tmp/old.json
  python3 tools/easy_low_levels.py /tmp/old.json
Rounded half up, at least 1."""
import json, sys
old = json.load(open(sys.argv[1], encoding='utf-8'))['monsters']
P = 'src/data/gamedata.json'
d = json.load(open(P, encoding='utf-8'))
n = 0
for k, m in d['monsters'].items():
    o = old.get(k, m)
    if m['level'] <= 60:
        m['hp'] = max(1, int(o['hp'] * 0.5 + 0.5))
        n += 1
    else:
        m['hp'] = o['hp']
open(P, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1))
print('halved HP of', n, 'monsters')
