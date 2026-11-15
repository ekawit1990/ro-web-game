"""
Shrink a heavy model (Meshy AI, Sketchfab, a sculpt...) for the game: fewer triangles, smaller
colour texture, no normal/metal/roughness maps, gzipped GLB.

    python tools/blender/optimize_glb.py IN.glb OUT.glb [--tris 30000] [--tex 1024] [--preview PNG]
    blender -b -P tools/blender/optimize_glb.py -- IN.glb OUT.glb --tris 30000

Writes OUT.glb.gz. Skinned models keep their bones and weights (Decimate keeps vertex groups).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ml_blender import decimate, export_glb, flag, render_preview, reset, tri_count  # noqa: E402
import bpy  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
files = [a for i, a in enumerate(argv) if not a.startswith('--') and (i == 0 or argv[i - 1] not in ('--tris', '--tex', '--preview'))]
if len(files) < 2:
    raise SystemExit(__doc__)
src, dst = os.path.abspath(files[0]), os.path.abspath(files[1])
target = int(flag('--tris') or 30000)
tex = int(flag('--tex') or 1024)

reset()
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
before = tri_count(meshes)
print(f'[ml] in: {before} triangles in {len(meshes)} meshes')

# triangles: share the budget between meshes by their size
for o in meshes:
    share = max(200, round(target * tri_count([o]) / max(1, before)))
    decimate(o, share)

# materials: keep only the colour map, scaled down
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if not bsdf:
        continue
    for name in ('Normal', 'Metallic', 'Roughness'):
        for link in list(bsdf.inputs[name].links):
            m.node_tree.links.remove(link)
    bsdf.inputs['Metallic'].default_value = 0
    bsdf.inputs['Roughness'].default_value = 0.8
used = set()
for m in bpy.data.materials:
    if m.use_nodes:
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        for inp in (bsdf.inputs if bsdf else []):
            for link in inp.links:
                if link.from_node.type == 'TEX_IMAGE' and link.from_node.image:
                    used.add(link.from_node.image)
for img in used:
    w, h = img.size
    if max(w, h) > tex:
        k = tex / max(w, h)
        img.scale(max(1, round(w * k)), max(1, round(h * k)))
        print(f'[ml] texture {img.name}: {w}x{h} -> {img.size[0]}x{img.size[1]}')

if (png := flag('--preview')):
    render_preview(os.path.abspath(png))
bpy.context.scene.render.image_settings.quality = 85
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_yup=True, export_image_format='JPEG',
                          export_jpeg_quality=85, export_animations=True, export_cameras=False, export_lights=False)
import gzip, shutil  # noqa: E402
with open(dst, 'rb') as f, gzip.open(dst + '.gz', 'wb', compresslevel=9) as g:
    shutil.copyfileobj(f, g)
os.remove(dst)
print(f'[ml] out: {tri_count()} triangles, {os.path.getsize(dst + ".gz") / 1024:.0f} KB -> {dst}.gz')
