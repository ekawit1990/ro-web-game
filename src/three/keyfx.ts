import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture, glyphTexture, sparkTexture } from './toon';
import type { XSlashCtx } from './xslash';

/**
 * The keyboardist's skills in blue: azure magic circles ringed with piano keys, ice-white music notes, crystal
 * shards, stars and pillars of light. Same building blocks as the guitarist's red set in guitarfx.ts, its own
 * textures and colours. Dark blue layers use normal blending so they read on light ground; the glow is additive.
 */

const Q = PHONE ? 0.5 : 1;
const TEX = PHONE ? 256 : 512;

/** Palette. */
export const KB = { deep: 0x0a2a9a, blue: 0x1e6bff, cyan: 0x38d4ff, ice: 0xdff6ff, violet: 0x6a5cff };

let circleTex: THREE.Texture | undefined;
let shockTex: THREE.Texture | undefined;
let rayTex: THREE.Texture | undefined;
let starTex: THREE.Texture | undefined;
let hexTex: THREE.Texture | undefined;
let featherTex: THREE.Texture | undefined;
let wingTex: THREE.Texture | undefined;
let gridTex: THREE.Texture | undefined;
let crossTex: THREE.Texture | undefined;
let shardGeo: THREE.BufferGeometry | undefined;
let shardMat: THREE.Material | undefined;

const noteTex = (g: string) => glyphTexture(g, '#e8f8ff', 'rgba(0,30,140,0.95)');
const NOTES = ['♪', '♫', '♬', '♩'];

/** Azure magic circle: double rings, a full ring of piano keys, an eight-point star and note heads. */
function circle() {
  return (circleTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 248);
    g.addColorStop(0, 'rgba(120,220,255,0.55)');
    g.addColorStop(0.55, 'rgba(20,90,255,0.22)');
    g.addColorStop(0.95, 'rgba(10,50,200,0.45)');
    g.addColorStop(1, 'rgba(10,50,200,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 248, 0, Math.PI * 2);
    c.fill();
    // the keyboard: 36 white keys between r=180 and r=228, black keys on the 2-3 pattern
    const keys = 36;
    for (let i = 0; i < keys; i++) {
      const a0 = (i / keys) * Math.PI * 2;
      const a1 = ((i + 1) / keys) * Math.PI * 2;
      c.beginPath();
      c.arc(0, 0, 228, a0 + 0.006, a1 - 0.006);
      c.arc(0, 0, 182, a1 - 0.006, a0 + 0.006, true);
      c.closePath();
      c.fillStyle = 'rgba(235,250,255,0.92)';
      c.fill();
    }
    for (let i = 0; i < keys; i++) {
      if ([2, 6].includes(i % 7)) continue; // E-F and B-C have no black key between them
      const a = ((i + 1) / keys) * Math.PI * 2;
      c.beginPath();
      c.arc(0, 0, 228, a - 0.03, a + 0.03);
      c.arc(0, 0, 202, a + 0.03, a - 0.03, true);
      c.closePath();
      c.fillStyle = 'rgba(8,30,120,0.95)';
      c.fill();
    }
    const draw = (col: string, extra: number) => {
      c.strokeStyle = col;
      c.fillStyle = col;
      const ring = (r: number, w: number) => {
        c.lineWidth = w + extra;
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.stroke();
      };
      ring(240, 6);
      ring(231, 2);
      ring(178, 3);
      ring(150, 1.5);
      ring(142, 1.5);
      ring(134, 1.5);
      ring(92, 3);
      ring(44, 5);
      // eight-point star
      c.lineWidth = 3.5 + extra;
      for (const r0 of [0, Math.PI / 4]) {
        c.beginPath();
        for (let i = 0; i <= 4; i++) {
          const a = r0 + (i / 4) * Math.PI * 2;
          if (i) c.lineTo(Math.cos(a) * 134, Math.sin(a) * 134);
          else c.moveTo(Math.cos(a) * 134, Math.sin(a) * 134);
        }
        c.stroke();
      }
      // note heads on the staff ring
      for (let i = 0; i < 8; i++) {
        const a = ((i + 0.5) / 8) * Math.PI * 2;
        const r = 142 + ((i % 3) - 1) * 8;
        c.save();
        c.translate(Math.cos(a) * r, Math.sin(a) * r);
        c.rotate(a + Math.PI / 2);
        c.beginPath();
        c.ellipse(0, 0, 7 + extra / 2, 5 + extra / 2, -0.4, 0, Math.PI * 2);
        c.fill();
        c.fillRect(5, -20, 2.5 + extra / 2, 20);
        c.restore();
      }
      // spokes
      c.lineWidth = 2.5 + extra;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        c.beginPath();
        c.moveTo(Math.cos(a) * 44, Math.sin(a) * 44);
        c.lineTo(Math.cos(a) * 92, Math.sin(a) * 92);
        c.stroke();
      }
    };
    c.shadowColor = '#1050ff';
    c.shadowBlur = 16;
    draw('rgba(5,25,120,0.92)', 5);
    c.shadowBlur = 7;
    c.shadowColor = '#80e0ff';
    draw('#eefaff', 0);
  }));
}

function shock() {
  return (shockTex ??= canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(40,140,255,0)');
    g.addColorStop(0.6, 'rgba(40,140,255,0)');
    g.addColorStop(0.84, 'rgba(60,170,255,0.8)');
    g.addColorStop(0.93, 'rgba(230,248,255,1)');
    g.addColorStop(1, 'rgba(230,248,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  }));
}

function ray() {
  return (rayTex ??= canvasTexture(16, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 128);
    c.globalCompositeOperation = 'destination-in';
    const f = c.createLinearGradient(0, 128, 0, 0);
    f.addColorStop(0, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = f;
    c.fillRect(0, 0, 16, 128);
  }));
}

/** A four-point twinkle star with a soft core. */
function star() {
  return (starTex ??= canvasTexture(128, 128, (c) => {
    c.translate(64, 64);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-64, -64, 128, 128);
    c.fillStyle = '#fff';
    for (const [w, l] of [[7, 62], [4, 40]] as const) {
      c.save();
      if (l === 40) c.rotate(Math.PI / 4);
      for (let i = 0; i < 4; i++) {
        c.rotate(Math.PI / 2);
        c.beginPath();
        c.moveTo(-w, 0);
        c.quadraticCurveTo(0, 0, 0, -l);
        c.quadraticCurveTo(0, 0, w, 0);
        c.fill();
      }
      c.restore();
    }
  }));
}

/** A honeycomb for the shield dome. */
function hex() {
  return (hexTex ??= canvasTexture(256, 256, (c) => {
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.shadowColor = '#9fe8ff';
    c.shadowBlur = 6;
    const r = 22;
    const w = r * Math.sqrt(3);
    for (let row = -1; row < 9; row++) {
      for (let col = -1; col < 8; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0);
        const cy = row * r * 1.5;
        c.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          if (i) c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          else c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        c.stroke();
      }
    }
  }));
}

function feather() {
  return (featherTex ??= canvasTexture(64, 128, (c) => {
    c.translate(32, 64);
    c.shadowColor = '#7fd8ff';
    c.shadowBlur = 8;
    c.fillStyle = 'rgba(245,252,255,0.95)';
    c.beginPath();
    c.moveTo(0, -58);
    c.bezierCurveTo(22, -30, 20, 30, 0, 58);
    c.bezierCurveTo(-20, 30, -22, -30, 0, -58);
    c.fill();
    c.strokeStyle = 'rgba(90,170,255,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -50);
    c.lineTo(0, 60);
    c.stroke();
  }));
}

/** One wing of light (the right one; flip the sprite for the left). */
function wing() {
  return (wingTex ??= canvasTexture(256, 256, (c) => {
    c.shadowColor = '#5fc8ff';
    c.shadowBlur = 14;
    for (let i = 0; i < 7; i++) {
      const a = -1.25 + i * 0.3;
      const len = 210 - Math.abs(i - 2) * 22;
      c.save();
      c.translate(12, 150);
      c.rotate(a);
      const g = c.createLinearGradient(0, 0, len, 0);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.7, 'rgba(170,230,255,0.85)');
      g.addColorStop(1, 'rgba(60,140,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, -6);
      c.quadraticCurveTo(len * 0.5, -26, len, 0);
      c.quadraticCurveTo(len * 0.5, 10, 0, 6);
      c.fill();
      c.restore();
    }
  }));
}

/** The 3x3 target grid of โน้ตทำลาย: nine glowing key-squares. */
function grid() {
  return (gridTex ??= canvasTexture(256, 256, (c) => {
    c.shadowColor = '#38d4ff';
    c.shadowBlur = 10;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const x = 8 + i * 82;
        const y = 8 + j * 82;
        const g = c.createLinearGradient(x, y, x + 76, y + 76);
        g.addColorStop(0, 'rgba(120,220,255,0.7)');
        g.addColorStop(1, 'rgba(30,100,255,0.45)');
        c.fillStyle = g;
        c.fillRect(x, y, 76, 76);
        c.strokeStyle = 'rgba(245,252,255,1)';
        c.lineWidth = 7;
        c.strokeRect(x + 3, y + 3, 70, 70);
        // a note in each square
        c.fillStyle = 'rgba(245,252,255,0.95)';
        c.beginPath();
        c.ellipse(x + 32, y + 50, 10, 7, -0.4, 0, Math.PI * 2);
        c.fill();
        c.fillRect(x + 39, y + 18, 4, 32);
      }
    }
  }));
}

/** A rounded healing cross. */
function cross() {
  return (crossTex ??= canvasTexture(64, 64, (c) => {
    c.shadowColor = '#40c8ff';
    c.shadowBlur = 8;
    c.fillStyle = '#f2fbff';
    c.fillRect(25, 8, 14, 48);
    c.fillRect(8, 25, 48, 14);
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
    ctx.scene.remove(o);
    o.traverse((x) => {
      const mat = (x as THREE.Mesh).material as THREE.Material | undefined;
      mat?.dispose();
      if (!(x instanceof THREE.Sprite) && (x as THREE.Mesh).geometry && (x as THREE.Mesh).geometry !== shardGeo) (x as THREE.Mesh).geometry.dispose();
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

/** The azure circle: snaps open, turns, an additive copy pulses on top. `follow` moves it with a player. */
export function blueCircle(ctx: XSlashCtx, at: () => THREE.Vector3, r: number, sec: number, delay = 0, spin = 0.9) {
  const m = groundPlane(circle(), r * 2);
  const glow = groundPlane(circle(), r * 2, true);
  m.visible = glow.visible = false;
  ctx.scene.add(m, glow);
  const mat = m.material as THREE.MeshBasicMaterial;
  const gmat = glow.material as THREE.MeshBasicMaterial;
  gmat.color.set(0x3aa8ff);
  anim(ctx, sec, delay, (t) => {
    const p = at();
    m.position.set(p.x, 0.05, p.z);
    glow.position.set(p.x, 0.06, p.z);
    m.visible = glow.visible = true;
    const k = Math.min(1, t / 0.25);
    const fade = Math.min(1, (sec - t) / 0.4);
    m.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - k, 3)));
    glow.scale.copy(m.scale).multiplyScalar(1.02);
    m.rotation.z = t * spin;
    glow.rotation.z = -t * spin * 0.7;
    mat.opacity = Math.max(0, fade);
    gmat.opacity = Math.max(0, 0.4 * fade * (0.7 + 0.3 * Math.sin(t * 18)));
  }, () => dispose(ctx, m, glow));
}

export function blueShock(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0) {
  const m = groundPlane(shock(), 2, true);
  const solid = groundPlane(shock(), 2);
  m.position.set(x, 0.09, z);
  solid.position.set(x, 0.08, z);
  m.visible = solid.visible = false;
  ctx.scene.add(m, solid);
  const mat = m.material as THREE.MeshBasicMaterial;
  const smat = solid.material as THREE.MeshBasicMaterial;
  smat.color.set(0x0838c0);
  anim(ctx, sec, delay, (_t, k) => {
    m.visible = solid.visible = true;
    m.scale.setScalar(0.2 + r * (1 - Math.pow(1 - k, 2.5)));
    solid.scale.copy(m.scale).multiplyScalar(1.03);
    mat.opacity = 1 - k;
    smat.opacity = 0.75 * (1 - k);
  }, () => dispose(ctx, m, solid));
}

function rays(ctx: XSlashCtx, at: THREE.Vector3, n: number, len: number, delay = 0) {
  const count = Math.max(4, Math.round(n * Q));
  for (let i = 0; i < count; i++) {
    const s = i % 3 === 1 ? sprite(ctx, ray(), KB.deep, false) : sprite(ctx, ray(), i % 3 ? KB.cyan : KB.ice, true);
    s.center.set(0.5, 0);
    s.position.copy(at);
    s.material.depthTest = false;
    s.material.rotation = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    s.renderOrder = 11;
    s.visible = false;
    const l = len * (0.5 + Math.random() * 0.7);
    anim(ctx, 0.45, delay, (_t, k) => {
      s.visible = true;
      s.scale.set(0.18 * (1 - k * 0.5), l * Math.min(1, k * 4), 1);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
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

/** Twinkling stars thrown out from `at`. */
function twinkles(ctx: XSlashCtx, at: THREE.Vector3, n: number, speed: number, up = 1, delay = 0) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = sprite(ctx, star(), i % 3 === 0 ? KB.ice : i % 3 === 1 ? KB.cyan : 0x7fb0ff, true);
    s.position.copy(at);
    s.visible = false;
    const a = Math.random() * Math.PI * 2;
    const sp = speed * (0.4 + Math.random() * 0.8);
    const v = new THREE.Vector3(Math.cos(a) * sp, (0.5 + Math.random()) * speed * 0.6 * up, Math.sin(a) * sp);
    const size = 0.2 + Math.random() * 0.3;
    anim(ctx, 0.7 + Math.random() * 0.5, delay + Math.random() * 0.1, (t, k, dt) => {
      s.visible = true;
      s.position.addScaledVector(v, dt);
      v.multiplyScalar(1 - dt * 2.5);
      s.material.rotation = t * 3;
      s.scale.setScalar(size * (1 - k) * (0.7 + 0.3 * Math.sin(t * 30 + i)));
      s.material.opacity = 1 - k * k;
    }, () => dispose(ctx, s));
  }
}

/** Ice-blue crystal shards bursting out of an impact. */
function shards(ctx: XSlashCtx, at: THREE.Vector3, n: number, power: number) {
  shardGeo ??= new THREE.OctahedronGeometry(1, 0);
  shardMat ??= new THREE.MeshBasicMaterial({ color: 0x9fe4ff, transparent: true, opacity: 0.9 });
  for (let i = 0; i < Math.max(2, Math.round(n * Q)); i++) {
    const m = new THREE.Mesh(shardGeo, shardMat);
    const s = 0.05 + Math.random() * 0.1;
    m.scale.set(s * 0.6, s * 2, s * 0.6);
    m.position.copy(at);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    ctx.scene.add(m);
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.5 + Math.random());
    const v = new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * power * 1.5, Math.sin(a) * sp);
    const spin = new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0);
    anim(ctx, 0.8 + Math.random() * 0.3, 0, (_t, k, dt) => {
      v.y -= 14 * dt;
      m.position.addScaledVector(v, dt);
      if (m.position.y < 0.05) {
        m.position.y = 0.05;
        v.multiplyScalar(0.4);
        v.y = Math.abs(v.y);
      }
      m.rotation.x += spin.x * dt;
      m.rotation.y += spin.y * dt;
      m.scale.setScalar(s * (1 - k * 0.8));
      m.scale.y *= 3;
    }, () => ctx.scene.remove(m));
  }
}

/** Notes rising and fading round (x,z). */
function risingNotes(ctx: XSlashCtx, x: number, z: number, r: number, n: number, sec = 1.4, delay = 0) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(NOTES[i % 4]), transparent: true, depthWrite: false }));
    ctx.scene.add(s);
    s.visible = false;
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const rr = r * (0.5 + Math.random() * 0.6);
    const h = 1.6 + Math.random() * 1.6;
    anim(ctx, sec * (0.7 + Math.random() * 0.5), delay + Math.random() * 0.3, (t, k) => {
      s.visible = true;
      const an = a + t * 1.6;
      s.position.set(x + Math.cos(an) * rr, 0.3 + k * h, z + Math.sin(an) * rr);
      s.scale.setScalar(0.45 * (k < 0.15 ? k / 0.15 : 1));
      s.material.opacity = Math.min(1, (1 - k) * 2.5);
    }, () => dispose(ctx, s));
  }
}

/** A column of light: a solid blue core plus an additive halo; `height` tall. */
function pillar(ctx: XSlashCtx, at: () => THREE.Vector3, width: number, height: number, sec: number, delay = 0, color: number = KB.cyan) {
  const mk = (w: number, c: number, additive: boolean, o: number) => {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(w, w * 1.15, height, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: ray(), color: c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
    );
    (m.material as THREE.MeshBasicMaterial).map = verticalFade();
    m.userData.o = o;
    return m;
  };
  const parts = [mk(width * 1.35, KB.deep, false, 0.5), mk(width, color, true, 1), mk(width * 0.45, 0xffffff, true, 1)];
  parts.forEach((m) => {
    m.visible = false;
    ctx.scene.add(m);
  });
  anim(ctx, sec, delay, (t, k) => {
    const p = at();
    const grow = Math.min(1, t / 0.18);
    const fade = Math.min(1, (sec - t) / 0.35);
    parts.forEach((m, i) => {
      m.visible = true;
      m.position.set(p.x, height / 2, p.z);
      m.scale.set(grow * (1 + 0.06 * Math.sin(t * 25 + i)), 1, grow * (1 + 0.06 * Math.sin(t * 25 + i)));
      m.rotation.y = t * (i % 2 ? -2 : 2);
      (m.material as THREE.MeshBasicMaterial).opacity = m.userData.o * fade * (1 - k * 0.2);
    });
  }, () => dispose(ctx, ...parts));
}

let vfadeTex: THREE.Texture | undefined;
/** Bright at the bottom fading out to the top, soft on the vertical seams; for cylinders. */
function verticalFade() {
  return (vfadeTex ??= canvasTexture(64, 128, (c) => {
    const g = c.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 128);
    c.globalCompositeOperation = 'destination-in';
    for (let x = 0; x < 64; x += 16) {
      const h = c.createLinearGradient(x, 0, x + 16, 0);
      h.addColorStop(0, 'rgba(0,0,0,0.5)');
      h.addColorStop(0.5, 'rgba(0,0,0,1)');
      h.addColorStop(1, 'rgba(0,0,0,0.5)');
      c.fillStyle = h;
      c.fillRect(x, 0, 16, 128);
    }
  }));
}

/** A ribbon spiralling up round (x,z): `turns` turns over `height`. */
function spiral(ctx: XSlashCtx, at: () => THREE.Vector3, r: number, height: number, turns: number, color: number, sec: number, delay = 0, phase = 0) {
  const n = PHONE ? 60 : 110;
  const pos = new Float32Array((n + 1) * 6);
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    uv.push(i / n, 1, i / n, 0);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(geo, mat);
  m.visible = false;
  ctx.scene.add(m);
  anim(ctx, sec, delay, (t, k) => {
    m.visible = true;
    const p = at();
    m.position.set(p.x, 0, p.z);
    // the visible part sweeps up: a window [lo, hi] along the spiral
    const hi = Math.min(1, k * 1.6);
    const lo = Math.max(0, k * 1.6 - 0.6);
    for (let i = 0; i <= n; i++) {
      const u = lo + (hi - lo) * (i / n);
      const th = phase + u * turns * Math.PI * 2 + t * 2;
      const rr = r * (1 - u * 0.35);
      const y = u * height;
      const w = 0.12 * Math.sin((i / n) * Math.PI);
      pos.set([Math.cos(th) * rr, y + w, Math.sin(th) * rr, Math.cos(th) * rr, y - w, Math.sin(th) * rr], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 1 - k * 0.6;
  }, () => dispose(ctx, m));
}

// ------------------------------------------------------------ the skills

/**
 * ตัวโน้ตทำลาย (new): while casting, the 3x3 tiles round (x,z) light up as nine key-squares inside an azure circle
 * that charges up over `ms`. Keeps going until `alive()` is false (the cast ended or was broken).
 */
export function noteRainCharge(ctx: XSlashCtx, x: number, z: number, half: number, ms: number, alive: () => boolean) {
  const size = half * 2;
  const g = groundPlane(grid(), size, true);
  const gd = groundPlane(grid(), size);
  (gd.material as THREE.MeshBasicMaterial).color.set(0x2a70ff);
  const c1 = groundPlane(circle(), size * 1.45);
  const c1g = groundPlane(circle(), size * 1.45, true);
  (c1g.material as THREE.MeshBasicMaterial).color.set(0x3aa8ff);
  for (const m of [g, gd, c1, c1g]) m.position.set(x, 0.05, z);
  gd.position.y = 0.065;
  g.position.y = 0.075;
  ctx.scene.add(c1, c1g, gd, g);
  // a ring of notes slowly orbiting over the area, higher as the charge builds
  const nn = PHONE ? 6 : 10;
  const notes = Array.from({ length: nn }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(NOTES[i % 4]), transparent: true, depthWrite: false }));
    ctx.scene.add(s);
    return s;
  });
  let t = 0;
  let spark = 0;
  let out = 0;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, (t * 1000) / ms);
    const on = alive();
    if (!on) out += dt;
    const f = Math.min(1, t / 0.3) * Math.max(0, 1 - out / 0.3);
    const pulse = 0.75 + 0.25 * Math.sin(t * (6 + k * 18));
    (g.material as THREE.MeshBasicMaterial).opacity = (0.5 + 0.5 * k) * pulse * f;
    (gd.material as THREE.MeshBasicMaterial).opacity = 0.9 * f;
    (c1.material as THREE.MeshBasicMaterial).opacity = 0.9 * f;
    (c1g.material as THREE.MeshBasicMaterial).opacity = (0.15 + 0.4 * k) * pulse * f;
    c1.rotation.z = t * (0.4 + k * 2.5);
    c1g.rotation.z = -t * (0.3 + k * 2);
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.35), 3);
    c1.scale.setScalar(0.3 + 0.7 * grow);
    c1g.scale.copy(c1.scale);
    notes.forEach((s, i) => {
      const a = (i / nn) * Math.PI * 2 + t * (0.8 + k * 2);
      const r = half * 1.25;
      s.position.set(x + Math.cos(a) * r, 0.6 + k * 2.6 + Math.sin(t * 4 + i) * 0.15, z + Math.sin(a) * r);
      s.scale.setScalar(0.42);
      s.material.opacity = f;
    });
    // motes rising out of the grid, faster near the end
    spark += dt * (2 + k * 14) * Q * f;
    while (spark > 1) {
      spark -= 1;
      const s = sprite(ctx, star(), Math.random() < 0.5 ? KB.ice : KB.cyan, true);
      s.position.set(x + (Math.random() - 0.5) * size, 0.1, z + (Math.random() - 0.5) * size);
      const vy = 1.5 + Math.random() * 2;
      const sz = 0.12 + Math.random() * 0.15;
      anim(ctx, 0.8, 0, (_t2, k2, dt2) => {
        s.position.y += vy * dt2;
        s.scale.setScalar(sz * (1 - k2));
        s.material.opacity = 1 - k2;
      }, () => dispose(ctx, s));
    }
    if (out >= 0.3) {
      dispose(ctx, g, gd, c1, c1g, ...notes);
      return false;
    }
    return true;
  });
}

/**
 * ตัวโน้ตทำลาย (new): `waves` volleys of notes fall out of the sky onto the 3x3 area, `gapMs` apart; each lands in a
 * blue starburst. The last volley is the biggest. `onWave(i)` fires as each volley lands (sound / numbers).
 */
export function noteRainStrike(ctx: XSlashCtx, x: number, z: number, half: number, waves: number, gapMs: number, onWave: (i: number) => void) {
  const size = half * 2;
  blueCircle(ctx, () => new THREE.Vector3(x, 0, z), size * 0.78, (waves * gapMs) / 1000 + 0.8, 0, 1.5);
  pillar(ctx, () => new THREE.Vector3(x, 0, z), half * 0.9, 7, (waves * gapMs) / 1000 + 0.4, 0, KB.blue);
  const fall = 0.28;
  for (let w = 0; w < waves; w++) {
    const last = w === waves - 1;
    const n = last ? (PHONE ? 6 : 9) : PHONE ? 3 : 5;
    const delay = (w * gapMs) / 1000;
    for (let i = 0; i < n; i++) {
      // last volley: one note on each of the nine tiles
      const tx = last ? x + ((i % 3) - 1) * (size / 3) : x + (Math.random() - 0.5) * size * 0.9;
      const tz = last ? z + (Math.floor(i / 3) - 1) * (size / 3) : z + (Math.random() - 0.5) * size * 0.9;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(NOTES[(i + w) % 4]), transparent: true, depthWrite: false }));
      const glow = sprite(ctx, sparkTexture(), KB.cyan, true);
      ctx.scene.add(s);
      s.visible = glow.visible = false;
      const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: ray(), color: KB.cyan, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      tail.center.set(0.5, 0);
      tail.visible = false;
      ctx.scene.add(tail);
      const d = delay + Math.random() * 0.12;
      const big = last ? 1.1 : 0.85;
      anim(ctx, fall, d, (_t, k) => {
        s.visible = glow.visible = tail.visible = true;
        const y = 7.5 * (1 - k * k) + 0.4;
        s.position.set(tx, y, tz);
        s.scale.setScalar(big);
        glow.position.copy(s.position);
        glow.scale.setScalar(big * 1.8);
        tail.position.set(tx, y, tz);
        tail.scale.set(0.3, 2.2, 1);
      }, () => {
        dispose(ctx, s, glow, tail);
        const at = new THREE.Vector3(tx, 0.4, tz);
        blueShock(ctx, tx, tz, last ? 2.2 : 1.4, 0.4);
        flash(ctx, at, last ? 2.4 : 1.6, KB.cyan, 0.3);
        twinkles(ctx, at, last ? 6 : 4, 2.5);
        if (i % 2 === 0) shards(ctx, at, 3, 1.5);
      });
    }
    anim(ctx, fall + 0.02, delay, () => {}, () => {
      onWave(w);
      ctx.sparks(new THREE.Vector3(x, 0.5, z), KB.cyan, Math.round((last ? 30 : 12) * Q), last ? 7 : 4);
      ctx.shake(last ? 0.4 : 0.14);
      if (last) {
        rays(ctx, new THREE.Vector3(x, 0.6, z), 16, 3);
        flash(ctx, new THREE.Vector3(x, 0.8, z), size * 1.5, KB.ice, 0.45);
        blueShock(ctx, x, z, size * 1.4, 0.6);
      }
    });
  }
}

/** ฟื้นฟู: a blue circle, a column of light, crosses and notes rising round the player healed. */
export function restoreFx(ctx: XSlashCtx, at: () => THREE.Vector3) {
  const p = at();
  ctx.sound(false);
  blueCircle(ctx, at, 1.4, 1.5, 0, 1.4);
  pillar(ctx, at, 0.55, 4, 1.2);
  spiral(ctx, at, 0.85, 2.6, 2, KB.cyan, 1.3);
  spiral(ctx, at, 0.85, 2.6, 2, KB.ice, 1.3, 0, Math.PI);
  flash(ctx, p.clone().setY(1), 2.2, KB.cyan, 0.5);
  risingNotes(ctx, p.x, p.z, 0.9, 6, 1.4);
  for (let i = 0; i < Math.round(10 * Q); i++) {
    const s = sprite(ctx, cross(), i % 2 ? KB.ice : 0x8fe0ff, true);
    s.visible = false;
    const a = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 0.7;
    const sz = 0.2 + Math.random() * 0.18;
    anim(ctx, 1 + Math.random() * 0.4, Math.random() * 0.5, (_t, k) => {
      s.visible = true;
      const q = at();
      s.position.set(q.x + Math.cos(a) * r, 0.3 + k * 2.2, q.z + Math.sin(a) * r);
      s.scale.setScalar(sz * (k < 0.2 ? k / 0.2 : 1));
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
  twinkles(ctx, p.clone().setY(1.2), 10, 1.5, 1.5, 0.15);
}

/** เร่งจังหวะ (AGI): cyan wind spirals whip up round the player, chevrons shoot upward, speed streaks. */
export function tempoFx(ctx: XSlashCtx, at: () => THREE.Vector3) {
  const p = at();
  ctx.sound(false);
  blueCircle(ctx, at, 1.3, 1.1, 0, 5);
  for (let i = 0; i < 3; i++) spiral(ctx, at, 0.9 - i * 0.12, 2.8, 3, i === 1 ? KB.ice : KB.cyan, 0.8, i * 0.08, (i * Math.PI * 2) / 3);
  blueShock(ctx, p.x, p.z, 2.6, 0.45);
  for (let i = 0; i < Math.round(9 * Q); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture('︽', '#e8f8ff', 'rgba(0,40,160,0.95)'), transparent: true, depthWrite: false }));
    ctx.scene.add(s);
    s.visible = false;
    const a = (i / 9) * Math.PI * 2;
    anim(ctx, 0.6, 0.05 + (i % 3) * 0.12, (_t, k) => {
      s.visible = true;
      const q = at();
      s.position.set(q.x + Math.cos(a) * 0.75, 0.2 + k * 2.8, q.z + Math.sin(a) * 0.75);
      s.scale.setScalar(0.5);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
  for (let i = 0; i < Math.round(10 * Q); i++) {
    const s = sprite(ctx, ray(), i % 2 ? KB.cyan : KB.ice, true);
    s.center.set(0.5, 0);
    s.visible = false;
    const a = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 0.6;
    anim(ctx, 0.4, Math.random() * 0.4, (_t, k) => {
      s.visible = true;
      const q = at();
      s.position.set(q.x + Math.cos(a) * r, 0.1 + k * 1.5, q.z + Math.sin(a) * r);
      s.scale.set(0.08, 1.4, 1);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

/** คุมจังหวะ (DEX/STR/INT): a circle like a clock face, three orbs swing round like a metronome then dive into the player. */
export function controlFx(ctx: XSlashCtx, at: () => THREE.Vector3) {
  const p = at();
  ctx.sound(false);
  blueCircle(ctx, at, 1.6, 1.4, 0, -1.5);
  pillar(ctx, at, 0.4, 3, 0.9, 0.85, KB.blue);
  const cols = [0x5ad0ff, 0x2a6cff, 0xb0f0ff];
  cols.forEach((c, i) => {
    const s = sprite(ctx, sparkTexture(), c, true);
    const core = sprite(ctx, star(), 0xffffff, true);
    let trail = 0;
    anim(ctx, 1.05, 0, (t, k, dt) => {
      const q = at();
      const a = (i / 3) * Math.PI * 2 + t * 6;
      const r = 1.2 * (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25);
      const y = 1.1 + Math.sin(t * 5 + i) * 0.35;
      s.position.set(q.x + Math.cos(a) * r, y, q.z + Math.sin(a) * r);
      core.position.copy(s.position);
      s.scale.setScalar(0.7);
      core.scale.setScalar(0.35);
      core.material.rotation = t * 4;
      trail += dt;
      if (trail > 0.03) {
        trail = 0;
        const tr = sprite(ctx, sparkTexture(), c, true);
        tr.position.copy(s.position);
        anim(ctx, 0.3, 0, (_t2, k2) => {
          tr.scale.setScalar(0.4 * (1 - k2));
          tr.material.opacity = 1 - k2;
        }, () => dispose(ctx, tr));
      }
    }, () => dispose(ctx, s, core));
  });
  anim(ctx, 1.05, 0, () => {}, () => {
    const q = at().setY(1);
    flash(ctx, q, 2.6, KB.cyan, 0.4);
    rays(ctx, q, 10, 1.6);
    blueShock(ctx, q.x, q.z, 2.4, 0.45);
    risingNotes(ctx, q.x, q.z, 0.8, 5, 1.2);
  });
}

/** โซโล่ (LUK): a spotlight from the sky, a ring of stars bursting out, a big star twinkling overhead. */
export function soloFx(ctx: XSlashCtx, at: () => THREE.Vector3) {
  const p = at();
  ctx.sound(false);
  blueCircle(ctx, at, 1.4, 1.4, 0, 1);
  // spotlight cone
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 1.3, 8, 28, 1, true),
    new THREE.MeshBasicMaterial({ map: verticalFade(), color: 0x8fd8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ctx.scene.add(cone);
  anim(ctx, 1.4, 0, (t, k) => {
    const q = at();
    cone.position.set(q.x, 4, q.z);
    cone.rotation.x = Math.PI; // wide at the bottom: flip so the bright end is at the feet
    cone.rotation.y = t;
    (cone.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.min(1, t / 0.15) * (1 - k);
  }, () => dispose(ctx, cone));
  const big = sprite(ctx, star(), 0xffffff, true);
  anim(ctx, 1.2, 0.1, (t, k) => {
    const q = at();
    big.position.set(q.x, 2.5 + k * 0.4, q.z);
    big.material.rotation = t * 2;
    big.scale.setScalar(1.6 * Math.sin(Math.min(1, k * 1.2) * Math.PI) + 0.1);
    big.material.opacity = 1 - k * 0.5;
  }, () => dispose(ctx, big));
  twinkles(ctx, p.clone().setY(1.4), 22, 4, 1.2, 0.1);
  twinkles(ctx, p.clone().setY(0.3), 12, 3, 0.4, 0.2);
  flash(ctx, p.clone().setY(1.2), 2.4, KB.ice, 0.45, 0.05);
  risingNotes(ctx, p.x, p.z, 1, 6, 1.5, 0.15);
}

/** ประสานเสียง (shield): a hexagon dome of light closes over the player and flashes once. */
export function chorusFx(ctx: XSlashCtx, at: () => THREE.Vector3) {
  const p = at();
  ctx.sound(false);
  blueCircle(ctx, at, 1.5, 1.6, 0, 0.6);
  const tex = hex().clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 2);
  tex.needsUpdate = true;
  const domeGeo = new THREE.SphereGeometry(1.15, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ map: tex, color: KB.cyan, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const fill = new THREE.Mesh(domeGeo.clone(), new THREE.MeshBasicMaterial({ color: KB.blue, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  ctx.scene.add(fill, dome);
  anim(ctx, 1.6, 0, (t, k) => {
    const q = at();
    dome.position.set(q.x, 0.02, q.z);
    fill.position.copy(dome.position);
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.35), 3);
    dome.scale.set(grow, grow * 1.35, grow);
    fill.scale.copy(dome.scale).multiplyScalar(0.98);
    dome.rotation.y = t * 0.8;
    const hit = t > 0.35 && t < 0.55 ? 1 : 0;
    (dome.material as THREE.MeshBasicMaterial).opacity = (0.85 + hit * 0.15) * (1 - k * k);
    (fill.material as THREE.MeshBasicMaterial).opacity = (0.18 + hit * 0.15) * (1 - k);
  }, () => dispose(ctx, dome, fill));
  anim(ctx, 0.35, 0, () => {}, () => {
    const q = at().setY(1.1);
    flash(ctx, q, 3, KB.cyan, 0.35);
    twinkles(ctx, q, 12, 2.5);
    blueShock(ctx, q.x, q.z, 2.8, 0.5);
  });
  risingNotes(ctx, p.x, p.z, 1.2, 8, 1.6, 0.2);
}

/**
 * ชุบชีวิต: a great azure circle, a pillar of light out of the sky, feathers drifting down, wings of light opening
 * behind the player as they stand back up, and a burst of stars.
 */
export function reviveFx(ctx: XSlashCtx, at: () => THREE.Vector3) {
  const p = at();
  ctx.sound(false);
  blueCircle(ctx, at, 2.4, 2.6, 0, 0.7);
  blueCircle(ctx, at, 1.3, 2.4, 0.15, -1.6);
  pillar(ctx, at, 0.8, 12, 2.2, 0, KB.cyan);
  spiral(ctx, at, 1.2, 4, 2.5, KB.ice, 1.6, 0.2);
  spiral(ctx, at, 1.2, 4, 2.5, KB.cyan, 1.6, 0.2, Math.PI);
  // feathers drifting down
  for (let i = 0; i < Math.round(16 * Q); i++) {
    const s = sprite(ctx, feather(), 0xffffff, false);
    s.visible = false;
    const a = Math.random() * Math.PI * 2;
    const r = 0.3 + Math.random() * 1.6;
    const sz = 0.22 + Math.random() * 0.12;
    anim(ctx, 2 + Math.random() * 0.8, Math.random() * 0.8, (t, k) => {
      s.visible = true;
      const q = at();
      s.position.set(q.x + Math.cos(a + t * 0.6) * r, 4.5 * (1 - k) + 0.2, q.z + Math.sin(a + t * 0.6) * r);
      s.material.rotation = Math.sin(t * 3 + i) * 0.7;
      s.scale.set(sz * 0.5, sz, 1);
      s.material.opacity = Math.min(1, (1 - k) * 3);
    }, () => dispose(ctx, s));
  }
  // wings
  const wings = [1, -1].map((side) => {
    const s = sprite(ctx, wing(), 0xffffff, false);
    const g = sprite(ctx, wing(), KB.cyan, true);
    s.center.set(0.05, 0.4);
    g.center.copy(s.center);
    s.visible = g.visible = false;
    return { s, g, side };
  });
  anim(ctx, 2, 0.6, (t, k) => {
    const q = at();
    const open = Math.min(1, t / 0.45);
    const fade = Math.min(1, (1 - k) * 2.5);
    for (const w of wings) {
      w.s.visible = w.g.visible = true;
      w.s.position.set(q.x, 1.25 + k * 0.3, q.z);
      w.g.position.copy(w.s.position);
      const sc = 2.1 * (0.3 + 0.7 * (1 - Math.pow(1 - open, 3)));
      w.s.scale.set(sc * w.side, sc, 1);
      w.g.scale.set(sc * 1.08 * w.side, sc * 1.08, 1);
      w.s.material.rotation = w.side * (Math.sin(t * 5) * 0.08);
      w.g.material.rotation = w.s.material.rotation;
      w.s.material.opacity = 0.9 * fade;
      w.g.material.opacity = 0.6 * fade;
    }
  }, () => wings.forEach((w) => dispose(ctx, w.s, w.g)));
  anim(ctx, 0.6, 0, () => {}, () => {
    const q = at().setY(1);
    ctx.sound(true);
    flash(ctx, q, 4.5, KB.ice, 0.6);
    flash(ctx, q, 3, KB.cyan, 0.5);
    rays(ctx, q, 18, 3.2);
    blueShock(ctx, q.x, q.z, 4, 0.7);
    twinkles(ctx, q, 24, 4, 1.4);
    ctx.sparks(q, KB.cyan, Math.round(30 * Q), 6);
    ctx.shake(0.25);
  });
  risingNotes(ctx, p.x, p.z, 1.4, 10, 2, 0.6);
}

/**
 * The keyboardist's buffs leave a blue aura round each player who got one, for as long as it lasts (like the
 * guitarist's Vibrato aura, 2026-11-08): a slow piano-key circle under the feet with a pulsing glow, a haze round
 * the body, two rings of light turning round the waist, ice-white notes circling and little sparks drifting up.
 * Runs until `alive()` turns false, then fades out.
 */
export function keyAura(ctx: XSlashCtx, at: () => THREE.Vector3, alive: () => boolean) {
  const keys = groundPlane(circle(), 1.9);
  const glow = groundPlane(sparkTexture(), 2.6, true);
  (glow.material as THREE.MeshBasicMaterial).color.set(KB.cyan);
  const shade = groundPlane(sparkTexture(), 2.2);
  (shade.material as THREE.MeshBasicMaterial).color.set(KB.deep);
  ctx.scene.add(shade, keys, glow);
  const haze = sprite(ctx, sparkTexture(), KB.blue, true);
  haze.material.depthTest = false;
  const hazeDeep = sprite(ctx, sparkTexture(), KB.deep, false);
  const ringMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = [
    new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.022, 6, 48), ringMat(KB.cyan, 1)),
    new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.016, 6, 48), ringMat(KB.ice, 0.9)),
  ];
  rings.forEach((r) => ctx.scene.add(r));
  const nn = PHONE ? 4 : 7;
  const notes = Array.from({ length: nn }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(NOTES[i % 4]), transparent: true, depthWrite: false }));
    ctx.scene.add(s);
    return { s, a: (i / nn) * Math.PI * 2, h: 0.5 + (i % 3) * 0.5, r: 0.8 + (i % 2) * 0.22 };
  });
  const sparks: { s: THREE.Sprite; t: number; life: number; a: number; r: number }[] = [];
  let spawn = 0;
  let t = 0;
  let fade = 1;
  ctx.add((dt) => {
    t += dt;
    const on = alive();
    if (!on) fade = Math.max(0, fade - dt / 0.5);
    const f = Math.min(1, t / 0.4) * fade;
    const p = at();
    const pulse = 0.85 + 0.15 * Math.sin(t * 5);
    keys.position.set(p.x, 0.05, p.z);
    keys.rotation.z = t * 0.4;
    (keys.material as THREE.MeshBasicMaterial).opacity = 0.75 * f;
    glow.position.set(p.x, 0.055, p.z);
    glow.scale.setScalar(pulse);
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.7 * f;
    shade.position.set(p.x, 0.045, p.z);
    (shade.material as THREE.MeshBasicMaterial).opacity = 0.35 * f;
    haze.position.set(p.x, 0.95, p.z);
    haze.scale.set(1.9 + Math.sin(t * 6) * 0.1, 2.5, 1);
    haze.material.opacity = 0.4 * f;
    hazeDeep.position.set(p.x, 0.9, p.z);
    hazeDeep.scale.set(1.8, 2.4, 1);
    hazeDeep.material.opacity = 0.18 * f;
    rings.forEach((r, i) => {
      r.position.set(p.x, 0.55 + i * 0.6 + Math.sin(t * 2.2 + i * 2) * 0.12, p.z);
      r.rotation.set(Math.PI / 2 + Math.sin(t * 1.5 + i) * 0.25, 0, t * (i ? -1.2 : 1.5));
      (r.material as THREE.MeshBasicMaterial).opacity = (i ? 0.75 : 1) * f * (0.75 + 0.25 * Math.sin(t * 8 + i));
    });
    for (const n of notes) {
      const an = n.a + t * 1.2;
      n.s.position.set(p.x + Math.cos(an) * n.r, n.h + Math.sin(t * 2 + n.a * 2) * 0.18, p.z + Math.sin(an) * n.r);
      n.s.scale.setScalar(0.42 + 0.05 * Math.sin(t * 6 + n.a));
      n.s.material.opacity = f;
    }
    spawn += dt * f;
    const every = PHONE ? 0.16 : 0.08;
    while (spawn > every) {
      spawn -= every;
      const s = sprite(ctx, Math.random() < 0.4 ? star() : sparkTexture(), Math.random() < 0.5 ? KB.cyan : KB.ice, true);
      sparks.push({ s, t: 0, life: 0.8 + Math.random() * 0.6, a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.55 });
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.t += dt;
      const k = sp.t / sp.life;
      sp.s.position.set(p.x + Math.cos(sp.a + k) * sp.r, 0.1 + k * 2.2, p.z + Math.sin(sp.a + k) * sp.r);
      sp.s.scale.setScalar(0.22 * (1 - k * 0.5));
      sp.s.material.opacity = Math.min(1, (1 - k) * 2);
      if (k >= 1) {
        dispose(ctx, sp.s);
        sparks.splice(i, 1);
      }
    }
    if (fade <= 0) {
      dispose(ctx, keys, glow, shade, haze, hazeDeep, ...rings, ...notes.map((n) => n.s), ...sparks.map((sp) => sp.s));
      return false;
    }
    return true;
  });
}
