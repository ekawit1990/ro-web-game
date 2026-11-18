import * as THREE from 'three';

/**
 * Tiger stripes for the ราชาเสือโคร่ง drops (2026-11-18): every tiger-striped weapon, the glasses, the hat and the
 * striped scooters paint their bodies with this. Stripes are tapered black brush strokes coming in from both
 * edges over warm orange fur, with a little white at the edges, drawn into a canvas once per size.
 */
export const TIGER = { fur: '#f08a1c', deep: '#c85a0a', light: '#ffc35a', stripe: '#141010', white: '#fff4e2' };

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/**
 * Paints tiger stripes into a w x h area of `g`. Stripes run across (along x) when `across`, else down (along y).
 * `fur` false = stripes only (on top of whatever is there).
 */
export function paintTiger(g: CanvasRenderingContext2D, w: number, h: number, opts: { across?: boolean; fur?: boolean; seed?: number; density?: number } = {}) {
  const r = rng(opts.seed ?? 11);
  const across = opts.across ?? true;
  if (opts.fur !== false) {
    const gr = across ? g.createLinearGradient(0, 0, 0, h) : g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, TIGER.deep);
    gr.addColorStop(0.3, TIGER.fur);
    gr.addColorStop(0.5, TIGER.light);
    gr.addColorStop(0.7, TIGER.fur);
    gr.addColorStop(1, TIGER.deep);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // soft fur grain
    for (let i = 0; i < (w * h) / 60; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,230,180,0.08)' : 'rgba(120,40,0,0.08)';
      g.fillRect(r() * w, r() * h, 1, 3 + r() * 4);
    }
  }
  // the long side the stripes run across, and the short side they come in from
  const L = across ? w : h;
  const S = across ? h : w;
  const step = (L / 9) / (opts.density ?? 1);
  g.save();
  if (!across) {
    g.translate(w, 0);
    g.rotate(Math.PI / 2);
  }
  g.fillStyle = TIGER.stripe;
  for (let p = -step * 0.3; p < L + step; p += step * (0.7 + r() * 0.6)) {
    for (const side of [0, 1]) {
      if (r() < 0.12) continue;
      const len = S * (0.28 + r() * 0.3); // how far in from this edge
      const wid = step * (0.26 + r() * 0.2);
      const bend = (r() - 0.5) * step * 0.9;
      const y0 = side ? S : 0;
      const dir = side ? -1 : 1;
      const x0 = p + (side ? step * 0.4 : 0);
      // a tapered, slightly bent brush stroke, forking now and then
      g.beginPath();
      g.moveTo(x0 - wid / 2, y0);
      g.quadraticCurveTo(x0 + bend - wid * 0.3, y0 + dir * len * 0.55, x0 + bend * 1.4, y0 + dir * len);
      g.quadraticCurveTo(x0 + bend + wid * 0.3, y0 + dir * len * 0.55, x0 + wid / 2, y0);
      g.closePath();
      g.fill();
      if (r() < 0.35) {
        const fl = len * (0.35 + r() * 0.25);
        const fx = x0 + bend * 0.6 + wid * 0.2;
        g.beginPath();
        g.moveTo(fx, y0 + dir * len * 0.3);
        g.quadraticCurveTo(fx + step * 0.25, y0 + dir * (len * 0.3 + fl * 0.5), fx + step * 0.35, y0 + dir * (len * 0.3 + fl));
        g.quadraticCurveTo(fx + step * 0.1, y0 + dir * (len * 0.3 + fl * 0.5), fx - wid * 0.25, y0 + dir * len * 0.38);
        g.closePath();
        g.fill();
      }
    }
  }
  g.restore();
}

const cache = new Map<string, THREE.Texture>();
/** A repeating tiger-stripe texture (cached). */
export function tigerTexture(key = 'base', opts: { across?: boolean; repeat?: [number, number]; size?: [number, number]; seed?: number } = {}) {
  const k = `${key}|${opts.across}|${opts.repeat}|${opts.size}|${opts.seed}`;
  let t = cache.get(k);
  if (!t) {
    const [w, h] = opts.size ?? [256, 128];
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paintTiger(c.getContext('2d')!, w, h, { across: opts.across, seed: opts.seed });
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...(opts.repeat ?? [1, 1]));
    t.anisotropy = 4;
    cache.set(k, t);
  }
  return t;
}

const mats = new Map<string, THREE.Material>();
/** A glossy tiger-striped material (lacquered instrument finish). */
export function tigerMaterial(key = 'base', opts: { across?: boolean; repeat?: [number, number]; size?: [number, number]; seed?: number; rough?: number } = {}) {
  const k = `${key}|${opts.across}|${opts.repeat}|${opts.size}|${opts.seed}|${opts.rough}`;
  let m = mats.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: tigerTexture(key, opts), roughness: opts.rough ?? 0.35, metalness: 0.05 });
    mats.set(k, m);
  }
  return m;
}
