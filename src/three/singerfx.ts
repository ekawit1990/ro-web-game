import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture, glyphTexture } from './toon';
import type { XSlashCtx } from './xslash';

/**
 * The singer's skills in gold: a stage show. Golden magic circles ringed with a music staff and a microphone at
 * the heart, stage spotlights falling from the sky, rings of sound rolling out, five-point stars and notes.
 * Deep amber layers use normal blending so they read on light ground; the light is additive.
 */

const Q = PHONE ? 0.5 : 1;
const TEX = PHONE ? 256 : 512;

/** Palette. */
export const SG = { amber: 0xb86a00, gold: 0xffc21f, light: 0xffe680, white: 0xfffbe8, pink: 0xff7ac8 };

let circleTex: THREE.Texture | undefined;
let shockTex: THREE.Texture | undefined;
let rayTex: THREE.Texture | undefined;
let starTex: THREE.Texture | undefined;
let ringTex: THREE.Texture | undefined;
let beamTex: THREE.Texture | undefined;
let staffTex: THREE.Texture | undefined;

const NOTES = ['♪', '♫', '♬', '♩'];
const noteTex = (g: string, pink = false) => glyphTexture(g, pink ? '#ffd0ec' : '#fff3b0', pink ? 'rgba(150,20,90,0.95)' : 'rgba(140,70,0,0.95)');

/** Golden circle: double rings, a staff ring with note heads, a twelve-point star and a microphone in the middle. */
function circle() {
  return (circleTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 250);
    g.addColorStop(0, 'rgba(255,235,140,0.55)');
    g.addColorStop(0.6, 'rgba(255,170,20,0.2)');
    g.addColorStop(0.95, 'rgba(200,110,0,0.45)');
    g.addColorStop(1, 'rgba(200,110,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 250, 0, Math.PI * 2);
    c.fill();
    const draw = (col: string, extra: number) => {
      c.strokeStyle = col;
      c.fillStyle = col;
      const ring = (r: number, w: number) => {
        c.lineWidth = w + extra;
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.stroke();
      };
      ring(242, 6);
      ring(232, 2);
      // the staff: five thin rings
      for (let i = 0; i < 5; i++) ring(186 + i * 9, 1.6);
      ring(170, 3);
      ring(100, 3);
      ring(52, 5);
      // note heads riding the staff
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const r = 186 + ((i * 3) % 5) * 9;
        c.save();
        c.translate(Math.cos(a) * r, Math.sin(a) * r);
        c.rotate(a + Math.PI / 2);
        c.beginPath();
        c.ellipse(0, 0, 8 + extra / 2, 5.5 + extra / 2, -0.4, 0, Math.PI * 2);
        c.fill();
        c.fillRect(6, -22, 2.5 + extra / 2, 22);
        c.restore();
      }
      // twelve-point star
      c.lineWidth = 3 + extra;
      c.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = ((i * 5) / 12) * Math.PI * 2 - Math.PI / 2;
        if (i) c.lineTo(Math.cos(a) * 168, Math.sin(a) * 168);
        else c.moveTo(Math.cos(a) * 168, Math.sin(a) * 168);
      }
      c.stroke();
      // little five-point stars between the star tips
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        star5(c, Math.cos(a) * 128, Math.sin(a) * 128, 12 + extra, true);
      }
      // the microphone: head, grille lines, handle
      c.lineWidth = 4 + extra;
      c.beginPath();
      c.arc(0, -10, 24, 0, Math.PI * 2);
      c.stroke();
      c.lineWidth = 2 + extra;
      for (let i = -1; i <= 1; i++) {
        c.beginPath();
        c.moveTo(-22, -10 + i * 10);
        c.lineTo(22, -10 + i * 10);
        c.stroke();
      }
      c.lineWidth = 7 + extra;
      c.beginPath();
      c.moveTo(0, 14);
      c.lineTo(0, 46);
      c.stroke();
    };
    draw('rgba(150,70,0,0.9)', 5);
    draw('rgba(255,236,150,1)', 0);
  }));
}

function star5(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: boolean) {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  if (fill) c.fill();
  else c.stroke();
}

function shock() {
  return (shockTex ??= canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 60, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,220,100,0)');
    g.addColorStop(0.7, 'rgba(255,230,140,0.5)');
    g.addColorStop(0.9, 'rgba(255,250,220,1)');
    g.addColorStop(1, 'rgba(255,200,60,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  }));
}

/** A thin bright ring (a ring of sound seen face on). */
function soundRing() {
  return (ringTex ??= canvasTexture(256, 256, (c) => {
    for (const [r, w, a] of [[112, 10, 0.35], [112, 4, 1], [92, 3, 0.7], [74, 2, 0.45]] as const) {
      c.strokeStyle = `rgba(255,245,200,${a})`;
      c.lineWidth = w;
      c.beginPath();
      c.arc(128, 128, r, 0, Math.PI * 2);
      c.stroke();
    }
  }));
}

function ray() {
  return (rayTex ??= canvasTexture(64, 256, (c) => {
    const g = c.createLinearGradient(0, 256, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(32, 256);
    c.lineTo(20, 120);
    c.lineTo(32, 0);
    c.lineTo(44, 120);
    c.closePath();
    c.fill();
  }));
}

function starTexture() {
  return (starTex ??= canvasTexture(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 4, 64, 64, 60);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(255,255,255,1)';
    star5(c, 64, 66, 54, true);
  }));
}

/** A soft vertical stage light: bright at the bottom, fading up, soft edges. */
function beam() {
  return (beamTex ??= canvasTexture(128, 256, (c) => {
    for (let x = 0; x < 128; x++) {
      const e = Math.sin((x / 127) * Math.PI);
      const g = c.createLinearGradient(0, 256, 0, 0);
      g.addColorStop(0, `rgba(255,255,255,${0.9 * e})`);
      g.addColorStop(0.5, `rgba(255,255,255,${0.35 * e})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(x, 0, 1, 256);
    }
  }));
}

/** A strip of five staff lines with notes on it, for the ribbon that rides the sound beam. */
function staff() {
  return (staffTex ??= canvasTexture(512, 64, (c) => {
    c.strokeStyle = 'rgba(255,240,180,0.95)';
    c.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(0, 12 + i * 10);
      c.lineTo(512, 12 + i * 10);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,250,220,1)';
    for (let i = 0; i < 9; i++) {
      const x = 30 + i * 55;
      const y = 12 + ((i * 7) % 5) * 10;
      c.beginPath();
      c.ellipse(x, y, 6, 4.5, -0.4, 0, Math.PI * 2);
      c.fill();
      c.fillRect(x + 4.5, y - 22, 2, 22);
    }
  }));
}

// ------------------------------------------------------------ helpers

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
    ctx.scene.remove(o);
    o.traverse((x) => {
      const mesh = x as THREE.Mesh;
      (mesh.material as THREE.Material | undefined)?.dispose();
      if (mesh.isMesh) mesh.geometry.dispose();
    });
  }
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

// ------------------------------------------------------------ building blocks

/** The golden circle: snaps open, turns, a soft additive copy pulses on top. Follows `at` (a moving singer). */
export function goldCircle(ctx: XSlashCtx, at: () => THREE.Vector3, r: number, sec: number, delay = 0) {
  const m = groundPlane(circle(), r * 2);
  const glow = groundPlane(circle(), r * 2, true);
  m.visible = glow.visible = false;
  ctx.scene.add(m, glow);
  const mat = m.material as THREE.MeshBasicMaterial;
  const gmat = glow.material as THREE.MeshBasicMaterial;
  gmat.color.set(0xffb020);
  anim(ctx, sec, delay, (t) => {
    const p = at();
    m.position.set(p.x, 0.05, p.z);
    glow.position.set(p.x, 0.06, p.z);
    m.visible = glow.visible = true;
    const k = Math.min(1, t / 0.22);
    const fade = Math.min(1, (sec - t) / 0.4);
    m.scale.setScalar(0.3 + 0.7 * (1 - Math.pow(1 - k, 3)));
    glow.scale.copy(m.scale).multiplyScalar(1.02);
    m.rotation.z = t * 0.7;
    glow.rotation.z = -t * 0.5;
    mat.opacity = Math.max(0, fade);
    gmat.opacity = Math.max(0, 0.4 * fade * (0.7 + 0.3 * Math.sin(t * 18)));
  }, () => dispose(ctx, m, glow));
}

export function goldShock(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0) {
  const m = groundPlane(shock(), 2, true);
  const solid = groundPlane(shock(), 2);
  (solid.material as THREE.MeshBasicMaterial).color.set(SG.amber);
  m.position.set(x, 0.09, z);
  solid.position.set(x, 0.08, z);
  m.visible = solid.visible = false;
  ctx.scene.add(m, solid);
  anim(ctx, sec, delay, (_t, k) => {
    m.visible = solid.visible = true;
    m.scale.setScalar(0.2 + r * (1 - Math.pow(1 - k, 2.5)));
    solid.scale.copy(m.scale).multiplyScalar(1.03);
    (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
    (solid.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k);
  }, () => dispose(ctx, m, solid));
}

/** A stage spotlight: a cone of light from high above onto (x,z), with a bright pool on the ground. */
export function spotlight(ctx: XSlashCtx, at: () => THREE.Vector3, r: number, sec: number, delay = 0, color: number = SG.light) {
  const h = 7;
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.18, r, h, 28, 1, true),
    new THREE.MeshBasicMaterial({ map: beam(), color, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  const pool = groundPlane(shock(), r * 2.2, true);
  (pool.material as THREE.MeshBasicMaterial).color.set(color);
  cone.visible = pool.visible = false;
  ctx.scene.add(cone, pool);
  anim(ctx, sec, delay, (t) => {
    const p = at();
    cone.position.set(p.x, h / 2, p.z);
    pool.position.set(p.x, 0.07, p.z);
    cone.visible = pool.visible = true;
    const k = Math.min(1, t / 0.18) * Math.min(1, (sec - t) / 0.35);
    (cone.material as THREE.MeshBasicMaterial).opacity = 0.55 * k;
    (pool.material as THREE.MeshBasicMaterial).opacity = 0.8 * k;
    cone.rotation.y = t * 0.6;
  }, () => dispose(ctx, cone, pool));
}

/** A column of golden light shooting up. */
export function lightPillar(ctx: XSlashCtx, x: number, z: number, r: number, h: number, sec: number, delay = 0) {
  const p = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.15, h, 24, 1, true),
    new THREE.MeshBasicMaterial({ map: beam(), color: SG.gold, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  p.visible = false;
  ctx.scene.add(p);
  anim(ctx, sec, delay, (t, k) => {
    p.visible = true;
    const up = Math.min(1, t / 0.15);
    p.scale.set(1 + k * 0.4, up, 1 + k * 0.4);
    p.position.set(x, (h * up) / 2, z);
    (p.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
  }, () => dispose(ctx, p));
}

/** Rings of sound rolling out of a point, facing the camera. */
export function soundRings(ctx: XSlashCtx, at: THREE.Vector3, n: number, size: number, gap = 0.08, delay = 0) {
  for (let i = 0; i < n; i++) {
    const s = sprite(ctx, soundRing(), i % 2 ? SG.gold : SG.white, true);
    s.position.copy(at);
    s.visible = false;
    anim(ctx, 0.5, delay + i * gap, (_t, k) => {
      s.visible = true;
      s.scale.setScalar(0.3 + size * (1 - Math.pow(1 - k, 2)));
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

/** Golden five-point stars bursting out of a point, tumbling and falling. */
export function starBurst(ctx: XSlashCtx, at: THREE.Vector3, n: number, speed: number, delay = 0) {
  for (let i = 0; i < Math.max(4, Math.round(n * Q)); i++) {
    const s = sprite(ctx, starTexture(), i % 4 === 0 ? SG.pink : i % 2 ? SG.gold : SG.white, true);
    s.position.copy(at);
    s.visible = false;
    const a = Math.random() * Math.PI * 2;
    const up = Math.random() * 0.9 + 0.2;
    const v = new THREE.Vector3(Math.cos(a), up, Math.sin(a)).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
    const size = 0.16 + Math.random() * 0.22;
    const spin = (Math.random() - 0.5) * 12;
    anim(ctx, 0.7 + Math.random() * 0.5, delay, (_t, k, dt) => {
      s.visible = true;
      v.y -= 6 * dt;
      v.multiplyScalar(1 - dt * 2);
      s.position.addScaledVector(v, dt);
      s.material.rotation += spin * dt;
      s.scale.setScalar(size * (1 - k * 0.6));
      s.material.opacity = 1 - k * k;
    }, () => dispose(ctx, s));
  }
}

/** Golden notes rising in a swirl round (x,z). */
export function noteFountain(ctx: XSlashCtx, x: number, z: number, radius: number, n: number, height: number, delay = 0) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = sprite(ctx, noteTex(NOTES[i % NOTES.length], i % 5 === 0), 0xffffff, false);
    s.visible = false;
    const a0 = (i / n) * Math.PI * 2;
    const r0 = radius * (0.4 + Math.random() * 0.6);
    const life = 1 + Math.random() * 0.7;
    const size = 0.32 + Math.random() * 0.22;
    anim(ctx, life, delay + Math.random() * 0.35, (t, k) => {
      s.visible = true;
      const a = a0 + t * 2.4;
      const r = r0 * (1 - k * 0.3);
      s.position.set(x + Math.cos(a) * r, 0.3 + k * height, z + Math.sin(a) * r);
      s.scale.setScalar(size * Math.min(1, k * 6));
      s.material.opacity = Math.min(1, (1 - k) * 2.5);
    }, () => dispose(ctx, s));
  }
}

/** Light rays fanning out of a point. */
export function rays(ctx: XSlashCtx, at: THREE.Vector3, n: number, len: number, delay = 0) {
  const count = Math.max(4, Math.round(n * Q));
  for (let i = 0; i < count; i++) {
    const s = sprite(ctx, ray(), i % 3 === 1 ? SG.amber : i % 3 ? SG.gold : SG.white, i % 3 !== 1);
    s.center.set(0.5, 0);
    s.position.copy(at);
    s.material.depthTest = false;
    s.material.rotation = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    s.renderOrder = 11;
    s.visible = false;
    const l = len * (0.5 + Math.random() * 0.7);
    anim(ctx, 0.4, delay, (_t, k) => {
      s.visible = true;
      s.scale.set(0.35 * (1 - k), l * (0.3 + 0.7 * Math.min(1, k * 3)), 1);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

// ------------------------------------------------------------ the skills

/**
 * การใส่ไดนามิกและอารมณ์: each thrown mic lands under a spotlight in a burst of stars and rings of sound;
 * `big` (the second) adds a fan of rays, a golden circle and a shake.
 */
export function dynamicsHit(ctx: XSlashCtx, at: THREE.Vector3, big: boolean) {
  ctx.sound(big);
  spotlight(ctx, () => at, big ? 1.4 : 1.1, 0.7);
  goldShock(ctx, at.x, at.z, big ? 3.2 : 2.2, 0.45);
  soundRings(ctx, at, big ? 4 : 3, big ? 3 : 2.2);
  starBurst(ctx, at, big ? 22 : 14, big ? 6 : 4.5);
  ctx.sparks(at, SG.gold, big ? 30 : 18, big ? 8 : 6);
  if (big) {
    goldCircle(ctx, () => at, 1.8, 1.1);
    rays(ctx, at, 12, 3.2);
    noteFountain(ctx, at.x, at.z, 1.1, 8, 2.4);
    ctx.shake(0.3);
  }
}

/**
 * Ear Training: the big mic slams down on a golden circle, a pillar of light, three rounds of sound rings, rays,
 * a star storm and a shock that rolls out the way the monster is knocked.
 */
export function earTrainingBlast(ctx: XSlashCtx, at: THREE.Vector3, dx: number, dz: number) {
  ctx.sound(true);
  goldCircle(ctx, () => at, 2.2, 1.4);
  spotlight(ctx, () => at, 1.6, 1.0);
  lightPillar(ctx, at.x, at.z, 0.7, 6, 0.6);
  for (let i = 0; i < 3; i++) soundRings(ctx, at.clone().add(new THREE.Vector3(dx * i * 0.6, 0, dz * i * 0.6)), 3, 3.4 - i * 0.6, 0.06, i * 0.1);
  goldShock(ctx, at.x, at.z, 4, 0.55);
  goldShock(ctx, at.x + dx * 1.2, at.z + dz * 1.2, 3, 0.5, 0.12);
  rays(ctx, at, 16, 4.2);
  starBurst(ctx, at, 30, 7);
  noteFountain(ctx, at.x, at.z, 1.4, 12, 3);
  ctx.sparks(at, SG.white, 40, 9);
  ctx.shake(0.45);
}

/** While a long cast charges: a circle and a spotlight on the singer, notes rising, stars twinkling in. */
export function singerCharge(ctx: XSlashCtx, at: () => THREE.Vector3, ms: number, alive: () => boolean) {
  const sec = ms / 1000;
  goldCircle(ctx, at, 1.5, sec + 0.3);
  spotlight(ctx, at, 1.1, sec + 0.2);
  let t = 0;
  let next = 0;
  ctx.add((dt) => {
    t += dt;
    if (!alive() || t > sec) return false;
    if (t > next) {
      next = t + 0.35;
      const p = at();
      noteFountain(ctx, p.x, p.z, 1.1, 3, 2.4);
    }
    return true;
  });
}

/**
 * เสียงสูง: a cannon of sound. A circle and a spotlight on the singer, then sound rings ride out along the line
 * (standing up, facing the way it goes) on a golden staff ribbon, notes and stars streaming behind, and a big
 * burst where it ends.
 */
export function highVoiceBeam(ctx: XSlashCtx, fx: number, fz: number, dx: number, dz: number, len: number, speed: number, width: number) {
  const l = Math.hypot(dx, dz) || 1;
  dx /= l;
  dz /= l;
  const sec = len / speed;
  const y = 1.3;
  ctx.sound(true);
  goldCircle(ctx, () => new THREE.Vector3(fx, 0, fz), 1.8, sec + 0.9);
  spotlight(ctx, () => new THREE.Vector3(fx, 0, fz), 1.2, sec + 0.6);
  goldShock(ctx, fx, fz, 3, 0.5);
  const origin = new THREE.Vector3(fx + dx * 0.5, y, fz + dz * 0.5);
  soundRings(ctx, origin, 3, 2.4);
  // the staff ribbon unrolling along the line
  const ribbon = new THREE.Mesh(
    new THREE.PlaneGeometry(1, width * 0.7),
    new THREE.MeshBasicMaterial({ map: staff(), color: SG.light, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
  );
  ribbon.rotation.order = 'YXZ';
  ribbon.rotation.y = Math.atan2(-dz, dx);
  ribbon.rotation.x = -Math.PI / 2;
  ctx.scene.add(ribbon);
  const ribbon2 = ribbon.clone();
  ribbon2.material = (ribbon.material as THREE.MeshBasicMaterial).clone();
  ribbon2.rotation.x = 0;
  ctx.scene.add(ribbon2);
  const yaw = Math.atan2(dx, dz);
  let lastRing = -1;
  anim(ctx, sec + 0.6, 0, (t) => {
    const front = Math.min(len, t * speed);
    const mid = front / 2 + 0.5;
    for (const r of [ribbon, ribbon2]) {
      r.scale.x = Math.max(0.01, front);
      r.position.set(fx + dx * mid, r === ribbon ? 0.12 : y, fz + dz * mid);
      (r.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (sec + 0.6 - t) / 0.4) * (r === ribbon ? 0.8 : 0.5);
    }
    // a standing ring of sound every 0.3 tiles of travel
    const step = Math.floor(front / 0.45);
    if (t <= sec && step > lastRing) {
      lastRing = step;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: soundRing(), color: step % 2 ? SG.gold : SG.white, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      m.position.set(fx + dx * (front + 0.5), y, fz + dz * (front + 0.5));
      m.rotation.y = yaw;
      ctx.scene.add(m);
      anim(ctx, 0.55, 0, (_t2, k) => {
        m.scale.setScalar(width * (0.8 + k * 1.3));
        (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      }, () => dispose(ctx, m));
      if (step % 2 === 0) {
        const p = new THREE.Vector3(fx + dx * front, y, fz + dz * front);
        starBurst(ctx, p, 4, 2.5);
        ctx.sparks(p, SG.gold, 6, 3);
      }
      if (step % 3 === 0) noteFountain(ctx, fx + dx * front, fz + dz * front, 0.6, 3, 1.6);
    }
  }, () => dispose(ctx, ribbon, ribbon2));
  // the end of the line
  const end = new THREE.Vector3(fx + dx * len, y, fz + dz * len);
  setTimeout(() => {
    ctx.sound(false);
    soundRings(ctx, end, 4, 3.4);
    rays(ctx, end, 12, 3.4);
    starBurst(ctx, end, 20, 6);
    goldShock(ctx, end.x, end.z, 3.2, 0.5);
    ctx.shake(0.25);
  }, sec * 1000);
}

/** The singer's buffs (การวอร์มเสียง / Enunciation): a circle, a pillar of light, notes swirling up and a ring of stars. */
export function singerBuff(ctx: XSlashCtx, at: () => THREE.Vector3, color: number = SG.gold) {
  ctx.sound(true);
  const p = at();
  goldCircle(ctx, at, 1.4, 1.8);
  spotlight(ctx, at, 1.0, 1.6, 0, color);
  lightPillar(ctx, p.x, p.z, 0.55, 4.5, 0.8);
  noteFountain(ctx, p.x, p.z, 1, 14, 3);
  soundRings(ctx, new THREE.Vector3(p.x, 1.2, p.z), 3, 2.2, 0.12);
  starBurst(ctx, new THREE.Vector3(p.x, 1.4, p.z), 16, 4, 0.15);
}
