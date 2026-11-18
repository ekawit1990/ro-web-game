import { NodeIO } from '@gltf-transform/core';
import { prune } from '@gltf-transform/functions';
import fs from 'fs';
const io = new NodeIO();
const ta = new Int8Array(fs.readFileSync('tri_assign2.bin'));
fs.mkdirSync('../split2',{recursive:true});
const base = await io.readBinary(fs.readFileSync('src2.glb'));
const idxAll = base.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getArray();
const buckets = Array.from({length:77},()=>[]);
for (let t=0;t<ta.length;t++) if(ta[t]>=0) buckets[ta[t]].push(t);
for (let k=0;k<77;k++){
  const doc = await io.readBinary(fs.readFileSync('src2.glb'));
  const p = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  const map=new Map(); const ni=new Uint32Array(buckets[k].length*3);
  let i=0; for(const t of buckets[k]) for(let j=0;j<3;j++){const v=idxAll[t*3+j];let m=map.get(v);if(m===undefined){m=map.size;map.set(v,m)}ni[i++]=m}
  const old=[...map.keys()];
  for (const sem of p.listSemantics()){const a=p.getAttribute(sem);const s=a.getElementSize();const src=a.getArray();const dst=new Float32Array(old.length*s);old.forEach((o,ii)=>{for(let j=0;j<s;j++)dst[ii*s+j]=src[o*s+j]});a.setArray(dst)}
  p.getIndices().setArray(ni);
  await doc.transform(prune());
  fs.writeFileSync(`../split2/m${String(k+1).padStart(2,'0')}.glb`, await io.writeBinary(doc));
}
console.log('ok');
