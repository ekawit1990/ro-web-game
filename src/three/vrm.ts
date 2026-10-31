import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { HAIR_COLORS, type ClassKey } from '../data';
import { animateCharacter, buildDagger, setHat, type CharRig, type Look } from './models';
import { dressArmour } from './armour';
import { buildStringed } from './bass';
import { buildKeyboard } from './keyboard';
import { mesh, toon } from './toon';
import { track } from '../ui/loadProgress';

/**
 * Anime characters made in VRoid Studio (or any VRM 0.x / 1.0 model).
 *
 * Put the .vrm (or gzipped .vrm.gz) files in `public/models/` and list them in `public/models/models.json`:
 *   { "m": ["boy1.vrm", "boy2.vrm"], "f": ["girl1.vrm"], "tintHair": true }
 * The hair-style choice picks a model from the list for that gender (style % list length).
 * Without the file (or if a model fails to load) the game keeps the built-in characters.
 */

export interface VrmCatalog {
  m: string[];
  f: string[];
  tintHair?: boolean;
}

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/`;
let catalog: Promise<VrmCatalog | null> | null = null;
const buffers = new Map<string, Promise<ArrayBuffer>>();
const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

export function vrmCatalog(): Promise<VrmCatalog | null> {
  catalog ??= fetch(`${BASE}models.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => (c && (c.m?.length || c.f?.length) ? c : null))
    .catch(() => null);
  return catalog;
}

/** How many VRM models the creator can pick from for a gender (0 = built-in characters). */
export async function vrmModelCount(gender: 'm' | 'f'): Promise<{ count: number; tintHair: boolean }> {
  const cat = await vrmCatalog();
  if (!cat) return { count: 0, tintHair: true };
  const list = (gender === 'f' ? cat.f : cat.m)?.length ? (gender === 'f' ? cat.f : cat.m) : cat.m?.length ? cat.m : cat.f;
  return { count: list?.length ?? 0, tintHair: cat.tintHair !== false };
}

function modelFor(cat: VrmCatalog, look: Look): string | null {
  const list = (look.gender === 'f' ? cat.f : cat.m)?.length ? (look.gender === 'f' ? cat.f : cat.m) : cat.m?.length ? cat.m : cat.f;
  if (!list?.length) return null;
  return list[Math.abs(look.hair) % list.length];
}

async function parse(file: string): Promise<VRM> {
  let buf = buffers.get(file);
  if (!buf) {
    buf = fetch(BASE + file).then((r) => {
      if (!r.ok) throw new Error(`${file}: ${r.status}`);
      return r.arrayBuffer();
    }).then(gunzip);
    buffers.set(file, buf);
  }
  const data = await buf;
  const gltf = await loader.parseAsync(data, BASE);
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`${file} is not a VRM model`);
  VRMUtils.rotateVRM0(vrm); // VRM 0.x faces -Z
  return vrm;
}

/** `.vrm.gz` files are gzipped (a VRoid model shrinks ~4x); a host may already have decoded them, so check the magic bytes. */
async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const head = new Uint8Array(buf, 0, 2);
  if (head[0] !== 0x1f || head[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const HEIGHT = 1.55; // world units (tiles) for a VRM character

const EXPRESSIONS = ['neutral', 'happy', 'angry', 'relaxed'];

/** Loads a VRM character for this look, or null when no model is configured / it fails. */
export async function buildVrmCharacter(look: Look, hat = ''): Promise<CharRig | null> {
  const cat = await vrmCatalog();
  const file = cat && modelFor(cat, look);
  if (!file) return null;
  let vrm: VRM;
  try {
    vrm = await track(parse(file));
  } catch (e) {
    console.warn('VRM load failed, using the built-in character', e);
    return null;
  }

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(vrm.scene);
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
    }
  });
  // scale to game size
  vrm.update(0);
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const h = Math.max(0.3, box.max.y - box.min.y);
  vrm.scene.scale.setScalar(HEIGHT / h);
  vrm.scene.position.y = -box.min.y * (HEIGHT / h);

  // hair colour: tint materials named like VRoid's hair materials
  if (cat!.tintHair !== false) {
    const col = new THREE.Color(HAIR_COLORS[look.hair_color] ?? HAIR_COLORS[0]);
    vrm.scene.traverse((o) => {
      const mats = ((o as THREE.Mesh).material ? ([] as THREE.Material[]).concat((o as THREE.Mesh).material) : []) as (THREE.Material & { color?: THREE.Color })[];
      for (const mat of mats) if (/hair/i.test(mat.name) && mat.color) mat.color.copy(col);
    });
  }

  // players all wear the same armour (NPCs keep their own clothes)
  if (!look.body) {
    try {
      dressArmour(vrm, root);
    } catch (e) {
      console.warn('could not fit the armour', e);
    }
  }

  const bone = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
  const g = (o: THREE.Object3D | null) => (o ?? new THREE.Group()) as THREE.Group;
  const head = g(bone('head'));
  // VRM 0.x normalized bones keep the model's original -Z facing, so anything parented to them is turned around
  const v0 = vrm.meta?.metaVersion === '0';
  const hatSlot = new THREE.Group();
  if (v0) hatSlot.rotation.y = Math.PI;
  hatSlot.scale.setScalar(0.37); // our hats fit a 0.33 head; a VRoid head is ~0.12 m
  hatSlot.position.y = 0.11;
  head.add(hatSlot);

  const rig: CharRig & { vrm: VRM } = {
    root, body, head, armL: g(bone('leftUpperArm')), armR: g(bone('rightUpperArm')), legL: g(bone('leftUpperLeg')),
    legR: g(bone('rightUpperLeg')), hatSlot, hat: '', height: HEIGHT, vrm,
  };
  rig.root.userData.vrmFace = EXPRESSIONS[look.face] ?? 'neutral';
  if (look.cls) rig.root.userData.gear = attachInstrument(vrm, look.cls, 1 / (HEIGHT / h), v0);
  rig.root.userData.cls = look.cls;
  setHat(rig, hat);
  return rig;
}

/** Wrist targets the arms reach for every frame (two-bone IK), plus where the elbows should point. */
interface ArmTargets {
  play: 'strings' | 'keys';
  left: THREE.Object3D;
  right: THREE.Object3D;
  restL: THREE.Vector3;
  restR: THREE.Vector3;
  poleL: THREE.Object3D;
  poleR: THREE.Object3D;
}

/** A prop that is slung on the back out of combat and brought to the hands to play (attack). */
interface Piece {
  obj: THREE.Object3D;
  held: THREE.Object3D;
  back: THREE.Object3D;
}

interface Gear {
  ik?: ArmTargets;
  pieces: Piece[];
  /** Straps that only fit one of the two places. */
  heldOnly: THREE.Object3D[];
  backOnly: THREE.Object3D[];
  /** 0 = on the back, 1 = in hand. */
  draw?: number;
}

/** An empty marker with this local transform under `parent`. */
function anchor(parent: THREE.Object3D, pos: THREE.Vector3, quat: THREE.Quaternion, scale = 1) {
  const o = new THREE.Object3D();
  o.position.copy(pos);
  o.quaternion.copy(quat);
  o.scale.setScalar(scale);
  parent.add(o);
  return o;
}

/** Rotation whose +X runs along `x` and whose +Z (or +Y, when `yUp`) points along `n`. */
function basis(x: THREE.Vector3, n: THREE.Vector3, yUp = false) {
  const X = x.clone().normalize();
  const N = n.clone().addScaledVector(X, -n.dot(X)).normalize();
  const third = yUp ? new THREE.Vector3().crossVectors(X, N) : new THREE.Vector3().crossVectors(N, X);
  const m = yUp ? new THREE.Matrix4().makeBasis(X, N, third) : new THREE.Matrix4().makeBasis(X, third, N);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** Moves `obj` (a child of `chest`) to its held place and records where it sits on the back. */
function piece(chest: THREE.Object3D, obj: THREE.Object3D, back: { pos: THREE.Vector3; quat: THREE.Quaternion }): Piece {
  const parent = obj.parent!;
  const held = anchor(parent, obj.position, obj.quaternion, obj.scale.x);
  const b = anchor(chest, back.pos, back.quat, obj.scale.x);
  chest.add(obj);
  return { obj, held, back: b };
}

function attachInstrument(vrm: VRM, cls: ClassKey, s: number, v0: boolean): Gear | undefined {
  const bone = (n: VRMHumanBoneName) => {
    const b = vrm.humanoid.getNormalizedBoneNode(n);
    if (!b || !v0) return b;
    const turned = new THREE.Group();
    turned.rotation.y = Math.PI;
    b.add(turned);
    return turned;
  };
  const handR = bone('rightHand');
  const handL = bone('leftHand');
  const chest = bone('upperChest') ?? bone('chest') ?? bone('spine');
  if (!chest) return;
  // chest frame: +X is the character's left, +Y up, +Z forward; `fit` scales metres to this model
  const fit = (s * HEIGHT) / 1.62;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).multiplyScalar(fit);
  const prop = new THREE.Group();
  prop.scale.setScalar(s * 0.9);
  if (cls === 'teen' && handR) {
    const knife = buildDagger();
    knife.scale.setScalar(s * 0.75);
    knife.rotation.x = Math.PI / 2 - 0.35; // blade forward out of the fist
    knife.position.set(-0.07 * s, -0.01 * s, 0.02 * s);
    prop.add(knife);
    prop.scale.setScalar(1);
    handR.add(prop);
    // sheathed point-down at the left hip
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0, Math.PI - 0.25));
    return { pieces: [piece(chest, prop, { pos: V(0.15, -0.36, 0.03), quat })], heldOnly: [], backOnly: [] };
  } else if (cls === 'singer' && handR) {
    prop.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.2, 10), toon('#222222'), 0, 0.06, 0));
    prop.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), toon('#b0b6bd'), 0, 0.18, 0));
    prop.position.set(-0.08 * s, 0, 0.03 * s);
    handR.add(prop);
    // tucked behind the right shoulder, head up like a sword hilt
    const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, 0.45));
    return { pieces: [piece(chest, prop, { pos: V(-0.06, -0.02, -0.15), quat })], heldOnly: [], backOnly: [] };
  } else if (cls === 'drummer' && handR && handL) {
    const pieces: Piece[] = [];
    for (const [h, side] of [[handR, -1], [handL, 1]] as const) {
      const stick = mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.4, 8), toon('#e3c18f'));
      stick.scale.setScalar(s * 0.9);
      stick.position.set(side * 0.08 * s, 0, 0.12 * s);
      stick.rotation.x = Math.PI / 2;
      h.add(stick);
      // crossed on the back, tips over the shoulders
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, side * 0.5));
      pieces.push(piece(chest, stick, { pos: V(side * 0.01, 0.07, -0.14), quat }));
    }
    return { pieces, heldOnly: [], backOnly: [] };
  } else if (cls === 'guitarist' || cls === 'bassist') {
    // slung low across the body on a strap: body at the right hip, neck rising to the left
    const bass = cls === 'bassist';
    const inst = buildStringed(bass ? 'bass' : 'guitar');
    const hang = new THREE.Group();
    hang.add(inst.group);
    hang.scale.setScalar((bass ? 0.95 : 1) * fit);
    hang.position.set(0.03 * fit, (bass ? -0.26 : -0.24) * fit, 0.155 * fit);
    hang.rotation.set(-0.12, -0.32, 0.5, 'YZX');
    chest.add(hang);
    // on the back: face out, neck up past the left shoulder, body at the right hip
    const back = { pos: V(-0.02, bass ? 0.02 : 0.0, -0.17), quat: basis(new THREE.Vector3(0.45, 1, -0.12), new THREE.Vector3(0, 0, -1)) };
    const p = piece(chest, hang, back);
    vrm.scene.updateMatrixWorld(true);
    const strap = addStrap(vrm, chest, inst.group);
    hang.position.copy(p.back.position);
    hang.quaternion.copy(p.back.quaternion);
    vrm.scene.updateMatrixWorld(true);
    const backStrap = addBackStrap(vrm, chest, inst.group);
    const poleL = new THREE.Object3D();
    poleL.position.set(0.45, -0.35, -0.25).multiplyScalar(fit);
    const poleR = new THREE.Object3D();
    poleR.position.set(-0.45, -0.1, -0.35).multiplyScalar(fit);
    chest.add(poleL, poleR);
    return {
      ik: { play: 'strings', left: inst.grip, right: inst.pluck, restL: inst.grip.position.clone(), restR: inst.pluck.position.clone(), poleL, poleR },
      pieces: [p], heldOnly: [strap], backOnly: [backStrap],
    };
  } else if (cls === 'keyboardist') {
    // held flat in front of the waist, hands resting on the keys
    const kb = buildKeyboard();
    kb.group.scale.setScalar(fit);
    kb.group.position.set(0, -0.36 * fit, 0.3 * fit);
    kb.group.rotation.x = 0.12;
    chest.add(kb.group);
    // on the back: keys facing out, tilted across the back from the left shoulder down to the right hip
    const back = { pos: V(0, -0.1, -0.17), quat: basis(new THREE.Vector3(0.5, 1, 0), new THREE.Vector3(0, 0, -1), true) };
    const p = piece(chest, kb.group, back);
    kb.group.position.copy(p.back.position);
    kb.group.quaternion.copy(p.back.quaternion);
    vrm.scene.updateMatrixWorld(true);
    const ends = [new THREE.Vector3(0.4, 0.03, 0.12), new THREE.Vector3(-0.38, 0.03, 0.12)];
    kb.group.userData.strapPins = ends;
    const backStrap = addBackStrap(vrm, chest, kb.group);
    const poleL = new THREE.Object3D();
    poleL.position.set(0.5, -0.25, -0.35).multiplyScalar(fit);
    const poleR = new THREE.Object3D();
    poleR.position.set(-0.5, -0.25, -0.35).multiplyScalar(fit);
    chest.add(poleL, poleR);
    return {
      ik: { play: 'keys', left: kb.left, right: kb.right, restL: kb.left.position.clone(), restR: kb.right.position.clone(), poleL, poleR },
      pieces: [p], heldOnly: [], backOnly: [backStrap],
    };
  }
}

const strapMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.8 });
function strapTube(chest: THREE.Object3D, pts: THREE.Vector3[]) {
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.011, 6);
  const strap = new THREE.Mesh(geo, strapMat);
  chest.add(strap);
  return strap;
}

/** The two strap pins of `inst` and the left shoulder, in chest space. */
function strapEnds(vrm: VRM, chest: THREE.Object3D, inst: THREE.Object3D) {
  const local = (o: THREE.Object3D | null, v = new THREE.Vector3()) => (o ? chest.worldToLocal(o.localToWorld(v.clone())) : null);
  const [horn, tail] = (inst.userData.strapPins as THREE.Vector3[]).map((p) => local(inst, p)!);
  const sh = local(vrm.humanoid.getNormalizedBoneNode('leftUpperArm')) ?? new THREE.Vector3(0.15, 0.1, 0);
  return { horn, tail, sh, side: Math.sign(sh.x) || 1 };
}

/** A black strap from the horn, over the left shoulder, round the back to the tail. */
function addStrap(vrm: VRM, chest: THREE.Object3D, inst: THREE.Object3D) {
  const { horn, tail, sh, side } = strapEnds(vrm, chest, inst);
  return strapTube(chest, [
    horn,
    new THREE.Vector3(sh.x * 0.75, sh.y - 0.08, 0.1),
    new THREE.Vector3(sh.x * 0.62, sh.y + 0.075, 0.0),
    new THREE.Vector3(sh.x * 0.4, sh.y - 0.02, -0.11),
    new THREE.Vector3(-side * 0.1, tail.y + 0.12, -0.13),
    new THREE.Vector3(-side * 0.16, tail.y + 0.02, -0.03),
    tail,
  ]);
}

/** Slung on the back: the strap runs from the upper pin over the left shoulder, down across the chest
 *  to the right hip and round the side to the lower pin. */
function addBackStrap(vrm: VRM, chest: THREE.Object3D, inst: THREE.Object3D) {
  const { horn, tail, sh, side } = strapEnds(vrm, chest, inst);
  const [hi, lo] = horn.y > tail.y ? [horn, tail] : [tail, horn];
  return strapTube(chest, [
    hi,
    new THREE.Vector3(sh.x * 0.6, sh.y + 0.02, -0.1),
    new THREE.Vector3(sh.x * 0.55, sh.y + 0.075, 0.0),
    new THREE.Vector3(sh.x * 0.45, sh.y - 0.03, 0.115),
    new THREE.Vector3(0, (sh.y + lo.y) / 2, 0.135),
    new THREE.Vector3(-side * 0.13, lo.y + 0.03, 0.105),
    new THREE.Vector3(-side * 0.165, lo.y, 0.0),
    lo,
  ]);
}

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _mi = new THREE.Matrix4();

/** Puts a piece `k` of the way from the back (0) to the hands (1), arcing out behind the shoulder on the way. */
function place(p: Piece, k: number) {
  p.held.matrixWorld.decompose(_pa, _qa, _sa);
  p.back.matrixWorld.decompose(_pb, _qb, _sb);
  _pb.lerp(_pa, k);
  _pb.y += Math.sin(k * Math.PI) * 0.12 * _sa.y;
  _qb.slerp(_qa, k);
  _sb.lerp(_sa, k);
  _m.compose(_pb, _qb, _sb);
  _m.premultiply(_mi.copy(p.obj.parent!.matrixWorld).invert());
  _m.decompose(p.obj.position, p.obj.quaternion, p.obj.scale);
  p.obj.updateMatrixWorld(true);
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _p = new THREE.Quaternion(), _w = new THREE.Quaternion();

/** Turns `bone` (in world space) so the direction `from` becomes `to`. */
function aim(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  bone.parent!.getWorldQuaternion(_p);
  bone.getWorldQuaternion(_w);
  bone.quaternion.copy(_p.invert().multiply(_q.multiply(_w)));
  bone.updateWorldMatrix(false, true);
}

/** Two-bone IK: put the wrist on `target`, bending the elbow towards `pole` (both world space). */
function reach(vrm: VRM, side: 'left' | 'right', target: THREE.Vector3, pole: THREE.Vector3, twist = 0) {
  const up = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`);
  const lo = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`);
  const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`);
  if (!up || !lo || !hand) return;
  up.quaternion.identity();
  lo.quaternion.identity();
  up.updateWorldMatrix(true, true);
  const S = up.getWorldPosition(new THREE.Vector3());
  const E0 = lo.getWorldPosition(new THREE.Vector3());
  const H0 = hand.getWorldPosition(new THREE.Vector3());
  const l1 = S.distanceTo(E0), l2 = E0.distanceTo(H0);
  const dir = _a.subVectors(target, S);
  const d = THREE.MathUtils.clamp(dir.length(), Math.abs(l1 - l2) + 1e-4, (l1 + l2) * 0.999);
  dir.normalize();
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const bend = _b.subVectors(pole, S);
  bend.addScaledVector(dir, -bend.dot(dir)).normalize();
  const E = _c.copy(S).addScaledVector(dir, along).addScaledVector(bend, out);
  aim(up, _d.subVectors(E0, S), E.clone().sub(S));
  const E1 = lo.getWorldPosition(new THREE.Vector3());
  const H1 = hand.getWorldPosition(new THREE.Vector3());
  aim(lo, H1.sub(E1), target.clone().sub(E1));
  if (twist) {
    // roll the forearm about itself so the palm faces the instrument
    _q.setFromAxisAngle(_a.subVectors(target, E1).normalize(), twist);
    lo.parent!.getWorldQuaternion(_p);
    lo.getWorldQuaternion(_w);
    lo.quaternion.copy(_p.invert().multiply(_q.multiply(_w)));
  }
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'] as const;
const JOINTS = ['Proximal', 'Intermediate', 'Distal'] as const;

/** Curls the fingers of one hand (VRM 1.0 convention; mirrored for 0.x). */
function curl(vrm: VRM, side: 'left' | 'right', amount: number[], v0: boolean) {
  const sgn = (side === 'left' ? -1 : 1) * (v0 ? -1 : 1);
  FINGERS.forEach((f, i) => {
    for (const j of JOINTS) vrm.humanoid.getNormalizedBoneNode(`${side}${f}${j}` as VRMHumanBoneName)?.rotation.set(0, 0, sgn * amount[i]);
  });
  vrm.humanoid.getNormalizedBoneNode(`${side}ThumbProximal` as VRMHumanBoneName)?.rotation.set(0, (side === 'left' ? -0.5 : 0.5), 0);
}

/** Per-class arm poses (normalized VRM bones, T-pose = all zero, model faces +Z). */
const POSES: Record<string, { rU: [number, number]; rL: number; lU: [number, number]; lL: number; locked: boolean }> = {
  idle: { rU: [0, 1.25], rL: 0.25, lU: [0, -1.25], lL: -0.25, locked: false },
  teen: { rU: [-0.5, 1.15], rL: 1.1, lU: [-0.2, -1.2], lL: -0.6, locked: false },
  singer: { rU: [-0.9, 1.1], rL: 1.9, lU: [0, -1.25], lL: -0.25, locked: true },
  guitarist: { rU: [-0.3, 1.1], rL: 1.3, lU: [-0.7, -0.9], lL: -1.7, locked: true },
  bassist: { rU: [-0.3, 1.1], rL: 1.3, lU: [-0.7, -0.9], lL: -1.7, locked: true },
  keyboardist: { rU: [-0.5, 1.15], rL: 1.4, lU: [-0.5, -1.15], lL: -1.4, locked: true },
  drummer: { rU: [-0.2, 1.2], rL: 0.9, lU: [-0.2, -1.2], lL: -0.9, locked: false },
};

const POSED: VRMHumanBoneName[] = ['rightUpperArm', 'leftUpperArm', 'rightLowerArm', 'leftLowerArm', 'leftUpperLeg', 'rightUpperLeg',
  'leftLowerLeg', 'rightLowerLeg', 'spine', 'head'];

export interface AnimState {
  moving: boolean;
  sitting: boolean;
  dead: boolean;
  attack: number;
  /** Instrument in hand (fighting); otherwise it is slung on the back. */
  drawn?: boolean;
}

const DRAW_TIME = 0.22; // seconds to swing the instrument from the back into the hands

const ARM_BONES: VRMHumanBoneName[] = ['leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm'];

export function animateVrm(rig: CharRig & { vrm?: VRM }, t: number, s: AnimState) {
  const vrm = rig.vrm!;
  const dt = Math.min(0.1, Math.max(0, t - (rig.root.userData.lastT ?? t)));
  rig.root.userData.lastT = t;
  const b = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
  const gear = rig.root.userData.gear as Gear | undefined;
  // how far the instrument has come off the back (eased)
  let k = 0;
  if (gear) {
    const want = s.drawn && !s.dead ? 1 : 0;
    gear.draw = gear.draw === undefined ? want : THREE.MathUtils.clamp(gear.draw + Math.sign(want - gear.draw) * (dt / DRAW_TIME), 0, 1);
    k = THREE.MathUtils.smoothstep(gear.draw, 0, 1);
  }
  const cls = POSES[rig.root.userData.cls as string] ?? POSES.idle;
  const idle = POSES.idle;
  const mix = (x: number, y: number) => x + (y - x) * k;
  const pose = {
    rU: [mix(idle.rU[0], cls.rU[0]), mix(idle.rU[1], cls.rU[1])], rL: mix(idle.rL, cls.rL),
    lU: [mix(idle.lU[0], cls.lU[0]), mix(idle.lU[1], cls.lU[1])], lL: mix(idle.lL, cls.lL),
  };
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  for (const n of POSED) b(n)?.rotation.set(0, 0, 0);

  const swing = s.moving ? Math.sin(t * 11) : 0;
  const armSwing = swing * (cls.locked ? mix(0.5, 0.1) : 0.5);
  const set = (n: VRMHumanBoneName, x: number, y: number, z: number) => b(n)?.rotation.set(x, y, z);
  set('rightUpperArm', pose.rU[0] + armSwing, 0, pose.rU[1]);
  set('leftUpperArm', pose.lU[0] - armSwing, 0, pose.lU[1]);
  set('rightLowerArm', 0, pose.rL, 0);
  set('leftLowerArm', 0, pose.lL, 0);
  set('leftUpperLeg', swing * 0.6, 0, 0);
  set('rightUpperLeg', -swing * 0.6, 0, 0);
  set('leftLowerLeg', s.moving ? Math.max(0, -swing) * 0.8 : 0, 0, 0);
  set('rightLowerLeg', s.moving ? Math.max(0, swing) * 0.8 : 0, 0, 0);
  set('spine', s.moving ? 0.06 : Math.sin(t * 2) * 0.015, 0, 0);
  set('head', gear?.ik ? 0.14 * k : 0, 0, s.moving ? 0 : Math.sin(t * 1.3) * 0.04);
  rig.body.position.y = s.moving ? Math.abs(Math.sin(t * 11)) * 0.04 : 0;

  if (s.attack > 0) {
    const a = Math.sin(s.attack * Math.PI);
    b('rightUpperArm')!.rotation.x -= a * 1.2;
    b('leftUpperArm')!.rotation.x -= a * 0.6;
    b('spine')!.rotation.x += a * 0.15;
  }
  if (s.sitting) {
    set('leftUpperLeg', -1.5, 0, 0.1);
    set('rightUpperLeg', -1.5, 0, -0.1);
    set('leftLowerLeg', 1.5, 0, 0);
    set('rightLowerLeg', 1.5, 0, 0);
    rig.body.position.y = -0.55;
  }
  if (s.dead) {
    rig.body.rotation.x = -Math.PI / 2;
    rig.body.position.y = 0.12;
  }

  // VRM 0.x normalized bones face -Z: the same pose there is mirrored in x and z
  const v0 = vrm.meta?.metaVersion === '0';
  if (v0) {
    for (const n of POSED) {
      const r = b(n)?.rotation;
      if (r) r.set(-r.x, r.y, -r.z);
    }
  }

  if (gear) {
    rig.root.updateMatrixWorld(true);
    for (const p of gear.pieces) place(p, k);
    for (const o of gear.heldOnly) o.visible = k > 0.98;
    for (const o of gear.backOnly) o.visible = k < 0.02;
  }

  // instrument players: wrists go to the neck and over the strings, as far as the instrument has come round
  const ik = gear?.ik;
  if (ik && !s.dead && k > 0) {
    const a = s.attack > 0 ? Math.sin(s.attack * Math.PI) : 0;
    ik.left.position.copy(ik.restL);
    ik.right.position.copy(ik.restR);
    if (ik.play === 'strings') {
      ik.right.position.y += -0.05 * a + (s.moving ? 0 : Math.sin(t * 9) * 0.006);
      ik.right.position.z += 0.02 * a;
    } else {
      // little key presses, hands drifting along the keyboard; an attack is a two-hand chord
      const press = (ph: number) => (s.moving ? 0 : Math.max(0, Math.sin(t * 7 + ph)) * 0.012);
      ik.left.position.x += Math.sin(t * 1.3) * 0.03;
      ik.right.position.x += Math.sin(t * 1.1 + 2) * 0.03;
      ik.left.position.y -= press(0) + a * 0.012;
      ik.right.position.y -= press(2.2) + a * 0.012;
    }
    const keys = ik.play === 'keys';
    const before = ARM_BONES.map((n) => b(n)?.quaternion.clone());
    // forearm roll that turns the palms onto the neck / strings, or face-down onto the keys
    const [twL, twR] = keys ? [-1.5, 1.5] : [-1.5, -1.5];
    reach(vrm, 'left', ik.left.getWorldPosition(new THREE.Vector3()), ik.poleL.getWorldPosition(new THREE.Vector3()), twL);
    reach(vrm, 'right', ik.right.getWorldPosition(new THREE.Vector3()), ik.poleR.getWorldPosition(new THREE.Vector3()), twR);
    if (k < 1) ARM_BONES.forEach((n, i) => before[i] && b(n)?.quaternion.slerpQuaternions(before[i]!, b(n)!.quaternion, k));
    const c = (v: number[]) => v.map((x) => x * k);
    curl(vrm, 'left', c(keys ? [0.35, 0.4, 0.45, 0.5] : [1.0, 1.1, 1.15, 1.2]), v0);
    curl(vrm, 'right', c(keys ? [0.35, 0.4, 0.45, 0.5] : [0.55, 0.7, 0.9, 1.0]), v0);
  } else if (ik) {
    curl(vrm, 'left', [0, 0, 0, 0], v0);
    curl(vrm, 'right', [0, 0, 0, 0], v0);
  }

  // facial expression + blinking
  const em = vrm.expressionManager;
  if (em) {
    const face = rig.root.userData.vrmFace as string;
    for (const e of EXPRESSIONS.slice(1)) em.setValue(e, e === face ? 0.7 : 0);
    if (s.dead) em.setValue('sad', 1);
    const blink = (t + rig.root.id) % 4 < 0.12 ? 1 : 0;
    em.setValue('blink', face === 'happy' ? 0 : blink);
  }
  vrm.update(dt);
}

/** Animates either kind of character. */
export function animateRig(rig: CharRig, t: number, s: AnimState) {
  if ((rig as CharRig & { vrm?: VRM }).vrm) animateVrm(rig, t, s);
  else animateCharacter(rig, t, s);
}
