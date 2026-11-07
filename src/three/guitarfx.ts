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
