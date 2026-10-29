import { G, type GameMap } from '../game/maps';

/**
 * Painted terrain for grass and dirt: instead of one flat colour per tile, the ground is
 * painted pixel by pixel from smooth noise, so meadows have sunny and shaded patches, paths
 * have soft, ragged edges with grass tufts spilling over them, and dirt is speckled with
 * pebbles. Cobbles, the plaza and water keep their tile drawing from props.ts.
 */

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Smooth value noise on an integer lattice, deterministic per map. */
function noise(seed: number) {
  const N = 256;
  const t = new Float32Array(N * N);
  let s = seed | 1;
  for (let i = 0; i < t.length; i++) {
    s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 | 0;
    t[i] = ((s >>> 8) & 0xffff) / 0xffff;
  }
  const at = (x: number, y: number) => t[(y & (N - 1)) * N + (x & (N - 1))];
  const v = (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  return (x: number, y: number, oct = 3) => {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      sum += v(x * f + o * 17.3, y * f - o * 9.1) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.03;
    }
    return sum / norm;
  };
}

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** `soft(x, y)` says which tiles to paint (grass and dirt, plus pond tiles whose rim shows as bank). */
export function paintTerrain(c: CanvasRenderingContext2D, m: GameMap, T: number, base: string[], soft: (x: number, y: number) => boolean) {
  const W = m.w * T, H = m.h * T;
  const fbm = noise(m.w * 7919 + m.h * 31 + m.id.length);
  const lush = m.theme !== 'snow' && m.theme !== 'canyon' && m.theme !== 'volcano';
  const g1 = hex(base[G.Grass]), g2 = hex(base[G.Grass2]), dirt = hex(base[G.Dirt]);
  // a sunlit, yellower green and a deep shade green around the theme's own grass
  const sun: [number, number, number] = lush ? [Math.min(255, g2[0] * 1.18 + 14), Math.min(255, g2[1] * 1.15 + 8), g2[2] * 0.72] : [g2[0] * 1.06, g2[1] * 1.06, g2[2] * 1.06];
  const shadeC: [number, number, number] = lush ? [g1[0] * 0.62, g1[1] * 0.78, g1[2] * 0.6] : [g1[0] * 0.9, g1[1] * 0.9, g1[2] * 0.92];

  // dirt coverage, blurred so the 0.5 line is a soft, rounded path edge
  const occ = new Float32Array(m.w * m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      let s = 0, n = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const g = m.ground[y + j]?.[x + i];
          if (g === undefined) continue;
          const k = (i ? 1 : 2) * (j ? 1 : 2);
          s += (g === G.Dirt ? 1 : 0) * k;
          n += k;
        }
      }
      occ[y * m.w + x] = s / n;
    }
  }
  const dirtAt = (u: number, v: number) => {
    const a = u - 0.5, b = v - 0.5;
    const x0 = Math.max(0, Math.min(m.w - 1, Math.floor(a))), y0 = Math.max(0, Math.min(m.h - 1, Math.floor(b)));
    const x1 = Math.min(m.w - 1, x0 + 1), y1 = Math.min(m.h - 1, y0 + 1);
    const fx = Math.max(0, Math.min(1, a - x0)), fy = Math.max(0, Math.min(1, b - y0));
    const o = (occ[y0 * m.w + x0] * (1 - fx) + occ[y0 * m.w + x1] * fx) * (1 - fy) + (occ[y1 * m.w + x0] * (1 - fx) + occ[y1 * m.w + x1] * fx) * fy;
    if (o <= 0.01) return 0;
    if (o >= 0.99) return 1;
    return o + (fbm(u * 1.7, v * 1.7, 2) - 0.5) * 0.42;
  };

  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const mask = new Float32Array(W * H); // dirt amount per pixel, reused by the detail pass
  for (let py = 0; py < H; py++) {
    const ty = (py / T) | 0;
    const v = (py + 0.5) / T;
    for (let px = 0; px < W; px++) {
      const tx = (px / T) | 0;
      if (!soft(tx, ty)) {
        mask[py * W + px] = -1;
        continue;
      }
      const u = (px + 0.5) / T;
      const dm = dirtAt(u, v);
      // the path spreads a little past its tiles, like a well-trodden track
      const t = dm <= 0.24 ? 0 : dm >= 0.4 ? 1 : (dm - 0.24) / 0.16;
      mask[py * W + px] = t;
      const k = (py * W + px) * 4;
      // grass: big sunny / shaded patches, then a finer mottling and per-pixel grain
      const big = fbm(u * 0.11, v * 0.11, 3);
      const mid = fbm(u * 0.55, v * 0.55, 2);
      const grain = 0.93 + ((px * 73856093 ^ py * 19349663) >>> 0) % 1000 / 1000 * 0.14;
      const p = Math.max(0, Math.min(1, (big - 0.32) * 2.2));
      let r = shadeC[0] + (sun[0] - shadeC[0]) * p;
      let g = shadeC[1] + (sun[1] - shadeC[1]) * p;
      let b = shadeC[2] + (sun[2] - shadeC[2]) * p;
      const mm = 0.88 + mid * 0.24;
      r *= mm * grain; g *= mm * grain; b *= mm * grain;
      if (t > 0) {
        // packed earth: lighter in the middle of the path, darker and damp at the edges
        const e = fbm(u * 0.9, v * 0.9, 3);
        const centre = Math.min(1, Math.max(0, (dm - 0.4) * 2));
        const lit = (0.8 + e * 0.32 + centre * 0.12) * grain;
        const dr = dirt[0] * lit, dg = dirt[1] * lit, db = dirt[2] * lit;
        // soil shadow where grass overhangs the path
        const rim = t < 1 ? 0.78 + 0.22 * t : 1;
        r = (r * (1 - t) + dr * t) * rim;
        g = (g * (1 - t) + dg * t) * rim;
        b = (b * (1 - t) + db * t) * rim;
      }
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
    }
  }
  c.putImageData(img, 0, 0);

  const r = rng(m.w * 131 + m.h * 17);
  const dirtPx = (x: number, y: number) => {
    const i = Math.floor(y) * W + Math.floor(x);
    return x < 0 || y < 0 || x >= W || y >= H ? -1 : mask[i];
  };
  const S = T / 32; // detail is drawn in "32px tile" units

  // pebbles and little clods on the paths
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      const n = 4 + Math.floor(r() * 5);
      for (let i = 0; i < n; i++) {
        const x = (tx + r()) * T, y = (ty + r()) * T;
        if (dirtPx(x, y) < 0.9) continue;
        const rad = (0.8 + r() * (r() < 0.15 ? 2.6 : 1.3)) * S;
        const tone = 0.7 + r() * 0.5;
        c.fillStyle = `rgba(40,28,18,0.35)`;
        c.beginPath();
        c.ellipse(x + rad * 0.35, y + rad * 0.45, rad, rad * 0.7, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = `rgb(${dirt[0] * tone + 30 | 0},${dirt[1] * tone + 30 | 0},${dirt[2] * tone + 34 | 0})`;
        c.beginPath();
        c.ellipse(x, y, rad, rad * 0.72, r() * 3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = 'rgba(255,250,235,0.35)';
        c.beginPath();
        c.ellipse(x - rad * 0.3, y - rad * 0.3, rad * 0.4, rad * 0.28, 0, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  if (!lush) return;

  // grass blades everywhere, and tufts spilling over the path edges
  const blade = (x: number, y: number, len: number, lean: number, col: string, w: number) => {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + lean * 0.4, y - len * 0.6, x + lean, y - len);
    c.stroke();
  };
  c.lineCap = 'round';
  const dark = `rgb(${shadeC[0] * 0.8 | 0},${shadeC[1] * 0.85 | 0},${shadeC[2] * 0.7 | 0})`;
  const light = `rgb(${Math.min(255, sun[0] * 0.98) | 0},${Math.min(255, sun[1] * 1.05) | 0},${sun[2] * 0.95 | 0})`;
  const mid = `rgb(${g2[0]},${g2[1]},${g2[2]})`;
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      if (!soft(tx, ty)) continue;
      for (let i = 0; i < 64; i++) {
        const x = (tx + r()) * T, y = (ty + r()) * T;
        const dm = dirtPx(x, y);
        if (dm < 0 || dm > 0.45) continue;
        const pick = r();
        blade(x, y, (2 + r() * 3.5) * S, (r() - 0.5) * 3 * S, pick < 0.5 ? dark : pick < 0.85 ? mid : light, (0.55 + r() * 0.45) * S);
      }
      // tufts along the path rim, leaning out over the dirt
      for (let i = 0; i < 10; i++) {
        const x = (tx + r()) * T, y = (ty + r()) * T;
        const dm = dirtPx(x, y);
        if (dm < 0.15 || dm > 0.7) continue;
        const n = 5 + Math.floor(r() * 5);
        for (let j = 0; j < n; j++) {
          const a = (j / (n - 1) - 0.5) * 1.6;
          const len = (4 + r() * 5) * S;
          blade(x + (r() - 0.5) * 3 * S, y, len, Math.sin(a) * len * 0.8, j % 3 ? mid : r() < 0.5 ? light : dark, 1.1 * S);
        }
      }
      // little flowers: meadows on flower tiles, a few dotted elsewhere
      const flowers = m.ground[ty][tx] === G.Flower ? 4 : r() < 0.12 ? 1 : 0;
      for (let i = 0; i < flowers; i++) {
        const cx = (tx + r()) * T, cy = (ty + r()) * T;
        if (dirtPx(cx, cy) > 0.3) continue;
        const col = ['#ffffff', '#fffbe0', '#ffe46b', '#ffb3d1', '#c8b6ff'][Math.floor(r() * 5)];
        const n = 3 + Math.floor(r() * 4);
        for (let j = 0; j < n; j++) {
          const x = cx + (r() - 0.5) * 9 * S, y = cy + (r() - 0.5) * 7 * S;
          c.fillStyle = col;
          c.beginPath();
          c.arc(x, y, 1.3 * S, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = '#f2b400';
          c.fillRect(x - 0.4 * S, y - 0.4 * S, 0.8 * S, 0.8 * S);
        }
      }
    }
  }
}
