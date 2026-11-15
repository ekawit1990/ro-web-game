"""
The 55 music-hat looks (65 hat items) rebuilt in Blender: smoother shapes, rolled brim edges,
stitched cap panels, swept horns, bevelled notes and stars.

    python tools/blender/build_hats.py [--only cap,fedora] [--preview DIR]

Hat space is the same as src/three/hats.ts: the head is a ball of radius ~0.35 at the origin, the
forehead line is y ≈ 0.12, the front is +Z, Y up. Each look is written to
public/models/hats/<kind>[_<variant>].glb.gz. Colours are not baked in: parts use the material
names c1 / c2 / c3 (the item's colour slots), glow_<slot>, or a fixed '#rrggbb'; the game paints
them from the item's `hat.c` (src/three/blenderHats.ts).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from ml_blender import export_glb, flag, render_preview, reset, tri_count, REPO  # noqa: E402
from three_like import TAU, Node, box, capsule, cone, cyl, extrude, lathe, octa, sphere, sweep, torus, build, mesh  # noqa: E402

PI = math.pi


def glow(c):
    return c if c.startswith('glow_') else 'glow_' + c


# ---------------------------------------------------------------- shared parts

def S(r, w=28, h=16, mat='c1', **kw):
    return sphere(r, w, h, mat=mat, **kw)


def dome(g, c, r=0.37, y=0.03, down=1.35, seams=0):
    d = g.add(sphere(r, 40, 18, mat=c, th_len=down, pos=(0, y, 0)))
    # sewn panels: raised seams along the meridians and a button on top
    for k in range(seams):
        sm = torus(r + 0.002, 0.0045, 6, 36, arc=2 * down, mat=c, pos=(0, y, 0))
        sm.rotateY(k * PI / seams).rotateZ(PI / 2 - down)
        g.add(sm)
    return d


def brim(g, c, r, y=0.12, thick=0.025, sx=1.0, sz=1.0, droop=0.0, z=0.0, rx=0.0):
    """Flat brim with a rolled edge; droop bends it down at the sides (caps)."""
    t = thick / 2
    prof = [(0.0, -t)]
    for k in range(7):  # rounded rim
        a = -PI / 2 + PI * k / 6
        prof.append((r - t + t * math.cos(a), t * math.sin(a)))
    prof.append((0.0, t))
    b = lathe(prof, 48, mat=c, pos=(0, y, z), scale=(sx, 1, sz), rot=(rx, 0, 0))
    if droop:
        b.verts = [v.__class__((v.x, v.y - droop * (v.x / r) ** 2, v.z)) for v in b.verts]
    g.add(b)
    return b


def band(g, c, r, y, h=0.05):
    g.add(cyl(r, r, h, 40, mat=c, pos=(0, y, 0), open_ended=True))
    # a little roll at both edges
    for yy in (y - h / 2, y + h / 2):
        g.add(torus(r, 0.004, 6, 40, mat=c, pos=(0, yy, 0), rot=(PI / 2, 0, 0)))


def headband(g, c, r=0.385, thick=0.028):
    g.add(torus(r, thick, 10, 40, arc=PI, mat=c, pos=(0, 0.03, 0)))


def note_loops(s):
    head = []
    for i in range(24):
        a = TAU * i / 24
        x, y = 0.32 * s * math.cos(a), 0.22 * s * math.sin(a)
        ca, sa = math.cos(-0.35), math.sin(-0.35)
        head.append((x * ca - y * sa, x * sa + y * ca))

    def quad(p0, c, p1, n=8):
        return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1])
                for t in (i / n for i in range(1, n + 1))]
    stem = [(0.22 * s, 0.05 * s), (0.3 * s, 0.05 * s), (0.3 * s, 1.0 * s)]
    stem += quad((0.3 * s, 1.0 * s), (0.62 * s, 0.82 * s), (0.6 * s, 0.5 * s))
    stem += quad((0.6 * s, 0.5 * s), (0.52 * s, 0.72 * s), (0.3 * s, 0.76 * s))[:-1]
    stem += [(0.3 * s, 0.76 * s), (0.22 * s, 1.0 * s)]
    off = (-0.15 * s, -0.45 * s)
    return [[(x + off[0], y + off[1]) for x, y in loop] for loop in (head, stem)]


def note(g, c, s, x, y, z, ry=0.0, rz=0.0):
    n = extrude(note_loops(s), 0.105 * s, mat=glow(c), bevel=0.012 * s, pos=(x, y, z), rot=(0, ry, rz))
    for v in n.verts:
        v.z -= 0.05 * s
    g.add(n)
    return n


def star(g, c, s, x, y, z):
    pts = []
    for i in range(10):
        a = (i / 10) * TAU + PI / 2
        r = s * 0.42 if i % 2 else s
        pts.append((math.cos(a) * r, math.sin(a) * r))
    return g.add(extrude([pts], s * 0.35, mat=glow(c), bevel=s * 0.06, pos=(x, y, z)))


def gem(g, c, s, x, y, z):
    m = octa(s, mat=glow(c), pos=(x, y, z), scale=(1, 1.3, 0.7), outline=False)
    # a cut stone: octahedron with a table facet ring
    g.add(m)
    return m


def pom(g, c, r, x, y, z):
    g.add(S(r, 20, 12, mat=c, pos=(x, y, z)))


def ring_of(n, r, f, arc=TAU, start=0.0):
    for i in range(n):
        a = start + ((i / n) * arc if arc == TAU else (i / max(1, n - 1)) * arc)
        f(a, math.sin(a) * r, math.cos(a) * r, i)


def ears(g, kind, c, inner):
    headband(g, c, 0.385, 0.024)
    for s in (-1, 1):
        if kind == 'bunny':
            g.add(capsule(0.07, 0.36, 8, 20, mat=c, pos=(s * 0.16, 0.6, -0.02), rot=(0, 0, -s * 0.18), scale=(1, 1, 0.55)))
            g.add(capsule(0.04, 0.28, 6, 16, mat=inner, pos=(s * 0.16, 0.6, 0.012), rot=(0, 0, -s * 0.18), scale=(1, 1, 0.5)))
        elif kind == 'bear':
            g.add(S(0.11, mat=c, pos=(s * 0.27, 0.36, 0), scale=(1, 1, 0.6)))
            g.add(S(0.065, mat=inner, pos=(s * 0.27, 0.36, 0.045), scale=(1, 1, 0.5)))
        else:
            h = 0.3 if kind == 'fox' else 0.22
            # soft rounded ears instead of 4-sided pyramids
            g.add(cone(0.11, h, 24, mat=c, pos=(s * 0.22, 0.38 + h / 2 - 0.1, 0), rot=(0, 0, -s * 0.45), scale=(1, 1, 0.5)))
            g.add(cone(0.065, h * 0.65, 20, mat=inner, pos=(s * 0.215, 0.36 + h / 2 - 0.12, 0.03), rot=(0, 0, -s * 0.45), scale=(1, 1, 0.35)))


def horn(g, c, s, x, y, z, side, curl=0.6):
    """Swept, tapering horn following the same bend as the code version."""
    px, py, a = x, y, side * 0.5
    path, radii = [(px, py, z)], [0.06 * s * 1.05]
    for k in range(4):
        for sub in range(3):
            ln = 0.1 * s / 3
            px += math.sin(a) * ln
            py += math.cos(a) * ln
            a -= side * curl * 0.35 / 3
            path.append((px, py, z))
            radii.append(0.06 * s * (1 - (k + (sub + 1) / 3) * 0.22))
    radii[-1] = 0.004
    g.add(sweep(path, radii, 14, mat=c))
    # growth rings near the base
    for k in (1, 2, 3):
        p = path[k]
        g.add(S(radii[k] * 1.08, 14, 6, mat=c, pos=p, scale=(1, 0.35, 1), rot=(0, 0, -(side * 0.5 - side * curl * 0.35 / 3 * k))))


def feather(g, c, s, x, y, z, rz, rx=0.0):
    f = Node(pos=(x, y, z), rot=(rx, 0, rz))
    f.add(S(0.06 * s, 16, 12, mat=c, scale=(0.45, 2.6, 0.25)))
    f.add(cyl(0.004 * s, 0.006 * s, 0.32 * s, 6, mat='#f5f0e6', pos=(0, -0.02 * s, 0.012 * s)))  # quill
    g.add(f)


def flower(g, c, centre, s, x, y, z, ry):
    f = Node(pos=(x, y, z), rot=(0, ry, 0))
    for i in range(5):
        a = (i / 5) * TAU
        f.add(S(0.045 * s, 10, 6, mat=c, pos=(math.cos(a) * 0.045 * s, math.sin(a) * 0.045 * s, 0), scale=(1, 1, 0.4)))
    f.add(S(0.03 * s, 8, 6, mat=centre, pos=(0, 0, 0.012)))
    g.add(f)


def tube(g, c, rt, rb, h, y):
    g.add(cyl(rt, rb, h, 40, mat=c, pos=(0, y + h / 2, 0)))
    # rounded top edge
    g.add(torus(rt, 0.008, 6, 40, mat=c, pos=(0, y + h, 0), rot=(PI / 2, 0, 0)))


# ---------------------------------------------------------------- the looks

def cap(g, v):
    dome(g, 'c1', seams=3)
    b = brim(g, 'c2', 0.24, 0.12, 0.025, 1.2, 0.8, droop=0.035, z=-0.3 if v == 'back' else 0.3)
    pom(g, 'c2', 0.04, 0, 0.4, 0)
    if v == 'back':
        star(g, 'c3', 0.08, -0.04, 0.27, 0.3)
        # the strap opening at the front
        g.add(box(0.12, 0.04, 0.02, mat='c1', pos=(0, 0.14, 0.355)))
    else:
        note(g, 'c3', 0.17, 0, 0.27, 0.3)


def beanie(g, v):
    d = dome(g, 'c1', 0.38, 0.03, 1.4)
    d.scale.y = 1.12
    # knitted cuff: a fat ring with rib grooves
    g.add(torus(0.36, 0.045, 12, 48, mat='c2', pos=(0, 0.12, 0), rot=(PI / 2, 0, 0)))
    for k in range(24):
        a = TAU * k / 24
        g.add(box(0.008, 0.07, 0.01, mat='c2', pos=(math.sin(a) * 0.405, 0.12, math.cos(a) * 0.405), rot=(0, a, 0)))
    if v == 'stripes':
        for y, r in ((0.25, 0.338), (0.36, 0.25)):
            g.add(torus(r, 0.028, 8, 40, mat='c3', pos=(0, y, 0), rot=(PI / 2, 0, 0)))
    elif v == 'rasta':
        for y, r, col in ((0.22, 0.352, 'c2'), (0.31, 0.3, 'c3')):
            g.add(torus(r, 0.03, 8, 40, mat=col, pos=(0, y, 0), rot=(PI / 2, 0, 0)))
    if v != 'rasta':
        # fluffy pom: a cluster of balls
        for k, (dx, dy, dz) in enumerate(((0, 0.47, 0), (0.04, 0.5, 0.02), (-0.04, 0.49, -0.02), (0.01, 0.52, -0.03))):
            pom(g, 'c3', 0.075 if k == 0 else 0.055, dx, dy, dz)
    note(g, 'c3', 0.12, 0.17, 0.16, 0.33, 0.45)


def beret(g, v):
    g.add(S(0.4, 40, 16, mat='c1', pos=(-0.06, 0.3, -0.02), scale=(1, 0.32, 1), rot=(0, 0, 0.2)))
    g.add(torus(0.335, 0.03, 10, 44, mat='c1', pos=(0, 0.17, 0), rot=(PI / 2, 0, 0)))
    g.add(cyl(0.012, 0.02, 0.06, 10, mat='c1', pos=(-0.08, 0.43, 0)))
    note(g, 'c2', 0.13, 0.22, 0.26, 0.26, 0.6)


def fedora(g, v):
    # pinched crown: lathe with a centre dent, then squeezed at the front
    prof = [(0.34, 0.16), (0.33, 0.25), (0.305, 0.38), (0.27, 0.43), (0.18, 0.44), (0.08, 0.40), (0.0, 0.39)]
    cr = lathe(prof, 40, mat='c1')
    for vv in cr.verts:
        if vv.z > 0.12 and vv.y > 0.3:  # front pinch
            vv.x *= 0.82
    g.add(cr)
    band(g, 'c2', 0.343, 0.2, 0.06)
    g.add(box(0.06, 0.05, 0.02, mat='c2', pos=(0.28, 0.2, -0.2), rot=(0, -0.95, 0)))  # bow on the band
    b = brim(g, 'c1', 0.52, 0.16, 0.025, rx=0.12)
    # snap brim: front down a little, back up
    b.verts = [vv.__class__((vv.x, vv.y + 0.04 * (-vv.z / 0.52) * (abs(vv.z) > 0.3), vv.z)) for vv in b.verts]
    feather(g, 'c3', 1.3, 0.3, 0.32, -0.08, -0.6)


def tophat(g, v):
    tube(g, 'c1', 0.29, 0.27, 0.5, 0.14)
    band(g, 'c2', 0.28, 0.2, 0.08)
    brim(g, 'c1', 0.46, 0.15, 0.03, 1, 0.92, droop=-0.04)
    if v == 'metronome':
        g.add(cone(0.08, 0.16, 4, mat='c3', pos=(0, 0.3, 0.29), rot=(0, PI / 4, 0)))
        g.add(cyl(0.008, 0.008, 0.16, 8, mat='#eeeeee', pos=(0.02, 0.33, 0.33), rot=(0, 0, -0.35)))
        g.add(box(0.03, 0.02, 0.02, mat='#eeeeee', pos=(0.045, 0.39, 0.335), rot=(0, 0, -0.35)))
    elif v == 'mask':
        # a masquerade mask: two eye lobes with holes look
        for s in (-1, 1):
            g.add(S(0.06, 20, 12, mat='c3', pos=(0.16 + s * 0.045, 0.24, 0.25), scale=(1, 0.65, 0.35)))
            g.add(S(0.025, 12, 8, mat='#111111', pos=(0.16 + s * 0.045, 0.24, 0.27), scale=(1, 0.6, 0.3)))
        feather(g, 'c2', 1.2, -0.2, 0.52, 0.12, 0.4)
    else:
        note(g, 'c3', 0.16, 0.18, 0.22, 0.27, 0.6)


def cowboy(g, v):
    if v == 'sombrero':
        g.add(cyl(0.25, 0.33, 0.27, 40, mat='c1', pos=(0, 0.29, 0)))
        band(g, 'c2', 0.33, 0.19, 0.05)
        g.add(cyl(0.12, 0.25, 0.25, 40, mat='c1', pos=(0, 0.5, 0)))
        g.add(S(0.12, 24, 8, mat='c1', pos=(0, 0.625, 0), th_len=PI / 2, scale=(1, 0.3, 1)))
        g.add(torus(0.62, 0.05, 10, 56, mat='c2', pos=(0, 0.17, 0), rot=(PI / 2, 0, 0)))
        brim(g, 'c1', 0.62, 0.15, 0.025, droop=-0.06)
        ring_of(8, 0.5, lambda a, x, z, i: pom(g, 'c3', 0.035, x, 0.17, z))
    else:
        prof = [(0.33, 0.16), (0.32, 0.3), (0.29, 0.41), (0.2, 0.44), (0.12, 0.40), (0.0, 0.41)]
        g.add(lathe(prof, 40, mat='c1'))
        band(g, 'c2', 0.33, 0.19, 0.05)
        # one brim that curls up at the sides
        b = brim(g, 'c1', 0.5, 0.15, 0.025, 1, 1.1)
        b.verts = [vv.__class__((vv.x, vv.y + 0.55 * max(0.0, abs(vv.x) - 0.3) ** 1.5 * 3, vv.z)) for vv in b.verts]
        star(g, 'c3', 0.06, 0, 0.19, 0.33)


def crown(g, v):
    n = 7 if v == 'crystal' else 8
    band(g, 'c1', 0.3, 0.22, 0.1)
    g.add(torus(0.3, 0.012, 6, 40, mat='c1', pos=(0, 0.27, 0), rot=(PI / 2, 0, 0)))

    def point(a, x, z, i):
        if v == 'crystal':
            g.add(octa(0.07, mat=glow('c2' if i % 2 else 'c3'), pos=(x, 0.36 + (0 if i % 2 else 0.06), z), scale=(0.7, 2.2, 0.7), outline=False))
        else:
            g.add(cone(0.055, 0.17, 4, mat='c1', pos=(x, 0.35, z), rot=(0, a, 0)))
            pom(g, 'c2', 0.025, x, 0.45, z)
            g.add(octa(0.018, mat=glow('c3'), pos=(x * 1.02, 0.25, z * 1.02), outline=False))
    ring_of(n, 0.3, point)
    if v != 'crystal':
        g.add(S(0.27, 28, 10, mat='#7a1020', pos=(0, 0.25, 0), th_len=PI / 2, scale=(1, 0.5, 1)))  # velvet cap
    gem(g, 'c3', 0.05, 0, 0.22, 0.31)


def tiara(g, v):
    headband(g, 'c1', 0.38, 0.02)

    def spike(a, x, z, i):
        h = 0.07 + (3 - abs(i - 3)) * 0.035
        g.add(cone(0.03, h, 4, mat='c1', pos=(x, 0.32 + h / 2, z * 0.95), rot=(0, a, 0)))
        if i % 2 == 0:
            pom(g, 'c3', 0.022, x, 0.32, z * 0.97)
    ring_of(7, 0.37, spike, 1.3, -0.65)
    gem(g, 'c2', 0.055, 0, 0.42, 0.36)


def halo(g, v):
    g.add(torus(0.26, 0.03, 12, 48, mat=glow('c1'), pos=(0, 0.62, -0.04), rot=(PI / 2 - 0.25, 0, 0), outline=False))
    if v == 'echo':
        for k, y in ((1.3, 0.55), (1.65, 0.5)):
            g.add(torus(0.26 * k, 0.012, 8, 56, mat='trans_c2', pos=(0, y, -0.04), rot=(PI / 2 - 0.25, 0, 0), outline=False))
    if v == 'wings':
        for s in (-1, 1):
            for k in range(3):
                g.add(S(0.1, 18, 12, mat='c2', pos=(s * (0.42 + k * 0.06), 0.18 + k * 0.07, -0.08), scale=(0.35, 1.6 - k * 0.3, 0.5), rot=(0, 0, s * (0.6 + k * 0.25))))


def horns(g, v):
    headband(g, 'c2', 0.385, 0.026)
    s = 1.7 if v == 'big' else 1.15
    for side in (-1, 1):
        horn(g, 'c1', s, side * 0.2, 0.33, 0.06, side, 1.1 if v == 'big' else 0.4)


def ears_look(g, v):
    ears(g, v, 'c1', 'c2')
    note(g, 'c3', 0.12, 0.3, 0.22, 0.2, 0.9)


def antenna(g, v):
    headband(g, 'c1')
    for s in (-1, 1):
        # a real spring: one swept helix
        path, radii = [], []
        for k in range(85):
            t = k / 84
            a = t * 7 * TAU
            path.append((s * (0.16 + t * 0.06) + 0.025 * math.cos(a), 0.38 + t * 0.22 + 0.006 * math.sin(a), 0.025 * math.sin(a)))
            radii.append(0.007)
        g.add(sweep(path, radii, 6, mat='#cfd8dc'))
        note(g, 'c2' if s < 0 else 'c3', 0.2, s * 0.24, 0.7, 0)


def flowers(g, v):
    laurel = v == 'laurel'
    g.add(torus(0.34, 0.03, 8, 40, mat='c1' if laurel else '#6a9a3a', pos=(0, 0.2, 0), rot=(PI / 2, 0, 0)))

    def leaf(a, x, z, i):
        if laurel:
            g.add(S(0.05, 14, 10, mat='c1' if i % 2 else 'c2', pos=(x, 0.24, z), scale=(0.5, 1.6, 0.3), rot=(0, a, 0.5 if i % 2 else -0.5)))
        else:
            flower(g, 'c1' if i % 2 else 'c2', 'c3', 1.1, x, 0.22, z, a)
            g.add(S(0.03, 10, 8, mat='#6a9a3a', pos=(x * 1.03, 0.17, z * 1.03), scale=(1.4, 0.5, 0.8), rot=(0, a + 0.7, 0)))
    ring_of(16 if laurel else 9, 0.34, leaf)
    if laurel:
        gem(g, 'c3', 0.05, 0, 0.24, 0.35)


def bandana(g, v):
    d = dome(g, 'c1', 0.375, 0.02, 1.45)
    d.scale.y = 0.92
    pom(g, 'c1', 0.06, 0, 0.12, -0.37)
    for s in (-1, 1):
        g.add(box(0.08, 0.2, 0.02, mat='c1', pos=(s * 0.06, 0.0, -0.39), rot=(0, 0, s * 0.3)))
        g.add(cone(0.05, 0.05, 3, mat='c1', pos=(s * 0.09, -0.12, -0.39), rot=(PI, 0, s * 0.3), scale=(1, 1, 0.25)))  # cut tail ends
    if v == 'plate':
        g.add(box(0.24, 0.1, 0.03, mat='c2', pos=(0, 0.18, 0.35), rot=(-0.2, 0, 0)))
        for s in (-1, 1):
            g.add(cyl(0.008, 0.008, 0.01, 8, mat='#cfd8dc', pos=(s * 0.1, 0.18, 0.37), rot=(PI / 2 - 0.2, 0, 0)))  # rivets
        note(g, 'c3', 0.08, 0, 0.17, 0.37)
    else:
        ring_of(8, 0.37, lambda a, x, z, i: pom(g, 'c2', 0.025, x * 0.97, 0.2, z * 0.97))


def viking(g, v):
    dome(g, 'c1', 0.38, 0.03, 1.4)
    g.add(torus(0.37, 0.035, 10, 44, mat='c2', pos=(0, 0.12, 0), rot=(PI / 2, 0, 0)))
    ring_of(12, 0.4, lambda a, x, z, i: g.add(S(0.012, 8, 6, mat='#cfd8dc', pos=(x, 0.12, z))))  # rivets
    g.add(box(0.05, 0.36, 0.05, mat='c2', pos=(0, 0.3, 0.32), rot=(-0.6, 0, 0)))
    if v == 'knight':
        for k in range(6):
            feather(g, 'c3', 1.4, 0, 0.42 + math.sin(k * 0.5) * 0.04, 0.18 - k * 0.09, 0, -0.3 + k * 0.25)
    elif v == 'samurai':
        g.add(torus(0.2, 0.025, 8, 28, arc=PI, mat='c3', pos=(0, 0.3, 0.36)))
        for s in (-1, 1):
            g.add(box(0.2, 0.18, 0.03, mat='c1', pos=(s * 0.38, 0.05, 0.05), rot=(0, s * 1.3, s * 0.4)))
    else:
        for s in (-1, 1):
            horn(g, 'c3', 1.3, s * 0.34, 0.2, 0, s, 1.2)


def witch(g, v):
    # a bent, wrinkled cone: lathe then a kink near the tip
    prof = [(0.3, -0.375), (0.27, -0.2), (0.22, -0.05), (0.15, 0.1), (0.09, 0.22), (0.04, 0.32), (0.0, 0.375)]
    c = lathe(prof, 32, mat='c1', pos=(0.0, 0.52, -0.05), rot=(-0.18, 0, 0.15))
    c.verts = [vv.__class__((vv.x - 0.12 * max(0.0, vv.y - 0.1) ** 1.3 * 4, vv.y, vv.z)) for vv in c.verts]
    g.add(c)
    band(g, 'c2', 0.3, 0.19, 0.06)
    g.add(box(0.07, 0.06, 0.012, mat='#ffd54f', pos=(0, 0.19, 0.305), outline=False))  # buckle
    brim(g, 'c1', 0.56, 0.15, 0.025, droop=0.05)
    star(g, 'c3', 0.06, 0.12, 0.22, 0.3)
    note(g, 'c3', 0.12, -0.14, 0.3, 0.25, -0.4)


def party(g, v):
    c = Node(pos=(0.05, 0.3, 0), rot=(0, 0, -0.2))
    c.add(cone(0.22, 0.5, 32, mat='c1', pos=(0, 0.25, 0)))
    for k in range(3):
        c.add(torus(0.19 - k * 0.055, 0.018, 8, 32, mat='c2', pos=(0, 0.06 + k * 0.12, 0), rot=(PI / 2, 0, 0)))
    for k in range(6):  # tinsel on top
        a = TAU * k / 6
        c.add(S(0.035, 10, 8, mat='c3', pos=(math.sin(a) * 0.04, 0.52 + 0.02 * (k % 2), math.cos(a) * 0.04)))
    c.add(S(0.05, 16, 12, mat='c3', pos=(0, 0.54, 0)))
    g.add(c)
    note(g, 'c3', 0.1, -0.15, 0.45, 0.2, -0.3)


def shako(g, v):
    tube(g, 'c1', 0.3, 0.27, 0.42, 0.12)
    band(g, 'c2', 0.285, 0.15, 0.05)
    band(g, 'c2', 0.302, 0.52, 0.04)
    gem(g, '#ffd54f', 0.06, 0, 0.32, 0.29)
    g.add(octa(0.09, mat='#ffd54f', pos=(0, 0.32, 0.285), scale=(1, 1.1, 0.15)))  # badge plate
    g.add(cyl(0.22, 0.22, 0.02, 32, mat='#1b1b1b', pos=(0, 0.14, 0.24), scale=(1, 1, 0.6), rot=(0.15, 0, 0)))
    for k in range(5):
        feather(g, 'c3', 1.6, (k - 2) * 0.03, 0.72, 0.18, (k - 2) * 0.12)


def bow(g, v):
    # the game's code already places this group (position 0.15, 0.35, 0.02, tilt -0.35): model it in local space
    for s in (-1, 1):
        # puffy loops instead of flat pyramids
        g.add(S(0.12, 24, 14, mat='c1', pos=(s * 0.13, 0, 0), scale=(1.1, 0.75, 0.45), rot=(0, 0, s * 0.2)))
        g.add(box(0.05, 0.13, 0.02, mat='c1', pos=(s * 0.05, -0.1, 0), rot=(0, 0, s * 0.35)))
    pom(g, 'c2', 0.055, 0, 0, 0.01)


def goggles(g, v):
    g.add(torus(0.37, 0.03, 8, 44, mat='c1', pos=(0, 0.22, 0), rot=(PI / 2 - 0.15, 0, 0)))
    for s in (-1, 1):
        g.add(cyl(0.09, 0.09, 0.06, 32, mat='c3', pos=(s * 0.12, 0.29, 0.33), rot=(PI / 2 - 0.25, 0, 0)))
        g.add(torus(0.08, 0.012, 8, 32, mat='#9aa0aa', pos=(s * 0.12, 0.297, 0.362), rot=(-0.25, 0, 0)))
        g.add(cyl(0.07, 0.07, 0.065, 32, mat=glow('c2'), pos=(s * 0.12, 0.29, 0.335), rot=(PI / 2 - 0.25, 0, 0), outline=False))
    g.add(box(0.06, 0.03, 0.03, mat='c3', pos=(0, 0.29, 0.34), rot=(-0.25, 0, 0)))  # bridge
    if v == 'dj':
        for s in (-1, 1):
            g.add(cyl(0.06, 0.06, 0.05, 24, mat='c1', pos=(s * 0.37, 0.2, 0), rot=(0, 0, PI / 2)))
            g.add(cyl(0.04, 0.04, 0.052, 20, mat='c2', pos=(s * 0.375, 0.2, 0), rot=(0, 0, PI / 2)))


def mohawk(g, v):
    if v == 'helm':
        dome(g, 'c1', 0.38, 0.03, 1.4)
        g.add(torus(0.37, 0.03, 8, 44, mat='c3', pos=(0, 0.12, 0), rot=(PI / 2, 0, 0)))
    else:
        headband(g, 'c1')
    for k in range(6):
        a = -0.95 + k * 0.38
        g.add(cone(0.06, 0.24, 16, mat='c2', pos=(0, 0.03 + math.cos(a) * 0.42, math.sin(a) * 0.42), rot=(a, 0, 0), scale=(0.55, 1, 1)))
    if v == 'helm':
        ring_of(6, 0.37, lambda a, x, z, i: g.add(cone(0.03, 0.08, 10, mat='c3', pos=(x, 0.14, z), rot=(PI / 2 * math.cos(a), 0, -PI / 2 * math.sin(a)))))


def vinyl(g, v):
    g.add(cyl(0.46, 0.46, 0.025, 64, mat='c1', pos=(0, 0.34, 0), rot=(0.2, 0, -0.15)))
    for r in (0.42, 0.38, 0.34, 0.3, 0.26, 0.22, 0.18):
        g.add(torus(r, 0.004, 4, 64, mat='#3a3a3a', pos=(0, 0.355, 0), rot=(PI / 2 + 0.2, 0, -0.15), outline=False))
    g.add(cyl(0.13, 0.13, 0.03, 32, mat='c2', pos=(0, 0.348, 0), rot=(0.2, 0, -0.15)))
    g.add(cyl(0.012, 0.012, 0.04, 10, mat='#cfd8dc', pos=(0, 0.35, 0), rot=(0.2, 0, -0.15)))
    dome(g, 'c1', 0.34, 0.03, 1.0)


def speaker(g, v):
    b = box(0.5, 0.36, 0.42, mat='c1', pos=(0, 0.48, 0))
    g.add(b)
    for x in (-0.25, 0.25):  # rounded vertical edges
        for z in (-0.21, 0.21):
            g.add(cyl(0.012, 0.012, 0.36, 8, mat='c1', pos=(x, 0.48, z)))
    for y, r in ((0.53, 0.12), (0.37, 0.05)):
        g.add(cyl(r, r * 0.4, 0.04, 32, mat='c2', pos=(0, y, 0.215), rot=(PI / 2, 0, 0)))
        g.add(torus(r, 0.01, 6, 32, mat='#2b2b2b', pos=(0, y, 0.236)))
        g.add(S(r * 0.35, 16, 10, mat='c3', pos=(0, y, 0.22)))
    for x in (-0.19, 0.19):
        for y in (0.33, 0.63):
            g.add(cyl(0.008, 0.008, 0.01, 8, mat='#cfd8dc', pos=(x, y, 0.212), rot=(PI / 2, 0, 0)))  # screws
    brim(g, 'c1', 0.3, 0.29, 0.05)


def drum(g, v):
    g.add(cyl(0.27, 0.27, 0.2, 40, mat='c1', pos=(0, 0.44, 0)))
    g.add(cyl(0.272, 0.272, 0.02, 40, mat='c2', pos=(0, 0.545, 0)))
    for y in (0.34, 0.54):
        g.add(torus(0.275, 0.015, 8, 40, mat='#cfd8dc', pos=(0, y, 0), rot=(PI / 2, 0, 0)))
    ring_of(8, 0.275, lambda a, x, z, i: (g.add(box(0.02, 0.18, 0.02, mat='#cfd8dc', pos=(x, 0.44, z), rot=(0, a, 0))),
                                          g.add(box(0.03, 0.04, 0.025, mat='#cfd8dc', pos=(x * 1.03, 0.44, z * 1.03), rot=(0, a, 0)))))
    for s in (-1, 1):
        g.add(lathe([(0.0, -0.25), (0.018, -0.245), (0.018, 0.12), (0.012, 0.2), (0.008, 0.235), (0.011, 0.243), (0.0, 0.25)], 12, mat='c3',
                    pos=(s * 0.1, 0.66, 0.05), rot=(0.2, 0, s * 0.55)))
    brim(g, 'c1', 0.3, 0.33, 0.03)


def jester(g, v):
    dome(g, 'c1', 0.37, 0.03, 1.35)
    for s, col in ((-1, 'c1'), (1, 'c2')):
        # one smooth curling flap per side (swept), a bell at the tip
        path, radii = [], []
        for k in range(17):
            t = k / 16
            a = -s * (0.9 + t * 4 * 0.25)
            path.append((s * (0.16 + t * 0.36), 0.33 + 0.2 * math.sin(t * PI * 0.9) - 0.08 * t * t, 0))
            radii.append(0.12 - t * 0.09)
        g.add(sweep(path, radii, 16, mat=col))
        pom(g, 'c3', 0.05, s * 0.52, 0.32, 0)
    g.add(torus(0.37, 0.04, 10, 44, mat='c3', pos=(0, 0.12, 0), rot=(PI / 2, 0, 0)))
    ring_of(10, 0.405, lambda a, x, z, i: g.add(cone(0.03, 0.06, 4, mat='c3', pos=(x, 0.08, z), rot=(PI, a, 0))))


def mortarboard(g, v):
    dome(g, 'c1', 0.36, 0.02, 1.25)
    g.add(box(0.66, 0.03, 0.66, mat='c1', pos=(0, 0.37, 0), rot=(0, PI / 4, 0)))
    pom(g, 'c2', 0.03, 0, 0.39, 0)
    g.add(sweep([(0, 0.39, 0), (0.15, 0.39, 0.06), (0.3, 0.36, 0.12), (0.3, 0.24, 0.12), (0.3, 0.14, 0.12)], [0.008] * 5, 6, mat='c2'))
    g.add(cyl(0.025, 0.045, 0.1, 16, mat='c2', pos=(0.3, 0.09, 0.12)))  # tassel
    note(g, 'c2', 0.1, -0.2, 0.42, 0.05)


def tricorn(g, v):
    dome(g, 'c1', 0.34, 0.1, 1.4)
    R = 0.6
    g.add(cyl(R, R, 0.025, 3, mat='c1', pos=(0, 0.15, 0)))
    for a in (PI / 3, PI, 5 * PI / 3):
        side = Node(rot=(0, a, 0))
        side.add(box(R * 1.55, 0.2, 0.03, mat='c1', pos=(0, 0.24, R * 0.47), rot=(0.4, 0, 0)))
        side.add(box(R * 1.55, 0.025, 0.04, mat='c2', pos=(0, 0.335, R * 0.47 + 0.04), rot=(0.4, 0, 0)))
        g.add(side)
    star(g, 'c3', 0.06, 0, 0.3, 0.33)


def chada(g, v):
    band(g, 'c1', 0.33, 0.2, 0.1)
    for k in range(5):
        g.add(cyl(0.26 - k * 0.045, 0.3 - k * 0.045, 0.1, 32, mat='c2' if k % 2 else 'c1', pos=(0, 0.3 + k * 0.1, 0)))
        g.add(torus(0.3 - k * 0.045, 0.01, 6, 32, mat='c1', pos=(0, 0.25 + k * 0.1, 0), rot=(PI / 2, 0, 0)))
    g.add(cone(0.06, 0.4, 20, mat='c1', pos=(0, 0.95, 0)))
    ring_of(8, 0.335, lambda a, x, z, i: gem(g, 'c3', 0.025, x, 0.2, z))
    for s in (-1, 1):
        g.add(cone(0.05, 0.26, 12, mat='c1', pos=(s * 0.36, 0.16, -0.04), rot=(0, 0, -s * 2.4)))
    if v == 'flame':
        for k in range(3):
            g.add(cone(0.05 - k * 0.012, 0.18, 12, mat=glow('#ff5722' if k == 0 else '#ffb300'), pos=(0, 1.12 + k * 0.08, 0), outline=False))


def ngob(g, v):
    g.add(cone(0.62, 0.34, 48, mat='c1', pos=(0, 0.4, 0), open_ended=True))
    # weave: radial ribs
    for k in range(16):
        a = TAU * k / 16
        g.add(sweep([(math.sin(a) * 0.05, 0.565, math.cos(a) * 0.05), (math.sin(a) * 0.62, 0.232, math.cos(a) * 0.62)], [0.006, 0.006], 4, mat='c2'))
    for k in (0.25, 0.55, 0.8):
        g.add(torus(0.62 * k, 0.008, 4, 48, mat='c2', pos=(0, 0.57 - 0.34 * k, 0), rot=(PI / 2, 0, 0)))
    g.add(cyl(0.28, 0.32, 0.12, 32, mat='c2', pos=(0, 0.2, 0)))
    note(g, 'c2', 0.1, 0.25, 0.42, 0.33, 0.5, 0.5)


def santa(g, v):
    # floppy cone: bend it with the same tilt as the code one plus a droop
    c = lathe([(0.33, -0.3), (0.3, -0.15), (0.24, 0.0), (0.16, 0.13), (0.08, 0.24), (0.0, 0.3)], 32, mat='c1', pos=(0.1, 0.48, -0.05), rot=(-0.5, 0, -0.5))
    c.verts = [vv.__class__((vv.x + 0.25 * max(0.0, vv.y) ** 2, vv.y - 0.15 * max(0.0, vv.y) ** 2, vv.z)) for vv in c.verts]
    g.add(c)
    g.add(torus(0.35, 0.06, 12, 44, mat='c2', pos=(0, 0.15, 0), rot=(PI / 2, 0, 0)))
    for k in range(4):
        pom(g, 'c2', 0.07 if k == 0 else 0.045, 0.36 + 0.03 * math.cos(k), 0.62 + 0.03 * math.sin(k * 2), -0.25 + 0.02 * k)
    g.add(sphere(0.05, 16, 10, mat='c3', pos=(0.36, 0.53, -0.25), th_len=2.0))


def pumpkin(g, v):
    for k in range(8):
        a = (k / 8) * TAU
        g.add(S(0.22, 24, 16, mat='c1', pos=(math.sin(a) * 0.15, 0.4, math.cos(a) * 0.15), scale=(0.7, 0.9, 0.7)))
    g.add(sweep([(0, 0.57, 0), (0.01, 0.65, 0), (0.05, 0.7, 0.01)], [0.045, 0.03, 0.02], 8, mat='c2'))
    g.add(S(0.05, 12, 8, mat='#4caf50', pos=(0.07, 0.6, 0.02), scale=(1.4, 0.3, 0.9)))  # leaf
    for s in (-1, 1):
        g.add(cone(0.04, 0.06, 3, mat=glow('c3'), pos=(s * 0.08, 0.45, 0.34), rot=(PI / 2, 0, 0), outline=False))
    # a toothy grin
    pts = [(-0.09, 0.0), (-0.05, -0.03), (-0.03, -0.01), (0.0, -0.035), (0.03, -0.01), (0.05, -0.03), (0.09, 0.0), (0.0, 0.02)]
    g.add(extrude([pts], 0.02, mat=glow('c3'), pos=(0, 0.36, 0.335), outline=False))


def mushroom(g, v):
    g.add(sphere(0.46, 40, 16, mat='c1', pos=(0, 0.13, 0), th_len=1.45, scale=(1, 0.75, 1)))
    g.add(torus(0.455, 0.018, 8, 48, mat='c1', pos=(0, 0.135, 0), rot=(PI / 2, 0, 0)))  # rolled cap edge
    ring_of(6, 0.3, lambda a, x, z, i: g.add(S(0.06, 16, 10, mat='c2', pos=(x, 0.36, z), scale=(1, 0.4, 1))))
    pom(g, 'c2', 0.07, 0, 0.48, 0)
    note(g, 'c3', 0.12, 0.3, 0.42, 0.2, 0.9)


def critter(g, v):
    g.add(S(0.2, 28, 18, mat='c1', pos=(0, 0.48, 0), scale=(1.1, 0.8, 1)))
    if v == 'frog':
        for s in (-1, 1):
            g.add(S(0.08, 20, 12, mat='c1', pos=(s * 0.12, 0.62, 0.08)))
            g.add(S(0.05, 16, 10, mat='#ffffff', pos=(s * 0.12, 0.64, 0.14)))
            g.add(S(0.025, 12, 8, mat='#111111', pos=(s * 0.12, 0.645, 0.185)))
            g.add(S(0.07, 16, 10, mat='c1', pos=(s * 0.2, 0.36, 0.1), scale=(1, 0.5, 1.5)))
            for t in (-1, 0, 1):  # toes
                g.add(S(0.018, 8, 6, mat='c1', pos=(s * 0.2 + t * 0.035, 0.34, 0.2)))
        g.add(torus(0.1, 0.01, 6, 20, arc=PI, mat='c2', pos=(0, 0.5, 0.19), rot=(0, 0, PI)))
        for s in (-1, 1):
            g.add(S(0.03, 10, 8, mat='#ff9aa8', pos=(s * 0.13, 0.52, 0.17), scale=(1, 0.6, 0.3)))  # blush
    else:
        g.add(S(0.13, 24, 16, mat='c1', pos=(0, 0.68, 0.04)))
        for s in (-1, 1):
            g.add(S(0.022, 10, 8, mat='#111111', pos=(s * 0.05, 0.7, 0.15)))
            g.add(S(0.08, 16, 10, mat='c1', pos=(s * 0.2, 0.5, 0), scale=(0.4, 0.8, 1), rot=(0, 0, s * 0.5)))
        g.add(cone(0.035, 0.08, 12, mat='c2', pos=(0, 0.67, 0.18), rot=(PI / 2, 0, 0)))
        for k in (-1, 0, 1):
            feather(g, 'c1', 0.45, k * 0.025, 0.8, 0.02, k * 0.35)
    note(g, 'c3', 0.1, 0.24, 0.62, 0.05, 0.4)


def cloud(g, v):
    for x, y, z, r in ((0, 0.62, 0, 0.17), (-0.17, 0.57, 0.02, 0.13), (0.17, 0.57, 0, 0.14), (0.06, 0.7, -0.05, 0.12), (-0.08, 0.56, 0.12, 0.1),
                       (0.1, 0.55, 0.1, 0.1), (-0.05, 0.66, -0.1, 0.11)):
        g.add(S(r, 24, 16, mat='c1', pos=(x, y, z)))
    note(g, 'c2', 0.11, -0.12, 0.42, 0.1, 0, 0.2)
    note(g, 'c3', 0.09, 0.13, 0.39, 0.05, 0, -0.2)
    for k in range(3):  # rain drops
        g.add(S(0.018, 10, 8, mat=glow('c2'), pos=(-0.1 + k * 0.1, 0.4 - 0.03 * k, 0.05), scale=(1, 1.6, 1), outline=False))


def fez(g, v):
    tube(g, 'c1', 0.2, 0.27, 0.26, 0.14)
    g.add(cyl(0.006, 0.006, 0.08, 6, mat='c2', pos=(0, 0.44, 0)))
    g.add(sweep([(0, 0.44, 0), (0.08, 0.43, 0), (0.18, 0.36, 0), (0.24, 0.27, 0)], [0.007] * 4, 6, mat='c2'))
    g.add(cyl(0.02, 0.05, 0.11, 16, mat='c2', pos=(0.24, 0.22, 0)))


def turban(g, v):
    for k in range(4):
        g.add(torus(0.34 - k * 0.06, 0.07, 12, 44, mat='c2' if k % 2 else 'c1', pos=(0, 0.17 + k * 0.08, 0), rot=(PI / 2 + (0.15 if k % 2 else -0.15), 0, 0)))
    g.add(S(0.15, 24, 16, mat='c1', pos=(0, 0.42, 0)))
    gem(g, 'c3', 0.06, 0, 0.28, 0.38)
    g.add(torus(0.07, 0.01, 6, 20, mat='#ffd54f', pos=(0, 0.28, 0.37)))
    feather(g, '#fafafa', 1.2, 0.04, 0.45, 0.33, -0.2)


def captain(g, v):
    g.add(cyl(0.42, 0.33, 0.16, 40, mat='c1', pos=(0, 0.3, 0)))
    g.add(torus(0.42, 0.015, 6, 44, mat='c1', pos=(0, 0.38, 0), rot=(PI / 2, 0, 0)))
    band(g, 'c2', 0.335, 0.18, 0.08)
    g.add(cyl(0.25, 0.25, 0.022, 32, mat='#1b1b1b', pos=(0, 0.14, 0.26), scale=(1, 1, 0.6), rot=(0.15, 0, 0)))
    g.add(sweep([(-0.25, 0.17, 0.3), (0, 0.19, 0.36), (0.25, 0.17, 0.3)], [0.008] * 3, 6, mat='#ffd54f'))  # chin cord
    note(g, 'c3', 0.11, 0, 0.21, 0.35)
    for s in (-1, 1):
        feather(g, 'c3', 0.6, s * 0.1, 0.22, 0.34, s * 1.2)


def flamecrown(g, v):
    band(g, 'c3', 0.31, 0.2, 0.08)

    def flame(a, x, z, i):
        h = 0.24 + (i % 2) * 0.08
        f = lathe([(0.0, -h / 2), (0.06, -h / 2 + 0.03), (0.07, -h / 4), (0.045, h / 6), (0.0, h / 2)], 14, mat=glow('c1' if i % 2 else 'c2'),
                  pos=(x, 0.36 + (i % 2) * 0.04, z), outline=False)
        f.verts = [vv.__class__((vv.x + 0.04 * max(0.0, vv.y) * math.sin(i), vv.y, vv.z)) for vv in f.verts]  # flicker lean
        g.add(f)
    ring_of(9, 0.3, flame)
    gem(g, 'c2', 0.05, 0, 0.21, 0.32)


def wings(g, v):
    headband(g, 'c2', 0.385, 0.02)
    pts = []
    for t in (i / 8 for i in range(9)):  # quadratic (0,0)->(0.15,0.3)->(0.42,0.35)
        pts.append(((1 - t) ** 2 * 0 + 2 * (1 - t) * t * 0.15 + t * t * 0.42, 2 * (1 - t) * t * 0.3 + t * t * 0.35))
    pts += [(0.36, 0.22), (0.42, 0.14), (0.3, 0.08), (0.32, -0.02)]
    for t in (i / 6 for i in range(1, 6)):
        pts.append(((1 - t) ** 2 * 0.32 + 2 * (1 - t) * t * 0.15, (1 - t) ** 2 * -0.02 + 2 * (1 - t) * t * 0.02))
    for s in (-1, 1):
        w = Node(pos=(s * 0.33, 0.2, -0.02), rot=(0, -s * 0.35, 0), scale=(s, 1, 1))
        w.add(extrude([pts], 0.02, mat='c1', bevel=0.005))
        for k, (x0, y0) in enumerate(((0.36, 0.22), (0.3, 0.08))):  # feather lines
            w.add(sweep([(0.06, 0.06, 0.022), (x0, y0, 0.022)], [0.004, 0.003], 4, mat='c2'))
        g.add(w)


def clef(g, v):
    note(g, 'c1', 0.34, 0.27, 0.32, 0.08, 0.9, -0.3)
    pom(g, 'c2', 0.045, 0.3, 0.2, 0.12)
    g.add(box(0.03, 0.12, 0.012, mat='#9aa0aa', pos=(0.3, 0.2, 0.09), rot=(0, 0.9, 0)))  # the clip


def horn_hat(g, v):
    # tuba bell: lathe with a flare, open at the top, valves at the side
    prof = [(0.25, 0.16), (0.27, 0.25), (0.31, 0.36), (0.38, 0.46), (0.43, 0.5), (0.42, 0.505), (0.36, 0.48), (0.26, 0.4), (0.17, 0.3), (0.15, 0.2)]
    g.add(lathe(prof, 48, mat='c1'))
    g.add(cyl(0.15, 0.15, 0.01, 32, mat='c2', pos=(0, 0.2, 0)))
    g.add(torus(0.425, 0.022, 8, 48, mat='c1', pos=(0, 0.5, 0), rot=(PI / 2, 0, 0)))
    for k in range(3):
        g.add(cyl(0.025, 0.025, 0.12, 12, mat='c3', pos=(0.3 + k * 0.05, 0.25, 0.22)))
        g.add(cyl(0.032, 0.032, 0.015, 12, mat='c3', pos=(0.3 + k * 0.05, 0.315, 0.22)))
        g.add(cyl(0.018, 0.018, 0.02, 10, mat='#f5f0e6', pos=(0.3 + k * 0.05, 0.33, 0.22)))  # finger buttons


LOOKS = {
    'cap': cap, 'beanie': beanie, 'beret': beret, 'fedora': fedora, 'tophat': tophat, 'cowboy': cowboy, 'crown': crown, 'tiara': tiara,
    'halo': halo, 'horns': horns, 'ears': ears_look, 'antenna': antenna, 'flowers': flowers, 'bandana': bandana, 'viking': viking,
    'witch': witch, 'party': party, 'shako': shako, 'bow': bow, 'goggles': goggles, 'mohawk': mohawk, 'vinyl': vinyl, 'speaker': speaker,
    'drum': drum, 'jester': jester, 'mortarboard': mortarboard, 'tricorn': tricorn, 'chada': chada, 'ngob': ngob, 'santa': santa,
    'pumpkin': pumpkin, 'mushroom': mushroom, 'critter': critter, 'cloud': cloud, 'fez': fez, 'turban': turban, 'captain': captain,
    'flamecrown': flamecrown, 'wings': wings, 'clef': clef, 'horn': horn_hat,
}


def used_looks():
    import json
    d = json.load(open(os.path.join(REPO, 'src', 'data', 'gamedata.json')))
    items = d['items'] if isinstance(d['items'], dict) else {i['id']: i for i in d['items']}
    out = set()
    for it in items.values():
        h = it.get('hat')
        if h:
            out.add((h['kind'], h.get('v', '')))
    return sorted(out)


def main():
    only = set((flag('--only') or '').split(',')) - {''}
    prev = flag('--preview')
    out_dir = os.path.join(REPO, 'public', 'models', 'hats')
    report = []
    for kind, v in used_looks():
        name = f'{kind}_{v}' if v else kind
        if only and kind not in only and name not in only:
            continue
        reset()
        g = Node()
        LOOKS[kind](g, v)
        build(g, name)
        tris = tri_count()
        if prev:
            os.makedirs(prev, exist_ok=True)
            render_preview(os.path.join(prev, f'{name}.png'), size=(360, 360), angle_deg=-30, elev_deg=15)
        export_glb(os.path.join(out_dir, f'{name}.glb'))
        report.append((name, tris))
    for n, t in report:
        print(f'[hat] {n:22s} {t}')
    print(f'[hat] {len(report)} looks')


main()
