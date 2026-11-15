"""
Landmarks of เมืองคีย์มนตรา, modelled in Blender:
  * magic_hall: หอดนตรีมนตรา, the conservatory (footprint 14 x 9 tiles, door on game +Z): a stepped podium,
    a two-storey main block with a domed drum and a glowing lantern, lower wings, a six-column portico
    with a pediment and a frieze of piano keys, tall arched windows
  * magic_gazebo: the lake park's gazebo (4 x 4): a hexagonal deck on steps, six columns, a rail and a
    bell-shaped roof with a finial

    python tools/blender/build_magic_landmarks.py [--preview DIR]

Materials are colour slots (wall, stone, roof, trim, glass, door, dark, gold) painted by src/three/magic.ts.
Origin at the footprint centre on the ground, front = game +Z = Blender -Y.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import box as _box, cyl, export_glb, flag, join, lathe, mat, render_preview, reset, sphere, torus  # noqa: E402
import bpy  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'town')
prev = flag('--preview')


def box(name, size, loc, material=None, bevel=0.0, rot=(0, 0, 0)):
    return _box(name, size, loc, material, bevel=bevel, rot=rot, segments=1)


def slots():
    return dict(
        wall=mat('wall', '#ece6f2', rough=0.8), stone=mat('stone', '#a49cb2', rough=0.9), roof=mat('roof', '#5b45a0', rough=0.6),
        trim=mat('trim', '#fbf8ff', rough=0.7), glass=mat('glass', '#8fb8ff', rough=0.2), door=mat('door', '#3a2a4a', rough=0.6),
        dark=mat('dark', '#16121e', rough=0.6), gold=mat('gold', '#e0b84a', rough=0.35, metal=0.5),
    )


def arched_window(parts, S, x, y, z, w, h, facing=0.0):
    """Tall arched window on a wall whose outside is -Y (rotated by `facing` about Z)."""
    import mathutils
    R = mathutils.Matrix.Rotation(facing, 4, 'Z')
    ps = [
        box('aw_frame', (w + 0.14, 0.06, h + 0.1), (x, y - 0.02, z), S['trim']),
        box('aw_glass', (w, 0.05, h), (x, y - 0.045, z), S['glass']),
        cyl('aw_arch_f', w / 2 + 0.07, 0.06, (x, y - 0.02, z + h / 2), S['trim'], rot=(math.radians(90), 0, 0), verts=12),
        cyl('aw_arch_g', w / 2, 0.05, (x, y - 0.045, z + h / 2), S['glass'], rot=(math.radians(90), 0, 0), verts=12),
        box('aw_mull', (0.03, 0.06, h + w / 2), (x, y - 0.06, z + w / 4), S['trim']),
        box('aw_sill', (w + 0.24, 0.14, 0.06), (x, y - 0.06, z - h / 2 - 0.06), S['stone']),
    ]
    for p in ps:
        p.matrix_world = R @ p.matrix_world
    parts += ps


def column(parts, S, x, y, z0, h, r=0.16):
    parts.append(box('c_base', (r * 2.6, r * 2.6, 0.14), (x, y, z0 + 0.07), S['stone']))
    parts.append(lathe('c_shaft', [(r * 1.05, z0 + 0.14), (r, z0 + 0.3), (r * 0.88, z0 + h - 0.22), (r * 1.1, z0 + h - 0.16), (r * 1.1, z0 + h - 0.12)], S['trim'], segs=10))
    parts.append(box('c_cap', (r * 2.7, r * 2.7, 0.12), (x, y, z0 + h - 0.06), S['stone']))
    parts[-2].location = (x, y, 0)


def hall():
    reset()
    S = slots()
    parts = []
    W, D = 14, 9
    # stepped podium across the whole footprint, steps on the front
    parts.append(box('podium', (W - 0.4, D - 0.6, 0.5), (0, 0.2, 0.25), S['stone'], bevel=0.03))
    for i in range(3):
        parts.append(box(f'step{i}', (6.4 - i * 0.4, 0.35, 0.17 * (i + 1)), (0, -D / 2 + 0.25 + i * 0.35 - 0.05, 0.085 * (i + 1)), S['stone']))
    base = 0.5
    # main block (10 x 6, two storeys) and two lower wings
    mw, md, mh = 7.6, 5.4, 4.6
    parts.append(box('main', (mw, md, mh), (0, 0.6, base + mh / 2), S['wall']))
    parts.append(box('main_cornice', (mw + 0.3, md + 0.3, 0.25), (0, 0.6, base + mh), S['trim'], bevel=0.03))
    parts.append(box('main_roof', (mw - 0.1, md - 0.1, 0.3), (0, 0.6, base + mh + 0.25), S['roof']))
    parts.append(box('main_belt', (mw + 0.1, md + 0.1, 0.12), (0, 0.6, base + 2.3), S['trim']))
    for sx in (-1, 1):
        wx = sx * (mw / 2 + 1.55)
        parts.append(box(f'wing{sx}', (3.1, 4.6, 3.0), (wx, 0.9, base + 1.5), S['wall']))
        parts.append(box(f'wing_cornice{sx}', (3.35, 4.85, 0.2), (wx, 0.9, base + 3.0), S['trim'], bevel=0.02))
        parts.append(box(f'wing_roof{sx}', (3.1, 4.6, 0.3), (wx, 0.9, base + 3.25), S['roof']))
        for k in (-0.7, 0.7):
            arched_window(parts, S, wx + k, 0.9 - 2.3, base + 1.45, 0.5, 1.4)
    # tall arched windows on the main block: front (beside the portico), sides, back
    for f in range(2):
        z = base + 1.2 + f * 2.2
        for x in (-3.1, 3.1):
            arched_window(parts, S, x, 0.6 - md / 2, z, 0.55, 1.2)
        for x in (-2.4, -0.8, 0.8, 2.4):
            arched_window(parts, S, x, -(0.6 + md / 2) + 0.0, z, 0.55, 1.2, facing=math.pi)
    # the domed drum and lantern
    top = base + mh + 0.25
    parts.append(cyl('drum', 2.0, 1.3, (0, 0.6, top + 0.65), S['wall'], verts=24))
    parts.append(cyl('drum_band', 2.08, 0.18, (0, 0.6, top + 1.3), S['trim'], verts=24))
    for i in range(8):
        a = i / 8 * 2 * math.pi
        x, y = math.cos(a) * 2.0, 0.6 + math.sin(a) * 2.0
        parts.append(box(f'drum_win{i}', (0.3, 0.05, 0.75), (x * 1.005, 0.6 + (y - 0.6) * 1.005, top + 0.7), S['glass'], rot=(0, 0, a + math.pi / 2)))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=2.05, location=(0, 0.6, top + 1.35), segments=24, ring_count=12)
    dome = bpy.context.active_object
    dome.scale = (1, 1, 1.15)
    dome.data.materials.append(S['roof'])
    bpy.context.view_layer.objects.active = dome
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for v in dome.data.vertices:
        v.select = v.co.z < -1e-4
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.delete(type='VERT')
    bpy.ops.object.mode_set(mode='OBJECT')
    for p in dome.data.polygons:
        p.use_smooth = True
    parts.append(dome)
    parts.append(torus('dome_ring', 2.06, 0.07, (0, 0.6, top + 1.4), S['gold'], seg=24, minor_seg=4))
    lz = top + 1.35 + 2.05 * 1.15
    parts.append(cyl('lantern', 0.45, 0.8, (0, 0.6, lz + 0.35), S['glass'], verts=12))
    parts.append(cyl('lantern_cap', 0.55, 0.12, (0, 0.6, lz + 0.8), S['gold'], verts=12))
    parts.append(sphere('lantern_orb', 0.22, (0, 0.6, lz + 1.1), S['gold'], segs=10, rings=6))
    # half-round rib cuts under the hemisphere would show below: trim them by keeping ribs (they sit inside the drum)
    # portico: six columns, entablature with a piano-key frieze, pediment
    py = 0.6 - md / 2 - 1.1
    ch = 3.6
    for x in (-2.5, -1.5, -0.5, 0.5, 1.5, 2.5):
        column(parts, S, x, py, base, ch)
    parts.append(box('porch_floor', (6.2, 1.6, 0.1), (0, py + 0.2, base + 0.05), S['stone']))
    ent = base + ch
    parts.append(box('architrave', (6.2, 1.3, 0.25), (0, py + 0.25, ent + 0.12), S['trim']))
    # the frieze: white keys with black keys between, across the front
    parts.append(box('frieze', (6.2, 1.3, 0.34), (0, py + 0.27, ent + 0.42), S['trim']))
    n = 28
    for i in range(n):
        if i % 7 in (2, 6):
            continue
        x = -3.1 + 6.2 * (i + 1) / n
        parts.append(box(f'bk{i}', (0.09, 0.05, 0.22), (x, py - 0.4, ent + 0.48), S['dark']))
    parts.append(box('cornice_p', (6.6, 1.5, 0.16), (0, py + 0.25, ent + 0.67), S['trim'], bevel=0.02))
    # pediment: a triangular prism
    import bmesh
    bm = bmesh.new()
    hw, ph, y0, y1 = 3.3, 1.1, py - 0.5, py + 1.0
    vs = [bm.verts.new(p) for p in ((-hw, y0, 0), (hw, y0, 0), (0, y0, ph), (-hw, y1, 0), (hw, y1, 0), (0, y1, ph))]
    for f in ((0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('pediment')
    bm.to_mesh(me)
    bm.free()
    ped = bpy.data.objects.new('pediment', me)
    bpy.context.scene.collection.objects.link(ped)
    ped.location = (0, 0, ent + 0.75)
    ped.data.materials.append(S['roof'])
    parts.append(ped)
    parts.append(cyl('oculus', 0.3, 0.06, (0, py - 0.53, ent + 1.1), S['gold'], rot=(math.radians(90), 0, 0), verts=14))
    # the doors: tall double doors under the portico, a gold fanlight
    dy = 0.6 - md / 2
    parts.append(box('door_frame', (1.6, 0.1, 2.6), (0, dy - 0.03, base + 1.3), S['trim']))
    parts.append(box('door', (1.3, 0.1, 2.4), (0, dy - 0.07, base + 1.2), S['door']))
    parts.append(box('door_split', (0.04, 0.12, 2.4), (0, dy - 0.09, base + 1.2), S['gold']))
    parts.append(cyl('fanlight', 0.65, 0.08, (0, dy - 0.06, base + 2.4), S['glass'], rot=(math.radians(90), 0, 0), verts=14))
    join(parts, 'magic_hall')


def gazebo():
    reset()
    S = slots()
    parts = []
    R = 1.75
    parts.append(cyl('deck_base', R + 0.15, 0.35, (0, 0, 0.175), S['stone'], verts=6))
    parts.append(cyl('deck', R, 0.12, (0, 0, 0.41), S['trim'], verts=6))
    parts.append(box('step', (1.0, 0.45, 0.18), (0, -(R + 0.3), 0.09), S['stone']))
    H = 2.4
    for i in range(6):
        a = i / 6 * 2 * math.pi + math.pi / 6
        x, y = math.cos(a) * (R - 0.15), math.sin(a) * (R - 0.15)
        parts.append(cyl(f'col{i}', 0.08, H, (x, y, 0.47 + H / 2), S['trim'], verts=8))
        parts.append(box(f'cap{i}', (0.22, 0.22, 0.08), (x, y, 0.47 + H - 0.04), S['stone']))
        # rail between this column and the next, but leave the front (facing -Y) open
        b = a + math.pi / 3
        mid = (a + b) / 2
        if abs(((mid - (-math.pi / 2)) + math.pi) % (2 * math.pi) - math.pi) < 0.3:
            continue
        L = 2 * (R - 0.15) * math.sin(math.pi / 6)
        mx, my = math.cos(mid) * (R - 0.15) * math.cos(math.pi / 6), math.sin(mid) * (R - 0.15) * math.cos(math.pi / 6)
        parts.append(box(f'rail{i}', (L, 0.06, 0.06), (mx, my, 1.15), S['trim'], rot=(0, 0, mid + math.pi / 2)))
        parts.append(box(f'rail_lo{i}', (L, 0.05, 0.05), (mx, my, 0.65), S['trim'], rot=(0, 0, mid + math.pi / 2)))
        for k in (-0.3, 0, 0.3):
            parts.append(box(f'bal{i}{k}', (0.04, 0.04, 0.5), (mx + math.cos(mid + math.pi / 2) * k * L, my + math.sin(mid + math.pi / 2) * k * L, 0.9), S['trim']))
    top = 0.47 + H
    parts.append(cyl('ring', R + 0.05, 0.18, (0, 0, top + 0.09), S['trim'], verts=6))
    # bell roof: a lathe with an outward flare at the eaves
    prof = [(R + 0.35, top + 0.12), (R + 0.2, top + 0.3), (R * 0.85, top + 0.75), (R * 0.55, top + 1.25), (R * 0.3, top + 1.6), (0.12, top + 1.85), (0, top + 1.9)]
    parts.append(lathe('roof', prof, S['roof'], segs=12))
    parts.append(cyl('finial', 0.03, 0.5, (0, 0, top + 2.15), S['gold'], verts=6))
    parts.append(sphere('finial_orb', 0.1, (0, 0, top + 2.45), S['glass'], segs=8, rings=5))
    join(parts, 'magic_gazebo')


for name, make in (('magic_hall', hall), ('magic_gazebo', gazebo)):
    make()
    if prev:
        os.makedirs(prev, exist_ok=True)
        render_preview(os.path.join(prev, f'{name}.png'), size=(900, 700), angle_deg=-30, elev_deg=20)
    export_glb(os.path.join(OUT, f'{name}.glb'), budget=12000)
