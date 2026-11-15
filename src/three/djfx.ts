import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture, sparkTexture } from './toon';
import type { XSlashCtx } from './xslash';

/**
 * The DJ's spells (2026-11-15), violet with each spell's own element colour: a vinyl-record magic circle with an
 * equalizer ring, lightning (wind), meteors (fire), earth spikes, a blizzard (water), a wall of fire, falling fire
 * bolts and the booth's guarding circle. Monsters that are stunned get circling stars, frozen ones an ice block.
 * Dark layers use normal blending so they read on light ground; glow is additive.
 */

const Q = PHONE ? 0.5 : 1;
const TEX = PHONE ? 256 : 512;

export const DJ = { violet: 0x8f7dff, deep: 0x3a1e8a, magenta: 0xff38c8, cyan: 0x38e8ff, white: 0xf4f0ff };
/** Each spell's colour (its element). */
export const DJ_FX: Record<string, { color: number; glow: number }> = {
  dj_lightning: { color: 0x38e8ff, glow: 0xdff8ff },
  dj_meteor: { color: 0xff5a1f, glow: 0xffd27a },
  dj_spikes: { color: 0xb07a3a, glow: 0xffd9a0 },
  dj_blizzard: { color: 0x7fd6ff, glow: 0xe8faff },
  dj_firewall: { color: 0xff5a1f, glow: 0xffd27a },
  dj_firebolt: { color: 0xff4a1a, glow: 0xffe08a },
  dj_booth: { color: 0x8f7dff, glow: 0xe4dcff },
};

let circleTex: THREE.Texture | undefined;
let gridTex: THREE.Texture | undefined;
let boltTex: THREE.Texture | undefined;
let flameTex: THREE.Texture | undefined;
let snowTex: THREE.Texture | undefined;
let starTex: THREE.Texture | undefined;
let shockTex: THREE.Texture | undefined;

/** The DJ's circle: a vinyl record (grooves, label, spindle) inside a ring of equalizer bars. */
function circle() {
  return (circleTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 250);
    g.addColorStop(0, 'rgba(170,140,255,0.5)');
    g.addColorStop(0.7, 'rgba(60,20,160,0.35)');
    g.addColorStop(1, 'rgba(60,20,160,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 250, 0, Math.PI * 2);
    c.fill();
    // equalizer bars round the edge
    const bars = 64;
    for (let i = 0; i < bars; i++) {
      const a = (i / bars) * Math.PI * 2;
      const h = 14 + 26 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6));
      c.save();
      c.rotate(a);
      c.fillStyle = i % 2 ? 'rgba(255,90,210,0.95)' : 'rgba(120,230,255,0.95)';
      c.fillRect(-4, 196, 8, h);
      c.restore();
    }
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(240,230,255,0.95)';
    c.beginPath();
    c.arc(0, 0, 190, 0, Math.PI * 2);
    c.stroke();
    // the record: grooves
    c.fillStyle = 'rgba(20,10,40,0.75)';
    c.beginPath();
    c.arc(0, 0, 180, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 1.5;
    for (let r = 70; r < 178; r += 7) {
      c.strokeStyle = `rgba(190,170,255,${0.25 + 0.2 * Math.sin(r)})`;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    }
    // a light sweep across the grooves
    c.strokeStyle = 'rgba(255,255,255,0.55)';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(0, 0, 130, -0.5, 0.2);
    c.stroke();
    // label with a star and the spindle
    const lg = c.createRadialGradient(0, 0, 0, 0, 0, 62);
    lg.addColorStop(0, '#ffffff');
    lg.addColorStop(1, '#b45cff');
    c.fillStyle = lg;
    c.beginPath();
    c.arc(0, 0, 62, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(80,20,170,0.9)';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 18 : 44;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
    c.fillStyle = '#1a0f33';
    c.beginPath();
    c.arc(0, 0, 7, 0, Math.PI * 2);
    c.fill();
  }));
}

/** The 4x4 target area: sixteen glowing tiles. */
function grid() {
  return (gridTex ??= canvasTexture(256, 256, (c) => {
    for (let i = 0; i < 16; i++) {
      const x = (i % 4) * 64 + 3;
      const y = Math.floor(i / 4) * 64 + 3;
      const g = c.createRadialGradient(x + 29, y + 29, 3, x + 29, y + 29, 42);
      g.addColorStop(0, 'rgba(255,255,255,0.65)');
      g.addColorStop(1, 'rgba(255,255,255,0.12)');
      c.fillStyle = g;
      c.fillRect(x, y, 58, 58);
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      c.lineWidth = 3;
      c.strokeRect(x, y, 58, 58);
    }
  }));
}

/** A soft vertical streak (a falling bolt's tail, a pillar of light). */
function bolt() {
  return (boltTex ??= canvasTexture(64, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 256);
    const v = c.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(0,0,0,1)');
    v.addColorStop(0.25, 'rgba(0,0,0,0)');
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = v;
    c.fillRect(0, 0, 64, 256);
  }));
}

/** A tongue of flame. */
function flame() {
  return (flameTex ??= canvasTexture(128, 256, (c) => {
    const g = c.createRadialGradient(64, 190, 6, 64, 170, 120);
    g.addColorStop(0, 'rgba(255,255,220,1)');
    g.addColorStop(0.3, 'rgba(255,200,80,0.95)');
    g.addColorStop(0.65, 'rgba(255,90,20,0.7)');
    g.addColorStop(1, 'rgba(200,30,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(64, 4);
    c.bezierCurveTo(118, 90, 124, 200, 64, 252);
    c.bezierCurveTo(4, 200, 10, 90, 64, 4);
    c.fill();
  }));
}

function snow() {
  return (snowTex ??= canvasTexture(64, 64, (c) => {
    c.translate(32, 32);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 4;
    c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      c.rotate(Math.PI / 3);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -26);
      c.moveTo(0, -15);
      c.lineTo(-8, -22);
      c.moveTo(0, -15);
      c.lineTo(8, -22);
      c.stroke();
    }
  }));
}

function star() {
  return (starTex ??= canvasTexture(64, 64, (c) => {
    c.translate(32, 32);
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 11 : 30;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.fill();
  }));
}

function shock() {
  return (shockTex ??= canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 60, 128, 128, 126);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  }));
}

function groundPlane(tex: THREE.Texture, size: number, additive = false) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

function sprite(ctx: XSlashCtx, tex: THREE.Texture, color: number, additive: boolean) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  ctx.scene.add(s);
  return s;
}

function dispose(ctx: XSlashCtx, ...objs: THREE.Object3D[]) {
  for (const o of objs) {
    o.removeFromParent();
    o.traverse((x) => {
      const mesh = x as THREE.Mesh;
      (mesh.material as THREE.Material | undefined)?.dispose();
      if (!(x instanceof THREE.Sprite) && mesh.geometry) mesh.geometry.dispose();
    });
  }
  void ctx;
}

/** Run `f(t)` every frame for `sec` seconds after `delay`. */
function anim(ctx: XSlashCtx, sec: number, delay: number, f: (t: number, k: number, dt: number) => void, end: () => void) {
  let t = -delay;
  ctx.add((dt) => {
    t += dt;
    if (t < 0) return true;
    const k = Math.min(1, t / sec);
    f(t, k, dt);
    if (k >= 1) {
      end();
      return false;
    }
    return true;
  });
}

function flash(ctx: XSlashCtx, at: THREE.Vector3, size: number, color: number, sec: number, delay = 0) {
  const s = sprite(ctx, sparkTexture(), color, true);
  s.material.depthTest = false;
  s.renderOrder = 9;
  s.position.copy(at);
  s.visible = false;
  anim(ctx, sec, delay, (_t, k) => {
    s.visible = true;
    s.scale.setScalar(size * (0.5 + k * 0.8));
    s.material.opacity = 1 - k;
  }, () => dispose(ctx, s));
}

function ring(ctx: XSlashCtx, x: number, z: number, r: number, color: number, sec: number, delay = 0) {
  const m = groundPlane(shock(), 2, true);
  (m.material as THREE.MeshBasicMaterial).color.set(color);
  m.position.set(x, 0.09, z);
  m.visible = false;
  ctx.scene.add(m);
  anim(ctx, sec, delay, (_t, k) => {
    m.visible = true;
    m.scale.setScalar(0.2 + r * (1 - Math.pow(1 - k, 2.5)));
    (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
  }, () => dispose(ctx, m));
}

/** Bits flung out of `at` that fall back down (embers, rock chips, ice). */
function debris(ctx: XSlashCtx, at: THREE.Vector3, n: number, color: number, tex: THREE.Texture, size: number, power = 2.5, additive = true) {
  for (let i = 0; i < Math.max(2, Math.round(n * Q)); i++) {
    const s = sprite(ctx, tex, color, additive);
    s.position.copy(at);
    const a = Math.random() * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a) * power * (0.4 + Math.random()), 2 + Math.random() * power, Math.sin(a) * power * (0.4 + Math.random()));
    const sz = size * (0.6 + Math.random() * 0.6);
    anim(ctx, 0.7, 0, (_t, k, dt) => {
      v.y -= 9 * dt;
      s.position.addScaledVector(v, dt);
      if (s.position.y < 0.05) s.position.y = 0.05;
      s.scale.setScalar(sz * (1 - k * 0.6));
      s.material.opacity = 1 - k;
      s.material.rotation += dt * 6;
    }, () => dispose(ctx, s));
  }
}

// ------------------------------------------------------------ the circle (casting) and the target area

/** The DJ's record circle under the caster: spins up while the spell charges. */
export function djCircle(ctx: XSlashCtx, at: () => THREE.Vector3, r: number, ms: number, alive: () => boolean) {
  const m = groundPlane(circle(), r * 2);
  const glow = groundPlane(circle(), r * 2, true);
  (glow.material as THREE.MeshBasicMaterial).color.set(0xb89cff);
  ctx.scene.add(m, glow);
  let t = 0;
  let out = 0;
  ctx.add((dt) => {
    t += dt;
    if (!alive()) out += dt;
    const k = Math.min(1, (t * 1000) / Math.max(1, ms));
    const f = Math.min(1, t / 0.25) * Math.max(0, 1 - out / 0.3);
    const p = at();
    m.position.set(p.x, 0.05, p.z);
    glow.position.set(p.x, 0.06, p.z);
    m.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - Math.min(1, t / 0.3), 3)));
    glow.scale.copy(m.scale);
    m.rotation.z = -t * (1.5 + k * 9); // the record spins faster as the charge builds
    glow.rotation.z = m.rotation.z;
    (m.material as THREE.MeshBasicMaterial).opacity = 0.95 * f;
    (glow.material as THREE.MeshBasicMaterial).opacity = (0.2 + 0.4 * k) * f * (0.7 + 0.3 * Math.sin(t * 16));
    if (out >= 0.3) {
      dispose(ctx, m, glow);
      return false;
    }
    return true;
  });
}

/** The 3x3 area lighting up in the spell's colour while the DJ casts at it. */
export function djAreaCharge(ctx: XSlashCtx, fx: string, x: number, z: number, half: number, ms: number, alive: () => boolean) {
  const col = DJ_FX[fx]?.color ?? DJ.violet;
  const size = half * 2;
  const g = groundPlane(grid(), size, true);
  const gd = groundPlane(grid(), size);
  (g.material as THREE.MeshBasicMaterial).color.set(col);
  (gd.material as THREE.MeshBasicMaterial).color.set(DJ.deep);
  const c1 = groundPlane(circle(), size * 1.45);
  for (const o of [c1, gd, g]) o.position.set(x, 0.05, z);
  gd.position.y = 0.065;
  g.position.y = 0.075;
  ctx.scene.add(c1, gd, g);
  let t = 0;
  let out = 0;
  let spark = 0;
  ctx.add((dt) => {
    t += dt;
    if (!alive()) out += dt;
    const k = Math.min(1, (t * 1000) / Math.max(1, ms));
    const f = Math.min(1, t / 0.3) * Math.max(0, 1 - out / 0.3);
    const pulse = 0.7 + 0.3 * Math.sin(t * (6 + k * 20));
    (g.material as THREE.MeshBasicMaterial).opacity = (0.4 + 0.6 * k) * pulse * f;
    (gd.material as THREE.MeshBasicMaterial).opacity = 0.7 * f;
    (c1.material as THREE.MeshBasicMaterial).opacity = 0.8 * f;
    c1.rotation.z = -t * (0.5 + k * 4);
    spark += dt * (2 + k * 12) * Q * f;
    while (spark > 1) {
      spark -= 1;
      const s = sprite(ctx, star(), Math.random() < 0.5 ? col : DJ.white, true);
      s.position.set(x + (Math.random() - 0.5) * size, 0.1, z + (Math.random() - 0.5) * size);
      const vy = 1.5 + Math.random() * 2;
      const sz = 0.1 + Math.random() * 0.14;
      anim(ctx, 0.8, 0, (_t2, k2, dt2) => {
        s.position.y += vy * dt2;
        s.scale.setScalar(sz * (1 - k2));
        s.material.opacity = 1 - k2;
      }, () => dispose(ctx, s));
    }
    if (out >= 0.3) {
      dispose(ctx, c1, gd, g);
      return false;
    }
    return true;
  });
}

// ------------------------------------------------------------ the four area spells

/** A jagged lightning bolt from the sky down to (x, z). */
function lightning(ctx: XSlashCtx, x: number, z: number, delay: number, big: boolean) {
  const pts: THREE.Vector3[] = [];
  const top = 9;
  let px = x + (Math.random() - 0.5) * 2;
  let pz = z + (Math.random() - 0.5) * 2;
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    const y = top * (1 - k);
    px += (x - px) * 0.35 + (Math.random() - 0.5) * 0.7 * (1 - k);
    pz += (z - pz) * 0.35 + (Math.random() - 0.5) * 0.7 * (1 - k);
    pts.push(new THREE.Vector3(i === 10 ? x : px, y, i === 10 ? z : pz));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0);
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, big ? 0.07 : 0.05, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false }));
  const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, big ? 0.24 : 0.17, 6), new THREE.MeshBasicMaterial({ color: DJ_FX.dj_lightning.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  core.visible = halo.visible = false;
  ctx.scene.add(core, halo);
  anim(ctx, 0.32, delay, (t, k) => {
    core.visible = halo.visible = Math.sin(t * 90) > -0.6 || k > 0.5;
    (core.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    (halo.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
  }, () => dispose(ctx, core, halo));
}

function meteor(ctx: XSlashCtx, x: number, z: number, delay: number, fall: number, big: boolean) {
  const from = new THREE.Vector3(x + 3.5, 9, z - 2.5);
  const to = new THREE.Vector3(x, 0.4, z);
  const rock = sprite(ctx, sparkTexture(), 0xffb050, true);
  const core = sprite(ctx, sparkTexture(), 0xffffff, true);
  const tail = sprite(ctx, bolt(), DJ_FX.dj_meteor.color, true);
  tail.center.set(0.5, 0);
  // the tail points back up the way it came
  const dir = from.clone().sub(to).normalize();
  tail.material.rotation = Math.atan2(-dir.x, dir.y) + 0.0;
  for (const s of [rock, core, tail]) s.visible = false;
  const size = big ? 1.6 : 1.15;
  anim(ctx, fall, delay, (_t, k) => {
    for (const s of [rock, core, tail]) s.visible = true;
    const p = from.clone().lerp(to, k * k);
    rock.position.copy(p);
    core.position.copy(p);
    tail.position.copy(p);
    rock.scale.setScalar(size);
    core.scale.setScalar(size * 0.5);
    tail.scale.set(size * 0.8, 3.2, 1);
  }, () => dispose(ctx, rock, core, tail));
}

function spike(ctx: XSlashCtx, x: number, z: number, delay: number, h: number) {
  const geo = new THREE.ConeGeometry(0.16 + h * 0.06, h, 5);
  geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x8a6034, roughness: 0.9, flatShading: true }));
  m.position.set(x, -h, z);
  m.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * 6, (Math.random() - 0.5) * 0.4);
  m.visible = false;
  ctx.scene.add(m);
  anim(ctx, 0.9, delay, (t) => {
    m.visible = true;
    // shoots up in 0.12 s, holds, then sinks back
    const up = Math.min(1, t / 0.12);
    const down = Math.max(0, (t - 0.55) / 0.35);
    m.position.y = -h + h * (1 - Math.pow(1 - up, 3)) - h * down;
  }, () => dispose(ctx, m));
}

function iceShard(ctx: XSlashCtx, x: number, z: number, delay: number, fall: number) {
  const geo = new THREE.ConeGeometry(0.09, 0.7, 5);
  geo.rotateX(Math.PI); // point down
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xcff4ff, transparent: true, opacity: 0.9, depthWrite: false }));
  const glow = sprite(ctx, sparkTexture(), DJ_FX.dj_blizzard.color, true);
  m.visible = glow.visible = false;
  ctx.scene.add(m);
  const ox = (Math.random() - 0.5) * 1.5;
  anim(ctx, fall, delay, (_t, k) => {
    m.visible = glow.visible = true;
    m.position.set(x + ox * (1 - k), 8 * (1 - k * k) + 0.35, z);
    m.rotation.z = ox * 0.15;
    glow.position.copy(m.position);
    glow.scale.setScalar(0.7);
  }, () => dispose(ctx, m, glow));
}

/** Snow swirling over the area for `sec`. */
function blizzardSwirl(ctx: XSlashCtx, x: number, z: number, half: number, sec: number) {
  const n = Math.round(40 * Q);
  const flakes = Array.from({ length: n }, () => {
    const s = sprite(ctx, snow(), 0xffffff, false);
    return { s, a: Math.random() * Math.PI * 2, r: Math.random() * half * 1.3, y: Math.random() * 3, v: 0.8 + Math.random() * 1.6, sz: 0.1 + Math.random() * 0.14 };
  });
  const frost = groundPlane(shock(), half * 3, true);
  (frost.material as THREE.MeshBasicMaterial).color.set(0x9fe6ff);
  frost.position.set(x, 0.08, z);
  ctx.scene.add(frost);
  anim(ctx, sec, 0, (t, k, dt) => {
    const f = Math.min(1, t / 0.3) * Math.min(1, (sec - t) / 0.5);
    for (const p of flakes) {
      p.a += dt * p.v * 1.6;
      p.y -= dt * p.v;
      if (p.y < 0.05) p.y = 3;
      p.s.position.set(x + Math.cos(p.a) * p.r, p.y, z + Math.sin(p.a) * p.r);
      p.s.scale.setScalar(p.sz);
      p.s.material.opacity = 0.9 * f;
      p.s.material.rotation += dt * 3;
    }
    frost.scale.setScalar(0.5 + 0.5 * Math.min(1, k * 4));
    (frost.material as THREE.MeshBasicMaterial).opacity = 0.6 * f;
  }, () => dispose(ctx, frost, ...flakes.map((p) => p.s)));
}

/**
 * EDM / 3 ช่า / โจ๊ะๆ / เบาๆสบายๆ: `waves` volleys land on the 3x3 area, the first after `firstMs`, then `gapMs`
 * apart. `onWave(i)` fires as each one lands (sound).
 */
export function djAreaStrike(ctx: XSlashCtx, fx: string, x: number, z: number, half: number, waves: number, firstMs: number, gapMs: number, onWave: (i: number, last: boolean) => void) {
  const { color, glow } = DJ_FX[fx] ?? DJ_FX.dj_lightning;
  const size = half * 2;
  const total = (firstMs + waves * gapMs) / 1000;
  // the record circle stays under the area while the volleys come down
  djCircle(ctx, () => new THREE.Vector3(x, 0, z), half * 1.5, total * 1000, (() => {
    const end = performance.now() + total * 1000 + 200;
    return () => performance.now() < end;
  })());
  if (fx === 'dj_blizzard') blizzardSwirl(ctx, x, z, half, total + 0.6);
  for (let w = 0; w < waves; w++) {
    const last = w === waves - 1;
    const land = (firstMs + w * gapMs) / 1000;
    const n = fx === 'dj_spikes' ? (PHONE ? 4 : 7) : fx === 'dj_meteor' ? (last ? 3 : 1) : PHONE ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const tx = x + (Math.random() - 0.5) * size * 0.9;
      const tz = z + (Math.random() - 0.5) * size * 0.9;
      if (fx === 'dj_lightning') lightning(ctx, tx, tz, Math.max(0, land - 0.02), last);
      else if (fx === 'dj_meteor') meteor(ctx, tx, tz, Math.max(0, land - 0.32), 0.32, last);
      else if (fx === 'dj_spikes') spike(ctx, tx, tz, land, 0.6 + Math.random() * (last ? 1.1 : 0.7));
      else iceShard(ctx, tx, tz, Math.max(0, land - 0.28), 0.28);
      anim(ctx, 0.01, land, () => {}, () => {
        const at = new THREE.Vector3(tx, 0.3, tz);
        flash(ctx, at, fx === 'dj_meteor' ? 2.4 : 1.4, glow, 0.3);
        ring(ctx, tx, tz, fx === 'dj_meteor' ? 2 : 1.2, color, 0.4);
        if (fx === 'dj_meteor') debris(ctx, at, 8, 0xffa040, sparkTexture(), 0.25, 3);
        else if (fx === 'dj_spikes') debris(ctx, at, 5, 0x9a7650, star(), 0.14, 2, false);
        else if (fx === 'dj_blizzard') debris(ctx, at, 4, 0xdff8ff, snow(), 0.16, 1.5);
        else debris(ctx, at, 4, color, star(), 0.14, 2);
      });
    }
    anim(ctx, 0.01, land, () => {}, () => {
      onWave(w, last);
      ctx.sparks(new THREE.Vector3(x, 0.5, z), color, Math.round((last ? 24 : 8) * Q), last ? 6 : 3);
      ctx.shake(last ? 0.35 : fx === 'dj_meteor' ? 0.2 : 0.1);
      if (last) {
        flash(ctx, new THREE.Vector3(x, 0.8, z), size * 1.4, glow, 0.45);
        ring(ctx, x, z, size * 1.3, color, 0.6);
      }
    });
  }
}

// ------------------------------------------------------------ เปิดเพลงให้สาว: bolts of fire on one target

export function djFireBolts(ctx: XSlashCtx, at: () => THREE.Vector3, n: number, firstMs: number, gapMs: number, onBolt: (i: number, last: boolean) => void) {
  const { color, glow } = DJ_FX.dj_firebolt;
  for (let i = 0; i < n; i++) {
    const land = (firstMs + i * gapMs) / 1000;
    const fall = 0.25;
    const f = sprite(ctx, flame(), 0xffffff, true);
    const core = sprite(ctx, sparkTexture(), color, true);
    f.visible = core.visible = false;
    const jx = (Math.random() - 0.5) * 0.5;
    const jz = (Math.random() - 0.5) * 0.5;
    anim(ctx, fall, Math.max(0, land - fall), (_t, k) => {
      const p = at();
      f.visible = core.visible = true;
      const y = 8 * (1 - k * k) + 0.6;
      f.position.set(p.x + jx, y + 0.6, p.z + jz);
      f.scale.set(0.7, 1.6, 1);
      f.material.rotation = Math.PI; // the flame trails upwards as it falls
      core.position.set(p.x + jx, y, p.z + jz);
      core.scale.setScalar(0.9);
    }, () => {
      dispose(ctx, f, core);
      const p = at();
      const hit = new THREE.Vector3(p.x + jx, 0.5, p.z + jz);
      flash(ctx, hit, 1.6, glow, 0.25);
      ring(ctx, hit.x, hit.z, 1.1, color, 0.35);
      debris(ctx, hit, 5, 0xffa040, sparkTexture(), 0.2, 2.2);
      onBolt(i, i === n - 1);
      ctx.shake(i === n - 1 ? 0.25 : 0.08);
    });
  }
}

// ------------------------------------------------------------ รถแห่: the wall of fire

/** Five pillars of fire along (px, pz) through (x, z), `len` tiles, burning for `ms`. Returns a function to put it out early. */
export function djFireWall(ctx: XSlashCtx, x: number, z: number, px: number, pz: number, len: number, ms: number) {
  const pillars = 5;
  const parts: { s: THREE.Sprite; base: THREE.Vector3; ph: number; h: number }[] = [];
  const glows: THREE.Sprite[] = [];
  for (let i = 0; i < pillars; i++) {
    const off = (i - (pillars - 1) / 2) * (len / pillars);
    const base = new THREE.Vector3(x + px * off, 0, z + pz * off);
    for (let j = 0; j < (PHONE ? 2 : 3); j++) {
      const s = sprite(ctx, flame(), j === 0 ? 0xffffff : 0xffb070, true);
      s.center.set(0.5, 0.05);
      parts.push({ s, base, ph: Math.random() * 6, h: 1.4 + j * 0.35 });
    }
    const g = sprite(ctx, sparkTexture(), DJ_FX.dj_firewall.color, true);
    g.position.set(base.x, 0.4, base.z);
    glows.push(g);
  }
  const scorch = new THREE.Mesh(new THREE.PlaneGeometry(len + 0.4, 0.9), new THREE.MeshBasicMaterial({ map: shock(), color: 0xff5a1f, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scorch.rotation.x = -Math.PI / 2;
  scorch.rotation.z = -Math.atan2(pz, px);
  scorch.position.set(x, 0.07, z);
  ctx.scene.add(scorch);
  let stop = false;
  let t = 0;
  let out = 0;
  let ember = 0;
  const sec = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    if (stop || t > sec) out += dt;
    const f = Math.min(1, t / 0.25) * Math.max(0, 1 - out / 0.4);
    for (const p of parts) {
      const fl = 0.85 + 0.15 * Math.sin(t * 14 + p.ph) + 0.08 * Math.sin(t * 31 + p.ph * 2);
      p.s.position.set(p.base.x + Math.sin(t * 7 + p.ph) * 0.05, 0, p.base.z);
      p.s.scale.set(0.75 * fl, p.h * fl * (0.4 + 0.6 * Math.min(1, t / 0.25)), 1);
      p.s.material.opacity = f;
    }
    for (const g of glows) {
      g.scale.setScalar(1.4 + 0.2 * Math.sin(t * 9));
      g.material.opacity = 0.7 * f;
    }
    (scorch.material as THREE.MeshBasicMaterial).opacity = 0.5 * f;
    ember += dt * 12 * Q * f;
    while (ember > 1) {
      ember -= 1;
      const off = (Math.random() - 0.5) * len;
      const e = sprite(ctx, sparkTexture(), 0xffa040, true);
      e.position.set(x + px * off, 0.3, z + pz * off);
      const vy = 1.5 + Math.random() * 2;
      anim(ctx, 0.7, 0, (_t2, k2, dt2) => {
        e.position.y += vy * dt2;
        e.scale.setScalar(0.12 * (1 - k2));
        e.material.opacity = 1 - k2;
      }, () => dispose(ctx, e));
    }
    if (out >= 0.4) {
      dispose(ctx, scorch, ...parts.map((p) => p.s), ...glows);
      return false;
    }
    return true;
  });
  return () => {
    stop = true;
  };
}

// ------------------------------------------------------------ บูทดีเจ: the guarding circle

/** The booth's circle on the ground with an equalizer ring of light bars; `pulse()` flashes it when it stops a hit. */
export function djBooth(ctx: XSlashCtx, x: number, z: number, r: number, ms: number) {
  const m = groundPlane(circle(), r * 2.4);
  const glow = groundPlane(circle(), r * 2.4, true);
  (glow.material as THREE.MeshBasicMaterial).color.set(0xb89cff);
  m.position.set(x, 0.05, z);
  glow.position.set(x, 0.06, z);
  ctx.scene.add(m, glow);
  // a ring of standing light bars (the speakers' meters) round the edge
  const n = PHONE ? 12 : 18;
  const bars = Array.from({ length: n }, (_, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1, 0.06), new THREE.MeshBasicMaterial({ color: i % 2 ? DJ.magenta : DJ.cyan, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const a = (i / n) * Math.PI * 2;
    b.position.set(x + Math.cos(a) * r * 1.1, 0, z + Math.sin(a) * r * 1.1);
    ctx.scene.add(b);
    return b;
  });
  let t = 0;
  let out = 0;
  let stop = false;
  let hit = 0;
  const sec = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    hit = Math.max(0, hit - dt * 3);
    if (stop || t > sec) out += dt;
    const f = Math.min(1, t / 0.3) * Math.max(0, 1 - out / 0.4);
    m.rotation.z = -t * 2;
    glow.rotation.z = m.rotation.z;
    (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * f;
    (glow.material as THREE.MeshBasicMaterial).opacity = (0.3 + 0.7 * hit) * f;
    bars.forEach((b, i) => {
      const h = 0.25 + 0.55 * Math.abs(Math.sin(t * 6 + i * 1.3)) + hit * 0.6;
      b.scale.y = h;
      b.position.y = h / 2;
      (b.material as THREE.MeshBasicMaterial).opacity = 0.85 * f;
    });
    if (out >= 0.4) {
      dispose(ctx, m, glow, ...bars);
      return false;
    }
    return true;
  });
  return {
    pulse: () => {
      hit = 1;
      ring(ctx, x, z, r * 2.2, DJ.violet, 0.35);
    },
    end: () => {
      stop = true;
    },
  };
}

// ------------------------------------------------------------ status on monsters

/** Stars circling over a stunned monster's head for `ms` (`head()` follows it). */
export function stunStars(ctx: XSlashCtx, head: () => THREE.Vector3 | null, ms: number) {
  const n = 4;
  const stars = Array.from({ length: n }, () => sprite(ctx, star(), 0xffe066, false));
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    const p = head();
    const done = !p || t * 1000 > ms;
    stars.forEach((s, i) => {
      const a = t * 5 + (i / n) * Math.PI * 2;
      if (p) s.position.set(p.x + Math.cos(a) * 0.45, p.y + 0.15 + Math.sin(t * 6 + i) * 0.05, p.z + Math.sin(a) * 0.45);
      s.scale.setScalar(0.24);
      s.material.rotation = t * 4;
    });
    if (done) {
      dispose(ctx, ...stars);
      return false;
    }
    return true;
  });
}

/** An ice block round a frozen monster for `ms` (`at()` = its feet, `size` its height). */
export function iceBlock(ctx: XSlashCtx, at: () => THREE.Vector3 | null, size: number, ms: number) {
  const geo = new THREE.IcosahedronGeometry(1, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xbfeeff, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.1, flatShading: true, depthWrite: false }));
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
  m.add(edge);
  ctx.scene.add(m);
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    const p = at();
    const left = ms / 1000 - t;
    const grow = Math.min(1, t / 0.15);
    if (p) m.position.set(p.x, size * 0.5, p.z);
    m.scale.set(size * 0.5 * grow, size * 0.62 * grow, size * 0.5 * grow);
    const f = Math.min(1, left / 0.3);
    (m.material as THREE.MeshStandardMaterial).opacity = 0.55 * f;
    (edge.material as THREE.LineBasicMaterial).opacity = 0.8 * f;
    if (!p || left <= 0) {
      if (p) debris(ctx, new THREE.Vector3(p.x, size * 0.5, p.z), 6, 0xdff8ff, snow(), 0.16, 2);
      dispose(ctx, m);
      return false;
    }
    return true;
  });
}
