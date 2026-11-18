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
 * A model without animation clips (a sculpt from an AI generator) is moved by PropAnim. The abyss reaper is such a
 * sculpt (made with Meshy AI) given a skeleton and clips by tools/rig_reaper.mjs, so it plays like the others.
 * A model whose glTF scene has extras { selfLit } shows its painted texture partly self-lit (see load()).
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/monsters/`;
const loader = new GLTFLoader();
const cache = new Map<string, Promise<{ scene: THREE.Object3D; clips: THREE.AnimationClip[]; selfLit: number } | null>>();

async function gunzip(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

/** model -> how its monster moves (the sculpts share no model, so the first monster using it decides). */
const MODEL_MOVE = new Map<string, MoveStyle>();
function moveOf(model: string) {
  if (!MODEL_MOVE.size) for (const d of Object.values(MONSTERS)) if (d.model && d.move && !MODEL_MOVE.has(d.model)) MODEL_MOVE.set(d.model, d.move);
  return MODEL_MOVE.get(model);
}

function load(model: string) {
  moveOf(model);
  if (!cache.has(model)) {
    cache.set(model, track((async () => {
      try {
        const res = await fetch(`${BASE}${model}.glb.gz`);
        if (!res.ok) return null;
        const gltf = await loader.parseAsync(await gunzip(await res.arrayBuffer()), BASE);
        // a sculpt's painted texture is its whole look: light it a little from within, so a tinted map light (the
        // purple abyss) doesn't drown its colours. Set by the model (scene extras), else on for models without clips.
        const selfLit = Number(gltf.scene.userData.selfLit ?? (gltf.animations.length ? 0 : 0.5)) || 0;
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const src = m.material as THREE.MeshStandardMaterial;
          // the world is cel-shaded: keep the atlas colours, toon bands
          const mat = toon(0xffffff, { map: src.map ?? undefined });
          if (selfLit && src.map) {
            mat.color.setScalar(1 - selfLit * 0.6);
            mat.emissive.setScalar(selfLit);
            mat.emissiveMap = src.map;
          }
          const style = MODEL_MOVE.get(model);
          if (style && !gltf.animations.length) {
            m.geometry.computeBoundingBox();
            deform(mat, style, m.geometry.boundingBox!);
          }
          m.material = mat;
          m.castShadow = true;
          m.frustumCulled = false; // skinned bounds don't follow the animation
        });
        return { scene: gltf.scene, clips: gltf.animations, selfLit };
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

export type MoveStyle = 'hop' | 'walk' | 'fly' | 'float' | 'slither' | 'plant';

/**
 * A model with no skeleton or clips (the Meshy sculpts): moved by a pivot at its feet, never the body, because
 * World3D's lunge() moves the body. How it moves comes from the monster's `move`:
 * hop = slimes and blobs bounce with squash and stretch, walk = waddles side to side, fly = hovers with a quick
 * flutter (its wings flap in the shader, see deform()), float = drifts slowly (ghosts, fish, flames),
 * slither = stretches and wiggles along its length, plant = stays rooted and sways, snapping forward to bite.
 * Every style rears back and strikes, jolts when hit and falls (or melts, or sinks) when it dies.
 */
export class PropAnim {
  private t = Math.random() * 6;
  private lean = 0;
  private move = 0; // 0..1 eased "is walking"
  private atk = 0; // seconds left of the strike
  private hurt = 0; // seconds left of the jolt
  private dead = -1; // 0..1 into the fall, -1 alive
  static readonly ATK = 0.5;
  static readonly HURT = 0.22;

  /** `h` = the model's height in world units (hops and hovers scale with it). */
  constructor(private pivot: THREE.Object3D, private style: MoveStyle = 'walk', private h = 1) {}

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
    this.pivot.position.set(0, 0, 0);
    this.pivot.scale.setScalar(1);
  }

  update(dt: number, moving: boolean) {
    const p = this.pivot;
    const st = this.style;
    const h = this.h;
    if (this.dead >= 0) {
      this.dead = Math.min(1, this.dead + dt * 1.8);
      const k = 1 - (1 - this.dead) ** 2;
      if (st === 'hop') {
        // melts into a puddle
        p.rotation.set(0, 0, 0);
        p.scale.set(1 + 0.45 * k, 1 - 0.85 * k, 1 + 0.45 * k);
        p.position.y = 0;
      } else if (st === 'float' || st === 'fly') {
        // drops out of the air and tips over
        p.position.y = Math.max(-0.3 * h, p.position.y - dt * 2.5 * h);
        p.rotation.set(-1.0 * k, 0, 0.5 * k);
        p.scale.setScalar(1 - 0.25 * k);
      } else {
        p.rotation.set(-1.2 * k, 0, 0.18 * k);
        p.scale.setScalar(1);
        p.position.y = 0;
      }
      return;
    }
    this.t += dt;
    const t = this.t;
    this.move += ((moving ? 1 : 0) - this.move) * Math.min(1, dt * 6);
    const mv = this.move;
    let rx = 0, ry = Math.sin(t * 0.7) * 0.05, rz = 0, y = 0, sx = 1, sy = 1;
    if (st === 'hop') {
      // a hop every ~0.4 s while moving: up in an arc, squashed on landing, stretched at take-off
      const ph = (t * 2.6) % 1;
      const air = Math.sin(ph * Math.PI);
      y = air * 0.32 * h * mv;
      const squash = mv * (ph < 0.12 ? (1 - ph / 0.12) * 0.22 : ph > 0.88 ? ((ph - 0.88) / 0.12) * 0.22 : -air * 0.08);
      const idle = (1 - mv) * Math.sin(t * 2.4) * 0.05;
      sy = 1 - squash - idle;
      sx = 1 + squash * 0.7 + idle;
      rx = mv * 0.08;
    } else if (st === 'walk') {
      // waddle: sway side to side with each step, bob up on the stride
      rz = Math.sin(t * 9) * 0.1 * mv + Math.sin(t * 1.1) * 0.03 * (1 - mv);
      y = Math.abs(Math.sin(t * 9)) * 0.05 * h * mv;
      rx = 0.1 * mv;
      const breath = Math.sin(t * 2.2) * 0.015 * (1 - mv);
      sx = 1 + breath;
      sy = 1 - breath;
    } else if (st === 'fly') {
      y = (0.06 + Math.sin(t * 3.2) * 0.06 + Math.sin(t * 13) * 0.015) * h;
      rx = 0.22 * mv;
      rz = Math.sin(t * 1.7) * 0.08;
    } else if (st === 'float') {
      y = (0.05 + Math.sin(t * 1.6) * 0.06) * h;
      rx = 0.12 * mv;
      rz = Math.sin(t * 1.1) * 0.06;
      ry += Math.sin(t * 0.5) * 0.08;
    } else if (st === 'slither') {
      // a wave runs along it: stretch and squeeze, wiggle its heading
      const w = Math.sin(t * (4 + 4 * mv));
      p.scale.set(1 - w * 0.06, 1 + Math.sin(t * 1.5) * 0.02, 1 + w * 0.1);
      ry += w * (0.08 + 0.18 * mv);
      rz = w * 0.05;
    } else {
      // plant: rooted, sways from the base
      rz = Math.sin(t * 1.3) * 0.07 + Math.sin(t * 9) * 0.05 * mv;
      rx = Math.sin(t * 0.9) * 0.04;
      y = Math.abs(Math.sin(t * 7)) * 0.04 * h * mv;
    }
    if (this.atk > 0) {
      this.atk = Math.max(0, this.atk - dt);
      const u = 1 - this.atk / PropAnim.ATK;
      // rear back for the first third, then swing through and settle
      const swing = u < 0.35 ? -0.16 * Math.sin((u / 0.35) * Math.PI * 0.5) : -0.16 + 0.42 * Math.sin(((u - 0.35) / 0.65) * Math.PI);
      rx += st === 'plant' ? swing * 1.6 : swing;
      ry += Math.sin(u * Math.PI) * (st === 'hop' ? 0 : 0.25);
      if (st === 'hop') {
        // a body slam: crouch, then spring up and forward
        const k = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
        sy *= u < 0.35 ? 1 - 0.25 * k : 1 + 0.2 * k;
        sx *= u < 0.35 ? 1 + 0.2 * k : 1 - 0.1 * k;
        y += u < 0.35 ? 0 : Math.sin(((u - 0.35) / 0.65) * Math.PI) * 0.25 * h;
      }
    }
    if (this.hurt > 0) {
      this.hurt = Math.max(0, this.hurt - dt);
      const j = Math.sin((1 - this.hurt / PropAnim.HURT) * Math.PI);
      rx -= j * 0.14;
      sx *= 1 + j * 0.06;
      sy *= 1 - j * 0.08;
    }
    p.rotation.set(rx + this.lean, ry, rz);
    p.position.y = y;
    if (st !== 'slither') p.scale.set(sx, sy, sx);
  }
}

/** Shared clock of the shader-side motion (wings, hems), ticked by tickMonsterDeform(). */
const deformTime = { value: 0 };
export function tickMonsterDeform(t: number) {
  deformTime.value = t;
}

/**
 * Motion a pivot can't give, done in the vertex shader of a sculpt's material: a flier's wings (its far left and
 * right) flap up and down, a floater's lower half ripples like a cloak hem or tentacles. Each monster gets its own
 * phase from where it stands. The box is the model's own (unscaled) bounds.
 */
function deform(mat: THREE.Material, style: MoveStyle, box: THREE.Box3) {
  if (style !== 'fly' && style !== 'float') return;
  const half = Math.max(1e-3, (box.max.x - box.min.x) / 2);
  const cx = (box.max.x + box.min.x) / 2;
  const y0 = box.min.y;
  const hgt = Math.max(1e-3, box.max.y - box.min.y);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDefT = deformTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uDefT;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 1.3;
  ${style === 'fly'
    ? `float ax = abs(position.x - ${cx.toFixed(4)}) / ${half.toFixed(4)};
  float w = smoothstep(0.38, 1.0, ax);
  float flap = sin(uDefT * 15.0 + ph);
  transformed.y += flap * w * w * ${(half * 0.55).toFixed(4)};
  transformed.x -= sign(position.x - ${cx.toFixed(4)}) * abs(flap) * w * ${(half * 0.12).toFixed(4)};`
    : `float low = 1.0 - smoothstep(0.0, 0.55, (position.y - ${y0.toFixed(4)}) / ${hgt.toFixed(4)});
  transformed.x += sin(uDefT * 3.2 + ph + position.y * ${(9 / hgt).toFixed(3)}) * low * ${(half * 0.12).toFixed(4)};
  transformed.z += cos(uDefT * 2.6 + ph + position.x * ${(7 / half).toFixed(3)}) * low * ${(half * 0.08).toFixed(4)};`}
}`);
  };
  mat.customProgramCacheKey = () => `monster-deform-${style}-${half.toFixed(3)}-${cx.toFixed(3)}-${y0.toFixed(3)}-${hgt.toFixed(3)}`;
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
  // a self-lit sculpt keeps its own painted colours (its glow only colours its death burst)
  if (def.tint || (def.glow && !src.selfLit)) recolour(obj, key, def.tint, def.glow);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const flying = def.model.startsWith('Flying_') || def.move === 'fly' || def.move === 'float';
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
  return pivot ? new PropAnim(pivot, def.move ?? 'walk', want) : new MonsterAnim(obj, src.clips);
}
