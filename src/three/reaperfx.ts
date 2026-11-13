import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture, sparkTexture } from './toon';
import type { XSlashCtx } from './xslash';

/**
 * The abyss reaper's skills (ยมทูตเคียวโลหิต), in blood red and hell purple:
 * - a warning circle on the ground that fills up while the reaper charges (so players can step out),
 * - เคียวโลหิตกวาดวิญญาณ: a full-circle sweep of a blood-red crescent round the reaper,
 * - โซ่ตรวนวิญญาณ: a chain of purple links shoots out, hooks the target and drags them in,
 * - เพลิงนรกม่วง: purple flame pillars burst out of the ground,
 * - คำพิพากษาแห่งอเวจี: a huge blood circle, a dark dome blast, skulls flying up, shock rings.
 * Dark red layers use normal blending so they read on any ground; the light is additive.
 */

const Q = PHONE ? 0.5 : 1;
export const RP = { blood: 0xc0122e, dark: 0x3a0010, red: 0xff2a4a, purple: 0xa040ff, violet: 0x6a1aff, pale: 0xffd0e0 };

let warnTex: THREE.Texture | undefined;
let skullTex: THREE.Texture | undefined;
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

/** A warning circle: a red rim with hazard ticks. */
function warn() {
  return (warnTex ??= canvasTexture(256, 256, (c) => {
    c.translate(128, 128);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 7;
    c.beginPath();
    c.arc(0, 0, 120, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, 106, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * 108, Math.sin(a) * 108);
      c.lineTo(Math.cos(a) * 118, Math.sin(a) * 118);
      c.stroke();
    }
  }));
}

/** A skull for the judgement blast. */
function skull() {
  return (skullTex ??= canvasTexture(128, 128, (c) => {
    c.translate(64, 60);
    c.fillStyle = '#ffe6ee';
    c.beginPath();
    c.arc(0, -6, 40, 0, Math.PI * 2);
    c.fill();
    c.fillRect(-22, 20, 44, 22);
    c.fillStyle = '#2a0010';
    for (const s of [-1, 1]) {
      c.beginPath();
      c.ellipse(s * 16, -6, 11, 13, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.beginPath();
    c.moveTo(0, 8);
    c.lineTo(-6, 18);
    c.lineTo(6, 18);
    c.fill();
    for (let i = -2; i <= 2; i++) c.fillRect(i * 8 - 1.5, 28, 3, 14);
  }));
}

/** A blood sigil: rings, an inverted star, runes, little scythes round the rim. */
function sigil() {
  return (sigilTex ??= canvasTexture(512, 512, (c) => {
    c.translate(256, 256);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 250);
    g.addColorStop(0, 'rgba(255,60,90,0.45)');
    g.addColorStop(0.75, 'rgba(160,0,30,0.25)');
    g.addColorStop(1, 'rgba(160,0,30,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 250, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#ffffff';
    for (const [r, w] of [[240, 8], [226, 3], [168, 4], [100, 3]]) {
      c.lineWidth = w;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    }
    c.lineWidth = 5;
    c.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = ((i * 2) / 5) * Math.PI * 2 + Math.PI / 2;
      const [x, y] = [Math.cos(a) * 166, Math.sin(a) * 166];
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
    c.fillStyle = '#ffffff';
    c.font = 'bold 22px serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const runes = 'ᛟᛞᛜᛚᛗᛖᛒᛏᛊᛉᛈᛇᛃᛁᚾᚺᚹᚷᚲᚱᚨᚦ';
    for (let i = 0; i < 22; i++) {
      c.save();
      c.rotate((i / 22) * Math.PI * 2);
      c.fillText(runes[i], 0, -197);
      c.restore();
    }
    // little scythes between the rings
    c.lineWidth = 4;
    for (let i = 0; i < 6; i++) {
      c.save();
      c.rotate((i / 6) * Math.PI * 2);
      c.beginPath();
      c.moveTo(0, -112);
      c.lineTo(0, -158);
      c.stroke();
      c.beginPath();
      c.arc(-14, -150, 16, -0.2, Math.PI * 0.9, true);
      c.stroke();
      c.restore();
    }
  }));
}

/**
 * The red warning on the ground for `ms` while the reaper charges: the rim pulses and a disk fills to the edge.
 * `at()` follows a moving target (the chain); `alive()` stops it early if the cast is cut off.
 */
export function telegraph(ctx: XSlashCtx, at: () => THREE.Vector3, radius: number, ms: number, alive: () => boolean) {
  const r = Math.max(0.8, radius);
  const rim = flat(new THREE.PlaneGeometry(r * 2, r * 2), basic(warn(), RP.red, false, 0.9), 0, 0, 0.07);
  const fill = flat(new THREE.CircleGeometry(1, 48), basic(null, RP.blood, false, 0.35), 0, 0, 0.065);
  const glow = flat(new THREE.CircleGeometry(r, 48), basic(null, RP.red, true, 0.15), 0, 0, 0.06);
  ctx.scene.add(rim, fill, glow);
  let t = 0;
  const T = ms / 1000;
  ctx.add((dt) => {
    t += dt;
    const p = at();
    for (const m of [rim, fill, glow]) m.position.set(p.x, m.position.y, p.z);
    const k = Math.min(1, t / T);
    fill.scale.setScalar(Math.max(0.01, r * k));
    (rim.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.abs(Math.sin(t * 10)) * 0.4;
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.1 + k * 0.25;
    rim.rotation.z = t * 0.8;
    const done = t >= T || !alive();
    if (done) dispose(ctx.scene, rim, fill, glow);
    return !done;
  });
}

/** เคียวโลหิตกวาดวิญญาณ: two blood-red crescents spinning round the reaper and a red shock ring. */
export function scytheSweep(ctx: XSlashCtx, x: number, z: number, radius: number) {
  ctx.sound(true);
  ctx.shake(0.25);
  const group = new THREE.Group();
  group.position.set(x, 1.0, z);
  ctx.scene.add(group);
  const mk = (r: number, w: number, color: number, additive: boolean, y: number) => {
    const shape = new THREE.Shape();
    const n = 32;
    const arc = Math.PI * 1.3;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * arc;
      const th = Math.sin((i / n) * Math.PI) * w;
      const px = Math.cos(a) * (r + th), pz = Math.sin(a) * (r + th);
      if (i) shape.lineTo(px, pz);
      else shape.moveTo(px, pz);
    }
    for (let i = n; i >= 0; i--) {
      const a = (i / n) * arc;
      shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), basic(null, color, additive, 0.95));
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    group.add(m);
    return m;
  };
  const a = mk(radius * 0.72, radius * 0.3, RP.dark, false, 0);
  const b = mk(radius * 0.76, radius * 0.18, RP.red, true, 0.02);
  const c = mk(radius * 0.4, radius * 0.18, RP.purple, true, -0.3);
  const ring = flat(new THREE.RingGeometry(0.85, 1, 48), basic(null, RP.red, true, 0.9), x, z, 0.08);
  ctx.scene.add(ring);
  for (let i = 0; i < 3; i++) ctx.sparks(new THREE.Vector3(x + Math.cos(i * 2) * radius * 0.7, 0.8, z + Math.sin(i * 2) * radius * 0.7), RP.red, Math.round(14 * Q), 4);
  let t = 0;
  ctx.add((dt) => {
    t += dt / 0.6;
    group.rotation.y = -t * Math.PI * 2.6;
    for (const m of [a, b, c]) (m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - t * t);
    ring.scale.setScalar(0.3 + t * radius * 1.1);
    (ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - t));
    if (t >= 1) dispose(ctx.scene, group, ring);
    return t < 1;
  });
}

/** โซ่ตรวนวิญญาณ: a chain of links flies from the reaper to the target, hooks on, then reels back in. */
export function soulChain(ctx: XSlashCtx, from: () => THREE.Vector3, to: () => THREE.Vector3) {
  ctx.sound(false);
  const n = Math.round(18 * (PHONE ? 0.7 : 1));
  const geo = new THREE.TorusGeometry(0.1, 0.03, 4, 10);
  const mat = new THREE.MeshBasicMaterial({ color: 0xb8a8d8 });
  const glowMat = new THREE.SpriteMaterial({ map: sparkTexture(), color: RP.purple, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const links = Array.from({ length: n }, (_, i) => {
    const l = new THREE.Mesh(geo, mat);
    l.userData.i = i;
    const g = new THREE.Sprite(glowMat);
    g.scale.setScalar(0.4);
    l.add(g);
    ctx.scene.add(l);
    return l;
  });
  const hook = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), color: RP.red, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  hook.scale.setScalar(1.2);
  ctx.scene.add(hook);
  let t = 0;
  const T = 1.1;
  let hit = false;
  ctx.add((dt) => {
    t += dt;
    const a = from().setY(1.4);
    const b = to().setY(1.1);
    // out in 0.25s, hold, then pull back with the victim
    const reach = t < 0.25 ? t / 0.25 : t < 0.55 ? 1 : Math.max(0, 1 - (t - 0.55) / 0.5);
    if (!hit && t >= 0.25) {
      hit = true;
      ctx.sparks(b.clone(), RP.purple, Math.round(18 * Q), 3);
      ctx.shake(0.15);
    }
    const dir = b.clone().sub(a);
    const len = dir.length() * reach;
    dir.normalize();
    links.forEach((l, i) => {
      const k = i / (n - 1);
      l.position.copy(a).addScaledVector(dir, len * k);
      l.position.y -= Math.sin(k * Math.PI) * 0.2 * (t < 0.25 ? 0 : 1);
      l.lookAt(l.position.clone().add(dir));
      if (i % 2) l.rotateZ(Math.PI / 2);
    });
    hook.position.copy(links[n - 1].position);
    hook.material.opacity = 0.6 + Math.sin(t * 30) * 0.3;
    const done = t >= T;
    if (done) {
      links.forEach((l) => ctx.scene.remove(l));
      ctx.scene.remove(hook);
      geo.dispose();
      mat.dispose();
      glowMat.dispose();
      hook.material.dispose();
    }
    return !done;
  });
}

/** เพลิงนรกม่วง: purple flame pillars rising from the ground in the circle, then fading into smoke. */
export function hellfire(ctx: XSlashCtx, x: number, z: number, radius: number) {
  ctx.sound(true);
  ctx.shake(0.3);
  const g = new THREE.Group();
  ctx.scene.add(g);
  const scorch = flat(new THREE.CircleGeometry(radius, 40), basic(null, 0x1a0020, false, 0.55), x, z, 0.05);
  const glow = flat(new THREE.CircleGeometry(radius * 1.05, 40), basic(null, RP.violet, true, 0.6), x, z, 0.06);
  ctx.scene.add(scorch, glow);
  const n = Math.round(11 * Q) + 3;
  const outer = basic(null, RP.violet, true, 0.55);
  const inner = basic(null, 0xd060ff, true, 0.6);
  const pillars: { m: THREE.Mesh; c: THREE.Mesh; d: number; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random()) * radius * 0.85;
    const h = 1.6 + Math.random() * 1.8;
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1, 8, 1, true), outer);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1, 8, 1, true), inner);
    for (const o of [m, c]) o.position.set(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
    g.add(m, c);
    pillars.push({ m, c, d: Math.random() * 0.25, h });
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.35, radius * 0.6, 4, 24, 1, true), basic(null, RP.purple, true, 0.5));
  core.position.set(x, 2, z);
  g.add(core);
  for (let i = 0; i < 2; i++) ctx.sparks(new THREE.Vector3(x, 0.6 + i, z), i ? RP.purple : 0xff7af0, Math.round(20 * Q), 4.5);
  let t = 0;
  ctx.add((dt) => {
    t += dt / 1.1;
    for (const p of pillars) {
      const k = Math.max(0, Math.min(1, (t - p.d) / 0.25));
      const f = k * (1 - Math.max(0, t - 0.6) / 0.4) * (0.85 + Math.random() * 0.3);
      for (const o of [p.m, p.c]) {
        const hh = Math.max(0.01, f * p.h * (o === p.c ? 0.75 : 1));
        o.scale.set(1, hh, 1);
        o.position.y = hh / 2;
      }
    }
    core.scale.set(1 + t * 0.4, Math.max(0.01, 1 - t), 1 + t * 0.4);
    (core.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
    (scorch.material as THREE.MeshBasicMaterial).opacity = 0.55 * Math.min(1, 2 * (1 - t));
    if (t >= 1) {
      dispose(ctx.scene, g, scorch, glow);
      outer.dispose();
      inner.dispose();
    }
    return t < 1;
  });
}

/** คำพิพากษาแห่งอเวจี: the big one. A blood sigil spins up, a dark dome blasts out, skulls fly, rings roll out. */
export function judgement(ctx: XSlashCtx, x: number, z: number, radius: number) {
  ctx.sound(true);
  ctx.shake(0.6);
  const circle = flat(new THREE.PlaneGeometry(radius * 2.2, radius * 2.2), basic(sigil(), RP.red, true, 1), x, z, 0.08);
  const under = flat(new THREE.PlaneGeometry(radius * 2.2, radius * 2.2), basic(sigil(), RP.dark, false, 0.8), x, z, 0.07);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), basic(null, 0x2a0016, false, 0.6));
  const domeGlow = new THREE.Mesh(new THREE.SphereGeometry(1.02, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), basic(null, RP.red, true, 0.5));
  dome.position.set(x, 0, z);
  domeGlow.position.set(x, 0, z);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 14, 24, 1, true), basic(null, RP.red, true, 0.7));
  pillar.position.set(x, 7, z);
  const rings = [0, 1, 2].map((i) => {
    const r = flat(new THREE.RingGeometry(0.9, 1, 64), basic(null, i === 1 ? RP.purple : RP.red, true, 0.9), x, z, 0.1 + i * 0.01);
    r.userData.d = i * 0.12;
    return r;
  });
  ctx.scene.add(circle, under, dome, domeGlow, pillar, ...rings);
  const skullMat = new THREE.SpriteMaterial({ map: skull(), color: 0xffffff, transparent: true, depthWrite: false });
  const skulls = Array.from({ length: Math.round(10 * Q) + 2 }, () => {
    const s = new THREE.Sprite(skullMat);
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * radius * 0.7;
    s.position.set(x + Math.cos(a) * d, 0.3, z + Math.sin(a) * d);
    s.scale.setScalar(0.6 + Math.random() * 0.4);
    s.userData.v = new THREE.Vector3(Math.cos(a) * 1.5, 4 + Math.random() * 3, Math.sin(a) * 1.5);
    ctx.scene.add(s);
    return s;
  });
  for (let i = 0; i < 3; i++) ctx.sparks(new THREE.Vector3(x, 1 + i * 0.8, z), i === 1 ? RP.purple : RP.red, Math.round(26 * Q), 6);
  let t = 0;
  let second = false;
  ctx.add((dt) => {
    t += dt / 1.6;
    circle.rotation.z = t * 2.5;
    under.rotation.z = t * 2.5;
    const k = Math.min(1, t / 0.3);
    circle.scale.setScalar(0.3 + k * 0.7);
    under.scale.setScalar(0.3 + k * 0.7);
    (circle.material as THREE.MeshBasicMaterial).opacity = Math.max(0, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    (under.material as THREE.MeshBasicMaterial).opacity = 0.8 * Math.max(0, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
    const dk = Math.min(1, t / 0.35);
    const ds = radius * (0.2 + 0.8 * (1 - (1 - dk) ** 3));
    dome.scale.set(ds, ds * 0.7, ds);
    domeGlow.scale.set(ds, ds * 0.7, ds);
    (dome.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.max(0, 1 - t * 1.4);
    (domeGlow.material as THREE.MeshBasicMaterial).opacity = 0.5 * Math.max(0, 1 - t * 1.4);
    pillar.scale.set(1 + t, Math.max(0.01, 1 - t * 1.3), 1 + t);
    (pillar.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.max(0, 1 - t * 1.3);
    for (const r of rings) {
      const rt = Math.max(0, Math.min(1, (t - r.userData.d) / 0.6));
      r.scale.setScalar(0.2 + rt * radius * 1.3);
      (r.material as THREE.MeshBasicMaterial).opacity = rt > 0 ? 0.9 * (1 - rt) : 0;
    }
    for (const s of skulls) {
      s.position.addScaledVector(s.userData.v, dt);
      s.userData.v.y -= dt * 6;
      if (s.position.y < 0.2) s.position.y = 0.2;
      s.material.opacity = Math.max(0, 1 - t * 1.2);
    }
    if (!second && t > 0.35) {
      second = true;
      ctx.shake(0.4);
      ctx.sparks(new THREE.Vector3(x, 0.5, z), RP.red, Math.round(30 * Q), 8);
    }
    if (t >= 1) {
      dispose(ctx.scene, circle, under, dome, domeGlow, pillar, ...rings);
      skulls.forEach((s) => ctx.scene.remove(s));
      skullMat.dispose();
    }
    return t < 1;
  });
}
