"""
DJ delivery scooter ("Music Land Delivery") built from code in Blender, exported as gzipped GLB.

Run (either one):
    python tools/blender/build_dj_scooter.py            # pip install bpy
    blender -b -P tools/blender/build_dj_scooter.py     # Blender app, no window
Options:  --out PATH   (default public/models/props/dj_scooter.glb -> .glb.gz)
          --preview PNG   also render a picture
          --blend PATH    also save the .blend to open/edit in the Blender app

Front faces -Y in Blender (+Z in the game). ~1 unit = 1 m: 1.75 long, seat at 0.62.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import (box, cyl, flag, ground_origin, join, mat, out_arg, render_preview, reset, sphere,  # noqa: E402
                        text, torus, export_glb)
import bpy  # noqa: E402

reset()

WHITE = mat('body_white', '#f2f3f7', rough=0.35)
PURPLE = mat('trim_purple', '#5b2bd9', rough=0.4)
VIOLET = mat('box_violet', '#7b3cff', rough=0.5)
CYAN = mat('box_cyan', '#4fe3ff', rough=0.5)
BLACK = mat('rubber_black', '#16161c', rough=0.9)
SEAT = mat('seat_black', '#26222e', rough=0.7)
CHROME = mat('chrome', '#c9ccd6', rough=0.2, metal=0.8)
LIGHT = mat('headlight', '#fff6c8', emission=2.0)
TAIL = mat('taillight', '#ff3d6e', emission=1.5)
INK = mat('label_white', '#ffffff', emission=0.6)

R90 = math.radians(90)
parts = []

# ---- wheels: tyre (torus) + purple hub, axis along X
WHEEL_R = 0.24
for name, y in (('front', -0.62), ('rear', 0.58)):
    parts.append(torus(f'tyre_{name}', WHEEL_R - 0.06, 0.07, (0, y, WHEEL_R), BLACK, rot=(0, R90, 0), seg=20, minor_seg=6))
    parts.append(cyl(f'hub_{name}', 0.13, 0.12, (0, y, WHEEL_R), PURPLE, rot=(0, R90, 0), verts=20))
    parts.append(cyl(f'cap_{name}', 0.05, 0.16, (0, y, WHEEL_R), CHROME, rot=(0, R90, 0), verts=12))

# ---- rear body: rounded shell over the back wheel, purple skirt underneath
shell = sphere('rear_shell', 0.42, (0, 0.44, 0.52), WHITE, scale=(0.62, 1.15, 0.58), segs=16, rings=10)
parts.append(shell)
parts.append(sphere('rear_skirt', 0.4, (0, 0.46, 0.38), PURPLE, scale=(0.66, 1.17, 0.4), segs=16, rings=8))

# ---- floorboard between the wheels
parts.append(box('floor', (0.42, 0.62, 0.08), (0, -0.08, 0.24), WHITE, bevel=0.03))
parts.append(box('floor_mat', (0.36, 0.56, 0.02), (0, -0.08, 0.29), BLACK))
parts.append(box('floor_trim', (0.44, 0.64, 0.05), (0, -0.08, 0.19), PURPLE, bevel=0.015))

# ---- front leg shield + steering column, leaning back a little
LEAN = math.radians(-18)
parts.append(box('leg_shield', (0.4, 0.1, 0.62), (0, -0.44, 0.55), WHITE, bevel=0.05, rot=(LEAN, 0, 0)))
parts.append(cyl('column', 0.045, 0.62, (0, -0.55, 0.86), BLACK, rot=(LEAN, 0, 0), verts=10))
parts.append(box('front_fender', (0.2, 0.32, 0.08), (0, -0.62, 0.5), WHITE, bevel=0.03))

# ---- handlebar with grips, head lamp, mirrors
parts.append(cyl('bar', 0.025, 0.62, (0, -0.62, 1.13), BLACK, rot=(0, R90, 0), verts=8))
for sx in (-1, 1):
    parts.append(cyl(f'grip_{sx}', 0.035, 0.12, (sx * 0.31, -0.62, 1.13), SEAT, rot=(0, R90, 0), verts=10))
    parts.append(cyl(f'mirror_stem_{sx}', 0.012, 0.22, (sx * 0.2, -0.6, 1.24), BLACK, verts=6))
    parts.append(sphere(f'mirror_{sx}', 0.05, (sx * 0.2, -0.6, 1.36), BLACK, scale=(1.1, 0.35, 0.75), segs=8, rings=5))
parts.append(box('head_cover', (0.26, 0.16, 0.14), (0, -0.66, 1.06), WHITE, bevel=0.04))
parts.append(cyl('headlight', 0.07, 0.04, (0, -0.75, 1.06), LIGHT, rot=(R90, 0, 0), verts=16))

# ---- seat
parts.append(box('seat', (0.34, 0.62, 0.1), (0, 0.32, 0.86), SEAT, bevel=0.045))
parts.append(cyl('tail_light', 0.05, 0.03, (0, 0.95, 0.62), TAIL, rot=(R90, 0, 0), verts=12))

# ---- delivery box on a rack behind the seat (cyan lid, violet sides) with 3D lettering
parts.append(box('rack', (0.4, 0.4, 0.03), (0, 0.78, 0.93), CHROME))
parts.append(box('box_body', (0.56, 0.5, 0.46), (0, 0.8, 1.18), VIOLET, bevel=0.02))
parts.append(box('box_lid', (0.58, 0.52, 0.06), (0, 0.8, 1.43), CYAN, bevel=0.02))
for sx in (-1, 1):  # labels on both sides, facing out along X
    rot = (R90, 0, sx * R90)
    parts.append(text(f'box_label_{sx}', 'MUSIC LAND', (sx * 0.29, 0.8, 1.24), 0.07, INK, rot=rot, depth=0))
    parts.append(text(f'box_sub_{sx}', 'DELIVERY', (sx * 0.29, 0.8, 1.12), 0.06, CYAN, rot=rot, depth=0))
parts.append(text('box_back', 'MUSIC LAND', (0, 1.06, 1.2), 0.085, INK, rot=(R90, 0, math.pi), depth=0))

# one object per material keeps draw calls low and is what the game's loader expects
by_mat = {}
for p in parts:
    by_mat.setdefault(p.data.materials[0].name, []).append(p)
merged = [join(objs, f'scooter_{name}') for name, objs in by_mat.items()]
whole = join(merged, 'dj_scooter') if len(merged) > 1 else merged[0]
ground_origin(whole)
whole['ml_kind'] = 'vehicle'  # exported as glTF extras -> userData in three.js

if (blend := flag('--blend')):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
if (png := flag('--preview')):
    render_preview(os.path.abspath(png))
export_glb(out_arg('public/models/props/dj_scooter.glb'), budget=3000)
