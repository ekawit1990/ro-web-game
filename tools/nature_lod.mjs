// Far-away versions of the nature trees (2026-11-17): public/models/nature/<Tree>.glb.gz -> <Tree>_lod.glb.gz
// with about a quarter of the triangles. nature.ts swaps a patch of trees to these when it is far from the camera.
//
// Needs (outside the repo, e.g. in a scratch folder): npm i @gltf-transform/core @gltf-transform/functions meshoptimizer
// Run: copy this file next to that node_modules, then: node nature_lod.mjs <repo>/public/models/nature/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const DIR = process.argv[2] ?? new URL('../public/models/nature/', import.meta.url).pathname;
const RATIO = 0.25;
await MeshoptSimplifier.ready;
const io = new NodeIO();
const count = (doc) => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives()).reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);
for (const f of readdirSync(DIR).filter((f) => /Tree_\d\.glb\.gz$/.test(f))) {
  const doc = await io.readBinary(new Uint8Array(gunzipSync(readFileSync(DIR + f))));
  const before = count(doc);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: RATIO, error: 0.06 }));
  const out = f.replace('.glb.gz', '_lod.glb.gz');
  writeFileSync(DIR + out, gzipSync(await io.writeBinary(doc), { level: 9 }));
  console.log(out, before, '->', count(doc));
}
