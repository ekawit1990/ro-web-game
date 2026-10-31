import * as THREE from 'three';
import { pondShore } from './pond';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { G, type GameMap, type Theme } from '../game/maps';
import { track } from '../ui/loadProgress';

/**
 * Trees, bushes, flowers, grass and rocks from Quaternius' Ultimate Stylized Nature pack (CC0),
 * in public/models/nature/ as gzipped GLB (geometry only) plus shared, downsized textures that
 * are matched to each mesh by its material name. Everything is drawn instanced and is purely
 * visual: the map's blocked tiles stay exactly as before.
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/nature/`;
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
const models = new Map<string, Promise<THREE.Mesh[] | null>>();
const mats = new Map<string, THREE.Material>();

const gradient = (() => {
  const t = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

/** Material by the pack's material name: bark, rock and grass are opaque; leaves and flowers are cut-out cards. */
/** Theme tints on top of the textures (frosted pines, dry grass, scorched bark...). */
const TINTS: Partial<Record<Theme, Record<string, number>>> = {
  snow: { PineTree_Leaves: 0xd6ece6, PineTree_Bark: 0xb8a8a0 },
  canyon: { Grass: 0xd9c27a, None: 0xc9b46a, NormalTree_Bark: 0xc8a888 },
  marsh: { Grass: 0x8fa868, None: 0x7f9a58, NormalTree_Bark: 0x8a8070, BirchTree_Leaves: 0xa8c070 },
  volcano: { NormalTree_Bark: 0x5a4a45 },
  desert: { Grass: 0xd9c27a, None: 0xc9b46a },
};

function material(name: string, theme: Theme) {
  const key = `${name}:${theme}`;
  if (mats.has(key)) return mats.get(key)!;
  let m: THREE.Material;
  if (name === 'None') {
    m = new THREE.MeshToonMaterial({ color: TINTS[theme]?.None ?? 0x6fb44a, gradientMap: gradient, side: THREE.DoubleSide });
  } else {
    const cut = /Leaves|Flowers/.test(name);
    const file = name === 'Rock' ? 'Rocks.jpg' : `${name}.${cut ? 'png' : 'jpg'}`;
    const map = texLoader.load(BASE + file);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    m = new THREE.MeshToonMaterial({
      map, gradientMap: gradient, alphaTest: cut ? 0.5 : 0, side: cut || name === 'Grass' ? THREE.DoubleSide : THREE.FrontSide,
      // the pack's pine needles are olive; pull them greener
      color: TINTS[theme]?.[name] ?? (name === 'Grass' ? 0x9fd86a : name === 'PineTree_Leaves' ? 0x7fc27a : 0xffffff),
    });
  }
  mats.set(key, m);
  return m;
}

async function gunzip(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

function load(name: string) {
  if (!models.has(name)) {
    models.set(name, track((async () => {
      try {
        const res = await fetch(`${BASE}${name}.glb.gz`);
        if (!res.ok) return null;
        const gltf = await loader.parseAsync(await gunzip(await res.arrayBuffer()), BASE);
        const meshes: THREE.Mesh[] = [];
        gltf.scene.updateMatrixWorld(true);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
          const mesh = new THREE.Mesh(geo);
          mesh.userData.mat = (m.material as THREE.Material).name || m.name; // the material is picked per map theme
          meshes.push(mesh);
        });
        return meshes;
      } catch (e) {
        console.warn('nature model failed', name, e);
        return null;
      }
    })()));
  }
  return models.get(name)!;
}

interface Spot {
  model: string;
  x: number;
  z: number;
  s: number;
  rot: number;
  /** Height of the base (rocks sunk into a pond); 0 by default. */
  y?: number;
}

const TOWN_TREES = ['NormalTree_2', 'BirchTree_1', 'NormalTree_3', 'MapleTree_1', 'BirchTree_3', 'NormalTree_4', 'MapleTree_2'];
const FIELD_TREES = ['NormalTree_1', 'PineTree_2', 'BirchTree_2', 'MapleTree_3', 'PineTree_5', 'NormalTree_2', 'PineTree_1', 'BirchTree_1', 'MapleTree_1', 'NormalTree_3', 'PineTree_4'];
const TREE_SCALE: Record<string, number> = { Normal: 0.6, Pine: 0.72, Birch: 0.6, Maple: 0.5, Dead: 0.5, Palm: 0.6 };

/** Trees and how much grass / flowers / bushes grow, per map theme. */
const LOOK: Record<Theme, { trees: string[]; grass: number; flowers: number; bushes: number }> = {
  town: { trees: TOWN_TREES, grass: 0.2, flowers: 0.025, bushes: 0.06 },
  meadow: { trees: FIELD_TREES, grass: 0.3, flowers: 0.04, bushes: 0.05 },
  forest: { trees: ['NormalTree_1', 'PineTree_2', 'NormalTree_2', 'PineTree_1', 'BirchTree_2', 'NormalTree_3', 'PineTree_4', 'NormalTree_4', 'PineTree_5'], grass: 0.3, flowers: 0.02, bushes: 0.07 },
  marsh: { trees: ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'BirchTree_1', 'NormalTree_3'], grass: 0.32, flowers: 0.01, bushes: 0.04 },
  canyon: { trees: ['PalmTree_1', 'PalmTree_2', 'PalmTree_3', 'DeadTree_2'], grass: 0.05, flowers: 0, bushes: 0.01 },
  snow: { trees: ['PineTree_1', 'PineTree_2', 'PineTree_4', 'PineTree_5'], grass: 0, flowers: 0, bushes: 0 },
  volcano: { trees: ['DeadTree_1', 'DeadTree_3', 'DeadTree_2'], grass: 0, flowers: 0, bushes: 0 },
  desert: { trees: ['PalmTree_1', 'PalmTree_2', 'PalmTree_3'], grass: 0.012, flowers: 0, bushes: 0.006 },
};
const BUSHES = ['Bush', 'Bush_Flowers', 'Bush_Large', 'Bush_Small_Flowers'];
const FLOWERS = ['Flower_1_Clump', 'Flower_2_Clump', 'Flower_3_Clump', 'Flower_4_Clump', 'Plant_1', 'Plant_Flowers'];
const GRASS = ['Grass_Small', 'Grass_Large'];
const ROCKS = ['Rock_1', 'Rock_2', 'Rock_3', 'Rock_5'];

/** Deterministic per-tile noise so every player sees the same scenery. */
const hash = (x: number, y: number, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pick = <T,>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];

function plan(map: GameMap): Spot[] {
  const out: Spot[] = [];
  const town = map.safe;
  const look = LOOK[map.theme];
  const used = new Set<string>();
  for (const o of map.objects) {
    if (o.kind === 'tree') {
      const r = hash(o.x, o.y, 1);
      const model = pick(look.trees, r);
      const s = TREE_SCALE[model.replace(/Tree.*/, '')] * (o.big ? 1.1 : 0.85) * (0.9 + hash(o.x, o.y, 2) * 0.25);
      out.push({ model, x: o.x + 0.5, z: o.y + 0.5, s, rot: hash(o.x, o.y, 3) * Math.PI * 2 });
      used.add(`${o.x},${o.y}`);
    } else if (o.kind === 'planter') {
      // a young tree growing out of the planter's soil
      out.push({ model: pick(TOWN_TREES, hash(o.x, o.y, 1)), x: o.x + 0.5, z: o.y + 0.5, y: 0.36, s: 0.36, rot: hash(o.x, o.y, 3) * Math.PI * 2 });
      used.add(`${o.x},${o.y}`);
    } else if (o.kind === 'rock') {
      out.push({ model: pick(ROCKS, hash(o.x, o.y, 4)), x: o.x + 0.5, z: o.y + 0.5, s: (map.theme === 'canyon' || map.theme === 'volcano' ? 0.8 : 0.6) + hash(o.x, o.y, 5) * 0.35, rot: hash(o.x, o.y, 6) * 6.3 });
      used.add(`${o.x},${o.y}`);
    } else if ('x' in o) used.add(`${Math.floor(o.x)},${Math.floor(o.y)}`);
  }
  const houses = new Set<number>();
  for (const o of map.objects) {
    if (o.kind === 'building') for (let j = o.y; j < o.y + o.h; j++) for (let i = o.x; i < o.x + o.w; i++) houses.add(j * map.w + i);
  }
  const f = map.objects.find((o) => o.kind === 'fountain');
  const centre = f ? { x: f.x + 2, y: f.y + 2 } : { x: map.w / 2, y: map.h / 2 };
  const portal = (x: number, y: number) => map.portals.some((p) => Math.abs(p.x - x) < 3 && Math.abs(p.y - y) < 3);
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const g = map.ground[y][x];
      if (used.has(`${x},${y}`) || portal(x, y)) continue;
      const grassy = g === G.Grass || g === G.Grass2 || g === G.Flower;
      const r = hash(x, y, 7);
      const jx = x + 0.2 + hash(x, y, 8) * 0.6, jz = y + 0.2 + hash(x, y, 9) * 0.6, rot = hash(x, y, 10) * 6.3;
      if (grassy) {
        if ((g === G.Flower && look.flowers) || r < look.flowers) out.push({ model: pick(FLOWERS, hash(x, y, 11)), x: jx, z: jz, s: 0.8 + hash(x, y, 12) * 0.3, rot });
        else if (r < look.flowers + look.bushes && map.blocked[y][x] === false) out.push({ model: pick(BUSHES, hash(x, y, 13)), x: jx, z: jz, s: 0.7 + hash(x, y, 14) * 0.25, rot });
        else if (r < look.flowers + look.bushes + look.grass) out.push({ model: pick(GRASS, hash(x, y, 15)), x: jx, z: jz, s: 0.9 + hash(x, y, 16) * 0.4, rot });
      } else if (town && g === G.Cobble && !map.blocked[y][x]) {
        // a few flower pots of colour along the streets, never on the plaza
        const nextToHouse = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => houses.has((y + dy) * map.w + x + dx));
        if (nextToHouse && r < 0.3) out.push({ model: pick(r < 0.12 ? BUSHES : FLOWERS, hash(x, y, 17)), x: jx, z: jz, s: 0.85, rot });
      } else if (town && g === G.Plaza && !map.blocked[y][x]) {
        // flower beds ring the edge of the plaza (not every street paved like it)
        const edge = Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y) < 14
          && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.ground[y + dy]?.[x + dx] !== G.Plaza);
        if (edge && r < 0.45) out.push({ model: pick(FLOWERS, hash(x, y, 18)), x: jx, z: jz, s: 0.9, rot });
      }
    }
  }
  // boulders ring the ponds, reeds and flowers grow on the bank
  const shore = pondShore(map);
  for (const [i, r] of shore.rocks.entries()) out.push({ model: pick(ROCKS, hash(i, 1, 19)), x: r.x, z: r.z, y: r.y, s: r.s, rot: hash(i, 2, 19) * 6.3 });
  if (look.grass > 0) {
    for (const [i, b] of shore.bank.entries()) {
      const r = hash(i, 3, 19);
      const model = r < 0.55 ? 'Grass_Large' : r < 0.75 ? 'Plant_1' : r < 0.9 && look.flowers ? pick(FLOWERS, hash(i, 4, 19)) : 'Grass_Small';
      out.push({ model, x: b.x, z: b.z, s: 0.9 + hash(i, 5, 19) * 0.5, rot: hash(i, 6, 19) * 6.3 });
    }
  }
  return out;
}

/** Instanced draw of every spot, one InstancedMesh per model part. */
function instance(spots: Spot[], meshes: Map<string, THREE.Mesh[]>, theme: Theme) {
  const g = new THREE.Group();
  g.name = 'nature';
  const byModel = new Map<string, Spot[]>();
  for (const s of spots) {
    if (!meshes.has(s.model)) continue;
    if (!byModel.has(s.model)) byModel.set(s.model, []);
    byModel.get(s.model)!.push(s);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const [name, list] of byModel) {
    for (const part of meshes.get(name)!) {
      const im = new THREE.InstancedMesh(part.geometry, material(part.userData.mat, theme), list.length);
      list.forEach((s, i) => im.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, s.y ?? 0, s.z), q.setFromAxisAngle(up, s.rot), new THREE.Vector3(s.s, s.s, s.s))));
      const small = !/Tree|Rock|Bush/.test(name);
      im.castShadow = !small;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      g.add(im);
    }
  }
  return g;
}

/** Replaces the placeholder trees and rocks of `props` and scatters grass, flowers and bushes. */
export async function upgradeNature(props: THREE.Group, map: GameMap, alive: () => boolean) {
  const spots = plan(map);
  const names = [...new Set(spots.map((s) => s.model))];
  const loaded = await Promise.all(names.map(load));
  if (!alive()) return;
  const meshes = new Map<string, THREE.Mesh[]>();
  names.forEach((n, i) => loaded[i] && meshes.set(n, loaded[i]!));
  // only swap the trees out if they all arrived, so a flaky connection never leaves holes
  const trees = spots.filter((s) => /Tree|Rock/.test(s.model));
  if (trees.some((s) => !meshes.has(s.model))) return;
  props.add(instance(spots, meshes, map.theme));
  for (const n of ['trees', 'rocks']) {
    const old = props.children.find((c) => c.name === n);
    if (old) props.remove(old);
  }
}
