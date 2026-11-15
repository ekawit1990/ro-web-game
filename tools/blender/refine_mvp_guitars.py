"""
The 12 MVP guitars and 6 MVP basses: the game's own builder (src/three/guitarShapes.ts buildShaped) exports
each one from the browser, then Blender finishes it.

    1. tools/blender/bake_guitars.cjs (opens bake_guitars.html under `npx vite`) -> <bake>/guitars/<id>.glb ...
    2. python tools/blender/refine_mvp_guitars.py <bake dir> [--only stype,sr] [--preview DIR]

What Blender adds:
  * the neck: the code's flat box becomes a carved C-profile (round back, flat fretboard side), tapering
    from the heel to the nut like a real neck
  * ~150 separate meshes (frets, pole pieces, strings, knobs...) merged into one mesh per material, so a
    guitar draws in ~10-15 calls instead of ~150 (the main win on phones), doubles merged, smooth shading
  * textures re-encoded as JPEG

Same frame as buildShaped(), so it swaps in with useBlenderModel (src/three/bass.ts).
Writes public/models/weapons/{guitars,basses}/<id>.glb.gz.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import export_glb, flag, render_preview, reset  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

args = [a for a in sys.argv[1:] if not a.startswith('--')]
bake = os.path.abspath(args[0]) if args else None
if not bake:
    raise SystemExit('usage: refine_mvp_guitars.py <bake dir> [--only ids] [--preview DIR]')
only = (flag('--only') or '').split(',') if flag('--only') else None
prev = flag('--preview')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'models', 'weapons')


def carve_neck(obj, ring=10):
    """Replace the box neck by a C-profile neck through the same slices (Blender frame: X along the
    neck, Z across it, -Y towards the fretboard)."""
    mw = obj.matrix_world
    slices = {}
    for v in obj.data.vertices:
        p = mw @ v.co
        k = round(p.x, 5)
        s = slices.setdefault(k, [1e9, -1e9, 1e9, -1e9])  # zmin zmax ymin ymax
        s[0], s[1], s[2], s[3] = min(s[0], p.z), max(s[1], p.z), min(s[2], p.y), max(s[3], p.y)
    xs = sorted(slices)
    bm = bmesh.new()
    rings = []
    for x in xs:
        zmin, zmax, ytop, yback = slices[x]
        zc, w, d = (zmin + zmax) / 2, (zmax - zmin) / 2, yback - ytop
        pts = []
        for i in range(ring + 1):  # the round back, from one edge to the other
            a = math.pi * i / ring
            pts.append((x, ytop + d * math.sin(a) ** 0.85, zc + w * math.cos(a)))
        rings.append([bm.verts.new(p) for p in pts])
    n = ring + 1
    for a, b in zip(rings, rings[1:]):
        for i in range(n):  # i -> i+1 wraps: the last edge (n-1 -> 0) is the flat fretboard side
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new('neck_carved')
    bm.to_mesh(me)
    bm.free()
    for m in obj.data.materials:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    new = bpy.data.objects.new('neck', me)
    bpy.context.scene.collection.objects.link(new)
    bpy.data.objects.remove(obj)
    return new


def refine(src, dst, png=None):
    reset()
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    neck = next((o for o in meshes if o.name.startswith('neck')), None)
    if neck:
        carve_neck(neck)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = os.path.basename(dst).split('.')[0]
    # same materials imported twice (one per source mesh) -> one slot each
    seen = {}
    for i, slot in enumerate(obj.material_slots):
        m = slot.material
        key = m.name.split('.')[0] if m else ''
        if key in seen:
            slot.material = seen[key]
        else:
            seen[key] = m
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.material_slot_remove_unused()
    # flat faces (the body top, the headstock, pickup covers) come out of three.js as fans of thin
    # triangles: dissolve them into n-gons and re-triangulate, keeping UV and material borders
    md = obj.modifiers.new('planar', 'DECIMATE')
    md.decimate_type = 'DISSOLVE'
    md.angle_limit = math.radians(1.0)
    md.delimit = {'UV', 'MATERIAL', 'SEAM', 'SHARP'}
    bpy.ops.object.modifier_apply(modifier='planar')
    md = obj.modifiers.new('tri', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier='tri')
    for p in obj.data.polygons:
        p.use_smooth = True
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    except Exception:
        pass
    # remove the parent empties the importer made
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    if png:
        render_preview(png, size=(900, 500), angle_deg=-90, elev_deg=0)
    export_glb(dst, budget=20000, image_format='JPEG')


for kind in ('guitars', 'basses'):
    d = os.path.join(bake, kind)
    for f in sorted(os.listdir(d)):
        sid = f[:-4]
        if only and sid not in only:
            continue
        png = os.path.join(prev, kind, f'{sid}.png') if prev else None
        if png:
            os.makedirs(os.path.dirname(png), exist_ok=True)
        refine(os.path.join(d, f), os.path.join(OUT, kind, f'{sid}.glb'), png)
