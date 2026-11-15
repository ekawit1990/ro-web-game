"""
A tiny three.js-style scene builder for Blender scripts, so props first drawn in three.js code
(hats, weapons) can be rebuilt in Blender in the SAME coordinates: Y up, front +Z, three.js
primitive conventions (cylinders along Y, tori in the XY plane, Euler order XYZ, shapes extruded
along +Z). Geometry is generated with mathutils, baked through a small node tree, then turned into
one Blender object per material and rotated into Blender's Z-up frame, so the glTF export
(+Y up) lands exactly where the three.js code put it.

    from three_like import Node, cyl, sphere, torus, cone, box, octa, capsule, extrude, lathe, build
    g = Node()
    g.add(cyl(0.3, 0.3, 0.1, mat='c1', pos=(0, 0.2, 0)))
    build(g)  # -> Blender objects, ready for ml_blender.export_glb

Material names are plain strings; the game reads them back (see src/three/blenderHats.ts):
'c1'..'c3' = the item's colour slots, 'glow_c2' = that slot glowing, '#rrggbb' = a fixed colour,
'glow_#rrggbb' fixed and glowing, 'trans_c2' see-through.
"""
from __future__ import annotations

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.geometry import tessellate_polygon

TAU = math.pi * 2


class Node:
    def __init__(self, verts=None, faces=None, mat=None, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True, outline=True):
        self.verts = verts or []
        self.faces = faces or []
        self.mat = mat
        self.pos = Vector(pos)
        self.rot = Vector(rot)
        self.scale = Vector(scale) if not isinstance(scale, (int, float)) else Vector((scale, scale, scale))
        self.children: list[Node] = []
        self.smooth = smooth
        self.outline = outline
        self.pre = Matrix.Identity(4)  # extra local rotations (three's rotateX/rotateZ after creation)

    def add(self, *nodes):
        for n in nodes:
            self.children.append(n)
        return nodes[0] if len(nodes) == 1 else nodes

    def set(self, pos=None, rot=None, scale=None):
        if pos is not None:
            self.pos = Vector(pos)
        if rot is not None:
            self.rot = Vector(rot)
        if scale is not None:
            self.scale = Vector(scale) if not isinstance(scale, (int, float)) else Vector((scale, scale, scale))
        return self

    def rotateX(self, a):
        self.pre = self.pre @ Matrix.Rotation(a, 4, 'X')
        return self

    def rotateY(self, a):
        self.pre = self.pre @ Matrix.Rotation(a, 4, 'Y')
        return self

    def rotateZ(self, a):
        self.pre = self.pre @ Matrix.Rotation(a, 4, 'Z')
        return self

    def matrix(self):
        # three.js Euler 'XYZ' = Rx * Ry * Rz
        r = Matrix.Rotation(self.rot.x, 4, 'X') @ Matrix.Rotation(self.rot.y, 4, 'Y') @ Matrix.Rotation(self.rot.z, 4, 'Z')
        s = Matrix.Diagonal((*self.scale, 1))
        return Matrix.Translation(self.pos) @ r @ self.pre @ s


def mesh(verts, faces, mat, pos=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), smooth=True, outline=True):
    return Node([Vector(v) for v in verts], faces, mat, pos, rot, scale, smooth, outline)


# ---------------------------------------------------------------- primitives (three.js conventions)

def cyl(rt, rb, h, seg=24, mat='c1', open_ended=False, theta0=0.0, theta_len=TAU, rows=1, **kw):
    """CylinderGeometry: axis Y, centred; theta measured like three (x = r sin t, z = r cos t)."""
    full = abs(theta_len - TAU) < 1e-6
    n = seg if full else seg + 1
    verts, faces = [], []
    for j in range(rows + 1):
        v = j / rows
        r = rb + (rt - rb) * v
        y = -h / 2 + h * v
        for i in range(n):
            t = theta0 + theta_len * i / seg
            verts.append((r * math.sin(t), y, r * math.cos(t)))
    for j in range(rows):
        for i in range(seg):
            a = j * n + i
            b = j * n + (i + 1) % n
            c = (j + 1) * n + (i + 1) % n
            d = (j + 1) * n + i
            faces.append((a, b, c, d))
    if not open_ended:
        for y, r, top in ((-h / 2, rb, False), (h / 2, rt, True)):
            if r <= 1e-6:
                continue
            ci = len(verts)
            verts.append((0, y, 0))
            base = 0 if not top else rows * n
            for i in range(seg if full else seg):
                a, b = base + i, base + (i + 1) % n
                faces.append((ci, a, b) if top else (ci, b, a))  # top cap faces +Y, bottom -Y
    # collapse zero-radius rings (cones) into a point by merging later (bmesh remove_doubles)
    return mesh(verts, faces, mat, **kw)


def cone(r, h, seg=24, mat='c1', **kw):
    return cyl(0.0, r, h, seg, mat, **kw)


def sphere(r, w=32, hseg=16, mat='c1', phi0=0.0, phi_len=TAU, th0=0.0, th_len=math.pi, **kw):
    """SphereGeometry: theta from +Y down, phi round Y (x = -cos(phi) sin(t), z = sin(phi) sin(t))."""
    verts, faces = [], []
    for j in range(hseg + 1):
        t = th0 + th_len * j / hseg
        for i in range(w + 1):
            p = phi0 + phi_len * i / w
            verts.append((-r * math.cos(p) * math.sin(t), r * math.cos(t), r * math.sin(p) * math.sin(t)))
    for j in range(hseg):
        for i in range(w):
            a = j * (w + 1) + i
            b = a + 1
            c = a + w + 2
            d = a + w + 1
            faces.append((a, d, c, b))
    return mesh(verts, faces, mat, **kw)


def torus(R, r, radial=10, tubular=40, arc=TAU, mat='c1', **kw):
    """TorusGeometry: ring in the XY plane round Z, arc from +X."""
    verts, faces = [], []
    for j in range(radial + 1):
        for i in range(tubular + 1):
            u = arc * i / tubular
            v = TAU * j / radial
            verts.append(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), r * math.sin(v)))
    for j in range(1, radial + 1):
        for i in range(1, tubular + 1):
            a = (tubular + 1) * j + i - 1
            b = (tubular + 1) * (j - 1) + i - 1
            c = (tubular + 1) * (j - 1) + i
            d = (tubular + 1) * j + i
            faces.append((a, b, c, d))
    return mesh(verts, faces, mat, **kw)


def box(w, h, d, mat='c1', **kw):
    x, y, z = w / 2, h / 2, d / 2
    verts = [(-x, -y, -z), (x, -y, -z), (x, y, -z), (-x, y, -z), (-x, -y, z), (x, -y, z), (x, y, z), (-x, y, z)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (0, 4, 7, 3)]
    kw.setdefault('smooth', False)
    return mesh(verts, faces, mat, **kw)


def octa(r, mat='c1', **kw):
    verts = [(r, 0, 0), (-r, 0, 0), (0, r, 0), (0, -r, 0), (0, 0, r), (0, 0, -r)]
    faces = [(0, 2, 4), (0, 4, 3), (0, 3, 5), (0, 5, 2), (1, 2, 5), (1, 5, 3), (1, 3, 4), (1, 4, 2)]
    kw.setdefault('smooth', False)
    return mesh(verts, faces, mat, **kw)


def lathe(profile, seg=24, mat='c1', **kw):
    """LatheGeometry: profile [(r, y)] spun round Y."""
    verts, faces = [], []
    m = len(profile)
    for i in range(seg):
        t = TAU * i / seg
        for r, y in profile:
            verts.append((r * math.sin(t), y, r * math.cos(t)))
    for i in range(seg):
        for j in range(m - 1):
            a = i * m + j
            b = ((i + 1) % seg) * m + j
            faces.append((a, b, b + 1, a + 1))  # counter-clockwise seen from outside
    return mesh(verts, faces, mat, **kw)


def capsule(r, length, cap=6, radial=16, mat='c1', **kw):
    prof = []
    for k in range(cap + 1):
        a = -math.pi / 2 + (math.pi / 2) * k / cap
        prof.append((r * math.cos(a), -length / 2 + r * math.sin(a)))
    for k in range(cap + 1):
        a = (math.pi / 2) * k / cap
        prof.append((r * math.cos(a), length / 2 + r * math.sin(a)))
    prof[0] = (0.0, prof[0][1])
    prof[-1] = (0.0, prof[-1][1])
    return lathe(prof, radial, mat, **kw)


def sweep(path, radii, seg=12, mat='c1', **kw):
    """A tube along a 3D polyline `path` with a radius per point (horns, tentacles, cords)."""
    pts = [Vector(p) for p in path]
    verts, faces = [], []
    prev_n = None
    for k, (p, r) in enumerate(zip(pts, radii)):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        if prev_n is None:
            up = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            nrm = t.cross(up).normalized()
        else:
            nrm = (prev_n - t * prev_n.dot(t)).normalized()  # parallel transport
        prev_n = nrm
        bi = t.cross(nrm)
        for i in range(seg):
            a = TAU * i / seg
            verts.append(tuple(p + (nrm * math.cos(a) + bi * math.sin(a)) * max(r, 1e-5)))
    n = len(pts)
    for k in range(n - 1):
        for i in range(seg):
            a = k * seg + i
            b = k * seg + (i + 1) % seg
            faces.append((a, b, b + seg, a + seg))
    verts.append(tuple(pts[0]))
    verts.append(tuple(pts[-1]))
    s0, s1 = len(verts) - 2, len(verts) - 1
    for i in range(seg):
        faces.append((s0, (i + 1) % seg, i))
        faces.append((s1, (n - 1) * seg + i, (n - 1) * seg + (i + 1) % seg))
    return mesh(verts, faces, mat, **kw)


def extrude(loops, depth, mat='c1', bevel=0.0, **kw):
    """ExtrudeGeometry: closed 2D loops in XY (outer ones, no holes), from z = 0 to depth.
    A bevel adds a chamfer ring on both faces."""
    verts, faces = [], []
    kw.setdefault('smooth', False)
    for loop in loops:
        pts = [Vector(p) for p in loop]
        n = len(pts)
        area = sum(pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y for i in range(n))
        if area < 0:
            pts.reverse()
        # outward normals for a chamfer
        nrm = []
        for i in range(n):
            d = (pts[(i + 1) % n] - pts[i - 1])
            d = d.normalized() if d.length > 1e-9 else Vector((1, 0))
            nrm.append(Vector((d.y, -d.x)))
        layers = [(0.0, -bevel), (bevel, 0.0), (depth - bevel, 0.0), (depth, -bevel)] if bevel > 0 else [(0.0, 0.0), (depth, 0.0)]
        base = len(verts)
        for z, ins in layers:
            for p, q in zip(pts, nrm):
                v = p + q * ins
                verts.append((v.x, v.y, z))
        L = len(layers)
        for k in range(L - 1):
            for i in range(n):
                a = base + k * n + i
                b = base + k * n + (i + 1) % n
                faces.append((a, b, b + n, a + n))
        # caps by constrained Delaunay
        cap = [(p + q * layers[0][1]).to_3d() for p, q in zip(pts, nrm)]
        for f in tessellate_polygon([cap]):
            faces.append(tuple(base + i for i in reversed(f)))          # back (z = 0) faces -Z
            faces.append(tuple(base + (L - 1) * n + i for i in f))       # front faces +Z
    return mesh(verts, faces, mat, **kw)


# ---------------------------------------------------------------- bake into Blender

def _walk(node, parent, out):
    m = parent @ node.matrix()
    if node.verts:
        out.append((node, m))
    for c in node.children:
        _walk(c, m, out)


def build(root: Node, name='prop', auto_smooth_deg=40.0, weld=1e-6):
    """One Blender object per material, rotated from three.js Y-up into Blender Z-up."""
    flat = []
    _walk(root, Matrix.Identity(4), flat)
    by_mat: dict[str, list] = {}
    for node, m in flat:
        key = (node.mat or 'c1') + ('' if node.outline or (node.mat or '').startswith(('glow_', 'trans_')) else '|no')  # '|no' = no outline hull
        by_mat.setdefault(key, []).append((node, m))
    up = Matrix.Rotation(math.radians(90), 4, 'X')  # three (x, y, z) -> Blender (x, -z, y)
    objs = []
    for mat_name, items in by_mat.items():
        bm = bmesh.new()
        for node, m in items:
            vs = [bm.verts.new((up @ m @ v.to_4d()).to_3d()) for v in node.verts]
            flip = (m.to_3x3().determinant() < 0)
            for f in node.faces:
                if len(set(f)) < 3:
                    continue
                try:
                    face = bm.faces.new([vs[i] for i in (reversed(f) if flip else f)])
                    face.smooth = node.smooth
                except ValueError:
                    pass
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=weld)
        me = bpy.data.meshes.new(f'{name}_{mat_name}')
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(f'{name}_{mat_name}', me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(material(mat_name))
        if auto_smooth_deg and hasattr(me, 'set_sharp_from_angle'):
            me.set_sharp_from_angle(angle=math.radians(auto_smooth_deg))
        objs.append(ob)
    return objs


_cache: dict[str, bpy.types.Material] = {}
SLOT_PREVIEW = {'c1': '#c0392b', 'c2': '#f1c40f', 'c3': '#3498db'}


def material(name: str):
    """A material named exactly `name` (the game decodes the name); its colour is only a preview."""
    if bpy.data.materials.get(name):
        return bpy.data.materials[name]
    base = name.split('|')[0]
    key = base.split('_', 1)[1] if base.startswith(('glow_', 'trans_')) else base
    hexc = SLOT_PREVIEW.get(key, key if key.startswith('#') else '#cccccc')
    h = hexc.lstrip('#')
    rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*lin, 1)
    b.inputs['Roughness'].default_value = 0.6
    if name.startswith('glow_'):
        b.inputs['Emission Color'].default_value = (*lin, 1)
        b.inputs['Emission Strength'].default_value = 0.6
    m.diffuse_color = (*lin, 1)
    _cache[name] = m
    return m
