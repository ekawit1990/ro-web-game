import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Obj } from '../game/maps';
import { canvasTexture, outline, shadows, toon } from './toon';

/**
 * The desert town's buildings, built from code: flat-roofed adobe houses (some with a little dome
 * or a roof-top room) and the domed sandstone palace on the moat island. 1 unit = 1 tile.
 *
 * There are well over a hundred houses, so they are merged into one mesh (vertex colours on a
 * shared plaster texture) plus one merged outline mesh: two draw calls instead of thousands,
 * which keeps phones happy.
 */

type House = Extract<Obj, { kind: 'building' }>;
type Palace = Extract<Obj, { kind: 'palace' }>;

const PLASTER = ['#e9cf9f', '#dcb986', '#efdcb6'];
const DOME = ['#f4ead4', '#5e9fc4', '#e0c18e'];
const DARK = '#3b2a1e';
const WOOD = '#7a5233';

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 185, 185, 185, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

/** Hand-smoothed plaster: soft blotches and specks, tiling every 2 units. */
let plasterTex: THREE.Texture | null = null;
function plaster() {
  if (plasterTex) return plasterTex;
  const r = rng(29);
  plasterTex = canvasTexture(128, 128, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(150,110,70,${0.03 + r() * 0.05})`;
      c.beginPath();
      c.ellipse(r() * 128, r() * 128, 4 + r() * 12, 3 + r() * 8, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 260; i++) {
      c.fillStyle = r() < 0.5 ? 'rgba(120,85,50,0.18)' : 'rgba(255,250,235,0.3)';
      c.fillRect(r() * 128, r() * 128, 1.5, 1.5);
    }
  });
  plasterTex.wrapS = plasterTex.wrapT = THREE.RepeatWrapping;
  return plasterTex;
}

/** World-space box UVs, so the plaster runs on across merged pieces. */
function boxUV(g: THREE.BufferGeometry, k = 0.5) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    const [u, v] = ny >= nx && ny >= nz ? [p.getX(i), p.getZ(i)] : nx >= nz ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u * k;
    uv[i * 2 + 1] = v * k;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color);
  const arr = new Float32Array(geo.attributes.position.count * 3);
  for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Collects coloured pieces (and, for the big ones, an inflated copy for the outline). */
class Parts {
  solid: THREE.BufferGeometry[] = [];
  hull: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, outlined = true, ry = 0) {
    const g = geo.clone();
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.solid.push(boxUV(paint(g, color)));
    if (outlined) {
      g.computeBoundingSphere();
      const r = Math.max(0.05, g.boundingSphere!.radius);
      const o = geo.clone();
      if (ry) o.rotateY(ry);
      o.scale(1 + 0.03 / r, 1 + 0.03 / r, 1 + 0.03 / r).translate(x, y, z);
      o.deleteAttribute('uv');
      o.deleteAttribute('normal');
      this.hull.push(o.index ? o.toNonIndexed() : o);
    }
  }

  box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, outlined = true) {
    this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, outlined);
  }

  build(): THREE.Group {
    const g = new THREE.Group();
    if (!this.solid.length) return g;
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, map: plaster(), gradientMap: gradient });
    const body = new THREE.Mesh(mergeGeometries(this.solid)!, mat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.noOutline = true;
    g.add(body);
    if (this.hull.length) {
      const hull = new THREE.Mesh(mergeGeometries(this.hull)!, new THREE.MeshBasicMaterial({ color: 0x2a1f1a, side: THREE.BackSide }));
      hull.userData.isOutline = true;
      g.add(hull);
    }
    return g;
  }
}

const dome = (r: number) => new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);

/** One adobe house into `p`: walls, parapet, beam ends, door and windows on the street side. */
function house(p: Parts, o: House) {
  const r = rng(o.x * 977 + o.y * 131 + 7);
  const w = o.w - 0.12, d = o.h - 0.12;
  const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
  const H = 1.25 + o.floors * 0.85;
  const wall = PLASTER[o.wall % PLASTER.length];
  const trim = '#c9a774';
  p.box(w, H, d, wall, cx, H / 2, cz);
  // parapet with little rounded merlons at the corners
  const t = 0.12;
  for (const [bw, bd, x, z] of [[w, t, cx, cz - d / 2 + t / 2], [w, t, cx, cz + d / 2 - t / 2], [t, d, cx - w / 2 + t / 2, cz], [t, d, cx + w / 2 - t / 2, cz]] as const) {
    p.box(bw, 0.22, bd, wall, x, H + 0.11, z, false);
  }
  for (const [x, z] of [[cx - w / 2 + 0.1, cz - d / 2 + 0.1], [cx + w / 2 - 0.1, cz - d / 2 + 0.1], [cx - w / 2 + 0.1, cz + d / 2 - 0.1], [cx + w / 2 - 0.1, cz + d / 2 - 0.1]]) {
    p.box(0.22, 0.34, 0.22, wall, x, H + 0.17, z, false);
  }
  // a trim band between storeys
  if (o.floors > 1) p.box(w + 0.04, 0.08, d + 0.04, trim, cx, 1.25 + 0.85 - 0.1, cz, false);

  // the street side: face 0 = +z, 1 = +x, 2 = -z, 3 = -x
  const face = o.face ?? 0;
  const along = face % 2 === 0 ? w : d; // width of the front
  const fx = (u: number) => (face === 0 ? cx + u : face === 2 ? cx - u : face === 1 ? cx + w / 2 : cx - w / 2);
  const fz = (u: number) => (face === 1 ? cz - u : face === 3 ? cz + u : face === 0 ? cz + d / 2 : cz - d / 2);
  const ry = (face * Math.PI) / 2;
  const front = (u: number, y: number, bw: number, bh: number, color: string, depth = 0.06, out = 0) => {
    const nx = face === 1 ? 1 : face === 3 ? -1 : 0, nz = face === 0 ? 1 : face === 2 ? -1 : 0;
    p.add(new THREE.BoxGeometry(bw, bh, depth), color, fx(u) + nx * out, y, fz(u) + nz * out, false, ry);
  };
  const doorU = (r() - 0.5) * Math.max(0, along - 1.2);
  front(doorU, 0.5, 0.56, 1.0, DARK);
  front(doorU, 1.0, 0.56, 0.08, trim, 0.1, 0.02); // lintel
  // vigas: roof beams poking out under the parapet
  for (let u = -along / 2 + 0.3; u <= along / 2 - 0.2; u += 0.45) front(u, H - 0.18, 0.08, 0.08, WOOD, 0.3, 0.12);
  for (let f = 0; f < o.floors; f++) {
    const y = 0.85 + f * 0.85 + (f ? 0.35 : 0);
    for (let u = -along / 2 + 0.45; u <= along / 2 - 0.4; u += 0.9) {
      if (!f && Math.abs(u - doorU) < 0.6) continue;
      if (r() < 0.25) continue;
      front(u, y, 0.28, 0.36, DARK);
      front(u, y - 0.21, 0.36, 0.05, trim, 0.1, 0.03);
    }
  }
  // the roof: flat, a little dome, or a room on top
  const kind = o.roof % 3;
  if (kind === 1 && Math.min(w, d) >= 2) {
    const rad = Math.min(w, d) * 0.28;
    p.box(rad * 2.1, 0.18, rad * 2.1, wall, cx, H + 0.09, cz, false);
    p.add(dome(rad), DOME[Math.floor(r() * DOME.length)], cx, H + 0.18, cz);
  } else if (kind === 2 && o.floors === 1 && w >= 2.4 && d >= 2.4) {
    const rw = w * 0.45, rd = d * 0.45;
    const rx = cx + (r() < 0.5 ? -1 : 1) * (w - rw) * 0.3, rz = cz + (r() < 0.5 ? -1 : 1) * (d - rd) * 0.3;
    p.box(rw, 0.8, rd, wall, rx, H + 0.4, rz);
    p.box(rw + 0.08, 0.1, rd + 0.08, trim, rx, H + 0.85, rz, false);
  }
}

/** Every desert-style house in `objects`, merged. Null if there are none. */
export function buildDesertHouses(objects: Obj[]): THREE.Group | null {
  const p = new Parts();
  for (const o of objects) if (o.kind === 'building' && o.style === 'desert') house(p, o);
  if (!p.solid.length) return null;
  const g = p.build();
  g.name = 'desert-houses';
  return g;
}

// ---------------------------------------------------------------- palace

function onion(r: number, h: number) {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // bulges out past the drum, then draws in to a point
    const rad = r * (t < 0.45 ? 1 + Math.sin((t / 0.45) * Math.PI * 0.5) * 0.12 : Math.cos(((t - 0.45) / 0.55) * Math.PI * 0.5) * 1.12);
    pts.push(new THREE.Vector2(Math.max(0.001, rad), t * h));
  }
  return new THREE.LatheGeometry(pts, 24);
}

/** The palace: a long hall, a great central dome, two smaller ones, minarets at the corners. */
export function buildPalace(o: Palace): THREE.Group {
  const g = new THREE.Group();
  const sand = toon('#ffffff', { map: plaster() });
  sand.color.set('#ead2a2');
  const sand2 = toon('#ffffff', { map: plaster() });
  sand2.color.set('#dcbc86');
  const white = toon('#f6eedc');
  const blue = toon('#3f7fb8');
  const gold = toon('#e0b23a');
  const dark = toon('#2e2118');
  const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
  const W = o.w - 1.6, D = o.h - 1.4, H = 3.6;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const uv = (geo: THREE.BufferGeometry) => boxUV(geo.index ? geo.toNonIndexed() : geo);
  // plinth, hall and a raised centre block
  add(uv(new THREE.BoxGeometry(W + 0.8, 0.4, D + 0.8)), sand2, cx, 0.2, cz);
  add(uv(new THREE.BoxGeometry(W, H, D)), sand, cx, 0.4 + H / 2, cz);
  add(uv(new THREE.BoxGeometry(5.2, 1.4, D - 0.6)), sand, cx, 0.4 + H + 0.7, cz);
  // crenellation along the roof edge
  for (let x = -W / 2 + 0.3; x <= W / 2 - 0.3; x += 0.6) {
    for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) add(new THREE.BoxGeometry(0.3, 0.32, 0.2), sand2, cx + x, 0.4 + H + 0.16, cz + z);
  }
  // domes: a big blue onion in the middle, white ones over the wings
  add(new THREE.CylinderGeometry(2.0, 2.1, 0.9, 24), sand, cx, 0.4 + H + 1.4 + 0.45, cz);
  add(onion(2.0, 3.4), blue, cx, 0.4 + H + 2.3, cz);
  add(new THREE.ConeGeometry(0.08, 0.9, 8), gold, cx, 0.4 + H + 2.3 + 3.4 + 0.4, cz);
  add(new THREE.SphereGeometry(0.16, 10, 8), gold, cx, 0.4 + H + 2.3 + 3.35, cz);
  for (const s of [-1, 1]) {
    const x = cx + s * (W / 2 - 2.2);
    add(new THREE.CylinderGeometry(1.15, 1.2, 0.6, 20), sand, x, 0.4 + H + 0.3, cz);
    add(onion(1.15, 1.9), white, x, 0.4 + H + 0.6, cz);
    add(new THREE.ConeGeometry(0.06, 0.6, 8), gold, x, 0.4 + H + 0.6 + 1.9 + 0.25, cz);
  }
  // minarets at the four corners
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * (W / 2 + 0.1), z = cz + sz * (D / 2 + 0.1);
    const mh = 6.6;
    add(new THREE.CylinderGeometry(0.42, 0.5, mh, 14), sand, x, 0.4 + mh / 2, z);
    add(new THREE.CylinderGeometry(0.62, 0.42, 0.3, 14), sand2, x, 0.4 + mh * 0.72, z);
    add(new THREE.CylinderGeometry(0.34, 0.34, 0.8, 14), white, x, 0.4 + mh + 0.4, z);
    add(onion(0.4, 0.9), blue, x, 0.4 + mh + 0.8, z);
    add(new THREE.ConeGeometry(0.04, 0.45, 6), gold, x, 0.4 + mh + 1.9, z);
  }
  // the south front: a tall pointed archway, arched windows either side, blue tiles over the door
  const front = cz + D / 2 + 0.01;
  const arch = (w: number, h: number) => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(-w / 2, h * 0.68);
    s.quadraticCurveTo(-w / 2, h * 0.92, 0, h);
    s.quadraticCurveTo(w / 2, h * 0.92, w / 2, h * 0.68);
    s.lineTo(w / 2, 0);
    s.closePath();
    return new THREE.ShapeGeometry(s, 8);
  };
  add(new THREE.BoxGeometry(3.2, H + 1.0, 0.5), sand2, cx, 0.4 + (H + 1.0) / 2, front + 0.2);
  add(arch(1.9, 2.8), dark, cx, 0.4, front + 0.46).userData.noOutline = true;
  add(new THREE.BoxGeometry(2.6, 0.5, 0.06), blue, cx, 0.4 + 3.45, front + 0.46).userData.noOutline = true;
  for (let x = -W / 2 + 1.0; x <= W / 2 - 1.0; x += 1.3) {
    if (Math.abs(x) < 2.2) continue;
    for (const y of [0.4 + 0.7, 0.4 + 2.2]) add(arch(0.5, 0.95), dark, cx + x, y, front).userData.noOutline = true;
  }
  // a pair of braziers flanking the steps
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.14, 0.2, 0.9, 10), dark, cx + s * 2.2, 0.45, front + 0.9);
    add(new THREE.CylinderGeometry(0.3, 0.16, 0.25, 12), gold, cx + s * 2.2, 1.0, front + 0.9);
    const flame = add(new THREE.ConeGeometry(0.16, 0.45, 8), new THREE.MeshBasicMaterial({ color: '#ffb347' }), cx + s * 2.2, 1.35, front + 0.9);
    flame.userData.noOutline = true;
  }
  outline(g, 0.03);
  shadows(g, true, true);
  return g;
}
