/**
 * Map layouts, shared by the browser (drawing) and the game server (collision, portals).
 * Everything is generated from a fixed seed, so no map files need to be stored.
 */

export const enum G {
  Grass = 0,
  Grass2 = 1,
  Dirt = 2,
  Cobble = 3,
  Plaza = 4,
  Water = 5,
  Flower = 6,
}

export type Obj =
  | { kind: 'building'; x: number; y: number; w: number; h: number; wall: number; roof: number; floors: number }
  | { kind: 'stall'; x: number; y: number; color: number }
  | { kind: 'tree'; x: number; y: number; big?: boolean }
  | { kind: 'bench'; x: number; y: number }
  | { kind: 'lamp'; x: number; y: number }
  | { kind: 'fountain'; x: number; y: number }
  | { kind: 'crate'; x: number; y: number }
  | { kind: 'banner'; x: number; y: number; color: number }
  | { kind: 'rock'; x: number; y: number };

export interface Npc {
  id: 'shop' | 'weapons' | 'healer' | 'guide';
  name: string;
  x: number;
  y: number;
  look: { gender: 'm' | 'f'; hair: number; hair_color: number; face: number; body: string };
}

export interface Portal {
  x: number;
  y: number;
  to: string;
  toX: number;
  toY: number;
  label: string;
}

export interface GameMap {
  id: string;
  name: string;
  w: number;
  h: number;
  ground: number[][];
  blocked: boolean[][];
  objects: Obj[];
  npcs: Npc[];
  portals: Portal[];
  spawn: { x: number; y: number };
  safe: boolean; // towns: no monsters, faster regen
  theme: Theme;
}

export type Theme = 'town' | 'meadow' | 'forest' | 'marsh' | 'canyon' | 'snow' | 'volcano';

/** Per-theme colours: one per ground type (G), then the sky and the land outside the map. */
export const THEMES: Record<Theme, { ground: string[]; sky: string; outside: string }> = {
  town: { ground: ['#6aa84f', '#74b356', '#b8925f', '#aaa499', '#cfc6b6', '#3f86c9', '#6aa84f'], sky: '#b9e2ff', outside: '#3d5a34' },
  meadow: { ground: ['#6aa84f', '#74b356', '#b8925f', '#aaa499', '#cfc6b6', '#3f86c9', '#6aa84f'], sky: '#83c7ff', outside: '#3b6331' },
  forest: { ground: ['#4f8f3c', '#5a9a43', '#8f6a43', '#8a8a7a', '#b0a890', '#2f6f8f', '#4f8f3c'], sky: '#9fd4c8', outside: '#24401f' },
  marsh: { ground: ['#6f8a4a', '#7a9450', '#7a6640', '#7d8170', '#a59f88', '#4f7a5a', '#6f8a4a'], sky: '#b8c9b0', outside: '#3d4a2c' },
  canyon: { ground: ['#c9a067', '#d1aa72', '#b07a48', '#a8825a', '#d8bf94', '#4a8fb0', '#c9a067'], sky: '#ffd9a8', outside: '#8a5a32' },
  snow: { ground: ['#eef3f8', '#e3ebf3', '#b9c6d3', '#a9b4c0', '#dfe6ee', '#9fd3f0', '#eef3f8'], sky: '#d4e6f5', outside: '#c9d6e3' },
  volcano: { ground: ['#4a3a35', '#56433c', '#3a2c28', '#5e5550', '#6e625b', '#ff6a1a', '#4a3a35'], sky: '#7a4a3e', outside: '#231816' },
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blank(id: string, name: string, w: number, h: number, fill: number, safe: boolean, theme: Theme = safe ? 'town' : 'meadow'): GameMap {
  return {
    id, name, w, h, safe, theme,
    ground: Array.from({ length: h }, () => Array(w).fill(fill)),
    blocked: Array.from({ length: h }, () => Array(w).fill(false)),
    objects: [], npcs: [], portals: [], spawn: { x: w / 2, y: h / 2 },
  };
}

function block(m: GameMap, x: number, y: number, w = 1, h = 1) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m.blocked[j]?.[i] !== undefined) m.blocked[j][i] = true;
}

function free(m: GameMap, x: number, y: number, w = 1, h = 1) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (m.blocked[j]?.[i] !== false) return false;
  return true;
}

// ---------------------------------------------------------------- town

function buildTown(): GameMap {
  const m = blank('town', 'เมืองเมโลเดีย', 44, 44, G.Cobble, true);
  const rnd = mulberry32(7);
  const cx = 22;
  const cy = 22;

  // round plaza in the middle
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) < 8) m.ground[y][x] = G.Plaza;
    }
  }
  // grass and trees around the edge (the town border)
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (x < 2 || y < 2 || x > m.w - 3 || y > m.h - 3) m.ground[y][x] = rnd() < 0.3 ? G.Grass2 : G.Grass;
    }
  }
  const edgeTree = (x: number, y: number) => {
    m.objects.push({ kind: 'tree', x, y, big: rnd() < 0.4 });
    block(m, x, y);
  };
  for (let i = 0; i < m.w; i += 2) {
    edgeTree(i, 0);
    edgeTree(i, m.h - 1);
  }
  for (let j = 2; j < m.h - 1; j += 2) {
    edgeTree(0, j);
    if (j < 19 || j > 25) edgeTree(m.w - 1, j); // east gate opening
  }
  block(m, 0, 0, m.w, 1);
  block(m, 0, m.h - 1, m.w, 1);
  block(m, 0, 0, 1, m.h);
  for (let j = 0; j < m.h; j++) if (j < 19 || j > 25) block(m, m.w - 1, j);

  // fountain
  m.objects.push({ kind: 'fountain', x: cx - 1.5, y: cy - 1.5 });
  block(m, cx - 2, cy - 2, 4, 4);

  // buildings (x, y, w, h)
  const buildings: [number, number, number, number, number, number, number][] = [
    [3, 3, 7, 5, 0, 0, 2], [12, 3, 6, 4, 1, 1, 1], [26, 3, 6, 5, 0, 2, 2], [34, 3, 6, 6, 2, 0, 1],
    [3, 11, 5, 7, 1, 2, 1], [3, 26, 6, 6, 2, 1, 2], [3, 35, 7, 5, 0, 0, 1], [13, 36, 6, 5, 1, 2, 1],
    [26, 36, 6, 5, 2, 0, 2], [34, 31, 7, 6, 0, 1, 1], [35, 10, 6, 5, 1, 0, 1],
  ];
  for (const [x, y, w, h, wall, roof, floors] of buildings) {
    m.objects.push({ kind: 'building', x, y, w, h, wall, roof, floors });
    block(m, x, y, w, h);
  }

  // market stalls around the plaza
  const stalls: [number, number, number][] = [
    [13, 13, 0], [16, 12, 1], [27, 12, 2], [30, 13, 3], [12, 29, 2], [15, 31, 0], [28, 31, 1], [31, 29, 3],
  ];
  for (const [x, y, color] of stalls) {
    m.objects.push({ kind: 'stall', x, y, color });
    block(m, x, y, 2, 2);
  }

  // benches, lamps, crates, banners
  for (const [x, y] of [[17, 18], [26, 18], [17, 26], [26, 26]]) {
    m.objects.push({ kind: 'bench', x, y });
    block(m, x, y);
  }
  for (const [x, y] of [[14, 22], [30, 22], [22, 14], [22, 30], [36, 20], [36, 26]]) {
    m.objects.push({ kind: 'lamp', x, y });
    block(m, x, y);
  }
  for (const [x, y] of [[10, 9], [11, 9], [25, 9], [10, 33], [33, 27], [20, 9]]) {
    m.objects.push({ kind: 'crate', x, y });
    block(m, x, y);
  }
  for (const [x, y, color] of [[39, 18, 0], [39, 27, 1], [20, 35, 0], [24, 35, 1]]) {
    m.objects.push({ kind: 'banner', x, y, color });
    block(m, x, y);
  }
  for (const [x, y] of [[19, 6], [9, 21], [33, 19], [30, 7], [11, 39], [33, 39], [20, 40], [42, 8], [42, 36]]) {
    if (free(m, x, y)) {
      m.objects.push({ kind: 'tree', x, y, big: true });
      block(m, x, y);
    }
  }

  m.npcs = [
    { id: 'shop', name: 'ร้านของใช้ ป้ามะลิ', x: 14, y: 15, look: { gender: 'f', hair: 3, hair_color: 0, face: 1, body: '#e7a33e' } },
    { id: 'weapons', name: 'ร้านเครื่องดนตรี ลุงบุญ', x: 29, y: 15, look: { gender: 'm', hair: 1, hair_color: 7, face: 2, body: '#795548' } },
    { id: 'healer', name: 'ครูเพลงใจดี', x: 21, y: 18, look: { gender: 'f', hair: 4, hair_color: 7, face: 0, body: '#ffffff' } },
    { id: 'guide', name: 'ไกด์ประจำเมือง', x: 38, y: 23, look: { gender: 'm', hair: 0, hair_color: 3, face: 3, body: '#3949ab' } },
  ];
  for (const n of m.npcs) block(m, n.x, n.y);

  m.portals = [{ x: 42, y: 22, to: 'field', toX: 3.5, toY: 30.5, label: 'ทุ่งเมโลดี้' }];
  m.spawn = { x: 22.5, y: 26.5 };
  return m;
}

// ---------------------------------------------------------------- field

function buildField(): GameMap {
  const m = blank('field', 'ทุ่งเมโลดี้', 60, 60, G.Grass, false);
  const rnd = mulberry32(20261025);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const r = rnd();
      m.ground[y][x] = r < 0.03 ? G.Flower : r < 0.4 ? G.Grass2 : G.Grass;
    }
  }
  // winding dirt path from the west portal
  let py = 30;
  for (let x = 0; x < m.w - 4; x++) {
    py += Math.round((rnd() - 0.5) * 1.4);
    py = Math.max(24, Math.min(36, py));
    m.ground[py][x] = G.Dirt;
    m.ground[py + 1][x] = G.Dirt;
  }
  // ponds
  for (const [px, py2, rx, ry] of [[30, 46, 4, 2.5], [16, 14, 3, 2], [46, 20, 2.5, 3]]) {
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (((x - px) / rx) ** 2 + ((y - py2) / ry) ** 2 <= 1) {
          m.ground[y][x] = G.Water;
          m.blocked[y][x] = true;
        }
      }
    }
  }
  const addTree = (x: number, y: number, big = rnd() < 0.3) => {
    if (!free(m, x, y) || m.ground[y][x] === G.Dirt) return;
    m.objects.push({ kind: 'tree', x, y, big });
    block(m, x, y);
  };
  for (let i = 0; i < m.w; i++) {
    addTree(i, 0, true);
    addTree(i, m.h - 1, true);
  }
  for (let j = 0; j < m.h; j++) {
    if (j < 28 || j > 33) addTree(0, j, true);
    if (j < 28 || j > 33) addTree(m.w - 1, j, true); // east gate to the forest
  }
  block(m, 0, 0, m.w, 1);
  block(m, 0, m.h - 1, m.w, 1);
  for (let j = 0; j < m.h; j++) if (j < 28 || j > 33) block(m, 0, j);
  for (let j = 0; j < m.h; j++) if (j < 28 || j > 33) block(m, m.w - 1, j);
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 2; x < m.w - 2; x++) {
      if ((x < 7 || x > m.w - 8) && y > 25 && y < 36) continue; // keep the arrival areas clear
      const r = rnd();
      if (r < 0.04) addTree(x, y);
      else if (r < 0.05 && free(m, x, y)) {
        m.objects.push({ kind: 'rock', x, y });
        block(m, x, y);
      }
    }
  }
  m.portals = [
    { x: 1, y: 30, to: 'town', toX: 40.5, toY: 22.5, label: 'เมืองเมโลเดีย' },
    { x: 58, y: 30, to: 'forest', toX: 3.5, toY: 28.5, label: 'ป่าเพลงกระซิบ' },
  ];
  m.spawn = { x: 3.5, y: 30.5 };
  return m;
}

// ---------------------------------------------------------------- wild maps

interface WildSpec {
  id: string;
  name: string;
  theme: Theme;
  seed: number;
  size: number;
  /** Ground mix: [type, share] picked per tile. */
  ground: [G, number][];
  trees: number; // chance per tile
  rocks: number;
  /** Ponds / ice / lava: [cx, cy, rx, ry]. */
  pools: [number, number, number, number][];
  prev: { to: string; toX: number; toY: number; label: string };
  next?: { to: string; label: string };
}

/** The maps beyond the meadow, all built the same way: a winding path from the west gate to the east gate. */
function buildWild(sp: WildSpec): GameMap {
  const n = sp.size;
  const m = blank(sp.id, sp.name, n, n, sp.ground[0][0], false, sp.theme);
  const rnd = mulberry32(sp.seed);
  const mid = Math.floor(n / 2);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let r = rnd();
      for (const [g, share] of sp.ground) {
        if ((r -= share) < 0) {
          m.ground[y][x] = g;
          break;
        }
      }
    }
  }
  // winding path between the gates
  let py = mid;
  for (let x = 0; x < n; x++) {
    if (x > 3 && x < n - 4) py = Math.max(mid - 10, Math.min(mid + 10, py + Math.round((rnd() - 0.5) * 1.6)));
    else py += Math.sign(mid - py);
    m.ground[py][x] = G.Dirt;
    m.ground[py + 1][x] = G.Dirt;
  }
  for (const [cx, cy, rx, ry] of sp.pools) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && m.ground[y][x] !== G.Dirt) {
          m.ground[y][x] = G.Water;
          m.blocked[y][x] = true;
        }
      }
    }
  }
  const gate = (j: number) => j >= mid - 3 && j <= mid + 3;
  const addTree = (x: number, y: number, big = rnd() < 0.3) => {
    if (!free(m, x, y) || m.ground[y][x] === G.Dirt) return;
    m.objects.push({ kind: 'tree', x, y, big });
    block(m, x, y);
  };
  for (let i = 0; i < n; i++) {
    addTree(i, 0, true);
    addTree(i, n - 1, true);
    if (!gate(i)) addTree(0, i, true);
    if (!gate(i) || !sp.next) addTree(n - 1, i, true);
  }
  block(m, 0, 0, n, 1);
  block(m, 0, n - 1, n, 1);
  for (let j = 0; j < n; j++) {
    if (!gate(j)) block(m, 0, j);
    if (!gate(j) || !sp.next) block(m, n - 1, j);
  }
  for (let y = 2; y < n - 2; y++) {
    for (let x = 2; x < n - 2; x++) {
      if ((x < 7 || x > n - 8) && Math.abs(y - mid) < 6) continue; // keep the gates clear
      const r = rnd();
      if (r < sp.trees) addTree(x, y);
      else if (r < sp.trees + sp.rocks && free(m, x, y) && m.ground[y][x] !== G.Dirt) {
        m.objects.push({ kind: 'rock', x, y });
        block(m, x, y);
      }
    }
  }
  m.portals = [{ x: 1, y: mid, ...sp.prev }];
  if (sp.next) m.portals.push({ x: n - 2, y: mid, to: sp.next.to, toX: 3.5, toY: 28.5, label: sp.next.label });
  m.spawn = { x: 3.5, y: mid + 0.5 };
  return m;
}

// The chain: meadow -> forest -> marsh -> canyon -> snow -> volcano. Every wild map is 56 x 56 with its gates on row 28.
const back = (to: string, label: string, fromSize = 56) => ({ to, toX: fromSize - 3.5, toY: to === 'field' ? 30.5 : 28.5, label });
const buildForest = () => buildWild({
  id: 'forest', name: 'ป่าเพลงกระซิบ', theme: 'forest', seed: 11, size: 56,
  ground: [[G.Grass2, 0.55], [G.Grass, 0.42], [G.Flower, 0.03]], trees: 0.11, rocks: 0.015, pools: [[40, 12, 3, 2], [14, 44, 2.5, 2]],
  prev: back('field', 'ทุ่งเมโลดี้', 60), next: { to: 'marsh', label: 'บึงจังหวะ' },
});
const buildMarsh = () => buildWild({
  id: 'marsh', name: 'บึงจังหวะ', theme: 'marsh', seed: 23, size: 56,
  ground: [[G.Grass, 0.6], [G.Grass2, 0.4]], trees: 0.035, rocks: 0.01,
  pools: [[14, 12, 5, 3], [36, 10, 4, 3], [44, 42, 6, 4], [18, 42, 4, 5], [30, 26, 3, 2]],
  prev: back('forest', 'ป่าเพลงกระซิบ'), next: { to: 'canyon', label: 'หุบผาร็อค' },
});
const buildCanyon = () => buildWild({
  id: 'canyon', name: 'หุบผาร็อค', theme: 'canyon', seed: 37, size: 56,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.012, rocks: 0.07, pools: [[42, 40, 3, 2]],
  prev: back('marsh', 'บึงจังหวะ'), next: { to: 'snow', label: 'ยอดเขาหิมะโซปราโน' },
});
const buildSnow = () => buildWild({
  id: 'snow', name: 'ยอดเขาหิมะโซปราโน', theme: 'snow', seed: 41, size: 56,
  ground: [[G.Grass, 0.65], [G.Grass2, 0.35]], trees: 0.06, rocks: 0.025, pools: [[16, 14, 4, 3], [40, 44, 5, 3]],
  prev: back('canyon', 'หุบผาร็อค'), next: { to: 'volcano', label: 'ภูเขาไฟเมทัล' },
});
const buildVolcano = () => buildWild({
  id: 'volcano', name: 'ภูเขาไฟเมทัล', theme: 'volcano', seed: 53, size: 56,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.02, rocks: 0.06,
  pools: [[16, 12, 4, 3], [40, 14, 3, 4], [26, 44, 6, 3], [46, 40, 3, 3]],
  prev: back('snow', 'ยอดเขาหิมะโซปราโน'),
});

const built = new Map<string, GameMap>();
const BUILDERS: Record<string, () => GameMap> = {
  town: buildTown, field: buildField, forest: buildForest, marsh: buildMarsh, canyon: buildCanyon, snow: buildSnow, volcano: buildVolcano,
};
export const MAP_IDS = Object.keys(BUILDERS);
export const START_MAP = 'town';

/** A fresh copy each call for callers that mutate `blocked`; cached otherwise. */
export function getMap(id: string): GameMap {
  if (!BUILDERS[id]) id = START_MAP;
  if (!built.has(id)) built.set(id, BUILDERS[id]());
  return built.get(id)!;
}

export function walkable(m: GameMap, x: number, y: number) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && !m.blocked[ty][tx];
}

/** A* on the tile grid with 8-way moves (no corner cutting). Returns tile centres, excluding the start. */
export function findPath(m: GameMap, sx: number, sy: number, tx: number, ty: number, maxNodes = 5000) {
  const W = m.w;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && !m.blocked[y][x];
  if (!ok(tx, ty)) return null;
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open: { k: number; f: number }[] = [{ k: start, f: 0 }];
  const closed = new Set<number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  };
  let expanded = 0;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { k } = open.splice(bi, 1)[0];
    if (k === goal) {
      const path: { x: number; y: number }[] = [];
      let cur = k;
      while (cur !== start) {
        path.push({ x: (cur % W) + 0.5, y: Math.floor(cur / W) + 0.5 });
        cur = came.get(cur)!;
      }
      return path.reverse();
    }
    if (closed.has(k)) continue;
    closed.add(k);
    if (++expanded > maxNodes) return null;
    const x = k % W;
    const y = Math.floor(k / W);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (!ok(nx, ny)) continue;
        if (dx && dy && (!ok(x + dx, y) || !ok(x, y + dy))) continue;
        const nk = ny * W + nx;
        const ng = g.get(k)! + (dx && dy ? 1.41 : 1);
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          came.set(nk, k);
          open.push({ k: nk, f: ng + h(nx, ny) });
        }
      }
    }
  }
  return null;
}
