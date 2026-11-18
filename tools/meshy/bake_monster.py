import bpy, sys, os, math
src, dst, tris, tex = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
hi = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = hi
hi.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# recentre: feet on ground (blender Z up), centre in XY
import mathutils
vs = [hi.matrix_world @ v.co for v in hi.data.vertices]
mn = mathutils.Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
mx = mathutils.Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
off = mathutils.Vector(((mn.x+mx.x)/2, (mn.y+mx.y)/2, mn.z))
for v in hi.data.vertices: v.co -= off
import bmesh
H = mx.z - mn.z; W = mx.x - mn.x; D = mx.y - mn.y
bm = bmesh.new(); bm.from_mesh(hi.data); bm.faces.ensure_lookup_table()
levels = {}
for f in bm.faces:
    c = f.calc_center_median()
    if f.normal.z > 0.8 and c.z < 0.14*H:
        k = round(c.z/(0.004*H)); levels[k] = levels.get(k, 0) + f.calc_area()
OVR = {'m57': 0.06, 'm58': 0.065}
name = os.path.basename(src).split('.')[0]
plate = OVR[name] * H if name in OVR else None
if plate is None and levels:
    k, a = max(levels.items(), key=lambda t: t[1])
    if a > 0.06*W*D: plate = (k+0.5)*0.004*H
if plate is not None:
    dead = [f for f in bm.faces if all(v.co.z <= plate + 0.004*H for v in f.verts)]
    bmesh.ops.delete(bm, geom=dead, context='FACES')
    print('PLATE removed at', round(plate/H,3), 'faces', len(dead))
# loose bits left beside the body (a cut stand): keep islands that touch the biggest one's footprint
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.faces.ensure_lookup_table()
seen = set(); islands = []
for f in bm.faces:
    if f.index in seen: continue
    stack = [f]; seen.add(f.index); isl = []
    while stack:
        g = stack.pop(); isl.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in seen: seen.add(h.index); stack.append(h)
    islands.append(isl)
islands.sort(key=len, reverse=True)
def bb(isl):
    vs = [v.co for f in isl for v in f.verts]
    return (min(v.x for v in vs), max(v.x for v in vs), min(v.y for v in vs), max(v.y for v in vs), min(v.z for v in vs), max(v.z for v in vs))
if islands:
    B = bb(islands[0]); m = 0.05 * W
    dead = []
    for isl in islands[1:]:
        b = bb(isl)
        if b[5] < 0.25*H and (b[0] > B[1]+m or b[1] < B[0]-m or b[2] > B[3]+m or b[3] < B[2]-m):
            dead += isl
    if dead:
        bmesh.ops.delete(bm, geom=dead, context='FACES'); print('LOOSE removed', len(dead))
# The sheet sculpt is only modelled and painted well from the front: its back is flat and smeared.
# Give it volume (round things come out round) by "inflating" the back: from the front silhouette, the body's
# thickness at each point is pushed toward a round profile (distance to the outline), limited to a few times
# Meshy's own thickness there so flat wings and thin weapons stay flat. Back-facing surfaces are then smoothed and
# painted from a picture of the front with its small details (eyes, mouth) filtered out, so the back gets the
# body's colours and no second face. --keep-back keeps Meshy's own back.
KEEP_BACK = '--keep-back' in sys.argv
import numpy as np
from scipy import ndimage
fy = 1.0
bm.normal_update()
if not KEEP_BACK:
    R = 160
    P = np.array([v.co[:] for v in bm.verts], dtype=np.float64)
    Nn = np.array([v.normal[:] for v in bm.verts], dtype=np.float64)
    x0, x1 = P[:, 0].min(), P[:, 0].max(); z0_, z1 = P[:, 2].min(), P[:, 2].max()
    S = max(x1 - x0, z1 - z0_) * 1.04; cx_, cz_ = (x0 + x1) / 2, (z0_ + z1) / 2
    ix = np.clip(((P[:, 0] - cx_) / S + 0.5) * R, 0, R - 1).astype(int)
    iz = np.clip(((P[:, 2] - cz_) / S + 0.5) * R, 0, R - 1).astype(int)
    F = np.full((R, R), np.inf); B = np.full((R, R), -np.inf)
    np.minimum.at(F, (iz, ix), P[:, 1]); np.maximum.at(B, (iz, ix), P[:, 1])
    mask = np.isfinite(F)
    mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=2))
    # fill empty pixels inside the outline from their neighbours
    for M_ in (F, B):
        bad = ~np.isfinite(M_)
        idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
        M_[...] = M_[tuple(idx)]
    T = np.maximum(B - F, 0)
    d = ndimage.distance_transform_edt(mask) * S / R  # distance to the outline, in model units
    Dm = max(d.max(), 1e-6)
    # a round profile across the body, as deep at its centre as ~95% of the model's width
    round_t = np.sqrt(np.clip(d * (2 * Dm - d), 0, None)) / Dm * 0.95 * min(W, 1.6 * H)
    want = np.minimum(round_t, np.maximum(T * 3.5, T + 0.3 * d))
    grow = ndimage.gaussian_filter(np.maximum(want - T, 0) * mask, 2.0)
    w = np.clip(Nn[:, 1] * 1.6, 0, 1)  # 1 = faces straight back (+Y is the back in Blender)
    dy = grow[iz, ix] * w
    for i, v in enumerate(bm.verts): v.co.y += dy[i]
    back = [v for i, v in enumerate(bm.verts) if w[i] > 0.5]
    for _ in range(8): bmesh.ops.smooth_vert(bm, verts=back, factor=0.5, use_axis_x=False, use_axis_y=True, use_axis_z=False)
    bm.normal_update()
    bw = [max(0.0, min(1.0, (v.normal.y + 0.4) * 2.0)) for v in bm.verts]  # sides too: Meshy streaks them
    print('INFLATE max', round(float(grow.max() / max(T.max(), 1e-6)), 2))
else:
    fy = max(1.0, min(1.8, 0.85*W/max(D,1e-6)))
    for v in bm.verts: v.co.y *= fy
bm.to_mesh(hi.data); bm.free()
zs = [v.co.z for v in hi.data.vertices]; z0 = min(zs)
for v in hi.data.vertices: v.co.z -= z0
sources = [hi]
if not KEEP_BACK:
    # how much each vertex faces back, for the material to swap in the front picture there
    ca = hi.data.color_attributes.new('Back', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(ca.data): c.color = (bw[i], bw[i], bw[i], 1)
    Hz = max(v.co.z for v in hi.data.vertices)
    S = max(W, Hz) * 1.06; zc = Hz / 2
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 4; sc.cycles.device = 'CPU'
    sc.view_settings.view_transform = 'Standard'
    sc.render.film_transparent = True; sc.render.resolution_x = sc.render.resolution_y = 256
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'
    if sc.world is None: sc.world = bpy.data.worlds.new('w')
    keep = list(hi.data.materials)
    src_img = None
    for hm in keep:
        for nd in hm.node_tree.nodes:
            if nd.type == 'TEX_IMAGE' and nd.image and any(l.to_socket.name == 'Base Color' for l in nd.outputs['Color'].links): src_img = nd.image
    flat = bpy.data.materials.new('Flat'); flat.use_nodes = True
    fn = flat.node_tree; fn.nodes.clear()
    ti = fn.nodes.new('ShaderNodeTexImage'); ti.image = src_img
    em = fn.nodes.new('ShaderNodeEmission'); out = fn.nodes.new('ShaderNodeOutputMaterial')
    fn.links.new(ti.outputs['Color'], em.inputs['Color']); fn.links.new(em.outputs['Emission'], out.inputs['Surface'])
    for i in range(len(hi.data.materials)): hi.data.materials[i] = flat
    cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = S
    cam = bpy.data.objects.new('c', cd); bpy.context.collection.objects.link(cam)
    cam.location = (0, -5, zc); cam.rotation_euler = (math.pi / 2, 0, 0); sc.camera = cam
    shot = os.path.join(os.path.dirname(os.path.abspath(dst)), f'_front_{os.getpid()}.png')
    sc.render.filepath = shot; bpy.ops.render.render(write_still=True)
    for i, hm in enumerate(keep): hi.data.materials[i] = hm
    im = bpy.data.images.load(shot); a = np.array(im.pixels[:], dtype=np.float32).reshape(256, 256, 4)
    os.remove(shot)
    # small details out (median), then soften; spread colour past the outline so edges don't go dark
    al = a[..., 3] > 0.5
    rgb = a[..., :3].copy()
    idx = ndimage.distance_transform_edt(~al, return_distances=False, return_indices=True)
    rgb = rgb[tuple(idx)]
    med = np.dstack([ndimage.median_filter(rgb[..., c], size=61) for c in range(3)])
    med = np.dstack([ndimage.gaussian_filter(med[..., c], 3) for c in range(3)] + [np.ones((256, 256), np.float32)])
    proj = bpy.data.images.new('FrontClean', 256, 256); proj.pixels = med.ravel().tolist()
    for hm in keep:
        nt_ = hm.node_tree; bsdf_ = nt_.nodes.get('Principled BSDF')
        if not bsdf_: continue
        orig = [l.from_socket for l in bsdf_.inputs['Base Color'].links]
        if not orig: continue
        tc = nt_.nodes.new('ShaderNodeTexCoord'); sx = nt_.nodes.new('ShaderNodeSeparateXYZ'); cx = nt_.nodes.new('ShaderNodeCombineXYZ')
        mu = nt_.nodes.new('ShaderNodeMath'); mu.operation = 'MULTIPLY_ADD'; mu.inputs[1].default_value = 1 / S; mu.inputs[2].default_value = 0.5
        mv = nt_.nodes.new('ShaderNodeMath'); mv.operation = 'MULTIPLY_ADD'; mv.inputs[1].default_value = 1 / S; mv.inputs[2].default_value = 0.5 - zc / S
        bi = nt_.nodes.new('ShaderNodeTexImage'); bi.image = proj; bi.extension = 'EXTEND'
        va = nt_.nodes.new('ShaderNodeVertexColor'); va.layer_name = 'Back'
        mix = nt_.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
        nt_.links.new(tc.outputs['Object'], sx.inputs[0]); nt_.links.new(sx.outputs['X'], mu.inputs[0]); nt_.links.new(sx.outputs['Z'], mv.inputs[0])
        nt_.links.new(mu.outputs[0], cx.inputs['X']); nt_.links.new(mv.outputs[0], cx.inputs['Y'])
        nt_.links.new(cx.outputs[0], bi.inputs['Vector'])
        nt_.links.new(va.outputs['Color'], mix.inputs['Factor'])
        nt_.links.new(orig[0], mix.inputs['A']); nt_.links.new(bi.outputs['Color'], mix.inputs['B'])
        nt_.links.new(mix.outputs['Result'], bsdf_.inputs['Base Color'])
parts = []
for o in sources:
    c = o.copy(); c.data = o.data.copy(); bpy.context.collection.objects.link(c); parts.append(c)
bpy.ops.object.select_all(action='DESELECT')
for c in parts: c.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
if len(parts) > 1: bpy.ops.object.join()
lo = parts[0]; lo.name = 'Monster'
bpy.ops.object.select_all(action='DESELECT'); lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
now = len(lo.data.polygons)
md = lo.modifiers.new('d','DECIMATE'); md.ratio = min(1, tris/max(1,now)); md.use_collapse_triangulate=True
bpy.ops.object.modifier_apply(modifier='d')
# new UVs
while lo.data.uv_layers: lo.data.uv_layers.remove(lo.data.uv_layers[0])
lo.data.uv_layers.new(name='UV')
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')
img = bpy.data.images.new('MonsterTex', tex, tex)
m = bpy.data.materials.new('MonsterMat'); m.use_nodes=True
nt = m.node_tree; bsdf = nt.nodes['Principled BSDF']
tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Metallic'].default_value=0; bsdf.inputs['Roughness'].default_value=0.8
lo.data.materials.clear(); lo.data.materials.append(m)
nt.nodes.active = tn
# hi material: strip metal so diffuse colour bakes cleanly
for hm in hi.data.materials:
    b = hm.node_tree.nodes.get('Principled BSDF')
    if not b: continue
    for name in ('Metallic',):
        for l in list(b.inputs[name].links): hm.node_tree.links.remove(l)
    b.inputs['Metallic'].default_value = 0
sc = bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=1; sc.cycles.device='CPU'
bpy.ops.object.select_all(action='DESELECT')
for o in sources: o.select_set(True)
lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True, cage_extrusion=0.02, max_ray_distance=0.05, margin=4)
img.file_format='JPEG'
for o in sources: bpy.data.objects.remove(o)
for o in [o for o in bpy.context.scene.objects if o.type == 'CAMERA']: bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_image_format='JPEG', export_jpeg_quality=88, export_animations=False)
print('DEPTH x', fy); print('DONE', len(lo.data.polygons), [round(x,3) for x in (mx-mn)])
