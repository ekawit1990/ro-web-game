# Blender (pip bpy): weld then decimate a Meshy model that meshopt cannot simplify (too many UV seams).
#   python decimate_blender.py -- IN.glb OUT.glb TRIS   (then optimize_single.mjs)
import bpy, sys
a=sys.argv[sys.argv.index('--')+1:]; src,dst,tris=a[0],a[1],int(a[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in [o for o in bpy.context.scene.objects if o.type=='MESH']:
    n=sum(len(p.vertices)-2 for p in o.data.polygons)
    import bmesh
    bm=bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5); bm.to_mesh(o.data); bm.free()
    m=o.modifiers.new('d','DECIMATE'); m.ratio=min(1,tris/n); m.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=o; bpy.ops.object.modifier_apply(modifier='d')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_image_format='JPEG', export_jpeg_quality=92)
