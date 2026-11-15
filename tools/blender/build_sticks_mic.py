"""
Starter drumstick and starter mic, modelled in Blender (shared by every non-MVP drummer / singer weapon).

    python tools/blender/build_sticks_mic.py [--preview PNG]

Frames match the code-built ones they replace (game Y = Blender Z, game +Z = Blender -Y):
  * stick: 0.4 long along Y, centred, tip at +Y (src/three/sticks.ts)
  * mic:   handle from y -0.04 up to the ball, ball centred at y 0.18, r 0.05 (vrm.ts singer prop)
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import box, cyl, export_glb, flag, join, lathe, mat, reset, sphere, torus, render_preview  # noqa: E402
import bpy  # noqa: E402

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'weapons')
png = flag('--preview')

# ---------------------------------------------------------------- drumstick (hickory, acorn tip)
reset()
WOOD = mat('hickory', '#e3c18f', rough=0.55)
DARK = mat('hickory_dark', '#c99a62', rough=0.5)
TAPE = mat('grip_tape', '#2a2328', rough=0.85)
parts = [
    lathe('butt', [(0, -0.2), (0.016, -0.1995), (0.0185, -0.197), (0.019, -0.19)], WOOD, segs=14),
    lathe('grip', [(0.0196, -0.19), (0.0198, -0.06), (0.019, -0.055)], TAPE, segs=14),          # wrapped grip
    lathe('shaft', [(0.019, -0.055), (0.019, 0.07), (0.0185, 0.1), (0.016, 0.13), (0.011, 0.16), (0.0078, 0.176)], WOOD, segs=14),
    lathe('tip', [(0.0078, 0.176), (0.0102, 0.184), (0.0114, 0.19), (0.0098, 0.196), (0.005, 0.1995), (0, 0.2)], DARK, segs=14),
]
for i, z in enumerate((-0.17, -0.12, -0.075)):  # tape seams
    parts.append(lathe(f'seam{i}', [(0.0199, z - 0.0015), (0.0201, z), (0.0199, z + 0.0015)], WOOD, segs=14))
join(parts, 'stick')
if png:
    render_preview(png.replace('.png', '_stick.png'), angle_deg=30, elev_deg=10)
export_glb(os.path.join(out_dir, 'stick.glb'), budget=1500)

# ---------------------------------------------------------------- handheld mic
reset()
BODY = mat('mic_body', '#1e1f24', rough=0.45, metal=0.3)
CHROME = mat('mic_chrome', '#c8ced8', rough=0.2, metal=0.8)
GRILLE = mat('mic_grille', '#b0b6bd', rough=0.3, metal=0.7)
FOAM = mat('mic_foam', '#2e3036', rough=0.9)
LED = mat('mic_led', '#4dff88', emission=2)
parts = [
    lathe('handle', [(0, -0.04), (0.0155, -0.0395), (0.0175, -0.036), (0.019, -0.02), (0.0235, 0.09), (0.0265, 0.124), (0.028, 0.13)], BODY, segs=18),
    lathe('collar', [(0.028, 0.13), (0.031, 0.132), (0.032, 0.142), (0.033, 0.146), (0.036, 0.15)], CHROME, segs=18),
    lathe('base_ring', [(0.0155, -0.0405), (0.0165, -0.042), (0.0165, -0.034), (0.0175, -0.033)], CHROME, segs=14),
    sphere('foam', 0.046, (0, 0, 0.18), FOAM, segs=16, rings=10),
    torus('band', 0.0495, 0.0035, (0, 0, 0.175), CHROME, seg=24, minor_seg=6),
]
cage = sphere('cage', 0.05, (0, 0, 0.18), GRILLE, segs=12, rings=8)
w = cage.modifiers.new('wire', 'WIREFRAME')
w.thickness = 0.0028
w.use_even_offset = True
parts.append(cage)
parts.append(box('switch_plate', (0.012, 0.004, 0.03), (0, -0.0225, 0.07), CHROME, bevel=0.0015))
parts.append(box('switch', (0.007, 0.004, 0.012), (0, -0.0245, 0.074), BODY, bevel=0.001))
parts.append(cyl('led', 0.0018, 0.003, (0, -0.0245, 0.095), LED, rot=(math.radians(90), 0, 0), verts=8))
join(parts, 'mic')
if png:
    render_preview(png.replace('.png', '_mic.png'), angle_deg=25, elev_deg=12)
export_glb(os.path.join(out_dir, 'mic.glb'), budget=3000)
