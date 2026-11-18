"""
Mounts (2026-11-18): the three scooters the user generated in Meshy AI (CC BY 4.0, credit Meshy),
cut into a body and two wheels that spin, made light enough for phones.

    python tools/blender/build_mounts.py                 # all three, from /mnt/project-files
    python tools/blender/build_mounts.py scooter_red     # one of them
    python tools/blender/build_mounts.py --src DIR --preview DIR

Writes public/models/mounts/<name>.glb.gz with nodes:
  Body, WheelF, WheelR   meshes; each wheel's origin is its axle (the game spins it about local X)
  Seat                   where the rider's hips go (top of the seat)
  GripL, GripR           the handlebar grips (L = the rider's left = game +X)
  Foot                   the floorboard under the rider's feet
Front faces Blender -Y (= game +Z), ground at Z = 0, 1 unit = 1 map tile.

How the wheels are cut out of Meshy's single mesh: a circle is fitted to each tyre's outline in the
side view (the farthest points round a first guess), then every face whose centre is inside that
circle and close to the middle plane (the tyre's width) goes to the wheel. Parts that sit in that
space (hub, brake disc) spin with it, which is what a wheel does anyway.
"""
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import REPO, decimate, flag, render_preview, reset, tri_count  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

# Meshy files: front of the scooter towards -X, wheels on the XZ plane, Z up (after the glTF import).
# guess = rough wheel centres (x, z) read off a side render; half = half the tyre width kept with the wheel.
MOUNTS = {
    'scooter_silver': dict(file='Meshy_AI_Silver_Sprint_Scooter_1118051546_texture.glb', front=(-0.73, -0.40), rear=(0.64, -0.40), half=0.1),
    'scooter_red': dict(file='Meshy_AI_Red_Scooter_1118052302_texture.glb', front=(-0.69, -0.35), rear=(0.61, -0.31), half=0.09, hip=0.74),
    'scooter_retro': dict(file='Meshy_AI_Blue_and_Yellow_Retro_1118051643_texture.glb', front=(-0.72, -0.40), rear=(0.62, -0.40), half=0.09),
}
LENGTH = 1.5  # game length (tiles); characters are 1.55 tall
TRIS_BODY = 12000
TRIS_WHEEL = 1400
TEX = 1024


def world_coords(o):
    n = len(o.data.vertices)
    co = np.empty(n * 3, np.float32)
    o.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    M = np.array(o.matrix_world)
    return co @ M[:3, :3].T + M[:3, 3]


def fit_wheel(co, guess, half):
    """Circle through the outer edge of a tyre, seen from the side (x, z)."""
    cx, cz = guess
    r = 0.24
    side = np.abs(co[:, 1]) < half * 0.6
    for _ in range(4):
        dx, dz = co[:, 0] - cx, co[:, 2] - cz
        d = np.hypot(dx, dz)
        near = side & (d < r * 1.25)
        ang = np.arctan2(dz[near], dx[near])
        # the lower half of the circle only: the mudguard, fork and body sit over the top
        keep = (ang < math.radians(-15)) & (ang > math.radians(-165))
        pts, dd, aa = co[near][keep], d[near][keep], ang[keep]
        bins = np.floor((aa + math.pi) / (2 * math.pi) * 48).astype(int)
        edge = []
        for b in np.unique(bins):
            i = np.where(bins == b)[0]
            if len(i):
                edge.append(pts[i[np.argmax(dd[i])], [0, 2]])
        e = np.array(edge)
        # algebraic circle fit: x^2+z^2 + D x + E z + F = 0
        A = np.c_[e[:, 0], e[:, 1], np.ones(len(e))]
        b = -(e[:, 0] ** 2 + e[:, 1] ** 2)
        D, E, F = np.linalg.lstsq(A, b, rcond=None)[0]
        cx, cz = -D / 2, -E / 2
        r = math.sqrt(max(1e-6, cx * cx + cz * cz - F))
    return cx, cz, r


def split_faces(o, mask, name):
    """Moves the faces in `mask` into a new object called `name`."""
    me = o.data
    me.polygons.foreach_set('select', mask)
    me.update()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_mode(type='FACE')
    bpy.ops.object.mode_set(mode='OBJECT')
    me.polygons.foreach_set('select', mask)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.object.mode_set(mode='OBJECT')
    new = [x for x in bpy.context.selected_objects if x != o][0]
    new.name = name
    return new


def select(objs, active=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def bake_low(objs):
    """Decimates the parts and bakes Meshy's colours onto one fresh UV atlas.

    Decimating the textured mesh directly smears the texture: Meshy splits vertices along every UV
    seam, and the mesh has to be welded or the decimator tears it apart, which loses the seams. So the
    low mesh gets new UVs and its colours are baked from the full-detail copy (Cycles, selected-to-active)."""
    his = []
    for key, o in objs.items():
        h = o.copy()
        h.data = o.data.copy()
        h.name = key + '_hi'
        bpy.context.scene.collection.objects.link(h)
        his.append(h)
    for key, o in objs.items():
        select([o])
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.remove_doubles(threshold=0.0005)
        bpy.ops.object.mode_set(mode='OBJECT')
        decimate(o, TRIS_BODY if key == 'Body' else TRIS_WHEEL)
        vg = o.vertex_groups.new(name=key)
        vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
        o.data.materials.clear()
    # one object, one UV atlas, one material
    lo_list = list(objs.values())
    select(lo_list, objs['Body'])
    bpy.ops.object.join()
    lo = bpy.context.active_object
    lo.name = 'LO'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003)
    bpy.ops.object.mode_set(mode='OBJECT')
    img = bpy.data.images.new('mount_color', TEX, TEX)
    mt = bpy.data.materials.new('mount')
    mt.use_nodes = True
    bsdf = mt.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = 0.8
    tex = mt.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = img
    mt.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    mt.node_tree.nodes.active = tex
    lo.data.materials.append(mt)

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 1
    sc.render.bake.use_pass_direct = False
    sc.render.bake.use_pass_indirect = False
    sc.render.bake.use_pass_color = True
    select(his + [lo], lo)
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True,
                        cage_extrusion=0.04, max_ray_distance=0.12, margin=6)
    img.pack()
    for h in his:
        bpy.data.objects.remove(h)

    # back into body + wheels
    out = {}
    for key in ('WheelF', 'WheelR'):
        select([lo])
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        lo.vertex_groups.active_index = lo.vertex_groups[key].index
        bpy.ops.object.vertex_group_select()
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
        part = [x for x in bpy.context.selected_objects if x != lo][0]
        part.name = key
        part.vertex_groups.clear()
        out[key] = part
    lo.name = 'Body'
    lo.vertex_groups.clear()
    out['Body'] = lo
    return out


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    e.location = loc
    bpy.context.scene.collection.objects.link(e)
    return e


def build(name, cfg, src_dir, preview_dir):
    reset()
    bpy.ops.import_scene.gltf(filepath=os.path.join(src_dir, cfg['file']))
    body = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    bpy.ops.object.select_all(action='DESELECT')
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    body.name = 'Body'
    co = world_coords(body)
    before = len(body.data.polygons)

    wheels = {}
    for key, guess in (('WheelF', cfg['front']), ('WheelR', cfg['rear'])):
        cx, cz, r = fit_wheel(co, guess, cfg['half'])
        wheels[key] = (cx, cz, r)
        print(f'[mount] {name} {key}: centre x{cx:.3f} z{cz:.3f} r{r:.3f}')

    # rider points, in the Meshy frame
    x, y, z = co.T
    front_x, rear_x = wheels['WheelF'][0], wheels['WheelR'][0]
    span = rear_x - front_x
    hip_x = front_x + span * cfg.get('hip', 0.66)
    seat = (np.abs(x - hip_x) < 0.06) & (np.abs(y) < 0.1)
    seat_z = float(np.percentile(z[seat], 98))
    # grips: the outermost points of the bar, below the mirrors
    bar = (x < front_x + span * 0.45) & (x > front_x + span * 0.05) & (z > seat_z + 0.12) & (z < seat_z + 0.34)
    ys = np.abs(y[bar])
    tip = bar.copy()
    tip[bar] = ys > np.percentile(ys, 99.0)
    grip_x, grip_z = float(x[tip].mean()), float(z[tip].mean())
    grip_y = float(np.abs(y[tip]).mean()) - 0.05
    fl = (x > front_x + span * 0.3) & (x < front_x + span * 0.5) & (np.abs(y) < 0.12) & (z < seat_z - 0.15) & (z > wheels['WheelF'][1] - 0.1)
    foot_z = float(np.percentile(z[fl], 60)) if fl.any() else wheels['WheelF'][1] + 0.14
    print(f'[mount] {name} seat z{seat_z:.3f} at x{hip_x:.3f}; grips x{grip_x:.3f} y±{grip_y:.3f} z{grip_z:.3f}; floor z{foot_z:.3f}')

    # cut the wheels out
    objs = {'Body': body}
    for key in ('WheelF', 'WheelR'):
        # faces are renumbered after each split: recompute the mask on what is left
        n = len(body.data.polygons)
        cen = np.empty(n * 3, np.float32)
        body.data.polygons.foreach_get('center', cen)
        cen = cen.reshape(-1, 3)
        cx, cz, r = wheels[key]
        # the mudguard hugs the top of the tyre: take less there so it doesn't spin with the wheel
        lim = np.where(cen[:, 2] > cz + r * 0.3, r * 0.9, r * 0.985)
        m = (np.hypot(cen[:, 0] - cx, cen[:, 2] - cz) < lim) & (np.abs(cen[:, 1]) < cfg['half'])
        objs[key] = split_faces(body, m, key)
    print(f'[mount] {name}: {before} faces -> body {len(body.data.polygons)}, wheels {len(objs["WheelF"].data.polygons)} + {len(objs["WheelR"].data.polygons)}')

    objs = bake_low(objs)

    # rider anchors (L = the rider's left: the scooter faces -X here, so the rider's left is -Y)
    empty('Seat', (hip_x, 0, seat_z))
    empty('GripL', (grip_x, -grip_y, grip_z))
    empty('GripR', (grip_x, grip_y, grip_z))
    empty('Foot', (front_x + span * 0.4, 0, foot_z))

    # into the game frame: front to -Y, LENGTH long, wheels on the ground, centred between the axles
    ground = min(cz - r for cx, cz, r in wheels.values())
    mid = (front_x + rear_x) / 2
    s = LENGTH / (float(x.max() - x.min()))
    T = Matrix.Scale(s, 4) @ Matrix.Rotation(math.radians(90), 4, 'Z') @ Matrix.Translation((-mid, 0, -ground))
    bpy.context.view_layer.update()
    for o in list(bpy.context.scene.objects):
        o.matrix_world = T @ o.matrix_world
    for o in objs.values():
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for key in ('WheelF', 'WheelR'):
        cx, cz, r = wheels[key]
        bpy.context.scene.cursor.location = T @ Vector((cx, 0, cz))
        bpy.ops.object.select_all(action='DESELECT')
        objs[key].select_set(True)
        bpy.context.view_layer.objects.active = objs[key]
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
        objs[key]['radius'] = round(r * s, 4)  # glTF extras: the game spins the wheel by distance / radius
    bpy.context.scene.cursor.location = (0, 0, 0)

    if preview_dir:
        render_preview(os.path.join(preview_dir, f'{name}.png'), angle_deg=-60, elev_deg=18)
    out = os.path.join(REPO, 'public', 'models', 'mounts', f'{name}.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_yup=True, export_image_format='JPEG',
                              export_jpeg_quality=82, export_extras=True, export_cameras=False, export_lights=False,
                              export_animations=False)
    import gzip, shutil  # noqa: E401
    with open(out, 'rb') as f, gzip.open(out + '.gz', 'wb', compresslevel=9) as g:
        shutil.copyfileobj(f, g)
    os.remove(out)
    print(f'[mount] {name}: {tri_count()} triangles, {os.path.getsize(out + ".gz") / 1024:.0f} KB')


argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
src_dir = flag('--src') or '/mnt/project-files'
preview_dir = flag('--preview')
names = [a for i, a in enumerate(argv) if a in MOUNTS] or list(MOUNTS)
for nm in names:
    build(nm, MOUNTS[nm], src_dir, preview_dir)
