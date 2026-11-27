// Gives the Meshy monster sculpts (public/models/monsters/MLxxx.glb.gz, a single mesh, no skeleton) a skeleton,
// skin weights and baked clips named like the Quaternius ones (Idle, Walk, Punch, HitReact, Death), so the game's
// MonsterAnim plays them instead of moving the whole statue (PropAnim): legs step, arms swing, weapons strike.
//
// Two body plans:
//   biped: Root > Hips > Chest > Head, Chest > UpperArm > ForeArm (L/R), Hips > Thigh > Shin (L/R)
//   quad:  Root > Hips > Chest > Head, Chest > front legs, Hips > back legs (each Upper > Lower), Hips > Tail
// Where the joints are is measured from the mesh (cross-sections of the body at each height: where the legs part,
// where the arms leave the torso), and can be overridden per model in RIGS below, in units of the model's height
// (u = across, 0 = middle, the model's right is -u; v = up from the feet; w = front/back, + is the front).
// A held weapon (or shield) is given to the hand by a box in those units, so it swings with the arm.
// The attack clip ('Punch') depends on `attack`: melee = an overhead swing of the weapon arm (or a hook of the
// right arm for a bare-handed one), bow = draw and loose, staff = raise and thrust (the game fires the arrow or
// spell at RELEASE seconds into the clip, see src/three/monsters.ts).
//
// Needs @gltf-transform/core, /extensions, /functions and meshoptimizer (not game dependencies), e.g. in a scratch dir:
//   npm i @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions meshoptimizer
//   node rig_monsters.mjs <models dir> <out dir> [ML031 ...]     (all of RIGS when no ids are given)
//   node rig_monsters.mjs <models dir> <out dir> ML031 debug    (colours the vertices by bone instead)
// The input is the un-rigged model: public/models/monsters/MLxxx.glb.gz as it was before this tool ran on it (git
// history, e.g. `git show 7880335:public/models/monsters/ML031.glb.gz > in/ML031.glb.gz`); the output is quantized
// and gzipped, ready for public/models/monsters/.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize, quantize } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

/** Seconds into the bow / staff attack clip when the shot leaves (the game spawns the arrow or spell then). */
export const RELEASE = 0.42;

/*
 * Per model: type, attack, and any measured value that came out wrong.
 *   crotch: v where the legs meet; shoulder: v of the armpit top; torso: half width u of the chest (arms start
 *   beyond it); handLow: v of the lowest point of the hands (fists hanging by the thighs); armTop: v above which
 *   nothing is arm (big heads, hair); weapons: [{ side: 'R' | 'L', box: [u0, u1, v0, v1, w0?, w1?] }] given to that
 *   hand; weaponSide: the arm that strikes; armW: [w0, w1] depth the arms are in (keeps a cape behind them on the
 *   body); robe: legs hidden under a robe (shorter steps); shot: what a staff fires ('magic' default, 'fire').
 *   tpose: { elbow, down } the sculpt holds its arms out level (T-pose): the elbow is at u = elbow and the arms are
 *   lowered by `down` radians in every clip so it stands with them by its sides. tail: w behind which (and under
 *   tailTop) the body is a tail (a Tail bone that sways) instead of legs. armU: |u| beyond which nothing is arm
 *   (wing tips). attack 'breath': the head draws back and lunges (the game fires from the mouth at RELEASE).
 * quad: belly (v under the body where the legs start), front / back (w of the front and back legs' tops),
 *   legU (u of the legs), neck (w beyond which it's the head and neck), tail (w behind which it's the tail).
 */
export const RIGS = {
  ML012: { type: 'biped', attack: 'melee', crotch: 0.21, shoulder: 0.49, torso: 0.17, handLow: 0.22, armTop: 0.53, neck: 0.52, weapons: [{ side: 'R', box: [-0.45, -0.15, 0.36, 0.6] }, { side: 'R', box: [-0.2, 0.5, 0.56, 1.0, -0.6, 0.0] }] }, // rabbit swordsman
  ML016: { type: 'biped', attack: 'none', crotch: 0.26, shoulder: 0.64, torso: 0.13, handLow: 0.3, neck: 0.67 }, // zombie kid
  ML017: { type: 'biped', attack: 'none', crotch: 0.09, shoulder: 0.42, torso: 0.17, handLow: 0.36, armTop: 0.46, neck: 0.46 }, // bud fighter
  ML018: { type: 'biped', attack: 'bow', crotch: 0.25, shoulder: 0.71, torso: 0.15, handLow: 0.35, neck: 0.74, weaponSide: 'R', weapons: [{ side: 'R', box: [-0.36, -0.17, 0.27, 0.68] }, { side: 'R', box: [-0.36, 0.0, 0.27, 0.68, 0.08, 0.45] }] }, // goblin archer
  ML025: { type: 'biped', attack: 'staff', crotch: 0.2, robe: true, shoulder: 0.68, torso: 0.19, handLow: 0.45, neck: 0.68, weapons: [{ side: 'R', box: [-0.46, -0.21, 0.0, 0.84] }] }, // goblin poison brewer
  ML027: { type: 'biped', attack: 'melee', crotch: 0.42, shoulder: 0.78, torso: 0.12, handLow: 0.46, neck: 0.86, weapons: [{ side: 'R', box: [-0.4, -0.13, 0.03, 0.42] }, { side: 'R', box: [-0.26, -0.1, 0.42, 0.56] }, { side: 'R', box: [-0.15, 0.0, 0.56, 0.72, -0.5, -0.1] }, { side: 'L', box: [0.06, 0.4, 0.24, 0.78, 0.03, 0.5] }] }, // skeleton, axe + shield
  ML028: { type: 'biped', attack: 'none', crotch: 0.3, shoulder: 0.8, torso: 0.26, handLow: 0.28, neck: 0.88 }, // rock golem
  ML029: { type: 'biped', attack: 'none', crotch: 0.28, shoulder: 0.54, torso: 0.09, handLow: 0.2, armTop: 0.58, neck: 0.62 }, // tree spirit
  ML031: { type: 'biped', attack: 'none', crotch: 0.36, shoulder: 0.78, handLow: 0.41, neck: 0.84 }, // mummy knight
  ML032: { type: 'biped', attack: 'none', crotch: 0.33, shoulder: 0.825, torso: 0.11, handLow: 0.74, armTop: 0.86, neck: 0.84, tpose: { elbow: 0.25, down: 1.38 } }, // pharaoh, arms out level in the sculpt
  ML033: { type: 'biped', attack: 'melee', crotch: 0.33, shoulder: 0.72, torso: 0.17, handLow: 0.38, neck: 0.76, weapons: [{ side: 'R', box: [-0.4, -0.13, 0.3, 0.56] }, { side: 'R', box: [-0.3, 0.0, 0.08, 0.32, 0.08, 0.5] }, { side: 'L', box: [0.12, 0.4, 0.28, 0.66] }] }, // orc warlord, axe + shield
  ML034: { type: 'biped', attack: 'none', crotch: 0.3, shoulder: 0.6, handLow: 0.22, neck: 0.66 }, // zombie
  ML035: { type: 'biped', attack: 'melee', crotch: 0.33, shoulder: 0.72, torso: 0.14, handLow: 0.38, neck: 0.78, weapons: [{ side: 'R', box: [-0.45, -0.15, 0.02, 0.48] }, { side: 'L', box: [0.15, 0.38, 0.25, 0.62, 0.0, 0.5] }] }, // skeleton knight, sword + shield
  ML036: { type: 'biped', attack: 'melee', crotch: 0.42, shoulder: 0.75, torso: 0.1, handLow: 0.33, neck: 0.8, weapons: [{ side: 'R', box: [-0.4, -0.15, 0.26, 0.5] }, { side: 'L', box: [0.16, 0.4, 0.16, 0.45] }, { side: 'L', box: [-0.35, 0.3, 0.45, 0.96, -0.6, -0.15] }] }, // skeleton swordsman
  ML037: { type: 'biped', attack: 'bow', crotch: 0.44, shoulder: 0.74, torso: 0.09, handLow: 0.44, neck: 0.8, weaponSide: 'L', weapons: [{ side: 'L', box: [0.12, 0.33, 0.35, 0.6] }, { side: 'L', box: [0.09, 0.33, 0.6, 0.96, -0.6, -0.06] }] }, // skeleton archer
  ML038: { type: 'biped', attack: 'staff', crotch: 0.43, shoulder: 0.73, torso: 0.09, handLow: 0.37, neck: 0.8, weapons: [{ side: 'R', box: [-0.42, -0.15, 0.2, 1.0] }, { side: 'R', box: [-0.2, -0.06, 0.0, 0.2, -0.6, -0.08] }, { side: 'L', box: [0.12, 0.45, 0.0, 0.45] }] }, // skeleton mage
  ML041: { type: 'biped', attack: 'none', crotch: 0.16, shoulder: 0.57, torso: 0.2, handLow: 0.05, neck: 0.62 }, // orc warrior
  ML042: { type: 'biped', attack: 'melee', crotch: 0.21, shoulder: 0.55, torso: 0.16, handLow: 0.37, armTop: 0.6, neck: 0.58, weapons: [{ side: 'R', box: [-0.42, -0.2, 0.0, 1.0] }] }, // goblin spear
  ML044: { type: 'biped', attack: 'none', crotch: 0.33, shoulder: 0.66, torso: 0.17, handLow: 0.22, neck: 0.7 }, // ice golem
  ML045: { type: 'biped', attack: 'none', crotch: 0.31, shoulder: 0.68, torso: 0.2, handLow: 0.13, armTop: 0.85, neck: 0.7 }, // ice beast
  ML047: { type: 'biped', attack: 'none', crotch: 0.2, shoulder: 0.5, torso: 0.15, handLow: 0.15, armTop: 0.55, neck: 0.55, armW: [0.05, 0.6] }, // red demon
  ML050: { type: 'biped', attack: 'none', crotch: 0.28, shoulder: 0.58, torso: 0.18, handLow: 0.17, armTop: 0.7, neck: 0.62 }, // tree guardian
  ML052: { type: 'biped', attack: 'none', crotch: 0.42, shoulder: 0.72, torso: 0.14, handLow: 0.1, neck: 0.8 }, // white werewolf
  ML053: { type: 'biped', attack: 'none', neck: 0.74 }, // black werewolf
  ML054: { type: 'biped', attack: 'staff', crotch: 0.23, shoulder: 0.7, torso: 0.12, handLow: 0.45, neck: 0.78, shot: 'fire', weaponSide: 'L', weapons: [{ side: 'L', box: [0.17, 0.32, 0.03, 0.35] }, { side: 'L', box: [0.14, 0.32, 0.35, 0.5] }] }, // fire mummy with a cane
  ML055: { type: 'biped', attack: 'melee', crotch: 0.33, shoulder: 0.8, torso: 0.12, handLow: 0.5, neck: 0.84, weapons: [{ side: 'R', box: [-0.33, -0.16, 0.02, 0.48] }, { side: 'L', box: [0.07, 0.3, 0.32, 0.78, 0.0, 0.5] }] }, // crusader skeleton
  ML056: { type: 'biped', attack: 'none', crotch: 0.28, shoulder: 0.62, torso: 0.17, handLow: 0.26, neck: 0.66 }, // mummy
  ML057: { type: 'biped', attack: 'melee', crotch: 0.29, shoulder: 0.66, torso: 0.17, handLow: 0.27, neck: 0.69, weapons: [{ side: 'R', box: [-0.4, -0.2, 0.15, 0.4, 0.05, 0.6] }] }, // dark knight
  ML059: { type: 'biped', attack: 'staff', crotch: 0.3, shoulder: 0.72, torso: 0.18, handLow: 0.46, neck: 0.75, robe: true, weapons: [{ side: 'R', box: [-0.42, -0.22, 0.3, 0.84] }, { side: 'R', box: [-0.42, -0.2, 0.0, 0.3, 0.17, 0.6] }] }, // lich
  ML060: { type: 'biped', attack: 'staff', crotch: 0.25, shoulder: 0.68, torso: 0.12, neck: 0.72, robe: true, handLow: 0.33, armW: [0.0, 0.6], weapons: [{ side: 'R', box: [-0.45, -0.2, 0.25, 0.84, 0.15, 0.6] }] }, // skeleton king
  ML061: { type: 'biped', attack: 'none', crotch: 0.42, shoulder: 0.76, handLow: 0.34, neck: 0.83 }, // ice general
  ML062: { type: 'biped', attack: 'none', crotch: 0.38, shoulder: 0.8, handLow: 0.38, neck: 0.85 }, // rotten bone warrior
  ML063: { type: 'biped', attack: 'none', crotch: 0.27, shoulder: 0.74, torso: 0.22, handLow: 0.25, neck: 0.8 }, // bone giant
  ML064: { type: 'biped', attack: 'none', crotch: 0.26, shoulder: 0.7, torso: 0.2, handLow: 0.22, neck: 0.74 }, // crystal guardian
  ML065: { type: 'biped', attack: 'none', crotch: 0.4, shoulder: 0.72, torso: 0.12, handLow: 0.0, neck: 0.9, armW: [0.05, 0.9] }, // ghoul
  ML066: { type: 'biped', attack: 'none', crotch: 0.18, shoulder: 0.5, torso: 0.2, handLow: 0.18, armTop: 0.56, neck: 0.56 }, // flower monster
  ML069: { type: 'biped', attack: 'none', crotch: 0.42, shoulder: 0.77, torso: 0.15, handLow: 0.34, armTop: 0.84, neck: 0.86 }, // ice crystal giant
  ML072: { type: 'biped', attack: 'melee', crotch: 0.27, robe: true, shoulder: 0.72, torso: 0.17, handLow: 0.33, neck: 0.76, armW: [-0.02, 0.6], weapons: [{ side: 'R', box: [-0.34, -0.15, 0.33, 0.5, 0.08, 0.6] }, { side: 'R', box: [-0.15, 0.0, 0.24, 0.42, 0.12, 0.6] }, { side: 'R', box: [0.0, 0.3, 0.04, 0.33, 0.12, 0.6] }] }, // orc warlord with a crown
  ML077: { type: 'biped', attack: 'melee', crotch: 0.25, shoulder: 0.68, torso: 0.17, handLow: 0.33, neck: 0.7, weapons: [{ side: 'R', box: [-0.37, -0.17, 0.25, 1.0] }] }, // armoured orc
  // mini-bosses (MB_<id>.glb.gz); crystal_king / inferno_lord (no legs to speak of), king_jelly, snow_queen and the
  // flying banshee_queen keep the whole-statue motion
  MB_rock_dragon: { type: 'biped', attack: 'breath', crotch: 0.27, shoulder: 0.47, torso: 0.15, handLow: 0.1, armTop: 0.48, neck: 0.55, armU: 0.42, armW: [0.1, 0.7], tail: -0.1, tailTop: 0.4 }, // winged dragon
  MB_phantom_king: { type: 'biped', attack: 'melee', crotch: 0.21, shoulder: 0.5, torso: 0.13, handLow: 0.15, armTop: 0.53, neck: 0.56, armW: [-0.15, 0.6], tail: -0.1, tailTop: 0.3, weapons: [{ side: 'R', box: [-0.5, -0.24, 0.0, 1.0, -0.08, 0.35] }] }, // gargoyle with a trident
  MB_elder_tree: { type: 'biped', attack: 'melee', crotch: 0.15, shoulder: 0.43, torso: 0.15, handLow: 0.06, armTop: 0.46, neck: 0.47, weaponSide: 'L', weapons: [{ side: 'L', box: [0.02, 0.23, 0.04, 0.27, 0.12, 0.5] }, { side: 'L', box: [0.23, 0.48, 0.04, 0.26] }] }, // mushroom man with a club
  MB_kraken: { type: 'biped', attack: 'none', crotch: 0.17, shoulder: 0.44, torso: 0.13, handLow: 0.02, armTop: 0.47, neck: 0.5, tail: -0.05, tailTop: 0.3 }, // shark man
  MB_marsh_queen: { type: 'biped', attack: 'none', crotch: 0.15, shoulder: 0.46, torso: 0.13, handLow: 0.04, armTop: 0.48, neck: 0.5, tail: -0.05, tailTop: 0.32 }, // shark man
  MB_metal_lord: { type: 'biped', attack: 'none', crotch: 0.1, shoulder: 0.33, torso: 0.13, handLow: 0.02, armTop: 0.31, neck: 0.31 }, // tiki mask with claws
  ML005: { type: 'quad', belly: 0.16, front: 0.38, back: -0.2, legU: 0.18, neck: 0.28, tail: -0.48 }, // calico cat
  ML015: { type: 'quad', belly: 0.33, front: 0.45, back: -0.3, legU: 0.2, neck: 0.42, tail: -0.45 }, // wolf
  ML026: { type: 'quad', belly: 0.35, front: 0.38, back: -0.32, legU: 0.18, neck: 0.42, tail: -0.5 }, // grey wolf
  ML040: { type: 'quad', belly: 0.36, front: 0.52, back: -0.22, legU: 0.14, neck: 0.65, tail: -0.42 }, // shadow wolf
  ML049: { type: 'quad', belly: 0.39, front: 0.4, back: -0.28, legU: 0.25, neck: 0.5, tail: -0.45 }, // claw beast
  ML076: { type: 'quad', belly: 0.3, front: 0.42, back: -0.28, legU: 0.12, neck: 0.5, tail: -0.42 }, // ice wolf
};

// ------------------------------------------------------------------ geometry helpers
const ss = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Cross-section of the mesh at height y: sorted, merged intervals along axis `ax` (0 = x, 2 = z) of the triangles cut. */
function section(P, I, y, ax, tol, filter) {
  const iv = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    const ya = P[3 * a + 1], yb = P[3 * b + 1], yc = P[3 * c + 1];
    if ((ya < y && yb < y && yc < y) || (ya > y && yb > y && yc > y)) continue;
    const pts = [];
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const yp = P[3 * p + 1], yq = P[3 * q + 1];
      if ((yp - y) * (yq - y) > 0 || yp === yq) continue;
      const k = (y - yp) / (yq - yp);
      pts.push([P[3 * p] + (P[3 * q] - P[3 * p]) * k, P[3 * p + 2] + (P[3 * q + 2] - P[3 * p + 2]) * k]);
    }
    if (pts.length < 2) continue;
    if (filter && !pts.every((p) => filter(p[0], p[1]))) continue;
    const vals = pts.map((p) => (ax === 0 ? p[0] : p[1]));
    iv.push([Math.min(...vals), Math.max(...vals)]);
  }
  iv.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const s of iv) {
    const l = out[out.length - 1];
    if (l && s[0] <= l[1] + tol) l[1] = Math.max(l[1], s[1]);
    else out.push([...s]);
  }
  return out;
}

/** Measures a biped's joints (normalised units) from cross-sections; `o` overrides any of them. */
function measureBiped(P, I, H, o) {
  const tol = 0.006;
  const sec = (v, f) => section(P, I, v, 0, tol, f);
  // the crotch: going up from the ankles, the last height where the middle is empty with body on both sides
  let crotch = o.crotch;
  if (crotch === undefined) {
    crotch = 0.3;
    let seen = false;
    for (let v = 0.06; v < 0.62; v += 0.01) {
      const iv = sec(v);
      const mid = iv.some((s) => s[0] < 0.012 && s[1] > -0.012);
      const l = iv.some((s) => s[1] < -0.012 && s[1] > -0.3), r = iv.some((s) => s[0] > 0.012 && s[0] < 0.3);
      if (!mid && l && r) { crotch = v; seen = true; } else if (seen && v > crotch + 0.04) break;
    }
    crotch += 0.01;
  }
  // the arms: above the crotch, pieces on either side of the one in the middle
  let shoulder = o.shoulder, torso = o.torso;
  const widths = [];
  let top = crotch;
  for (let v = crotch + 0.02; v < 0.92; v += 0.01) {
    const iv = sec(v);
    const mid = iv.find((s) => s[0] <= 0.02 && s[1] >= -0.02);
    if (!mid) continue;
    const l = iv.some((s) => s[1] < mid[0]), r = iv.some((s) => s[0] > mid[1]);
    if (l || r) { widths.push(Math.max(-mid[0], mid[1])); top = v; }
  }
  if (shoulder === undefined) shoulder = Math.min(0.85, top + 0.03);
  if (torso === undefined) {
    widths.sort((a, b) => a - b);
    torso = widths.length ? widths[Math.floor(widths.length * 0.6)] : 0.15;
  }
  // legs: their middles a little under the crotch
  const lowIv = sec(crotch * 0.6);
  const legL = lowIv.filter((s) => s[0] > 0).map((s) => (s[0] + s[1]) / 2)[0] ?? 0.08;
  const legR = lowIv.filter((s) => s[1] < 0).map((s) => (s[0] + s[1]) / 2).pop() ?? -0.08;
  const legU = Math.min(Math.max(Math.abs(legL), Math.abs(legR)), torso * 0.8);
  // the hands: the lowest point outside the torso line, above the knees
  let handLow = o.handLow;
  if (handLow === undefined) {
    handLow = shoulder - 0.2;
    for (let v = shoulder - 0.05; v > crotch * 0.5; v -= 0.01) {
      const iv = sec(v);
      if (iv.some((s) => s[1] < -torso - 0.01 || s[0] > torso + 0.01)) handLow = v; else if (v < crotch) break;
    }
  }
  return { crotch, shoulder, torso, legU, handLow, armTop: o.armTop ?? shoulder + 0.03, neck: o.neck ?? shoulder + 0.04, tpose: o.tpose, tail: o.tail, tailTop: o.tailTop ?? crotch + 0.1 };
}

// ------------------------------------------------------------------ bones + weights
function bipedBones(m) {
  const { crotch, shoulder, torso, legU, handLow, neck } = m;
  const sY = shoulder - 0.035;
  const hand = [torso + 0.06, handLow + 0.03];
  const elbow = m.tpose ? [m.tpose.elbow, sY] : [(torso * 0.9 + hand[0]) / 2, (sY + hand[1]) / 2];
  const tail = m.tail === undefined ? [] : [{ name: 'Tail', p: [0, Math.min(m.tailTop, crotch + 0.05), m.tail], parent: 1 }];
  return [
    { name: 'Root', p: [0, 0, 0], parent: -1 },
    { name: 'Hips', p: [0, crotch + 0.04, 0], parent: 0 },
    { name: 'Chest', p: [0, (crotch + shoulder) / 2, 0], parent: 1 },
    { name: 'Head', p: [0, neck, 0], parent: 2 },
    { name: 'UpperArmR', p: [-torso * 0.9, sY, 0], parent: 2 },
    { name: 'ForeArmR', p: [-elbow[0], elbow[1], 0], parent: 4 },
    { name: 'UpperArmL', p: [torso * 0.9, sY, 0], parent: 2 },
    { name: 'ForeArmL', p: [elbow[0], elbow[1], 0], parent: 6 },
    { name: 'ThighR', p: [-legU, crotch, 0], parent: 1 },
    { name: 'ShinR', p: [-legU, crotch * 0.5, 0], parent: 8 },
    { name: 'ThighL', p: [legU, crotch, 0], parent: 1 },
    { name: 'ShinL', p: [legU, crotch * 0.5, 0], parent: 10 },
    ...tail,
  ];
}

function bipedWeights(m, B, o) {
  const { crotch, shoulder, torso, handLow, armTop, neck } = m;
  const sY = shoulder - 0.035;
  const elbowY = B[5].p[1];
  // (weapon vertices are given to the hand before this is asked, see rig())
  return (u, v, w) => {
    const side = u < 0 ? 'R' : 'L';
    const au = Math.abs(u);
    // a tail behind the legs: its own bone, blended into the hips at its root
    if (m.tail !== undefined && w < m.tail + 0.03 && v < m.tailTop) {
      const t = ss(m.tail + 0.03, m.tail - 0.05, w) * (1 - ss(m.tailTop - 0.05, m.tailTop, v));
      if (t > 0) return { Tail: t, Hips: 1 - t };
    }
    // arms: outside the torso line, between the hands and the shoulders
    const [aw0, aw1] = o.armW ?? [-9, 9];
    if (v > handLow - 0.02 && v < armTop && w > aw0 && w < aw1 && au < (o.armU ?? 9)) {
      const k = ss(torso - 0.01, torso + 0.025, au) * (1 - ss(armTop - 0.04, armTop, v));
      if (k > 0) {
        // (arms held out level split at the elbow across, hanging ones by height)
        const f = m.tpose ? ss(m.tpose.elbow - 0.03, m.tpose.elbow + 0.03, au) : ss(elbowY + 0.03, elbowY - 0.03, v);
        const body = v > (crotch + shoulder) / 2 ? 'Chest' : 'Hips';
        return { [`UpperArm${side}`]: k * (1 - f), [`ForeArm${side}`]: k * f, [body]: 1 - k };
      }
    }
    // legs, softened over the crotch
    if (v < crotch + 0.05) {
      const k = 1 - ss(crotch - 0.03, crotch + 0.05, v);
      const f = ss(crotch * 0.5 + 0.03, crotch * 0.5 - 0.03, v);
      return { [`Thigh${side}`]: k * (1 - f), [`Shin${side}`]: k * f, Hips: 1 - k };
    }
    // spine
    const mid = (crotch + shoulder) / 2;
    if (v < mid + 0.04) { const t = ss(mid - 0.05, mid + 0.04, v); return { Hips: 1 - t, Chest: t }; }
    const t = ss(neck - 0.03, neck + 0.02, v);
    return { Chest: 1 - t, Head: t };
    void sY;
  };
}

/** Measures a four-legged body: the belly (where the legs leave it), the legs' front/back positions, the neck. */
function measureQuad(P, I, o, D) {
  // depth of the model (w from -D/2 to D/2); legs: under the belly, the body is split front and back
  let belly = o.belly;
  if (belly === undefined) {
    belly = 0.25;
    for (let v = 0.04; v < 0.7; v += 0.01) {
      const iv = section(P, I, v, 2, 0.006);
      const split = iv.length >= 2 && iv[0][1] < -0.02 * D && iv[iv.length - 1][0] > 0.0;
      if (split) belly = v; else if (v > 0.15) break;
    }
  }
  // front and back legs: the middle of the front-most and back-most pieces a little under the belly
  const iv = section(P, I, belly * 0.6, 2, 0.006);
  const front = o.front ?? (iv.length ? (iv[iv.length - 1][0] + iv[iv.length - 1][1]) / 2 : 0.2);
  const back = o.back ?? (iv.length ? (iv[0][0] + iv[0][1]) / 2 : -0.2);
  const xs = section(P, I, belly * 0.5, 0, 0.006);
  const legU = o.legU ?? (xs.length ? Math.max(0.02, (xs[xs.length - 1][0] + xs[xs.length - 1][1]) / 2) : 0.08);
  return { belly: belly + 0.02, front, back, legU, neck: o.neck ?? front + 0.05, tail: o.tail ?? back - 0.06 };
}

function quadBones(m) {
  const { belly, front, back, legU, neck, tail } = m;
  return [
    { name: 'Root', p: [0, 0, 0], parent: -1 },
    { name: 'Hips', p: [0, belly + 0.05, back], parent: 0 },
    { name: 'Chest', p: [0, belly + 0.05, (front + back) / 2], parent: 1 },
    { name: 'Head', p: [0, belly + 0.1, neck], parent: 2 },
    { name: 'FrontR', p: [-legU, belly, front], parent: 2 },
    { name: 'FrontLowR', p: [-legU, belly * 0.45, front], parent: 4 },
    { name: 'FrontL', p: [legU, belly, front], parent: 2 },
    { name: 'FrontLowL', p: [legU, belly * 0.45, front], parent: 6 },
    { name: 'BackR', p: [-legU, belly, back], parent: 1 },
    { name: 'BackLowR', p: [-legU, belly * 0.45, back], parent: 8 },
    { name: 'BackL', p: [legU, belly, back], parent: 1 },
    { name: 'BackLowL', p: [legU, belly * 0.45, back], parent: 10 },
    { name: 'Tail', p: [0, belly + 0.05, tail], parent: 1 },
  ];
}

function quadWeights(m) {
  const { belly, front, back, neck, tail } = m;
  const midW = (front + back) / 2;
  return (u, v, w) => {
    const side = u < 0 ? 'R' : 'L';
    if (v < belly + 0.03 && w > tail) {
      const k = 1 - ss(belly - 0.04, belly + 0.03, v);
      const fr = w > midW ? 'Front' : 'Back';
      const f = ss(belly * 0.45 + 0.03, belly * 0.45 - 0.03, v);
      const body = fr === 'Front' ? 'Chest' : 'Hips';
      return { [`${fr}${side}`]: k * (1 - f), [`${fr}Low${side}`]: k * f, [body]: 1 - k };
    }
    if (w > neck - 0.04) { const t = ss(neck - 0.04, neck + 0.03, w); return { Chest: 1 - t, Head: t }; }
    if (w < tail + 0.03) { const t = ss(tail + 0.03, tail - 0.04, w); return { Hips: 1 - t, Tail: t }; }
    const t = ss(back + 0.02, midW + 0.04, w);
    return { Hips: 1 - t, Chest: t };
  };
}

// ------------------------------------------------------------------ clips (euler keys per bone, radians)
const S = Math.sin;
const loop = (dur, steps, f) => Array.from({ length: steps + 1 }, (_, i) => [(i / steps) * dur, f((i / steps) * Math.PI * 2)]);
const keys = (frames) => frames; // [[t, [rx, ry, rz]], ...]

function bipedClips(o, m) {
  const atk = o.attack ?? 'none';
  const ws = o.weaponSide ?? (atk === 'bow' ? 'L' : 'R'); // bow arm / weapon arm
  const os = ws === 'R' ? 'L' : 'R';
  // the arms hang at their own angle; rotations here are about the shoulder, + x = swing back, - x = forward/up
  const zOut = (s) => (s === 'R' ? -1 : 1); // + z turns the left arm outward
  const bob = 0.02;
  // a long robe or cape hides the legs: they step shorter so the cloth doesn't tear apart
  const leg = o.robe ? 0.22 : 0.5;
  const clips = {};
  clips.Idle = {
    Hips: loop(2.4, 16, (a) => [0, S(a) * 0.03, 0]),
    Chest: loop(2.4, 16, (a) => [S(a * 2) * 0.03, 0, S(a) * 0.015]),
    Head: loop(2.4, 16, (a) => [S(a * 2 + 0.7) * 0.04, S(a) * 0.06, 0]),
    UpperArmR: loop(2.4, 16, (a) => [S(a + 0.4) * 0.05, 0, -0.03 - S(a * 2) * 0.03]),
    UpperArmL: loop(2.4, 16, (a) => [S(a + 1.6) * 0.05, 0, 0.03 + S(a * 2) * 0.03]),
    'Hips.t': loop(2.4, 16, (a) => [0, S(a * 2) * 0.004, 0]),
  };
  // walk: a step a half cycle, thighs swing ±0.5, the back shin folds, arms swing against the legs
  clips.Walk = {
    Hips: loop(0.9, 16, (a) => [0.05, S(a) * 0.1, 0]),
    Chest: loop(0.9, 16, (a) => [0.04, -S(a) * 0.14, 0]),
    Head: loop(0.9, 16, (a) => [-0.04, S(a) * 0.05, 0]),
    ThighR: loop(0.9, 16, (a) => [-S(a) * leg, 0, 0]),
    ThighL: loop(0.9, 16, (a) => [S(a) * leg, 0, 0]),
    // the knee folds while its leg swings forward (the foot lifts off), straight while it pushes back
    ShinR: loop(0.9, 16, (a) => [Math.max(0, Math.cos(a)) * leg * 1.2, 0, 0]),
    ShinL: loop(0.9, 16, (a) => [Math.max(0, -Math.cos(a)) * leg * 1.2, 0, 0]),
    UpperArmR: loop(0.9, 16, (a) => [S(a) * 0.45, 0, -0.06]),
    UpperArmL: loop(0.9, 16, (a) => [-S(a) * 0.45, 0, 0.06]),
    ForeArmR: loop(0.9, 16, (a) => [-0.2 + S(a) * 0.15, 0, 0]),
    ForeArmL: loop(0.9, 16, (a) => [-0.2 - S(a) * 0.15, 0, 0]),
    'Hips.t': loop(0.9, 16, (a) => [0, Math.abs(Math.cos(a)) * bob - bob * 0.5, 0]),
  };
  // held arms in a walk (a weapon / bow / staff): swing less so the weapon doesn't flail
  if (atk !== 'none') {
    clips.Walk[`UpperArm${ws}`] = loop(0.9, 16, (a) => [(ws === 'R' ? 1 : -1) * S(a) * 0.15 - 0.1, 0, 0.04 * zOut(ws)]);
  }
  const R = RELEASE;
  if (atk === 'bow') {
    // bow arm up and forward, the other draws back to the chin, looses at R, follows through
    clips.Punch = {
      Chest: [[0, [0, 0, 0]], [0.2, [0, (ws === 'L' ? -1 : 1) * 0.5, 0]], [R, [0, (ws === 'L' ? -1 : 1) * 0.55, 0]], [R + 0.15, [-0.05, (ws === 'L' ? -1 : 1) * 0.45, 0]], [0.95, [0, 0, 0]]],
      [`UpperArm${ws}`]: [[0, [0, 0, 0]], [0.2, [-1.45, 0, 0.15 * zOut(ws)]], [R, [-1.5, 0, 0.15 * zOut(ws)]], [R + 0.15, [-1.4, 0, 0.2 * zOut(ws)]], [0.95, [0, 0, 0]]],
      [`ForeArm${ws}`]: [[0, [0, 0, 0]], [0.2, [0, 0, 0]], [0.95, [0, 0, 0]]],
      [`UpperArm${os}`]: [[0, [0, 0, 0]], [0.2, [-1.3, 0, 0.2 * zOut(os)]], [R - 0.02, [-1.2, 0, 0.5 * zOut(os)]], [R + 0.08, [-0.9, 0, 0.9 * zOut(os)]], [0.95, [0, 0, 0]]],
      [`ForeArm${os}`]: [[0, [0, 0, 0]], [0.2, [-0.6, 0, 0]], [R - 0.02, [-1.6, 0, 0]], [R + 0.08, [-0.3, 0, 0]], [0.95, [0, 0, 0]]],
      Head: [[0, [0, 0, 0]], [0.2, [0.05, (ws === 'L' ? 1 : -1) * 0.4, 0]], [R + 0.15, [0.05, (ws === 'L' ? 1 : -1) * 0.35, 0]], [0.95, [0, 0, 0]]],
    };
  } else if (atk === 'staff') {
    // the staff raised high, then thrust at the target at R (the spell leaves its tip)
    clips.Punch = {
      Chest: [[0, [0, 0, 0]], [0.25, [-0.12, (ws === 'R' ? 1 : -1) * 0.2, 0]], [R, [0.15, (ws === 'R' ? -1 : 1) * 0.1, 0]], [0.6, [0.15, 0, 0]], [0.95, [0, 0, 0]]],
      [`UpperArm${ws}`]: [[0, [0, 0, 0]], [0.25, [-2.2, 0, 0.2 * zOut(ws)]], [R, [-1.35, 0, 0]], [0.6, [-1.3, 0, 0]], [0.95, [0, 0, 0]]],
      [`ForeArm${ws}`]: [[0, [0, 0, 0]], [0.25, [-0.3, 0, 0]], [R, [0, 0, 0]], [0.95, [0, 0, 0]]],
      [`UpperArm${os}`]: [[0, [0, 0, 0]], [0.25, [-0.6, 0, 0.5 * zOut(os)]], [R, [-1.2, 0, 0.3 * zOut(os)]], [0.6, [-1.1, 0, 0.3 * zOut(os)]], [0.95, [0, 0, 0]]],
      Head: [[0, [0, 0, 0]], [0.25, [-0.15, 0, 0]], [R, [0.1, 0, 0]], [0.95, [0, 0, 0]]],
    };
  } else if (atk === 'breath') {
    // rears back with the head high, then lunges with the jaws forward at R (the fire leaves the mouth), arms spread
    clips.Punch = {
      Hips: [[0, [0, 0, 0]], [0.25, [-0.12, 0, 0]], [R, [0.15, 0, 0]], [0.6, [0.12, 0, 0]], [0.95, [0, 0, 0]]],
      Chest: [[0, [0, 0, 0]], [0.25, [-0.25, 0, 0]], [R, [0.3, 0, 0]], [0.6, [0.25, 0, 0]], [0.95, [0, 0, 0]]],
      Head: [[0, [0, 0, 0]], [0.25, [-0.35, 0, 0]], [R, [0.2, 0, 0]], [0.6, [0.15, 0, 0]], [0.95, [0, 0, 0]]],
      UpperArmR: [[0, [0, 0, 0]], [0.25, [-0.4, 0, -0.5]], [R, [-0.7, 0, -0.3]], [0.95, [0, 0, 0]]],
      UpperArmL: [[0, [0, 0, 0]], [0.25, [-0.4, 0, 0.5]], [R, [-0.7, 0, 0.3]], [0.95, [0, 0, 0]]],
      ForeArmR: [[0, [0, 0, 0]], [0.25, [-0.6, 0, 0]], [0.95, [0, 0, 0]]],
      ForeArmL: [[0, [0, 0, 0]], [0.25, [-0.6, 0, 0]], [0.95, [0, 0, 0]]],
      ThighR: [[0, [0, 0, 0]], [0.25, [0.2, 0, 0]], [R, [-0.35, 0, 0]], [0.95, [0, 0, 0]]],
      ShinR: [[0, [0, 0, 0]], [R, [0.3, 0, 0]], [0.95, [0, 0, 0]]],
      Tail: [[0, [0, 0, 0]], [0.25, [-0.2, 0, 0]], [R, [0.25, 0, 0]], [0.95, [0, 0, 0]]],
    };
  } else if (atk === 'melee') {
    // the weapon raised over the head, brought down across the front, then back to guard
    clips.Punch = {
      Hips: [[0, [0, 0, 0]], [0.22, [-0.05, (ws === 'R' ? -1 : 1) * 0.15, 0]], [0.36, [0.1, (ws === 'R' ? 1 : -1) * 0.2, 0]], [0.55, [0.08, (ws === 'R' ? 1 : -1) * 0.15, 0]], [0.9, [0, 0, 0]]],
      Chest: [[0, [0, 0, 0]], [0.22, [-0.2, (ws === 'R' ? -1 : 1) * 0.3, 0]], [0.36, [0.3, (ws === 'R' ? 1 : -1) * 0.3, 0]], [0.55, [0.25, (ws === 'R' ? 1 : -1) * 0.25, 0]], [0.9, [0, 0, 0]]],
      [`UpperArm${ws}`]: [[0, [0, 0, 0]], [0.22, [-2.6, 0, 0.3 * zOut(ws)]], [0.36, [-0.5, 0, -0.2 * zOut(ws)]], [0.55, [-0.4, 0, -0.25 * zOut(ws)]], [0.9, [0, 0, 0]]],
      [`ForeArm${ws}`]: [[0, [0, 0, 0]], [0.22, [-0.8, 0, 0]], [0.36, [-0.1, 0, 0]], [0.9, [0, 0, 0]]],
      [`UpperArm${os}`]: [[0, [0, 0, 0]], [0.22, [-0.5, 0, 0.2 * zOut(os)]], [0.36, [-0.8, 0, 0.1 * zOut(os)]], [0.9, [0, 0, 0]]],
      Head: [[0, [0, 0, 0]], [0.22, [-0.1, 0, 0]], [0.36, [0.12, 0, 0]], [0.9, [0, 0, 0]]],
      ThighR: [[0, [0, 0, 0]], [0.36, [ws === 'R' ? 0.25 : -0.35, 0, 0]], [0.9, [0, 0, 0]]],
      ThighL: [[0, [0, 0, 0]], [0.36, [ws === 'L' ? 0.25 : -0.35, 0, 0]], [0.9, [0, 0, 0]]],
    };
  } else {
    // bare hands: a wide swing of the right arm, then the left (a claw / a club of a fist)
    clips.Punch = {
      Chest: [[0, [0, 0, 0]], [0.18, [-0.1, -0.35, 0]], [0.32, [0.25, 0.35, 0]], [0.5, [0.2, -0.3, 0]], [0.62, [0.25, -0.35, 0]], [0.95, [0, 0, 0]]],
      UpperArmR: [[0, [0, 0, 0]], [0.18, [-1.5, 0, -0.4]], [0.32, [-0.6, 0, 0.35]], [0.5, [-0.3, 0, 0]], [0.95, [0, 0, 0]]],
      ForeArmR: [[0, [0, 0, 0]], [0.18, [-0.9, 0, 0]], [0.32, [-0.2, 0, 0]], [0.95, [0, 0, 0]]],
      UpperArmL: [[0, [0, 0, 0]], [0.32, [-0.6, 0, 0.3]], [0.48, [-1.5, 0, 0.4]], [0.62, [-0.6, 0, -0.35]], [0.95, [0, 0, 0]]],
      ForeArmL: [[0, [0, 0, 0]], [0.48, [-0.9, 0, 0]], [0.62, [-0.2, 0, 0]], [0.95, [0, 0, 0]]],
      Head: [[0, [0, 0, 0]], [0.32, [0.15, 0, 0]], [0.62, [0.15, 0, 0]], [0.95, [0, 0, 0]]],
      ThighR: [[0, [0, 0, 0]], [0.32, [-0.3, 0, 0]], [0.95, [0, 0, 0]]],
    };
  }
  clips.HitReact = {
    Hips: [[0, [0, 0, 0]], [0.1, [-0.1, 0, 0.04]], [0.4, [0, 0, 0]]],
    Chest: [[0, [0, 0, 0]], [0.1, [-0.2, 0.1, 0]], [0.4, [0, 0, 0]]],
    Head: [[0, [0, 0, 0]], [0.1, [-0.3, -0.12, 0.08]], [0.4, [0, 0, 0]]],
    UpperArmR: [[0, [0, 0, 0]], [0.1, [-0.3, 0, -0.3]], [0.4, [0, 0, 0]]],
    UpperArmL: [[0, [0, 0, 0]], [0.1, [-0.3, 0, 0.3]], [0.4, [0, 0, 0]]],
  };
  clips.Death = {
    Root: [[0, [0, 0, 0]], [0.3, [0.12, 0, 0]], [1.0, [-1.5, 0, 0.12]]],
    Chest: [[0, [0, 0, 0]], [0.3, [0.3, 0, 0]], [1.0, [-0.15, 0, 0]]],
    Head: [[0, [0, 0, 0]], [0.3, [0.35, 0, 0]], [1.0, [-0.3, 0.3, 0.1]]],
    UpperArmR: [[0, [0, 0, 0]], [0.3, [0.3, 0, -0.2]], [1.0, [-0.8, 0, -1.1]]],
    UpperArmL: [[0, [0, 0, 0]], [0.3, [0.3, 0, 0.2]], [1.0, [-0.8, 0, 1.1]]],
    ThighR: [[0, [0, 0, 0]], [0.3, [-0.5, 0, 0]], [1.0, [-0.2, 0, 0]]],
    ShinR: [[0, [0, 0, 0]], [0.3, [0.8, 0, 0]], [1.0, [0.2, 0, 0]]],
    'Root.t': [[0, [0, 0, 0]], [0.3, [0, -0.04, 0]], [1.0, [0, 0.02, -0.05]]],
  };
  if (o.tail !== undefined) {
    clips.Idle.Tail = loop(2.4, 16, (a) => [S(a * 2) * 0.05, S(a) * 0.25, 0]);
    clips.Walk.Tail = loop(0.9, 16, (a) => [S(a * 2) * 0.06, -S(a) * 0.3, 0]);
    clips.HitReact.Tail = [[0, [0, 0, 0]], [0.1, [0.2, 0.2, 0]], [0.4, [0, 0, 0]]];
  }
  if (o.tpose) {
    // every clip keys both arms (the lowering is put under their keys when baked, see rig())
    for (const c of Object.values(clips)) for (const s of ['R', 'L']) for (const b of ['UpperArm', 'ForeArm']) {
      const k = c[`${b}${s}`] ?? [[0, [0, 0, 0]]];
      c[`${b}${s}`] = k;
    }
  }
  void m; void keys;
  return clips;
}

function quadClips() {
  const clips = {};
  clips.Idle = {
    Chest: loop(2.4, 16, (a) => [S(a * 2) * 0.02, 0, 0]),
    Head: loop(2.4, 16, (a) => [S(a * 2 + 0.6) * 0.05, S(a) * 0.12, 0]),
    Tail: loop(2.4, 16, (a) => [0, S(a) * 0.3, 0]),
    'Hips.t': loop(2.4, 16, (a) => [0, S(a * 2) * 0.004, 0]),
  };
  // a trot: diagonal pairs together (front right with back left)
  const sw = 0.55;
  clips.Walk = {
    FrontR: loop(0.7, 16, (a) => [-S(a) * sw, 0, 0]),
    BackL: loop(0.7, 16, (a) => [-S(a) * sw, 0, 0]),
    FrontL: loop(0.7, 16, (a) => [S(a) * sw, 0, 0]),
    BackR: loop(0.7, 16, (a) => [S(a) * sw, 0, 0]),
    FrontLowR: loop(0.7, 16, (a) => [-Math.max(0, S(a + 1)) * 0.6, 0, 0]),
    FrontLowL: loop(0.7, 16, (a) => [-Math.max(0, -S(a + 1)) * 0.6, 0, 0]),
    BackLowR: loop(0.7, 16, (a) => [Math.max(0, -S(a + 1)) * 0.6, 0, 0]),
    BackLowL: loop(0.7, 16, (a) => [Math.max(0, S(a + 1)) * 0.6, 0, 0]),
    Chest: loop(0.7, 16, (a) => [S(a * 2) * 0.03, S(a) * 0.04, 0]),
    Head: loop(0.7, 16, (a) => [S(a * 2 + 1) * 0.06, 0, 0]),
    Tail: loop(0.7, 16, (a) => [S(a * 2) * 0.1, S(a) * 0.3, 0]),
    'Hips.t': loop(0.7, 16, (a) => [0, Math.abs(S(a)) * 0.02, 0]),
  };
  // a pounce and bite: crouch back, spring forward with the forelegs up, head snapping down
  clips.Punch = {
    Hips: [[0, [0, 0, 0]], [0.2, [0.12, 0, 0]], [0.38, [-0.18, 0, 0]], [0.55, [0.05, 0, 0]], [0.85, [0, 0, 0]]],
    'Hips.t': [[0, [0, 0, 0]], [0.2, [0, -0.04, -0.06]], [0.38, [0, 0.05, 0.12]], [0.55, [0, 0, 0.06]], [0.85, [0, 0, 0]]],
    Chest: [[0, [0, 0, 0]], [0.2, [0.05, 0, 0]], [0.38, [-0.2, 0, 0]], [0.55, [0.2, 0, 0]], [0.85, [0, 0, 0]]],
    Head: [[0, [0, 0, 0]], [0.2, [-0.3, 0, 0]], [0.38, [-0.35, 0, 0]], [0.48, [0.45, 0, 0]], [0.6, [0.3, 0, 0]], [0.85, [0, 0, 0]]],
    FrontR: [[0, [0, 0, 0]], [0.2, [0.3, 0, 0]], [0.38, [-0.9, 0, 0]], [0.55, [0.1, 0, 0]], [0.85, [0, 0, 0]]],
    FrontL: [[0, [0, 0, 0]], [0.2, [0.3, 0, 0]], [0.4, [-0.8, 0, 0]], [0.57, [0.1, 0, 0]], [0.85, [0, 0, 0]]],
    FrontLowR: [[0, [0, 0, 0]], [0.38, [-0.7, 0, 0]], [0.55, [0, 0, 0]]],
    FrontLowL: [[0, [0, 0, 0]], [0.4, [-0.7, 0, 0]], [0.57, [0, 0, 0]]],
    BackR: [[0, [0, 0, 0]], [0.2, [-0.3, 0, 0]], [0.38, [0.4, 0, 0]], [0.85, [0, 0, 0]]],
    BackL: [[0, [0, 0, 0]], [0.2, [-0.3, 0, 0]], [0.38, [0.4, 0, 0]], [0.85, [0, 0, 0]]],
  };
  clips.HitReact = {
    Chest: [[0, [0, 0, 0]], [0.1, [-0.12, 0.1, 0]], [0.4, [0, 0, 0]]],
    Head: [[0, [0, 0, 0]], [0.1, [-0.35, -0.2, 0]], [0.4, [0, 0, 0]]],
    'Hips.t': [[0, [0, 0, 0]], [0.1, [0, 0, -0.03]], [0.4, [0, 0, 0]]],
  };
  clips.Death = {
    Root: [[0, [0, 0, 0]], [0.25, [0, 0, -0.1]], [0.9, [0, 0, 1.45]]],
    'Root.t': [[0, [0, 0, 0]], [0.9, [0.02, 0.01, 0]]],
    Head: [[0, [0, 0, 0]], [0.9, [0.4, 0, 0]]],
    FrontR: [[0, [0, 0, 0]], [0.9, [-0.5, 0, 0]]],
    BackR: [[0, [0, 0, 0]], [0.9, [0.5, 0, 0]]],
    Tail: [[0, [0, 0, 0]], [0.9, [0.3, 0, 0]]],
  };
  return clips;
}

// ------------------------------------------------------------------ main
const COLORS = { Root: [0.5, 0.5, 0.5], Hips: [0.2, 0.4, 1], Chest: [0.1, 0.8, 0.3], Head: [1, 0.9, 0.1], Tail: [0.6, 0.3, 0.1] };
const sideCol = (n) => {
  const base = /Upper|^Front[RL]$|Thigh|^Back[RL]$/.test(n) ? [1, 0.35, 0.05] : [1, 0, 0.6];
  return n.endsWith('L') ? base.map((c) => c * 0.55 + 0.1) : base;
};

async function rig(io, inFile, outFile, id, debug) {
  const o = RIGS[id];
  const doc = await io.readBinary(zlib.gunzipSync(fs.readFileSync(inFile)));
  if (doc.getRoot().listSkins().length) throw new Error(`${id}: already rigged (start from the model before tools/rig_monsters.mjs, see the header)`);
  await doc.transform(dequantize());
  const root = doc.getRoot();
  const buf = root.listBuffers()[0];
  const meshNode = root.listNodes().find((n) => n.getMesh());
  const prim = meshNode.getMesh().listPrimitives()[0];
  // bake the node's transform into the vertices (a skinned mesh's node transform is ignored)
  let P = prim.getAttribute('POSITION').getArray().slice();
  const mtx = meshNode.getWorldMatrix();
  for (let i = 0; i < P.length; i += 3) {
    const [x, y, z] = [P[i], P[i + 1], P[i + 2]];
    P[i] = mtx[0] * x + mtx[4] * y + mtx[8] * z + mtx[12];
    P[i + 1] = mtx[1] * x + mtx[5] * y + mtx[9] * z + mtx[13];
    P[i + 2] = mtx[2] * x + mtx[6] * y + mtx[10] * z + mtx[14];
  }
  for (let n = meshNode; n; n = n.getParentNode?.() ?? null) { n.setTranslation([0, 0, 0]).setRotation([0, 0, 0, 1]).setScale([1, 1, 1]); }
  const I = prim.getIndices().getArray();
  const nv = P.length / 3;
  // normalise: u, v, w in units of the height, feet at v = 0, centred
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nv; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], P[3 * i + k]); max[k] = Math.max(max[k], P[3 * i + k]); }
  const H = max[1] - min[1];
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  let N = new Float32Array(P.length);
  for (let i = 0; i < nv; i++) { N[3 * i] = (P[3 * i] - cx) / H; N[3 * i + 1] = (P[3 * i + 1] - min[1]) / H; N[3 * i + 2] = (P[3 * i + 2] - cz) / H; }
  const D = (max[2] - min[2]) / H;
  let m, BONES, wf, clips;
  if (o.type === 'biped') {
    m = measureBiped(N, I, H, o);
    BONES = bipedBones(m);
    wf = bipedWeights(m, BONES, o);
    clips = bipedClips(o, m);
  } else {
    m = measureQuad(N, I, o, D);
    BONES = quadBones(m);
    wf = quadWeights(m);
    clips = quadClips();
  }
  console.log(id, o.type, Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, +v.toFixed(3)])));
  const B = Object.fromEntries(BONES.map((b, i) => [b.name, i]));
  // A held weapon is usually fused to the body (a fist round the haft, an axe head against a boot): cut it off along
  // its edge, or a swing drags sheets of body along. A triangle with two or more weapon vertices belongs to the
  // weapon; a vertex shared by weapon and body triangles is split into two copies.
  const wsideOf = (i) => {
    for (const wp of o.weapons ?? []) {
      const [u0, u1, v0, v1, w0 = -9, w1 = 9] = wp.box;
      const u = N[3 * i], v = N[3 * i + 1], w = N[3 * i + 2];
      if (u >= u0 && u <= u1 && v >= v0 && v <= v1 && w >= w0 && w <= w1) return wp.side;
    }
    return '';
  };
  const wside = Array.from({ length: nv }, (_, i) => wsideOf(i));
  const triW = new Array(I.length / 3).fill('');
  const usedW = new Uint8Array(nv), usedB = new Uint8Array(nv);
  for (let t = 0; t < triW.length; t++) {
    const vs = [I[3 * t], I[3 * t + 1], I[3 * t + 2]];
    const ws = vs.map((v) => wside[v]).filter(Boolean);
    triW[t] = ws.length >= 2 ? ws[0] : '';
    for (const v of vs) (triW[t] ? usedW : usedB)[v] = 1;
  }
  const copyOf = new Int32Array(nv).fill(-1);
  let extra = 0;
  for (let i = 0; i < nv; i++) if (usedW[i] && usedB[i]) copyOf[i] = nv + extra++;
  const NV = nv + extra;
  const newI = new Uint32Array(I.length);
  const vside = new Array(NV).fill('');
  for (let t = 0; t < triW.length; t++) for (let k = 0; k < 3; k++) {
    const v = I[3 * t + k];
    const to = triW[t] && copyOf[v] >= 0 ? copyOf[v] : v;
    newI[3 * t + k] = to;
    if (triW[t] && !usedB[v]) vside[v] = triW[t];
    if (triW[t] && copyOf[v] >= 0) vside[to] = triW[t];
  }
  if (extra) {
    for (const sem of prim.listSemantics()) {
      const acc = prim.getAttribute(sem);
      const src = sem === 'POSITION' ? P : acc.getArray();
      const sz = acc.getElementSize();
      const dst = new src.constructor(NV * sz);
      dst.set(src);
      for (let i = 0; i < nv; i++) if (copyOf[i] >= 0) for (let k = 0; k < sz; k++) dst[copyOf[i] * sz + k] = src[i * sz + k];
      if (sem === 'POSITION') P = dst; else acc.setArray(dst);
    }
    const N2 = new Float32Array(NV * 3);
    N2.set(N);
    for (let i = 0; i < nv; i++) if (copyOf[i] >= 0) for (let k = 0; k < 3; k++) N2[copyOf[i] * 3 + k] = N[i * 3 + k];
    N = N2;
  }
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(NV > 65535 ? newI : new Uint16Array(newI)).setBuffer(buf));
  if (extra) console.log(id, 'weapon cut: split', extra, 'vertices');
  const J = new Uint16Array(NV * 4), W = new Float32Array(NV * 4), C = new Float32Array(NV * 3);
  for (let i = 0; i < NV; i++) {
    const wts = vside[i] ? { [`ForeArm${vside[i]}`]: 1 } : wf(N[3 * i], N[3 * i + 1], N[3 * i + 2], true);
    const w = Object.entries(wts).filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const s = w.reduce((a, [, x]) => a + x, 0);
    w.forEach(([k, x], j) => { J[i * 4 + j] = B[k]; W[i * 4 + j] = x / s; });
    for (const [k, x] of w) { const col = COLORS[k] ?? sideCol(k); for (let c = 0; c < 3; c++) C[i * 3 + c] += (col[c] * x) / s; }
  }
  prim.getAttribute('POSITION').setArray(P);
  if (debug) {
    prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(C).setBuffer(buf));
    fs.writeFileSync(outFile, await io.writeBinary(doc));
    return;
  }
  // skeleton: bone positions back to model space
  const toM = (p) => [p[0] * H + cx, p[1] * H + min[1], p[2] * H + cz];
  const BP = BONES.map((b) => toM(b.p));
  const nodes = BONES.map((b) => doc.createNode(b.name));
  BONES.forEach((b, i) => {
    const pp = b.parent >= 0 ? BP[b.parent] : [0, 0, 0];
    nodes[i].setTranslation([BP[i][0] - pp[0], BP[i][1] - pp[1], BP[i][2] - pp[2]]);
    if (b.parent >= 0) nodes[b.parent].addChild(nodes[i]);
  });
  const scene = root.listScenes()[0];
  const armature = doc.createNode('Armature');
  armature.addChild(nodes[0]);
  scene.addChild(armature);
  const ibm = new Float32Array(16 * BONES.length);
  BP.forEach((p, i) => ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -p[0], -p[1], -p[2], 1], i * 16));
  const skin = doc.createSkin(`${id}Skin`).setSkeleton(nodes[0]).setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buf));
  nodes.forEach((nd) => skin.addJoint(nd));
  meshNode.setSkin(skin);
  prim.setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint8Array(J)).setBuffer(buf));
  prim.setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(W).setBuffer(buf));
  const quat = ([x, y, z]) => {
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2), s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    return [s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3];
  };
  const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  // arms held out level: each upper arm is first lowered (about the forward axis), then its clip rotation applies in
  // the chest's frame; the forearm's clip rotation is carried into the lowered arm's frame (down⁻¹ · r · down), so a
  // bend of the elbow still bends it forward as it does for hanging arms
  const down = {};
  if (o.tpose) for (const s of ['R', 'L']) {
    const a = (s === 'R' ? 1 : -1) * o.tpose.down; // the right arm points -x: lowering it is +z
    down[s] = [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
  }
  const inv = (q) => [-q[0], -q[1], -q[2], q[3]];
  const qFor = (bone, e) => {
    const q = quat(e);
    const mm = /^(UpperArm|ForeArm)([RL])$/.exec(bone);
    if (!o.tpose || !mm) return q;
    const d = down[mm[2]];
    return mm[1] === 'UpperArm' ? qmul(q, d) : qmul(qmul(inv(d), q), d);
  };
  if (o.tpose) for (const s of ['R', 'L']) nodes[B[`UpperArm${s}`]].setRotation(down[s]);
  for (const [name, tracks] of Object.entries(clips)) {
    const anim = doc.createAnimation(name);
    for (const [k, frames] of Object.entries(tracks)) {
      const [bone, what] = k.split('.');
      const bi = B[bone];
      if (bi === undefined) continue;
      const base = nodes[bi].getTranslation();
      const vals = what === 't'
        ? frames.flatMap((f) => [base[0] + f[1][0] * H, base[1] + f[1][1] * H, base[2] + f[1][2] * H])
        : frames.flatMap((f) => qFor(bone, f[1]));
      const sampler = doc.createAnimationSampler()
        .setInput(doc.createAccessor().setType('SCALAR').setArray(new Float32Array(frames.map((f) => f[0]))).setBuffer(buf))
        .setOutput(doc.createAccessor().setType(what === 't' ? 'VEC3' : 'VEC4').setArray(new Float32Array(vals)).setBuffer(buf))
        .setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes[bi]).setTargetPath(what === 't' ? 'translation' : 'rotation').setSampler(sampler));
    }
  }
  // keep the look the sculpts had: their painted texture partly self-lit (see load() in src/three/monsters.ts)
  scene.setExtras({ ...(scene.getExtras() ?? {}), selfLit: 0.5 });
  await doc.transform(quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12, quantizeWeight: 8 }));
  fs.writeFileSync(outFile, zlib.gzipSync(Buffer.from(await io.writeBinary(doc)), { level: 9 }));
}

const [,, inDir, outDir, ...rest] = process.argv;
if (inDir) {
  await MeshoptDecoder.ready; await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
  const debug = rest.includes('debug');
  const ids = rest.filter((r) => r !== 'debug');
  fs.mkdirSync(outDir, { recursive: true });
  for (const id of ids.length ? ids : Object.keys(RIGS)) {
    await rig(io, path.join(inDir, `${id}.glb.gz`), path.join(outDir, debug ? `${id}_dbg.glb` : `${id}.glb.gz`), id, debug);
  }
}
