"""
Adobe houses for the desert town (ทะเลทรายตะโพน, src/three/desert.ts), modelled in Blender, one per footprint:
softened mud-brick walls, a parapet with round corner merlons, roof beams (vigas) poking out, an arched doorway
with a plank door and a cloth awning, arched windows with wooden shutters, clay pots by the door.
Plus the roof extras the game sets on top: a small dome on a drum, and a roof-top room.

    python tools/blender/build_desert_houses.py [--only 3x3x1] [--preview DIR]

L x D tiles (L = the door side), 1 or 2 floors, origin at the footprint centre, door to game +Z (Blender -Y).
Materials are colour slots (wall, base, trim, dark, wood, cloth, clay) painted by src/three/desertHouses.ts.
Writes public/models/town/desert_<L>x<D>x<floors>.glb.gz, desert_dome.glb.gz, desert_room.glb.gz.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import box as _box, cyl, export_glb, flag, join, lathe, mat, render_preview, reset  # noqa: E402
import bpy  # noqa: E402
import mathutils  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'town')
only = flag('--only')
prev = flag('--preview')


def box(name, size, loc, material=None, bevel=0.0, rot=(0, 0, 0), segments=1):
    return _box(name, size, loc, material, bevel=bevel, rot=rot, segments=segments)


def slots():
    return dict(
        wall=mat('wall', '#e9cf9f', rough=0.95), base=mat('base', '#c9a774', rough=0.95), trim=mat('trim', '#c9a774', rough=0.9),
        dark=mat('dark', '#3b2a1e', rough=0.9), wood=mat('wood', '#7a5233', rough=0.8), cloth=mat('cloth', '#c0392b', rough=0.9),
        clay=mat('clay', '#b5653a', rough=0.85),
    )


def H_of(floors):
    return 1.25 + floors * 0.85  # same as the code house


def on_wall(parts, pieces, rot):
    R = mathutils.Matrix.Rotation(rot, 4, 'Z')
    for p in pieces:
        p.matrix_world = R @ p.matrix_world
    parts += pieces


def window(S, x, z, yf):
    """Arched window on a wall at y = yf (outside towards -Y): dark recess, round top, shutters, sill."""
    return [
        box('w_rec', (0.28, 0.06, 0.3), (x, yf - 0.01, z), S['dark']),
        cyl('w_arch', 0.14, 0.06, (x, yf - 0.01, z + 0.15), S['dark'], rot=(math.radians(90), 0, 0), verts=8),
        box('w_sh1', (0.13, 0.04, 0.42), (x - 0.22, yf - 0.03, z + 0.03), S['wood']),
        box('w_sh2', (0.13, 0.04, 0.42), (x + 0.22, yf - 0.03, z + 0.03), S['wood']),
        box('w_sill', (0.38, 0.09, 0.05), (x, yf - 0.04, z - 0.18), S['trim']),
    ]


def house(L, D, floors):
    reset()
    S = slots()
    parts = []
    w, d = L - 0.12, D - 0.12
    H = H_of(floors)
    parts.append(box('body', (w, d, H), (0, 0, H / 2), S['wall'], bevel=0.07, segments=2))
    parts.append(box('skirt', (w + 0.04, d + 0.04, 0.22), (0, 0, 0.11), S['base'], bevel=0.04))
    # parapet and round corner merlons
    t = 0.13
    for bw, bd, x, y in ((w, t, 0, -d / 2 + t / 2), (w, t, 0, d / 2 - t / 2), (t, d, -w / 2 + t / 2, 0), (t, d, w / 2 - t / 2, 0)):
        parts.append(box('parapet', (bw, bd, 0.24), (x, y, H + 0.1), S['wall'], bevel=0.03))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(cyl('merlon', 0.13, 0.38, (sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), H + 0.17), S['wall'], verts=8))
            parts.append(cyl('merlon_top', 0.1, 0.06, (sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), H + 0.39), S['wall'], verts=8))
    if floors > 1:
        parts.append(box('band', (w + 0.05, d + 0.05, 0.08), (0, 0, 1.25 + 0.85 - 0.1), S['trim']))
    # vigas on the front and the back
    n = max(2, int(w / 0.5))
    for i in range(n):
        x = -w / 2 + 0.3 + i * (w - 0.6) / max(1, n - 1)
        for sy in (-1, 1):
            parts.append(cyl('viga', 0.045, 0.32, (x, sy * (d / 2 + 0.1), H - 0.16), S['wood'], rot=(math.radians(90), 0, 0), verts=6))
    # the doorway: arched recess, plank door, step, awning on two poles, pots
    yf = -d / 2
    parts.append(box('door_rec', (0.62, 0.08, 0.95), (0, yf - 0.005, 0.22 + 0.475), S['dark']))
    parts.append(cyl('door_arch', 0.31, 0.08, (0, yf - 0.005, 0.22 + 0.95), S['dark'], rot=(math.radians(90), 0, 0), verts=10))
    parts.append(box('door', (0.52, 0.05, 1.0), (0, yf - 0.03, 0.22 + 0.5), S['wood']))
    for k in (-0.13, 0.13):
        parts.append(box('plank', (0.02, 0.06, 1.0), (k, yf - 0.04, 0.22 + 0.5), S['dark']))
    parts.append(box('door_band', (0.8, 0.07, 0.07), (0, yf - 0.03, 0.22 + 1.32), S['trim']))
    parts.append(box('step', (0.8, 0.25, 0.12), (0, yf - 0.14, 0.06), S['base'], bevel=0.02))
    aw = box('awning', (1.1, 0.55, 0.04), (0, yf - 0.3, 1.62), S['cloth'], rot=(math.radians(-14), 0, 0))
    parts.append(aw)
    parts.append(box('awning_fringe', (1.1, 0.02, 0.1), (0, yf - 0.57, 1.52), S['cloth']))
    for sx in (-0.5, 0.5):
        parts.append(cyl('pole', 0.025, 1.55, (sx, yf - 0.55, 0.78), S['wood'], verts=6))
    for i, sx in enumerate((-0.62, 0.62)):
        if L < 3 and i == 1:
            continue
        r = 0.13 if i == 0 else 0.1
        p = lathe('pot', [(0, 0), (r * 0.6, 0), (r, r * 0.9), (r * 0.85, r * 1.7), (r * 0.5, r * 2.1), (r * 0.6, r * 2.3), (0.0001, r * 2.3)], S['clay'], segs=8)
        p.location = (sx, yf - 0.25, 0)
        parts.append(p)
    # windows: front beside the door, upper floor across the front, sides and back
    for f in range(floors):
        z = 0.95 + f * 0.85 + (0.35 if f else 0)
        xs = [s * w * 0.32 for s in (-1, 1)] if (w >= 2.4 or f) else []
        if f and w < 2.4:
            xs = [0.0]
        on_wall(parts, sum((window(S, x, z, yf) for x in xs), []), 0)
        back = [s * w * 0.28 for s in (-1, 1)] if w >= 2.4 else [0.0]
        on_wall(parts, sum((window(S, x, z, yf) for x in back), []), math.pi)
        side = [0.0] if d < 3.4 else [-d * 0.22, d * 0.22]
        on_wall(parts, sum((window(S, y, z, -w / 2) for y in side), []), -math.pi / 2)
        if (L + D + f) % 2 == 0:
            on_wall(parts, sum((window(S, y, z, -w / 2) for y in side), []), math.pi / 2)
    # a water spout on the back
    parts.append(box('spout', (0.08, 0.3, 0.08), (w * 0.3, d / 2 + 0.15, H - 0.05), S['wood']))
    join(parts, f'desert_{L}x{D}x{floors}')


def dome():
    """Unit dome (radius 1) on a low drum, a finial: the game scales it to the house."""
    reset()
    S = slots()
    parts = [cyl('drum', 1.05, 0.25, (0, 0, 0.125), S['wall'], verts=16)]
    parts.append(lathe('dome', [(1.0, 0.25), (0.98, 0.45), (0.86, 0.7), (0.62, 0.95), (0.32, 1.12), (0.0, 1.18)], S['cloth'], segs=16))
    parts.append(cyl('finial', 0.04, 0.35, (0, 0, 1.33), S['trim'], verts=6))
    join(parts, 'desert_dome')


def room():
    """Unit roof-top room (1 x 1 x 1): a little parapet and a door; scaled by the game."""
    reset()
    S = slots()
    parts = [
        box('room', (1, 1, 0.9), (0, 0, 0.45), S['wall'], bevel=0.05, segments=2),
        box('room_rim', (1.06, 1.06, 0.1), (0, 0, 0.92), S['trim'], bevel=0.02),
        box('room_door', (0.3, 0.04, 0.55), (0, -0.5, 0.3), S['dark']),
        cyl('room_arch', 0.15, 0.04, (0, -0.5, 0.57), S['dark'], rot=(math.radians(90), 0, 0), verts=8),
    ]
    join(parts, 'desert_room')


jobs = [(f'desert_{L}x{D}x{f}', lambda L=L, D=D, f=f: house(L, D, f)) for L in (2, 3, 4, 5) for D in (2, 3, 4, 5) for f in (1, 2)]
jobs += [('desert_dome', dome), ('desert_room', room)]
for name, make in jobs:
    if only and not any(name.endswith(o) for o in only.split(',')):
        continue
    make()
    if prev:
        os.makedirs(prev, exist_ok=True)
        render_preview(os.path.join(prev, f'{name}.png'), size=(600, 500), angle_deg=-35, elev_deg=22)
    export_glb(os.path.join(OUT, f'{name}.glb'), budget=2500)
