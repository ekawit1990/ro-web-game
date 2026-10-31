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
  /** `style: 'desert'` = flat-roofed adobe (roof picks flat / dome / roof terrace). */
  | { kind: 'building'; x: number; y: number; w: number; h: number; wall: number; roof: number; floors: number; face?: number; style?: 'desert' }
  | { kind: 'stall'; x: number; y: number; color: number }
  | { kind: 'tree'; x: number; y: number; big?: boolean }
  | { kind: 'bench'; x: number; y: number }
  | { kind: 'lamp'; x: number; y: number }
  | { kind: 'fountain'; x: number; y: number }
  | { kind: 'crate'; x: number; y: number }
  | { kind: 'banner'; x: number; y: number; color: number }
  | { kind: 'rock'; x: number; y: number }
  | { kind: 'goods'; x: number; y: number }
  | { kind: 'cart'; x: number; y: number }
  | { kind: 'hedge'; x: number; y: number; w: number; h: number }
  | { kind: 'planter'; x: number; y: number }
  | { kind: 'sign'; x: number; y: number }
  | { kind: 'wall'; x: number; y: number; w: number; h: number }
  | { kind: 'tower'; x: number; y: number; s: number }
  /** Two wings either side of a `door`-wide passage down the middle, joined by an arch over it. */
  | { kind: 'castle'; x: number; y: number; w: number; h: number; door: number }
  /** The desert palace: domed sandstone hall, door on the south (+y) side. */
  | { kind: 'palace'; x: number; y: number; w: number; h: number };

export interface Npc {
  /** 'warper' = บูรพา: paid warps between towns and the account-wide storage. */
  id: 'shop' | 'weapons' | 'healer' | 'guide' | 'jobs' | 'warper';
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

export type Theme = 'town' | 'meadow' | 'forest' | 'marsh' | 'canyon' | 'snow' | 'volcano' | 'desert';

/** Per-theme colours: one per ground type (G), then the sky and the land outside the map. */
export const THEMES: Record<Theme, { ground: string[]; sky: string; outside: string }> = {
  town: { ground: ['#6aa84f', '#74b356', '#b8925f', '#aaa499', '#cfc6b6', '#3f86c9', '#6aa84f'], sky: '#b9e2ff', outside: '#3d5a34' },
  meadow: { ground: ['#6aa84f', '#74b356', '#b8925f', '#aaa499', '#cfc6b6', '#3f86c9', '#6aa84f'], sky: '#83c7ff', outside: '#3b6331' },
  forest: { ground: ['#4f8f3c', '#5a9a43', '#8f6a43', '#8a8a7a', '#b0a890', '#2f6f8f', '#4f8f3c'], sky: '#9fd4c8', outside: '#24401f' },
  marsh: { ground: ['#6f8a4a', '#7a9450', '#7a6640', '#7d8170', '#a59f88', '#4f7a5a', '#6f8a4a'], sky: '#b8c9b0', outside: '#3d4a2c' },
  canyon: { ground: ['#c9a067', '#d1aa72', '#b07a48', '#a8825a', '#d8bf94', '#4a8fb0', '#c9a067'], sky: '#ffd9a8', outside: '#8a5a32' },
  snow: { ground: ['#eef3f8', '#e3ebf3', '#b9c6d3', '#a9b4c0', '#dfe6ee', '#9fd3f0', '#eef3f8'], sky: '#d4e6f5', outside: '#c9d6e3' },
  volcano: { ground: ['#4a3a35', '#56433c', '#3a2c28', '#5e5550', '#6e625b', '#ff6a1a', '#4a3a35'], sky: '#7a4a3e', outside: '#231816' },
  desert: { ground: ['#e3c58b', '#dbbb7c', '#cfae7a', '#c9ad84', '#e6d2a8', '#3aa6c4', '#e3c58b'], sky: '#ffe6b8', outside: '#d9b677' },
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

/** The town is walled, with a gate in the middle of every side; the wild maps hang off those gates. */
export const TOWN_SIZE = 96;
const TC = TOWN_SIZE / 2; // centre line: avenues, gates and the fountain all sit on it

/** What a town tile is for. */
const enum Z { Block, Street, Wall, Castle }

function buildTown(): GameMap {
  const N = TOWN_SIZE;
  const C = TC;
  const m = blank('town', 'เมืองเมโลเดีย', N, N, G.Cobble, true);
  const rnd = mulberry32(7);
  const put = (o: Obj, w = 1, h = 1) => {
    m.objects.push(o);
    block(m, Math.floor(o.x), Math.floor(o.y), w, h);
  };
  const gate = (i: number) => i >= C - 2 && i < C + 2; // the 4-tile opening in each wall
  const castle = { x: 30, y: 2, w: 36, h: 13, door: 6 }; // two wings either side of the north avenue

  // ---- zones, after the reference: walls, a castle on the north wall, a round plaza in the middle,
  // a cross of wide avenues, diagonals out to the corners, a lane ringing the inner blocks
  const zone: Z[][] = Array.from({ length: N }, () => Array(N).fill(Z.Block));
  const oct = (a: number, b: number) => Math.max(a, b, (a + b) / Math.SQRT2);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = Math.abs(x + 0.5 - C), b = Math.abs(y + 0.5 - C), o = oct(a, b);
      let z = Z.Block;
      if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) z = (x < 2 || x >= N - 2) && gate(y) || (y < 2 || y >= N - 2) && gate(x) ? Z.Street : Z.Wall;
      else if (y < castle.y + castle.h && x >= castle.x && x < castle.x + castle.w && a >= castle.door / 2) z = Z.Castle;
      else if (x < 5 || y < 5 || x >= N - 5 || y >= N - 5) z = Z.Street; // ring road inside the walls
      else if (y < 23 && x >= castle.x && x < castle.x + castle.w) z = Z.Street; // castle forecourt
      else if (a < 3 || b < 3) z = Z.Street; // avenues
      else if (o <= 10.5) z = Z.Street; // the plaza
      else if (o >= 23 && o < 26) z = Z.Street; // lane round the inner blocks
      else if (Math.abs(a - b) < 2.9) z = Z.Street; // diagonals to the corners
      zone[y][x] = z;
      if (z === Z.Street) m.ground[y][x] = G.Plaza;
    }
  }

  // distance (in steps) from each block tile to the nearest non-block tile: deep inside a block is a garden
  const dist: number[][] = zone.map((row) => row.map((z) => (z === Z.Block ? Infinity : 0)));
  const q: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!dist[y][x]) q.push([x, y]);
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (dist[ny]?.[nx] === Infinity) {
        dist[ny][nx] = dist[y][x] + 1;
        q.push([nx, ny]);
      }
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) if (dist[y][x] >= 7) m.ground[y][x] = rnd() < 0.3 ? G.Grass2 : G.Grass;
  }

  // ---- walls, towers and the castle
  for (const [x, y, w, h] of [
    [0, 0, C - 2, 2], [C + 2, 0, C - 2, 2], [0, N - 2, C - 2, 2], [C + 2, N - 2, C - 2, 2],
    [0, 2, 2, C - 4], [0, C + 2, 2, C - 4], [N - 2, 2, 2, C - 4], [N - 2, C + 2, 2, C - 4],
  ]) put({ kind: 'wall', x, y, w, h }, w, h);
  const tower = (x: number, y: number, s: number) => put({ kind: 'tower', x, y, s }, s, s);
  for (const [x, y] of [[0, 0], [N - 4, 0], [0, N - 4], [N - 4, N - 4]]) tower(x, y, 4);
  for (const t of [21, N - 24]) {
    if (t + 3 <= castle.x || t >= castle.x + castle.w) tower(t, 0, 3);
    tower(t, N - 3, 3);
    tower(0, t, 3);
    tower(N - 3, t, 3);
  }
  // gatehouses either side of the east, south and west gates (the castle itself guards the north one)
  for (const s of [-1, 1]) {
    const g = s < 0 ? C - 5 : C + 2;
    tower(g, N - 3, 3);
    tower(0, g, 3);
    tower(N - 3, g, 3);
  }
  m.objects.push({ kind: 'castle', ...castle });
  block(m, castle.x, castle.y, castle.w / 2 - castle.door / 2, castle.h);
  block(m, C + castle.door / 2, castle.y, castle.w / 2 - castle.door / 2, castle.h);

  // ---- fountain, NPCs and the market on the plaza
  m.objects.push({ kind: 'fountain', x: C - 1.5, y: C - 1.5 });
  block(m, C - 2, C - 2, 4, 4);
  m.npcs = [
    { id: 'shop', name: 'ร้านของใช้ ป้ามะลิ', x: C - 6, y: C - 6, look: { gender: 'f', hair: 3, hair_color: 0, face: 1, body: '#e7a33e' } },
    { id: 'weapons', name: 'ร้านเครื่องดนตรี ลุงบุญ', x: C + 5, y: C - 6, look: { gender: 'm', hair: 1, hair_color: 7, face: 2, body: '#795548' } },
    { id: 'healer', name: 'ครูเพลงใจดี', x: C - 1, y: C - 4, look: { gender: 'f', hair: 4, hair_color: 7, face: 0, body: '#ffffff' } },
    { id: 'guide', name: 'ไกด์ประจำเมือง', x: C + 3, y: C + 6, look: { gender: 'm', hair: 0, hair_color: 3, face: 3, body: '#3949ab' } },
    { ...BURAPA, x: C + 1, y: C + 3 },
  ];
  for (const n of m.npcs) block(m, n.x, n.y);
  let color = 0;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (const [a, b] of [[8, 4], [4, 8]]) {
      const x = C + sx * a - 1, y = C + sy * b - 1;
      if (!free(m, x - 1, y - 1, 4, 4)) continue;
      put({ kind: 'stall', x, y, color: color++ % 4 }, 2, 2);
      const gx = x + (sx < 0 ? -1 : 2), gy = y + (b > a ? 0 : sy < 0 ? -1 : 2);
      if (free(m, gx, gy)) put({ kind: 'goods', x: gx, y: gy });
    }
  }
  for (const [x, y] of [[C - 4, C - 4], [C + 3, C - 4], [C - 4, C + 3], [C + 3, C + 3]]) if (free(m, x, y)) put({ kind: 'bench', x, y });
  for (const [x, y] of [[C - 10, C - 4], [C + 9, C - 4], [C - 10, C + 3], [C + 9, C + 3], [C - 4, C - 10], [C + 3, C - 10], [C - 4, C + 9], [C + 3, C + 9]]) {
    if (free(m, x, y)) put({ kind: 'planter', x, y });
  }

  // ---- street furniture: lamps and banners down the avenues, a tree-lined approach to the castle
  for (let t = 6; t < N - 6; t += 7) {
    for (const side of [C - 4, C + 3]) {
      for (const [x, y] of [[side, t], [t, side]]) {
        if (oct(Math.abs(x + 0.5 - C), Math.abs(y + 0.5 - C)) < 12 || y < 23 && x >= castle.x && x < castle.x + castle.w) continue;
        if (free(m, x, y) && zone[y][x] === Z.Block) put({ kind: 'lamp', x, y });
      }
    }
  }
  for (let y = 24; y < C - 12; y += 3) for (const x of [C - 4, C + 3]) if (free(m, x, y) && zone[y][x] === Z.Block) put({ kind: 'planter', x, y });
  for (const [x, y, w, h] of [[castle.x + 2, 17, 8, 1], [castle.x + 2, 20, 8, 1], [C + 7, 17, 8, 1], [C + 7, 20, 8, 1]]) put({ kind: 'hedge', x, y, w, h }, w, h);
  for (const [x, y, c] of [[C - 4, 16, 0], [C + 3, 16, 1], [C - 3, 6, 1], [C + 2, 6, 0], [C - 3, N - 6, 0], [C + 2, N - 6, 1], [5, C - 3, 0], [5, C + 2, 1], [N - 6, C - 3, 1], [N - 6, C + 2, 0]]) {
    if (free(m, x, y)) put({ kind: 'banner', x, y, color: c });
  }
  for (const [x, y] of [[C + 4, C + 13], [N - 7, C + 4], [C - 5, C + 13]]) if (free(m, x, y)) put({ kind: 'sign', x, y });

  // ---- houses: fronts on the street, a one-tile alley between neighbours, gardens behind
  const house = new Set<number>();
  const fits = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (zone[j]?.[i] !== Z.Block || !free(m, i, j)) return false;
    for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) if (house.has(j * N + i)) return false;
    return true;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (dist[y][x] !== 1 || house.has(y * N + x)) continue;
      // face: 0 = street to the south (+y), 1 = east, 2 = north, 3 = west
      const face = [[0, 1], [1, 0], [0, -1], [-1, 0]].findIndex(([dx, dy]) => zone[y + dy]?.[x + dx] === Z.Street);
      if (face < 0) continue;
      const far = Math.max(Math.abs(x - C), Math.abs(y - C)) > 26; // outer blocks get the bigger houses
      for (let k = 0; k < 4; k++) {
        const len = 4 + Math.floor(rnd() * (far ? 4 : 3)) - k; // along the street
        const dep = 4 + Math.floor(rnd() * 3) - (k >> 1); // back from it
        if (len < 3 || dep < 3) break;
        const [bx, by, bw, bh] = face === 0 ? [x, y - dep + 1, len, dep] : face === 2 ? [x, y, len, dep] : face === 1 ? [x - dep + 1, y, dep, len] : [x, y, dep, len];
        if (!fits(bx, by, bw, bh)) continue;
        put({ kind: 'building', x: bx, y: by, w: bw, h: bh, wall: Math.floor(rnd() * 3), roof: Math.floor(rnd() * 3), floors: 1 + Math.floor(rnd() * 2), face }, bw, bh);
        for (let j = by; j < by + bh; j++) for (let i = bx; i < bx + bw; i++) house.add(j * N + i);
        break;
      }
    }
  }
  // gardens: trees and the odd bench or crate stack in the middle of each block
  for (let y = 2; y < N - 2; y++) {
    for (let x = 2; x < N - 2; x++) {
      if (zone[y][x] !== Z.Block || !free(m, x - 1, y - 1, 3, 3)) continue;
      const r = rnd();
      if (dist[y][x] >= 7 && r < 0.16) put({ kind: 'tree', x, y, big: rnd() < 0.5 });
      else if (dist[y][x] >= 3 && r < 0.012) put({ kind: 'crate', x, y });
      else if (dist[y][x] >= 7 && r < 0.2) put({ kind: 'bench', x, y });
    }
  }

  m.portals = [
    { x: N - 2, y: C - 1, to: 'field', toX: 3.5, toY: 30.5, label: 'ทุ่งเมโลดี้ (Lv 1+)' },
    { x: 1, y: C - 1, to: 'forest', toX: WILD - 3.5, toY: WILD / 2 + 0.5, label: 'ป่าเพลงกระซิบ (Lv 10+)' },
    { x: C - 1, y: N - 2, to: 'canyon', toX: WILD / 2 + 0.5, toY: 3.5, label: 'หุบผาร็อค (Lv 17+)' },
    { x: C - 1, y: 1, to: 'snow', toX: WILD / 2 + 0.5, toY: WILD - 3.5, label: 'ยอดเขาหิมะโซปราโน (Lv 21+)' },
  ];
  m.spawn = { x: C + 0.5, y: C + 7.5 };
  return m;
}

/** บูรพา stands in the middle of every town: paid warps to the other towns, and the account-wide storage. */
const BURAPA: Omit<Npc, 'x' | 'y'> = { id: 'warper', name: 'บูรพา', look: { gender: 'm', hair: 5, hair_color: 1, face: 2, body: '#1e5aa8' } };

/** Where you arrive in town coming back through each gate. */
const TOWN_GATE = {
  e: { to: 'town', toX: TOWN_SIZE - 3.5, toY: TC - 0.5 },
  w: { to: 'town', toX: 3.5, toY: TC - 0.5 },
  s: { to: 'town', toX: TC - 0.5, toY: TOWN_SIZE - 3.5 },
  n: { to: 'town', toX: TC - 0.5, toY: 3.5 },
};

// ---------------------------------------------------------------- desert town

/**
 * เมืองทะเลทรายตะโพน, the drummers' town: walled, a palace on an island in a square moat in the
 * middle (one causeway, from the south), a promenade round the moat, sand streets and flat-roofed
 * houses. The only gate is in the north wall, out to the canyon.
 */
export const DESERT_SIZE = 80;
const DC = DESERT_SIZE / 2;

function buildDesert(): GameMap {
  const N = DESERT_SIZE;
  const C = DC;
  const m = blank('desert', 'เมืองทะเลทรายตะโพน', N, N, G.Grass, true, 'desert');
  const rnd = mulberry32(83);
  const put = (o: Obj, w = 1, h = 1) => {
    m.objects.push(o);
    block(m, Math.floor(o.x), Math.floor(o.y), w, h);
  };
  const ISLAND = 9, MOAT = 15, PROM = 18; // half-widths from the centre
  const zone: Z[][] = Array.from({ length: N }, () => Array(N).fill(Z.Block));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = Math.abs(x + 0.5 - C), b = Math.abs(y + 0.5 - C), o = Math.max(a, b);
      const round = Math.pow(a ** 4 + b ** 4, 0.25); // a rounded square, for the lane between the blocks
      let z = Z.Block;
      let g: G = rnd() < 0.3 ? G.Grass2 : G.Grass;
      if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) z = y < 2 && a < 2 ? Z.Street : Z.Wall;
      else if (o < ISLAND) { z = Z.Street; g = G.Plaza; }
      else if (o < MOAT) {
        if (y > C && a < 2) { z = Z.Street; g = G.Plaza; } // the causeway
        else { z = Z.Wall; g = G.Water; }
      } else if (o < PROM) { z = Z.Street; g = G.Plaza; }
      else if (x < 5 || y < 5 || x >= N - 5 || y >= N - 5) { z = Z.Street; g = G.Dirt; }
      else if (a < 2.5 || b < 2.5) { z = Z.Street; g = G.Dirt; }
      else if (round >= 26 && round < 28.6) { z = Z.Street; g = G.Dirt; }
      zone[y][x] = z;
      m.ground[y][x] = g;
      if (g === G.Water) m.blocked[y][x] = true;
    }
  }

  // ---- walls and towers (sandstone, see castle.ts)
  for (const [x, y, w, h] of [[0, 0, C - 2, 2], [C + 2, 0, C - 2, 2], [0, N - 2, N, 2], [0, 2, 2, N - 4], [N - 2, 2, 2, N - 4]]) {
    put({ kind: 'wall', x, y, w, h }, w, h);
  }
  const tower = (x: number, y: number, s: number) => put({ kind: 'tower', x, y, s }, s, s);
  for (const [x, y] of [[0, 0], [N - 4, 0], [0, N - 4], [N - 4, N - 4]]) tower(x, y, 4);
  tower(C - 5, 0, 3);
  tower(C + 2, 0, 3);
  for (const t of [18, C - 1, N - 21]) {
    tower(0, t, 3);
    tower(N - 3, t, 3);
    tower(t, N - 3, 3);
  }

  // ---- the palace island: palace at the back, a fountain court in front with the NPCs
  put({ kind: 'palace', x: C - 7, y: C - 8, w: 14, h: 7 }, 14, 7);
  m.objects.push({ kind: 'fountain', x: C - 1.5, y: C + 1.5 });
  block(m, C - 2, C + 1, 4, 4);
  m.npcs = [
    { id: 'jobs', name: 'ครูกลองแห่งทะเลทราย', x: C - 5, y: C + 2, look: { gender: 'm', hair: 1, hair_color: 3, face: 3, body: '#a0522d' } },
    { ...BURAPA, x: C + 4, y: C + 2 },
    { id: 'healer', name: 'หมอผีทรายใจดี', x: C - 5, y: C - 1, look: { gender: 'f', hair: 2, hair_color: 0, face: 0, body: '#f3e5c0' } },
    { id: 'shop', name: 'ร้านของใช้ พ่อค้าอูฐ', x: C + 9, y: C + 16, look: { gender: 'm', hair: 0, hair_color: 1, face: 1, body: '#c58b3a' } },
  ];
  for (const n of m.npcs) block(m, n.x, n.y);
  for (const [x, y] of [[C - 8, C - 1], [C + 7, C - 1], [C - 8, C + 7], [C + 7, C + 7]]) put({ kind: 'tree', x, y, big: true });
  for (const [x, y] of [[C - 3, C + 6], [C + 2, C + 6]]) put({ kind: 'lamp', x, y });

  // ---- promenade round the moat: palms along the water, a market on the south side
  for (let i = -PROM + 1; i < PROM - 1; i += 4) {
    for (const [x, y] of [[C + i, C - PROM], [C + i, C + PROM - 1], [C - PROM, C + i], [C + PROM - 1, C + i]]) {
      if (Math.abs(x + 0.5 - C) < 4 || Math.abs(y + 0.5 - C) < 4) continue; // keep the avenues open
      if (free(m, x, y)) put({ kind: 'tree', x, y, big: rnd() < 0.5 });
    }
  }
  let color = 0;
  for (const x of [C - 13, C - 9, C + 5]) put({ kind: 'stall', x, y: C + 15, color: color++ % 4 }, 2, 2);
  for (const [x, y] of [[C - 11, C + 17], [C + 7, C + 17]]) if (free(m, x, y)) put({ kind: 'goods', x, y });
  for (const [x, y, c] of [[C - 4, 6, 0], [C + 3, 6, 1], [C - 4, C - PROM - 1, 1], [C + 3, C - PROM - 1, 0]]) if (free(m, x, y)) put({ kind: 'banner', x, y, color: c });

  // ---- flat-roofed houses, fronts on the street, yards behind
  const dist: number[][] = zone.map((row) => row.map((z) => (z === Z.Block ? Infinity : 0)));
  const q: [number, number][] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!dist[y][x]) q.push([x, y]);
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (dist[ny]?.[nx] === Infinity) {
        dist[ny][nx] = dist[y][x] + 1;
        q.push([nx, ny]);
      }
    }
  }
  const house = new Set<number>();
  const fits = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (zone[j]?.[i] !== Z.Block || !free(m, i, j)) return false;
    for (let j = y - 1; j <= y + h; j++) for (let i = x - 1; i <= x + w; i++) if (house.has(j * N + i)) return false;
    return true;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (dist[y][x] !== 1 || house.has(y * N + x) || rnd() < 0.18) continue; // the odd gap: a yard on the street
      const face = [[0, 1], [1, 0], [0, -1], [-1, 0]].findIndex(([dx, dy]) => zone[y + dy]?.[x + dx] === Z.Street);
      if (face < 0) continue;
      for (let k = 0; k < 3; k++) {
        const len = 3 + Math.floor(rnd() * 3) - k;
        const dep = 3 + Math.floor(rnd() * 2) - (k >> 1);
        if (len < 2 || dep < 2) break;
        const [bx, by, bw, bh] = face === 0 ? [x, y - dep + 1, len, dep] : face === 2 ? [x, y, len, dep] : face === 1 ? [x - dep + 1, y, dep, len] : [x, y, dep, len];
        if (!fits(bx, by, bw, bh)) continue;
        put({ kind: 'building', x: bx, y: by, w: bw, h: bh, wall: Math.floor(rnd() * 3), roof: Math.floor(rnd() * 3), floors: 1 + (rnd() < 0.3 ? 1 : 0), face, style: 'desert' }, bw, bh);
        for (let j = by; j < by + bh; j++) for (let i = bx; i < bx + bw; i++) house.add(j * N + i);
        break;
      }
    }
  }
  // yards: palms, and crates or a cart now and then
  for (let y = 3; y < N - 3; y++) {
    for (let x = 3; x < N - 3; x++) {
      if (zone[y][x] !== Z.Block || !free(m, x - 1, y - 1, 3, 3)) continue;
      const r = rnd();
      if (dist[y][x] >= 2 && r < 0.12) put({ kind: 'tree', x, y, big: rnd() < 0.5 });
      else if (dist[y][x] >= 2 && r < 0.14) put({ kind: 'crate', x, y });
      else if (dist[y][x] >= 2 && r < 0.15) put({ kind: 'goods', x, y });
    }
  }

  m.portals = [{ x: C - 1, y: 1, to: 'canyon', toX: WILD / 2 + 0.5, toY: WILD - 3.5, label: 'หุบผาร็อค (Lv 17+)' }];
  m.spawn = { x: C + 0.5, y: C + 6.5 };
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
    addTree(m.w - 1, j, true);
  }
  block(m, 0, 0, m.w, 1);
  block(m, 0, m.h - 1, m.w, 1);
  for (let j = 0; j < m.h; j++) if (j < 28 || j > 33) block(m, 0, j);
  block(m, m.w - 1, 0, 1, m.h);
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 2; x < m.w - 2; x++) {
      if (x < 7 && y > 25 && y < 36) continue; // keep the arrival area clear
      const r = rnd();
      if (r < 0.04) addTree(x, y);
      else if (r < 0.05 && free(m, x, y)) {
        m.objects.push({ kind: 'rock', x, y });
        block(m, x, y);
      }
    }
  }
  m.portals = [{ x: 1, y: 30, ...TOWN_GATE.e, label: 'เมืองเมโลเดีย' }];
  m.spawn = { x: 3.5, y: 30.5 };
  return m;
}

// ---------------------------------------------------------------- wild maps

/** Every wild map is WILD x WILD with its gates in the middle of a side. */
const WILD = 56;

type Side = 'n' | 'e' | 's' | 'w';

interface Gate {
  side: Side;
  to: string;
  toX: number;
  toY: number;
  label: string;
}

interface WildSpec {
  id: string;
  name: string;
  theme: Theme;
  seed: number;
  /** Ground mix: [type, share] picked per tile. */
  ground: [G, number][];
  trees: number; // chance per tile
  rocks: number;
  /** Ponds / ice / lava: [cx, cy, rx, ry]. */
  pools: [number, number, number, number][];
  /** The first gate leads back towards town; you arrive there. */
  gates: Gate[];
}

/** Arriving in a wild map through its gate on `side`. */
const arrive = (to: string, side: Side) => {
  const mid = WILD / 2 + 0.5;
  const at = { n: [mid, 3.5], s: [mid, WILD - 3.5], w: [3.5, mid], e: [WILD - 3.5, mid] }[side];
  return { to, toX: at[0], toY: at[1] };
};

/** The maps beyond the town, all built the same way: winding paths from each gate into the middle. */
function buildWild(sp: WildSpec): GameMap {
  const n = WILD;
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
  // a winding two-wide path from each gate to the middle; `u` runs from the gate inwards, `v` across
  const sides = new Set(sp.gates.map((g) => g.side));
  for (const side of sides) {
    const tile = (u: number, v: number) => (side === 'w' ? [u, v] : side === 'e' ? [n - 1 - u, v] : side === 'n' ? [v, u] : [v, n - 1 - u]);
    let v = mid;
    for (let u = 0; u <= mid; u++) {
      if (u > 3 && u < mid - 6) v = Math.max(mid - 10, Math.min(mid + 10, v + Math.round((rnd() - 0.5) * 1.6)));
      else if (u >= mid - 6) v += Math.sign(mid - v);
      for (const [dx, dy] of [[0, 0], side === 'w' || side === 'e' ? [0, 1] : [1, 0]]) {
        const [x, y] = tile(u, v);
        m.ground[y + dy][x + dx] = G.Dirt;
      }
    }
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
  const opening = (side: Side, i: number) => sides.has(side) && i >= mid - 3 && i <= mid + 3;
  const addTree = (x: number, y: number, big = rnd() < 0.3) => {
    if (!free(m, x, y) || m.ground[y][x] === G.Dirt) return;
    m.objects.push({ kind: 'tree', x, y, big });
    block(m, x, y);
  };
  for (let i = 0; i < n; i++) {
    if (!opening('n', i)) addTree(i, 0, true);
    if (!opening('s', i)) addTree(i, n - 1, true);
    if (!opening('w', i)) addTree(0, i, true);
    if (!opening('e', i)) addTree(n - 1, i, true);
  }
  for (let i = 0; i < n; i++) {
    if (!opening('n', i)) block(m, i, 0);
    if (!opening('s', i)) block(m, i, n - 1);
    if (!opening('w', i)) block(m, 0, i);
    if (!opening('e', i)) block(m, n - 1, i);
  }
  const nearGate = (x: number, y: number) =>
    (sides.has('w') && x < 7 || sides.has('e') && x > n - 8) && Math.abs(y - mid) < 6
    || (sides.has('n') && y < 7 || sides.has('s') && y > n - 8) && Math.abs(x - mid) < 6;
  for (let y = 2; y < n - 2; y++) {
    for (let x = 2; x < n - 2; x++) {
      if (nearGate(x, y)) continue; // keep the gates clear
      const r = rnd();
      if (r < sp.trees) addTree(x, y);
      else if (r < sp.trees + sp.rocks && free(m, x, y) && m.ground[y][x] !== G.Dirt) {
        m.objects.push({ kind: 'rock', x, y });
        block(m, x, y);
      }
    }
  }
  const at = { n: [mid, 1], s: [mid, n - 2], w: [1, mid], e: [n - 2, mid] };
  m.portals = sp.gates.map(({ side, ...g }) => ({ x: at[side][0], y: at[side][1], ...g }));
  const first = arrive(sp.id, sp.gates[0].side);
  m.spawn = { x: first.toX, y: first.toY };
  return m;
}

// The town is the hub: east to the meadow, west to the forest and on to the marsh,
// south to the canyon, north (through the castle) up the snow peak and on to the volcano.
const buildForest = () => buildWild({
  id: 'forest', name: 'ป่าเพลงกระซิบ', theme: 'forest', seed: 11,
  ground: [[G.Grass2, 0.55], [G.Grass, 0.42], [G.Flower, 0.03]], trees: 0.11, rocks: 0.015, pools: [[40, 12, 3, 2], [14, 44, 2.5, 2]],
  gates: [
    { side: 'e', ...TOWN_GATE.w, label: 'เมืองเมโลเดีย' },
    { side: 'w', ...arrive('marsh', 'e'), label: 'บึงจังหวะ (Lv 14+)' },
  ],
});
const buildMarsh = () => buildWild({
  id: 'marsh', name: 'บึงจังหวะ', theme: 'marsh', seed: 23,
  ground: [[G.Grass, 0.6], [G.Grass2, 0.4]], trees: 0.035, rocks: 0.01,
  pools: [[14, 12, 5, 3], [36, 10, 4, 3], [44, 42, 6, 4], [18, 42, 4, 5], [30, 26, 3, 2]],
  gates: [{ side: 'e', ...arrive('forest', 'w'), label: 'ป่าเพลงกระซิบ' }],
});
const buildCanyon = () => buildWild({
  id: 'canyon', name: 'หุบผาร็อค', theme: 'canyon', seed: 37,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.012, rocks: 0.07, pools: [[42, 40, 3, 2]],
  gates: [
    { side: 'n', ...TOWN_GATE.s, label: 'เมืองเมโลเดีย' },
    { side: 's', to: 'desert', toX: DC - 0.5, toY: 3.5, label: 'เมืองทะเลทรายตะโพน' },
  ],
});
const buildSnow = () => buildWild({
  id: 'snow', name: 'ยอดเขาหิมะโซปราโน', theme: 'snow', seed: 41,
  ground: [[G.Grass, 0.65], [G.Grass2, 0.35]], trees: 0.06, rocks: 0.025, pools: [[16, 14, 4, 3], [40, 44, 5, 3]],
  gates: [
    { side: 's', ...TOWN_GATE.n, label: 'เมืองเมโลเดีย' },
    { side: 'n', ...arrive('volcano', 's'), label: 'ภูเขาไฟเมทัล (Lv 26+)' },
  ],
});
const buildVolcano = () => buildWild({
  id: 'volcano', name: 'ภูเขาไฟเมทัล', theme: 'volcano', seed: 53,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.02, rocks: 0.06,
  pools: [[16, 12, 4, 3], [40, 14, 3, 4], [12, 44, 5, 3], [46, 40, 3, 3]],
  gates: [{ side: 's', ...arrive('snow', 'n'), label: 'ยอดเขาหิมะโซปราโน' }],
});

/**
 * The job-change teacher stands a few steps from where new players appear in town, on the first free
 * tile with room to walk up to it (so it fits whatever the town layout is).
 */
function addJobNpc(m: GameMap) {
  const sx = Math.floor(m.spawn.x) - 3;
  const sy = Math.floor(m.spawn.y) - 1;
  for (let r = 0; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = sx + dx;
        const y = sy + dy;
        if (!free(m, x - 1, y - 1, 3, 3) || m.npcs.some((n) => Math.abs(n.x - x) < 2 && Math.abs(n.y - y) < 2)) continue;
        m.npcs.push({ id: 'jobs', name: 'ครูแนะแนวอาชีพ', x, y, look: { gender: 'm', hair: 2, hair_color: 1, face: 0, body: '#6d4c41' } });
        block(m, x, y);
        return;
      }
    }
  }
}

const built = new Map<string, GameMap>();
const BUILDERS: Record<string, () => GameMap> = {
  town: buildTown, field: buildField, forest: buildForest, marsh: buildMarsh, canyon: buildCanyon, snow: buildSnow, volcano: buildVolcano,
  desert: buildDesert,
};
export const MAP_IDS = Object.keys(BUILDERS);
export const START_MAP = 'town';

/**
 * Towns บูรพา warps to, and the fare in Zeny (paid on the server, see pay_warp() in SQL).
 * You arrive at the town's spawn, next to บูรพา.
 */
export const WARP_TOWNS: { map: string; cost: number }[] = [
  { map: 'town', cost: 300 },
  { map: 'desert', cost: 300 },
];

/** A fresh copy each call for callers that mutate `blocked`; cached otherwise. */
export function getMap(id: string): GameMap {
  if (!BUILDERS[id]) id = START_MAP;
  if (!built.has(id)) {
    const m = BUILDERS[id]();
    if (id === START_MAP) addJobNpc(m);
    built.set(id, m);
  }
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
