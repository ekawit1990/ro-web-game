"""
Houses for เมืองคีย์มนตรา (src/three/magic.ts), modelled in Blender: one model per footprint size.

    python tools/blender/build_magic_houses.py [--only 3x4x2] [--preview DIR]

Each house is L x D tiles (L along the door side), 1 or 2 floors, origin at the footprint centre on the ground,
door facing game +Z (Blender -Y). The game turns it to face its street and paints it: materials are named
after colour slots (wall, roof, trim, glass, door, stone, dark) and src/three/magicHouses.ts merges every
house of the town into one vertex-coloured mesh.
Writes public/models/town/magic_<L>x<D>x<floors>.glb.gz and magic_turret_<floors>.glb.gz.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import box as _box, cyl, export_glb, flag, join, mat, render_preview, reset  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402



def box(name, size, loc, material=None, bevel=0.0, rot=(0, 0, 0)):
    # one bevel segment: rounded-looking edges at a third of the triangles
    return _box(name, size, loc, material, bevel=bevel, rot=rot, segments=1)


OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'town')
only = flag('--only')
prev = flag('--preview')


def slots():
    # preview colours only: the game repaints by name
    return dict(
        wall=mat('wall', '#c4bccd', rough=0.85), roof=mat('roof', '#5b45a0', rough=0.6), trim=mat('trim', '#e8e2ef', rough=0.7),
        glass=mat('glass', '#7fb0ff', rough=0.2), door=mat('door', '#3a2a4a', rough=0.6), stone=mat('stone', '#8f879c', rough=0.9),
        dark=mat('dark', '#2a2236', rough=0.8),
    )


def wall_h(floors):
    return 1.2 + floors * 0.9  # same as the code house


def hip_roof(name, w, d, h, over, m, thick=0.07):
    """A hipped roof over w x d (Blender X x Y), eaves `over` out, ridge along the longer side."""
    W, D = w / 2 + over, d / 2 + over
    bm = bmesh.new()
    if w >= d:
        r = max(0.0, W - D)
        top = [bm.verts.new((-r, 0, h)), bm.verts.new((r, 0, h))]
    else:
        r = max(0.0, D - W)
        top = [bm.verts.new((0, -r, h)), bm.verts.new((0, r, h))]
    b = [bm.verts.new(p) for p in ((-W, -D, 0), (W, -D, 0), (W, D, 0), (-W, D, 0))]
    if w >= d:
        faces = [(b[0], b[1], top[1], top[0]), (b[2], b[3], top[0], top[1]), (b[1], b[2], top[1]), (b[3], b[0], top[0])]
    else:
        faces = [(b[1], b[2], top[1], top[0]), (b[3], b[0], top[0], top[1]), (b[0], b[1], top[0]), (b[2], b[3], top[1])]
    for f in faces:
        verts = list(dict.fromkeys(f))
        if len(verts) >= 3:
            bm.faces.new(verts)
    bm.faces.new(list(reversed(b)))  # soffit
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(m)
    sol = o.modifiers.new('solid', 'SOLIDIFY')
    sol.thickness = thick
    sol.offset = 1
    return o, (top[0].co.copy() if False else None)


def window(parts, S, x, z, y_face, rot, wdt=0.38, hgt=0.5):
    """A window on a wall plane: frame, glass, cross mullion and a sill. (x along the wall, z height)."""
    # build in wall-local frame: X along, -Y out of the wall, then rotate about Z by rot
    import mathutils
    R = mathutils.Matrix.Rotation(rot, 4, 'Z')
    pieces = [
        box('wf', (wdt + 0.08, 0.05, hgt + 0.08), (x, y_face - 0.01, z), S['trim']),
        box('wg', (wdt, 0.04, hgt), (x, y_face - 0.03, z), S['glass']),
        box('wm1', (0.025, 0.05, hgt), (x, y_face - 0.04, z), S['trim']),
        box('wm2', (wdt, 0.05, 0.025), (x, y_face - 0.04, z + hgt * 0.12), S['trim']),
        box('ws', (wdt + 0.16, 0.12, 0.05), (x, y_face - 0.05, z - hgt / 2 - 0.05), S['trim']),
    ]
    for p in pieces:
        p.matrix_world = R @ p.matrix_world
    parts += pieces


def house(L, D, floors):
    reset()
    S = slots()
    parts = []
    w, d = L - 0.15, D - 0.15
    H = wall_h(floors)
    # plinth, walls, corner quoins, belt course and cornice
    parts.append(box('plinth', (w + 0.1, d + 0.1, 0.25), (0, 0, 0.125), S['stone'], bevel=0.02))
    parts.append(box('walls', (w, d, H - 0.25), (0, 0, 0.25 + (H - 0.25) / 2), S['wall']))
    for sx in (-1, 1):
        for sy in (-1, 1):
            z = 0.3
            k = 0
            while z < H - 0.2:
                big = k % 2 == 0
                qw = 0.24 if big else 0.16
                parts.append(box('q', (qw, qw, 0.2), (sx * (w / 2 - qw / 2 + 0.02), sy * (d / 2 - qw / 2 + 0.02), z + 0.1), S['trim']))
                z += 0.26
                k += 1
    if floors > 1:
        parts.append(box('belt', (w + 0.06, d + 0.06, 0.08), (0, 0, 1.2 + 0.9 - 0.25), S['trim'], bevel=0.01))
    parts.append(box('cornice', (w + 0.14, d + 0.14, 0.14), (0, 0, H - 0.07), S['trim'], bevel=0.02))
    # roof: hipped, steep, eaves out, a ridge cap and tile courses
    rh = max(w, d) * 0.4 + 0.3
    roof, _ = hip_roof('roof', w, d, rh, 0.18, S['roof'])
    roof.location = (0, 0, H)
    parts.append(roof)
    if w >= d:
        rl = max(0.0, w - d)
        if rl > 0:
            parts.append(cyl('ridge', 0.05, rl + 0.1, (0, 0, H + rh + 0.05), S['dark'], rot=(0, math.radians(90), 0), verts=8))
    else:
        rl = max(0.0, d - w)
        if rl > 0:
            parts.append(cyl('ridge', 0.05, rl + 0.1, (0, 0, H + rh + 0.05), S['dark'], rot=(math.radians(90), 0, 0), verts=8))
    # tile courses: thin darker bands round all four slopes
    W2, D2 = w / 2 + 0.18, d / 2 + 0.18
    r = abs(W2 - D2)
    for i in range(1, 4):
        t = i / 4
        zz = H + rh * t + 0.07
        if w >= d:
            hx, hy = r + (W2 - r) * (1 - t), D2 * (1 - t)
        else:
            hx, hy = W2 * (1 - t), r + (D2 - r) * (1 - t)
        for s in (-1, 1):
            parts.append(box('tile', (2 * hx + 0.04, 0.05, 0.04), (0, s * (hy + 0.01), zz), S['dark']))
            parts.append(box('tile', (0.05, 2 * hy + 0.04, 0.04), (s * (hx + 0.01), 0, zz), S['dark']))
    # chimney on the back half
    cx = (w / 2 - 0.45) if w > 1.6 else 0.0
    parts.append(box('chimney', (0.32, 0.32, rh * 0.75 + 0.5), (cx, d / 4, H + rh * 0.6), S['stone'], bevel=0.015))
    parts.append(box('chimney_cap', (0.42, 0.42, 0.08), (cx, d / 4, H + rh * 0.6 + rh * 0.375 + 0.25), S['dark'], bevel=0.01))
    # the door on the front (-Y): frame, panel, step, a little lamp
    fy = -d / 2
    parts.append(box('door_frame', (0.7, 0.06, 1.12), (0, fy - 0.02, 0.25 + 0.56), S['trim'], bevel=0.01))
    parts.append(box('door', (0.55, 0.06, 1.0), (0, fy - 0.04, 0.25 + 0.5), S['door'], bevel=0.008))
    parts.append(cyl('knob', 0.025, 0.04, (0.18, fy - 0.08, 0.75), S['trim'], rot=(math.radians(90), 0, 0), verts=8))
    parts.append(box('step', (0.8, 0.25, 0.1), (0, fy - 0.17, 0.05), S['stone'], bevel=0.015))
    parts.append(box('lintel', (0.82, 0.12, 0.1), (0, fy - 0.05, 0.25 + 1.12 + 0.02), S['trim'], bevel=0.01))
    # windows: ground floor beside the door if there's room, upper floors across the front, sides and back
    for f in range(floors):
        z = 1.15 + f * 0.9
        xs = [s * w * 0.3 for s in (-1, 1)] if (f > 0 or w >= 2.4) else []
        if f > 0 and w < 2.4:
            xs = [0.0]
        for x in xs:
            window(parts, S, x, z, fy, 0)
        # back
        for x in ([s * w * 0.3 for s in (-1, 1)] if w >= 2.4 else [0.0]):
            window(parts, S, x, z, fy, math.pi)
        # sides
        for y in ([s * d * 0.25 for s in (-1, 1)] if d >= 3.2 else [0.0]):
            window(parts, S, y, z, -w / 2, -math.pi / 2)
            window(parts, S, y, z, -w / 2, math.pi / 2)
    # a dormer on the front slope of two-floor houses wide enough for one
    if floors > 1 and w >= 2.6 and w >= d:
        slope_y = -(d / 2 + 0.18) * 0.45
        zb = H + rh * 0.55
        parts.append(box('dormer', (0.7, 0.6, 0.6), (0, slope_y + 0.1, zb), S['wall']))
        dr, _ = hip_roof('dormer_roof', 0.7, 0.6, 0.4, 0.08, S['roof'], thick=0.05)
        dr.location = (0, slope_y + 0.1, zb + 0.3)
        parts.append(dr)
        window(parts, S, 0, zb + 0.02, slope_y - 0.2, 0, wdt=0.3, hgt=0.36)
    join(parts, f'magic_{L}x{D}x{floors}')


def turret(floors):
    reset()
    S = slots()
    th = wall_h(floors) + 1.1
    parts = [
        cyl('tbase', 0.4, 0.25, (0, 0, 0.125), S['stone'], verts=14),
        cyl('tbody', 0.35, th - 0.25, (0, 0, 0.25 + (th - 0.25) / 2), S['wall'], verts=14),
        cyl('tband', 0.38, 0.1, (0, 0, th - 0.05), S['trim'], verts=14),
    ]
    for i in range(3):
        a = i / 3 * 2 * math.pi + 0.4
        parts.append(box('slit', (0.08, 0.06, 0.32), (math.cos(a) * 0.35, math.sin(a) * 0.35, th - 0.5), S['glass'], rot=(0, 0, a + math.pi / 2)))
    bpy.ops.mesh.primitive_cone_add(vertices=14, radius1=0.5, radius2=0.0, depth=1.2, location=(0, 0, th + 0.6))
    cone = bpy.context.active_object
    cone.data.materials.append(S['roof'])
    parts.append(cone)
    parts.append(cyl('finial', 0.02, 0.35, (0, 0, th + 1.35), S['trim'], verts=6))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.06, location=(0, 0, th + 1.55), segments=8, ring_count=5)
    orb = bpy.context.active_object
    orb.data.materials.append(S['glass'])
    parts.append(orb)
    join(parts, f'magic_turret_{floors}')


jobs = [(f'magic_{L}x{D}x{f}', lambda L=L, D=D, f=f: house(L, D, f)) for L in (2, 3, 4, 5) for D in (2, 3, 4, 5) for f in (1, 2)]
jobs += [(f'magic_turret_{f}', lambda f=f: turret(f)) for f in (1, 2)]
for name, make in jobs:
    if only and not any(name.endswith(o) for o in only.split(',')):
        continue
    make()
    if prev:
        os.makedirs(prev, exist_ok=True)
        render_preview(os.path.join(prev, f'{name}.png'), size=(600, 500), angle_deg=-35, elev_deg=22)
    export_glb(os.path.join(OUT, f'{name}.glb'), budget=2500)
