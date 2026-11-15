"""
The guitarist's starter guitar, modelled in Blender: rounded body edges, a sunburst painted with
vertex colours (no texture), a neck with a round back, covered pickups, tuners, frets and strings.

    python tools/blender/build_guitar.py [--preview PNG] [--blend FILE] [--out PATH]

Same frame and measurements as buildStringed('guitar') in src/three/bass.ts, so the hands, the
strap and the sword-swing grip keep working: metres, origin where the neck meets the body, neck
along +X, +Y the upper side when played, +Z out of the face. The script builds in that frame
(Blender X, Y, Z = game x, y, z) and turns the model at the end so the glTF comes out right.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import box, cyl, export_glb, flag, join, mat, out_arg, render_preview, reset, sphere, tri_count  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.geometry import delaunay_2d_cdt  # noqa: E402

reset()

K = 0.86            # body scale of the guitar (the bass is 1)
T = 0.042 * K       # body thickness
FACE = T + 0.006    # top of the body
NUT = 0.47
SCALE = 0.648
R90 = math.radians(90)


def fret_x(n):
    return NUT - SCALE * (1 - 2 ** (-n / 12))


BOARD_END = fret_x(22.5)
HEEL = BOARD_END - 0.06
W_NUT, W_HEEL = 0.043, 0.056
BOARD_TOP = FACE + 0.023


def width_at(x):
    return W_HEEL + (W_NUT - W_HEEL) * ((x - HEEL) / (NUT - HEEL))


def lin(hex_color):
    h = hex_color.lstrip('#')
    return [(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))]


def spline(pts, k=1.0, per=6):
    """Uniform Catmull-Rom through pts and back to the first one (what THREE.Shape.splineThru draws)."""
    p = [Vector((x * k, y * k)) for x, y in pts] + [Vector((pts[0][0] * k, pts[0][1] * k))]
    out = []
    for i in range(len(p) - 1):
        p0, p1, p2, p3 = p[max(i - 1, 0)], p[i], p[i + 1], p[min(i + 2, len(p) - 1)]
        for s in range(per):
            t = s / per
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    return out


def normals2d(loop):
    """Outward unit normals of a counter-clockwise or clockwise closed 2D loop."""
    n = len(loop)
    area = sum(loop[i].x * loop[(i + 1) % n].y - loop[(i + 1) % n].x * loop[i].y for i in range(n))
    sign = 1 if area > 0 else -1
    out = []
    for i in range(n):
        d = loop[(i + 1) % n] - loop[i - 1]
        d = d.normalized() if d.length > 1e-9 else Vector((1, 0))
        out.append(Vector((d.y, -d.x)) * sign)
    return out


def dist_to_loop(pt, loop):
    best = 9.0
    for i in range(len(loop)):
        a, b = loop[i], loop[(i + 1) % len(loop)]
        ab = b - a
        t = max(0.0, min(1.0, (pt - a).dot(ab) / max(ab.length_squared, 1e-12)))
        best = min(best, (pt - (a + ab * t)).length)
    return best


def inside(pt, loop):
    c = False
    for i in range(len(loop)):
        a, b = loop[i], loop[i - 1]
        if (a.y > pt.y) != (b.y > pt.y) and pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x:
            c = not c
    return c


def new_object(name, bm, material, smooth=True):
    me = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(material)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def rounded_slab(name, outline, z0, z1, material, r_top=0.006, r_bot=0.003, colour=None, grid=0.0, steps=3):
    """A slab with the outline's shape and rolled-over edges. With `colour(dist_to_edge)` the top is
    triangulated on a grid and painted per vertex (the sunburst)."""
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('Color') if colour else None
    nrm = normals2d(outline)
    rings = []  # (inset, z)
    for s in range(steps + 1):  # bottom roll
        a = (s / steps) * math.pi / 2
        rings.append((r_bot * (1 - math.sin(a)), z0 + r_bot * (1 - math.cos(a))))
    for s in range(steps + 1):  # top roll
        a = (s / steps) * math.pi / 2
        rings.append((r_top * (1 - math.cos(a)), z1 - r_top + r_top * math.sin(a)))
    loops = [[bm.verts.new((p.x - n.x * ins, p.y - n.y * ins, z)) for p, n in zip(outline, nrm)] for ins, z in rings]
    n = len(outline)
    faces_side = []
    for a, b in zip(loops, loops[1:]):
        for i in range(n):
            faces_side.append(bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i])))
    bm.faces.new(loops[0])  # back
    top_loop = [Vector((v.co.x, v.co.y)) for v in loops[-1]]
    top_faces = []
    if colour and grid:
        pts = list(top_loop)
        xs, ys = [p.x for p in pts], [p.y for p in pts]
        y = min(ys)
        row = 0
        while y < max(ys):
            x = min(xs) + (grid / 2 if row % 2 else 0)
            while x < max(xs):
                q = Vector((x, y))
                if inside(q, top_loop) and dist_to_loop(q, top_loop) > grid * 0.45:
                    pts.append(q)
                x += grid
            y += grid * 0.866
            row += 1
        edges = [(i, (i + 1) % n) for i in range(n)]
        vs, _, fs, *_ = delaunay_2d_cdt(pts, edges, [], 3, 1e-6)  # 3 = keep only what is inside the outline
        top = [loops[-1][i] if i < n else bm.verts.new((v.x, v.y, z1)) for i, v in enumerate(vs)]
        for f in fs:
            try:
                top_faces.append(bm.faces.new([top[i] for i in f]))
            except ValueError:
                pass
    else:
        top_faces.append(bm.faces.new(loops[-1]))
    if col:
        for f in bm.faces:
            for lp in f.loops:
                d = dist_to_loop(Vector((lp.vert.co.x, lp.vert.co.y)), outline)
                lp[col] = (*colour(d if lp.vert.co.z > (z0 + z1) / 2 else 0.0), 1.0)
    return new_object(name, bm, material)


def lerp3(a, b, t):
    return [a[i] + (b[i] - a[i]) * t for i in range(3)]


# ---------------------------------------------------------------- materials
BURST = [lin('#f7b541'), lin('#e2661f'), lin('#8a2a0c'), lin('#3a1206')]  # centre -> edge


def burst(d):
    t = max(0.0, min(1.0, d / 0.075))
    if t > 0.6:
        return lerp3(BURST[1], BURST[0], (t - 0.6) / 0.4)
    if t > 0.25:
        return lerp3(BURST[2], BURST[1], (t - 0.25) / 0.35)
    return lerp3(BURST[3], BURST[2], t / 0.25)


FINISH = mat('finish', '#ffffff', rough=0.28, metal=0.2)
nt = FINISH.node_tree
attr = nt.nodes.new('ShaderNodeVertexColor')
attr.layer_name = 'Color'
bsdf = nt.nodes['Principled BSDF']
nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Coat Weight'].default_value = 1.0
bsdf.inputs['Coat Roughness'].default_value = 0.08
FINISH.diffuse_color = (*BURST[1], 1)

PEARL = mat('pearl', '#f3f2f5', rough=0.25)
PEARL.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value = 0.6
MAPLE = mat('maple', '#e6ad62', rough=0.4)
ROSE = mat('rosewood', '#3b1d14', rough=0.7)
CHROME = mat('chrome', '#d4d9e0', rough=0.25, metal=0.45)
BLACK = mat('black', '#111114', rough=0.45)
CREAM = mat('cream', '#efe4c8', rough=0.5)

parts = []

# ---------------------------------------------------------------- body
BODY = [(0.0, 0.034), (0.09, 0.055), (0.135, 0.088), (0.115, 0.128), (0.04, 0.138), (-0.1, 0.117), (-0.25, 0.163), (-0.38, 0.158),
        (-0.442, 0.06), (-0.442, -0.06), (-0.38, -0.166), (-0.25, -0.168), (-0.12, -0.122), (-0.03, -0.132), (0.05, -0.108),
        (0.062, -0.07), (0.03, -0.046), (0.0, -0.034)]
body = rounded_slab('body', spline(BODY, K, per=5), -0.006, FACE, FINISH, r_top=0.009, r_bot=0.005, colour=burst, grid=0.022)

GUARD = [(0.0, 0.036), (0.075, 0.058), (0.088, 0.088), (0.035, 0.118), (-0.08, 0.104), (-0.18, 0.128), (-0.25, 0.108), (-0.262, 0.05),
         (-0.215, -0.03), (-0.16, -0.098), (-0.075, -0.112), (-0.01, -0.06), (0.0, -0.036)]
parts.append(rounded_slab('guard', spline(GUARD, K, per=4), FACE - 0.001, FACE + 0.0028, PEARL, r_top=0.0012, r_bot=0.0, steps=1))

# ---------------------------------------------------------------- neck: flat top, round back
bm = bmesh.new()
SEG = 8
stations = [HEEL + (NUT - HEEL) * i / 5 for i in range(6)]
rows = []
for x in stations:
    hw = width_at(x) / 2
    depth = 0.023 if x > 0.12 else 0.02  # a touch fuller past the body
    row = [bm.verts.new((x, hw, FACE + 0.017))]
    for s in range(SEG + 1):
        a = math.pi * s / SEG
        row.append(bm.verts.new((x, hw * math.cos(a), FACE + 0.013 - depth * math.sin(a) ** 0.8)))
    row.append(bm.verts.new((x, -hw, FACE + 0.017)))
    rows.append(row)
m = len(rows[0])
for a, b in zip(rows, rows[1:]):
    for i in range(m):
        bm.faces.new((a[i], a[(i + 1) % m], b[(i + 1) % m], b[i]))
bm.faces.new(rows[0])
bm.faces.new(rows[-1])
parts.append(new_object('neck', bm, MAPLE))

# fretboard, a hair wider at the body end, edges eased
bm = bmesh.new()
quad = []
for z in (FACE + 0.017, BOARD_TOP):
    quad.append([bm.verts.new((x, s * width_at(x) / 2, z)) for x, s in ((BOARD_END, 1), (NUT, 1), (NUT, -1), (BOARD_END, -1))])
for i in range(4):
    bm.faces.new((quad[0][i], quad[0][(i + 1) % 4], quad[1][(i + 1) % 4], quad[1][i]))
bm.faces.new(quad[0])
bm.faces.new(quad[1])
parts.append(new_object('board', bm, ROSE, smooth=False))

for n in range(1, 23):
    x = fret_x(n)
    parts.append(box(f'fret{n}', (0.0018, width_at(x) * 0.97, 0.002), (x, 0, BOARD_TOP + 0.0008), CHROME))
for n in (3, 5, 7, 9, 12, 15, 17, 19, 21):
    x = (fret_x(n) + fret_x(n - 1)) / 2
    for y in ((-0.012, 0.012) if n == 12 else (0,)):
        parts.append(cyl(f'dot{n}', 0.0035, 0.001, (x, y, BOARD_TOP + 0.0002), PEARL, verts=8, smooth=False))
parts.append(box('nut', (0.004, W_NUT, 0.006), (NUT, 0, BOARD_TOP + 0.002), CREAM))

# ---------------------------------------------------------------- headstock and tuners
HEAD = [(NUT - 0.002, -0.021), (NUT - 0.002, 0.021), (NUT + 0.04, 0.03), (NUT + 0.1, 0.046), (NUT + 0.18, 0.058),
        (NUT + 0.212, 0.042), (NUT + 0.205, 0.004), (NUT + 0.13, -0.014), (NUT + 0.05, -0.026)]
parts.append(rounded_slab('head', spline(HEAD, 1, per=4), FACE, FACE + 0.018, MAPLE, r_top=0.003, r_bot=0.003, steps=2))
HEAD_TOP = FACE + 0.018
tuner_x = []
for i in range(6):
    x = NUT + 0.045 + i * 0.026
    y = 0.022 + i * 0.005
    tuner_x.append(x)
    parts.append(cyl(f'post{i}', 0.0042, 0.02, (x, y, HEAD_TOP + 0.008), CHROME, verts=8))
    parts.append(cyl(f'washer{i}', 0.008, 0.004, (x, y, HEAD_TOP + 0.001), CHROME, verts=10))
    parts.append(cyl(f'shaft{i}', 0.0028, 0.035, (x, y + 0.0175, FACE + 0.006), CHROME, rot=(R90, 0, 0), verts=6))
    parts.append(sphere(f'key{i}', 0.011, (x, y + 0.042, FACE + 0.006), CHROME, scale=(1, 0.55, 0.36), segs=8, rings=4))

# ---------------------------------------------------------------- pickups: cream ring, black cover, pole pieces
for j, px in enumerate((-0.17 * K, -0.27 * K)):
    parts.append(box(f'pu_ring{j}', (0.05, 0.086, 0.006), (px, 0, FACE + 0.002), CREAM, bevel=0.002))
    parts.append(box(f'pu{j}', (0.038, 0.07, 0.014), (px, 0, FACE + 0.006), BLACK, bevel=0.003))
    for i in range(6):
        parts.append(cyl(f'pole{j}_{i}', 0.0026, 0.002, (px + 0.009, -0.026 + i * 0.0104, FACE + 0.0135), CHROME, verts=6, smooth=False))

# ---------------------------------------------------------------- bridge, controls, strap buttons
BX = NUT - SCALE
parts.append(box('bridge', (0.06, 0.082, 0.004), (BX - 0.022, 0, FACE + 0.002), CHROME))
SPREAD_NUT, SPREAD_BRIDGE = 0.018, 0.026
for i in range(6):
    y = -SPREAD_BRIDGE + 2 * SPREAD_BRIDGE * i / 5
    parts.append(box(f'saddle{i}', (0.016, 0.0085, 0.01), (BX - 0.004, y, FACE + 0.008), CHROME))
parts.append(box('plate', (0.11, 0.032, 0.003), (-0.27 * K, -0.105 * K, FACE + 0.001), CHROME))
for kx in (-0.24, -0.29):
    parts.append(cyl('knob', 0.011, 0.014, (kx * K, -0.105 * K, FACE + 0.009), BLACK, verts=14, bevel=0.003))
    parts.append(cyl('knob_cap', 0.0075, 0.002, (kx * K, -0.105 * K, FACE + 0.0165), CHROME, verts=12))
parts.append(cyl('jack', 0.006, 0.01, (-0.36 * K, -0.135 * K, FACE + 0.005), CHROME, verts=8))
parts.append(cyl('switch', 0.002, 0.016, (-0.215 * K, -0.105 * K, FACE + 0.01), CHROME, verts=5, rot=(0.35, 0, 0)))
parts.append(cyl('pin_horn', 0.006, 0.012, (0.13 * K, 0.09 * K, T / 2), CHROME, rot=(R90, 0, 0), verts=8))
parts.append(cyl('pin_tail', 0.006, 0.012, (-0.448 * K, 0, T / 2), CHROME, rot=(0, R90, 0), verts=8))


# ---------------------------------------------------------------- strings (thickest on +Y)
def rod(name, a, b, r, material):
    a, b = Vector(a), Vector(b)
    o = cyl(name, r, (b - a).length, (a + b) / 2, material, verts=4, smooth=False)
    o.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return o


for i in range(6):
    f = i / 5
    a = (NUT, -SPREAD_NUT + 2 * SPREAD_NUT * f, BOARD_TOP + 0.004)
    b = (BX - 0.004, -SPREAD_BRIDGE + 2 * SPREAD_BRIDGE * f, FACE + 0.0135)
    h = (tuner_x[5 - i], 0.022 + (5 - i) * 0.005, HEAD_TOP + 0.012)
    r = 0.0005 + 0.0005 * f
    parts.append(rod(f'string{i}', a, b, r, CHROME))
    parts.append(rod(f'string_head{i}', a, h, r, CHROME))

# ---------------------------------------------------------------- finish
bpy.context.view_layer.update()
rest = join(parts, 'guitar_parts')
for ob in (body, rest):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    ob.rotation_euler = (R90, 0, 0)  # game (x, y, z) -> Blender (x, -z, y); glTF's Y-up export turns it back
    bpy.ops.object.transform_apply(rotation=True)
body.name = 'guitar_body'
print(f'[ml] body {tri_count([body])} + parts {tri_count([rest])} triangles')

if (blend := flag('--blend')):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(blend))
if (png := flag('--preview')):
    render_preview(os.path.abspath(png), angle_deg=20, elev_deg=10)
export_glb(out_arg('public/models/weapons/guitar.glb'), budget=6000, vertex_colors=True)
