import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameMap, Obj } from '../game/maps';
import { sparkTexture } from './toon';

/**
 * Code-built scenery for the newer maps: the ruined castle town (broken walls, roofless houses, columns,
 * crumbling towers, a roofless cathedral), gravestones, and the cave's glowing crystals. Everything of one
 * kind is merged into a single mesh with vertex colours, so a whole map of ruins is a handful of draw calls.
 */

type Rnd = () => number;
export const rngFor = (seed: number): Rnd => {
  let s = (seed % 2147483647) || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

/** Collects coloured boxes and other shapes, then merges them. */
export class Pile {
  parts: THREE.BufferGeometry[] = [];
  private col = new THREE.Color();

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    this.col.set(color);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      // a touch of moss on top faces and grime low down
      const y = pos.getY(i);
      const k = 0.88 + Math.min(0.2, y * 0.04);
      c[i * 3] = this.col.r * k;
      c[i * 3 + 1] = this.col.g * k;
      c[i * 3 + 2] = this.col.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.parts.push(g);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rotY = 0, tilt = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y + h / 2, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rotY, tilt * 0.5)),
      new THREE.Vector3(w, h, d),
    );
    this.add(BOX, color, m);
  }

  shape(geo: THREE.BufferGeometry, x: number, y: number, z: number, s: THREE.Vector3, color: THREE.ColorRepresentation, rotY = 0, tilt = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rotY, 0)), s);
    this.add(geo, color, m);
  }

  mesh(mat: THREE.Material) {
    if (!this.parts.length) return null;
    const geo = mergeGeometries(this.parts)!;
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const ROUGH = new THREE.DodecahedronGeometry(0.5, 0);
const STONES = ['#8e8a80', '#9a958a', '#827d74', '#a39d90', '#76726a'];
const MOSS = '#6f7f4f';

/** A wall run along x (or z when `alongZ`), crumbling: block columns of random height, some missing, rubble at the foot. */
function brokenWall(p: Pile, r: Rnd, x0: number, z0: number, len: number, thick: number, alongZ: boolean, hMin: number, hMax: number) {
  for (let i = 0; i < len; i += 0.5) {
    if (r() < 0.12) continue; // a hole
    const h = hMin + (hMax - hMin) * (0.5 + 0.5 * Math.sin(i * 0.9 + r() * 2)) * (0.6 + r() * 0.4);
    const color = STONES[Math.floor(r() * STONES.length)];
    const [x, z] = alongZ ? [x0 + thick / 2, z0 + i + 0.25] : [x0 + i + 0.25, z0 + thick / 2];
    const [w, d] = alongZ ? [thick, 0.52] : [0.52, thick];
    p.box(x, 0, z, w, h, d, color);
    // stone courses: a slightly wider band every metre
    if (h > 1.2 && r() < 0.5) p.box(x, Math.floor(h * 0.6), z, w * 1.06, 0.12, d * 1.06, '#6e6a62');
    if (r() < 0.35) p.box(x, h, z, w * 0.9, 0.08, d * 0.9, MOSS); // moss on top
    if (r() < 0.3) {
      const s = 0.2 + r() * 0.35;
      const ox = alongZ ? (r() < 0.5 ? -1 : 1) * (thick / 2 + 0.3) : (r() - 0.5) * 0.4;
      const oz = alongZ ? (r() - 0.5) * 0.4 : (r() < 0.5 ? -1 : 1) * (thick / 2 + 0.3);
      p.shape(ROUGH, x + ox, s * 0.3, z + oz, new THREE.Vector3(s, s * 0.7, s), color, r() * 6, r());
    }
  }
}

function ruinHouse(p: Pile, r: Rnd, o: Extract<Obj, { kind: 'ruinwall' }>) {
  const outer = o.w === 2 || o.h === 2; // a run of the town wall
  if (outer) {
    const alongZ = o.h > o.w;
    brokenWall(p, r, o.x, o.y, alongZ ? o.h : o.w, 1.6, alongZ, 1.6, 4.2);
    return;
  }
  // a roofless house: four walls with window gaps and one side mostly fallen
  const fallen = Math.floor(r() * 4);
  const hMax = 1.6 + r() * 1.8;
  const t = 0.35;
  const sides: [number, number, number, boolean][] = [[o.x, o.y, o.w, false], [o.x, o.y + o.h - t, o.w, false], [o.x, o.y, o.h, true], [o.x + o.w - t, o.y, o.h, true]];
  sides.forEach(([x, z, len, alongZ], i) => brokenWall(p, r, x, z, len, t, alongZ, i === fallen ? 0.2 : 0.8, i === fallen ? 0.9 : hMax));
  // a fallen beam and rubble inside
  p.box(o.x + o.w / 2, 0.15, o.y + o.h / 2, o.w * 0.7, 0.18, 0.2, '#4e3a2a', r() * 3, 0.25);
  for (let i = 0; i < 3; i++) {
    const s = 0.25 + r() * 0.4;
    p.shape(ROUGH, o.x + 0.6 + r() * (o.w - 1.2), s * 0.3, o.y + 0.6 + r() * (o.h - 1.2), new THREE.Vector3(s, s * 0.6, s), STONES[i % 5], r() * 6, r());
  }
}

function pillar(p: Pile, r: Rnd, x: number, z: number, broken: boolean) {
  const h = broken ? 1.2 + r() * 1.6 : 4.2;
  p.box(x, 0, z, 0.9, 0.3, 0.9, '#8a857a');
  p.shape(CYL, x, 0.3 + h / 2, z, new THREE.Vector3(0.62, h, 0.62), '#a8a294');
  if (broken) {
    // the top lies in the grass beside it
    p.shape(CYL, x + 0.9, 0.3, z + 0.4, new THREE.Vector3(0.6, 1.6, 0.6), '#a29c8e', r() * 6, Math.PI / 2);
  } else {
    p.box(x, 0.3 + h, z, 0.95, 0.3, 0.95, '#8f8a7e');
  }
}

function ruinTower(p: Pile, r: Rnd, x: number, z: number, s: number) {
  const R = s / 2;
  const h = 4 + r() * 3;
  // round tower of stacked rings, the top broken off at a slant
  for (let y = 0; y < h; y += 0.5) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const top = h - (Math.cos(a - 1) * 0.5 + 0.5) * 2.2; // the slanted break
      if (y > top) continue;
      const bx = x + R + Math.cos(a) * (R - 0.25), bz = z + R + Math.sin(a) * (R - 0.25);
      p.box(bx, y, bz, 0.5, 0.5, R * 0.52, STONES[(k + Math.floor(y * 2)) % 5], -a);
    }
  }
  p.box(x + R, 0, z + R, s * 0.7, 0.15, s * 0.7, '#5a564e');
}

function cathedral(p: Pile, r: Rnd, o: Extract<Obj, { kind: 'cathedral' }>) {
  const { x, y, w, h } = o;
  const t = 0.6;
  // side walls: tall, with window bays, the roof long gone
  for (const z of [y, y + h - t]) {
    for (let i = 0; i < w; i += 1) {
      const bay = i % 3 === 1;
      const top = 6 - (r() < 0.3 ? r() * 3 : 0);
      if (bay) {
        p.box(x + i + 0.5, 0, z + t / 2, 1, 1.4, t, '#8e897e');
        p.box(x + i + 0.5, 4.4, z + t / 2, 1, Math.max(0.3, top - 4.4), t, '#8e897e');
      } else p.box(x + i + 0.5, 0, z + t / 2, 1, top, t, STONES[i % 5]);
    }
  }
  // the west front with the great door gap, the apse wall at the east end half fallen
  for (let j = 0; j < h; j += 1) {
    const door = Math.abs(j + 0.5 - h / 2) < 1.6;
    if (!door) p.box(x + t / 2, 0, y + j + 0.5, t, 7 - Math.abs(j + 0.5 - h / 2) * 0.4, 1, STONES[j % 5]);
    else p.box(x + t / 2, 4.5, y + j + 0.5, t, 2.2, 1, '#8e897e');
    p.box(x + w - t / 2, 0, y + j + 0.5, t, 1 + r() * 3.5, 1, STONES[(j + 2) % 5]);
  }
  // a bell tower on the front corner, broken at the top
  ruinTower(p, r, x - 1, y - 1, 4);
  // rows of columns inside, some down
  for (let i = 3; i < w - 2; i += 3) {
    for (const z of [y + 2.5, y + h - 2.5]) pillar(p, r, x + i, z, r() < 0.5);
  }
  // the altar and rubble
  p.box(x + w - 2.5, 0, y + h / 2, 1.2, 1, 2.4, '#b0a898');
  for (let i = 0; i < 14; i++) {
    const s = 0.3 + r() * 0.6;
    p.shape(ROUGH, x + 1 + r() * (w - 2), s * 0.3, y + 1 + r() * (h - 2), new THREE.Vector3(s, s * 0.6, s), STONES[i % 5], r() * 6, r());
  }
  // the floor: worn flagstones
  p.box(x + w / 2, 0, y + h / 2, w - 0.4, 0.06, h - 0.4, '#7a766c');
}

function grave(p: Pile, r: Rnd, x: number, z: number) {
  const kind = Math.floor(r() * 3);
  const c = ['#8f8c86', '#7f7b74', '#a09c94'][kind];
  const tilt = (r() - 0.5) * 0.3;
  if (kind === 0) {
    p.box(x, 0, z, 0.55, 0.75, 0.16, c, r() * 0.4, tilt);
    p.shape(CYL, x, 0.75, z, new THREE.Vector3(0.55, 0.16, 0.55), c, 0, Math.PI / 2);
  } else if (kind === 1) {
    // a cross
    p.box(x, 0, z, 0.14, 1.0, 0.14, c, 0, tilt);
    p.box(x, 0.62, z, 0.55, 0.13, 0.13, c, 0, tilt);
  } else {
    p.box(x, 0, z, 0.7, 0.45, 0.32, c, r(), tilt);
  }
  p.box(x, 0, z + 0.45, 0.6, 0.06, 0.9, '#4e4a3a'); // the mound
}

// ---------------------------------------------------------------- crystals

function crystals(map: GameMap): THREE.Group | null {
  const list = map.objects.filter((o): o is Extract<Obj, { kind: 'crystal' }> => o.kind === 'crystal');
  if (!list.length) return null;
  const g = new THREE.Group();
  const p = new Pile();
  const prism = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  prism.translate(0, 0.5, 0);
  const tip = new THREE.ConeGeometry(0.5, 0.6, 6);
  tip.translate(0, 0.3, 0);
  const sparkles: number[] = [];
  const COLORS = [0x6ff0ff, 0xb98bff, 0xff7fd8, 0x7fffc8];
  for (const o of list) {
    const r = rngFor(o.x * 131 + o.y * 7 + 1);
    const color = COLORS[Math.floor(o.hue * COLORS.length) % COLORS.length];
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const s = 0.18 + r() * 0.22;
      const h = 0.6 + r() * 1.6;
      const ox = o.x + 0.5 + (r() - 0.5) * 0.7, oz = o.y + 0.5 + (r() - 0.5) * 0.7;
      const lean = (r() - 0.5) * 0.7, rot = r() * 6;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(ox, 0, oz), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, rot, lean * 0.6)), new THREE.Vector3(s, h, s));
      p.add(prism, color, m);
      const tipM = new THREE.Matrix4().compose(new THREE.Vector3(0, 1, 0).applyMatrix4(m), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, rot, lean * 0.6)), new THREE.Vector3(s, s * 2, s));
      p.add(tip, color, tipM);
    }
    sparkles.push(o.x + 0.5, 0.8 + r(), o.y + 0.5);
  }
  // crystals glow by themselves: unlit, a little see-through
  const mesh = p.mesh(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.88 }));
  if (mesh) {
    mesh.castShadow = false;
    g.add(mesh);
  }
  // twinkles over every cluster
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(sparkles, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: sparkTexture(), color: 0xc8f8ff, size: 0.9, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(pts);
  g.userData.tick = (t: number) => {
    (pts.material as THREE.PointsMaterial).size = 0.6 + Math.sin(t * 3) * 0.3;
    (pts.material as THREE.PointsMaterial).opacity = 0.6 + Math.sin(t * 2.1) * 0.3;
  };
  return g;
}

// ---------------------------------------------------------------- the map

export function buildRuinProps(map: GameMap): THREE.Group | null {
  const g = new THREE.Group();
  g.name = 'ruins';
  const p = new Pile();
  for (const o of map.objects) {
    const r = rngFor(Math.floor(o.x) * 7919 + Math.floor(o.y) * 104729 + 11);
    if (o.kind === 'ruinwall') ruinHouse(p, r, o);
    else if (o.kind === 'pillar') pillar(p, r, o.x + 0.5, o.y + 0.5, o.broken);
    else if (o.kind === 'ruintower') ruinTower(p, r, o.x, o.y, o.s);
    else if (o.kind === 'cathedral') cathedral(p, r, o);
    else if (o.kind === 'grave') grave(p, r, o.x + 0.5, o.y + 0.4);
  }
  const stone = p.mesh(new THREE.MeshToonMaterial({ vertexColors: true }));
  if (stone) g.add(stone);
  const c = crystals(map);
  if (c) g.add(c);
  return g.children.length ? g : null;
}
