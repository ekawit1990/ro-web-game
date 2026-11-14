// Rigs the abyss reaper sculpt (Meshy AI, no skeleton) for the game:
// a skeleton (Root, Hips, Chest, Head, ArmR + HandR holding the scythe, ArmL), skin weights by region,
// the scythe cut off the body where the sculpt fused it (fist, skirt, boots), and baked clips named like
// the Quaternius ones (Idle, Walk, Punch, HitReact, Death) so MonsterAnim plays them.
//
// Input: the simplified model (about 30k triangles, colour texture only; see public/models/monsters/CREDITS.md).
// Needs @gltf-transform/core and @gltf-transform/extensions (not game dependencies), e.g. in a scratch folder:
//   npm i @gltf-transform/core @gltf-transform/extensions
//   node rig_reaper.mjs reaper_30k.glb rigged.glb          (add `debug` to colour the vertices by bone instead)
// then quantize (KHR_mesh_quantization) and gzip -9 into public/models/monsters/Crimson_Reaper.glb.gz.
// Coordinates are the sculpt's own (1.9 units tall, centred on the origin, facing +Z).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const [,, inp, out, mode] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
const root = doc.getRoot();
const buf = root.listBuffers()[0];
const meshNode = root.listNodes().find((n) => n.getMesh());
const prim = meshNode.getMesh().listPrimitives()[0];
const pos = prim.getAttribute('POSITION').getArray();
const idx = prim.getIndices().getArray();
const n = pos.length / 3;

// ---- connected components (the ground chain ring and crystals are separate pieces)
const parent = new Int32Array(n).map((_, i) => i);
const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]), b = find(idx[i + 1]), c = find(idx[i + 2]); parent[a] = c; parent[b] = c; }
const key = new Map();
for (let i = 0; i < n; i++) { const k = `${pos[3*i].toFixed(5)},${pos[3*i+1].toFixed(5)},${pos[3*i+2].toFixed(5)}`; if (key.has(k)) { const a = find(i), b = find(key.get(k)); parent[a] = b; } else key.set(k, i); }
const size = new Map();
for (let i = 0; i < n; i++) { const r = find(i); size.set(r, (size.get(r) ?? 0) + 1); }
const main = [...size.entries()].sort((a, b) => b[1] - a[1])[0][0];

// ---- bones (model space, the model faces +Z, its right hand holds the scythe at -X)
const BONES = [
  { name: 'Root', p: [0.12, -0.95, 0.03], parent: -1 },
  { name: 'Hips', p: [0.12, -0.42, 0.04], parent: 0 },
  { name: 'Chest', p: [0.13, -0.2, 0.05], parent: 1 },
  { name: 'Head', p: [0.14, -0.04, 0.05], parent: 2 },
  { name: 'ArmR', p: [-0.02, -0.08, 0.07], parent: 2 },
  { name: 'HandR', p: [-0.18, -0.12, 0.13], parent: 4 },
  { name: 'ArmL', p: [0.32, -0.1, 0.06], parent: 2 },
];
const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function segDist(p, a, b) {
  const ab = sub(b, a), ap = sub(p, a);
  const t = Math.max(0, Math.min(1, dot(ap, ab) / dot(ab, ab)));
  const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const STAFF = [[-0.19, 0.92, 0.065], [-0.17, 0.0, 0.125], [-0.17, -0.86, 0.26]];
const ANTLER_L = [[-0.02, 0.3, 0.07], [-0.4, 0.53, 0.0]];
const HEAD_C = [0.15, 0.1, 0.05];
const HAND_R = [-0.18, -0.12, 0.13];

/** Is vertex i part of the scythe (staff, its head with blade, skull and spike, the chains hanging from it)? */
function isScythe(i) {
  const p = [pos[3*i], pos[3*i+1], pos[3*i+2]];
  const [x, y] = p;
  if (find(i) !== main) return false;
  const dStaff = Math.min(segDist(p, STAFF[0], STAFF[1]), segDist(p, STAFF[1], STAFF[2]));
  const dAntL = segDist(p, ANTLER_L[0], ANTLER_L[1]);
  if (dStaff < (y < -0.22 ? 0.03 : 0.05)) return true;
  if (y > 0.56 && x < 0.02) return true;
  if (x < -0.4 && y > 0.1) return true;
  if (x < 0.0 && x > -0.4 && y > 0.3 && dAntL > 0.08) return true;
  return false;
}

/** Skin weights of the body (everything but the scythe) at vertex i. */
function weights(i) {
  const p = [pos[3*i], pos[3*i+1], pos[3*i+2]];
  const [x, y] = p;
  if (find(i) !== main) return { Root: 1 };
  const dAntL = segDist(p, ANTLER_L[0], ANTLER_L[1]);
  // the head: hood and skull, both antlers and the chains on the right one
  if (dAntL < 0.08) return { Head: 1 };
  if (x > 0.26 && y > 0.1) return { Head: 1 };
  const dHead = Math.hypot(p[0] - HEAD_C[0], p[1] - HEAD_C[1], p[2] - HEAD_C[2]);
  if (y > -0.1 && dHead < 0.3) { const t = ss(-0.1, -0.02, y); return { Head: t, Chest: 1 - t }; }
  // the fist round the staff turns with the scythe
  if (Math.hypot(p[0] - HAND_R[0], p[1] - HAND_R[1], p[2] - HAND_R[2]) < 0.075) return { HandR: 1 };
  // arms with the shoulder cape
  if (x < 0.0 && y > -0.29 && y < 0.06) { const t = ss(0.0, -0.1, x); return { ArmR: t, Chest: 1 - t }; }
  if (x > 0.28 && y > -0.4 && y < 0.12) { const t = ss(0.28, 0.38, x); return { ArmL: t, Chest: 1 - t }; }
  // torso, skirt, boots
  if (y > -0.36) { const t = ss(-0.36, -0.24, y); return { Chest: t, Hips: 1 - t }; }
  if (y > -0.62) return { Hips: 1 };
  const t = ss(-0.84, -0.62, y); return { Hips: t, Root: 1 - t };
}

// The scythe is fused to the body (through the fist, the skirt and the boots): cut it off along its edge, so a
// swing doesn't drag sheets of skirt along. A triangle with two or more scythe vertices belongs to the scythe; a
// vertex shared by scythe and body triangles is split into two copies.
const scy = new Uint8Array(n);
for (let i = 0; i < n; i++) scy[i] = isScythe(i) ? 1 : 0;
const triS = new Uint8Array(idx.length / 3);
const usedS = new Uint8Array(n), usedB = new Uint8Array(n);
for (let t = 0; t < triS.length; t++) {
  const a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
  triS[t] = scy[a] + scy[b] + scy[c] >= 2 ? 1 : 0;
  for (const v of [a, b, c]) (triS[t] ? usedS : usedB)[v] = 1;
}
const copyOf = new Int32Array(n).fill(-1);
let extra = 0;
for (let i = 0; i < n; i++) if (usedS[i] && usedB[i]) copyOf[i] = n + extra++;
const N = n + extra;
const newIdx = new Uint32Array(idx.length);
for (let t = 0; t < triS.length; t++) for (let k = 0; k < 3; k++) { const v = idx[3*t+k]; newIdx[3*t+k] = triS[t] && copyOf[v] >= 0 ? copyOf[v] : v; }
for (const sem of prim.listSemantics()) {
  const acc = prim.getAttribute(sem); const src = acc.getArray(); const sz = acc.getElementSize();
  const dst = new src.constructor(N * sz); dst.set(src);
  for (let i = 0; i < n; i++) if (copyOf[i] >= 0) for (let k = 0; k < sz; k++) dst[copyOf[i] * sz + k] = src[i * sz + k];
  acc.setArray(dst);
}
prim.getIndices().setArray(newIdx);
console.log('scythe cut: split', extra, 'vertices');

const J = new Uint8Array(N * 4), W = new Float32Array(N * 4);
const COL = [[0.5, 0.5, 0.5], [0.2, 0.4, 1], [0.1, 0.8, 0.3], [1, 0.9, 0.1], [1, 0.4, 0.1], [1, 0, 0.2], [0.7, 0.2, 1]];
const C = new Float32Array(N * 3);
const put = (i, wts) => {
  const w = Object.entries(wts).filter(([, v]) => v > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = w.reduce((a, [, v]) => a + v, 0);
  w.forEach(([k, v], j) => { J[i * 4 + j] = B[k]; W[i * 4 + j] = v / s; });
  for (const [k, v] of w) for (let c = 0; c < 3; c++) C[i * 3 + c] += COL[B[k]][c] * v / s;
};
for (let i = 0; i < n; i++) {
  put(i, usedS[i] && !usedB[i] ? { HandR: 1 } : weights(i));
  if (copyOf[i] >= 0) put(copyOf[i], { HandR: 1 });
}

if (mode === 'debug') {
  prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(C).setBuffer(buf));
  await io.write(out, doc);
  process.exit(0);
}

// ---- skeleton
const nodes = BONES.map((b) => doc.createNode(b.name));
BONES.forEach((b, i) => {
  const pp = b.parent >= 0 ? BONES[b.parent].p : [0, 0, 0];
  nodes[i].setTranslation(sub(b.p, pp));
  if (b.parent >= 0) nodes[b.parent].addChild(nodes[i]);
});
const scene = root.listScenes()[0];
const armature = doc.createNode('Armature');
armature.addChild(nodes[0]);
scene.addChild(armature);
const ibm = new Float32Array(16 * BONES.length);
BONES.forEach((b, i) => { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -b.p[0], -b.p[1], -b.p[2], 1], i * 16); });
const skin = doc.createSkin('ReaperSkin').setSkeleton(nodes[0]).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
nodes.forEach((nd) => skin.addJoint(nd));
meshNode.setSkin(skin);
prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(J).setBuffer(buf));
prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buf));

// ---- clips: keyframes of euler angles (x, y, z) per bone, turned into quaternions
function quat([x, y, z]) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3]; // XYZ order
}
function clip(name, keys) {
  // keys: { Bone: [[t, [rx, ry, rz]], ...], 'Hips.t': [[t, [dx, dy, dz]], ...] }
  const anim = doc.createAnimation(name);
  for (const [k, frames] of Object.entries(keys)) {
    const [bone, what] = k.split('.');
    const node = nodes[B[bone]];
    const times = new Float32Array(frames.map((f) => f[0]));
    const vals = what === 't'
      ? new Float32Array(frames.flatMap((f) => { const b = BONES[B[bone]]; const pp = b.parent >= 0 ? BONES[b.parent].p : [0, 0, 0]; const base = sub(b.p, pp); return [base[0] + f[1][0], base[1] + f[1][1], base[2] + f[1][2]]; }))
      : new Float32Array(frames.flatMap((f) => quat(f[1])));
    const sampler = doc.createAnimationSampler()
      .setInput(doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buf))
      .setOutput(doc.createAccessor().setType(what === 't' ? 'VEC3' : 'VEC4').setArray(vals).setBuffer(buf))
      .setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(what === 't' ? 'translation' : 'rotation').setSampler(sampler));
  }
}
// sample a smooth function into keys
const loop = (dur, steps, f) => Array.from({ length: steps + 1 }, (_, i) => { const t = (i / steps) * dur; return [t, f((i / steps) * Math.PI * 2, t)]; });
const S = Math.sin, Cc = Math.cos;
// Idle: breathing, a slow sway, the scythe rocking, head bobbing
clip('Idle', {
  Hips: loop(3, 24, (a) => [0, S(a) * 0.04, S(a) * 0.025]),
  Chest: loop(3, 24, (a) => [S(a * 2) * 0.03, 0, -S(a) * 0.02]),
  Head: loop(3, 24, (a) => [S(a * 2 + 0.6) * 0.06, S(a) * 0.08, S(a + 1) * 0.04]),
  ArmR: loop(3, 24, (a) => [S(a + 0.5) * 0.07, 0, S(a) * 0.05]),
  HandR: loop(3, 24, (a) => [0, 0, S(a + 1.2) * 0.06]),
  ArmL: loop(3, 24, (a) => [S(a + 2) * 0.12, 0, S(a * 2) * 0.08 + 0.05]),
  'Hips.t': loop(3, 24, (a) => [0, S(a * 2) * 0.008, 0]),
});
// Walk: a gliding stride, leaning in, the arms swinging
clip('Walk', {
  Hips: loop(1, 16, (a) => [0.06, S(a) * 0.12, S(a) * 0.05]),
  Chest: loop(1, 16, (a) => [0.1, -S(a) * 0.15, 0]),
  Head: loop(1, 16, (a) => [-0.08 + S(a * 2) * 0.05, S(a) * 0.06, 0]),
  ArmR: loop(1, 16, (a) => [S(a) * 0.3, 0, -0.05]),
  HandR: loop(1, 16, (a) => [S(a + 0.5) * 0.12, 0, 0]),
  ArmL: loop(1, 16, (a) => [-S(a) * 0.4, 0, 0.12]),
  'Hips.t': loop(1, 16, (a) => [0, Math.abs(S(a)) * 0.025, 0]),
});
// Punch: the scythe swung up over the head, swept across the front, then brought down to the ground, then back to rest
const UP = 0.22, HIT = 0.32, FOLLOW = 0.45, HOLD = 0.56, END = 0.95;
clip('Punch', {
  Hips: [[0, [0, 0, 0]], [UP, [-0.05, -0.2, 0]], [HIT, [0.08, 0.15, 0]], [FOLLOW, [0.1, 0.25, 0]], [HOLD, [0.1, 0.27, 0]], [END, [0, 0, 0]]],
  Chest: [[0, [0, 0, 0]], [UP, [-0.12, -0.3, 0]], [HIT, [0.2, 0.25, 0]], [FOLLOW, [0.25, 0.35, 0]], [HOLD, [0.24, 0.37, 0]], [END, [0, 0, 0]]],
  Head: [[0, [0, 0, 0]], [UP, [-0.1, 0.15, 0]], [HIT, [0.12, -0.1, 0]], [FOLLOW, [0.15, -0.15, 0]], [HOLD, [0.14, -0.15, 0]], [END, [0, 0, 0]]],
  ArmR: [[0, [0, 0, 0]], [UP, [-0.3, 0, -0.9]], [HIT, [0.7, 0, 0.4]], [FOLLOW, [1.0, 0, 0.05]], [HOLD, [1.05, 0, 0.05]], [END, [0, 0, 0]]],
  HandR: [[0, [0, 0, 0]], [UP, [0, 0, 0.6]], [HIT, [0.6, 0, -0.6]], [FOLLOW, [0.85, 0, 0]], [HOLD, [0.88, 0, 0]], [END, [0, 0, 0]]],
  ArmL: [[0, [0, 0, 0]], [UP, [0.3, 0, 0.5]], [HIT, [-0.3, 0, 0.35]], [FOLLOW, [-0.4, 0, 0.3]], [HOLD, [-0.38, 0, 0.3]], [END, [0, 0, 0]]],
});
// HitReact: jolted back
clip('HitReact', {
  Hips: [[0, [0, 0, 0]], [0.1, [-0.12, 0, 0.04]], [0.4, [0, 0, 0]]],
  Chest: [[0, [0, 0, 0]], [0.1, [-0.2, 0.1, 0]], [0.4, [0, 0, 0]]],
  Head: [[0, [0, 0, 0]], [0.1, [-0.3, -0.15, 0.1]], [0.4, [0, 0, 0]]],
  ArmR: [[0, [0, 0, 0]], [0.1, [-0.3, 0, -0.2]], [0.4, [0, 0, 0]]],
  ArmL: [[0, [0, 0, 0]], [0.1, [-0.3, 0, 0.4]], [0.4, [0, 0, 0]]],
});
// Death: staggers, then falls back, the scythe dropping
clip('Death', {
  Hips: [[0, [0, 0, 0]], [0.3, [0.2, 0, 0.1]], [1.1, [-1.25, 0, 0.15]]],
  Chest: [[0, [0, 0, 0]], [0.3, [0.25, 0, 0]], [1.1, [-0.2, 0, 0]]],
  Head: [[0, [0, 0, 0]], [0.3, [0.35, 0, 0]], [1.1, [-0.3, 0.3, 0.2]]],
  ArmR: [[0, [0, 0, 0]], [0.3, [0.3, 0, -0.2]], [1.1, [-0.6, 0, -1.0]]],
  HandR: [[0, [0, 0, 0]], [1.1, [0, 0, 0.6]]],
  ArmL: [[0, [0, 0, 0]], [0.3, [0.3, 0, 0.3]], [1.1, [-0.6, 0, 1.0]]],
  'Hips.t': [[0, [0, 0, 0]], [1.1, [0, -0.15, -0.1]]],
});
// the painted texture is the whole look: the game lights it a little from within
scene.setExtras({ selfLit: 0.5 });
await io.write(out, doc);
console.log('rigged', BONES.length, 'bones,', root.listAnimations().length, 'clips');
