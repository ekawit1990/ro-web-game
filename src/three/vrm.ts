import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { HAIR_COLORS, type ClassKey } from '../data';
import { animateCharacter, setHat, type CharRig, type Look } from './models';
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
  if (look.cls) attachInstrument(vrm, look.cls, 1 / (HEIGHT / h), v0);
  rig.root.userData.cls = look.cls;
  setHat(rig, hat);
  return rig;
}

function attachInstrument(vrm: VRM, cls: ClassKey, s: number, v0: boolean) {
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
    const bass = cls === 'bassist';
    const mat = toon(bass ? '#5a3a8a' : '#d9822b');
    const a = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.07, 18), mat);
    a.rotation.x = Math.PI / 2;
    const b = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.07, 18), mat, 0, 0.17, 0);
    b.rotation.x = Math.PI / 2;
    prop.add(a, b, mesh(new THREE.BoxGeometry(0.05, bass ? 0.62 : 0.5, 0.03), toon('#6b4320'), 0, bass ? 0.55 : 0.48, 0.01));
    prop.position.set(0.02 * s, -0.18 * s, 0.17 * s);
    prop.rotation.z = -1.05;
    chest.add(prop);
  } else if (cls === 'keyboardist' && chest) {
    prop.add(mesh(new THREE.BoxGeometry(0.62, 0.05, 0.16), toon('#263238')));
    prop.add(mesh(new THREE.BoxGeometry(0.5, 0.012, 0.1), toon('#fafafa'), 0.02, 0.03, 0.01));
    prop.position.set(0, -0.2 * s, 0.25 * s);
    prop.rotation.set(0.4, 0, 0.1);
    chest.add(prop);
  }
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
  set('head', 0, 0, s.moving ? 0 : Math.sin(t * 1.3) * 0.04);
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
