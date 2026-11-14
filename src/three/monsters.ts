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
 * A model without animation clips (a sculpt from an AI generator, like the abyss reaper) is moved by PropAnim.
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
        const sculpt = !gltf.animations.length;
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const src = m.material as THREE.MeshStandardMaterial;
          // the world is cel-shaded: keep the atlas colours, toon bands
          const mat = toon(0xffffff, { map: src.map ?? undefined });
          if (sculpt && src.map) {
            // a sculpt's painted texture is its whole look: light it a little from within, so a tinted map
            // light (the purple abyss) doesn't drown its colours
            mat.color.setScalar(0.7);
            mat.emissive.setScalar(0.5);
            mat.emissiveMap = src.map;
          }
          m.material = mat;
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

/** What World3D drives a monster's model with: MonsterAnim (clips) or PropAnim (no clips). */
export type MonsterAnimator = Pick<MonsterAnim, 'attack' | 'hit' | 'die' | 'revive' | 'update'>;

/**
 * A model with no skeleton or clips: it sways and breathes in place, leans into its walk, rears back and swings
 * when it strikes, jolts when hit and topples backwards when it dies. Moves a pivot at its feet, never the body,
 * because World3D's lunge() moves the body.
 */
export class PropAnim {
  private t = Math.random() * 6;
  private lean = 0;
  private atk = 0; // seconds left of the strike
  private hurt = 0; // seconds left of the jolt
  private dead = -1; // 0..1 into the fall, -1 alive
  static readonly ATK = 0.5;
  static readonly HURT = 0.22;

  constructor(private pivot: THREE.Object3D) {}

  attack() {
    if (this.dead < 0) this.atk = PropAnim.ATK;
  }
  hit() {
    if (this.dead < 0 && this.atk <= 0) this.hurt = PropAnim.HURT;
  }
  die() {
    this.dead = 0;
    this.atk = this.hurt = 0;
  }
  revive() {
    this.dead = -1;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.scale.setScalar(1);
  }

  update(dt: number, moving: boolean) {
    const p = this.pivot;
    if (this.dead >= 0) {
      this.dead = Math.min(1, this.dead + dt * 1.8);
      const k = 1 - (1 - this.dead) ** 2;
      p.rotation.set(-1.2 * k, 0, 0.18 * k);
      p.scale.setScalar(1);
      return;
    }
    this.t += dt;
    const t = this.t;
    this.lean += ((moving ? 0.1 : 0) - this.lean) * Math.min(1, dt * 6);
    let rx = this.lean;
    let ry = Math.sin(t * 0.7) * 0.06;
    if (this.atk > 0) {
      this.atk = Math.max(0, this.atk - dt);
      const u = 1 - this.atk / PropAnim.ATK;
      // rear back for the first third, then swing through and settle
      rx += u < 0.35 ? -0.16 * Math.sin((u / 0.35) * Math.PI * 0.5) : -0.16 + 0.42 * Math.sin(((u - 0.35) / 0.65) * Math.PI);
      ry += Math.sin(u * Math.PI) * 0.25;
    }
    if (this.hurt > 0) {
      this.hurt = Math.max(0, this.hurt - dt);
      rx -= Math.sin((1 - this.hurt / PropAnim.HURT) * Math.PI) * 0.12;
    }
    p.rotation.set(rx, ry, Math.sin(t * 1.1) * 0.035);
    const breath = Math.sin(t * 2.2) * 0.012;
    p.scale.set(1 + breath, 1 - breath, 1 + breath);
  }
}

const recoloured = new Map<string, THREE.Material>();

/**
 * Several monsters share a model: recolour it. The texture's shading (its brightness) is kept and painted in the
 * tint, so a green blob becomes a lava-orange one rather than a muddy mix; `glow` adds a self-lit rim of colour.
 */
function recolour(obj: THREE.Object3D, key: string, tint?: string, glow?: string) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshToonMaterial;
    const id = `${key}:${src.uuid}`;
    let mat = recoloured.get(id) as THREE.MeshToonMaterial | undefined;
    if (!mat) {
      mat = src.clone();
      const tintC = new THREE.Color(tint ?? '#ffffff');
      const glowC = new THREE.Color(glow ?? '#000000');
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uTint = { value: tintC };
        sh.uniforms.uGlow = { value: glowC };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uTint; uniform vec3 uGlow;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            ${tint ? 'float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, uTint * clamp(0.25 + lum * 1.4, 0.0, 1.5), 0.75);' : ''}`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance += uGlow * 0.1;`);
      };
      mat.customProgramCacheKey = () => `monster-recolour-${tint ? 1 : 0}`;
      recoloured.set(id, mat);
    }
    m.material = mat;
  });
}

/**
 * Swaps the code-drawn body of `rig` for the monster's model when it arrives. Resolves to the
 * animation driver, or null if the monster has no model (or the rig was dropped meanwhile).
 */
export async function upgradeMonster(rig: MonsterRig, key: string, alive: () => boolean): Promise<MonsterAnimator | null> {
  const def = MONSTERS[key];
  if (!def?.model) return null;
  const src = await load(def.model);
  if (!src || !alive()) return null;
  const obj = clone(src.scene);
  // a sculpt keeps its own painted colours (its glow only colours its death burst)
  if (def.tint || (def.glow && src.clips.length)) recolour(obj, key, def.tint, def.glow);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const flying = def.model.startsWith('Flying_');
  // as tall as the old body (bosses get their size from the data), never a speck
  const want = Math.max(0.7, def.size * (def.modelScale ?? (def.model.startsWith('Big_') ? 1.25 : 1.0)));
  const s = want / Math.max(size.y, 1e-3);
  obj.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, -box.min.y * s + (flying ? 0.25 * def.size : 0), -c.z * s);

  const body = new THREE.Group();
  // a model without clips is moved by a pivot at its feet
  const pivot = src.clips.length ? null : new THREE.Group();
  if (pivot) {
    pivot.add(obj);
    body.add(pivot);
  } else body.add(obj);
  const crown = rig.body.getObjectByName('crown');
  const top = obj.position.y + box.max.y * s;
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
  return pivot ? new PropAnim(pivot) : new MonsterAnim(obj, src.clips);
}
