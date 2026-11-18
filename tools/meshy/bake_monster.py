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
# fake depth: Meshy sheets come out flat front-to-back
fy = max(1.0, min(1.8, 0.85*W/max(D,1e-6)))
for v in bm.verts: v.co.y *= fy
bm.to_mesh(hi.data); bm.free()
zs = [v.co.z for v in hi.data.vertices]; z0 = min(zs)
for v in hi.data.vertices: v.co.z -= z0
print('DEPTH x', round(fy,2))
# merge split vertices so decimate keeps the surface
lo = hi.copy(); lo.data = hi.data.copy(); bpy.context.collection.objects.link(lo); lo.name='Monster'
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
    for name in ('Metallic',):
        for l in list(b.inputs[name].links): hm.node_tree.links.remove(l)
    b.inputs['Metallic'].default_value = 0
sc = bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.samples=1; sc.cycles.device='CPU'
bpy.ops.object.select_all(action='DESELECT'); hi.select_set(True); lo.select_set(True); bpy.context.view_layer.objects.active = lo
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True, cage_extrusion=0.02, max_ray_distance=0.05, margin=4)
img.file_format='JPEG'
bpy.data.objects.remove(hi)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_image_format='JPEG', export_jpeg_quality=88, export_animations=False)
print('DONE', len(lo.data.polygons), [round(x,3) for x in (mx-mn)])
