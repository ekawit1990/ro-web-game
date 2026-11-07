import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture } from './toon';
import type { XSlashCtx } from './xslash';

/**
 * The guitarist's skills in red: crimson magic circles with a ring of guitar picks, flame tongues, embers,
 * glowing ground cracks and blood-red crescents. Same building blocks as the drummer's purple set in
 * xslash.ts, but its own textures so the two classes never share colours.
 */

type Effect = (dt: number) => boolean;

const Q = PHONE ? 0.5 : 1;
const TEX = PHONE ? 256 : 512;

let circleTex: THREE.Texture | undefined;
let shockTex: THREE.Texture | undefined;
let rayTex: THREE.Texture | undefined;
let flameTex: THREE.Texture | undefined;
let crackTex: THREE.Texture | undefined;
let bladeTex: THREE.Texture | undefined;
let puffTex: THREE.Texture | undefined;
let rockGeo: THREE.BufferGeometry | undefined;
let rockMat: THREE.Material | undefined;
const arcGeos = new Map<string, THREE.BufferGeometry>();

/** A guitar pick (rounded triangle) centred on 0,0, point down. */
function pickPath(c: CanvasRenderingContext2D, s: number) {
  c.beginPath();
  c.moveTo(0, s * 1.1);
  c.bezierCurveTo(-s * 0.35, s * 0.6, -s * 1.05, -s * 0.1, -s * 0.85, -s * 0.65);
  c.bezierCurveTo(-s * 0.6, -s * 1.1, s * 0.6, -s * 1.1, s * 0.85, -s * 0.65);
  c.bezierCurveTo(s * 1.05, -s * 0.1, s * 0.35, s * 0.6, 0, s * 1.1);
  c.closePath();
}

/** Crimson magic circle: double rings, a ring of guitar picks, a six-string star and lightning-bolt spokes. */
function circle() {
  return (circleTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 245);
    g.addColorStop(0, 'rgba(255,120,40,0.5)');
    g.addColorStop(0.55, 'rgba(200,20,10,0.25)');
    g.addColorStop(0.95, 'rgba(180,0,0,0.45)');
    g.addColorStop(1, 'rgba(180,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 245, 0, Math.PI * 2);
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
      ring(238, 7);
      ring(224, 2);
      ring(176, 3);
      ring(168, 1.5);
      ring(96, 3);
      ring(48, 5);
      // twelve picks between the outer rings
      for (let i = 0; i < 12; i++) {
        c.save();
        c.rotate((i / 12) * Math.PI * 2);
        c.translate(0, -200);
        c.lineWidth = 2.5 + extra;
        pickPath(c, 13);
        c.stroke();
        c.restore();
        c.save();
        c.rotate(((i + 0.5) / 12) * Math.PI * 2);
        c.fillRect(-2 - extra / 2, -222, 4 + extra, 18);
        c.restore();
      }
      // six-point star (two triangles) for the six strings
      c.lineWidth = 4 + extra;
      for (const r0 of [-Math.PI / 2, Math.PI / 2]) {
        c.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = r0 + (i / 3) * Math.PI * 2;
          if (i) c.lineTo(Math.cos(a) * 168, Math.sin(a) * 168);
          else c.moveTo(Math.cos(a) * 168, Math.sin(a) * 168);
        }
        c.stroke();
      }
      // lightning-bolt spokes from the inner ring
      c.lineWidth = 3 + extra;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const px = -sa;
        const py = ca;
        c.beginPath();
        c.moveTo(ca * 48, sa * 48);
        c.lineTo(ca * 66 + px * 8, sa * 66 + py * 8);
        c.lineTo(ca * 74 - px * 8, sa * 74 - py * 8);
        c.lineTo(ca * 96, sa * 96);
        c.stroke();
      }
    };
    c.shadowColor = '#ff2000';
    c.shadowBlur = 16;
    draw('rgba(110,0,0,0.92)', 5);
    c.shadowBlur = 7;
    c.shadowColor = '#ffb060';
    draw('#fff2e0', 0);
  }));
}

function shock() {
  return (shockTex ??= canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,40,0,0)');
    g.addColorStop(0.6, 'rgba(255,40,0,0)');
    g.addColorStop(0.84, 'rgba(255,70,20,0.8)');
    g.addColorStop(0.93, 'rgba(255,230,180,1)');
    g.addColorStop(1, 'rgba(255,230,180,0)');
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

/** A flame tongue: white-yellow core, orange, red, dark-red edge; base at the bottom. */
function flame() {
  return (flameTex ??= canvasTexture(64, 128, (c) => {
    const body = (w: number, top: number, col: string | CanvasGradient) => {
      c.fillStyle = col;
      c.beginPath();
      c.moveTo(32, top);
      c.bezierCurveTo(32 + w * 0.2, top + 30, 32 + w, 70, 32 + w * 0.8, 100);
      c.bezierCurveTo(32 + w * 0.6, 124, 32 - w * 0.6, 124, 32 - w * 0.8, 100);
      c.bezierCurveTo(32 - w, 70, 32 - w * 0.2, top + 30, 32, top);
      c.fill();
    };
    c.filter = 'blur(3px)';
    body(28, 4, 'rgba(160,0,0,0.85)');
    body(22, 18, 'rgba(255,40,0,0.95)');
    body(15, 40, 'rgba(255,150,20,1)');
    body(8, 66, 'rgba(255,245,200,1)');
  }));
}

/** Glowing cracks radiating from the middle. */
function cracks() {
  return (crackTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const paths: [number, number][][] = [];
    for (let i = 0; i < 11; i++) {
      let a = (i / 11) * Math.PI * 2 + Math.random() * 0.3;
      let r = 20;
      const p: [number, number][] = [[Math.cos(a) * r, Math.sin(a) * r]];
      const len = 150 + Math.random() * 90;
      while (r < len) {
        r += 18 + Math.random() * 22;
        a += (Math.random() - 0.5) * 0.45;
        p.push([Math.cos(a) * r, Math.sin(a) * r]);
        if (Math.random() < 0.25) {
          // a short branch
          const b = a + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.4);
          paths.push([[Math.cos(a) * r, Math.sin(a) * r], [Math.cos(b) * (r + 40), Math.sin(b) * (r + 40)]]);
        }
      }
      paths.push(p);
    }
    const stroke = (col: string, w: number, blur: number) => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.shadowColor = '#ff3000';
      c.shadowBlur = blur;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      for (const p of paths) {
        c.beginPath();
        p.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.stroke();
      }
    };
    stroke('rgba(40,0,0,0.9)', 11, 0);
    stroke('rgba(255,40,0,1)', 6, 18);
    stroke('rgba(255,220,140,1)', 2, 6);
    // a scorched hole in the middle
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 60);
    g.addColorStop(0, 'rgba(255,200,120,1)');
    g.addColorStop(0.35, 'rgba(255,60,0,0.9)');
    g.addColorStop(1, 'rgba(60,0,0,0)');
    c.shadowBlur = 0;
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 60, 0, Math.PI * 2);
    c.fill();
  }));
}

/** Across a crescent: dark crimson rim -> red -> orange -> white-hot edge; fading out at both tips. */
function blade() {
  return (bladeTex ??= canvasTexture(256, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(80,0,0,0)');
    g.addColorStop(0.12, 'rgba(110,0,0,0.85)');
    g.addColorStop(0.35, 'rgba(230,20,0,0.95)');
    g.addColorStop(0.55, 'rgba(255,110,30,1)');
    g.addColorStop(0.72, 'rgba(255,230,170,1)');
    g.addColorStop(0.8, 'rgba(255,255,240,1)');
    g.addColorStop(0.9, 'rgba(255,140,80,0.7)');
    g.addColorStop(1, 'rgba(255,80,40,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 14; i++) {
      c.strokeStyle = `rgba(255,255,220,${0.25 + Math.random() * 0.4})`;
      c.lineWidth = 1 + Math.random() * 1.5;
      const y = 20 + Math.random() * 30;
      const x = Math.random() * 180;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 40 + Math.random() * 60, y + (Math.random() - 0.5) * 6);
      c.stroke();
    }
    c.globalCompositeOperation = 'destination-in';
    const f = c.createLinearGradient(0, 0, 256, 0);
    f.addColorStop(0, 'rgba(0,0,0,0)');
    f.addColorStop(0.15, 'rgba(0,0,0,1)');
    f.addColorStop(0.8, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = f;
    c.fillRect(0, 0, 256, 64);
  }));
}

function puff() {
  return (puffTex ??= canvasTexture(64, 64, (c) => {
    for (const [x, y, r] of [[32, 34, 22], [22, 28, 14], [42, 26, 15], [30, 20, 12], [44, 40, 12]]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }));
}

/** A crescent strip (u along, v across) of `arc` radians at radius r, thickest at the leading end. */
function arcGeometry(r: number, w: number, arc: number) {
  const key = `${r}_${w}_${arc}`;
  const old = arcGeos.get(key);
  if (old) return old;
  const n = PHONE ? 16 : 32;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const th = -arc / 2 + u * arc;
    const ww = w * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.4 + 0.6 * u);
    for (const [rr, v] of [[r + ww / 2, 1], [r - ww / 2, 0]] as const) {
      pos.push(Math.cos(th) * rr, Math.sin(th) * rr, 0);
      uv.push(u, v);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  arcGeos.set(key, g);
  return g;
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
    });
  }
}

/** Run `f(t)` every frame for `sec` seconds after `delay`; it returns false to stop early. */
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

/** The crimson magic circle: snaps open, turns, a soft additive copy pulses on top. */
export function redCircle(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0) {
  const m = groundPlane(circle(), r * 2);
  const glow = groundPlane(circle(), r * 2, true);
  m.position.set(x, 0.05, z);
  glow.position.set(x, 0.06, z);
  m.visible = glow.visible = false;
  ctx.scene.add(m, glow);
  const mat = m.material as THREE.MeshBasicMaterial;
  const gmat = glow.material as THREE.MeshBasicMaterial;
  gmat.color.set(0xff5020);
  anim(ctx, sec, delay, (t) => {
    m.visible = glow.visible = true;
    const k = Math.min(1, t / 0.2);
    const fade = Math.min(1, (sec - t) / 0.4);
    m.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - k, 3)));
    glow.scale.copy(m.scale).multiplyScalar(1.02);
    m.rotation.z = t * 0.9;
    glow.rotation.z = -t * 0.6;
    mat.opacity = Math.max(0, fade);
    gmat.opacity = Math.max(0, 0.35 * fade * (0.7 + 0.3 * Math.sin(t * 22)));
  }, () => {
    dispose(ctx, m, glow);
    m.geometry.dispose();
    glow.geometry.dispose();
  });
}

export function redShock(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0) {
  const m = groundPlane(shock(), 2, true);
  m.position.set(x, 0.09, z);
  m.visible = false;
  ctx.scene.add(m);
  const mat = m.material as THREE.MeshBasicMaterial;
  const solid = groundPlane(shock(), 2);
  solid.position.set(x, 0.08, z);
  solid.visible = false;
  ctx.scene.add(solid);
  const smat = solid.material as THREE.MeshBasicMaterial;
  smat.color.set(0xb00000);
  anim(ctx, sec, delay, (_t, k) => {
    m.visible = solid.visible = true;
    m.scale.setScalar(0.2 + r * (1 - Math.pow(1 - k, 2.5)));
    solid.scale.copy(m.scale).multiplyScalar(1.03);
    mat.opacity = 1 - k;
    smat.opacity = 0.8 * (1 - k);
  }, () => {
    dispose(ctx, m, solid);
    m.geometry.dispose();
    solid.geometry.dispose();
  });
}

/** Glowing cracks spread out under the impact and cool down. */
function groundCracks(ctx: XSlashCtx, x: number, z: number, r: number, sec: number) {
  const m = groundPlane(cracks(), r * 2);
  m.position.set(x, 0.07, z);
  m.rotation.z = Math.random() * 6;
  ctx.scene.add(m);
  const glow = groundPlane(cracks(), r * 2, true);
  glow.position.copy(m.position);
  glow.position.y += 0.01;
  glow.rotation.z = m.rotation.z;
  ctx.scene.add(glow);
  const mat = m.material as THREE.MeshBasicMaterial;
  const gmat = glow.material as THREE.MeshBasicMaterial;
  anim(ctx, sec, 0, (t) => {
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.15), 3);
    m.scale.setScalar(0.3 + 0.7 * grow);
    glow.scale.copy(m.scale);
    mat.opacity = Math.min(1, (sec - t) / 0.5);
    gmat.opacity = Math.max(0, 0.8 * (1 - t / (sec * 0.7)));
  }, () => {
    dispose(ctx, m, glow);
    m.geometry.dispose();
    glow.geometry.dispose();
  });
}

/** Flame tongues shooting up in a ring round (x,z). */
export function flameRing(ctx: XSlashCtx, x: number, z: number, r: number, n: number, height: number, sec: number, delay = 0) {
  const count = Math.max(4, Math.round(n * Q));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const rr = r * (0.75 + Math.random() * 0.4);
    const s = sprite(ctx, flame(), 0xffffff, i % 2 === 0);
    s.center.set(0.5, 0.05);
    s.position.set(x + Math.cos(a) * rr, 0.02, z + Math.sin(a) * rr);
    s.visible = false;
    const h = height * (0.6 + Math.random() * 0.6);
    const d = delay + Math.random() * 0.08;
    const life = sec * (0.7 + Math.random() * 0.4);
    anim(ctx, life, d, (_t, k) => {
      s.visible = true;
      const up = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) * 0.6;
      s.scale.set(h * 0.42 * (1 - k * 0.4), h * up, 1);
      s.material.opacity = Math.min(1, (1 - k) * 2);
      s.material.rotation = Math.sin(k * 20 + i) * 0.08;
    }, () => dispose(ctx, s));
  }
}

/** Embers drifting up and fading. */
export function embers(ctx: XSlashCtx, x: number, z: number, spread: number, n: number, glowTex: THREE.Texture, delay = 0) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = sprite(ctx, glowTex, Math.random() < 0.5 ? 0xff5010 : 0xffb040, true);
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * spread;
    s.position.set(x + Math.cos(a) * rr, 0.2 + Math.random() * 0.6, z + Math.sin(a) * rr);
    s.visible = false;
    const v = new THREE.Vector3(Math.cos(a) * 0.6, 1.4 + Math.random() * 2.2, Math.sin(a) * 0.6);
    const size = 0.1 + Math.random() * 0.16;
    const life = 0.9 + Math.random() * 0.9;
    anim(ctx, life, delay + Math.random() * 0.25, (t, k, dt) => {
      s.visible = true;
      s.position.addScaledVector(v, dt);
      s.position.x += Math.sin(t * 9 + i) * 0.006;
      s.scale.setScalar(size * (1 - k * 0.5));
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

function rays(ctx: XSlashCtx, at: THREE.Vector3, n: number, len: number) {
  const count = Math.max(4, Math.round(n * Q));
  for (let i = 0; i < count; i++) {
    const s = i % 3 === 1 ? sprite(ctx, ray(), 0xa00000, false) : sprite(ctx, ray(), i % 3 ? 0xff7030 : 0xfff0d0, true);
    s.center.set(0.5, 0);
    s.position.copy(at);
    s.material.depthTest = false;
    s.material.rotation = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    s.renderOrder = 11;
    const l = len * (0.5 + Math.random() * 0.7);
    anim(ctx, 0.45, 0, (_t, k) => {
      s.scale.set(0.18 * (1 - k * 0.5), l * Math.min(1, k * 4), 1);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

function flash(ctx: XSlashCtx, at: THREE.Vector3, size: number, color: number, sec: number, tex: THREE.Texture) {
  const s = sprite(ctx, tex, color, true);
  s.material.depthTest = false;
  s.renderOrder = 9;
  s.position.copy(at);
  anim(ctx, sec, 0, (_t, k) => {
    s.scale.setScalar(size * (0.5 + k * 0.8));
    s.material.opacity = 1 - k;
  }, () => dispose(ctx, s));
}

function rocks(ctx: XSlashCtx, x: number, z: number, n: number, power: number) {
  rockGeo ??= new THREE.DodecahedronGeometry(1, 0);
  rockMat ??= new THREE.MeshLambertMaterial({ color: 0x4a2a22, emissive: 0x501000, flatShading: true });
  const list = Array.from({ length: Math.max(2, Math.round(n * Q)) }, () => {
    const m = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.07 + Math.random() * 0.17;
    m.scale.set(s, s * (0.7 + Math.random() * 0.6), s * (0.8 + Math.random() * 0.5));
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.5 + Math.random());
    m.position.set(x + Math.cos(a) * 0.3, 0.1, z + Math.sin(a) * 0.3);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    ctx.scene.add(m);
    return { m, s: m.scale.clone(), v: new THREE.Vector3(Math.cos(a) * sp, 3.5 + Math.random() * 4 * (power / 4), Math.sin(a) * sp), spin: (Math.random() - 0.5) * 18 };
  });
  const life = 1.3;
  anim(ctx, life, 0, (t, _k, dt) => {
    for (const r of list) {
      r.v.y -= 16 * dt;
      r.m.position.addScaledVector(r.v, dt);
      if (r.m.position.y < 0.05) {
        r.m.position.y = 0.05;
        r.v.y = Math.abs(r.v.y) * 0.3;
        r.v.x *= 0.5;
        r.v.z *= 0.5;
      }
      r.m.rotation.x += r.spin * dt;
      r.m.rotation.z += r.spin * 0.6 * dt;
      r.m.scale.copy(r.s).multiplyScalar(Math.max(0, Math.min(1, (life - t) / 0.3)));
    }
  }, () => list.forEach((r) => ctx.scene.remove(r.m)));
}

/** Dark smoke rolling out from the impact. */
function smoke(ctx: XSlashCtx, x: number, z: number, n: number, spread: number) {
  for (let i = 0; i < Math.max(2, Math.round(n * Q)); i++) {
    const s = sprite(ctx, puff(), i % 2 ? 0x5a3030 : 0xc07060, false);
    const a = Math.random() * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).multiplyScalar(spread * (0.5 + Math.random() * 0.6));
    s.position.set(x + Math.cos(a) * 0.4, 0.35, z + Math.sin(a) * 0.4);
    s.material.rotation = Math.random() * 6;
    const size = 0.8 + Math.random() * 0.8;
    const life = 0.9 + Math.random() * 0.5;
    anim(ctx, life, 0.02, (_t, k, dt) => {
      s.position.addScaledVector(v, dt * (1 - k));
      s.scale.setScalar(size * (0.6 + k * 1.4));
      s.material.opacity = 0.6 * (1 - k);
    }, () => dispose(ctx, s));
  }
}

/**
 * A giant flaming crescent that sweeps down from the sky onto `at` (the guitar coming down), facing the camera
 * like a blade trail. `tilt` leans it; it is drawn twice (solid colour + additive glow).
 */
function fallingCrescent(ctx: XSlashCtx, at: THREE.Vector3, r: number, w: number, tilt: number, sec: number) {
  const geo = arcGeometry(r, w, Math.PI * 0.75);
  const solid = new THREE.MeshBasicMaterial({ map: blade(), transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const add = new THREE.MeshBasicMaterial({ map: blade(), color: 0xff8040, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  for (const m of [solid, add]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 10;
    spin.add(mesh);
  }
  // the arc's centre sits above the target so its leading end lands on it
  g.position.copy(at);
  ctx.scene.add(g);
  anim(ctx, sec, 0, (_t, k) => {
    g.quaternion.copy(ctx.camera.quaternion);
    g.rotateZ(tilt);
    const swing = Math.min(1, k / 0.35);
    // the swing's centre is straight above the target: the leading tip comes over from the upper left and
    // lands on the target from above, leaving the crescent trail behind it
    spin.position.set(0, r, 0);
    spin.rotation.z = Math.PI * 0.225 - (1 - Math.pow(1 - swing, 3)) * Math.PI * 1.1;
    const out = Math.max(0, (k - 0.4) / 0.6);
    spin.scale.setScalar(1 + out * 0.15);
    solid.opacity = 1 - out;
    add.opacity = 0.7 * (1 - out);
  }, () => dispose(ctx, g));
}

/** Red streaks along the ground behind the target, in the direction it is knocked back. */
function knockStreaks(ctx: XSlashCtx, at: THREE.Vector3, dx: number, dz: number, len: number, glowTex: THREE.Texture) {
  const ang = Math.atan2(dx, dz);
  for (let i = 0; i < Math.max(3, Math.round(6 * Q)); i++) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12 + Math.random() * 0.1, len * (0.6 + Math.random() * 0.6)),
      new THREE.MeshBasicMaterial({ map: glowTex, color: i % 2 ? 0xff3010 : 0xffc080, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    const side = (i - 2.5) * 0.22;
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, ang, 0);
    const mat = m.material as THREE.MeshBasicMaterial;
    m.position.set(at.x + Math.cos(ang) * side, 0.12 + Math.random() * 0.8, at.z - Math.sin(ang) * side);
    ctx.scene.add(m);
    anim(ctx, 0.5, 0, (_t, k) => {
      const d = len * 0.5 * (0.3 + k);
      m.position.x = at.x + Math.cos(ang) * side + dx * d;
      m.position.z = at.z - Math.sin(ang) * side + dz * d;
      mat.opacity = 1 - k;
    }, () => {
      dispose(ctx, m);
      m.geometry.dispose();
    });
  }
}

/**
 * Hammer-on ("ตูม!" with a guitar chord): a crimson magic circle opens under the target, a giant flaming
 * crescent swings down out of the sky, then the impact: white-red flash, rays, glowing ground cracks,
 * two shock rings, a ring of flame tongues, rocks, smoke, embers, and streaks pushing the monster back.
 * `hitMs` is when the guitar lands; (dx,dz) is the knock-back direction.
 */
export function hammerOnBlast(ctx: XSlashCtx, at: () => THREE.Vector3, dx: number, dz: number, hitMs: number, glowTex: THREE.Texture) {
  const p0 = at();
  redCircle(ctx, p0.x, p0.z, 2.4, 1.6);
  embers(ctx, p0.x, p0.z, 1.4, 10, glowTex);
  setTimeout(() => fallingCrescent(ctx, at().setY(at().y + 0.3), 2.2, 1.2, 0, 0.75), Math.max(0, hitMs - 230));
  setTimeout(() => {
    const p = at();
    const ground = new THREE.Vector3(p.x, 0.4, p.z);
    ctx.sound(true);
    flash(ctx, p, 5.5, 0xff3000, 0.5, glowTex);
    flash(ctx, p, 2.6, 0xffffff, 0.3, glowTex);
    rays(ctx, p, 16, 3.2);
    groundCracks(ctx, p.x, p.z, 2.8, 1.6);
    redShock(ctx, p.x, p.z, 4.2, 0.55);
    redShock(ctx, p.x, p.z, 6, 0.8, 0.12);
    flameRing(ctx, p.x, p.z, 1.3, 14, 2.4, 0.9);
    flameRing(ctx, p.x, p.z, 0.4, 5, 3.2, 0.7);
    rocks(ctx, p.x, p.z, 16, 4);
    smoke(ctx, p.x, p.z, 8, 2.2);
    embers(ctx, p.x, p.z, 2, 26, glowTex, 0.05);
    ctx.sparks(ground, 0xff4010, Math.round(40 * Q), 8);
    ctx.sparks(ground, 0xffd080, Math.round(20 * Q), 6);
    knockStreaks(ctx, p, dx, dz, 2.4, glowTex);
    ctx.shake(0.45);
  }, hitMs);
}

/** A closed wavy ribbon (vibrato on a string): radius r with `waves` bumps of height `amp`, `w` tall, round the y axis. */
function wavyRing(r: number, amp: number, waves: number, color: number, opacity: number, w = 0.07, glowTex?: THREE.Texture) {
  const n = PHONE ? 96 : 160;
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
  const mat = new THREE.MeshBasicMaterial({ color, map: glowTex ? ray() : undefined, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const line = new THREE.Mesh(geo, mat);
  const set = (phase: number, a: number) => {
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * Math.PI * 2;
      const rr = r + Math.sin(th * waves + phase) * amp * a;
      const y = Math.sin(th * waves * 0.5 - phase) * amp * 0.6 * a;
      const x = Math.cos(th) * rr;
      const z = Math.sin(th) * rr;
      pos.set([x, y + w / 2, z, x, y - w / 2, z], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { line, mat, set };
}

/** A red music note sprite. */
function noteSprite(ctx: XSlashCtx, glyph: string, tex: (g: string) => THREE.Texture) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(glyph), transparent: true, depthWrite: false }));
  ctx.scene.add(s);
  return s;
}

/**
 * Vibrato: the guitarist plays and a red aura wraps round them for the whole buff. On the cast a crimson circle
 * snaps open with a flash and embers; then, until `sec` runs out (or `alive()` says the player is gone): a pulsing
 * red glow on the ground, a haze round the body, little flames licking up, two wavy "vibrato" rings turning round
 * the waist and red music notes circling the body, bobbing up and down like a vibrato.
 * `at()` is the player's feet; `noteTex` makes a red note texture from a glyph.
 */
export function vibratoAura(ctx: XSlashCtx, at: () => THREE.Vector3, alive: () => boolean, sec: number, glowTex: THREE.Texture, noteTex: (g: string) => THREE.Texture) {
  const p0 = at();
  // the cast
  redCircle(ctx, p0.x, p0.z, 1.7, 1.4);
  redShock(ctx, p0.x, p0.z, 3.2, 0.6);
  flash(ctx, p0.clone().setY(1), 3.2, 0xff2a00, 0.5, glowTex);
  flameRing(ctx, p0.x, p0.z, 0.9, 10, 1.6, 0.8);
  embers(ctx, p0.x, p0.z, 1, 18, glowTex);
  ctx.sparks(p0.clone().setY(1), 0xff3010, Math.round(24 * Q), 5);
  ctx.sound(true);

  // the aura
  const floor = groundPlane(glowTex, 2.6, true);
  (floor.material as THREE.MeshBasicMaterial).color.set(0xff2000);
  const floorDark = groundPlane(glowTex, 2.2);
  (floorDark.material as THREE.MeshBasicMaterial).color.set(0x900000);
  const haze = sprite(ctx, glowTex, 0xff1800, true);
  const hazeDark = sprite(ctx, glowTex, 0xa00000, false);
  haze.material.depthTest = false;
  ctx.scene.add(floor, floorDark);
  const rings = [wavyRing(0.8, 0.12, 9, 0xff2a10, 1, 0.12), wavyRing(0.66, 0.09, 7, 0xffb070, 0.9, 0.08), wavyRing(0.9, 0.1, 11, 0xff4020, 0.8, 0.1)];
  rings.forEach((r) => ctx.scene.add(r.line));
  const glyphs = ['♪', '♫', '♬', '♩', '♪', '♫', '♬', '♩'];
  const nn = PHONE ? 5 : 8;
  const notes = glyphs.slice(0, nn).map((g, i) => ({ s: noteSprite(ctx, g, noteTex), a: (i / nn) * Math.PI * 2, h: 0.45 + (i % 3) * 0.55, r: 0.85 + (i % 2) * 0.25 }));
  const flames: { s: THREE.Sprite; t: number; life: number; ang: number; r: number; h: number }[] = [];
  let spawn = 0;
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    const on = alive() && t < sec;
    const fadeIn = Math.min(1, t / 0.3);
    const fadeOut = on ? Math.min(1, (sec - t) / 0.5) : 0;
    const f = fadeIn * fadeOut;
    const p = at();
    const pulse = 0.8 + 0.2 * Math.sin(t * 7);
    floor.position.set(p.x, 0.06, p.z);
    floorDark.position.set(p.x, 0.055, p.z);
    floor.scale.setScalar(pulse);
    (floor.material as THREE.MeshBasicMaterial).opacity = 0.8 * f;
    (floorDark.material as THREE.MeshBasicMaterial).opacity = 0.45 * f;
    haze.position.set(p.x, 0.95, p.z);
    hazeDark.position.set(p.x, 0.9, p.z);
    haze.scale.set(2.0 + Math.sin(t * 11) * 0.12, 2.6, 1);
    hazeDark.scale.set(1.9, 2.5, 1);
    haze.material.opacity = 0.5 * f;
    hazeDark.material.opacity = 0.25 * f;
    rings.forEach((r, i) => {
      r.line.position.set(p.x, 0.35 + i * 0.5 + Math.sin(t * 3 + i) * 0.08, p.z);
      r.line.rotation.y = t * (i % 2 ? -1.6 : 1.2);
      r.set(t * 10 * (i % 2 ? -1 : 1), 0.6 + 0.4 * Math.sin(t * 6 + i));
      r.mat.opacity = (i === 1 ? 0.8 : 1) * f;
    });
    for (const n of notes) {
      const an = n.a + t * 1.4;
      // a vibrato: the notes bob quickly up and down as they circle
      n.s.position.set(p.x + Math.cos(an) * n.r, n.h + Math.sin(t * 9 + n.a * 3) * 0.08 + Math.sin(t * 1.3 + n.a) * 0.15, p.z + Math.sin(an) * n.r);
      n.s.scale.setScalar(0.5 + 0.07 * Math.sin(t * 9 + n.a));
      n.s.material.opacity = f;
    }
    // little flames licking up round the feet
    spawn += dt * f;
    while (spawn > (PHONE ? 0.12 : 0.06)) {
      spawn -= PHONE ? 0.12 : 0.06;
      const s = sprite(ctx, flame(), 0xffffff, Math.random() < 0.5);
      s.center.set(0.5, 0.05);
      flames.push({ s, t: 0, life: 0.5 + Math.random() * 0.4, ang: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.3, h: 0.9 + Math.random() * 0.9 });
    }
    for (let i = flames.length - 1; i >= 0; i--) {
      const fl = flames[i];
      fl.t += dt;
      const k = fl.t / fl.life;
      fl.s.position.set(p.x + Math.cos(fl.ang) * fl.r, 0.02 + k * 0.5, p.z + Math.sin(fl.ang) * fl.r);
      fl.s.scale.set(fl.h * 0.4, fl.h * (k < 0.3 ? k / 0.3 : 1 - (k - 0.3) * 0.8), 1);
      fl.s.material.opacity = Math.min(1, (1 - k) * 2);
      if (k >= 1) {
        dispose(ctx, fl.s);
        flames.splice(i, 1);
      }
    }
    if (!on && t > 0 && fadeOut <= 0) {
      dispose(ctx, floor, floorDark, haze, hazeDark, ...rings.map((r) => r.line), ...notes.map((n) => n.s), ...flames.map((fl) => fl.s));
      floor.geometry.dispose();
      floorDark.geometry.dispose();
      rings.forEach((r) => r.line.geometry.dispose());
      return false;
    }
    return true;
  });
}

// ------------------------------------------------------------ Slide

/** A strip of light from (x0,z0) to (x1,z1), flat on the ground or standing edge-up; bright end at the target. */
function streak(ctx: XSlashCtx, x0: number, z0: number, x1: number, z1: number, y: number, w: number, color: number, sec: number, delay: number, flat: boolean, additive: boolean) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.PlaneGeometry(w, len);
  const mat = new THREE.MeshBasicMaterial({ map: ray(), color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.order = 'YXZ';
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  if (flat) m.rotation.set(-Math.PI / 2, yaw, 0);
  else m.rotation.set(0, yaw + Math.PI / 2, -Math.PI / 2);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  ctx.scene.add(m);
  anim(ctx, sec, delay, (_t, k) => {
    mat.opacity = Math.max(0, k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    m.scale.x = 1 - k * 0.6;
  }, () => {
    dispose(ctx, m);
    geo.dispose();
  });
}

/**
 * Slide: like the drummer's จังหวะส่ง but a red fire comet. The guitarist shoots from (fx,fz) to (tx,tz) in
 * `dashMs`: a burning trail on the ground with flames left behind, speed lines, an oval of light round the path;
 * at the target a red starburst, a crimson circle, shock rings, flames and embers. `big` = x2 with Vibrato.
 */
export function slideDash(ctx: XSlashCtx, fx: number, fz: number, tx: number, tz: number, dashMs: number, big: boolean, glowTex: THREE.Texture) {
  const len = Math.hypot(tx - fx, tz - fz);
  if (len < 0.2) return;
  const dx = (tx - fx) / len;
  const dz = (tz - fz) / len;
  const k = big ? 1.35 : 1;
  const dash = dashMs / 1000;
  ctx.sound(false);
  smoke(ctx, fx, fz, 3, 1.4);
  redShock(ctx, fx, fz, 1.8, 0.4);
  const bx = fx - dx * 1.2;
  const bz = fz - dz * 1.2;
  streak(ctx, bx, bz, tx, tz, 0.06, 1.9 * k, 0xb00000, 0.7, 0, true, false);
  streak(ctx, bx, bz, tx, tz, 0.07, 1.2 * k, 0xff4010, 0.6, 0, true, true);
  streak(ctx, bx, bz, tx, tz, 0.08, 0.5 * k, 0xfff0d0, 0.45, 0, true, true);
  const lines = Math.round(8 * Q) + 2;
  for (let i = 0; i < lines; i++) {
    const side = (Math.random() - 0.5) * 1.6;
    const sx = -dz * side;
    const sz = dx * side;
    const back = 0.5 + Math.random() * 1.8;
    const col = [0xc00000, 0xff5020, 0xffe0b0][i % 3];
    streak(ctx, bx - dx * back + sx, bz - dz * back + sz, tx - dx * 0.4 + sx, tz - dz * 0.4 + sz, 0.3 + Math.random() * 1.3, 0.08 + Math.random() * 0.12, col, 0.45, Math.random() * dash * 0.6, false, i % 3 !== 0);
  }
  // flames left burning along the path
  const fl = Math.max(3, Math.round(len * 3 * Q));
  for (let i = 0; i < fl; i++) {
    const u = i / fl;
    const side = (Math.random() - 0.5) * 0.8;
    const x = fx + (tx - fx) * u - dz * side;
    const z = fz + (tz - fz) * u + dx * side;
    flameRing(ctx, x, z, 0.01, 1, 0.8 + Math.random() * 0.6, 0.6, dash * u);
  }
  embers(ctx, (fx + tx) / 2, (fz + tz) / 2, len / 2, 14, glowTex);
  // an oval of light round the path
  const loop = groundPlane(shock(), 2, true);
  loop.rotation.order = 'YXZ';
  loop.rotation.set(-Math.PI / 2, Math.atan2(dx, dz), 0);
  loop.position.set((fx + tx) / 2, 0.5, (fz + tz) / 2);
  (loop.material as THREE.MeshBasicMaterial).color.set(0xff3010);
  ctx.scene.add(loop);
  anim(ctx, 0.55, 0, (t, q) => {
    const s = Math.min(1, t / 0.25);
    loop.scale.set(1.2 * k * (0.5 + s * 0.5), (len / 2 + 1) * (0.6 + s * 0.4), 1);
    (loop.material as THREE.MeshBasicMaterial).opacity = 1 - q;
  }, () => {
    dispose(ctx, loop);
    loop.geometry.dispose();
  });
  // the hit
  anim(ctx, 0.01, dash, () => {}, () => {
    const at = new THREE.Vector3(tx, 0.8, tz);
    ctx.sound(true);
    ctx.shake(0.3 * k);
    const deep = sprite(ctx, glowTex, 0xa00000, false);
    deep.material.depthTest = false;
    deep.renderOrder = 8;
    deep.position.copy(at);
    anim(ctx, 0.45, 0, (_t, q) => {
      deep.scale.setScalar(3.6 * k * (0.6 + q * 0.6));
      deep.material.opacity = 0.9 * (1 - q);
    }, () => dispose(ctx, deep));
    flash(ctx, at, 4.5 * k, 0xff3010, 0.4, glowTex);
    flash(ctx, at, 2 * k, 0xffffff, 0.25, glowTex);
    rays(ctx, at, 16, 2.8 * k);
    redCircle(ctx, tx, tz, 1.5 * k, 0.9);
    redShock(ctx, tx, tz, 2.8 * k, 0.5);
    redShock(ctx, tx, tz, 1.7 * k, 0.4, 0.08);
    flameRing(ctx, tx, tz, 0.7, 8, 1.4 * k, 0.6);
    embers(ctx, tx, tz, 1, 18, glowTex);
    ctx.sparks(at, 0xff6030, Math.round(28 * Q * k), 7);
  });
}

// ------------------------------------------------------------ Palm muting

/** A jagged bolt between two points, re-drawn with new kinks every few frames: a wide red glow, the red bolt and a hot core. */
function bolt(ctx: XSlashCtx, from: () => THREE.Vector3, to: () => THREE.Vector3, color: number, width: number, sec: number, delay: number) {
  const n = 14;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  const layers = ([
    [3.2, new THREE.MeshBasicMaterial({ color: 0xff1a00, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })],
    [1, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false })],
    [0.3, new THREE.MeshBasicMaterial({ color: 0xffc8a0, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false })],
  ] as const).map(([f, mat], i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((n + 1) * 6), 3));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 10 + i;
    mesh.visible = false;
    mesh.frustumCulled = false;
    ctx.scene.add(mesh);
    return { f, mat, geo, mesh };
  });
  let kinks: number[] = [];
  let next = 0;
  anim(ctx, sec, delay, (t, k) => {
    const a = from();
    const b = to();
    if (t >= next) {
      next = t + 0.05;
      kinks = Array.from({ length: n + 1 }, (_, i) => (i === 0 || i === n ? 0 : (Math.random() - 0.5) * 0.6));
    }
    const d = b.clone().sub(a);
    const len = d.length() || 1;
    const side = new THREE.Vector3(-d.z, 0, d.x).divideScalar(len);
    const flick = 0.75 + Math.random() * 0.25;
    for (const l of layers) {
      l.mesh.visible = true;
      const pos = l.geo.attributes.position.array as Float32Array;
      const w = width * l.f * (1 - k * 0.5);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const p = a.clone().addScaledVector(d, u).addScaledVector(side, kinks[i]);
        p.y += Math.sin(u * Math.PI) * 0.4 + kinks[(i + 3) % (n + 1)] * 0.5;
        pos.set([p.x - side.x * w, p.y + w, p.z - side.z * w, p.x + side.x * w, p.y - w, p.z + side.z * w], i * 6);
      }
      l.geo.attributes.position.needsUpdate = true;
      l.mat.opacity = (l.f > 2 ? 0.45 : 1) * (1 - k * 0.6) * flick;
    }
  }, () => {
    for (const l of layers) {
      ctx.scene.remove(l.mesh);
      l.mat.dispose();
      l.geo.dispose();
    }
  });
}

/**
 * Palm muting: a crimson circle under the guitarist and a red ring rushing out `radius` tiles; red lightning
 * jumps from the guitarist to every monster it catches, then the bolts drag them in (the server moves them) with
 * a flash and flames on each one and a burst round the guitarist when they arrive.
 * `targets` follow the monsters as they move.
 */
export function palmMuting(ctx: XSlashCtx, at: () => THREE.Vector3, radius: number, targets: (() => THREE.Vector3)[], glowTex: THREE.Texture) {
  const p0 = at();
  ctx.sound(false);
  redCircle(ctx, p0.x, p0.z, 2.2, 1.6);
  redShock(ctx, p0.x, p0.z, radius, 0.7);
  redShock(ctx, p0.x, p0.z, radius * 0.7, 0.6, 0.1);
  flash(ctx, p0.clone().setY(1), 3.5, 0xff2000, 0.5, glowTex);
  embers(ctx, p0.x, p0.z, 1.2, 14, glowTex);
  // a standing wall of red light on the ring as it goes out
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 48, 1, true),
    new THREE.MeshBasicMaterial({ map: ray(), color: 0xff2a10, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  wall.position.set(p0.x, 0.4, p0.z);
  ctx.scene.add(wall);
  anim(ctx, 0.7, 0, (_t, k) => {
    const r = 0.3 + radius * (1 - Math.pow(1 - k, 2.5));
    wall.scale.set(r, 0.8 * (1 - k * 0.5), r);
    (wall.material as THREE.MeshBasicMaterial).opacity = 1 - k;
  }, () => {
    dispose(ctx, wall);
    wall.geometry.dispose();
  });
  const from = () => at().setY(1.1);
  targets.forEach((to, i) => {
    const d = 0.12 + Math.min(0.3, i * 0.03);
    const tgt = () => to().setY(0.7);
    bolt(ctx, from, tgt, 0xe00000, 0.14, 0.95, d);
    if (i % 2 === 0) bolt(ctx, from, tgt, 0xff3010, 0.08, 0.8, d + 0.05);
    anim(ctx, 0.01, d, () => {}, () => {
      const p = tgt();
      flash(ctx, p, 1.8, 0xff3010, 0.35, glowTex);
      ctx.sparks(p, 0xff4010, Math.round(10 * Q), 4);
      redShock(ctx, p.x, p.z, 1.4, 0.4);
    });
  });
  // all pulled in: a burst round the guitarist
  anim(ctx, 0.01, 0.75, () => {}, () => {
    const p = at();
    ctx.sound(true);
    ctx.shake(0.3);
    flameRing(ctx, p.x, p.z, 1.3, 12, 1.6, 0.7);
    redShock(ctx, p.x, p.z, 3, 0.5);
    rays(ctx, p.clone().setY(0.8), 12, 2.2);
  });
}

// ------------------------------------------------------------ Bending

/** A spinning crescent ring of fire round (x, y, z): radius r, tilted, turning `spin` rad/s. */
function fireArc(ctx: XSlashCtx, follow: () => THREE.Vector3, y: number, r: number, w: number, arc: number, tiltX: number, tiltZ: number, spin: number, sec: number, delay: number) {
  const geo = arcGeometry(r, w, arc);
  const solid = new THREE.MeshBasicMaterial({ map: blade(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const add = new THREE.MeshBasicMaterial({ map: blade(), color: 0xff7040, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const g = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.set(-Math.PI / 2 + tiltX, 0, tiltZ);
  g.add(tilt);
  const spinner = new THREE.Group();
  tilt.add(spinner);
  for (const m of [solid, add]) spinner.add(new THREE.Mesh(geo, m));
  g.visible = false;
  ctx.scene.add(g);
  const a0 = Math.random() * Math.PI * 2;
  anim(ctx, sec, delay, (t, k) => {
    g.visible = true;
    const p = follow();
    g.position.set(p.x, y + Math.sin(t * 5) * 0.05, p.z);
    spinner.rotation.z = a0 + t * spin;
    const grow = Math.min(1, t / 0.15);
    g.scale.setScalar(0.5 + 0.5 * grow + k * 0.25);
    const o = Math.min(1, (1 - k) * 3);
    solid.opacity = o;
    add.opacity = 0.7 * o;
  }, () => dispose(ctx, g));
}

/**
 * Bending: the guitarist spins and a red fire storm whirls up round them: a crimson circle, layers of flaming
 * crescents turning fast at different heights and tilts (a tornado), a spiral of flames and embers sucked up,
 * smoke, rocks and shock rings, and a final blast outwards. `radius` = the skill's reach in tiles.
 */
export function bendingStorm(ctx: XSlashCtx, at: () => THREE.Vector3, radius: number, glowTex: THREE.Texture) {
  const p0 = at();
  const sec = 1.3;
  ctx.sound(false);
  redCircle(ctx, p0.x, p0.z, radius + 0.8, sec + 0.4);
  redShock(ctx, p0.x, p0.z, radius + 1.5, 0.5);
  // the tornado: rings widen as they go up
  const layers = PHONE ? 5 : 9;
  for (let i = 0; i < layers; i++) {
    const u = i / (layers - 1);
    const y = 0.15 + u * 2.6;
    const r = radius * (0.45 + u * 0.6);
    fireArc(ctx, at, y, r, 0.35 + u * 0.35, Math.PI * (0.9 + Math.random() * 0.5), (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (i % 2 ? -1 : 1) * (9 + Math.random() * 5) * (1 - u * 0.3), sec, i * 0.04);
  }
  // a dark-red funnel behind the arcs
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.95, radius * 0.4, 2.8, 32, 1, true),
    new THREE.MeshBasicMaterial({ map: ray(), color: 0xc00000, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  funnel.rotation.x = Math.PI; // the ray texture is bright at the bottom of the funnel
  ctx.scene.add(funnel);
  anim(ctx, sec, 0, (t, k) => {
    const p = at();
    funnel.position.set(p.x, 1.45, p.z);
    funnel.rotation.y = t * 8;
    (funnel.material as THREE.MeshBasicMaterial).opacity = 0.22 * Math.min(1, t / 0.15) * Math.min(1, (1 - k) * 3);
  }, () => {
    dispose(ctx, funnel);
    funnel.geometry.dispose();
  });
  // flames and embers spiralling up
  const n = Math.round(40 * Q);
  for (let i = 0; i < n; i++) {
    const s = sprite(ctx, i % 3 ? glowTex : flame(), i % 3 ? (i % 2 ? 0xff4010 : 0xffb050) : 0xffffff, true);
    const a = Math.random() * Math.PI * 2;
    const r0 = radius * (0.5 + Math.random() * 0.6);
    const size = i % 3 ? 0.15 + Math.random() * 0.15 : 0.5 + Math.random() * 0.4;
    s.visible = false;
    anim(ctx, 0.8 + Math.random() * 0.4, Math.random() * (sec - 0.6), (_t, k) => {
      s.visible = true;
      const p = at();
      const an = a + k * 9;
      const r = r0 * (1 - k * 0.3) + k * 0.6;
      s.position.set(p.x + Math.cos(an) * r, 0.1 + k * 3, p.z + Math.sin(an) * r);
      s.scale.set(size * (i % 3 ? 1 : 0.6), size, 1);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
  smoke(ctx, p0.x, p0.z, 8, 2.6);
  rocks(ctx, p0.x, p0.z, 10, 3);
  for (let i = 0; i < 3; i++) anim(ctx, 0.01, i * 0.35, () => {}, () => {
    const p = at();
    redShock(ctx, p.x, p.z, radius + 1.2, 0.45);
    ctx.sparks(p.clone().setY(0.8), 0xff4010, Math.round(14 * Q), 6);
  });
  // the end: a blast outwards
  anim(ctx, 0.01, sec - 0.1, () => {}, () => {
    const p = at();
    ctx.sound(true);
    ctx.shake(0.4);
    flash(ctx, p.clone().setY(1), 5, 0xff2000, 0.5, glowTex);
    rays(ctx, p.clone().setY(1), 16, 3);
    redShock(ctx, p.x, p.z, radius + 3, 0.6);
    flameRing(ctx, p.x, p.z, radius + 0.3, 16, 1.8, 0.7);
    embers(ctx, p.x, p.z, radius, 24, glowTex);
  });
}
