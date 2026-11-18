import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture } from './toon';
import type { XSlashCtx } from './xslash';

/**
 * The tiger king's skills (ราชาเสือโคร่ง, MVP of ทุ่งเมโลดี้, 2026-11-18), in fire orange, gold and black:
 * - ขวานพยัคฆ์ผ่าปฐพี: the axe comes down, the ground splits in glowing cracks, rocks and dust fly, a shock ring,
 * - พยัคฆ์ตะปบ: the tiger leaps onto its target and rakes it: three huge claw marks in the air,
 * - พายุกรงเล็บพยัคฆ์: claw marks tear across the ground all over the circle, one after another,
 * - คำรามราชันย์พงไพร (under half HP): a roar, a striped sigil, gold shock rings rolling out.
 * The warning circle before each one is the shared one (reaperfx telegraph).
 */

const Q = PHONE ? 0.5 : 1;
export const TG = { orange: 0xff8a1c, gold: 0xffc94a, ember: 0xff4a10, dark: 0x1a0a02, white: 0xfff1d6 };

let crackTex: THREE.Texture | undefined;
let clawTex: THREE.Texture | undefined;
let sigilTex: THREE.Texture | undefined;

const add = (b: boolean) => (b ? THREE.AdditiveBlending : THREE.NormalBlending);
const basic = (map: THREE.Texture | null, color: number, additive: boolean, opacity = 1) =>
  new THREE.MeshBasicMaterial({ map, color, transparent: true, opacity, depthWrite: false, blending: add(additive), side: THREE.DoubleSide });

function flat(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, z: number, y = 0.06) {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

function dispose(scene: THREE.Scene, ...objs: THREE.Object3D[]) {
  for (const o of objs) {
    scene.remove(o);
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) mat.dispose();
    });
  }
}

/** Jagged cracks running out from the middle (white: tinted by the material). */
function cracks() {
  return (crackTex ??= canvasTexture(512, 512, (c) => {
    c.translate(256, 256);
    c.strokeStyle = '#ffffff';
    c.lineCap = 'round';
    let seed = 5;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      let px = x, py = y;
      const n = 6;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(px, py);
      for (let i = 0; i < n; i++) {
        a += (r() - 0.5) * 0.7;
        px += Math.cos(a) * (len / n);
        py += Math.sin(a) * (len / n);
        c.lineTo(px, py);
        if (depth > 0 && r() < 0.3) {
          c.stroke();
          branch(px, py, a + (r() < 0.5 ? 0.8 : -0.8), len * 0.45, w * 0.6, depth - 1);
          c.lineWidth = w;
          c.beginPath();
          c.moveTo(px, py);
        }
        w *= 0.85;
        c.lineWidth = w;
      }
      c.stroke();
    };
    for (let i = 0; i < 9; i++) branch(0, 0, (i / 9) * Math.PI * 2 + r() * 0.4, 170 + r() * 70, 12, 2);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 70);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 70, 0, Math.PI * 2);
    c.fill();
  }));
}

/** Three curved claw slashes side by side, pointed at both ends. */
function claws() {
  return (clawTex ??= canvasTexture(256, 256, (c) => {
    c.fillStyle = '#ffffff';
    for (let i = -1; i <= 1; i++) {
      const x = 128 + i * 52;
      c.beginPath();
      c.moveTo(x - 30, 18);
      c.quadraticCurveTo(x + 22 - 6, 128, x - 18, 238);
      c.quadraticCurveTo(x + 38, 128, x - 30, 18);
      c.closePath();
      c.fill();
    }
  }));
}

/** The roar sigil: rings, tiger stripes coming in from the rim, a fang crown in the middle. */
function sigil() {
  return (sigilTex ??= canvasTexture(512, 512, (c) => {
    c.translate(256, 256);
    c.strokeStyle = '#ffffff';
    c.fillStyle = '#ffffff';
    for (const [r, w] of [[244, 8], [228, 3], [150, 4]]) {
      c.lineWidth = w;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    }
    // tapered stripes from the outer ring inwards, like the fur
    for (let i = 0; i < 18; i++) {
      c.save();
      c.rotate((i / 18) * Math.PI * 2);
      const len = i % 2 ? 50 : 72;
      c.beginPath();
      c.moveTo(-9, -226);
      c.quadraticCurveTo(-4, -226 + len * 0.6, 4, -226 + len);
      c.quadraticCurveTo(6, -226 + len * 0.5, 9, -226);
      c.closePath();
      c.fill();
      c.restore();
    }
    // fangs round the inner ring
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i / 8) * Math.PI * 2);
      c.beginPath();
      c.moveTo(-14, -146);
      c.lineTo(0, -100);
      c.lineTo(14, -146);
      c.closePath();
      c.fill();
      c.restore();
    }
  }));
}

/** ขวานพยัคฆ์ผ่าปฐพี: the ground splits round the tiger in glowing cracks, rocks jump, a gold shock ring rolls out. */
export function tigerCleave(ctx: XSlashCtx, x: number, z: number, radius: number) {
  ctx.sound(true);
  ctx.shake(0.45);
  const size = radius * 2.3;
  const dark = flat(new THREE.PlaneGeometry(size, size), basic(cracks(), TG.dark, false, 0.85), x, z, 0.065);
  const glow = flat(new THREE.PlaneGeometry(size, size), basic(cracks(), TG.orange, true, 1), x, z, 0.075);
  dark.rotation.z = glow.rotation.z = Math.random() * Math.PI * 2;
  const ring = flat(new THREE.RingGeometry(0.85, 1, 56), basic(null, TG.gold, true, 0.9), x, z, 0.09);
  const dust = flat(new THREE.CircleGeometry(1, 40), basic(null, 0xb08a60, false, 0.4), x, z, 0.07);
  ctx.scene.add(dark, glow, ring, dust);
  const rockGeo = new THREE.DodecahedronGeometry(0.12, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x6a5240 });
  const rocks = Array.from({ length: Math.round(14 * Q) + 4 }, () => {
    const m = new THREE.Mesh(rockGeo, rockMat);
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * radius * 0.6;
    m.position.set(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d);
    m.scale.setScalar(0.6 + Math.random() * 1.2);
    m.userData.v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), 3 + Math.random() * 3, Math.sin(a) * (1 + Math.random() * 2));
    ctx.scene.add(m);
    return m;
  });
  for (let i = 0; i < 3; i++) ctx.sparks(new THREE.Vector3(x + (Math.random() - 0.5) * radius, 0.4, z + (Math.random() - 0.5) * radius), i ? TG.orange : TG.gold, Math.round(16 * Q), 4);
  let t = 0;
  ctx.add((dt) => {
    t += dt / 1.4;
    const k = Math.min(1, t / 0.12);
    dark.scale.setScalar(0.4 + k * 0.6);
    glow.scale.setScalar(0.4 + k * 0.6);
    (glow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t < 0.5 ? 1 : 1 - (t - 0.5) / 0.5) * (0.8 + Math.random() * 0.2);
    (dark.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    const rt = Math.min(1, t / 0.45);
    ring.scale.setScalar(0.3 + rt * radius * 1.15);
    (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - rt);
    dust.scale.setScalar(0.5 + rt * radius * 1.2);
    (dust.material as THREE.MeshBasicMaterial).opacity = 0.4 * Math.max(0, 1 - t * 1.2);
    for (const m of rocks) {
      if (m.position.y <= 0.08 && m.userData.v.y < 0) continue;
      m.position.addScaledVector(m.userData.v, dt);
      m.userData.v.y -= dt * 12;
      m.rotation.x += dt * 6;
      m.rotation.z += dt * 4;
      if (m.position.y < 0.08) m.position.y = 0.08;
    }
    if (t >= 1) {
      dispose(ctx.scene, dark, glow, ring, dust);
      rocks.forEach((m) => ctx.scene.remove(m));
      rockGeo.dispose();
      rockMat.dispose();
    }
    return t < 1;
  });
}

/** One set of claw marks standing in the air at `at` facing the camera (พยัคฆ์ตะปบ), or lying on the ground. */
function clawMark(ctx: XSlashCtx, at: THREE.Vector3, size: number, ground: boolean, delay = 0) {
  const geo = new THREE.PlaneGeometry(size, size);
  const under = new THREE.Mesh(geo, basic(claws(), TG.dark, false, 0.9));
  const over = new THREE.Mesh(geo, basic(claws(), TG.orange, true, 1));
  const g = new THREE.Group();
  g.add(under, over);
  over.position.z = 0.01;
  g.position.copy(at);
  const spin = Math.random() * Math.PI * 2;
  if (ground) {
    g.rotation.x = -Math.PI / 2;
    g.rotation.z = spin;
  }
  g.visible = false;
  ctx.scene.add(g);
  let t = -delay;
  let shown = false;
  ctx.add((dt) => {
    t += dt;
    if (t < 0) return true;
    if (!shown) {
      shown = true;
      g.visible = true;
      ctx.sparks(at.clone().setY(Math.max(0.4, at.y)), TG.gold, Math.round(8 * Q), 3);
    }
    if (!ground) {
      g.quaternion.copy(ctx.camera.quaternion);
      g.rotateZ(0.5);
    }
    const k = t / 0.7;
    // the slashes rip in from the top (a wipe made by scaling from one end), then fade
    const wipe = Math.min(1, t / 0.12);
    over.scale.set(1, wipe, 1);
    under.scale.set(1, wipe, 1);
    over.position.y = under.position.y = (size * (1 - wipe)) / 2;
    (over.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k * k);
    (under.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.max(0, 1 - k);
    if (k >= 1) dispose(ctx.scene, g);
    return k < 1;
  });
}

/** พยัคฆ์ตะปบ: the tiger lands on its target (the server moves it) and rakes it twice. */
export function tigerPounce(ctx: XSlashCtx, from: THREE.Vector3, to: THREE.Vector3) {
  ctx.sound(false);
  ctx.shake(0.3);
  // a streak along the leap
  const dir = to.clone().sub(from).setY(0);
  const len = Math.max(0.5, dir.length());
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), basic(null, TG.orange, true, 0.6));
  streak.rotation.x = -Math.PI / 2;
  streak.rotation.z = -Math.atan2(dir.z, dir.x);
  streak.position.copy(from.clone().add(to).multiplyScalar(0.5)).setY(0.12);
  ctx.scene.add(streak);
  let t = 0;
  ctx.add((dt) => {
    t += dt / 0.5;
    (streak.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.max(0, 1 - t);
    streak.scale.y = Math.max(0.01, 1 - t);
    if (t >= 1) dispose(ctx.scene, streak);
    return t < 1;
  });
  clawMark(ctx, to.clone().setY(1.1), 1.9, false, 0.05);
  clawMark(ctx, to.clone().setY(1.0), 1.6, false, 0.22);
  clawMark(ctx, to.clone().setY(0.08), 1.8, true, 0.05);
}

/** พายุกรงเล็บพยัคฆ์: claw marks tear the ground all over the circle, one after another. */
export function clawStorm(ctx: XSlashCtx, x: number, z: number, radius: number) {
  ctx.sound(true);
  ctx.shake(0.25);
  const glow = flat(new THREE.CircleGeometry(radius, 40), basic(null, TG.ember, true, 0.35), x, z, 0.06);
  ctx.scene.add(glow);
  const n = Math.round(7 * Q) + 3;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * radius * 0.8;
    clawMark(ctx, new THREE.Vector3(x + Math.cos(a) * d, 0.08 + i * 0.002, z + Math.sin(a) * d), 1.3 + Math.random() * 0.7, true, i * 0.07);
  }
  clawMark(ctx, new THREE.Vector3(x, 1.2, z), radius * 0.9, false, 0.1);
  let t = 0;
  ctx.add((dt) => {
    t += dt / 1.1;
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.35 * Math.max(0, 1 - t);
    if (t >= 1) dispose(ctx.scene, glow);
    return t < 1;
  });
}

/** คำรามราชันย์พงไพร: the roar. A striped sigil spins up, gold rings roll out, the air shakes. */
export function tigerRoar(ctx: XSlashCtx, x: number, z: number, radius: number) {
  ctx.sound(true);
  ctx.shake(0.6);
  const size = radius * 2.2;
  const circle = flat(new THREE.PlaneGeometry(size, size), basic(sigil(), TG.gold, true, 1), x, z, 0.08);
  const under = flat(new THREE.PlaneGeometry(size, size), basic(sigil(), TG.dark, false, 0.75), x, z, 0.07);
  const rings = [0, 1, 2, 3].map((i) => {
    const r = flat(new THREE.RingGeometry(0.9, 1, 64), basic(null, i % 2 ? TG.orange : TG.gold, true, 0.9), x, z, 0.1 + i * 0.01);
    r.userData.d = i * 0.13;
    return r;
  });
  // the roar itself: a cone of shimmering air rings rising from the tiger's head
  const waves = [0, 1, 2].map((i) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 40), basic(null, TG.white, true, 0.7));
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 3.2, z);
    w.userData.d = i * 0.15;
    return w;
  });
  ctx.scene.add(circle, under, ...rings, ...waves);
  for (let i = 0; i < 3; i++) ctx.sparks(new THREE.Vector3(x, 1 + i * 0.8, z), i === 1 ? TG.orange : TG.gold, Math.round(24 * Q), 6);
  let t = 0;
  let second = false;
  ctx.add((dt) => {
    t += dt / 1.6;
    circle.rotation.z = under.rotation.z = -t * 2;
    const k = Math.min(1, t / 0.25);
    circle.scale.setScalar(0.3 + k * 0.7);
    under.scale.setScalar(0.3 + k * 0.7);
    const fade = Math.max(0, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    (circle.material as THREE.MeshBasicMaterial).opacity = fade;
    (under.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade;
    for (const r of rings) {
      const rt = Math.max(0, Math.min(1, (t - r.userData.d) / 0.55));
      r.scale.setScalar(0.2 + rt * radius * 1.3);
      (r.material as THREE.MeshBasicMaterial).opacity = rt > 0 ? 0.9 * (1 - rt) : 0;
    }
    for (const w of waves) {
      const wt = Math.max(0, Math.min(1, (t - w.userData.d) / 0.5));
      w.scale.setScalar(0.3 + wt * 3);
      w.position.y = 3.2 + wt * 1.2;
      (w.material as THREE.MeshBasicMaterial).opacity = wt > 0 ? 0.7 * (1 - wt) : 0;
    }
    if (!second && t > 0.3) {
      second = true;
      ctx.shake(0.4);
      ctx.sparks(new THREE.Vector3(x, 0.5, z), TG.gold, Math.round(30 * Q), 8);
    }
    if (t >= 1) dispose(ctx.scene, circle, under, ...rings, ...waves);
    return t < 1;
  });
}
