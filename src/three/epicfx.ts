import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture } from './toon';

/**
 * The "grand" layer on top of every class's own skill effects (2026-11-15): flashes of real light on the
 * ground and the characters, lens flares with a wide streak, shock rings, light shafts out of the sky, a dark
 * blast mark that makes the glow stand out on bright ground, and showers of the class's own motif (gold stars
 * for the singer, embers for the guitarist, purple lightning shards for the drummer, emerald hexagons for the
 * bassist, ice-blue crystals for the keyboardist, neon squares for the DJ). The desktop also
 * blooms the bright parts of the picture while a skill is going off (World3D, `glow`).
 *
 * Particles of one burst are a single THREE.Points (one draw call); phones get fewer of them, no lights and
 * no bloom.
 */

type Effect = (dt: number) => boolean;
export type Motif = 'star' | 'ember' | 'shard' | 'hex' | 'crystal' | 'neon';

export interface Palette {
  /** White-hot centre. */
  core: number;
  /** The class colour. */
  glow: number;
  /** A second colour mixed into the particles. */
  accent: number;
  motif: Motif;
}

export const EPIC: Record<string, Palette> = {
  singer: { core: 0xfff6d0, glow: 0xffc22e, accent: 0xff7ac0, motif: 'star' },
  guitarist: { core: 0xffe0b0, glow: 0xff2a10, accent: 0xff9a1a, motif: 'ember' },
  drummer: { core: 0xf3e0ff, glow: 0xa23cff, accent: 0xff4fd8, motif: 'shard' },
  bassist: { core: 0xe0fff0, glow: 0x16e07a, accent: 0xa8ff3a, motif: 'hex' },
  keyboardist: { core: 0xe8f8ff, glow: 0x34cfff, accent: 0x8f86ff, motif: 'crystal' },
  dj: { core: 0xffffff, glow: 0x9a6dff, accent: 0x29f0ff, motif: 'neon' },
};

/** The DJ's club colours: each laser and neon square takes one. */
const NEON = [0xff2bd6, 0x29f0ff, 0x9dff2a, 0xffe02a, 0x9a6dff];

export interface EpicCtx {
  scene: THREE.Scene;
  add: (e: Effect) => void;
  /** Ask for a light at a point for a moment (desktop pool of point lights). */
  light?: (at: THREE.Vector3, color: number, power: number, ms: number) => void;
  /** Bloom the picture for a moment (desktop). */
  glow?: (amount: number) => void;
  /** A coloured flash over the whole screen (your own big skills only). */
  flash?: (color: number, amount: number) => void;
  shake?: (amp: number) => void;
}

const Q = PHONE ? 0.45 : 1;
const tex: Record<string, THREE.Texture> = {};

function T(key: string, size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  return (tex[key] ??= canvasTexture(size, size, (c) => draw(c, size)));
}

/** A star-shaped lens flare: soft glow, four long spikes and four short ones. */
function flareTex() {
  return T('flare', 256, (c, s) => {
    const h = s / 2;
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.translate(h, h);
    for (let i = 0; i < 8; i++) {
      const long = i % 2 === 0;
      const L = long ? h : h * 0.55;
      const W = long ? 7 : 4;
      const sg = c.createLinearGradient(0, 0, 0, -L);
      sg.addColorStop(0, 'rgba(255,255,255,1)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = sg;
      c.beginPath();
      c.moveTo(-W, 0);
      c.lineTo(0, -L);
      c.lineTo(W, 0);
      c.closePath();
      c.fill();
      c.rotate(Math.PI / 4);
    }
  });
}

/** A wide anamorphic streak: bright in the middle, fading out to both sides. */
function streakTex() {
  return T('streak', 256, (c, s) => {
    const g = c.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    for (let y = 0; y < s; y++) {
      const k = Math.exp(-(((y - s / 2) / (s * 0.07)) ** 2));
      c.globalAlpha = k;
      c.fillRect(0, y, s, 1);
    }
  });
}

/** A soft ring with a bright inner edge (shock waves). */
function ringTex() {
  return T('ring', 256, (c, s) => {
    const h = s / 2;
    const g = c.createRadialGradient(h, h, h * 0.55, h, h, h);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.82, 'rgba(255,255,255,1)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** A round glow (ground light pool). */
function glowTex() {
  return T('glow', 128, (c, s) => {
    const h = s / 2;
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

/** A dark blast mark: soft, with ragged rays (drawn with normal blending so the glow stands out on light ground). */
function scorchTex() {
  return T('scorch', 256, (c, s) => {
    const h = s / 2;
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, 'rgba(0,0,0,0.85)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
    c.translate(h, h);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 14; i++) {
      c.rotate((Math.PI * 2) / 14 + Math.sin(i * 7.1) * 0.2);
      const L = h * (0.6 + ((i * 37) % 10) / 25);
      c.beginPath();
      c.moveTo(-6, 0);
      c.lineTo(0, -L);
      c.lineTo(6, 0);
      c.fill();
    }
  });
}

/** A light shaft: bright at the bottom, fading up, soft at the sides. */
function shaftTex() {
  return T('shaft', 128, (c, s) => {
    for (let x = 0; x < s; x++) {
      const k = Math.sin((x / (s - 1)) * Math.PI) ** 2;
      const g = c.createLinearGradient(0, s, 0, 0);
      g.addColorStop(0, `rgba(255,255,255,${k})`);
      g.addColorStop(0.5, `rgba(255,255,255,${k * 0.45})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(x, 0, 1, s);
    }
  });
}

/** The class motif drawn white with a glow (tinted per particle). */
function motifTex(m: Motif) {
  return T(`m-${m}`, 64, (c, s) => {
    const h = s / 2;
    const halo = c.createRadialGradient(h, h, 0, h, h, h);
    halo.addColorStop(0, 'rgba(255,255,255,0.55)');
    halo.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = halo;
    c.fillRect(0, 0, s, s);
    c.translate(h, h);
    c.fillStyle = '#fff';
    c.beginPath();
    if (m === 'star') {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 7 : 18;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
    } else if (m === 'ember') {
      // a flame tongue
      c.moveTo(0, -20);
      c.bezierCurveTo(9, -6, 13, 6, 0, 16);
      c.bezierCurveTo(-13, 6, -9, -6, 0, -20);
    } else if (m === 'shard') {
      // a zig-zag lightning shard
      c.moveTo(4, -22);
      c.lineTo(-7, 2);
      c.lineTo(1, 2);
      c.lineTo(-5, 22);
      c.lineTo(9, -4);
      c.lineTo(1, -4);
      c.closePath();
    } else if (m === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.lineTo(Math.cos(a) * 15, Math.sin(a) * 15);
      }
      c.closePath();
      c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.lineTo(Math.cos(a) * 8, Math.sin(a) * 8);
      }
    } else if (m === 'crystal') {
      c.moveTo(0, -22);
      c.lineTo(8, 0);
      c.lineTo(0, 22);
      c.lineTo(-8, 0);
    } else {
      c.rect(-11, -11, 22, 22);
    }
    c.closePath();
    c.fill();
    c.globalCompositeOperation = 'source-over';
  });
}

function add(mat: THREE.Material) {
  mat.transparent = true;
  mat.depthWrite = false;
  return mat;
}

function sprite(t: THREE.Texture, color: number, blending: THREE.Blending = THREE.AdditiveBlending) {
  return new THREE.Sprite(add(new THREE.SpriteMaterial({ map: t, color, blending, depthTest: true })) as THREE.SpriteMaterial);
}

function flat(t: THREE.Texture, size: number, color: number, blending: THREE.Blending = THREE.AdditiveBlending) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), add(new THREE.MeshBasicMaterial({ map: t, color, blending, side: THREE.DoubleSide })));
  m.rotation.x = -Math.PI / 2;
  return m;
}

function kill(scene: THREE.Scene, ...objs: THREE.Object3D[]) {
  for (const o of objs) {
    scene.remove(o);
    o.traverse((x) => {
      const any = x as THREE.Mesh;
      if (any.geometry && !(x instanceof THREE.Sprite)) any.geometry.dispose();
      const mat = any.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose());
      else mat?.dispose();
    });
  }
}

const ease = (t: number) => 1 - (1 - t) ** 3;

/** A colour for particle i: mostly the class colour, some accent, a few white-hot (DJ: the club colours). */
function particleColor(p: Palette, i: number) {
  if (p.motif === 'neon') return new THREE.Color(NEON[i % NEON.length]);
  const r = (i * 0.618) % 1;
  return new THREE.Color(r < 0.5 ? p.glow : r < 0.82 ? p.accent : p.core);
}

/**
 * A shower of motif particles. `mode`: 'out' bursts from the point and falls back, 'up' rises and drifts,
 * 'in' starts on a ring and is pulled into the centre (charging).
 */
export function motifBurst(ctx: EpicCtx, at: THREE.Vector3, p: Palette, count: number, opts: { mode?: 'out' | 'up' | 'in'; speed?: number; size?: number; life?: number; radius?: number } = {}) {
  const n = Math.max(4, Math.round(count * Q));
  const mode = opts.mode ?? 'out';
  const speed = opts.speed ?? 5;
  const life = opts.life ?? 1.1;
  const radius = opts.radius ?? 1.6;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const base: THREE.Color[] = [];
  const vel: THREE.Vector3[] = [];
  const start: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    let s: THREE.Vector3;
    let v: THREE.Vector3;
    if (mode === 'in') {
      const r = radius * (0.7 + Math.random() * 0.5);
      s = new THREE.Vector3(at.x + Math.cos(a) * r, at.y + Math.random() * 2.2, at.z + Math.sin(a) * r);
      v = new THREE.Vector3();
    } else if (mode === 'up') {
      const r = Math.random() * radius;
      s = new THREE.Vector3(at.x + Math.cos(a) * r, at.y + Math.random() * 0.4, at.z + Math.sin(a) * r);
      v = new THREE.Vector3(Math.cos(a) * 0.4, speed * (0.4 + Math.random() * 0.8), Math.sin(a) * 0.4);
    } else {
      const up = 0.25 + Math.random() * 0.9;
      const sp = speed * (0.45 + Math.random() * 0.75);
      s = at.clone();
      v = new THREE.Vector3(Math.cos(a) * sp, up * sp, Math.sin(a) * sp);
    }
    start.push(s);
    vel.push(v);
    pos.set([s.x, s.y, s.z], i * 3);
    const c = particleColor(p, i);
    base.push(c);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = add(new THREE.PointsMaterial({ map: motifTex(p.motif), size: (opts.size ?? 0.42) * (PHONE ? 1.25 : 1), vertexColors: true, blending: THREE.AdditiveBlending, sizeAttenuation: true })) as THREE.PointsMaterial;
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  const ttl = start.map(() => life * (0.6 + Math.random() * 0.6));
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    let alive = false;
    for (let i = 0; i < n; i++) {
      const k = Math.min(1, t / ttl[i]);
      if (k < 1) alive = true;
      if (mode === 'in') {
        const e = ease(k);
        pos[i * 3] = THREE.MathUtils.lerp(start[i].x, at.x, e);
        pos[i * 3 + 1] = THREE.MathUtils.lerp(start[i].y, at.y + 0.9, e);
        pos[i * 3 + 2] = THREE.MathUtils.lerp(start[i].z, at.z, e);
      } else {
        const v = vel[i];
        if (mode === 'out') v.y -= 9 * dt;
        v.multiplyScalar(1 - Math.min(0.9, dt * (mode === 'out' ? 1.6 : 0.6)));
        pos[i * 3] += v.x * dt;
        pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + v.y * dt);
        pos[i * 3 + 2] += v.z * dt;
      }
      // twinkle out (additive: darker = more transparent)
      const fade = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * (0.75 + 0.25 * Math.sin(t * 30 + i));
      col[i * 3] = base[i].r * fade;
      col[i * 3 + 1] = base[i].g * fade;
      col[i * 3 + 2] = base[i].b * fade;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    if (!alive) kill(ctx.scene, pts);
    return alive;
  });
}

/** A ring of light rolling out along the ground. */
export function shockRing(ctx: EpicCtx, at: THREE.Vector3, color: number, radius: number, ms = 520, delay = 0) {
  const ring = flat(ringTex(), 1, color);
  ring.position.set(at.x, 0.07, at.z);
  ring.visible = false;
  ctx.scene.add(ring);
  let t = -delay / 1000;
  const life = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    if (t < 0) return true;
    ring.visible = true;
    const k = Math.min(1, t / life);
    ring.scale.setScalar(0.3 + ease(k) * radius * 2);
    (ring.material as THREE.MeshBasicMaterial).opacity = (1 - k) ** 1.4;
    if (k >= 1) kill(ctx.scene, ring);
    return k < 1;
  });
}

/** A lens flare (star + wide streak) at a point. */
export function flare(ctx: EpicCtx, at: THREE.Vector3, p: Palette, size: number, ms = 420) {
  const star = sprite(flareTex(), p.core);
  const halo = sprite(glowTex(), p.glow);
  const streak = sprite(streakTex(), p.glow);
  star.position.copy(at);
  halo.position.copy(at);
  streak.position.copy(at);
  ctx.scene.add(halo, star, streak);
  let t = 0;
  const life = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / life);
    const pop = k < 0.12 ? k / 0.12 : 1 - ease((k - 0.12) / 0.88);
    star.scale.setScalar(size * (0.6 + pop * 0.8));
    (star.material as THREE.SpriteMaterial).rotation = t * 1.4;
    halo.scale.setScalar(size * 1.1 * (0.7 + k * 0.6));
    streak.scale.set(size * 5 * (0.6 + k * 0.7), size * 0.55, 1);
    (star.material as THREE.SpriteMaterial).opacity = pop;
    (halo.material as THREE.SpriteMaterial).opacity = pop * 0.7;
    (streak.material as THREE.SpriteMaterial).opacity = pop * 0.9;
    if (k >= 1) kill(ctx.scene, star, halo, streak);
    return k < 1;
  });
}

/** Shafts of light out of the sky over a point, fanned round it. */
export function lightShafts(ctx: EpicCtx, at: THREE.Vector3, p: Palette, radius: number, ms = 900, n = 5) {
  const group = new THREE.Group();
  group.position.set(at.x, 0, at.z);
  const t0 = shaftTex();
  const shafts: THREE.Mesh[] = [];
  const count = Math.max(2, Math.round(n * (PHONE ? 0.6 : 1)));
  for (let i = 0; i < count; i++) {
    const w = (i === 0 ? 0.9 : 0.3 + Math.random() * 0.35) * radius;
    const h = 7 + Math.random() * 3;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    const color = p.motif === 'neon' && i > 0 ? NEON[i % NEON.length] : i === 0 ? p.core : p.glow;
    const m = new THREE.Mesh(geo, add(new THREE.MeshBasicMaterial({ map: t0, color, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    const a = (i / count) * Math.PI;
    m.rotation.y = a;
    if (i > 0) {
      // the thin ones lean out a little
      m.rotation.z = (Math.random() - 0.5) * 0.35;
      m.position.set(Math.cos(a) * radius * 0.3, 0, Math.sin(a) * radius * 0.3);
    }
    group.add(m);
    shafts.push(m);
  }
  ctx.scene.add(group);
  let t = 0;
  const life = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / life);
    const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
    group.rotation.y += dt * 0.6;
    shafts.forEach((m, i) => {
      (m.material as THREE.MeshBasicMaterial).opacity = a * (i === 0 ? 0.45 : 0.4);
      m.scale.x = 1 + (i === 0 ? 0 : Math.sin(t * 9 + i) * 0.15);
    });
    if (k >= 1) kill(ctx.scene, group);
    return k < 1;
  });
}

/** A soft pool of light on the ground over a dark blast mark. */
export function groundGlow(ctx: EpicCtx, at: THREE.Vector3, p: Palette, radius: number, ms = 1200, scorch = true) {
  const objs: THREE.Object3D[] = [];
  let mark: THREE.Mesh | undefined;
  if (scorch) {
    mark = flat(scorchTex(), radius * 2.4, 0xffffff, THREE.NormalBlending);
    mark.position.set(at.x, 0.045, at.z);
    mark.rotation.z = Math.random() * Math.PI * 2;
    objs.push(mark);
  }
  const pool = flat(glowTex(), radius * 2.6, p.glow);
  pool.position.set(at.x, 0.06, at.z);
  objs.push(pool);
  ctx.scene.add(...objs);
  let t = 0;
  const life = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / life);
    (pool.material as THREE.MeshBasicMaterial).opacity = (k < 0.1 ? k / 0.1 : 1 - (k - 0.1) / 0.9) * 0.6;
    if (mark) (mark.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (1 - k) * 2) * 0.55;
    if (k >= 1) kill(ctx.scene, ...objs);
    return k < 1;
  });
}

/** An upward spiral of light round a point (charging / buffs). */
export function spiral(ctx: EpicCtx, follow: () => THREE.Vector3, p: Palette, ms = 1200, radius = 0.9) {
  const strands = 3;
  const per = Math.round(26 * Q);
  const n = strands * per;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = add(new THREE.PointsMaterial({ map: motifTex(p.motif), size: 0.3, vertexColors: true, blending: THREE.AdditiveBlending, sizeAttenuation: true })) as THREE.PointsMaterial;
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  ctx.scene.add(pts);
  const colors = Array.from({ length: n }, (_, i) => particleColor(p, i));
  let t = 0;
  const life = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / life);
    const c = follow();
    const a = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.7) / 0.3);
    for (let s = 0; s < strands; s++) {
      for (let j = 0; j < per; j++) {
        const i = s * per + j;
        const u = ((j / per + t * 0.9) % 1);
        const ang = u * Math.PI * 4 + (s / strands) * Math.PI * 2 + t * 3;
        const r = radius * (1 - u * 0.55);
        pos[i * 3] = c.x + Math.cos(ang) * r;
        pos[i * 3 + 1] = c.y + u * 3;
        pos[i * 3 + 2] = c.z + Math.sin(ang) * r;
        const f = a * Math.sin(u * Math.PI);
        col[i * 3] = colors[i].r * f;
        col[i * 3 + 1] = colors[i].g * f;
        col[i * 3 + 2] = colors[i].b * f;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    if (k >= 1) kill(ctx.scene, pts);
    return k < 1;
  });
}

// ------------------------------------------------------------ the three moments of a skill

/** The moment a skill is let go: light under the caster, a spiral and a burst of the motif. */
export function epicCast(ctx: EpicCtx, follow: () => THREE.Vector3, p: Palette, big = true) {
  const at = follow();
  groundGlow(ctx, at, p, 1.3, 900, false);
  shockRing(ctx, at, p.glow, 1.8, 480);
  spiral(ctx, follow, p, 1000, 0.95);
  motifBurst(ctx, at.clone().setY(0.4), p, 18, { mode: 'up', speed: 2.6, radius: 0.9, life: 1.2, size: 0.34 });
  ctx.light?.(at.clone().setY(1.3), p.glow, big ? 5 : 3, 380);
  ctx.glow?.(big ? 0.6 : 0.35);
}

/**
 * A hit landing. power 0..1: small hits only flare and spray, the last / big ones add the shock rings, the
 * light shafts, the blast mark, a screen flash and the bloom.
 */
export function epicImpact(ctx: EpicCtx, at: THREE.Vector3, p: Palette, power: number) {
  const big = power >= 0.7;
  const pt = at.clone();
  flare(ctx, pt, p, 0.9 + power * 1.6, big ? 520 : 300);
  motifBurst(ctx, pt, p, 8 + power * 26, { mode: 'out', speed: 3 + power * 4, size: 0.3 + power * 0.18, life: 0.7 + power * 0.6 });
  shockRing(ctx, pt, p.glow, 0.8 + power * 2.4, 380 + power * 300);
  ctx.light?.(pt.clone().setY(pt.y + 0.6), p.glow, 2 + power * 7, 160 + power * 380);
  if (big) {
    shockRing(ctx, pt, p.core, 1.5 + power * 1.8, 520, 90);
    groundGlow(ctx, pt, p, 1 + power * 1.2, 1400);
    lightShafts(ctx, pt, p, 1.2 + power * 0.6, 950);
    motifBurst(ctx, pt.clone().setY(0.1), p, 16, { mode: 'up', speed: 2, radius: 1.4, life: 1.6, size: 0.3 });
    ctx.flash?.(p.glow, 0.28 * power);
    ctx.shake?.(0.12 + power * 0.18);
  }
  ctx.glow?.(0.45 + power * 0.55);
}

/** A buff or a heal settling on someone: shafts from above, a spiral, a ring and a rain of the motif. */
export function epicBless(ctx: EpicCtx, follow: () => THREE.Vector3, p: Palette) {
  const at = follow();
  lightShafts(ctx, at, p, 1.1, 1300, 4);
  spiral(ctx, follow, p, 1500, 1.1);
  shockRing(ctx, at, p.glow, 2, 600);
  shockRing(ctx, at, p.core, 1.3, 600, 150);
  groundGlow(ctx, at, p, 1.2, 1500, false);
  motifBurst(ctx, at.clone().setY(0.2), p, 22, { mode: 'up', speed: 1.8, radius: 1, life: 1.8, size: 0.32 });
  ctx.light?.(at.clone().setY(1.6), p.glow, 4, 600);
  ctx.glow?.(0.6);
}

/** Charging a long cast: the motif is pulled in from a ring round the caster, again and again. */
export function epicCharge(ctx: EpicCtx, follow: () => THREE.Vector3, p: Palette, ms: number, alive: () => boolean) {
  let t = 0;
  let next = 0;
  ctx.add((dt) => {
    t += dt;
    if (!alive() || t * 1000 > ms) return false;
    if (t >= next) {
      next = t + 0.5;
      motifBurst(ctx, follow(), p, 14, { mode: 'in', radius: 2.2, life: 0.55, size: 0.3 });
      ctx.glow?.(0.25);
    }
    return true;
  });
}
