"""2026-11-15: every weapon / armour / hat / accessory / shoes / earring gets reqLevel (the Base Lv needed to wear it).
Rule: cheap starter gear (price <= 100) = Lv 1; otherwise the level of the weakest monster that drops it (bosses count
at their own level), capped at 99; gear nothing drops (the dagger line) goes by price.
Idempotent (reads only the drops, never its own output). Usage: python3 tools/equip_levels.py src/data/gamedata.json [out.sql]"""
import json, sys
P = sys.argv[1]
d = json.load(open(P, encoding='utf-8'))
EQ = {'weapon', 'armor', 'head', 'accessory', 'shoes', 'earring'}
drop = {}
for m in d['monsters'].values():
    for iid, _ in m['drops']:
        drop[iid] = min(drop.get(iid, 999), m['level'])
rows = []
for k, it in d['items'].items():
    if it['type'] not in EQ:
        it.pop('reqLevel', None)
        continue
    if it['price'] <= 100:
        lv = 1
    elif k in drop:
        lv = drop[k]
    else:
        lv = max(1, min(60, it['price'] // 27))  # steel dagger (400 z) -> 14
    it['reqLevel'] = max(1, min(99, lv))
    rows.append((k, it['reqLevel']))
open(P, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1))
print(len(rows), 'items; Lv range', min(r[1] for r in rows), max(r[1] for r in rows))
if len(sys.argv) > 2:
    with open(sys.argv[2], 'w', encoding='utf-8') as f:
        f.write('-- Music Land: every equipment item has a minimum Base Lv to wear (2026-11-15).\n-- Run once in Supabase SQL Editor. Safe to run again.\n\n')
        f.write('alter table public.item_defs add column if not exists req_level int not null default 1;\n\n')
        f.write('update public.item_defs as d set req_level = v.lv\nfrom (values\n' + ',\n'.join(f"  ('{k}', {lv})" for k, lv in rows) + '\n) as v(id, lv)\nwhere d.id = v.id;\n\n')
        f.write('@@SET_EQUIPPED@@\n')
