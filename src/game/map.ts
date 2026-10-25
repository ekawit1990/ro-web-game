export const TILE = 32;
export const MAP_W = 50;
export const MAP_H = 40;

export const enum T {
  Grass = 0,
  Grass2 = 1,
  Dirt = 2,
  Stone = 3,
  Water = 4,
  Fence = 5,
  Flower = 6,
}

/** Town is a safe zone: monsters never enter it. */
export const TOWN = { x0: 1, y0: 1, x1: 11, y1: 11 };
export const NPCS = [
  { id: 'shop', name: 'ร้านดนตรีป้ามะลิ', x: 3, y: 7, color: '#e7a33e' },
  { id: 'healer', name: 'ครูเพลงใจดี', x: 8, y: 3, color: '#ffffff' },
];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface WorldMap {
  tiles: number[][];
  trees: { x: number; y: number }[];
  blocked: boolean[][];
}

export function inTown(x: number, y: number): boolean {
  return x >= TOWN.x0 && x < TOWN.x1 + 1 && y >= TOWN.y0 && y < TOWN.y1 + 1;
}

/** The same seed gives every player the same map, so nothing needs to be stored. */
export function buildMap(seed = 20261025): WorldMap {
  const rnd = mulberry32(seed);
  const tiles: number[][] = [];
  const blocked: boolean[][] = [];
  for (let y = 0; y < MAP_H; y++) {
    tiles.push([]);
    blocked.push([]);
    for (let x = 0; x < MAP_W; x++) {
      const r = rnd();
      tiles[y].push(r < 0.04 ? T.Flower : r < 0.35 ? T.Grass2 : T.Grass);
      blocked[y].push(false);
    }
  }

  // town floor + fence with two gates (east and south)
  for (let y = TOWN.y0; y <= TOWN.y1; y++) {
    for (let x = TOWN.x0; x <= TOWN.x1; x++) {
      const edge = x === TOWN.x0 || x === TOWN.x1 || y === TOWN.y0 || y === TOWN.y1;
      const gate = (x === TOWN.x1 && (y === 5 || y === 6)) || (y === TOWN.y1 && (x === 5 || x === 6));
      tiles[y][x] = edge && !gate ? T.Fence : T.Stone;
      blocked[y][x] = edge && !gate;
    }
  }

  // dirt roads out of the gates
  for (let x = TOWN.x1 + 1; x < MAP_W - 2; x++) {
    tiles[5][x] = T.Dirt;
    tiles[6][x] = T.Dirt;
  }
  for (let y = TOWN.y1 + 1; y < MAP_H - 2; y++) {
    tiles[y][5] = T.Dirt;
    tiles[y][6] = T.Dirt;
  }

  // pond
  const pond = { x: 18, y: 25, rx: 3.6, ry: 2.4 };
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (((x - pond.x) / pond.rx) ** 2 + ((y - pond.y) / pond.ry) ** 2 <= 1) {
        tiles[y][x] = T.Water;
        blocked[y][x] = true;
      }
    }
  }

  // border trees + scattered trees
  const trees: { x: number; y: number }[] = [];
  const addTree = (x: number, y: number) => {
    if (blocked[y][x] || inTown(x, y) || tiles[y][x] === T.Dirt) return;
    trees.push({ x, y });
    blocked[y][x] = true;
  };
  for (let x = 0; x < MAP_W; x++) {
    addTree(x, 0);
    addTree(x, MAP_H - 1);
  }
  for (let y = 0; y < MAP_H; y++) {
    addTree(0, y);
    addTree(MAP_W - 1, y);
  }
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (rnd() < 0.055 && !(x <= TOWN.x1 + 2 && y <= TOWN.y1 + 2)) addTree(x, y);
    }
  }
  return { tiles, trees, blocked };
}

/** A* on the tile grid with 8-way moves (no corner cutting). Returns tile centres, excluding the start. */
export function findPath(
  map: WorldMap, sx: number, sy: number, tx: number, ty: number, maxNodes = 4000,
): { x: number; y: number }[] | null {
  const W = MAP_W;
  const ok = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && !map.blocked[y][x];
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
