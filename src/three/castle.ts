import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Obj } from '../game/maps';
import { canvasTexture, outline, shadows, toon } from './toon';

/**
 * The town's fortifications, built from code: crenellated stone walls, round towers with
 * slate-blue cone roofs, and the castle on the north wall (two wings with a keep each, joined
 * by an arch the north avenue runs under). 1 unit = 1 tile; footprints match the map's
 * blocked tiles, the arch is high enough to walk beneath.
 */

const WALL_H = 2.6;
const ROOF = '#4f6fa8';
/** Set by buildFortress: the desert town's walls are warm sandstone with domed towers. */
let sandy = false;
const stoneMat = () => {
  const m = toon('#ffffff', { map: stone() });
  if (sandy) m.color.set('#f0cf98');
  return m;
};

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Courses of pale ashlar blocks; one texture covers 2 x 2 units. */
let stoneTex: THREE.Texture | null = null;
function stone() {
  if (stoneTex) return stoneTex;
  const r = rng(7);
  stoneTex = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#857d70';
    c.fillRect(0, 0, 256, 256);
    const rh = 32;
    for (let j = 0; j < 8; j++) {
      let x = j % 2 ? -26 : 0;
      while (x < 256) {
        const w = Math.min(256 - x, 38 + r() * 30);
        const k = 0.9 + r() * 0.16;
        c.fillStyle = `rgb(${(222 * k) | 0},${(213 * k) | 0},${(196 * k) | 0})`;
        c.fillRect(x + 1.5, j * rh + 1.5, w - 3, rh - 3);
        c.fillStyle = 'rgba(255,255,255,0.2)';
        c.fillRect(x + 1.5, j * rh + 1.5, w - 3, 2);
        c.fillStyle = 'rgba(60,50,40,0.18)';
        c.fillRect(x + 1.5, j * rh + rh - 4.5, w - 3, 3);
        x += w;
      }
    }
  });
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  return stoneTex;
}

/** Stone with two arched, lit windows per storey: for keep faces, which keep their own 0..1 UVs. */
let windowTex: THREE.Texture | null = null;
function windowed() {
  if (windowTex) return windowTex;
  windowTex = canvasTexture(256, 512, (c) => {
    const img = (stone().image as HTMLCanvasElement);
    for (let y = 0; y < 512; y += 256) c.drawImage(img, 0, y);
    for (let f = 0; f < 3; f++) {
      for (const x of [76, 180]) {
        const top = 70 + f * 150;
        c.fillStyle = '#efe6d2';
        c.beginPath();
        c.roundRect(x - 22, top - 6, 44, 84, [22, 22, 2, 2]);
        c.fill();
        c.fillStyle = '#2a3550';
        c.beginPath();
        c.roundRect(x - 16, top, 32, 72, [16, 16, 0, 0]);
        c.fill();
        c.fillStyle = 'rgba(255,214,120,0.55)';
        c.fillRect(x - 12, top + 34, 24, 34);
        c.fillStyle = '#efe6d2';
        c.fillRect(x - 2, top + 8, 4, 64);
      }
    }
  });
  return windowTex;
}

/** Box-maps UVs from world-space positions, so stone courses run on across merged pieces. */
function boxUV(geo: THREE.BufferGeometry, k = 0.5) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    let u: number, v: number;
    if (ny >= nx && ny >= nz) [u, v] = [p.getX(i), p.getZ(i)];
    else if (nx >= nz) [u, v] = [p.getZ(i), p.getY(i)];
    else [u, v] = [p.getX(i), p.getY(i)];
    uv[i * 2] = u * k;
    uv[i * 2 + 1] = v * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Merlons along a straight run from (x0, z0) to (x1, z1) at height y. */
function merlons(out: THREE.BufferGeometry[], x0: number, z0: number, x1: number, z1: number, y: number, size = 0.42) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.floor(len / (size * 2)));
  const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    out.push(along ? box(size, size * 0.9, 0.28, x, y + size * 0.45, z) : box(0.28, size * 0.9, size, x, y + size * 0.45, z));
  }
}

/** A rectangular crenellated block: footprint w x d centred on (x, z), standing on y = 0. */
function block(stoneParts: THREE.BufferGeometry[], x: number, z: number, w: number, d: number, h: number) {
  stoneParts.push(box(w, h, d, x, h / 2, z));
  const e = 0.14;
  merlons(stoneParts, x - w / 2 + e, z - d / 2 + e, x + w / 2 - e, z - d / 2 + e, h);
  merlons(stoneParts, x - w / 2 + e, z + d / 2 - e, x + w / 2 - e, z + d / 2 - e, h);
  merlons(stoneParts, x - w / 2 + e, z - d / 2 + e, x - w / 2 + e, z + d / 2 - e, h);
  merlons(stoneParts, x + w / 2 - e, z - d / 2 + e, x + w / 2 - e, z + d / 2 - e, h);
}

/** A round tower with a corbelled parapet and a pointed slate roof, as a group at its centre. */
function tower(r: number, h: number, roofH = r * 1.9 + 0.6): THREE.Group {
  const g = new THREE.Group();
  const s = stoneMat();
  const parts: THREE.BufferGeometry[] = [
    boxUV(new THREE.CylinderGeometry(r, r * 1.06, h, 18).translate(0, h / 2, 0)),
    boxUV(new THREE.CylinderGeometry(r + 0.16, r, 0.35, 18).translate(0, h + 0.17, 0)),
    boxUV(new THREE.CylinderGeometry(r + 0.16, r + 0.16, 0.3, 18).translate(0, h + 0.5, 0)),
  ];
  const body = new THREE.Mesh(mergeGeometries(parts)!, s);
  g.add(body);
  const roof = sandy
    ? new THREE.Mesh(new THREE.SphereGeometry(r + 0.05, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, h + 0.65, 0), toon('#e8dcc0'))
    : new THREE.Mesh(new THREE.ConeGeometry(r + 0.32, roofH, 18).translate(0, h + 0.65 + roofH / 2, 0), toon(ROOF));
  g.add(roof);
  // arrow slits facing out every way
  const slit = toon('#2a2622');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.06), slit);
    m.position.set(Math.sin(a) * (r + 0.01), h * 0.62, Math.cos(a) * (r + 0.01));
    m.rotation.y = a;
    m.userData.noOutline = true;
    g.add(m);
  }
  outline(body, 0.03);
  outline(roof, 0.03);
  shadows(g, true, true);
  return g;
}

/** A square keep with windows on every face and a pyramid roof. */
function keep(w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.BoxGeometry(w, h, w).translate(0, h / 2, 0), toon('#ffffff', { map: windowed() }));
  g.add(core);
  const top: THREE.BufferGeometry[] = [];
  block(top, 0, 0, w + 0.3, w + 0.3, 0.3);
  const parapet = new THREE.Mesh(mergeGeometries(top.map((p) => boxUV(p.translate(0, h, 0))))!, toon('#ffffff', { map: stone() }));
  g.add(parapet);
  const roofH = w * 0.95;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.66, roofH, 4).rotateY(Math.PI / 4).translate(0, h + 0.3 + roofH / 2, 0), toon(ROOF));
  g.add(roof);
  outline(core, 0.03);
  outline(roof, 0.03);
  g.add(flag(h + 0.3 + roofH, 0));
  shadows(g, true, true);
  return g;
}

let flagCount = 0;
/** A pennant on a pole; named 'flag' so the world sways it. */
function flag(y: number, color: number): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6).translate(0, y + 0.7, 0), toon('#5d4037')));
  const col = ['#b71c1c', '#3a5fa8', '#d4af37'][(color + flagCount++) % 3];
  const t = canvasTexture(64, 32, (c) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(64, 16);
    c.lineTo(0, 32);
    c.fill();
    c.fillStyle = '#fff3c4';
    c.font = 'bold 22px serif';
    c.fillText('♪', 6, 24);
  });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45).translate(0.45, 0, 0), new THREE.MeshLambertMaterial({ map: t, transparent: true, side: THREE.DoubleSide }));
  f.position.y = y + 1.15;
  f.name = 'flag';
  g.add(f);
  return g;
}

function castle(o: Extract<Obj, { kind: 'castle' }>, group: THREE.Group) {
  const stoneParts: THREE.BufferGeometry[] = [];
  const dark: THREE.BufferGeometry[] = [];
  const HALL = 4.2;
  const wingW = o.w / 2 - o.door / 2;
  const mid = o.x + o.w / 2;
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? o.x : mid + o.door / 2;
    const cx = x0 + wingW / 2, cz = o.y + o.h / 2;
    // the hall, inset so the corner towers stand proud of it
    block(stoneParts, cx, cz, wingW - 1.4, o.h - 1.4, HALL);
    // tall windows down the courtyard front, and a great door
    for (let x = x0 + 2; x <= x0 + wingW - 2; x += 1.6) {
      if (Math.abs(x - cx) < 1.2) continue;
      dark.push(box(0.42, 0.95, 0.05, x, HALL * 0.62, o.y + o.h - 0.68));
      dark.push(box(0.42, 0.7, 0.05, x, HALL * 0.25, o.y + o.h - 0.68));
    }
    dark.push(box(1.3, 1.9, 0.08, cx, 0.95, o.y + o.h - 0.66));
    for (const [tx, tz] of [[x0 + 0.9, o.y + 0.9], [x0 + wingW - 0.9, o.y + 0.9], [x0 + 0.9, o.y + o.h - 0.9], [x0 + wingW - 0.9, o.y + o.h - 0.9]]) {
      const inner = (side < 0 && tx > cx) || (side > 0 && tx < cx);
      const t = tower(1.25, inner ? 6.8 : 6.2);
      t.position.set(tx, 0, tz);
      group.add(t);
    }
    const k = keep(5, 8);
    k.position.set(cx + side * 0.8, 0, cz - 1.2);
    group.add(k);
  }
  // the arch over the north avenue: high enough to walk under, its top level with the wall walks
  const archW = o.door + 0.6;
  const arch: THREE.BufferGeometry[] = [];
  block(arch, mid, o.y + 2.2, archW, 3.2, 1.6);
  for (const g of arch) stoneParts.push(g.translate(0, 3.6, 0));
  // a dark underside so it reads as an archway, and a banner either side of it
  dark.push(box(archW, 0.1, 3.0, mid, 3.55, o.y + 2.2));
  const s = new THREE.Mesh(mergeGeometries(stoneParts.map((p) => boxUV(p)))!, toon('#ffffff', { map: stone() }));
  const d = new THREE.Mesh(mergeGeometries(dark.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('uv'); return p; }))!, toon('#2c2a33'));
  shadows(s, true, true);
  group.add(s, d);
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.6), toon(side < 0 ? '#b71c1c' : '#3a5fa8'));
    b.position.set(mid + side * (o.door / 2 - 0.9), 4.0, o.y + 3.83);
    group.add(b);
  }
}

/** Everything fortified in `objects`, or null if there is none. */
export function buildFortress(objects: Obj[], sand = false): THREE.Group | null {
  sandy = sand;
  const group = new THREE.Group();
  group.name = 'fortress';
  const walls: THREE.BufferGeometry[] = [];
  for (const o of objects) {
    if (o.kind === 'wall') {
      block(walls, o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, WALL_H);
    } else if (o.kind === 'tower') {
      const t = tower(o.s / 2 + 0.15, WALL_H + (o.s >= 4 ? 2.2 : 1.5));
      t.position.set(o.x + o.s / 2, 0, o.y + o.s / 2);
      group.add(t);
    } else if (o.kind === 'castle') castle(o, group);
  }
  if (!group.children.length && !walls.length) return null;
  if (walls.length) {
    const w = new THREE.Mesh(mergeGeometries(walls.map((p) => boxUV(p)))!, stoneMat());
    shadows(w, true, true);
    group.add(w);
  }
  return group;
}
