"""2026-11-13: every class buff that lasted 30 s now lasts 1 minute (descriptions too). Safe to run again."""
import json
import pathlib

p = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'data' / 'gamedata.json'
d = json.loads(p.read_text(encoding='utf-8'))
changed = []
for key, s in d['skills'].items():
    b = s.get('buff')
    if not b or s.get('type') not in ('buff', 'buff_target', 'buff_party') or b.get('durationSec') != 30:
        continue
    b['durationSec'] = 60
    for k in ('desc', 'description'):
        if isinstance(s.get(k), str):
            s[k] = s[k].replace('นาน 30 วินาที', 'นาน 1 นาที').replace('หายตัว 30 วินาที', 'หายตัว 1 นาที')
    changed.append(key)
p.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding='utf-8')
print('60 s:', ', '.join(changed) or 'nothing to change')
