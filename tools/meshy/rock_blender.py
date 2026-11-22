# Blender (pip bpy): join, weld (remove doubles: Meshy meshes are split at UV seams, decimating them unwelded
# tears holes), decimate to N triangles, scale to SIZE across with the base on the ground. Then optimize_single.mjs.
#   python rock_blender.py -- IN.glb OUT.glb TRIS SIZE
import bpy, sys, mathutils
a=sys.argv[sys.argv.index('--')+1:]; src,dst,tris,size=a[0],a[1],int(a[2]),float(a[3])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
obs=[o for o in bpy.context.scene.objects if o.type=='MESH']
for o in obs:
    bpy.context.view_layer.objects.active=o; o.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.context.view_layer.objects.active=obs[0]
if len(obs)>1: bpy.ops.object.join()
obs=[o for o in bpy.context.scene.objects if o.type=='MESH']
print('OBJS',len(obs), sum(len(p.vertices)-2 for o in obs for p in o.data.polygons))
for o in obs:
    n=sum(len(p.vertices)-2 for p in o.data.polygons)
    print('N',n)
    if n>tris:
        import bmesh
        bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(o.data); bm.free()
        m=o.modifiers.new('d','DECIMATE'); m.ratio=tris/n; m.use_collapse_triangulate=True
        bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier='d')
vs=[o.matrix_world@v.co for o in obs for v in o.data.vertices]
mn=mathutils.Vector((min(v.x for v in vs),min(v.y for v in vs),min(v.z for v in vs))); mx=mathutils.Vector((max(v.x for v in vs),max(v.y for v in vs),max(v.z for v in vs)))
k=size/max(mx.x-mn.x,mx.y-mn.y)
for o in obs:
    for v in o.data.vertices:
        v.co=mathutils.Vector(((v.co.x-(mn.x+mx.x)/2)*k,(v.co.y-(mn.y+mx.y)/2)*k,(v.co.z-mn.z)*k))
print('DIMS',(mx-mn)*k)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92)
