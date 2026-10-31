// Bakes pixelfx effects (https://github.com/patch-gg/pixelfx, MIT) into small sprite sheets for the game.
//
//   node tools/bake_fx.mjs /path/to/pixelfx-main
//
// Writes public/fx/<name>.png (frames in a grid, cropped to what the effect actually draws) and
// public/fx/fx.json (frame size, grid, fps, pivot) that src/three/pixelfx.ts reads. Frame rates and time
// windows are trimmed so every sheet stays small enough for phones.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? '');
const lib = await import(pathToFileURL(join(root, 'tools/lib/fxlib.mjs')).href);
const { PAL } = await import(pathToFileURL(join(root, 'src/core/color.js')).href);
const { encodePNG } = await import(pathToFileURL(join(root, 'tools/lib/png.mjs')).href);

/** name -> pixelfx id, options, frames per second, time window (s), blending. */
const BAKES = {
  note_burst: { id: 'arcane/mana-burst', opts: { palette: PAL.cyber }, fps: 15, from: 0.1, to: 1.5, add: false },
  heal_ring: { id: 'holy/heal-aoe', opts: { reach: 64 }, fps: 15, from: 0.2, to: 2.0, add: false },
  tempo: { id: 'lightning/charge-up', opts: { palette: PAL.electric }, fps: 15, from: 0.4, to: 2.2, add: false },
  control: { id: 'holy/blessing', opts: { palette: PAL.arcane, actor: null }, fps: 12, from: 0, to: 1.6, add: false },
  solo_star: { id: 'pickups/power-star', opts: {}, fps: 15, from: 0, to: 1.6, add: false },
  shield: { id: 'holy/divine-shield', opts: { palette: PAL.water, actor: null }, fps: 15, from: 0, to: 2.4, add: false },
  block: { id: 'impacts/shield-block', opts: {}, fps: 15, from: 0, to: 1.0, add: false },
  stab_hit: { id: 'impacts/hit-spark', opts: {}, fps: 20, from: 0, to: 0.5, add: false },
};

const outDir = new URL('../public/fx/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const index = {};
for (const [name, b] of Object.entries(BAKES)) {
  const fx = await lib.loadEffect(b.id);
  const r = lib.renderFrames(fx, { fps: b.fps, bg: 'none', actor: false, options: b.opts });
  const frames = r.frames.filter((f) => f.t >= b.from - 1e-6 && f.t <= b.to + 1e-6).map((f) => f.clear);
  // crop every frame to the union of the pixels any frame draws
  let x0 = r.w, y0 = r.h, x1 = -1, y1 = -1;
  for (const f of frames) {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      if (f[(y * r.w + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, n = frames.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt((n * h) / w)));
  const rows = Math.ceil(n / cols);
  const W = cols * w, H = rows * h;
  const data = new Uint8ClampedArray(W * H * 4);
  frames.forEach((f, i) => {
    const ox = (i % cols) * w, oy = Math.floor(i / cols) * h;
    for (let y = 0; y < h; y++) {
      const s = ((y + y0) * r.w + x0) * 4;
      data.set(f.subarray(s, s + w * 4), ((oy + y) * W + ox) * 4);
    }
  });
  writeFileSync(new URL(`${name}.png`, outDir), encodePNG(W, H, data));
  const [px, py] = fx.meta.origin;
  index[name] = { w, h, cols, n, fps: b.fps, pivot: [px - x0, py - y0], add: b.add };
  console.log(`${name.padEnd(11)} ${b.id.padEnd(22)} ${n} frames ${w}x${h} -> ${W}x${H}`);
}
writeFileSync(new URL('fx.json', outDir), JSON.stringify(index, null, 1) + '\n');
