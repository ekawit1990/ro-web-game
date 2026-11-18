// Rigs the tiger king sculpt (ราชาเสือโคร่ง, Meshy AI, no skeleton) for the game, like tools/rig_reaper.mjs:
// a skeleton (Root, Hips, Chest, Head, both arms with the axe in the right hand, both legs, the tail), skin weights
// by region, the axe cut off the body where the sculpt fused it, and baked clips named like the Quaternius ones
// (Idle, Walk, Punch, HitReact, Death) so MonsterAnim plays them. Punch = the axe raised high and brought down.
//
// Input: the simplified model (about 30k triangles, colour texture only; see public/models/monsters/CREDITS.md).
// Needs @gltf-transform/core and @gltf-transform/extensions (not game dependencies), e.g. in a scratch folder:
//   npm i @gltf-transform/core @gltf-transform/extensions
//   node rig_tiger.mjs tiger_30k.glb rigged.glb          (add `debug` to colour the vertices by bone instead)
// then quantize (KHR_mesh_quantization) and gzip -9 into public/models/monsters/Tiger_Warlord.glb.gz.
// Coordinates are the sculpt's own (1.9 units tall, centred on the origin, facing +Z, the axe in its right hand at -X).
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


// ---- bones (model space)
const BONES = [
  { name: 'Root', p: [0, -0.95, 0], parent: -1 },
  { name: 'Hips', p: [0, -0.2, -0.05], parent: 0 },
  { name: 'Chest', p: [0, 0.08, -0.08], parent: 1 },
  { name: 'Head', p: [0.04, 0.5, 0.0], parent: 2 },
  { name: 'ArmR', p: [-0.36, 0.45, -0.15], parent: 2 },
  { name: 'HandR', p: [-0.48, 0.2, -0.12], parent: 4 },
  { name: 'ArmL', p: [0.36, 0.45, -0.15], parent: 2 },
  { name: 'HandL', p: [0.52, 0.15, -0.08], parent: 6 },
  { name: 'LegR', p: [-0.2, -0.2, -0.05], parent: 1 },
  { name: 'ShinR', p: [-0.4, -0.58, -0.05], parent: 8 },
  { name: 'LegL', p: [0.2, -0.2, -0.05], parent: 1 },
  { name: 'ShinL', p: [0.45, -0.58, -0.05], parent: 10 },
  { name: 'Tail', p: [0.25, -0.35, -0.42], parent: 1 },
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
// the axe: a straight haft from the spike on top, through the right fist, down behind the right leg
const HAFT = [[-0.6, 0.92, 0.42], [-0.42, -0.8, -0.55]];
const FIST = [-0.505, 0.04, -0.07];

/** Is vertex i part of the axe (haft, the curved blade, the spiked head)? */
function isAxe(i) {
  const p = [pos[3*i], pos[3*i+1], pos[3*i+2]];
  const [x, y, z] = p;
  if (segDist(p, HAFT[0], HAFT[1]) < (y > 0.3 ? 0.06 : 0.04)) return true;
  if (y > 0.62 && x < -0.36 && z > 0.05) return true; // the spike on top and the ornaments round it
  if (y > 0.4 && x < -0.3 && z > 0.22) return true; // the head of the axe stands well in front of the body
  if (x < -0.5 && y > 0.25 && z > 0.08) return true; // the head and its ornaments, in front of the shoulder pad
  if (x < -0.62 && y > -0.08) return true; // the blade
  return false;
}

// limb and trunk segments the body is weighted to (by distance, blended between the nearest two)
const SEGS = [
  ['Hips', [0, -0.3, -0.05], [0, 0.05, -0.05]],
  ['Chest', [0, 0.05, -0.08], [0, 0.45, -0.08]],
  ['Head', [0.04, 0.5, 0.0], [0.05, 0.8, 0.08]],
  ['ArmR', [-0.36, 0.45, -0.15], [-0.48, 0.2, -0.12]],
  ['HandR', [-0.48, 0.2, -0.12], FIST],
  ['ArmL', [0.36, 0.45, -0.15], [0.52, 0.15, -0.08]],
  ['HandL', [0.52, 0.15, -0.08], [0.64, -0.28, 0.0]],
  ['LegR', [-0.2, -0.2, -0.05], [-0.4, -0.58, -0.05]],
  ['ShinR', [-0.4, -0.58, -0.05], [-0.47, -0.92, 0.05]],
  ['LegL', [0.2, -0.2, -0.05], [0.45, -0.58, -0.05]],
  ['ShinL', [0.45, -0.58, -0.05], [0.56, -0.92, 0.05]],
];

/** Skin weights of the body (everything but the axe) at vertex i. */
function weights(i) {
  const p = [pos[3*i], pos[3*i+1], pos[3*i+2]];
  const [x, y, z] = p;
  if (Math.hypot(x - FIST[0], y - FIST[1], z - FIST[2]) < 0.09) return { HandR: 1 };
  // the tail curls behind the left leg
  if (x > 0.4 && z < -0.28 && y < -0.3) { const t = ss(0.4, 0.55, x); return { Tail: t, Hips: 1 - t }; }
  // the head (not the spiked shoulder pads either side of it)
  if (y > 0.47 && Math.abs(x - 0.04) < 0.27 && z > -0.3) { const t = ss(0.47, 0.56, y); return { Head: t, Chest: 1 - t }; }
  // the cape hanging behind: the trunk
  if (z < -0.3 && Math.abs(x) < 0.42 && y < 0.4) { const t = ss(-0.15, 0.15, y); return { Chest: t, Hips: 1 - t }; }
  const d = SEGS.map(([k, a, b]) => [k, segDist(p, a, b)]).sort((a, b) => a[1] - b[1]);
  const [k1, d1] = d[0], [k2, d2] = d[1];
  const w2 = Math.exp(-(d2 - d1) / 0.035);
  return { [k1]: 1 / (1 + w2), [k2]: w2 / (1 + w2) };
}

// The axe is fused to the body (fist, the leg behind it): cut it off along its edge, so a swing doesn't drag sheets
// of fur along. A triangle with two or more axe vertices belongs to the axe; a vertex shared by axe and body
// triangles is split into two copies.
const scy = new Uint8Array(n);
for (let i = 0; i < n; i++) scy[i] = isAxe(i) ? 1 : 0;

// Small loose pieces (spikes and studs on the axe: separate islands in the sculpt) go with the axe whole if any of
// their vertices is on it, so none is left floating where the axe was.
const parent = new Int32Array(n).map((_, i) => i);
const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
for (let i = 0; i < idx.length; i += 3) { const a = find(idx[i]), b = find(idx[i + 1]), c = find(idx[i + 2]); parent[a] = c; parent[b] = c; }
const pieces = new Map();
for (let i = 0; i < n; i++) { const r = find(i); if (!pieces.has(r)) pieces.set(r, []); pieces.get(r).push(i); }
for (const vs of pieces.values()) if (vs.length <= 400 && vs.some((i) => scy[i])) for (const i of vs) scy[i] = 1;
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
console.log('axe cut: split', extra, 'vertices');

const J = new Uint8Array(N * 4), W = new Float32Array(N * 4);
const COL = [[0.5, 0.5, 0.5], [0.2, 0.4, 1], [0.1, 0.8, 0.3], [1, 0.9, 0.1], [1, 0.4, 0.1], [1, 0, 0.2], [0.7, 0.2, 1], [0, 1, 1], [0.6, 0.3, 0], [1, 0.6, 0.8], [0, 0.4, 0.2], [0.3, 0, 0.5], [1, 1, 1]];
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
const skin = doc.createSkin('TigerSkin').setSkeleton(nodes[0]).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
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
const S = Math.sin;
// Idle: heavy breathing, a slow sway, the axe rocking, the tail swishing
clip('Idle', {
  Hips: loop(3, 24, (a) => [0, S(a) * 0.04, 0]),
  Chest: loop(3, 24, (a) => [S(a * 2) * 0.035, S(a) * 0.03, 0]),
  Head: loop(3, 24, (a) => [S(a * 2 + 0.6) * 0.05, S(a) * 0.1, S(a + 1) * 0.03]),
  ArmR: loop(3, 24, (a) => [S(a + 0.5) * 0.06, 0, S(a) * 0.04]),
  HandR: loop(3, 24, (a) => [S(a + 1.2) * 0.05, 0, 0]),
  ArmL: loop(3, 24, (a) => [S(a + 2) * 0.08, 0, S(a * 2) * 0.05]),
  HandL: loop(3, 24, (a) => [S(a + 2.5) * 0.12, 0, 0]),
  Tail: loop(3, 24, (a) => [0, S(a) * 0.35, S(a * 2) * 0.1]),
  'Hips.t': loop(3, 24, (a) => [0, S(a * 2) * 0.01, 0]),
});
// Walk: a heavy prowl, legs striding, the free arm swinging, the axe bobbing
clip('Walk', {
  Hips: loop(1.1, 16, (a) => [0.05, S(a) * 0.1, S(a) * 0.04]),
  Chest: loop(1.1, 16, (a) => [0.12, -S(a) * 0.12, 0]),
  Head: loop(1.1, 16, (a) => [-0.1 + S(a * 2) * 0.04, S(a) * 0.06, 0]),
  LegR: loop(1.1, 16, (a) => [-S(a) * 0.45, 0, 0]),
  ShinR: loop(1.1, 16, (a) => [Math.max(0, S(a + 1.2)) * 0.55, 0, 0]),
  LegL: loop(1.1, 16, (a) => [S(a) * 0.45, 0, 0]),
  ShinL: loop(1.1, 16, (a) => [Math.max(0, -S(a + 1.2)) * 0.55, 0, 0]),
  ArmR: loop(1.1, 16, (a) => [S(a) * 0.15, 0, 0]),
  ArmL: loop(1.1, 16, (a) => [-S(a) * 0.4, 0, 0.08]),
  HandL: loop(1.1, 16, (a) => [-S(a + 0.4) * 0.2, 0, 0]),
  Tail: loop(1.1, 16, (a) => [0, S(a) * 0.3, 0]),
  'Hips.t': loop(1.1, 16, (a) => [0, Math.abs(S(a)) * 0.03, 0]),
});
// Punch: the axe raised high over the head (the blade behind), then brought down hard in front, a beat on the
// ground, back to rest. Turning the right arm about X raises the fist; turning the hand the other way tips the axe.
const UP = 0.42, HIT = 0.56, FOLLOW = 0.66, HOLD = 0.9, END = 1.3;
clip('Punch', {
  Hips: [[0, [0, 0, 0]], [UP, [-0.08, -0.15, 0]], [HIT, [0.15, 0.1, 0]], [FOLLOW, [0.2, 0.12, 0]], [HOLD, [0.2, 0.12, 0]], [END, [0, 0, 0]]],
  Chest: [[0, [0, 0, 0]], [UP, [-0.25, -0.2, 0]], [HIT, [0.35, 0.15, 0]], [FOLLOW, [0.45, 0.2, 0]], [HOLD, [0.43, 0.2, 0]], [END, [0, 0, 0]]],
  Head: [[0, [0, 0, 0]], [UP, [-0.15, 0.15, 0]], [HIT, [0.1, -0.1, 0]], [FOLLOW, [0.05, -0.12, 0]], [HOLD, [0.05, -0.12, 0]], [END, [0, 0, 0]]],
  ArmR: [[0, [0, 0, 0]], [UP, [-2.7, 0, 0.25]], [HIT, [-1.0, 0, 0.1]], [FOLLOW, [-0.75, 0, 0.05]], [HOLD, [-0.75, 0, 0.05]], [END, [0, 0, 0]]],
  HandR: [[0, [0, 0, 0]], [UP, [1.15, 0, 0]], [HIT, [2.3, 0, 0]], [FOLLOW, [2.45, 0, 0]], [HOLD, [2.4, 0, 0]], [END, [0, 0, 0]]],
  ArmL: [[0, [0, 0, 0]], [UP, [-0.6, 0, 0.4]], [HIT, [0.3, 0, 0.3]], [FOLLOW, [0.4, 0, 0.25]], [HOLD, [0.4, 0, 0.25]], [END, [0, 0, 0]]],
  LegR: [[0, [0, 0, 0]], [UP, [0.1, 0, 0]], [HIT, [-0.35, 0, 0]], [HOLD, [-0.35, 0, 0]], [END, [0, 0, 0]]],
  ShinR: [[0, [0, 0, 0]], [HIT, [0.35, 0, 0]], [HOLD, [0.35, 0, 0]], [END, [0, 0, 0]]],
  LegL: [[0, [0, 0, 0]], [UP, [-0.1, 0, 0]], [HIT, [0.25, 0, 0]], [HOLD, [0.25, 0, 0]], [END, [0, 0, 0]]],
  Tail: [[0, [0, 0, 0]], [UP, [0.3, 0.3, 0]], [HIT, [-0.3, -0.4, 0]], [END, [0, 0, 0]]],
  'Hips.t': [[0, [0, 0, 0]], [UP, [0, 0.03, -0.03]], [HIT, [0, -0.08, 0.06]], [HOLD, [0, -0.08, 0.06]], [END, [0, 0, 0]]],
});
// HitReact: jolted back
clip('HitReact', {
  Hips: [[0, [0, 0, 0]], [0.1, [-0.1, 0, 0.04]], [0.4, [0, 0, 0]]],
  Chest: [[0, [0, 0, 0]], [0.1, [-0.2, 0.1, 0]], [0.4, [0, 0, 0]]],
  Head: [[0, [0, 0, 0]], [0.1, [-0.3, -0.15, 0.1]], [0.4, [0, 0, 0]]],
  ArmR: [[0, [0, 0, 0]], [0.1, [-0.25, 0, -0.15]], [0.4, [0, 0, 0]]],
  ArmL: [[0, [0, 0, 0]], [0.1, [-0.3, 0, 0.3]], [0.4, [0, 0, 0]]],
  Tail: [[0, [0, 0, 0]], [0.1, [0.4, 0, 0]], [0.4, [0, 0, 0]]],
});
// Death: staggers, drops to the knees, falls back, the axe dropping
clip('Death', {
  Hips: [[0, [0, 0, 0]], [0.3, [0.2, 0, 0.1]], [1.2, [-1.2, 0, 0.15]]],
  Chest: [[0, [0, 0, 0]], [0.3, [0.25, 0, 0]], [1.2, [-0.25, 0, 0]]],
  Head: [[0, [0, 0, 0]], [0.3, [0.35, 0, 0]], [1.2, [-0.35, 0.3, 0.2]]],
  ArmR: [[0, [0, 0, 0]], [0.3, [0.3, 0, -0.2]], [1.2, [-0.6, 0, -1.0]]],
  HandR: [[0, [0, 0, 0]], [1.2, [0, 0, 0.6]]],
  ArmL: [[0, [0, 0, 0]], [0.3, [0.3, 0, 0.3]], [1.2, [-0.6, 0, 1.0]]],
  LegR: [[0, [0, 0, 0]], [0.3, [-0.3, 0, 0]], [1.2, [-1.0, 0, 0]]],
  ShinR: [[0, [0, 0, 0]], [0.3, [0.6, 0, 0]], [1.2, [0.2, 0, 0]]],
  LegL: [[0, [0, 0, 0]], [0.3, [-0.3, 0, 0]], [1.2, [-1.0, 0, 0]]],
  ShinL: [[0, [0, 0, 0]], [0.3, [0.6, 0, 0]], [1.2, [0.2, 0, 0]]],
  Tail: [[0, [0, 0, 0]], [1.2, [-0.5, 0, 0]]],
  'Hips.t': [[0, [0, 0, 0]], [0.3, [0, -0.2, 0]], [1.2, [0, -0.3, -0.15]]],
});
// the painted texture is the whole look: the game lights it a little from within
scene.setExtras({ selfLit: 0.35 });
await io.write(out, doc);
console.log('rigged', BONES.length, 'bones,', root.listAnimations().length, 'clips');
