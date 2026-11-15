"""
The keyboardist's starter 49-key keyboard (shared by every non-MVP keyboardist weapon), modelled in Blender.

    python tools/blender/build_keyboard.py [--preview PNG] [--blend FILE]
    python tools/blender/build_keyboard.py --mvp [--preview DIR]     # the 4 MVP keyboards (KEYBOARD_STYLES)

Same frame as buildKeyboard() in src/three/keyboard.ts: metres, keys along X (+X = the player's left),
+Y up, the player at -Z. The screen, LEDs and speaker grilles stay drawn by the game (canvas
textures, tagged `keep`), so they are not modelled here.
Game (x, y, z) = Blender (x, -z, y): G() converts.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import box, cyl, export_glb, flag, join, mat, out_arg, render_preview, reset  # noqa: E402
import bpy  # noqa: E402
import math  # noqa: E402

R90 = math.radians(90)


def G(x, y, z):
    return (x, -z, y)


def gbox(name, w, h, d, m, x, y, z, bevel=0.0, segments=2):
    return box(name, (w, d, h), G(x, y, z), m, bevel=bevel, segments=segments)


def hexc(v):
    return f'#{v:06x}'


# a copy of KEYBOARD_STYLES in src/three/keyboard.ts
MVP = {
    'kb_white': dict(body=0xf4f4f0, trim=0xd8d8d2, keys=36, width=1.0),
    'kb_slim': dict(body=0x141416, trim=0x2a2a2e, keys=36, width=0.9, slim=True),
    'kb_stage': dict(body=0x1a1b1f, trim=0x55575e, keys=36, width=1.02),
    'kb_red': dict(body=0xc8202a, trim=0x8a1018, keys=36, width=0.92, slim=True),
}


def build(st=None):
    reset()
    slim = bool(st and st.get('slim'))
    BODY = mat('kb_body', hexc(st['body']) if st else '#17181b', rough=0.45)
    SIDE = mat('kb_cheek', hexc(st['trim']) if st else '#2a2c31', rough=0.4)
    TRIM = mat('kb_trim', hexc(st['trim']) if st else '#6b6f78', rough=0.3, metal=0.6 if not st else 0.35)
    WHITE = mat('kb_white', '#f6f6f2', rough=0.35)
    BLACK = mat('kb_black', '#0c0c0e', rough=0.3)
    FELT = mat('kb_felt', '#6a1a24', rough=0.95)
    KNOB = mat('kb_knob', '#2b2d33', rough=0.35, metal=0.2)
    CAP = mat('kb_cap', '#9aa0aa', rough=0.25, metal=0.7)
    WHEEL = mat('kb_wheel', '#222429', rough=0.6)
    W = st['width'] if st else 0.86
    D = 0.24 if slim else 0.27
    H = 0.05 if slim else 0.06
    top = H
    parts = []
    # chassis: rounded body, end cheeks a little proud of the top, chrome trim along the back edge
    parts.append(gbox('chassis', W - 0.03, H, D, BODY, 0, H / 2, 0, bevel=0.006))
    for sx in (-1, 1):
        parts.append(gbox(f'cheek{sx}', 0.018, H + 0.008, D + 0.004, SIDE, sx * (W / 2 - 0.009), (H + 0.008) / 2, 0, bevel=0.006))
    parts.append(gbox('trim', W - 0.04, 0.004, 0.006, TRIM, 0, H - 0.002, D / 2 - 0.004, bevel=0.0012))
    parts.append(gbox('lip', W - 0.04, 0.006, 0.01, TRIM, 0, H - 0.012, -D / 2 - 0.002, bevel=0.002))

    # keys: white keys, black keys in the usual 2-3 groups, bevelled tops
    n_white = st['keys'] if st else 29
    keys_w = W - (0.07 if slim else 0.2) if st else 0.66
    white_w = keys_w / n_white
    kz = -D / 2 + 0.07
    for i in range(n_white):
        x = keys_w / 2 - white_w * (i + 0.5)
        parts.append(gbox(f'w{i}', white_w * 0.92, 0.014, 0.125, WHITE, x, top + 0.004, kz - 0.005, bevel=0.0018, segments=1))
        n = i % 7
        if i < n_white - 1 and n not in (2, 6):
            parts.append(gbox(f'b{i}', white_w * 0.56, 0.014, 0.075, BLACK, x - white_w / 2, top + 0.013, kz + 0.02, bevel=0.002, segments=1))
    parts.append(gbox('felt', keys_w + 0.01, 0.006, 0.012, FELT, 0, top + 0.012, kz + 0.064))
    parts.append(gbox('key_bed', keys_w + 0.014, 0.004, 0.14, BODY, 0, top - 0.001, kz - 0.005))

    # control panel: knobs with chrome caps, a fader, pitch and mod wheels
    pz = D / 2 - 0.055
    for i in range(4):
        for sx in (-1, 1):
            x = sx * (0.09 + i * 0.03)
            parts.append(cyl(f'knob{i}{sx}', 0.0085, 0.012, G(x, top + 0.006, pz + 0.018), KNOB, verts=14, bevel=0.002))
            parts.append(cyl(f'cap{i}{sx}', 0.004, 0.002, G(x, top + 0.0125, pz + 0.018), CAP, verts=10))
            parts.append(gbox(f'tick{i}{sx}', 0.0015, 0.002, 0.006, CAP, x, top + 0.0125, pz + 0.018 + 0.004))
    parts.append(gbox('slot', 0.006, 0.003, 0.05, mat('kb_slot', '#050505'), -0.34, top + 0.001, pz + 0.002))
    parts.append(gbox('fader', 0.016, 0.01, 0.012, CAP, -0.34, top + 0.006, pz + 0.01, bevel=0.002))
    for dx in (0, 0.022):
        x = W / 2 - 0.12 - dx
        parts.append(gbox(f'well{dx}', 0.014, 0.003, 0.04, mat('kb_slot', '#050505'), x, top + 0.0005, pz))
        parts.append(cyl(f'wheel{dx}', 0.016, 0.01, G(x, top + 0.004, pz), WHEEL, rot=(0, R90, 0), verts=18))
    return join(parts, 'keyboard')


if flag('--mvp') is not None or '--mvp' in sys.argv:
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'weapons', 'keyboards')
    prev = flag('--preview')
    for sid, st in MVP.items():
        build(st)
        if prev:
            os.makedirs(prev, exist_ok=True)
            render_preview(os.path.join(prev, f'{sid}.png'), angle_deg=180 + 20, elev_deg=35)
        export_glb(os.path.join(out_dir, f'{sid}.glb'), budget=6000)
    sys.exit(0)

build()
if (blend := flag('--blend')):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
if (png := flag('--preview')):
    render_preview(os.path.abspath(png), angle_deg=180 + 20, elev_deg=35)
export_glb(out_arg('public/models/weapons/keyboard.glb'), budget=6000)
