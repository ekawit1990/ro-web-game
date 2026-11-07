import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { rimNow, setRim } from './look';
import { VRM, VRMLoaderPlugin, VRMSpringBoneJoint, VRMUtils, type VRMHumanBoneName } from '@pixiv/three-vrm';
import { HAIR_COLORS, ITEMS, type ClassKey } from '../data';
import { animateCharacter, buildDagger, setHat, type CharRig, type Look } from './models';
import { dressArmour } from './armour';
import { buildStringed } from './bass';
import { buildKeyboard } from './keyboard';
import { mesh, toon } from './toon';
import { PHONE } from './device';
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
  if (PHONE) buffers.delete(file); // ~10 MB unzipped each: fetch it again (from the HTTP cache) when needed
  const vrm = gltf.userData.vrm as VRM | undefined;
  if (!vrm) throw new Error(`${file} is not a VRM model`);
  VRMUtils.rotateVRM0(vrm); // VRM 0.x faces -Z
  if (PHONE) keepUsedMorphs(vrm);
  shareResources(file, vrm.scene);
  return vrm;
}

/** Phones: half-size character textures (a quarter of the memory; they're small on screen anyway). */
function halve(src: THREE.Source) {
  const img = src.data as { width?: number; height?: number } | null;
  if (!img?.width || !img.height || Math.max(img.width, img.height) < 256) return;
  const cv = document.createElement('canvas');
  cv.width = img.width / 2;
  cv.height = img.height / 2;
  cv.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0, cv.width, cv.height);
  src.data = cv;
  src.needsUpdate = true;
}

/**
 * A VRoid face carries ~57 blend shapes on each of its 7 parts, and three.js packs them into one float texture per
 * part: ~50 MB of GPU memory per model. We only play a handful of expressions, so on phones drop the rest.
 */
function keepUsedMorphs(vrm: VRM) {
  const em = vrm.expressionManager;
  if (!em) return;
  const used = new Set(['blink', 'sad', ...EXPRESSIONS]);
  const binds: { primitives: THREE.Mesh[]; index: number }[] = [];
  const keep = new Map<THREE.Mesh, Set<number>>();
  for (const ex of em.expressions) {
    for (const b of ex.binds as unknown as { primitives?: THREE.Mesh[]; index?: number }[]) {
      if (!b.primitives || b.index === undefined) continue; // material binds
      binds.push(b as { primitives: THREE.Mesh[]; index: number });
      if (!used.has(ex.expressionName)) continue;
      for (const m of b.primitives) (keep.get(m) ?? keep.set(m, new Set()).get(m)!).add(b.index);
    }
  }
  const remap = new Map<THREE.Mesh, Map<number, number>>();
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    const morphs = m.isMesh ? m.geometry.morphAttributes : undefined;
    if (!morphs?.position?.length) return;
    const idx = [...(keep.get(m) ?? [])].sort((x, y) => x - y);
    remap.set(m, new Map(idx.map((old, i) => [old, i])));
    for (const k of Object.keys(morphs)) morphs[k] = idx.map((i) => morphs[k][i]);
    m.morphTargetInfluences = idx.map(() => 0);
    m.morphTargetDictionary = {};
  });
  // the binds now point into the shorter lists; the ones for expressions we dropped point nowhere
  for (const b of binds) {
    const to = b.primitives.map((m) => remap.get(m)?.get(b.index));
    b.index = to[0] !== undefined && to.every((i) => i === to[0]) ? to[0] : -1;
  }
}

/**
 * Every character parses its model again (each needs its own bones and materials), but the images and meshes
 * are the same: point them at the first copy's so a town full of the same model holds them in memory once.
 * Phones (iOS Safari above all) kill the page when it runs out of memory.
 */
const shared = new Map<string, { sources: THREE.Source[]; geos: THREE.BufferGeometry[] }>();
function shareResources(file: string, scene: THREE.Object3D) {
  const sources: THREE.Source[] = [];
  const seen = new Set<THREE.Source>();
  const textures = new Set<THREE.Texture>();
  const geos: THREE.BufferGeometry[] = [];
  const meshes: THREE.Mesh[] = [];
  const addTex = (t: unknown) => {
    if (!(t as THREE.Texture)?.isTexture) return;
    const tex = t as THREE.Texture;
    textures.add(tex);
    if (!seen.has(tex.source)) {
      seen.add(tex.source);
      sources.push(tex.source);
    }
  };
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes.push(m);
    geos.push(m.geometry);
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const k of Object.keys(u).sort()) addTex(u[k].value);
      for (const k of Object.keys(mat).sort()) addTex((mat as unknown as Record<string, unknown>)[k]);
    }
  });
  const first = shared.get(file);
  if (!first) {
    if (PHONE) for (const src of sources) halve(src);
    shared.set(file, { sources, geos });
    return;
  }
  // same file, same parse order: swap only when the shapes line up exactly
  if (first.sources.length === sources.length) {
    const map = new Map(sources.map((s, i) => [s, first.sources[i]]));
    for (const t of textures) t.source = map.get(t.source)!;
  }
  if (first.geos.length === geos.length && geos.every((g, i) => g.getAttribute('position')?.count === first.geos[i].getAttribute('position')?.count)) {
    meshes.forEach((m, i) => (m.geometry = first.geos[i]));
  }
}

/**
 * Frees a preview-only character: its GPU copies and the model's shared copy. The phone creator calls this after
 * drawing each model, so flipping through dozens of them doesn't pile them all up in memory (iOS reloads the page).
 * Only for rigs no live world uses: disposing a shared mesh makes every renderer upload it again.
 */
export function releaseVrm(rig: CharRig) {
  const file = rig.root.userData.vrmFile as string | undefined;
  if (!file) return;
  shared.delete(file);
  buffers.delete(file);
  rig.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const k of Object.keys(u)) (u[k].value as THREE.Texture)?.isTexture && (u[k].value as THREE.Texture).dispose();
      for (const v of Object.values(mat)) (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose();
      mat.dispose();
    }
  });
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

const isCloth = (m: THREE.Mesh) => ([] as THREE.Material[]).concat(m.material).some((x) => /CLOTH|Body_00_SKIN/.test(x?.name ?? ''));

/**
 * Puts another VRoid model's parts on this character: its clothes (with the body under them, which VRoid paints
 * tights and inner layers onto) for an outfit, or a few hair parts for a hat. Every VRoid model has the same
 * humanoid bones (J_Bip_*), so the parts are skinned to this character's bones by name; the extra bones they hang
 * on (skirts, coat tails, hat brims: J_Sec_*) are copied in, with their spring-bone physics. Only one face and
 * one set of hair per character, so a town full of outfits costs little more than before.
 */
function graft(base: VRM, from: VRM, take: (m: THREE.SkinnedMesh) => boolean, fit = false) {
  // `fit`: the parts are made on another body: resize them bone by bone to this character's limbs and trunk
  const scales = fit ? boneScales(base, from) : null;
  const scaleOf = (b: THREE.Object3D | null) => {
    for (let o = b; o && scales; o = o.parent) {
      const k = scales.get(o.name);
      if (k !== undefined) return k;
    }
    return 1;
  };
  const byName = new Map<string, THREE.Object3D>();
  base.scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh) for (const b of sm.skeleton.bones) if (!byName.has(b.name)) byName.set(b.name, b);
  });
  const added = new Map<THREE.Object3D, THREE.Object3D>();
  // VRM 0.x models face -Z in their own space and VRM 1.0 ones +Z (VRoid rest bones carry no rotation either way):
  // parts from the other kind are turned round to this model's space
  const flip = (from.meta?.metaVersion === '0') !== (base.meta?.metaVersion === '0');
  const R = new THREE.Matrix4().makeRotationY(flip ? Math.PI : 0);
  const qR = new THREE.Quaternion().setFromRotationMatrix(R);
  const boneFor = (b: THREE.Object3D): THREE.Object3D => {
    // the body's bones are shared by name; the swinging ones (skirts, coat tails, hair: J_Sec_*) belong to the part.
    // This character may have its own skirt bones by the same names, laid out for its own (longer, wider) skirt.
    const got = added.get(b) ?? (b.name.startsWith('J_Sec_') ? undefined : byName.get(b.name));
    if (got) return got;
    const parent = b.parent && b.parent !== from.scene ? boneFor(b.parent) : base.scene;
    const nb = new THREE.Bone();
    nb.name = b.name;
    nb.position.copy(b.position).multiplyScalar(scaleOf(b.parent)).applyQuaternion(qR);
    nb.quaternion.copy(qR).multiply(b.quaternion).multiply(qR.clone().invert());
    nb.scale.copy(b.scale);
    parent.add(nb);
    byName.set(b.name, nb);
    added.set(b, nb);
    return nb;
  };
  const parts: THREE.SkinnedMesh[] = [];
  from.scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && take(sm)) parts.push(sm);
  });
  let host: THREE.Object3D | null = null;
  base.scene.traverse((o) => {
    if (!host && (o as THREE.SkinnedMesh).isSkinnedMesh) host = o.parent;
  });
  for (const m of parts) {
    const sk = new THREE.Skeleton(
      m.skeleton.bones.map(boneFor) as THREE.Bone[],
      // a scale in the inverse bind matrix shrinks or grows the part round each bone it hangs on
      m.skeleton.boneInverses.map((x, i) => {
        const k = scaleOf(m.skeleton.bones[i]);
        return k === 1 ? R.clone().multiply(x) : R.clone().multiply(new THREE.Matrix4().makeScale(k, k, k)).multiply(x);
      }),
    );
    const nm = new THREE.SkinnedMesh(m.geometry, m.material);
    nm.name = m.name;
    (host ?? base.scene).add(nm);
    nm.bind(sk, m.bindMatrix.clone());
  }
  // skirts and hat brims swing like they did on their own model, bumping into this body
  const springs = base.springBoneManager;
  if (springs && from.springBoneManager && added.size) {
    const groups = springs.colliderGroups;
    for (const j of from.springBoneManager.joints) {
      const bone = added.get(j.bone);
      if (!bone) continue;
      const child = j.child ? (added.get(j.child) ?? byName.get(j.child.name) ?? null) : null;
      springs.addJoint(new VRMSpringBoneJoint(bone, child, { ...j.settings }, groups));
    }
    springs.setInitState();
  }
  return parts.length;
}

/**
 * How much longer this character's limbs and trunk are than the source model's, per source bone name: a part made
 * on a grown-up body then fits a small or chibi character (VRoid rest bones carry no rotation, so a scale is enough).
 */
function boneScales(base: VRM, from: VRM) {
  const at = (v: VRM, n: VRMHumanBoneName) => v.humanoid.getRawBoneNode(n)?.getWorldPosition(new THREE.Vector3());
  const ratio = (a: VRMHumanBoneName, b: VRMHumanBoneName) => {
    const p = at(base, a), q = at(base, b), r = at(from, a), t = at(from, b);
    const x = p && q ? p.distanceTo(q) : 0;
    const y = r && t ? r.distanceTo(t) : 0;
    return x > 1e-4 && y > 1e-4 ? THREE.MathUtils.clamp(x / y, 0.4, 2.5) : 1;
  };
  const trunk = ratio('hips', 'neck');
  const legs = { left: ratio('leftUpperLeg', 'leftFoot'), right: ratio('rightUpperLeg', 'rightFoot') };
  const arms = { left: ratio('leftUpperArm', 'leftHand'), right: ratio('rightUpperArm', 'rightHand') };
  const out = new Map<string, number>();
  for (const [name, bone] of Object.entries(from.humanoid.humanBones)) {
    const node = bone?.node;
    if (!node) continue;
    const side = name.startsWith('left') ? 'left' : name.startsWith('right') ? 'right' : null;
    const k = !side ? trunk : /Leg|Foot|Toes/.test(name) ? legs[side] : /Shoulder/.test(name) ? trunk : arms[side];
    out.set(node.name, k);
  }
  return out;
}

/** The typical skin colour of a model's body texture (warm, opaque texels), or null. */
function skinOf(scene: THREE.Object3D): THREE.Color | null {
  let img: (CanvasImageSource & { width: number; height: number }) | null = null;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (img || !m.isMesh) return;
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      const map = (mat as THREE.MeshBasicMaterial).map;
      if (/Body_00_SKIN/.test(mat.name) && map?.image) img = map.image as typeof img;
    }
  });
  if (!img) return null;
  try {
    const n = 48;
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.drawImage(img, 0, 0, n, n);
    const d = c.getImageData(0, 0, n, n).data;
    const ch: number[][] = [[], [], []];
    for (let i = 0; i < d.length; i += 4) {
      // skin: opaque, red > green > blue, not too dark (clothes painted on the body are grey, black or blue)
      if (d[i + 3] > 200 && d[i] > 70 && d[i] > d[i + 1] && d[i + 1] > d[i + 2] && d[i] - d[i + 2] > 18) {
        ch[0].push(d[i]);
        ch[1].push(d[i + 1]);
        ch[2].push(d[i + 2]);
      }
    }
    if (ch[0].length < 20) return null;
    const med = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1] / 255;
    return new THREE.Color().setRGB(med(ch[0]), med(ch[1]), med(ch[2]), THREE.SRGBColorSpace);
  } catch {
    return null; // a tainted or unreadable image: keep the uniform's own skin
  }
}

/** The school uniform every Teen wears (white shirt and navy tie / sailor blouse and skirt): tools/make_uniform.py. */
const UNIFORM = { m: 'uniform_m.vrm.gz', f: 'uniform_f.vrm.gz' };

/**
 * Puts the school uniform on a character: the uniform's clothes and body, resized to this character's skeleton,
 * with the body tinted to this character's own skin. Their face and hair stay. Returns false if it didn't load.
 */
async function wearUniform(vrm: VRM, gender: 'm' | 'f') {
  const skin = skinOf(vrm.scene);
  const from = await track(parse(UNIFORM[gender]));
  const theirs = skinOf(from.scene);
  const own: THREE.Object3D[] = [];
  vrm.scene.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (sm.isSkinnedMesh && isCloth(sm) && sm.visible) own.push(sm);
  });
  const before = new Set<THREE.Object3D>();
  vrm.scene.traverse((o) => before.add(o));
  if (!graft(vrm, from, isCloth, true)) return false;
  for (const o of own) o.visible = false;
  if (skin && theirs) {
    const k = [skin.r / theirs.r, skin.g / theirs.g, skin.b / theirs.b].map((x) => THREE.MathUtils.clamp(x, 0.35, 1.3));
    vrm.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || before.has(o)) return;
      for (const mat of ([] as THREE.Material[]).concat(m.material)) {
        if (!/Body_00_SKIN/.test(mat.name)) continue;
        const mt = mat as THREE.Material & { color?: THREE.Color; shadeColorFactor?: THREE.Color };
        mt.color?.setRGB(mt.color.r * k[0], mt.color.g * k[1], mt.color.b * k[2]);
        mt.shadeColorFactor?.setRGB(mt.shadeColorFactor.r * k[0], mt.shadeColorFactor.g * k[1], mt.shadeColorFactor.b * k[2]);
      }
    });
  }
  return true;
}

/** Loads a VRM character for this look, or null when no model is configured / it fails. */
export async function buildVrmCharacter(look: Look, hat = ''): Promise<CharRig | null> {
  const cat = await vrmCatalog();
  const file = cat && modelFor(cat, look);
  if (!file) return null;
  const outfit = look.outfit ? ITEMS[look.outfit] : undefined;
  const hatItem = ITEMS[hat]?.vrm ? ITEMS[hat] : undefined;
  let vrm: VRM;
  try {
    vrm = await track(parse(file));
  } catch (e) {
    console.warn('VRM load failed, using the built-in character', e);
    return null;
  }

  // hair colour: tint materials named like VRoid's hair materials (before any hat parts come in)
  if (cat!.tintHair !== false) {
    const col = new THREE.Color(HAIR_COLORS[look.hair_color] ?? HAIR_COLORS[0]);
    vrm.scene.traverse((o) => {
      const mats = ((o as THREE.Mesh).material ? ([] as THREE.Material[]).concat((o as THREE.Mesh).material) : []) as (THREE.Material & { color?: THREE.Color })[];
      for (const mat of mats) if (/hair/i.test(mat.name) && mat.color) mat.color.copy(col);
    });
  }

  let dressed = false;
  if (outfit?.vrm) {
    try {
      const from = await track(parse(outfit.vrm));
      vrm.scene.traverse((o) => {
        const sm = o as THREE.SkinnedMesh;
        if (sm.isSkinnedMesh && isCloth(sm)) sm.visible = false;
      });
      dressed = graft(vrm, from, isCloth) > 0;
      if (!dressed) vrm.scene.traverse((o) => (o as THREE.SkinnedMesh).isSkinnedMesh && (o.visible = true));
    } catch (e) {
      console.warn('outfit failed to load', e);
    }
  }
  // Teens (every new character) wear the school uniform; after the job change it's the armour below
  let student = false;
  if (!dressed && !look.body && (look.cls ?? 'teen') === 'teen') {
    try {
      student = await wearUniform(vrm, look.gender === 'f' ? 'f' : 'm');
    } catch (e) {
      console.warn('uniform failed to load', e);
    }
  }
  if (hatItem?.vrm && hatItem.part) {
    try {
      const part = hatItem.part;
      const from = await track(parse(hatItem.vrm));
      graft(vrm, from, (m) => ([] as THREE.Material[]).concat(m.material).some((x) => x?.name?.includes(part)));
    } catch (e) {
      console.warn('hat failed to load', e);
    }
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
  // the swinging parts (hair, skirts) remember where their tips were: measured before the model was turned round
  // (VRM 0.x) and scaled, a grafted skirt would fly out towards those old places. Start them from here instead.
  vrm.scene.updateMatrixWorld(true);
  vrm.springBoneManager?.reset();
  // hip to ankle, in game units: how far the body sinks when the knees bend (the ready stance keeps feet down)
  const yOf = (n: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(n)?.getWorldPosition(new THREE.Vector3()).y;
  root.userData.legLen = Math.max(0.2, (yOf('hips') ?? 0.75) - (yOf('leftFoot') ?? 0.05));

  // after the job change players all wear the same armour (NPCs keep their own clothes; an outfit brings its own)
  if (!look.body && !dressed && !student) {
    try {
      dressArmour(vrm, root);
    } catch (e) {
      console.warn('could not fit the armour', e);
    }
  }
  setRim(root, rimNow());

  const bone = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
  const g = (o: THREE.Object3D | null) => (o ?? new THREE.Group()) as THREE.Group;
  const head = g(bone('head'));
  // VRM 0.x normalized bones keep the model's original -Z facing, so anything parented to them is turned around
  const v0 = vrm.meta?.metaVersion === '0';
  const hatSlot = new THREE.Group();
  if (v0) hatSlot.rotation.y = Math.PI;
  hatSlot.scale.setScalar(0.37); // our hats fit a 0.33 head; a VRoid head is ~0.12 m
  hatSlot.position.y = 0.11;
  const earSlot = hatSlot.clone();
  head.add(hatSlot, earSlot);

  const rig: CharRig & { vrm: VRM } = {
    root, body, head, armL: g(bone('leftUpperArm')), armR: g(bone('rightUpperArm')), legL: g(bone('leftUpperLeg')),
    legR: g(bone('rightUpperLeg')), hatSlot, hat: '', earSlot, ear: '', height: HEIGHT, vrm,
  };
  rig.root.userData.vrmFace = EXPRESSIONS[look.face] ?? 'neutral';
  rig.root.userData.vrmFile = file;
  rig.root.userData.outfit = dressed ? look.outfit : '';
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
  /** Guitar/bass: gripped by the neck in the right fist like a sword, for swinging at monsters. */
  swing?: THREE.Object3D;
}

interface Gear {
  ik?: ArmTargets;
  pieces: Piece[];
  /** Straps that only fit one of the two places. */
  heldOnly: THREE.Object3D[];
  backOnly: THREE.Object3D[];
  /** 0 = on the back, 1 = in hand. */
  draw?: number;
  /** Last visibility set by setGearShown. */
  shown?: boolean;
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

/** Shows or hides everything an instrument/dagger is made of (bare hands when no weapon is equipped). */
function setGearShown(gear: Gear | undefined, shown: boolean) {
  if (!gear || gear.shown === shown) return;
  gear.shown = shown;
  for (const p of gear.pieces) p.obj.visible = shown;
  for (const o of [...gear.heldOnly, ...gear.backOnly]) o.visible = shown;
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
    // swung like a two-handed sword, gripped by the neck near the headstock (placed each frame, see swingGrip)
    p.swing = new THREE.Object3D();
    p.swing.matrixAutoUpdate = false;
    p.swing.userData.hold = inst.grip.position.x + (bass ? 0.1 : 0.06);
    // two-handed guard: back fist by the headstock (fret 1), front fist halfway down the neck (fret ~11)
    const f5 = NUT_X - inst.grip.position.x; // nut to fret 5 = 0.25 of the scale length
    p.swing.userData.bladeHold = NUT_X - f5 * 0.22;
    p.swing.userData.bladeGap = f5 * 1.25;
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
const _sh = new THREE.Vector3(), _hd = new THREE.Vector3(), _up = new THREE.Vector3(), _fw = new THREE.Vector3();
/**
 * Where a swung guitar/bass goes: the neck in the right fist and the body carried on out along the arm
 * (shoulder to hand, tipped up a little like a sword), strings facing out of the swing.
 */
function swingGrip(vrm: VRM, root: THREE.Object3D, p: Piece) {
  const sh = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
  const hand = vrm.humanoid.getNormalizedBoneNode('rightHand');
  if (!sh || !hand || !p.swing) return;
  sh.getWorldPosition(_sh);
  hand.getWorldPosition(_hd);
  const blade = root.userData.bladeDir as THREE.Vector3 | undefined;
  const dir = blade ? _pa.copy(blade) : _pa.subVectors(_hd, _sh).normalize();
  _up.set(0, 1, 0);
  if (!blade) dir.addScaledVector(_up, 0.35).normalize();
  // strings face sideways to the swing: across the arm and the character's facing
  _fw.set(0, 0, 1).applyQuaternion(root.getWorldQuaternion(_qb));
  // a two-handed guard holds it on edge like a sword blade: the face of the body turned to the side
  const n = blade ? _sb.crossVectors(_up, dir) : _sb.crossVectors(dir, _fw);
  if (n.lengthSq() < 1e-4) n.crossVectors(dir, blade ? _fw : _up);
  const q = basis(dir.clone().negate(), n.normalize());
  p.held.matrixWorld.decompose(_pb, _qa, _sa);
  const scale = _sa.x;
  const hilt = root.userData.bladeHilt as THREE.Vector3 | undefined;
  const pos = (blade && hilt ? hilt.clone() : _hd.clone()).addScaledVector(dir, (blade ? p.swing.userData.bladeHold : p.swing.userData.hold) * scale);
  p.swing.matrixWorld.compose(pos, q, _sa.setScalar(scale));
}

function place(p: Piece, k: number, from = p.back, to = p.held, arc = true) {
  to.matrixWorld.decompose(_pa, _qa, _sa);
  from.matrixWorld.decompose(_pb, _qb, _sb);
  _pb.lerp(_pa, k);
  if (arc) _pb.y += Math.sin(k * Math.PI) * 0.12 * _sa.y;
  _qb.slerp(_qa, k);
  _sb.lerp(_sa, k);
  _m.compose(_pb, _qb, _sb);
  _m.premultiply(_mi.copy(p.obj.parent!.matrixWorld).invert());
  _m.decompose(p.obj.position, p.obj.quaternion, p.obj.scale);
  p.obj.updateMatrixWorld(true);
}

const _bh = new THREE.Vector3();
const NUT_X = 0.47; // the instrument's nut, along its +X (see buildStringed)
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

/**
 * Puts a hand round a bar (the instrument's neck) at `at`: the arm reaches so the palm, not the wrist, lands there,
 * then the hand turns so its straight fingers point along `fingers`, the thumb along `thumb` and the palm faces `palm`
 * (all world space; the fingers are curled shut afterwards).
 */
function grip(vrm: VRM, side: 'left' | 'right', at: THREE.Vector3, fingers: THREE.Vector3, thumb: THREE.Vector3, palm: THREE.Vector3, pole: THREE.Vector3, palmOff?: number) {
  const hand = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`);
  const mid = vrm.humanoid.getNormalizedBoneNode(`${side}MiddleProximal`);
  const th = vrm.humanoid.getNormalizedBoneNode(`${side}ThumbMetacarpal` as VRMHumanBoneName) ?? vrm.humanoid.getNormalizedBoneNode(`${side}ThumbProximal`);
  if (!hand || !mid || !th) {
    reach(vrm, side, at, pole);
    return;
  }
  const W = hand.getWorldPosition(new THREE.Vector3());
  const len = W.distanceTo(mid.getWorldPosition(new THREE.Vector3()));
  // the bar sits across the middle of the palm, a finger's thickness off it
  const wrist = at.clone().addScaledVector(fingers, -len * (palmOff ? 0.35 : 0.6)).addScaledVector(palm, -len * (palmOff ?? 0.2));
  reach(vrm, side, wrist, pole);
  hand.updateWorldMatrix(true, true);
  const H = hand.getWorldPosition(new THREE.Vector3());
  const f0 = mid.getWorldPosition(new THREE.Vector3()).sub(H).normalize();
  const t0 = th.getWorldPosition(new THREE.Vector3()).sub(H);
  t0.addScaledVector(f0, -t0.dot(f0)).normalize();
  const t1 = thumb.clone().addScaledVector(fingers, -thumb.dot(fingers)).normalize();
  const m0 = new THREE.Matrix4().makeBasis(f0, t0, new THREE.Vector3().crossVectors(f0, t0));
  const m1 = new THREE.Matrix4().makeBasis(fingers, t1, new THREE.Vector3().crossVectors(fingers, t1));
  _q.setFromRotationMatrix(m1.multiply(m0.transpose()));
  hand.parent!.getWorldQuaternion(_p);
  hand.getWorldQuaternion(_w);
  hand.quaternion.copy(_p.invert().multiply(_q.multiply(_w)));
  hand.updateWorldMatrix(false, true);
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
  teen: { rU: [-0.35, 1.2], rL: 1.75, lU: [-1.0, -0.95], lL: -1.5, locked: false },
  singer: { rU: [-0.9, 1.1], rL: 1.9, lU: [0, -1.25], lL: -0.25, locked: true },
  guitarist: { rU: [-0.3, 1.1], rL: 1.3, lU: [-0.7, -0.9], lL: -1.7, locked: true },
  bassist: { rU: [-0.3, 1.1], rL: 1.3, lU: [-0.7, -0.9], lL: -1.7, locked: true },
  keyboardist: { rU: [-0.5, 1.15], rL: 1.4, lU: [-0.5, -1.15], lL: -1.4, locked: true },
  drummer: { rU: [-0.2, 1.2], rL: 0.9, lU: [-0.2, -1.2], lL: -0.9, locked: false },
};

const POSED: VRMHumanBoneName[] = ['rightUpperArm', 'leftUpperArm', 'rightLowerArm', 'leftLowerArm', 'leftUpperLeg', 'rightUpperLeg',
  'leftLowerLeg', 'rightLowerLeg', 'spine', 'chest', 'head', 'rightHand', 'leftHand', 'hips', 'leftFoot', 'rightFoot'];

type V3 = [number, number, number];
/**
 * One pose in a dagger move, `at` = fraction of the attack; the move starts and ends at the guard pose.
 * `hit` marks the key where the blade connects. dy/dz move the whole body (down / forward).
 */
interface ComboKey {
  at: number; bones: Partial<Record<VRMHumanBoneName, V3>>; dy?: number; dz?: number; hit?: boolean;
  /**
   * Guitar / bass held two-handed like a big sword: `h` = where the right fist holds the neck and `d` = which way the
   * instrument points, both in the body's frame (+X = the character's left, +Y up, +Z forward, game units).
   * The left hand grips just above the right one and both arms reach there.
   */
  blade?: { h: V3; d: V3 };
}

/**
 * The Teen's knife-fighter guard, added on top of the class pose while fighting: left foot forward,
 * knees bent and weight low, shoulders turned so the left side leads, head kept on the target,
 * off hand up in front of the chest and the dagger held low at the hip, point forward.
 */
/** The Teen between attacks: dagger held forward at the waist, point out, off hand loose in front of the chest. */
const READY_ARMS = { rU: [-0.5, 1.15] as const, rL: 1.2, lU: [-0.55, -1.08] as const, lL: -1.3 };

const GUARD: Partial<Record<VRMHumanBoneName, V3>> = {
  leftUpperLeg: [-0.55, 0, -0.18], leftLowerLeg: [0.8, 0, 0], rightUpperLeg: [0.3, 0, 0.18], rightLowerLeg: [0.4, 0, 0],
  spine: [0.22, -0.3, 0], chest: [0.06, -0.1, 0], head: [-0.2, 0.38, 0],
  rightHand: [0, -0.7, 0.25], leftHand: [0, 0, -0.3],
};

// legs for a committed lunge: front knee over the toes, back leg driving
const LUNGE = { leftUpperLeg: [-1.0, 0, -0.15] as V3, leftLowerLeg: [1.05, 0, 0] as V3, rightUpperLeg: [0.6, 0, 0.18] as V3, rightLowerLeg: [0.35, 0, 0] as V3 };
// legs gathered under the body (the hop before the finisher)
const TUCK = { leftUpperLeg: [-0.7, 0, -0.1] as V3, leftLowerLeg: [1.2, 0, 0] as V3, rightUpperLeg: [-0.2, 0, 0.1] as V3, rightLowerLeg: [1.0, 0, 0] as V3 };

/**
 * Dagger combo (reference: the user's "Chibi Rogue Dagger Combo" sheet): every move has a wind-up,
 * a fast strike driven by the hips and shoulders, a follow-through and a recovery back into the guard.
 */
const COMBO: ComboKey[][] = [
  // 1. diagonal slash: body coils to the right with the blade high, then uncoils and cuts down across to the left
  [
    { at: 0.24, bones: { rightUpperArm: [-1.5, -0.5, 0.1], rightLowerArm: [0, 1.2, 0], rightHand: [0, 0, 0.7], spine: [0.08, -0.6, 0], chest: [0, -0.3, 0], head: [-0.1, 0.75, 0], leftUpperArm: [-1.0, 0, -1.0], leftLowerArm: [0, -1.1, 0] }, dy: -0.06 },
    { at: 0.42, hit: true, bones: { rightUpperArm: [-0.7, 1.3, 0.9], rightLowerArm: [0, 0.25, 0], rightHand: [0, -0.3, -0.5], spine: [0.32, 0.4, 0], chest: [0.1, 0.25, 0], head: [-0.25, -0.5, 0], leftUpperArm: [0.35, 0, -1.3], leftLowerArm: [0, -0.5, 0], ...LUNGE }, dy: -0.17, dz: 0.14 },
    { at: 0.6, bones: { rightUpperArm: [-0.25, 1.6, 1.2], rightLowerArm: [0, 0.5, 0], rightHand: [0, -0.3, -0.6], spine: [0.36, 0.55, 0], chest: [0.1, 0.3, 0], head: [-0.3, -0.65, 0], leftUpperArm: [0.45, 0, -1.3], leftLowerArm: [0, -0.4, 0], ...LUNGE }, dy: -0.18, dz: 0.15 },
  ],
  // 2. piercing stab: elbow chambered back while the off hand reaches out, then hips, shoulder and arm drive the point straight in
  [
    { at: 0.24, bones: { rightUpperArm: [0.55, 0, 1.0], rightLowerArm: [0, 2.0, 0], rightHand: [0, -0.9, 0], spine: [0.1, -0.6, 0], chest: [0, -0.25, 0], head: [-0.15, 0.8, 0], leftUpperArm: [-1.35, 0, -0.75], leftLowerArm: [0, -0.5, 0] }, dy: -0.08, dz: -0.06 },
    { at: 0.4, hit: true, bones: { rightUpperArm: [-1.5, 0.15, 1.45], rightLowerArm: [0, 0.05, 0], rightHand: [0, -1.3, 0], spine: [0.3, 0.45, 0], chest: [0.08, 0.2, 0], head: [-0.3, -0.6, 0], leftUpperArm: [0.6, 0, -1.2], leftLowerArm: [0, -1.4, 0], ...LUNGE }, dy: -0.19, dz: 0.22 },
    { at: 0.58, bones: { rightUpperArm: [-1.45, 0.2, 1.45], rightLowerArm: [0, 0.1, 0], rightHand: [0, -1.3, 0.4], spine: [0.3, 0.5, 0], chest: [0.08, 0.2, 0], head: [-0.3, -0.65, 0], leftUpperArm: [0.6, 0, -1.2], leftLowerArm: [0, -1.4, 0], ...LUNGE }, dy: -0.19, dz: 0.22 },
  ],
  // 3. finisher: a small hop with the blade raised over the head, then the whole body drops into a low downward strike
  [
    { at: 0.3, bones: { rightUpperArm: [-2.75, 0, 1.3], rightLowerArm: [0, 0.9, 0], rightHand: [0, 0, 0.6], spine: [-0.2, -0.15, 0], chest: [-0.1, 0, 0], head: [0.1, 0.15, 0], leftUpperArm: [-1.4, 0, -1.0], leftLowerArm: [0, -0.6, 0], ...TUCK }, dy: 0.1, dz: 0.05 },
    { at: 0.48, hit: true, bones: { rightUpperArm: [-0.55, 0, 1.4], rightLowerArm: [0, 0.2, 0], rightHand: [0, -0.9, 0], spine: [0.6, 0, 0], chest: [0.22, 0, 0], head: [-0.55, 0, 0], leftUpperArm: [0.45, 0, -1.1], leftLowerArm: [0, -0.6, 0], ...LUNGE }, dy: -0.27, dz: 0.18 },
    { at: 0.68, bones: { rightUpperArm: [-0.4, 0, 1.4], rightLowerArm: [0, 0.3, 0], rightHand: [0, -0.9, 0], spine: [0.65, 0, 0], chest: [0.22, 0, 0], head: [-0.6, 0, 0], leftUpperArm: [0.45, 0, -1.1], leftLowerArm: [0, -0.6, 0], ...LUNGE }, dy: -0.28, dz: 0.18 },
  ],
];

// a guard for the off hand while the other one strikes
const DRUM_L_GUARD = { leftUpperArm: [-1.25, 0, -0.85] as V3, leftLowerArm: [0, -1.5, 0] as V3 };
const DRUM_R_GUARD = { rightUpperArm: [-1.25, 0, 0.85] as V3, rightLowerArm: [0, 1.5, 0] as V3 };

/**
 * Drummer: quick alternating stick strikes, low and leaning in like a knife-fighter, one stick per attack
 * (left, right, left …).
 */
const DRUM: ComboKey[][] = [
  [
    { at: 0.18, bones: { leftUpperArm: [-2.4, 0, -0.8], leftLowerArm: [0, -1.3, 0], ...DRUM_R_GUARD, spine: [0.15, -0.4, 0], chest: [0, -0.15, 0], head: [-0.15, 0.45, 0] }, dy: -0.08 },
    { at: 0.42, hit: true, bones: { leftUpperArm: [-1.05, 0.1, -0.25], leftLowerArm: [0, -0.1, 0], ...DRUM_R_GUARD, spine: [0.4, 0.45, 0], chest: [0.1, 0.15, 0], head: [-0.3, -0.5, 0], ...LUNGE }, dy: -0.16, dz: 0.14 },
    { at: 0.62, bones: { leftUpperArm: [-0.75, 0.3, -0.25], leftLowerArm: [0, -0.15, 0], ...DRUM_R_GUARD, spine: [0.42, 0.5, 0], chest: [0.1, 0.15, 0], head: [-0.3, -0.55, 0], ...LUNGE }, dy: -0.16, dz: 0.14 },
  ],
  [
    { at: 0.18, bones: { rightUpperArm: [-2.4, 0, 0.8], rightLowerArm: [0, 1.3, 0], ...DRUM_L_GUARD, spine: [0.15, 0.4, 0], chest: [0, 0.15, 0], head: [-0.15, -0.45, 0] }, dy: -0.08 },
    { at: 0.42, hit: true, bones: { rightUpperArm: [-1.05, -0.1, 0.25], rightLowerArm: [0, 0.1, 0], ...DRUM_L_GUARD, spine: [0.4, -0.45, 0], chest: [0.1, -0.15, 0], head: [-0.3, 0.5, 0], ...LUNGE }, dy: -0.16, dz: 0.14 },
    { at: 0.62, bones: { rightUpperArm: [-0.75, -0.3, 0.25], rightLowerArm: [0, 0.15, 0], ...DRUM_L_GUARD, spine: [0.42, -0.5, 0], chest: [0.1, -0.15, 0], head: [-0.3, 0.55, 0], ...LUNGE }, dy: -0.16, dz: 0.14 },
  ],
];

/**
 * Guitarist / bassist: the instrument held two-handed like a big sword. The guard (the user's reference picture):
 * a wide, low stance, front knee bent and back leg long, the body turned to the right, both fists together at the
 * right hip and the instrument pointing forward and across, low and flat. From there a rising cut up to the left,
 * then a flat sweep from right to left.
 */
const SWORD_GUARD = {
  bones: {
    leftUpperLeg: [-0.75, 0, -0.32] as V3, leftLowerLeg: [0.95, 0, 0] as V3, rightUpperLeg: [0.5, 0, 0.32] as V3, rightLowerLeg: [0.25, 0, 0] as V3,
    spine: [0.38, -0.4, 0] as V3, chest: [0.12, -0.15, 0] as V3, head: [-0.35, 0.5, 0] as V3, hips: [0, 0, 0] as V3,
  },
  dy: -0.2,
  // held the other way round: the right fist by the headstock in front of the hips, the left one halfway down the
  // neck, and the body of the instrument trailing out behind past the right hip
  blade: { h: [-0.1, 1.02, 0.36] as V3, d: [-0.75, -0.02, -0.65] as V3 },
};
const SWORD: ComboKey[][] = [
  // 1. from the guard, the instrument swung up from behind, over the top and down in front
  [
    { at: 0.12, ...SWORD_GUARD },
    { at: 0.3, ...SWORD_GUARD, bones: { ...SWORD_GUARD.bones, spine: [0.3, -0.5, 0] }, blade: { h: [-0.22, 0.7, 0.2], d: [-0.55, -0.45, -0.7] } },
    { at: 0.42, bones: { spine: [0.05, 0, 0], chest: [-0.05, 0, 0], head: [-0.1, 0, 0] }, dy: -0.05, blade: { h: [0.0, 1.05, 0.25], d: [0.1, 1, -0.2] } },
    { at: 0.52, hit: true, bones: { ...LUNGE, spine: [0.5, 0.1, 0], chest: [0.15, 0, 0], head: [-0.45, -0.1, 0] }, dy: -0.18, dz: 0.16, blade: { h: [0.0, 0.85, 0.42], d: [0.05, -0.25, 1] } },
    { at: 0.72, bones: { ...LUNGE, spine: [0.55, 0.1, 0], chest: [0.18, 0, 0], head: [-0.5, -0.1, 0] }, dy: -0.2, dz: 0.16, blade: { h: [0.0, 0.7, 0.4], d: [0.05, -0.6, 0.8] } },
  ],
  // 2. from the guard, a flat sweep: the instrument comes round from behind on the right and across to the left
  [
    { at: 0.12, ...SWORD_GUARD },
    { at: 0.3, ...SWORD_GUARD, bones: { ...SWORD_GUARD.bones, spine: [0.3, -0.85, 0], chest: [0.08, -0.3, 0], head: [-0.25, 0.85, 0] }, blade: { h: [-0.2, 0.78, 0.15], d: [-0.6, 0, -0.8] } },
    { at: 0.42, bones: { spine: [0.2, -0.2, 0], chest: [0.05, -0.1, 0], head: [-0.2, 0.2, 0] }, dy: -0.1, blade: { h: [-0.15, 0.8, 0.3], d: [-1, 0, 0.15] } },
    { at: 0.52, hit: true, bones: { ...LUNGE, spine: [0.3, 0.6, 0], chest: [0.08, 0.25, 0], head: [-0.2, -0.65, 0] }, dy: -0.18, dz: 0.16, blade: { h: [0.05, 0.8, 0.45], d: [0.1, 0, 1] } },
    { at: 0.72, bones: { ...LUNGE, spine: [0.3, 0.8, 0], chest: [0.08, 0.3, 0], head: [-0.2, -0.85, 0] }, dy: -0.18, dz: 0.16, blade: { h: [0.3, 0.78, 0.3], d: [0.9, 0, 0.3] } },
  ],
];

/**
 * Singer: an archer-style throw. Side-on to the target with the off hand pointing at it and the mic
 * drawn back by the ear, then the hips and shoulders turn and the mic is thrown.
 */
const THROW: ComboKey[][] = [
  [
    { at: 0.38, bones: { spine: [0, -0.75, 0], chest: [0, -0.3, 0], head: [0, 1.0, 0], leftUpperArm: [-0.05, -0.55, -0.1], leftLowerArm: [0, -0.1, 0], rightUpperArm: [0.1, -0.45, 0.15], rightLowerArm: [0, 2.1, 0], rightHand: [0, 0, 0.4], leftUpperLeg: [-0.35, 0, -0.2], rightUpperLeg: [0.2, 0, 0.2], rightLowerLeg: [0.3, 0, 0] }, dy: -0.05, dz: -0.05 },
    { at: 0.55, hit: true, bones: { spine: [0.2, 0.35, 0], chest: [0.08, 0.15, 0], head: [-0.1, -0.4, 0], leftUpperArm: [0.3, 0.3, -1.0], leftLowerArm: [0, -0.6, 0], rightUpperArm: [-1.65, 0.45, 0.25], rightLowerArm: [0, 0.1, 0], rightHand: [0, 0, -0.4], ...LUNGE }, dy: -0.12, dz: 0.12 },
    { at: 0.78, bones: { spine: [0.25, 0.4, 0], chest: [0.08, 0.15, 0], head: [-0.15, -0.45, 0], leftUpperArm: [0.35, 0.3, -1.1], leftLowerArm: [0, -0.6, 0], rightUpperArm: [-1.0, 0.6, 0.6], rightLowerArm: [0, 0.2, 0], rightHand: [0, 0, -0.4], ...LUNGE }, dy: -0.12, dz: 0.12 },
  ],
];

/** Each class's attack: its moves (one per attack, in turn) and how long one lasts in seconds. */
/** Ends every move with a key that is back at the standing pose, so each attack lets go of the stance quickly. */
const recover = (moves: ComboKey[][]): ComboKey[][] =>
  moves.map((m) => [...m, { at: Math.min(0.95, Math.max(m[m.length - 1].at + 0.12, 0.8)), bones: {} }]);
const MOVES: Record<string, { moves: ComboKey[][]; time: number }> = {
  teen: { moves: recover(COMBO), time: 0.45 },
  drummer: { moves: recover(DRUM), time: 0.28 },
  guitarist: { moves: recover(SWORD), time: 0.5 },
  bassist: { moves: recover(SWORD), time: 0.5 },
  singer: { moves: recover(THROW), time: 0.45 },
};
const MOVE_BONES = [...new Set(Object.values(MOVES).flatMap((m) => m.moves.flat().flatMap((key) => Object.keys(key.bones))))] as VRMHumanBoneName[];
/** Seconds one attack animation lasts (0 = the old quick arm swing). */
export const attackTime = (cls: string) => MOVES[cls]?.time ?? 0;
/** How many moves the class's attack cycles through. */
export const attackMoves = (cls: string) => MOVES[cls]?.moves.length ?? 1;
/** When move `n` lands (fraction of the attack), so the hit effect can wait for the blow. */
export const attackHit = (cls: string, n: number) => {
  const m = MOVES[cls];
  return m ? m.moves[n % m.moves.length].find((key) => key.hit)!.at : 0.5;
};

export interface AnimState {
  moving: boolean;
  sitting: boolean;
  dead: boolean;
  attack: number;
  /** Instrument in hand (fighting); otherwise it is slung on the back. */
  drawn?: boolean;
  /** A weapon is equipped (false = bare hands: no instrument or dagger at all). Defaults to true. */
  armed?: boolean;
  /** Which move of the class's attack this is (Teen dagger combo, drummer's left/right stick, …). */
  combo?: number;
  /** 0..1: playing / singing for a buff skill or while casting (guitarist, bassist, singer). */
  perform?: number;
  /** Still in a fight between attacks, waiting to hit the next monster: a light stance, rocking from foot to foot. */
  ready?: boolean;
}

const DRAW_TIME = 0.22; // seconds to swing the instrument from the back into the hands

const ARM_BONES: VRMHumanBoneName[] = ['leftUpperArm', 'leftLowerArm', 'rightUpperArm', 'rightLowerArm'];

export function animateVrm(rig: CharRig & { vrm?: VRM }, t: number, s: AnimState) {
  const vrm = rig.vrm!;
  const dt = Math.min(0.1, Math.max(0, t - (rig.root.userData.lastT ?? t)));
  rig.root.userData.lastT = t;
  const b = (n: VRMHumanBoneName) => vrm.humanoid.getNormalizedBoneNode(n);
  const armed = s.armed !== false;
  const gear = armed ? (rig.root.userData.gear as Gear | undefined) : undefined;
  setGearShown(rig.root.userData.gear as Gear | undefined, armed);
  // how far the instrument has come off the back (eased)
  let k = 0;
  if (gear) {
    const want = s.drawn && !s.dead ? 1 : 0;
    gear.draw = gear.draw === undefined ? want : THREE.MathUtils.clamp(gear.draw + Math.sign(want - gear.draw) * (dt / DRAW_TIME), 0, 1);
    k = THREE.MathUtils.smoothstep(gear.draw, 0, 1);
  }
  const clsKey = rig.root.userData.cls as string;
  // the Teen keeps the dagger in hand all the time; the guard stance only shows during an attack
  const knife = clsKey === 'teen' && armed;
  const moves = armed ? MOVES[clsKey] : undefined;
  const perform = !s.dead && !s.sitting ? s.perform ?? 0 : 0;
  // guitar / bass: how far the instrument has gone from the strap into the swinging grip (fades in and out of an attack)
  const swingP = 1 - s.attack;
  const swingW = s.attack > 0 && moves && (clsKey === 'guitarist' || clsKey === 'bassist')
    ? THREE.MathUtils.smoothstep(swingP, 0, 0.16) * (1 - THREE.MathUtils.smoothstep(swingP, 0.84, 1)) : 0;
  const cls = POSES[clsKey] ?? POSES.idle;
  const idle = POSES.idle;
  const mix = (x: number, y: number) => x + (y - x) * k;
  const pose = {
    rU: [mix(idle.rU[0], cls.rU[0]), mix(idle.rU[1], cls.rU[1])], rL: mix(idle.rL, cls.rL),
    lU: [mix(idle.lU[0], cls.lU[0]), mix(idle.lU[1], cls.lU[1])], lL: mix(idle.lL, cls.lL),
  };
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  for (const n of POSED) b(n)?.rotation.set(0, 0, 0);

  // guard stance of the dagger / sticks, only while an attack plays (it eases in and out of each attack)
  const fighting = (knife || (clsKey === 'drummer' && armed)) && k > 0 && s.attack > 0 && !s.moving && !s.sitting && !s.dead;
  const g = fighting ? k * Math.min(1, (1 - s.attack) / 0.12, s.attack / 0.12) : 0;

  // Body motion in layers: walking, standing about, and the ready stance between attacks. Each one fades in and
  // out instead of snapping, and every character keeps its own rhythm.
  const ud = rig.root.userData;
  const fade = (key: string, want: number, rate: number) => {
    const cur = (ud[key] as number | undefined) ?? want;
    const v = cur + THREE.MathUtils.clamp(want - cur, -rate * dt, rate * dt);
    ud[key] = v;
    return v * v * (3 - 2 * v);
  };
  const free = !s.sitting && !s.dead;
  const W = fade('walkW', s.moving && free ? 1 : 0, 6);
  const R = fade('readyW', s.ready && !s.moving && free ? 1 : 0, 3.5) * (1 - g);
  const I = (1 - W) * (1 - R);
  const seed = (rig.root.id % 97) * 1.37;
  const legLen = (ud.legLen as number | undefined) ?? 0.7;
  const set = (n: VRMHumanBoneName, x: number, y: number, z: number) => b(n)?.rotation.set(x, y, z);
  const nudge = (n: VRMHumanBoneName, x: number, y: number, z: number, w: number) => {
    if (w <= 0) return;
    const r = b(n)?.rotation;
    if (r) r.set(r.x + x * w, r.y + y * w, r.z + z * w);
  };
  // the body moves sideways over the feet: lean the legs back under it so the feet stay where they stand
  const shiftBody = (dx: number) => {
    rig.body.position.x += dx;
    nudge('leftUpperLeg', 0, 0, -dx / legLen, 1);
    nudge('rightUpperLeg', 0, 0, -dx / legLen, 1);
  };

  // arms: the class pose (instrument or dagger in hand) or hanging loose, swinging against the legs when walking
  const ph = t * 10.5;
  const sw = Math.sin(ph), cw = Math.cos(ph);
  const loose = cls.locked ? 1 - k : 1;
  const armSwing = sw * (cls.locked ? mix(0.5, 0.1) : 0.5) * W;
  set('rightUpperArm', pose.rU[0] + armSwing, 0, pose.rU[1]);
  set('leftUpperArm', pose.lU[0] - armSwing, 0, pose.lU[1]);
  set('rightLowerArm', 0, pose.rL + 0.3 * Math.max(0, -sw) * W * loose, 0);
  set('leftLowerArm', 0, pose.lL - 0.3 * Math.max(0, sw) * W * loose, 0);
  set('head', gear?.ik ? 0.14 * k : 0, 0, 0);

  if (W > 0) {
    // walking: the hips swing the legs, the knees fold through each swing and the feet roll from heel to toe;
    // the pelvis turns with the stepping leg and the shoulders turn against it; the body rides highest over the
    // standing leg and leans a little over it
    // knee: folds most just after the toe leaves the ground, nearly straight again as the heel comes down
    const knee = (p: number) => 0.1 + 0.7 * Math.max(0, Math.cos(p - 0.85 * Math.PI)) ** 2;
    nudge('leftUpperLeg', sw * 0.48, 0, 0, W);
    nudge('rightUpperLeg', -sw * 0.48, 0, 0, W);
    nudge('leftLowerLeg', knee(ph), 0, 0, W);
    nudge('rightLowerLeg', knee(ph + Math.PI), 0, 0, W);
    nudge('leftFoot', 0.22 * sw, 0, 0, W);
    nudge('rightFoot', -0.22 * sw, 0, 0, W);
    nudge('hips', 0, 0.08 * sw, 0.025 * cw, W);
    nudge('spine', 0.06, -0.05 * sw, -0.02 * cw, W);
    nudge('chest', 0, -0.06 * sw, 0, W);
    nudge('head', -0.03, 0.03 * sw, 0, W);
    rig.body.position.y += (Math.abs(cw) - 0.65) * 0.045 * W;
    shiftBody(0.012 * cw * W);
  }
  if (I > 0) {
    // standing about: breathing, the weight drifting from one leg to the other (the free knee eases), a slow look
    // round
    const br = Math.sin(t * 1.7 + seed);
    const shift = Math.sin(t * 0.45 + seed * 0.7) * 0.7 + Math.sin(t * 0.21 + seed * 1.9) * 0.3;
    const look = Math.sin(t * 0.29 + seed * 1.3) * 0.65 + Math.sin(t * 0.77 + seed) * 0.35;
    nudge('spine', 0.012 * br, 0, -0.02 * shift, I);
    nudge('chest', -0.018 * br, 0, 0, I);
    nudge('hips', 0, 0.03 * shift, 0.03 * shift, I);
    const relaxL = Math.max(0, -shift), relaxR = Math.max(0, shift);
    nudge('leftUpperLeg', -0.05 * relaxL, 0, 0, I);
    nudge('leftLowerLeg', 0.13 * relaxL, 0, 0, I);
    nudge('rightUpperLeg', -0.05 * relaxR, 0, 0, I);
    nudge('rightLowerLeg', 0.13 * relaxR, 0, 0, I);
    nudge('leftUpperArm', 0, 0, 0.02 * br * loose, I);
    nudge('rightUpperArm', 0, 0, -0.02 * br * loose, I);
    nudge('head', 0.015 * br, 0.18 * look, 0.03 * shift, I);
    shiftBody(0.014 * shift * I);
    rig.body.position.y += (0.002 * br - 0.005 * Math.abs(shift)) * I;
  }
  if (R > 0) {
    // ready for the next monster: left foot a little forward, knees soft, rocking from foot to foot with a small
    // bounce as the weight lands on each; shoulders roll with it and the head stays on the target
    const om = t * 4.6 + seed;
    const sway = Math.sin(om);
    const dip = sway * sway;
    const fa = 0.2 + 0.1 * dip, fk = 0.32 + 0.2 * dip; // front leg: thigh forward, knee bend
    const ba = 0.07, bk = 0.2 + 0.2 * dip; // back leg
    nudge('leftUpperLeg', -fa, 0, -0.07, R);
    nudge('leftLowerLeg', fk, 0, 0, R);
    nudge('rightUpperLeg', ba, 0, 0.07, R);
    nudge('rightLowerLeg', bk, 0, 0, R);
    nudge('leftFoot', fa - fk, 0, 0, R * 0.6);
    nudge('rightFoot', -(ba + bk) * 0.5, 0, 0, R * 0.6);
    nudge('hips', 0, -0.1, 0.03 * sway, R);
    nudge('spine', 0.12, -0.08, -0.08 * sway, R);
    nudge('chest', 0.03, 0.06 * sway, 0, R);
    nudge('head', -0.1, 0.18 - 0.06 * sway, 0.04 * sway, R);
    if (knife) {
      // the dagger comes down from the high guard to the waist while waiting
      const a = R * k;
      const to = (n: VRMHumanBoneName, x: number, y: number, z: number) => {
        const r = b(n)?.rotation;
        if (r) r.set(r.x + (x - r.x) * a, r.y + (y - r.y) * a, r.z + (z - r.z) * a);
      };
      to('rightUpperArm', READY_ARMS.rU[0], 0, READY_ARMS.rU[1]);
      to('rightLowerArm', 0, READY_ARMS.rL, 0);
      to('leftUpperArm', READY_ARMS.lU[0], 0, READY_ARMS.lU[1]);
      to('leftLowerArm', 0, READY_ARMS.lL, 0);
    }
    nudge('rightUpperArm', 0.06 * dip, 0, 0, R * loose);
    nudge('leftUpperArm', 0.06 * dip, 0, 0, R * loose);
    // drop the hips by what the bent legs lose in height, so the feet stay on the ground
    const front = (Math.cos(fa) + Math.cos(fk - fa)) / 2;
    const back = (Math.cos(ba) + Math.cos(ba + bk)) / 2;
    rig.body.position.y -= legLen * (1 - (front + back) / 2) * R;
    shiftBody(0.05 * sway * R);
  }

  if (g > 0) {
    // the deep guard only lasts while an attack plays; between attacks the light ready stance above takes over
    for (const [n, v] of Object.entries(GUARD) as [VRMHumanBoneName, V3][]) {
      const r = b(n)?.rotation;
      if (r) r.set(r.x + v[0] * g, r.y + v[1] * g, r.z + v[2] * g);
    }
    rig.body.position.y -= 0.13 * g;
  }
  if (perform > 0 && !s.moving) {
    // buff skills: stand and play / sing
    const w = perform;
    const add = (n: VRMHumanBoneName, x: number, y: number, z: number) => {
      const r = b(n)?.rotation;
      if (r) r.set(r.x + x * w, r.y + y * w, r.z + z * w);
    };
    if (clsKey === 'singer') {
      // mic up at the mouth, free arm thrown out wide, head back, swaying with the song
      const sway = Math.sin(t * 3);
      set('rightUpperArm', -1.05 * w + (1 - w) * b('rightUpperArm')!.rotation.x, -0.35 * w, 0.75 * w + (1 - w) * b('rightUpperArm')!.rotation.z);
      set('rightLowerArm', 0, 2.25 * w + (1 - w) * b('rightLowerArm')!.rotation.y, 0);
      set('leftUpperArm', -0.9 * w, -0.35 * w, (-0.35 + Math.sin(t * 2.2) * 0.12) * w + (1 - w) * b('leftUpperArm')!.rotation.z);
      set('leftLowerArm', 0, -0.25 * w, 0);
      add('spine', -0.12, sway * 0.12, sway * 0.05);
      add('chest', -0.08, 0, 0);
      add('head', -0.3, -sway * 0.1, 0);
      add('leftUpperLeg', -0.15, 0, -0.08);
      add('rightUpperLeg', 0.1, 0, 0.08);
    } else {
      // rocking out: lean back, nod to the beat, knees bouncing
      const beat = Math.abs(Math.sin(t * 5.5));
      add('spine', -0.12 + beat * 0.06, 0.15, 0);
      add('head', 0.1 + beat * 0.3, 0, 0);
      add('leftUpperLeg', -0.3, 0, -0.18);
      add('leftLowerLeg', 0.35, 0, 0);
      add('rightUpperLeg', 0.15, 0, 0.18);
      add('rightLowerLeg', 0.25, 0, 0);
      rig.body.position.y -= (0.04 + beat * 0.04) * w;
    }
  }
  let blade: { h: THREE.Vector3; d: THREE.Vector3 } | null = null;
  if (s.attack > 0 && moves) {
    // the class's attack moves, one per attack (Teen dagger combo, drummer sticks, instrument swings, mic throw)
    const move = moves.moves[(s.combo ?? 0) % moves.moves.length];
    const p = 1 - s.attack; // 0 -> 1 over the attack
    const lo = [...move].reverse().find((key) => key.at <= p);
    const hi = move.find((key) => key.at > p);
    const f0 = lo?.at ?? 0;
    const f1 = hi?.at ?? 1;
    const w = THREE.MathUtils.smoothstep(p, f0, f1);
    for (const n of MOVE_BONES) {
      const r = b(n)?.rotation;
      if (!r) continue;
      const base = [r.x, r.y, r.z];
      const a = lo?.bones[n] ?? base;
      const c = hi?.bones[n] ?? base;
      r.set(a[0] + (c[0] - a[0]) * w, a[1] + (c[1] - a[1]) * w, a[2] + (c[2] - a[2]) * w);
    }
    const dy0 = lo?.dy ?? 0, dy1 = hi?.dy ?? 0, dz0 = lo?.dz ?? 0, dz1 = hi?.dz ?? 0;
    rig.body.position.y += dy0 + (dy1 - dy0) * w;
    rig.body.position.z += dz0 + (dz1 - dz0) * w;
    const b0 = lo?.blade ?? hi?.blade, b1 = hi?.blade ?? lo?.blade;
    if (b0 && b1) {
      blade = {
        h: new THREE.Vector3(...b0.h).lerp(_bh.set(...b1.h), w),
        d: new THREE.Vector3(...b0.d).normalize().lerp(_bh.set(...b1.d).normalize(), w).normalize(),
      };
    }
  } else if (s.attack > 0) {
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

  rig.root.userData.bladeDir = undefined;
  rig.root.userData.bladeHilt = undefined;
  if (gear && blade && swingW > 0) {
    // both hands on the neck: the left fist closed over it by the headstock, the right hand palm up under it
    // halfway down; elbows bend down and out
    rig.root.updateMatrixWorld(true);
    const GRIP_BONES = [...ARM_BONES, 'leftHand', 'rightHand'] as VRMHumanBoneName[];
    const before = GRIP_BONES.map((n) => b(n)?.quaternion.clone());
    const toW = (v: THREE.Vector3) => rig.body.localToWorld(v.clone());
    const o = toW(new THREE.Vector3());
    const dirW = toW(blade.d).sub(o).normalize();
    const upW = toW(new THREE.Vector3(0, 1, 0)).sub(o).normalize();
    // across the neck, towards the character's left
    const side = toW(new THREE.Vector3(1, 0, 0)).sub(o);
    side.addScaledVector(dirW, -side.dot(dirW)).normalize();
    const neckL = toW(blade.h);
    const sw = gear.pieces.find((p) => p.swing);
    sw?.held.matrixWorld.decompose(_pb, _qa, _sa);
    const neckR = neckL.clone().addScaledVector(dirW, sw ? sw.swing!.userData.bladeGap * _sa.x : 0.2);
    // left: a fist closed round the neck from its outer side (the side you see), knuckles out, fingers wrapping
    // down and under it
    grip(vrm, 'left', neckL, upW.clone().negate(), dirW.clone().negate(), side, toW(new THREE.Vector3(0.6, 0.4, -0.1)), 0.6);
    // right: underhand, palm up, fingers curling up round the neck from the body side
    grip(vrm, 'right', neckR, side, dirW, upW, toW(new THREE.Vector3(-0.7, 0.5, -0.4)));
    if (swingW < 1) GRIP_BONES.forEach((n, i) => before[i] && b(n)?.quaternion.slerpQuaternions(before[i]!, b(n)!.quaternion, swingW));
    rig.root.userData.bladeDir = dirW;
    rig.root.userData.bladeHilt = neckL;
  }
  if (gear) {
    rig.root.updateMatrixWorld(true);
    for (const p of gear.pieces) {
      place(p, knife && !s.dead ? 1 : k);
      if (p.swing && swingW > 0) {
        p.obj.updateMatrixWorld(true);
        swingGrip(vrm, rig.root, p);
        place(p, swingW, p.held, p.swing, false);
      }
    }
    for (const o of gear.heldOnly) o.visible = k > 0.98 && swingW < 0.02;
    for (const o of gear.backOnly) o.visible = k < 0.02;
    // the singer's mic is in the air from the throw until the attack ends
    if (clsKey === 'singer' && armed) {
      const thrown = s.attack > 0 && 1 - s.attack > attackHit('singer', s.combo ?? 0) && s.attack > 0.06;
      for (const p of gear.pieces) p.obj.visible = !thrown;
    }
  }

  // instrument players: wrists go to the neck and over the strings, as far as the instrument has come round
  const ik = gear?.ik;
  if (ik && !s.dead && k > 0) {
    const a = s.attack > 0 && !moves ? Math.sin(s.attack * Math.PI) : 0;
    ik.left.position.copy(ik.restL);
    ik.right.position.copy(ik.restR);
    if (ik.play === 'strings') {
      // a hard strum while performing a buff skill
      ik.right.position.y += -0.05 * a + (s.moving ? 0 : Math.sin(t * (perform > 0 ? 22 : 9)) * (perform > 0 ? 0.04 * perform : 0.006));
      ik.left.position.x += perform > 0 ? Math.sin(t * 1.7) * 0.05 * perform : 0;
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
    // while swinging the instrument the arms follow the attack moves instead of the strings
    const ikW = k * (1 - swingW);
    if (ikW < 1) ARM_BONES.forEach((n, i) => before[i] && b(n)?.quaternion.slerpQuaternions(before[i]!, b(n)!.quaternion, ikW));
    const c = (v: number[]) => v.map((x) => x * Math.max(k * (1 - swingW), swingW));
    // two-handed guard: both hands closed tight round the neck
    const fist = rig.root.userData.bladeHilt ? [1.15, 1.25, 1.3, 1.35] : null;
    curl(vrm, 'left', c(fist ?? (keys ? [0.35, 0.4, 0.45, 0.5] : [1.0, 1.1, 1.15, 1.2])), v0);
    curl(vrm, 'right', c(fist ?? (keys ? [0.35, 0.4, 0.45, 0.5] : [0.55, 0.7, 0.9, 1.0])), v0);
  } else if (ik) {
    curl(vrm, 'left', [0, 0, 0, 0], v0);
    curl(vrm, 'right', [0, 0, 0, 0], v0);
  } else if (knife || (clsKey === 'drummer' && armed && k > 0)) {
    curl(vrm, 'right', s.dead ? [0, 0, 0, 0] : [1.1, 1.2, 1.25, 1.3], v0); // a fist round the grip
    if (clsKey === 'drummer') curl(vrm, 'left', s.dead ? [0, 0, 0, 0] : [1.1, 1.2, 1.25, 1.3], v0);
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
