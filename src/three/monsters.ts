import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MONSTERS } from '../data';
import type { MonsterRig } from './models';
import { toon } from './toon';
import { track } from '../ui/loadProgress';

/**
 * Rigged, animated monsters by Quaternius (Ultimate Monsters, CC0), packed as gzipped GLB in
 * public/models/monsters/. Each one replaces the code-drawn body of its monster once loaded,
 * so the hit cylinder, label and server data stay the same. The models face +Z.
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/monsters/`;
const loader = new GLTFLoader();
const cache = new Map<string, Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[] } | null>>();

async function gunzip(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

function load(model: string) {
  if (!cache.has(model)) {
    cache.set(model, track((async () => {
      try {
        const res = await fetch(`${BASE}${model}.glb.gz`);
        if (!res.ok) return null;
        const gltf = await loader.parseAsync(await gunzip(await res.arrayBuffer()), BASE);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const src = m.material as THREE.MeshStandardMaterial;
          // the world is cel-shaded: keep the atlas colours, toon bands
          m.material = toon(0xffffff, { map: src.map ?? undefined });
          m.castShadow = true;
          m.frustumCulled = false; // skinned bounds don't follow the animation
        });
        return { scene: gltf.scene, clips: gltf.animations };
      } catch (e) {
        console.warn('monster model failed', model, e);
        return null;
      }
    })()));
  }
  return cache.get(model)!;
}

/** Starts loading every model a map needs, so they pop in together. */
export function preloadMonsters(keys: Iterable<string>) {
  for (const k of keys) {
    const model = MONSTERS[k]?.model;
    if (model) void load(model);
  }
}

type Clip = 'idle' | 'move' | 'attack' | 'hit' | 'death';
const PICK: Record<Clip, RegExp> = {
  idle: /^(Flying_)?Idle$/,
  move: /^(Walk|Fast_Flying)$/,
  attack: /^(Bite_Front|Punch|Headbutt)$/,
  hit: /^Hit(Recieve|React)$/,
  death: /^Death$/,
};

export class MonsterAnim {
  private actions: Partial<Record<Clip, THREE.AnimationAction>> = {};
  private base: Clip = 'idle';
  private cur?: THREE.AnimationAction;
  private busy = 0; // seconds left of a one-shot
  readonly mixer: THREE.AnimationMixer;

  constructor(obj: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(obj);
    for (const k of Object.keys(PICK) as Clip[]) {
      const c = clips.find((c) => PICK[k].test(c.name)) ?? (k === 'move' ? clips.find((c) => c.name === 'Run') : undefined);
      if (c) this.actions[k] = this.mixer.clipAction(c);
    }
    this.play('idle', true);
  }

  private play(k: Clip, loop: boolean, fade = 0.18) {
    const a = this.actions[k];
    if (!a || a === this.cur) return;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.play();
    if (this.cur) a.crossFadeFrom(this.cur, fade, false);
    this.cur = a;
    if (!loop) this.busy = a.getClip().duration / a.timeScale;
  }

  /** One-shot reactions; a death cannot be interrupted. */
  attack() {
    if (this.base !== 'death') this.play('attack', false, 0.08);
  }
  hit() {
    if (this.base !== 'death' && this.busy <= 0) this.play('hit', false, 0.06);
  }
  die() {
    this.base = 'death';
    this.busy = 0;
    this.cur = undefined;
    this.mixer.stopAllAction();
    this.play('death', false, 0);
  }
  revive() {
    this.base = 'idle';
    this.cur = undefined;
    this.mixer.stopAllAction();
    this.play('idle', true, 0);
  }

  update(dt: number, moving: boolean) {
    if (this.base !== 'death') {
      this.base = moving ? 'move' : 'idle';
      if (this.busy > 0) this.busy -= dt;
      if (this.busy <= 0) this.play(this.base, true);
    }
    this.mixer.update(dt);
  }
}

/**
 * Swaps the code-drawn body of `rig` for the monster's model when it arrives. Resolves to the
 * animation driver, or null if the monster has no model (or the rig was dropped meanwhile).
 */
export async function upgradeMonster(rig: MonsterRig, key: string, alive: () => boolean) {
  const def = MONSTERS[key];
  if (!def?.model) return null;
  const src = await load(def.model);
  if (!src || !alive()) return null;
  const obj = clone(src.scene);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const flying = def.model.startsWith('Flying_');
  // as tall as the old body (bosses get their size from the data), never a speck
  const want = Math.max(0.7, def.size * (def.model.startsWith('Big_') ? 1.25 : 1.0));
  const s = want / Math.max(size.y, 1e-3);
  obj.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, -box.min.y * s + (flying ? 0.25 * def.size : 0), -c.z * s);

  const body = new THREE.Group();
  body.add(obj);
  const crown = rig.body.getObjectByName('crown');
  const top = obj.position.y + size.y * s;
  if (crown) {
    crown.position.set(0, top - 0.04, 0);
    crown.scale.setScalar(Math.max(1, want / 1.6));
    body.add(crown);
  }
  const root = rig.root;
  const i = root.children.indexOf(rig.body);
  root.remove(rig.body);
  root.add(body);
  // lunge() moves the first child, so the new body takes the old one's place
  root.children.splice(root.children.indexOf(body), 1);
  root.children.splice(Math.max(0, i), 0, body);
  rig.body = body;
  rig.height = top + (crown ? 0.3 : 0);
  return new MonsterAnim(obj, src.clips);
}
