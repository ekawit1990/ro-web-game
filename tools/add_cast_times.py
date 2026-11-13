"""Every active skill gets an RO-style cast time (shorter with DEX, min 0.5 s). Idempotent."""
import json, pathlib
p = pathlib.Path(__file__).resolve().parent.parent / 'src/data/gamedata.json'
d = json.loads(p.read_text())
CAST = {
    'quick_slash': 500, 'root_note': 600,
    'dash_stab': 1000, 'dynamics': 1000, 'ear_training': 1000, 'hammer_on': 1000, 'snare_roll': 1000, 'slide': 1000, 'send_off': 1000,
    'whirl_stab': 1200, 'bending': 1200, 'palm_muting': 1200, 'double_kick': 1200, 'straight_beat': 1200,
    'x_wave': 1500,
    'pump_up': 800, 'warm_up': 800, 'enunciation': 800, 'vibrato': 800, 'kick_drum': 800, 'lift_beat': 800, 'push_note': 800,
    'ghost_exit': 500,
    'restore': 1000, 'tempo_up': 1000, 'tempo_control': 1000, 'solo': 1000, 'chorus_ward': 1000,
    'revive': 3000,
}
for k, s in d['skills'].items():
    if s['type'] == 'passive' or k not in CAST:
        continue
    s['castMs'] = CAST[k]
    s['castDex'] = True
missing = [k for k, s in d['skills'].items() if s['type'] != 'passive' and not s.get('castMs')]
assert not missing, missing
p.write_text(json.dumps(d, ensure_ascii=False, indent=1))
print('ok')
