import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { HAIR_COLORS, type ClassKey } from '../data';
import { animateCharacter, setHat, type CharRig, type Look } from './models';
import { buildStringed } from './bass';
import { buildKeyboard } from './keyboard';
import { mesh, toon } from './toon';

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
    vrm = await parse(file);
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
  if (look.cls) rig.root.userData.ik = attachInstrument(vrm, look.cls, 1 / (HEIGHT / h), v0);
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

function attachInstrument(vrm: VRM, cls: ClassKey, s: number, v0: boolean): ArmTargets | undefined {
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
  const prop = new THREE.Group();
  prop.scale.setScalar(s * 0.9);
  if (cls === 'singer' && handR) {
    prop.add(mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.2, 10), toon('#222222'), 0, 0.06, 0));
    prop.add(mesh(new THREE.SphereGeometry(0.05, 12, 10), toon('#b0b6bd'), 0, 0.18, 0));
    prop.position.set(-0.08 * s, 0, 0.03 * s);
    handR.add(prop);
  } else if (cls === 'drummer' && handR && handL) {
    for (const [h, side] of [[handR, -1], [handL, 1]] as const) {
      const stick = mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.4, 8), toon('#e3c18f'));
      stick.scale.setScalar(s * 0.9);
      stick.position.set(side * 0.08 * s, 0, 0.12 * s);
      stick.rotation.x = Math.PI / 2;
      h.add(stick);
    }
  } else if ((cls === 'guitarist' || cls === 'bassist') && chest) {
    // slung low across the body on a strap: body at the right hip, neck rising to the left
    const bass = cls === 'bassist';
    const inst = buildStringed(bass ? 'bass' : 'guitar');
    const hang = new THREE.Group();
    hang.add(inst.group);
    const fit = (s * HEIGHT) / 1.62; // model height vs. the ~1.6 m the strap height was tuned on
    hang.scale.setScalar((bass ? 0.95 : 1) * fit);
    hang.position.set(0.03 * fit, (bass ? -0.26 : -0.24) * fit, 0.155 * fit);
    hang.rotation.set(-0.12, -0.32, 0.5, 'YZX');
    chest.add(hang);
    vrm.scene.updateMatrixWorld(true);
    addStrap(vrm, chest, inst.group);
    const poleL = new THREE.Object3D();
    poleL.position.set(0.45, -0.35, -0.25).multiplyScalar(fit);
    const poleR = new THREE.Object3D();
    poleR.position.set(-0.45, -0.1, -0.35).multiplyScalar(fit);
    chest.add(poleL, poleR);
    return { play: 'strings', left: inst.grip, right: inst.pluck, restL: inst.grip.position.clone(), restR: inst.pluck.position.clone(), poleL, poleR };
  } else if (cls === 'keyboardist' && chest) {
    // held flat in front of the waist, hands resting on the keys
    const fit = (s * HEIGHT) / 1.62;
    const kb = buildKeyboard();
    kb.group.scale.setScalar(fit);
    kb.group.position.set(0, -0.36 * fit, 0.3 * fit);
    kb.group.rotation.x = 0.12;
    chest.add(kb.group);
    const poleL = new THREE.Object3D();
    poleL.position.set(0.5, -0.25, -0.35).multiplyScalar(fit);
    const poleR = new THREE.Object3D();
    poleR.position.set(-0.5, -0.25, -0.35).multiplyScalar(fit);
    chest.add(poleL, poleR);
    return { play: 'keys', left: kb.left, right: kb.right, restL: kb.left.position.clone(), restR: kb.right.position.clone(), poleL, poleR };
  }
}

/** A black strap from the horn, over the left shoulder, round the back to the tail. */
function addStrap(vrm: VRM, chest: THREE.Object3D, inst: THREE.Object3D) {
  const local = (o: THREE.Object3D | null, v = new THREE.Vector3()) => (o ? chest.worldToLocal(o.localToWorld(v.clone())) : null);
  const [horn, tail] = (inst.userData.strapPins as THREE.Vector3[]).map((p) => local(inst, p)!);
  const sh = local(vrm.humanoid.getNormalizedBoneNode('leftUpperArm')) ?? new THREE.Vector3(0.15, 0.1, 0);
  const side = Math.sign(sh.x) || 1;
  const pts = [
    horn,
    new THREE.Vector3(sh.x * 0.75, sh.y - 0.08, 0.1),
    new THREE.Vector3(sh.x * 0.62, sh.y + 0.075, 0.0),
    new THREE.Vector3(sh.x * 0.4, sh.y - 0.02, -0.11),
    new THREE.Vector3(-side * 0.1, tail.y + 0.12, -0.13),
    new THREE.Vector3(-side * 0.16, tail.y + 0.02, -0.03),
    tail,
  ];
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 48, 0.011, 6);
  const strap = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.8 }));
  chest.add(strap);
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
  singer: { rU: [-0.9, 1.1], rL: 1.9, lU: [0, -1.25], lL: -0.25, locked: true },
  guitarist: { rU: [-0.3, 1.1], rL: 1.3, lU: [-0.7, -0.9], lL: -1.7, locked: true },
  bassist: { rU: [-0.3, 1.1], rL: 1.3, lU: [-0.7, -0.9], lL: -1.7, locked: true },
  keyboardist: { rU: [-0.5, 1.15], rL: 1.4, lU: [-0.5, -1.15], lL: -1.4, locked: true },
  drummer: { rU: [-0.2, 1.2], rL: 0.9, lU: [-0.2, -1.2], lL: -0.9, locked: false },
};

const POSED: VRMHumanBoneName[] = ['rightUpperArm', 'leftUpperArm', 'rightLowerArm', 'leftLowerArm', 'leftUpperLeg', 'rightUpperLeg',
  'leftLowerLeg', 'rightLowerLeg', 'spine', 'head'];

export function animateVrm(rig: CharRig & { vrm?: VRM }, t: number, s: { moving: boolean; sitting: boolean; dead: boolean; attack: number }) {
  const vrm = rig.vrm!;
  const dt = Math.min(0.1, Math.max(0, t - (rig.root.userData.lastT ?? t)));
  rig.root.userData.lastT = t;
  const b = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
  const pose = POSES[rig.root.userData.cls as string] ?? POSES.idle;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  for (const n of POSED) b(n)?.rotation.set(0, 0, 0);

  const swing = s.moving ? Math.sin(t * 11) : 0;
  const armSwing = pose.locked ? swing * 0.1 : swing * 0.5;
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
  set('head', rig.root.userData.ik ? 0.14 : 0, 0, s.moving ? 0 : Math.sin(t * 1.3) * 0.04);
  rig.body.position.y = s.moving ? Math.abs(Math.sin(t * 11)) * 0.04 : 0;

  if (s.attack > 0) {
    const k = Math.sin(s.attack * Math.PI);
    b('rightUpperArm')!.rotation.x -= k * 1.2;
    b('leftUpperArm')!.rotation.x -= k * 0.6;
    b('spine')!.rotation.x += k * 0.15;
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
  if (vrm.meta?.metaVersion === '0') {
    for (const n of POSED) {
      const r = b(n)?.rotation;
      if (r) r.set(-r.x, r.y, -r.z);
    }
  }

  // instrument players: wrists go to the neck and over the strings
  const ik = rig.root.userData.ik as ArmTargets | undefined;
  if (ik && !s.dead) {
    const v0 = vrm.meta?.metaVersion === '0';
    const k = s.attack > 0 ? Math.sin(s.attack * Math.PI) : 0;
    ik.left.position.copy(ik.restL);
    ik.right.position.copy(ik.restR);
    if (ik.play === 'strings') {
      ik.right.position.y += -0.05 * k + (s.moving ? 0 : Math.sin(t * 9) * 0.006);
      ik.right.position.z += 0.02 * k;
    } else {
      // little key presses, hands drifting along the keyboard; an attack is a two-hand chord
      const press = (ph: number) => (s.moving ? 0 : Math.max(0, Math.sin(t * 7 + ph)) * 0.012);
      ik.left.position.x += Math.sin(t * 1.3) * 0.03;
      ik.right.position.x += Math.sin(t * 1.1 + 2) * 0.03;
      ik.left.position.y -= press(0) + k * 0.012;
      ik.right.position.y -= press(2.2) + k * 0.012;
    }
    const keys = ik.play === 'keys';
    // forearm roll that turns the palms onto the neck / strings, or face-down onto the keys
    const [twL, twR] = keys ? [-1.5, 1.5] : [-1.5, -1.5];
    reach(vrm, 'left', ik.left.getWorldPosition(new THREE.Vector3()), ik.poleL.getWorldPosition(new THREE.Vector3()), twL);
    reach(vrm, 'right', ik.right.getWorldPosition(new THREE.Vector3()), ik.poleR.getWorldPosition(new THREE.Vector3()), twR);
    curl(vrm, 'left', keys ? [0.35, 0.4, 0.45, 0.5] : [1.0, 1.1, 1.15, 1.2], v0);
    curl(vrm, 'right', keys ? [0.35, 0.4, 0.45, 0.5] : [0.55, 0.7, 0.9, 1.0], v0);
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
export function animateRig(rig: CharRig, t: number, s: { moving: boolean; sitting: boolean; dead: boolean; attack: number }) {
  if ((rig as CharRig & { vrm?: VRM }).vrm) animateVrm(rig, t, s);
  else animateCharacter(rig, t, s);
}
