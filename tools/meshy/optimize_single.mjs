// One Meshy model per monster -> game model: drop normal/metal maps, weld, meshopt simplify to N triangles, optional
// smooth normals, 1024 jpeg, quantize. Needs @gltf-transform/{core,extensions,functions} meshoptimizer sharp (scratch dir).
//   node optimize_single.mjs IN.glb OUT.glb TRIS TEX [smooth] && gzip -9 OUT.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, prune, dedup, textureCompress, quantize, normals } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [src, dst, tris, tex] = process.argv.slice(2);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const m of doc.getRoot().listMaterials()) {
  m.getNormalTexture()?.dispose(); m.setNormalTexture(null);
  m.getMetallicRoughnessTexture()?.dispose(); m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0); m.setRoughnessFactor(0.8); m.setDoubleSided(false);
}
let n = 0; for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) n += p.getIndices().getCount() / 3;
await doc.transform(weld({}), simplify({ simplifier: MeshoptSimplifier, ratio: Number(tris) / n, error: 0.01, lockBorder: false }), ...(process.argv[6] ? [normals({ overwrite: true }), weld({})] : []), prune(), dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [Number(tex), Number(tex)], quality: 88 }), quantize());
let m2 = 0; for (const me of doc.getRoot().listMeshes()) for (const p of me.listPrimitives()) { m2 += p.getIndices().getCount() / 3; p.setAttribute('NORMAL', p.getAttribute('NORMAL')); }
await io.write(dst, doc);
console.log(src, n, '->', m2);
