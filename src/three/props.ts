import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { G, THEMES, type GameMap, type Obj } from '../game/maps';
import { paintPaving, paintTerrain } from './ground';
import { buildFortress } from './castle';
import { buildDesertHouses, buildPalace } from './desert';
import { buildCart, buildFountain, buildGoods, buildHedge, buildPlanter, buildSign } from './townprops';
import { buildPonds, hasPonds, pondField } from './pond';
import { canvasTexture, mesh, outline, shade, shadows, toon } from './toon';

/** The static world: ground, buildings, market stalls, trees, lamps, fountain, portals. 1 unit = 1 tile. */

function rng(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// ---------------------------------------------------------------- ground

const TILE = 40;

export function buildGround(m: GameMap): THREE.Group {
  const g = new THREE.Group();
  const r = rng(m.w * 31 + m.h);
  const BASE = THEMES[m.theme].ground;
  const ponds = hasPonds(m);
  const tex = canvasTexture(m.w * TILE, m.h * TILE, (c) => {
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        // a pond's water tiles are cut out below; what shows of them at the rounded rim is bank
        const t = ponds && m.ground[y][x] === G.Water ? G.Grass : m.ground[y][x];
        const px = x * TILE;
        const py = y * TILE;
        const base = BASE[t];
        c.fillStyle = base;
        c.fillRect(px, py, TILE, TILE);
        if (t === 0 || t === 1 || t === 6) {
          for (let i = 0; i < 14; i++) {
            c.fillStyle = r() < 0.5 ? shade(base, -16) : shade(base, 14);
            c.fillRect(px + r() * TILE, py + r() * TILE, 1.5, 3);
          }
          if (t === 6) {
            for (let i = 0; i < 4; i++) {
              c.fillStyle = ['#ff7eb6', '#fff27a', '#ffffff', '#b39ddb'][Math.floor(r() * 4)];
              c.beginPath();
              c.arc(px + 4 + r() * 24, py + 4 + r() * 24, 2.2, 0, Math.PI * 2);
              c.fill();
            }
          }
        } else if (t === 2) {
          for (let i = 0; i < 8; i++) {
            c.fillStyle = shade(base, r() < 0.5 ? -20 : 14);
            c.beginPath();
            c.ellipse(px + r() * TILE, py + r() * TILE, 1.5 + r() * 2, 1 + r(), 0, 0, Math.PI * 2);
            c.fill();
          }
        } else if (t === 3 || t === 4) {
          c.fillStyle = shade(base, -22);
          c.fillRect(px, py, TILE, TILE);
          const n = t === 4 ? 3 : 4;
          const s = TILE / n;
          for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
              const ox = j % 2 ? s / 2 : 0;
              c.fillStyle = shade(base, (r() - 0.5) * 16);
              c.beginPath();
              c.roundRect(px + i * s + ox - (ox && i === n - 1 ? s : 0) + 1, py + j * s + 1, s - 2, s - 2, 3);
              c.fill();
            }
          }
        } else if (t === 5) {
          c.fillStyle = shade(base, -12);
          c.fillRect(px, py, TILE, TILE);
          c.strokeStyle = m.theme === 'volcano' ? 'rgba(255,230,120,0.6)' : 'rgba(255,255,255,0.3)';
          c.lineWidth = 1.5;
          const wx = px + r() * 20;
          const wy = py + 6 + r() * 20;
          c.beginPath();
          c.moveTo(wx, wy);
          c.quadraticCurveTo(wx + 5, wy - 3, wx + 10, wy);
          c.stroke();
        }
      }
    }
    const soft = (x: number, y: number) => {
      const t = m.ground[y][x];
      // outside town, cobble tiles are just stonier ground and blend in with the rest
      return t === G.Grass || t === G.Grass2 || t === G.Dirt || t === G.Flower || (ponds && t === G.Water) || (!m.safe && t === G.Cobble);
    };
    paintTerrain(c, m, TILE, BASE, soft);
    if (m.safe) paintPaving(c, m, TILE, m.theme === 'desert');
  });
  tex.anisotropy = 8;
  if (ponds) cutPonds(tex.image as HTMLCanvasElement, m);
  tex.magFilter = THREE.LinearFilter;
  const plane = mesh(new THREE.PlaneGeometry(m.w, m.h), new THREE.MeshLambertMaterial({ map: tex, alphaTest: ponds ? 0.5 : 0 }), m.w / 2, 0, m.h / 2);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  plane.name = 'ground';
  g.add(plane);
  // the world outside the map
  const outside = mesh(new THREE.PlaneGeometry(m.w + 200, m.h + 200), new THREE.MeshLambertMaterial({ color: THEMES[m.theme].outside }), m.w / 2, -0.02, m.h / 2);
  outside.rotation.x = -Math.PI / 2;
  outside.receiveShadow = true;
  // drawn first and without depth, so the sunken pond basins show through the holes in the ground
  outside.renderOrder = -1;
  (outside.material as THREE.Material).depthWrite = false;
  g.add(outside);
  return g;
}

/** Opens the ground where the ponds are and darkens the damp bank around them. */
function cutPonds(cv: HTMLCanvasElement, m: GameMap) {
  const c = cv.getContext('2d')!;
  const p = pondField(m);
  const snow = m.theme === 'snow';
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      let near = false;
      for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2 && !near; i++) near = m.ground[ty + j]?.[tx + i] === G.Water;
      if (!near) continue;
      const img = c.getImageData(tx * TILE, ty * TILE, TILE, TILE);
      const d = img.data;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const f = p.f(tx + (x + 0.5) / TILE, ty + (y + 0.5) / TILE);
          const k = (y * TILE + x) * 4;
          if (f > 0.5) d[k + 3] = 0;
          else if (f > 0.34) {
            const dim = 1 - 0.35 * ((f - 0.34) / 0.16);
            const wet = snow ? 1 : 0.86; // damp earth on grass and sand, just a shadow on snow
            d[k] *= dim * (snow ? 1 : 0.92);
            d[k + 1] *= dim;
            d[k + 2] *= dim * wet;
          }
        }
      }
      c.putImageData(img, tx * TILE, ty * TILE);
    }
  }
}

// ---------------------------------------------------------------- buildings

const WALLS = ['#efe2c6', '#e6d3b0', '#d9cbb8'];
const ROOFS = ['#b5532f', '#4f6fa8', '#6b8e3d'];

function wallTexture(width: number, height: number, floors: number, wall: string, door: boolean) {
  const PX = 64;
  return canvasTexture(Math.round(width * PX), Math.round(height * PX), (c) => {
    const W = width * PX;
    const H = height * PX;
    c.fillStyle = wall;
    c.fillRect(0, 0, W, H);
    // plaster noise
    for (let i = 0; i < W * H / 300; i++) {
      c.fillStyle = `rgba(120,90,60,${Math.random() * 0.06})`;
      c.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
    const beam = '#6d4a2b';
    c.fillStyle = beam;
    const floorH = H / floors;
    for (let f = 0; f <= floors; f++) c.fillRect(0, Math.min(H - 8, f * floorH - 4), W, 8);
    const step = Math.max(PX * 1.2, W / Math.max(1, Math.round(width / 1.6)));
    for (let x = 0; x <= W + 1; x += step) c.fillRect(Math.min(W - 8, x - 4), 0, 8, H);
    // diagonal braces
    c.strokeStyle = beam;
    c.lineWidth = 5;
    for (let f = 0; f < floors; f++) {
      for (let x = 0; x + step <= W + 1; x += step * 2) {
        c.beginPath();
        c.moveTo(x, (f + 1) * floorH);
        c.lineTo(x + step, f * floorH);
        c.stroke();
      }
    }
    // windows
    for (let f = 0; f < floors; f++) {
      for (let x = step / 2; x < W; x += step) {
        if (door && f === floors - 1 && Math.abs(x - W / 2) < step * 0.6) continue;
        const wy = f * floorH + floorH * 0.28;
        c.fillStyle = '#f4efe4';
        c.fillRect(x - 17, wy - 3, 34, 42);
        c.fillStyle = '#7fa7c9';
        c.fillRect(x - 14, wy, 28, 36);
        c.fillStyle = 'rgba(255,255,255,0.45)';
        c.fillRect(x - 12, wy + 2, 8, 14);
        c.fillStyle = '#f4efe4';
        c.fillRect(x - 1.5, wy, 3, 36);
        c.fillRect(x - 14, wy + 16, 28, 3);
        c.fillStyle = '#b5532f';
        c.fillRect(x - 18, wy + 38, 36, 6); // flower box
        c.fillStyle = '#ff7eb6';
        for (let k = -12; k <= 12; k += 6) c.fillRect(x + k, wy + 34, 4, 4);
      }
    }
    if (door) {
      const dw = 44;
      const dh = Math.min(floorH * 0.75, 80);
      c.fillStyle = '#3b2414';
      c.fillRect(W / 2 - dw / 2 - 4, H - dh - 4, dw + 8, dh + 4);
      c.fillStyle = '#6a4326';
      c.fillRect(W / 2 - dw / 2, H - dh, dw, dh);
      c.fillStyle = '#d4af37';
      c.fillRect(W / 2 + dw / 2 - 10, H - dh / 2, 5, 5);
    }
  });
}

function building(o: Extract<Obj, { kind: 'building' }>): THREE.Group {
  const g = new THREE.Group();
  const wallH = 0.9 + o.floors * 0.75;
  const wall = WALLS[o.wall % WALLS.length];
  const roof = ROOFS[o.roof % ROOFS.length];
  const w = o.w - 0.1;
  const h = o.h - 0.1;
  // four walls, door on the south (+z) side
  const sides: [number, number, number, number, boolean][] = [
    [0, 0, h / 2, w, true], [Math.PI, 0, -h / 2, w, false], [Math.PI / 2, w / 2, 0, h, false], [-Math.PI / 2, -w / 2, 0, h, false],
  ];
  for (const [rot, x, z, width, door] of sides) {
    const p = mesh(new THREE.PlaneGeometry(width, wallH), toon('#ffffff', { map: wallTexture(width, wallH, o.floors, wall, door) }), x, wallH / 2, z);
    p.rotation.y = rot;
    g.add(p);
  }
  // inner block so shadows and outlines work
  const core = mesh(new THREE.BoxGeometry(w - 0.02, wallH, h - 0.02), toon(shade(wall, -20)), 0, wallH / 2, 0);
  g.add(core);
  // gable roof along x
  const e = 0.35;
  const roofH = 0.6 + Math.min(o.w, o.h) * 0.22;
  const shape = new THREE.Shape();
  shape.moveTo(-h / 2 - e, 0);
  shape.lineTo(h / 2 + e, 0);
  shape.lineTo(0, roofH);
  shape.closePath();
  const tiles = canvasTexture(128, 128, (c) => {
    c.fillStyle = roof;
    c.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      c.fillStyle = shade(roof, -30);
      c.fillRect(0, y + 13, 128, 3);
      for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) c.fillRect(x, y, 2, 14);
    }
  });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(0.6, 0.6);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + e * 2, bevelEnabled: false });
  const r = new THREE.Mesh(roofGeo, [toon(shade(wall, -10)), toon('#ffffff', { map: tiles })]);
  r.rotation.y = Math.PI / 2;
  r.position.set(-w / 2 - e, wallH - 0.05, 0);
  g.add(r);
  const chimney = mesh(new THREE.BoxGeometry(0.3, 0.8, 0.3), toon('#8d6e63'), w * 0.25, wallH + roofH * 0.6, -h * 0.15);
  g.add(chimney);
  g.position.set(o.x + o.w / 2, 0, o.y + o.h / 2);
  outline(core, 0.02);
  outline(r, 0.02);
  outline(chimney, 0.02);
  shadows(g, true, true);
  return g;
}

const STRIPES: [string, string][] = [['#2e7d32', '#f1f1f1'], ['#3a5fa8', '#f1f1f1'], ['#c0392b', '#f6e7b4'], ['#e09a2d', '#fff4d6']];

function stall(o: Extract<Obj, { kind: 'stall' }>): THREE.Group {
  const g = new THREE.Group();
  const [a, b] = STRIPES[o.color % STRIPES.length];
  g.add(mesh(new THREE.BoxGeometry(1.5, 0.55, 1.5), toon('#8a5a2b'), 0, 0.275, 0));
  g.add(mesh(new THREE.BoxGeometry(1.56, 0.06, 1.56), toon('#a87440'), 0, 0.58, 0));
  const goods = ['#e53935', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#7cb342'];
  for (let i = 0; i < 9; i++) {
    g.add(mesh(new THREE.SphereGeometry(0.11, 10, 8), toon(goods[(i + o.color) % goods.length]), -0.45 + (i % 3) * 0.45, 0.7, -0.45 + Math.floor(i / 3) * 0.45));
  }
  for (const [x, z] of [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.72], [0.72, 0.72]]) {
    g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8), toon('#4e342e'), x, 0.75, z));
  }
  const stripes = canvasTexture(256, 32, (c) => {
    for (let i = 0; i < 16; i++) {
      c.fillStyle = i % 2 ? b : a;
      c.fillRect(i * 16, 0, 16, 32);
    }
  });
  const awningMat = toon('#ffffff', { map: stripes });
  awningMat.side = THREE.DoubleSide;
  const awning = mesh(new THREE.ConeGeometry(1.35, 0.7, 4, 1, true), awningMat, 0, 1.75, 0);
  awning.rotation.y = Math.PI / 4;
  g.add(awning);
  g.position.set(o.x + 1, 0, o.y + 1);
  outline(g, 0.015);
  shadows(g, true, true);
  return g;
}

function lamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.9, 8), toon('#37474f'), 0, 0.95, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.1, 8), toon('#263238'), 0, 0.05, 0));
  g.add(mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), new THREE.MeshBasicMaterial({ color: '#ffe9a8' }), 0, 2.0, 0));
  g.add(mesh(new THREE.ConeGeometry(0.22, 0.18, 4), toon('#263238'), 0, 2.22, 0));
  outline(g, 0.012);
  shadows(g);
  return g;
}

function bench(): THREE.Group {
  const g = new THREE.Group();
  const green = toon('#2e7d32');
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.06, 0.4), green, 0, 0.38, 0));
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.3, 0.05), green, 0, 0.6, -0.18));
  for (const x of [-0.45, 0.45]) g.add(mesh(new THREE.BoxGeometry(0.05, 0.38, 0.35), toon('#333333'), x, 0.19, 0));
  outline(g, 0.012);
  shadows(g);
  return g;
}

function crate(): THREE.Group {
  const g = new THREE.Group();
  const t = canvasTexture(64, 64, (c) => {
    c.fillStyle = '#a1764a';
    c.fillRect(0, 0, 64, 64);
    c.strokeStyle = '#5d4037';
    c.lineWidth = 6;
    c.strokeRect(3, 3, 58, 58);
    c.beginPath();
    c.moveTo(3, 3);
    c.lineTo(61, 61);
    c.stroke();
  });
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), toon('#ffffff', { map: t }), 0, 0.35, 0));
  outline(g, 0.012);
  shadows(g);
  return g;
}

function banner(color: number): THREE.Group {
  const g = new THREE.Group();
  const col = ['#3a5fa8', '#b71c1c'][color % 2];
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 8), toon('#5d4037'), 0, 1.3, 0));
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.05, 0.05), toon('#d4af37'), 0, 2.45, 0));
  const t = canvasTexture(64, 128, (c) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(64, 0);
    c.lineTo(64, 128);
    c.lineTo(32, 104);
    c.lineTo(0, 128);
    c.fill();
    c.fillStyle = '#fff3c4';
    c.font = 'bold 48px serif';
    c.textAlign = 'center';
    c.fillText('♪', 32, 64);
  });
  const flagMat = new THREE.MeshLambertMaterial({ map: t, transparent: true, side: THREE.DoubleSide });
  const flag = mesh(new THREE.PlaneGeometry(0.62, 1.24), flagMat, 0, 1.8, 0.03);
  flag.name = 'flag';
  g.add(flag);
  shadows(g);
  return g;
}

// ---------------------------------------------------------------- instanced trees and rocks

function colored(geo: THREE.BufferGeometry, color: string) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function treeGeometry() {
  const parts = [
    colored(new THREE.CylinderGeometry(0.1, 0.16, 1.1, 8).translate(0, 0.55, 0), '#6b4423'),
    colored(new THREE.IcosahedronGeometry(0.75, 1).translate(0, 1.6, 0), '#2e6b2f'),
    colored(new THREE.IcosahedronGeometry(0.5, 1).translate(0.35, 2.05, 0.1), '#3a8a3c'),
    colored(new THREE.IcosahedronGeometry(0.45, 1).translate(-0.35, 1.95, -0.1), '#3a8a3c'),
    colored(new THREE.IcosahedronGeometry(0.35, 1).translate(0, 2.4, 0.05), '#5cae4f'),
  ];
  return mergeGeometries(parts)!;
}

function instanced(geo: THREE.BufferGeometry, list: { x: number; z: number; s: number }[], flat = true) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true });
  void flat;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  list.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (p.x * 13.7 + p.z * 7.1) % (Math.PI * 2));
    m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.s, p.s * (0.9 + ((p.x * 3 + p.z) % 3) * 0.08), p.s));
    im.setMatrixAt(i, m);
  });
  im.castShadow = true;
  im.receiveShadow = true;
  return im;
}

// ---------------------------------------------------------------- whole map

export function buildProps(map: GameMap): THREE.Group {
  const g = new THREE.Group();
  const trees: { x: number; z: number; s: number }[] = [];
  const rocks: { x: number; z: number; s: number }[] = [];
  for (const o of map.objects) {
    let obj: THREE.Object3D | null = null;
    switch (o.kind) {
      case 'building': if (o.style !== 'desert') obj = building(o); break; // desert houses are merged below
      case 'palace': obj = buildPalace(o); break;
      case 'stall': obj = stall(o); break;
      case 'tree': trees.push({ x: o.x + 0.5, z: o.y + 0.5, s: o.big ? 1.3 : 0.95 }); break;
      case 'rock': rocks.push({ x: o.x + 0.5, z: o.y + 0.5, s: 0.9 }); break;
      case 'fountain': obj = buildFountain(); obj.position.set(Math.floor(o.x) + 2, 0, Math.floor(o.y) + 2); break;
      case 'goods': obj = buildGoods(o.x, o.y); break;
      case 'cart': obj = buildCart(o.x, o.y); break;
      case 'hedge': obj = buildHedge(o.x, o.y, o.w, o.h); break;
      case 'planter': obj = buildPlanter(); break;
      case 'sign': obj = buildSign(); break;
      case 'lamp': obj = lamp(); break;
      case 'bench': obj = bench(); break;
      case 'crate': obj = crate(); break;
      case 'banner': obj = banner(o.color); break;
    }
    if (!obj) continue;
    if (o.kind !== 'building' && o.kind !== 'stall' && o.kind !== 'fountain' && o.kind !== 'palace') obj.position.set(o.x + 0.5, 0, o.y + 0.5);
    obj.userData.obj = o; // lets village.ts swap in the modelled version
    g.add(obj);
  }
  if (trees.length) {
    const t = instanced(treeGeometry(), trees);
    t.name = 'trees';
    g.add(t);
  }
  if (rocks.length) {
    const rock = mergeGeometries([colored(new THREE.DodecahedronGeometry(0.4, 0).scale(1.2, 0.7, 1).translate(0, 0.22, 0), '#8d8d8d')])!;
    const r = instanced(rock, rocks);
    r.name = 'rocks';
    g.add(r);
  }
  g.userData.rocks = rocks;
  const houses = buildDesertHouses(map.objects);
  if (houses) g.add(houses);
  const fortress = buildFortress(map.objects, map.theme === 'desert');
  if (fortress) g.add(fortress);
  const ponds = buildPonds(map);
  if (ponds) g.add(ponds);
  return g;
}

/** Glowing warp ring. */
export function buildPortal(): THREE.Group {
  const g = new THREE.Group();
  const glow = (color: number, opacity: number) =>
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.75 - i * 0.18, 0.05, 8, 40), glow(0x7fd8ff, 0.9 - i * 0.2), 0, 0.06 + i * 0.03, 0);
    ring.rotation.x = Math.PI / 2;
    ring.name = `ring${i}`;
    g.add(ring);
  }
  const column = mesh(new THREE.CylinderGeometry(0.7, 0.7, 2.2, 32, 1, true), glow(0x5ab8ff, 0.18), 0, 1.1, 0);
  column.name = 'column';
  g.add(column);
  return g;
}
