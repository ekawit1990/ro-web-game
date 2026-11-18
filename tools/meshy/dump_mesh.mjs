import { NodeIO } from '@gltf-transform/core';
import fs from 'fs';
const doc = await new NodeIO().read(process.argv[2]||'src.glb');
const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
fs.writeFileSync('pos.f32', Buffer.from(p.getAttribute('POSITION').getArray().buffer));
fs.writeFileSync('idx.u32', Buffer.from(new Uint32Array(p.getIndices().getArray()).buffer));
