"""
Music Land helpers for Blender scripts (headless or inside the Blender app).

Rules every game model follows (same as the village/monster GLBs already in the game):
  * 1 Blender unit = 1 map tile. The game scales most models to fit, but keep them close.
  * The front of the model faces Blender -Y  (= +Z in the game after glTF's Y-up export).
  * Origin at the bottom centre, standing on Z = 0.
  * Plain colour materials (Principled BSDF base colour). The game redraws them cel-shaded,
    so normal / roughness / metal maps are wasted bytes.
  * Phone budget (iOS GPU memory is tight): props <= 3k triangles, big set pieces <= 15k,
    monsters <= 30k, textures <= 1024 px.

Import it from a build script:
    import sys, os; sys.path.insert(0, os.path.dirname(__file__))
    from ml_blender import *
"""
from __future__ import annotations

import gzip
import math
import os
import shutil
import sys

import bpy
import bmesh
from mathutils import Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


# ---------------------------------------------------------------- scene

def reset():
    """Empty scene with metric units."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


_mats: dict[str, bpy.types.Material] = {}


def mat(name: str, hex_color: str, emission: float = 0.0, rough: float = 0.6, metal: float = 0.0):
    """A plain colour material, reused by name. hex like '#7b3cff'."""
    key = f'{name}'
    if key in _mats and _mats[key].name in bpy.data.materials:
        return _mats[key]
    h = hex_color.lstrip('#')
    rgb = tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    lin = tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb)
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*lin, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emission > 0:
        bsdf.inputs['Emission Color'].default_value = (*lin, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    m.diffuse_color = (*lin, 1)  # what the solid/workbench view shows
    _mats[key] = m
    return m


def _finish(obj, material=None, name=None, smooth=False, bevel=0.0, segments=2):
    if name:
        obj.name = name
    if material is not None:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    if bevel > 0:
        md = obj.modifiers.new('bevel', 'BEVEL')
        md.width = bevel
        md.segments = segments
        md.limit_method = 'ANGLE'
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def box(name, size, loc, material=None, bevel=0.0, rot=(0, 0, 0)):
    """Box of size (x, y, z) centred at loc."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, material, name, bevel=bevel)


def cyl(name, r, depth, loc, material=None, rot=(0, 0, 0), verts=16, smooth=True, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    return _finish(bpy.context.active_object, material, name, smooth=smooth, bevel=bevel)


def sphere(name, r, loc, material=None, scale=(1, 1, 1), segs=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.active_object
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, material, name, smooth=True)


def torus(name, major, minor, loc, material=None, rot=(0, 0, 0), seg=24, minor_seg=8):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                     major_segments=seg, minor_segments=minor_seg)
    return _finish(bpy.context.active_object, material, name, smooth=True)


def text(name, body, loc, size, material=None, rot=(math.radians(90), 0, 0), depth=0.01, font=None):
    """3D text converted to a mesh (no texture needed). Default faces -Y (the model's front)."""
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.active_object
    o.data.body = body
    o.data.size = size
    o.data.extrude = depth
    o.data.align_x = 'CENTER'
    o.data.align_y = 'CENTER'
    o.data.resolution_u = 2  # fewer curve steps = fewer triangles
    if font and os.path.exists(font):
        o.data.font = bpy.data.fonts.load(font)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.active_object
    return _finish(o, material, name)


def join(objs, name):
    """Apply modifiers and merge into one object (fewer draw calls in the game)."""
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def ground_origin(obj):
    """Put the origin at the bottom centre and move the object onto Z = 0 at X = Y = 0."""
    bb = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(v.x for v in bb), min(v.y for v in bb), min(v.z for v in bb)))
    mx = Vector((max(v.x for v in bb), max(v.y for v in bb), max(v.z for v in bb)))
    pivot = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    bpy.context.scene.cursor.location = pivot
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    obj.location = (0, 0, 0)
    bpy.context.scene.cursor.location = (0, 0, 0)


# ---------------------------------------------------------------- checks & export

def tri_count(objs=None):
    dg = bpy.context.evaluated_depsgraph_get()
    total = 0
    for o in objs or bpy.context.scene.objects:
        if o.type != 'MESH':
            continue
        m = o.evaluated_get(dg).to_mesh()
        total += sum(len(p.vertices) - 2 for p in m.polygons)
        o.evaluated_get(dg).to_mesh_clear()
    return total


def size_of(objs=None):
    pts = []
    for o in objs or bpy.context.scene.objects:
        if o.type == 'MESH':
            pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mx - mn


def decimate(obj, target_tris: int):
    """Collapse-decimate one mesh down to about target_tris triangles."""
    now = tri_count([obj])
    if now <= target_tris:
        return now
    md = obj.modifiers.new('decimate', 'DECIMATE')
    md.ratio = max(0.001, target_tris / now)
    md.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=md.name)
    return tri_count([obj])


def export_glb(out_path: str, gz: bool = True, budget: int | None = None, selected_only=False, animations=False):
    """Export the scene to GLB (Y-up, modifiers applied). With gz=True also writes out_path + '.gz'
    (the game fetches *.glb.gz and unpacks it in the browser) and removes the plain .glb."""
    tris = tri_count()
    s = size_of()
    print(f'[ml] {os.path.basename(out_path)}: {tris} triangles, size x{s.x:.2f} y{s.y:.2f} z{s.z:.2f}')
    if budget and tris > budget:
        raise SystemExit(f'[ml] over budget: {tris} > {budget} triangles')
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_apply=True,
        export_yup=True,
        use_selection=selected_only,
        export_animations=animations,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    final = out_path
    if gz:
        with open(out_path, 'rb') as f, gzip.open(out_path + '.gz', 'wb', compresslevel=9) as g:
            shutil.copyfileobj(f, g)
        os.remove(out_path)
        final = out_path + '.gz'
    print(f'[ml] wrote {final} ({os.path.getsize(final) / 1024:.0f} KB)')
    return final


def render_preview(png_path: str, size=(900, 700), angle_deg=-35.0, elev_deg=22.0, bg='#d8d2c4'):
    """Quick turntable-style snapshot with Workbench (works headless, no GPU needed)."""
    sc = bpy.context.scene
    objs = [o for o in sc.objects if o.type == 'MESH']
    s = size_of(objs)
    radius = max(s.x, s.y, s.z) * 1.9
    centre = Vector((0, 0, s.z * 0.45))
    a, e = math.radians(angle_deg), math.radians(elev_deg)
    pos = centre + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * radius
    cam_data = bpy.data.cameras.new('preview_cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('preview_cam', cam_data)
    sc.collection.objects.link(cam)
    cam.location = pos
    cam.rotation_euler = (centre - pos).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_shadows = True
    sh.show_cavity = True
    sh.cavity_type = 'WORLD'
    sh.show_object_outline = True
    sh.background_type = 'VIEWPORT'
    h = bg.lstrip('#')
    sh.background_color = tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    sc.render.resolution_x, sc.render.resolution_y = size
    sc.render.film_transparent = False
    sc.render.filepath = png_path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    print(f'[ml] preview {png_path}')


def out_arg(default: str) -> str:
    """Output path from `-- --out PATH` (Blender) or `--out PATH` (python+bpy), else default under the repo."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if '--out' in argv:
        return os.path.abspath(argv[argv.index('--out') + 1])
    return os.path.join(REPO, default)


def flag(name: str) -> str | None:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    if name in argv:
        i = argv.index(name)
        return argv[i + 1] if i + 1 < len(argv) and not argv[i + 1].startswith('--') else ''
    return None
