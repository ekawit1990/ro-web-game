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
  | { kind: 'building'; x: number; y: number; w: number; h: number; wall: number; roof: number; floors: number; face?: number; style?: 'desert' | 'magic' }
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
  | { kind: 'palace'; x: number; y: number; w: number; h: number }
  /** A big lava volcano: a cone on the circle of radius r round (x, y), lava running down it (see lava.ts). */
  | { kind: 'volcano'; x: number; y: number; r: number }
  /** A cluster of glowing crystals (cave). */
  | { kind: 'crystal'; x: number; y: number; hue: number }
  /** Gravestone (deadwood, ruins). */
  | { kind: 'grave'; x: number; y: number }
  /** Ruined castle-town pieces (ruins.ts): a broken wall run, a column, a crumbling tower, the roofless cathedral. */
  | { kind: 'ruinwall'; x: number; y: number; w: number; h: number }
  | { kind: 'pillar'; x: number; y: number; broken: boolean }
  | { kind: 'ruintower'; x: number; y: number; s: number }
  | { kind: 'cathedral'; x: number; y: number; w: number; h: number }
  /** เมืองคีย์มนตรา (magic.ts): the octagonal city wall round (x, y) at radius r, a gate `gate` wide on each side; the piano spire. */
  | { kind: 'octwall'; x: number; y: number; r: number; gate: number }
  | { kind: 'spire'; x: number; y: number; r: number }
  /** อเวจี: a jagged bone-and-obsidian spike; the reaper's blood circle with skulls round it. */
  | { kind: 'spike'; x: number; y: number; s: number }
  | { kind: 'bloodcircle'; x: number; y: number; r: number };

export interface Npc {
  /** 'warper' = บูรพา: paid warps between towns and the account-wide storage. */
  /** 'refiner' = refining (+1…+10) and inserting monster cards. */
  /** 'reset' = status / skill reset for zeny; 'uncard' = takes monster cards back out of equipment for zeny. */
  /** 'guild' = makes guilds; 'pvp' = takes you to the arena; 'gvg' = the guild war castle: who holds it, the war times, the way in. */
  id: 'shop' | 'weapons' | 'healer' | 'guide' | 'jobs' | 'warper' | 'refiner' | 'reset' | 'uncard' | 'guild' | 'pvp' | 'gvg';
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

export type Theme = 'town' | 'meadow' | 'forest' | 'marsh' | 'canyon' | 'snow' | 'volcano' | 'desert'
  | 'beach' | 'cave' | 'deadwood' | 'ruins' | 'inferno' | 'magic' | 'abyss';
/** Maps where G.Water is lava. */
export const isLava = (t: Theme) => t === 'volcano' || t === 'inferno';

/** Per-theme colours: one per ground type (G), then the sky and the land outside the map. */
export const THEMES: Record<Theme, { ground: string[]; sky: string; outside: string }> = {
  town: { ground: ['#6aa84f', '#74b356', '#b8925f', '#aaa499', '#cfc6b6', '#3f86c9', '#6aa84f'], sky: '#b9e2ff', outside: '#3d5a34' },
  meadow: { ground: ['#6aa84f', '#74b356', '#b8925f', '#aaa499', '#cfc6b6', '#3f86c9', '#6aa84f'], sky: '#83c7ff', outside: '#3b6331' },
  forest: { ground: ['#4f8f3c', '#5a9a43', '#8f6a43', '#8a8a7a', '#b0a890', '#2f6f8f', '#4f8f3c'], sky: '#9fd4c8', outside: '#24401f' },
  marsh: { ground: ['#6f8a4a', '#7a9450', '#7a6640', '#7d8170', '#a59f88', '#4f7a5a', '#6f8a4a'], sky: '#b8c9b0', outside: '#3d4a2c' },
  canyon: { ground: ['#c9a067', '#d1aa72', '#b07a48', '#a8825a', '#d8bf94', '#4a8fb0', '#c9a067'], sky: '#ffd9a8', outside: '#8a5a32' },
  snow: { ground: ['#eef3f8', '#e3ebf3', '#b9c6d3', '#a9b4c0', '#dfe6ee', '#9fd3f0', '#eef3f8'], sky: '#d4e6f5', outside: '#c9d6e3' },
  volcano: { ground: ['#5a4a44', '#64534b', '#463833', '#6a5d56', '#786a62', '#ff6a1a', '#3b302d'], sky: '#6a3a30', outside: '#1c1312' },
  inferno: { ground: ['#4a3a36', '#54423c', '#3a2c29', '#5c4c46', '#6a5850', '#ff5a10', '#2e2422'], sky: '#4a1c16', outside: '#140c0b' },
  beach: { ground: ['#f0dcaa', '#e8d29a', '#d9be86', '#cdb894', '#f3e6c4', '#2fb7d6', '#f0dcaa'], sky: '#9fe0ff', outside: '#1e8fb8' },
  cave: { ground: ['#5e5a72', '#68627e', '#4a4658', '#77708e', '#857e9c', '#3fd0e0', '#3d3a4a'], sky: '#120f1c', outside: '#0c0a14' },
  deadwood: { ground: ['#6e6a58', '#78705a', '#5a5040', '#5a5650', '#6a645a', '#4a5a48', '#4e4a3e'], sky: '#5a5468', outside: '#24221e' },
  ruins: { ground: ['#5a6050', '#636a56', '#4a4438', '#6e6c66', '#7d7a72', '#3e4a58', '#5a6050'], sky: '#6e6a80', outside: '#2a2a2e' },
  magic: { ground: ['#6a9a58', '#74a25e', '#a89880', '#a7a3ae', '#c9c3d2', '#4a7ad0', '#6a9a58'], sky: '#c9c0f0', outside: '#3a5634' },
  abyss: { ground: ['#2a1a2e', '#321e36', '#1e1220', '#3a2638', '#4a2a3e', '#7a0a24', '#160c18'], sky: '#2a0a1e', outside: '#0a0408' },
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
    { id: 'refiner', name: 'ช่างจูน ตีบวก', x: C - 4, y: C + 6, look: { gender: 'm', hair: 4, hair_color: 1, face: 1, body: '#5d4037' } },
    { id: 'uncard', name: 'ช่างถอดการ์ด', x: C - 7, y: C + 6, look: { gender: 'f', hair: 5, hair_color: 4, face: 2, body: '#00897b' } },
    { id: 'reset', name: 'ครูเริ่มใหม่ (รีเซ็ตค่า)', x: C + 8, y: C + 6, look: { gender: 'f', hair: 6, hair_color: 6, face: 1, body: '#8e24aa' } },
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
    { x: N - 2, y: C - 1, to: 'field', toX: 3.5, toY: FIELD / 2 + 0.5, label: 'ทุ่งเมโลดี้ (Lv 1+)' },
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
      if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) z = (y < 2 || y >= N - 2) && a < 2 ? Z.Street : Z.Wall;
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
  for (const [x, y, w, h] of [[0, 0, C - 2, 2], [C + 2, 0, C - 2, 2], [0, N - 2, C - 2, 2], [C + 2, N - 2, C - 2, 2], [0, 2, 2, N - 4], [N - 2, 2, 2, N - 4]]) {
    put({ kind: 'wall', x, y, w, h }, w, h);
  }
  const tower = (x: number, y: number, s: number) => put({ kind: 'tower', x, y, s }, s, s);
  for (const [x, y] of [[0, 0], [N - 4, 0], [0, N - 4], [N - 4, N - 4]]) tower(x, y, 4);
  tower(C - 5, 0, 3);
  tower(C + 2, 0, 3);
  tower(C - 5, N - 3, 3); // gatehouse of the south gate (out to the dead forest)
  tower(C + 2, N - 3, 3);
  for (const t of [18, C - 1, N - 21]) {
    tower(0, t, 3);
    tower(N - 3, t, 3);
    if (t !== C - 1) tower(t, N - 3, 3);
  }

  // ---- the palace island: palace at the back, a fountain court in front with the NPCs
  put({ kind: 'palace', x: C - 7, y: C - 8, w: 14, h: 7 }, 14, 7);
  m.objects.push({ kind: 'fountain', x: C - 1.5, y: C + 1.5 });
  block(m, C - 2, C + 1, 4, 4);
  m.npcs = [
    { id: 'jobs', name: 'ครูกลองแห่งทะเลทราย', x: C - 5, y: C + 2, look: { gender: 'm', hair: 1, hair_color: 3, face: 3, body: '#a0522d' } },
    { ...BURAPA, x: C + 4, y: C + 2 },
    { id: 'refiner', name: 'ช่างตีเหล็กทะเลทราย', x: C + 4, y: C - 1, look: { gender: 'm', hair: 0, hair_color: 1, face: 2, body: '#8d6e63' } },
    { id: 'reset', name: 'ฤๅษีทรายเริ่มใหม่ (รีเซ็ตค่า)', x: C - 5, y: C + 5, look: { gender: 'm', hair: 3, hair_color: 7, face: 3, body: '#6a1b9a' } },
    { id: 'uncard', name: 'ช่างถอดการ์ดทะเลทราย', x: C + 4, y: C + 5, look: { gender: 'f', hair: 1, hair_color: 0, face: 2, body: '#00796b' } },
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

  m.portals = [
    { x: C - 1, y: 1, to: 'canyon', toX: WILD / 2 + 0.5, toY: WILD - 3.5, label: 'หุบผาร็อค (Lv 17+)' },
    { x: C - 1, y: N - 2, ...arrive('deadwood', 'n'), label: 'ป่าไม้ตายเพลงหลอน (Lv 50+)' },
  ];
  m.spawn = { x: C + 0.5, y: C + 6.5 };
  return m;
}


// ---------------------------------------------------------------- เมืองคีย์มนตรา (the keyboardists' town)

/**
 * เมืองคีย์มนตรา, the city of magic where keyboardists change job: an octagonal wall with a gate on each
 * flat side, two ring roads and a plaza round the piano spire in the middle, radial avenues out to the gates
 * and lilac stone houses with violet roofs in between. The south gate leads down to the marsh.
 */
export const MAGIC_SIZE = 96;

function buildMagic(): GameMap {
  const N = MAGIC_SIZE;
  const C = N / 2;
  const m = blank('magic', 'เมืองคีย์มนตรา', N, N, G.Grass, true, 'magic');
  const rnd = mulberry32(131);
  const put = (o: Obj, w = 1, h = 1) => {
    m.objects.push(o);
    block(m, Math.floor(o.x), Math.floor(o.y), w, h);
  };
  const WALL = 44, OUTER = [35, 38.5], INNER = [21, 24], PLAZA = 11;
  const oct = (a: number, b: number) => Math.max(a, b, (a + b) / Math.SQRT2);
  const zone: Z[][] = Array.from({ length: N }, () => Array(N).fill(Z.Block));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = x + 0.5 - C, dy = y + 0.5 - C, a = Math.abs(dx), b = Math.abs(dy), o = oct(a, b);
      let z = Z.Block;
      let g: G = rnd() < 0.3 ? G.Grass2 : G.Grass;
      const gate = (a < 2.5 && b >= WALL - 1) || (b < 2.5 && a >= WALL - 1);
      if (o >= WALL + 1.5) { z = gate ? Z.Street : Z.Wall; if (gate) g = G.Cobble; }
      else if (o >= WALL - 1) { z = gate ? Z.Street : Z.Wall; if (gate) g = G.Cobble; }
      else if (o < PLAZA) { z = Z.Street; g = G.Plaza; }
      else if ((o >= OUTER[0] && o < OUTER[1]) || (o >= INNER[0] && o < INNER[1])) { z = Z.Street; g = G.Cobble; }
      else if (o >= WALL - 4) { z = Z.Street; g = G.Dirt; } // the lane inside the wall
      else if (a < 2.5 || b < 2.5) { z = Z.Street; g = G.Cobble; } // the four avenues
      else if (Math.abs(a - b) < 1.6 && o > PLAZA && o < OUTER[0]) { z = Z.Street; g = G.Cobble; } // diagonal lanes
      zone[y][x] = z;
      m.ground[y][x] = g;
      if (z === Z.Wall) m.blocked[y][x] = true;
    }
  }
  m.objects.push({ kind: 'octwall', x: C, y: C, r: WALL, gate: 5 });
  // the piano spire on the plaza, a ring of lamps and trees round it
  put({ kind: 'spire', x: C - 4, y: C - 4, r: 4 }, 8, 8);
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.floor(C + Math.cos(t) * 7.6), y = Math.floor(C + Math.sin(t) * 7.6);
    if (free(m, x, y)) put({ kind: i % 2 ? 'lamp' : 'tree', x, y, big: true } as Obj);
  }
  m.npcs = [
    { id: 'jobs', name: 'อาจารย์ใหญ่หอคีย์มนตรา', x: C - 1, y: C + 6, look: { gender: 'f', hair: 4, hair_color: 6, face: 1, body: '#5e35b1' } },
    { ...BURAPA, x: C + 3, y: C + 6 },
    { id: 'healer', name: 'แม่มดเพลงใจดี', x: C - 6, y: C + 3, look: { gender: 'f', hair: 2, hair_color: 0, face: 0, body: '#f3e5f5' } },
    { id: 'shop', name: 'ร้านของใช้ ยาวิเศษ', x: C + 7, y: C + 3, look: { gender: 'm', hair: 0, hair_color: 1, face: 1, body: '#7e57c2' } },
    { id: 'refiner', name: 'ช่างจูนมนตรา', x: C + 7, y: C - 4, look: { gender: 'm', hair: 4, hair_color: 1, face: 2, body: '#4527a0' } },
    { id: 'reset', name: 'นักพรตเริ่มใหม่ (รีเซ็ตค่า)', x: C - 7, y: C - 4, look: { gender: 'm', hair: 3, hair_color: 7, face: 3, body: '#311b92' } },
    { id: 'uncard', name: 'ช่างถอดการ์ดมนตรา', x: C - 3, y: C - 8, look: { gender: 'f', hair: 1, hair_color: 0, face: 2, body: '#00897b' } },
  ];
  for (const n of m.npcs) block(m, n.x, n.y);

  // houses along every street, fronts on it, like the desert town
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
      if (dist[y][x] !== 1 || house.has(y * N + x) || rnd() < 0.15) continue;
      const face = [[0, 1], [1, 0], [0, -1], [-1, 0]].findIndex(([dx, dy]) => zone[y + dy]?.[x + dx] === Z.Street);
      if (face < 0) continue;
      for (let k = 0; k < 3; k++) {
        const len = 3 + Math.floor(rnd() * 3) - k;
        const dep = 3 + Math.floor(rnd() * 2) - (k >> 1);
        if (len < 2 || dep < 2) break;
        const [bx, by, bw, bh] = face === 0 ? [x, y - dep + 1, len, dep] : face === 2 ? [x, y, len, dep] : face === 1 ? [x - dep + 1, y, dep, len] : [x, y, dep, len];
        if (!fits(bx, by, bw, bh)) continue;
        put({ kind: 'building', x: bx, y: by, w: bw, h: bh, wall: Math.floor(rnd() * 3), roof: Math.floor(rnd() * 3), floors: 1 + (rnd() < 0.45 ? 1 : 0), face, style: 'magic' }, bw, bh);
        for (let j = by; j < by + bh; j++) for (let i = bx; i < bx + bw; i++) house.add(j * N + i);
        break;
      }
    }
  }
  for (let y = 3; y < N - 3; y++) {
    for (let x = 3; x < N - 3; x++) {
      if (zone[y][x] !== Z.Block || !free(m, x - 1, y - 1, 3, 3)) continue;
      const r = rnd();
      if (dist[y][x] >= 2 && r < 0.14) put({ kind: 'tree', x, y, big: rnd() < 0.5 });
      else if (dist[y][x] >= 2 && r < 0.16) put({ kind: 'crate', x, y });
    }
  }
  // lamps along the ring roads
  for (const rr of [OUTER[0] - 0.6, INNER[0] - 0.6]) {
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2 + 0.13;
      const k = rr / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t)), (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t))) / Math.SQRT2);
      const x = Math.floor(C + Math.cos(t) * k), y = Math.floor(C + Math.sin(t) * k);
      if (free(m, x, y) && zone[y][x] === Z.Block) put({ kind: 'lamp', x, y });
    }
  }
  m.portals = [{ x: C - 1, y: N - 3, to: 'marsh', ...(() => { const a = arrive('marsh', 'n'); return { toX: a.toX, toY: a.toY }; })(), label: 'บึงจังหวะ' }];
  m.spawn = { x: C + 0.5, y: C + 9.5 };
  return m;
}

// ---------------------------------------------------------------- อเวจี

/**
 * อเวจี, the abyss (Lv 95+): dark ground split by pools of blood, obsidian spikes and graves everywhere, and in
 * the middle the reaper's blood circle ringed with skulls, where the MVP boss ยมทูตเคียวโลหิต waits.
 */
const buildAbyss = () => buildWild({
  id: 'abyss', name: 'อเวจี', theme: 'abyss', seed: 666,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.008, rocks: 0.03,
  pools: [[18, 18, 6, 4], [66, 18, 5, 5], [18, 66, 5, 5], [66, 66, 6, 4], [42, 20, 4, 3], [42, 66, 4, 3]],
  rivers: [{ pts: [[4, 30], [20, 34], [28, 42]], width: 2.5 }, { pts: [[80, 54], [64, 50], [56, 42]], width: 2.5 }],
  gates: [{ side: 'w', ...arrive('inferno', 'e'), label: 'ปล่องลาวานรกเมทัล' }],
  extra: (m, rnd) => {
    // the arena in the middle stays clear: dark paving and the blood circle
    const C = WILD / 2;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const d = Math.hypot(x + 0.5 - C, y + 0.5 - C);
      if (d < 9) { m.ground[y][x] = d < 7 ? G.Plaza : G.Cobble; m.blocked[y][x] = false; }
    }
    m.objects.push({ kind: 'bloodcircle', x: C, y: C, r: 6.5 });
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2;
      const x = Math.floor(C + Math.cos(t) * 10.5), y = Math.floor(C + Math.sin(t) * 10.5);
      if (m.ground[y]?.[x] !== undefined && m.ground[y][x] !== G.Water && m.ground[y][x] !== G.Dirt) {
        m.objects.push({ kind: 'spike', x, y, s: 1.6 + rnd() * 0.8 });
        block(m, x, y);
      }
    }
    scatter(m, rnd, 70, [3, 3, 81, 81], (x, y) => (rnd() < 0.55 ? { kind: 'spike', x, y, s: 0.7 + rnd() * 0.9 } : { kind: 'grave', x, y }));
  },
});

// ---------------------------------------------------------------- field

/** The first field: FIELD x FIELD, the town gate in the middle of the west side, the beach gate on the east. */
const FIELD = 90;

function buildField(): GameMap {
  const N = FIELD;
  const k = N / 60; // laid out on a 60-tile plan, stretched
  const mid = Math.floor(N / 2);
  const m = blank('field', 'ทุ่งเมโลดี้', N, N, G.Grass, false);
  const rnd = mulberry32(20261025);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const r = rnd();
      m.ground[y][x] = r < 0.03 ? G.Flower : r < 0.4 ? G.Grass2 : G.Grass;
    }
  }
  // winding dirt path from the west gate right across to the east gate
  let py = mid;
  for (let x = 0; x < m.w; x++) {
    if (x < m.w - 10) py += Math.round((rnd() - 0.5) * 1.4);
    else py += Math.sign(mid - py);
    py = Math.max(mid - 9, Math.min(mid + 9, py));
    m.ground[py][x] = G.Dirt;
    m.ground[py + 1][x] = G.Dirt;
  }
  // ponds
  for (const [px, py2, rx, ry] of [[30, 46, 4, 2.5], [16, 14, 3, 2], [46, 20, 2.5, 3], [44, 50, 3, 2]]) {
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (((x - px * k) / (rx * k)) ** 2 + ((y - py2 * k) / (ry * k)) ** 2 <= 1 && m.ground[y][x] !== G.Dirt) {
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
  const gate = (j: number) => j >= mid - 2 && j <= mid + 3;
  for (let i = 0; i < m.w; i++) {
    addTree(i, 0, true);
    addTree(i, m.h - 1, true);
  }
  for (let j = 0; j < m.h; j++) {
    if (!gate(j)) {
      addTree(0, j, true);
      addTree(m.w - 1, j, true);
    }
  }
  block(m, 0, 0, m.w, 1);
  block(m, 0, m.h - 1, m.w, 1);
  for (let j = 0; j < m.h; j++) {
    if (!gate(j)) {
      block(m, 0, j);
      block(m, m.w - 1, j);
    }
  }
  for (let y = 2; y < m.h - 2; y++) {
    for (let x = 2; x < m.w - 2; x++) {
      if ((x < 8 || x > m.w - 9) && Math.abs(y - mid) < 7) continue; // keep the gates clear
      const r = rnd();
      if (r < 0.04) addTree(x, y);
      else if (r < 0.05 && free(m, x, y)) {
        m.objects.push({ kind: 'rock', x, y });
        block(m, x, y);
      }
    }
  }
  m.portals = [
    { x: 1, y: mid, ...TOWN_GATE.e, label: 'เมืองเมโลเดีย' },
    { x: m.w - 2, y: mid, ...arrive('beach', 'w'), label: 'หาดคลื่นซินธ์ (Lv 30+)' },
  ];
  m.spawn = { x: 3.5, y: mid + 0.5 };
  return m;
}

// ---------------------------------------------------------------- wild maps

/** Every wild map is WILD x WILD with its gates in the middle of a side (56 until 2026-11-05, now 1.5x). */
const WILD = 84;
/** The old maps were laid out on a 56-tile plan: their ponds are stretched by this. */
const OLD = WILD / 56;

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
  /** Rivers (lava on the volcano maps): a line through these points, `width` tiles wide. */
  rivers?: { pts: [number, number][]; width: number }[];
  /** The first gate leads back towards town; you arrive there. */
  gates: Gate[];
  /** Places the map's own landmarks (a volcano, crystals, graves) after the water and before the trees. */
  extra?: (m: GameMap, rnd: () => number) => void;
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
      if (u > 3 && u < mid - 6) v = Math.max(mid - 14, Math.min(mid + 14, v + Math.round((rnd() - 0.5) * 1.6)));
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
  // rivers: wobbly bands along each line; the gate paths cross them as natural bridges
  for (const rv of sp.rivers ?? []) {
    for (let i = 0; i + 1 < rv.pts.length; i++) {
      const [ax, ay] = rv.pts[i], [bx, by] = rv.pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      for (let t = 0; t <= len; t += 0.5) {
        const cx = ax + ((bx - ax) * t) / len, cy = ay + ((by - ay) * t) / len;
        const w = rv.width / 2 + Math.sin((i * 7 + t) * 0.6) * 0.6;
        for (let y = Math.floor(cy - w); y <= cy + w; y++) {
          for (let x = Math.floor(cx - w); x <= cx + w; x++) {
            if (x < 2 || y < 2 || x >= n - 2 || y >= n - 2 || Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > w || m.ground[y][x] === G.Dirt) continue;
            m.ground[y][x] = G.Water;
            m.blocked[y][x] = true;
          }
        }
      }
    }
  }
  sp.extra?.(m, rnd);
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

/** Stretches a pond laid out on the old 56-tile plan. */
const old = (p: [number, number, number, number][]): [number, number, number, number][] => p.map(([a, b, c, d]) => [a * OLD, b * OLD, c * OLD, d * OLD]);

/** Puts a lava volcano on the circle (x, y, r): blocked, no trees on it. */
function addVolcano(m: GameMap, x: number, y: number, r: number) {
  m.objects.push({ kind: 'volcano', x, y, r });
  for (let j = Math.floor(y - r - 1); j <= y + r + 1; j++) {
    for (let i = Math.floor(x - r - 1); i <= x + r + 1; i++) {
      if (m.ground[j]?.[i] === undefined || Math.hypot(i + 0.5 - x, j + 0.5 - y) > r) continue;
      m.blocked[j][i] = true;
      if (m.ground[j][i] !== G.Water) m.ground[j][i] = G.Cobble;
    }
  }
}

/** Scatters `count` single-tile `kind`s on free, dry, off-path tiles inside the box. */
function scatter(m: GameMap, rnd: () => number, count: number, box: [number, number, number, number], make: (x: number, y: number) => Obj) {
  for (let i = 0, tries = 0; i < count && tries < count * 30; tries++) {
    const x = Math.floor(box[0] + rnd() * (box[2] - box[0]));
    const y = Math.floor(box[1] + rnd() * (box[3] - box[1]));
    if (!free(m, x - 1, y - 1, 3, 3) || m.ground[y][x] === G.Dirt || m.ground[y][x] === G.Water) continue;
    m.objects.push(make(x, y));
    block(m, x, y);
    i++;
  }
}

// The town is the hub: east to the meadow (and on to the beach), west to the forest, the marsh and the
// crystal cave, south to the canyon and the desert town (and on through the dead forest to the ruined castle
// town), north (through the castle) up the snow peak, the volcano and the inferno.
const buildForest = () => buildWild({
  id: 'forest', name: 'ป่าเพลงกระซิบ', theme: 'forest', seed: 11,
  ground: [[G.Grass2, 0.55], [G.Grass, 0.42], [G.Flower, 0.03]], trees: 0.11, rocks: 0.015, pools: old([[40, 12, 3, 2], [14, 44, 2.5, 2]]),
  gates: [
    { side: 'e', ...TOWN_GATE.w, label: 'เมืองเมโลเดีย' },
    { side: 'w', ...arrive('marsh', 'e'), label: 'บึงจังหวะ (Lv 14+)' },
  ],
});
const buildMarsh = () => buildWild({
  id: 'marsh', name: 'บึงจังหวะ', theme: 'marsh', seed: 23,
  ground: [[G.Grass, 0.6], [G.Grass2, 0.4]], trees: 0.035, rocks: 0.01,
  pools: old([[14, 12, 5, 3], [36, 10, 4, 3], [44, 42, 6, 4], [18, 42, 4, 5], [30, 26, 3, 2]]),
  gates: [
    { side: 'e', ...arrive('forest', 'w'), label: 'ป่าเพลงกระซิบ' },
    { side: 'w', ...arrive('cave', 'e'), label: 'ถ้ำคริสตัลก้องกังวาน (Lv 40+)' },
    { side: 'n', to: 'magic', toX: MAGIC_SIZE / 2 - 0.5, toY: MAGIC_SIZE - 5.5, label: 'เมืองคีย์มนตรา' },
  ],
});
const buildCanyon = () => buildWild({
  id: 'canyon', name: 'หุบผาร็อค', theme: 'canyon', seed: 37,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.012, rocks: 0.07, pools: old([[42, 40, 3, 2]]),
  gates: [
    { side: 'n', ...TOWN_GATE.s, label: 'เมืองเมโลเดีย' },
    { side: 's', to: 'desert', toX: DC - 0.5, toY: 3.5, label: 'เมืองทะเลทรายตะโพน' },
  ],
});
const buildSnow = () => buildWild({
  id: 'snow', name: 'ยอดเขาหิมะโซปราโน', theme: 'snow', seed: 41,
  ground: [[G.Grass, 0.65], [G.Grass2, 0.35]], trees: 0.06, rocks: 0.025, pools: old([[16, 14, 4, 3], [40, 44, 5, 3]]),
  gates: [
    { side: 's', ...TOWN_GATE.n, label: 'เมืองเมโลเดีย' },
    { side: 'n', ...arrive('volcano', 's'), label: 'ภูเขาไฟเมทัล (Lv 26+)' },
  ],
});
/**
 * After the reference picture: dark cracked basalt with glowing seams, a lava river out of a big volcano in the
 * north-east, broad lava lakes with jagged rock shores, dead trees and armoured lava crabs.
 */
const buildVolcano = () => buildWild({
  id: 'volcano', name: 'ภูเขาไฟเมทัล', theme: 'volcano', seed: 53,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.012, rocks: 0.05,
  pools: [[54, 57, 10, 6], [20, 19, 5, 4], [70, 50, 4, 6], [14, 66, 5, 3]],
  rivers: [{ pts: [[58, 25], [50, 32], [40, 38], [28, 43], [16, 46], [4, 50]], width: 3.5 }, { pts: [[60, 52], [66, 45], [70, 38]], width: 2.5 }],
  gates: [
    { side: 's', ...arrive('snow', 'n'), label: 'ยอดเขาหิมะโซปราโน' },
    { side: 'n', ...arrive('inferno', 's'), label: 'ปล่องลาวานรกเมทัล (Lv 80+)' },
  ],
  extra: (m) => addVolcano(m, 66, 15, 12),
});
const buildInferno = () => buildWild({
  id: 'inferno', name: 'ปล่องลาวานรกเมทัล', theme: 'inferno', seed: 97,
  ground: [[G.Grass, 0.5], [G.Grass2, 0.3], [G.Cobble, 0.2]], trees: 0.006, rocks: 0.06,
  pools: [[18, 40, 8, 5], [64, 40, 7, 6], [40, 62, 9, 4], [14, 70, 4, 4], [72, 70, 5, 4]],
  rivers: [
    { pts: [[34, 18], [26, 28], [18, 40]], width: 3 },
    { pts: [[50, 18], [58, 28], [64, 40]], width: 3 },
    { pts: [[64, 46], [52, 56], [40, 62]], width: 2.5 },
  ],
  gates: [
    { side: 's', ...arrive('volcano', 'n'), label: 'ภูเขาไฟเมทัล' },
    { side: 'e', ...arrive('abyss', 'w'), label: 'อเวจี (Lv 95+ · บอส MVP)' },
  ],
  extra: (m) => addVolcano(m, 42, 4, 15),
});
const buildBeach = () => buildWild({
  id: 'beach', name: 'หาดคลื่นซินธ์', theme: 'beach', seed: 61,
  ground: [[G.Grass, 0.6], [G.Grass2, 0.38], [G.Flower, 0.02]], trees: 0.02, rocks: 0.012,
  pools: [[30, 22, 4, 3], [24, 62, 5, 3]],
  gates: [{ side: 'w', ...arrive('field', 'e'), label: 'ทุ่งเมโลดี้' }],
  extra: (m, rnd) => {
    // the sea along the east side, with a wavy shore and a sandbar island
    for (let y = 0; y < m.h; y++) {
      const shore = 62 + Math.sin(y * 0.16) * 4 + Math.sin(y * 0.05 + 1) * 3;
      for (let x = Math.floor(shore); x < m.w; x++) {
        if (m.ground[y][x] === G.Dirt) continue;
        m.ground[y][x] = G.Water;
        m.blocked[y][x] = true;
      }
    }
    for (let y = 36; y < 48; y++) for (let x = 72; x < 80; x++) {
      if (((x - 76) / 4) ** 2 + ((y - 42) / 6) ** 2 <= 1) {
        m.ground[y][x] = G.Grass;
        m.blocked[y][x] = true; // out of reach, just scenery
      }
    }
    // shells and driftwood: rocks on the sand near the water
    scatter(m, rnd, 14, [44, 4, 64, 80], (x, y) => ({ kind: 'rock', x, y }));
  },
});
const buildCave = () => buildWild({
  id: 'cave', name: 'ถ้ำคริสตัลก้องกังวาน', theme: 'cave', seed: 71,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.3], [G.Cobble, 0.15]], trees: 0.03, rocks: 0.07,
  pools: [[22, 20, 5, 3], [62, 18, 4, 4], [40, 44, 4, 3], [18, 64, 6, 4], [64, 64, 5, 3]],
  gates: [{ side: 'e', ...arrive('marsh', 'w'), label: 'บึงจังหวะ' }],
  extra: (m, rnd) => scatter(m, rnd, 70, [3, 3, 81, 81], (x, y) => ({ kind: 'crystal', x, y, hue: rnd() })),
});
const buildDeadwood = () => buildWild({
  id: 'deadwood', name: 'ป่าไม้ตายเพลงหลอน', theme: 'deadwood', seed: 83,
  ground: [[G.Grass, 0.55], [G.Grass2, 0.4], [G.Flower, 0.05]], trees: 0.08, rocks: 0.02,
  pools: [[20, 24, 5, 3], [62, 22, 4, 5], [30, 60, 6, 4], [66, 62, 4, 3]],
  gates: [
    { side: 'n', to: 'desert', toX: DC - 0.5, toY: DESERT_SIZE - 3.5, label: 'เมืองทะเลทรายตะโพน' },
    { side: 's', ...arrive('ruins', 'n'), label: 'เมืองปราสาทร้างโอเปร่า (Lv 65+)' },
  ],
  extra: (m, rnd) => scatter(m, rnd, 40, [4, 4, 80, 80], (x, y) => ({ kind: 'grave', x, y })),
});

// ---------------------------------------------------------------- the ruined castle town

/**
 * เมืองปราสาทร้างโอเปร่า: a walled castle town left to fall apart. Broken wall rings, cobbled avenues gone to
 * grass, roofless houses, a roofless cathedral on the old square with broken columns round it, a graveyard in
 * the south-east and dead trees everywhere. A hunting map (no NPCs); the only gate is north, to the dead forest.
 */
function buildRuins(): GameMap {
  const N = WILD;
  const C = N / 2;
  const m = blank('ruins', 'เมืองปราสาทร้างโอเปร่า', N, N, G.Grass, false, 'ruins');
  const rnd = mulberry32(131);
  const put = (o: Obj, w = 1, h = 1) => {
    m.objects.push(o);
    block(m, Math.floor(o.x), Math.floor(o.y), w, h);
  };
  // overgrown ground; cobbled avenues and lanes; the old square
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const a = Math.abs(x + 0.5 - C), b = Math.abs(y + 0.5 - C), o = Math.max(a, b);
      let g: G = rnd() < 0.35 ? G.Grass2 : G.Grass;
      if (o < 12) g = G.Plaza;
      else if (a < 2.5 || b < 2.5 || (o >= 25 && o < 27.5)) g = rnd() < 0.82 ? G.Cobble : G.Grass2; // weeds through the stones
      m.ground[y][x] = g;
    }
  }
  // the map's edge: dead trees, the north gate open
  const gate = (i: number) => i >= C - 3 && i <= C + 3;
  for (let i = 0; i < N; i++) {
    for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
      if (y === 0 && gate(x)) continue;
      if (rnd() < 0.5) m.objects.push({ kind: 'tree', x, y, big: true });
      block(m, x, y);
    }
  }
  // the town wall: a ring 5 tiles in, broken into runs with collapsed gaps, crumbling towers at the corners
  const W0 = 5, W1 = N - 7;
  const run = (horiz: boolean, fixed: number, from: number, to: number) => {
    for (let i = from; i < to;) {
      const len = 4 + Math.floor(rnd() * 6);
      const end = Math.min(to, i + len);
      const gap = horiz ? gate(i) || gate(end - 1) || (i <= C + 3 && end >= C - 3) : false;
      if (!gap && end - i >= 2 && rnd() < 0.78) put({ kind: 'ruinwall', x: horiz ? i : fixed, y: horiz ? fixed : i, w: horiz ? end - i : 2, h: horiz ? 2 : end - i }, horiz ? end - i : 2, horiz ? 2 : end - i);
      i = end + 1 + Math.floor(rnd() * 3);
    }
  };
  run(true, W0, W0 + 3, W1 - 1);
  run(true, W1, W0 + 3, W1 - 1);
  run(false, W0, W0 + 3, W1 - 1);
  run(false, W1, W0 + 3, W1 - 1);
  for (const [x, y] of [[W0 - 1, W0 - 1], [W1 - 1, W0 - 1], [W0 - 1, W1 - 1], [W1 - 1, W1 - 1]]) put({ kind: 'ruintower', x, y, s: 4 }, 4, 4);
  // gatehouse ruins either side of the north gate
  put({ kind: 'ruintower', x: C - 7, y: W0 - 1, s: 3 }, 3, 3);
  put({ kind: 'ruintower', x: C + 4, y: W0 - 1, s: 3 }, 3, 3);

  // the roofless cathedral on the north side of the square, columns round the square
  put({ kind: 'cathedral', x: C - 9, y: C - 11, w: 18, h: 9 }, 18, 9);
  for (let k = 0; k < 16; k++) {
    const ang = (k / 16) * Math.PI * 2;
    const x = Math.floor(C + Math.cos(ang) * 10.5), y = Math.floor(C + Math.sin(ang) * 10.5);
    if (y < C - 1 && Math.abs(x + 0.5 - C) < 10) continue; // the cathedral front
    if (Math.abs(x + 0.5 - C) < 3 || Math.abs(y + 0.5 - C) < 3) continue; // keep the avenues open
    if (free(m, x, y)) put({ kind: 'pillar', x, y, broken: rnd() < 0.6 });
  }
  // a dry, cracked fountain basin in the middle of the square
  m.objects.push({ kind: 'grave', x: C - 1, y: C + 3 });
  block(m, C - 1, C + 3);

  // roofless houses in the blocks between the avenues and the lanes
  for (let tries = 0; tries < 900; tries++) {
    const w = 3 + Math.floor(rnd() * 4), h = 3 + Math.floor(rnd() * 3);
    const x = W0 + 3 + Math.floor(rnd() * (W1 - W0 - 6 - w)), y = W0 + 3 + Math.floor(rnd() * (W1 - W0 - 6 - h));
    let ok = true;
    for (let j = y - 1; j <= y + h && ok; j++) {
      for (let i = x - 1; i <= x + w && ok; i++) {
        const g = m.ground[j]?.[i];
        if (g === G.Cobble || g === G.Plaza || m.blocked[j]?.[i] !== false) ok = false;
      }
    }
    if (ok) put({ kind: 'ruinwall', x, y, w, h }, w, h);
  }
  // the graveyard in the south-east corner, a few dark pools where cellars fell in
  for (let y = C + 16; y < W1 - 2; y += 3) {
    for (let x = C + 16; x < W1 - 2; x += 2) if (rnd() < 0.7 && free(m, x, y)) put({ kind: 'grave', x, y });
  }
  for (const [cx, cy, rx, ry] of [[18, 66, 3, 2], [66, 20, 2.5, 2], [16, 22, 2, 3]]) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1 && !m.blocked[y][x] && m.ground[y][x] !== G.Cobble) {
          m.ground[y][x] = G.Water;
          m.blocked[y][x] = true;
        }
      }
    }
  }
  // dead trees and rubble in the yards
  for (let y = 2; y < N - 2; y++) {
    for (let x = 2; x < N - 2; x++) {
      if (Math.abs(x + 0.5 - C) < 4 && y < 9) continue; // the gate
      const g = m.ground[y][x];
      if (g === G.Cobble || g === G.Plaza || !free(m, x - 1, y - 1, 3, 3)) continue;
      const r = rnd();
      if (r < 0.035) put({ kind: 'tree', x, y, big: rnd() < 0.4 });
      else if (r < 0.06) put({ kind: 'rock', x, y });
      else if (r < 0.068) put({ kind: 'grave', x, y });
    }
  }
  m.portals = [{ x: C, y: 1, ...arrive('deadwood', 's'), label: 'ป่าไม้ตายเพลงหลอน' }];
  const a = arrive('ruins', 'n');
  m.spawn = { x: a.toX, y: a.toY };
  return m;
}

// ---------------------------------------------------------------- PVP arena and the guild war castle (2026-11-10)

export const ARENA_SIZE = 48;
export const CASTLE_SIZE = 64;

/**
 * ลานประลองจังหวะ: a walled sand arena. Stone walls and towers all round, the gate in the south wall back to
 * town, rocks and broken columns to fight round, banners on the walls. No monsters: players fight each other.
 */
function buildArena(): GameMap {
  const N = ARENA_SIZE;
  const C = N / 2;
  const m = blank('arena', 'ลานประลองจังหวะ', N, N, G.Grass, false, 'canyon');
  const rnd = mulberry32(211);
  const put = (o: Obj, w = 1, h = 1) => {
    m.objects.push(o);
    block(m, Math.floor(o.x), Math.floor(o.y), w, h);
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = Math.hypot(x + 0.5 - C, y + 0.5 - C);
      m.ground[y][x] = r < 6 ? G.Plaza : r < 17 ? (rnd() < 0.25 ? G.Grass2 : G.Dirt) : rnd() < 0.5 ? G.Grass : G.Grass2;
      if (Math.abs(x + 0.5 - C) < 2 && y > C) m.ground[y][x] = G.Cobble; // the way in from the gate
    }
  }
  // walls (2 thick) with the gate in the middle of the south side, towers on the corners and by the gate
  for (const [x, y, w, h] of [[0, 0, N, 2], [0, 2, 2, N - 2], [N - 2, 2, 2, N - 2], [2, N - 2, C - 4, 2], [C + 2, N - 2, C - 4, 2]]) put({ kind: 'wall', x, y, w, h }, w, h);
  for (const [x, y] of [[0, 0], [N - 4, 0], [0, N - 4], [N - 4, N - 4]]) put({ kind: 'tower', x, y, s: 4 }, 4, 4);
  for (const x of [C - 5, C + 2]) put({ kind: 'tower', x, y: N - 3, s: 3 }, 3, 3);
  for (const [x, y] of [[C - 1, 2], [2, C - 1], [N - 3, C - 1], [10, 2], [N - 11, 2]]) put({ kind: 'banner', x, y, color: rnd() < 0.5 ? 0 : 1 });
  // cover: a ring of columns round the centre, and rocks further out
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + 0.3;
    const x = Math.floor(C + Math.cos(a) * 9), y = Math.floor(C + Math.sin(a) * 9);
    if (free(m, x - 1, y - 1, 3, 3)) put({ kind: 'pillar', x, y, broken: k % 3 === 0 });
  }
  for (let i = 0, tries = 0; i < 14 && tries < 400; tries++) {
    const x = 4 + Math.floor(rnd() * (N - 8)), y = 4 + Math.floor(rnd() * (N - 10));
    const r = Math.hypot(x + 0.5 - C, y + 0.5 - C);
    if (r < 12 || r > 19 || (Math.abs(x + 0.5 - C) < 3 && y > C) || !free(m, x - 1, y - 1, 3, 3)) continue;
    put({ kind: 'rock', x, y });
    i++;
  }
  m.portals = [{ x: C - 1, y: N - 2, to: 'town', toX: TC + 0.5, toY: TC + 7.5, label: 'กลับเมืองเมโลเดีย' }];
  m.spawn = { x: C, y: N - 4.5 };
  return m;
}

/** Where players get up again in the arena: round the edge, away from the gate. */
export const ARENA_SPAWNS: [number, number][] = [[6.5, 6.5], [ARENA_SIZE - 6.5, 6.5], [6.5, ARENA_SIZE - 8.5], [ARENA_SIZE - 6.5, ARENA_SIZE - 8.5], [ARENA_SIZE / 2, 5.5], [5.5, ARENA_SIZE / 2], [ARENA_SIZE - 5.5, ARENA_SIZE / 2]];

/**
 * ปราสาทแห่งเสียง is laid out with the gate south and the throne court north, then turned upside down
 * (flipY) so the court is in the south: the camera looks north, so the castle never stands between it and you.
 */
const COURT_Y = 8;
/** The crystal sits in the middle of the throne court. */
export const CASTLE_CRYSTAL = { x: CASTLE_SIZE / 2, y: CASTLE_SIZE - COURT_Y };
/** The guild holding the castle gets up in the throne court; everyone else at the gate. */
export const CASTLE_INNER = { x: CASTLE_SIZE / 2, y: CASTLE_SIZE - 12.5 };

/** Mirrors a map north-south (tiles, objects, portals, spawn). */
function flipY(m: GameMap) {
  const H = m.h;
  m.ground.reverse();
  m.blocked.reverse();
  for (const o of m.objects) {
    const size = 'h' in o ? o.h : 's' in o ? o.s : 1;
    o.y = H - o.y - size;
  }
  for (const n of m.npcs) n.y = H - 1 - n.y;
  for (const pt of m.portals) pt.y = H - 1 - pt.y;
  m.spawn = { x: m.spawn.x, y: H - m.spawn.y };
}

/**
 * ปราสาทแห่งเสียง (the guild war castle): an outer wall with its gate in the south, a yard with hedges,
 * banners and low walls to fight round, then the castle itself across the north. The only way into the throne
 * court behind it is the passage under the castle's arch; the crystal stands in the middle of the court.
 */
function buildCastle(): GameMap {
  const N = CASTLE_SIZE;
  const C = N / 2;
  const m = blank('gvg', 'ปราสาทแห่งเสียง', N, N, G.Grass, false, 'town');
  const rnd = mulberry32(307);
  const put = (o: Obj, w = 1, h = 1) => {
    m.objects.push(o);
    block(m, Math.floor(o.x), Math.floor(o.y), w, h);
  };
  const castle = { x: C - 14, y: 16, w: 28, h: 11, door: 6 };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let g: G = rnd() < 0.3 ? G.Grass2 : G.Grass;
      if (y < castle.y && x > 2 && x < N - 3) g = Math.hypot(x + 0.5 - C, y + 0.5 - COURT_Y) < 5 ? G.Plaza : G.Cobble; // the throne court
      else if (Math.abs(x + 0.5 - C) < 3 && y >= castle.y) g = G.Cobble; // the road from the gate
      else if (y > 30 && y < 34 && x > 4 && x < N - 5) g = G.Cobble; // the cross road
      m.ground[y][x] = g;
    }
  }
  // outer walls, the gate south
  for (const [x, y, w, h] of [[0, 0, N, 2], [0, 2, 2, N - 2], [N - 2, 2, 2, N - 2], [2, N - 2, C - 4, 2], [C + 2, N - 2, C - 4, 2]]) put({ kind: 'wall', x, y, w, h }, w, h);
  for (const [x, y] of [[0, 0], [N - 4, 0], [0, N - 4], [N - 4, N - 4]]) put({ kind: 'tower', x, y, s: 4 }, 4, 4);
  for (const x of [C - 5, C + 2]) put({ kind: 'tower', x, y: N - 3, s: 3 }, 3, 3);
  // the castle across the north, walls from its ends to the outer wall: the arch is the only way into the court
  m.objects.push({ kind: 'castle', ...castle });
  block(m, castle.x, castle.y, castle.w / 2 - castle.door / 2, castle.h);
  block(m, C + castle.door / 2, castle.y, castle.w / 2 - castle.door / 2, castle.h);
  put({ kind: 'wall', x: 2, y: castle.y + 3, w: castle.x - 2, h: 2 }, castle.x - 2, 2);
  put({ kind: 'wall', x: castle.x + castle.w, y: castle.y + 3, w: N - 2 - castle.x - castle.w, h: 2 }, N - 2 - castle.x - castle.w, 2);
  for (const x of [castle.x - 3, castle.x + castle.w]) put({ kind: 'tower', x, y: castle.y + 2, s: 3 }, 3, 3);
  // the throne court: banners and lamps round the crystal
  for (const [x, y, c] of [[C - 8, 3, 0], [C + 7, 3, 1], [4, 8, 0], [N - 5, 8, 1]]) put({ kind: 'banner', x, y, color: c });
  for (const [x, y] of [[C - 5, 5], [C + 4, 5], [C - 5, 11], [C + 4, 11]]) put({ kind: 'lamp', x, y });
  block(m, C - 1, COURT_Y - 1, 2, 2); // the crystal's pedestal
  // the yard: low walls and hedges to fight round, banners on the road
  for (const [x, y, w, h] of [[C - 15, 38, 8, 2], [C + 7, 38, 8, 2], [C - 4, 45, 8, 2], [8, 48, 2, 7], [N - 10, 48, 2, 7]]) put({ kind: 'wall', x, y, w, h }, w, h);
  for (const [x, y, w, h] of [[6, 34, 6, 1], [N - 12, 34, 6, 1], [C - 12, 52, 6, 1], [C + 6, 52, 6, 1]]) put({ kind: 'hedge', x, y, w, h }, w, h);
  for (const [x, y, c] of [[C - 4, 29, 0], [C + 3, 29, 1], [C - 4, 56, 1], [C + 3, 56, 0]]) put({ kind: 'banner', x, y, color: c });
  for (let i = 0, tries = 0; i < 26 && tries < 600; tries++) {
    const x = 3 + Math.floor(rnd() * (N - 6)), y = castle.y + castle.h + 2 + Math.floor(rnd() * (N - castle.y - castle.h - 6));
    if (m.ground[y][x] === G.Cobble || !free(m, x - 1, y - 1, 3, 3)) continue;
    put({ kind: 'tree', x, y, big: rnd() < 0.4 });
    i++;
  }
  m.portals = [{ x: C - 1, y: N - 2, to: 'town', toX: TC + 0.5, toY: TC + 7.5, label: 'กลับเมืองเมโลเดีย' }];
  m.spawn = { x: C, y: N - 4.5 };
  flipY(m);
  return m;
}

/** Puts an NPC on the first free tile (with room to walk up to it) round (ax, ay). */
function addNpcNear(m: GameMap, npc: Omit<Npc, 'x' | 'y'>, ax: number, ay: number) {
  for (let r = 0; r < 14; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ax + dx;
        const y = ay + dy;
        if (!free(m, x - 1, y - 1, 3, 3) || m.npcs.some((n) => Math.abs(n.x - x) < 3 && Math.abs(n.y - y) < 3)) continue;
        m.npcs.push({ ...npc, x, y });
        block(m, x, y);
        return;
      }
    }
  }
}

/** The guild registrar, the arena keeper and the castle herald, on the town plaza. */
function addWarNpcs(m: GameMap) {
  addNpcNear(m, { id: 'guild', name: 'นายทะเบียนกิลด์', look: { gender: 'm', hair: 3, hair_color: 1, face: 2, body: '#c62828' } }, TC - 11, TC + 2);
  addNpcNear(m, { id: 'pvp', name: 'ผู้คุมลานประลอง', look: { gender: 'm', hair: 1, hair_color: 0, face: 3, body: '#37474f' } }, TC + 11, TC + 2);
  addNpcNear(m, { id: 'gvg', name: 'ทหารประกาศสงครามกิลด์', look: { gender: 'f', hair: 2, hair_color: 3, face: 1, body: '#283593' } }, TC + 11, TC - 3);
}

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

/**
 * บูรพา also waits beside every gate of every map (2026-11-08): warp to a town, open the storage, or save
 * your respawn point there. Stands off to the side of the gate so the way through stays clear.
 */
function addGateBurapas(m: GameMap) {
  for (const pt of m.portals) {
    const cx = pt.x + 0.5, cy = pt.y + 0.5;
    // which edge the gate is on: "along" runs beside the wall, "inward" into the map
    const onSide = Math.min(cx, m.w - cx) < Math.min(cy, m.h - cy);
    let best = null as { x: number; y: number; d: number } | null;
    // close beside the gate if there's room, else a little further in (the town's north gate runs through the castle)
    for (const reach of [10, 22]) {
      for (let y = 1; y < m.h - 1; y++) {
        for (let x = 1; x < m.w - 1; x++) {
          const along = onSide ? Math.abs(y + 0.5 - cy) : Math.abs(x + 0.5 - cx);
          const inward = onSide ? Math.abs(x + 0.5 - cx) : Math.abs(y + 0.5 - cy);
          if (along < 3 || along > 9 || inward < 2 || inward > reach) continue;
          if (!free(m, x - 1, y - 1, 3, 3) || m.npcs.some((n) => Math.abs(n.x - x) < 3 && Math.abs(n.y - y) < 3)) continue;
          const d = along * 1.5 + inward;
          if (!best || d < best.d) best = { x, y, d };
        }
      }
      if (best) break;
    }
    if (!best) continue;
    m.npcs.push({ ...BURAPA, x: best.x, y: best.y });
    block(m, best.x, best.y);
  }
}

const built = new Map<string, GameMap>();
const BUILDERS: Record<string, () => GameMap> = {
  town: buildTown, field: buildField, forest: buildForest, marsh: buildMarsh, canyon: buildCanyon, snow: buildSnow, volcano: buildVolcano,
  desert: buildDesert, beach: buildBeach, cave: buildCave, deadwood: buildDeadwood, ruins: buildRuins, inferno: buildInferno,
  magic: buildMagic, abyss: buildAbyss,
  arena: buildArena, gvg: buildCastle,
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
  { map: 'magic', cost: 300 },
];

/** A fresh copy each call for callers that mutate `blocked`; cached otherwise. */
export function getMap(id: string): GameMap {
  if (!BUILDERS[id]) id = START_MAP;
  if (!built.has(id)) {
    const m = BUILDERS[id]();
    if (id === START_MAP) {
      addJobNpc(m);
      addWarNpcs(m);
    }
    addGateBurapas(m);
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
export function findPath(m: GameMap, sx: number, sy: number, tx: number, ty: number, maxNodes = 12000) {
  const W = m.w;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && !m.blocked[y][x];
  if (!ok(tx, ty)) return null;
  const start = sy * W + sx;
  const goal = ty * W + tx;
  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  // binary heap on f (the maps are big enough since 2026-11-05 that a linear scan got slow)
  const heap: { k: number; f: number }[] = [{ k: start, f: 0 }];
  const push = (n: { k: number; f: number }) => {
    heap.push(n);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1, r = l + 1;
        let b = i;
        if (l < heap.length && heap[l].f < heap[b].f) b = l;
        if (r < heap.length && heap[r].f < heap[b].f) b = r;
        if (b === i) break;
        [heap[b], heap[i]] = [heap[i], heap[b]];
        i = b;
      }
    }
    return top;
  };
  const closed = new Set<number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  };
  let expanded = 0;
  while (heap.length) {
    const { k } = pop();
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
          push({ k: nk, f: ng + h(nx, ny) });
        }
      }
    }
  }
  return null;
}
