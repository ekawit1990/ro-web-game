import * as THREE from 'three';
import { G, GameMap } from '../game/maps';
import { toon } from './toon';

/**
 * Clear, sunken ponds for the water tiles of a map: a pebbly basin cut into the ground with
 * moving caustics, a see-through surface that deepens from teal to blue, and lily pads,
 * cattails, weeds and koi. Shore rocks and grass come from nature.ts (see pondShore).
 * Lava (the volcano) keeps the flat look from props.ts.
 */

export interface PondField {
  /** 0 on land, 1 well inside the water; the shoreline is at 0.5. */
  f(x: number, z: number): number;
  /** 0 at the shore, 1 at the deepest part. */
  deep(x: number, z: number): number;
  /** Height of the basin floor (≤ 0). */
  floor(x: number, z: number): number;
  any: boolean;
}

export const SURFACE = -0.07;
const cache = new WeakMap<GameMap, PondField>();
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function hasPonds(m: GameMap) {
  return m.theme !== 'volcano' && pondField(m).any;
}

export function pondField(m: GameMap): PondField {
  const hit = cache.get(m);
  if (hit) return hit;
  const { w, h } = m;
  const water = (x: number, y: number) => m.theme !== 'volcano' && x >= 0 && y >= 0 && x < w && y < h && m.ground[y][x] === G.Water;
  // soft occupancy (5x5 binomial blur): the 0.5 contour follows the tile edges with well rounded corners
  const occ = new Float32Array(w * h);
  const dist = new Float32Array(w * h);
  const K = [1, 4, 6, 4, 1];
  let any = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) s += (water(x + i, y + j) ? 1 : 0) * K[i + 2] * K[j + 2];
      occ[y * w + x] = s / 256;
      if (water(x, y)) any = true;
    }
  }
  // distance from the shore, in tiles (two-pass chamfer)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dist[y * w + x] = water(x, y) ? 1e3 : 0;
  const relax = (x: number, y: number, dx: number, dy: number, c: number) => {
    const nx = x + dx, ny = y + dy;
    const d = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : dist[ny * w + nx];
    if (d + c < dist[y * w + x]) dist[y * w + x] = d + c;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dist[y * w + x]) { relax(x, y, -1, 0, 1); relax(x, y, 0, -1, 1); relax(x, y, -1, -1, 1.41); relax(x, y, 1, -1, 1.41); }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) if (dist[y * w + x]) { relax(x, y, 1, 0, 1); relax(x, y, 0, 1, 1); relax(x, y, 1, 1, 1.41); relax(x, y, -1, 1, 1.41); }
  const bilerp = (a: Float32Array, x: number, z: number) => {
    const u = x - 0.5, v = z - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : a[j * w + i]);
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  // a little noise so the shoreline wanders instead of tracing an ellipse
  const wobble = (x: number, z: number) => Math.sin(x * 2.3 + Math.sin(z * 1.7) * 1.5) * Math.cos(z * 2.9 - x * 0.8) * 0.07;
  const f = (x: number, z: number) => {
    const v = bilerp(occ, x, z);
    return v <= 0.02 || v >= 0.98 ? v : v + wobble(x, z);
  };
  const deep = (x: number, z: number) => smooth(0.6, 3.2, bilerp(dist, x, z));
  const floor = (x: number, z: number) => {
    const v = f(x, z);
    if (v <= 0.5) return 0;
    return -(0.16 + 0.42 * deep(x, z)) * smooth(0.5, 0.64, v);
  };
  const out = { f, deep, floor, any };
  cache.set(m, out);
  return out;
}

// ---------------------------------------------------------------- shaders

const caustic = /* glsl */ `
  float caustic(vec2 uv, float t) {
    vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;
    vec2 i = p;
    float c = 1.0;
    for (int n = 0; n < 4; n++) {
      float tt = t * (1.0 - (3.5 / float(n + 1)));
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.005), p.y / (cos(i.y + tt) / 0.005)));
    }
    c /= 4.0;
    c = 1.17 - pow(c, 1.4);
    return clamp(pow(abs(c), 8.0), 0.0, 1.0);
  }
`;

function pebbleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5d6656';
  g.fillRect(0, 0, 256, 256);
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 420; i++) {
    const x = r() * 256, y = r() * 256, rad = 4 + r() * 11;
    const tone = 95 + r() * 60;
    g.fillStyle = `rgb(${tone + 4},${tone + 8},${tone - 6})`;
    for (const [ox, oy] of [[0, 0], [256, 0], [-256, 0], [0, 256], [0, -256]]) {
      g.beginPath();
      g.ellipse(x + ox, y + oy, rad, rad * (0.6 + r() * 0.3), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const time = { value: 0 };
let pebbles: THREE.Texture | null = null;

function basinMaterial(tint: THREE.Color) {
  pebbles ??= pebbleTexture();
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uMap: { value: pebbles }, uTint: { value: tint } },
    vertexShader: /* glsl */ `
      attribute float aDeep;
      attribute float aBank;
      varying vec2 vXZ; varying float vDeep; varying float vBank; varying vec3 vN;
      #include <fog_pars_vertex>
      void main() {
        vXZ = position.xz; vDeep = aDeep; vBank = aBank; vN = normal;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform sampler2D uMap; uniform vec3 uTint;
      varying vec2 vXZ; varying float vDeep; varying float vBank; varying vec3 vN;
      #include <fog_pars_fragment>
      ${caustic}
      void main() {
        vec3 peb = texture2D(uMap, vXZ * 0.55).rgb;
        vec3 bank = vec3(0.20, 0.26, 0.11);
        vec3 col = mix(peb * uTint, bank, vBank);
        col *= mix(0.95, 0.4, vDeep);
        float light = 0.7 + 0.3 * max(dot(normalize(vN), normalize(vec3(0.4, 1.0, 0.3))), 0.0);
        col *= light;
        float c = caustic(vXZ * 0.32, uTime * 0.55);
        col += vec3(0.75, 0.95, 0.9) * c * (1.0 - vBank) * mix(0.85, 0.35, vDeep);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

function waterMaterial(shallow: THREE.Color, deepCol: THREE.Color) {
  return new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uShallow: { value: shallow }, uDeep: { value: deepCol } },
    vertexShader: /* glsl */ `
      attribute float aDeep;
      attribute float aF;
      varying vec2 vXZ; varying float vDeep; varying float vF; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vXZ = position.xz; vDeep = aDeep; vF = aF;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep;
      varying vec2 vXZ; varying float vDeep; varying float vF; varying vec3 vWorld;
      #include <fog_pars_fragment>
      vec2 wave(vec2 p, float t) {
        // slope of a few crossing ripples
        vec2 g = vec2(0.0);
        g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 5.0 + t * 1.7) * 0.06;
        g += vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 7.3 + t * 2.1) * 0.045;
        g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 11.0 + t * 2.9) * 0.03;
        g += vec2(0.2, 1.0) * cos(dot(p, vec2(0.2, 1.0)) * 17.0 - t * 3.3) * 0.02;
        return g;
      }
      void main() {
        vec3 n = normalize(vec3(-wave(vXZ, uTime).x, 1.0, -wave(vXZ, uTime).y));
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 l = normalize(vec3(-0.35, 1.0, 0.45));
        float spec = pow(max(dot(reflect(-l, n), v), 0.0), 90.0);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = mix(uShallow, uDeep, vDeep);
        col = mix(col, vec3(0.75, 0.9, 1.0), fres * 0.5);
        col += vec3(1.0) * spec * 1.4;
        // a pale line where the water meets the bank
        float edge = 1.0 - smoothstep(0.5, 0.54, vF);
        col = mix(col, vec3(0.85, 0.97, 1.0), edge * 0.2);
        float a = mix(0.38, 0.78, vDeep) + spec * 0.6 + edge * 0.15;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.95) * smoothstep(0.44, 0.5, vF));
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// ---------------------------------------------------------------- geometry

const RES = 4; // grid vertices per tile

function grid(m: GameMap, p: PondField, keep: (fmax: number) => boolean, y: (x: number, z: number) => number, attrs: Record<string, (x: number, z: number) => number>) {
  const pos: number[] = [];
  const extra: Record<string, number[]> = Object.fromEntries(Object.keys(attrs).map((k) => [k, []]));
  const idx: number[] = [];
  const ids = new Map<number, number>();
  const n = m.w * RES + 1;
  const vert = (i: number, j: number) => {
    const key = j * n + i;
    let id = ids.get(key);
    if (id === undefined) {
      const x = i / RES, z = j / RES;
      id = pos.length / 3;
      pos.push(x, y(x, z), z);
      for (const k in attrs) extra[k].push(attrs[k](x, z));
      ids.set(key, id);
    }
    return id;
  };
  for (let ty = 0; ty < m.h; ty++) {
    for (let tx = 0; tx < m.w; tx++) {
      // only near water
      let near = false;
      for (let j = -2; j <= 2 && !near; j++) for (let i = -2; i <= 2 && !near; i++) near = m.ground[ty + j]?.[tx + i] === G.Water;
      if (!near) continue;
      for (let j = 0; j < RES; j++) {
        for (let i = 0; i < RES; i++) {
          const gi = tx * RES + i, gj = ty * RES + j;
          const fs = [p.f(gi / RES, gj / RES), p.f((gi + 1) / RES, gj / RES), p.f(gi / RES, (gj + 1) / RES), p.f((gi + 1) / RES, (gj + 1) / RES)];
          if (!keep(Math.max(...fs))) continue;
          const a = vert(gi, gj), b = vert(gi + 1, gj), c = vert(gi, gj + 1), d = vert(gi + 1, gj + 1);
          idx.push(a, c, b, b, c, d);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const k in attrs) geo.setAttribute(k, new THREE.Float32BufferAttribute(extra[k], 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------- decoration

const PALETTE: Partial<Record<GameMap['theme'], { shallow: number; deep: number; floor: number }>> = {
  marsh: { shallow: 0x5fae8e, deep: 0x1f5a52, floor: 0x9aa07a },
  snow: { shallow: 0x8fdcef, deep: 0x2a6fa8, floor: 0xdde6ea },
  canyon: { shallow: 0x58d2c8, deep: 0x1a7896, floor: 0xd8c29a },
};

function rand(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function lilyPad(r: () => number, flower: boolean) {
  const g = new THREE.Group();
  const size = 0.13 + r() * 0.08;
  const gap = 0.25 + r() * 0.2;
  const pad = new THREE.Mesh(new THREE.CircleGeometry(size, 22, gap / 2, Math.PI * 2 - gap), toon(r() < 0.5 ? '#4f9e3a' : '#5fae42'));
  pad.rotation.x = -Math.PI / 2;
  g.add(pad);
  const rim = new THREE.Mesh(new THREE.RingGeometry(size * 0.92, size, 22, 1, gap / 2, Math.PI * 2 - gap), toon('#8fd06a'));
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.002;
  g.add(rim);
  if (flower) {
    const petal = new THREE.SphereGeometry(0.035, 8, 6).scale(0.55, 0.35, 1.5).translate(0, 0, 0.045);
    const pink = toon('#ffd6e8'), deepPink = toon('#ff9cc4');
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < 8; i++) {
        const p = new THREE.Mesh(petal, ring ? deepPink : pink);
        p.rotation.set(-(ring ? 0.9 : 0.45), (i / 8) * Math.PI * 2 + ring * 0.4, 0, 'YXZ');
        p.position.y = 0.02 + ring * 0.008;
        p.scale.setScalar(ring ? 0.75 : 1);
        g.add(p);
      }
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), toon('#ffd33d')).translateY(0.035));
  }
  g.rotation.y = r() * Math.PI * 2;
  return g;
}

function cattails(r: () => number, base: number) {
  const g = new THREE.Group();
  const stem = toon('#6c8f3a'), head = toon('#7a4a26'), leaf = toon('#5c9a38');
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 0.55 + r() * 0.45;
    const x = (r() - 0.5) * 0.25, z = (r() - 0.5) * 0.25, lean = (r() - 0.5) * 0.25;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.01, h - base, 5).translate(0, (h + base) / 2, 0), stem);
    s.position.set(x, 0, z);
    s.rotation.z = lean;
    const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.11, 3, 8), head);
    top.position.y = h - 0.09;
    s.add(top);
    g.add(s);
  }
  // long blades
  const blade = new THREE.ConeGeometry(0.02, 1, 4).scale(1, 1, 0.25).translate(0, 0.5, 0);
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(blade, leaf);
    b.scale.y = 0.4 + r() * 0.4;
    b.position.set((r() - 0.5) * 0.3, base, (r() - 0.5) * 0.3);
    b.rotation.set((r() - 0.5) * 0.7, r() * 6.3, (r() - 0.5) * 0.7);
    g.add(b);
  }
  return g;
}

function weeds(r: () => number, floorY: number) {
  const g = new THREE.Group();
  const blade = new THREE.ConeGeometry(0.018, 1, 4).scale(1, 1, 0.3).translate(0, 0.5, 0);
  const m = toon('#3f8a4a');
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Mesh(blade, m);
    b.scale.y = Math.max(0.05, (SURFACE - 0.02 - floorY) * (0.5 + r() * 0.5));
    b.position.set((r() - 0.5) * 0.2, floorY, (r() - 0.5) * 0.2);
    b.rotation.set((r() - 0.5) * 0.6, r() * 6.3, (r() - 0.5) * 0.6);
    g.add(b);
  }
  return g;
}

function koi(r: () => number) {
  const g = new THREE.Group();
  g.scale.setScalar(1.7);
  const orange = toon(r() < 0.3 ? '#f4f0e8' : '#ff7a2a');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8).scale(0.55, 0.45, 1.6), orange);
  g.add(body);
  if (r() < 0.6) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6).scale(0.6, 0.4, 1.2), toon(r() < 0.5 ? '#ffffff' : '#c63a1a'));
    spot.position.set(0, 0.012, 0.01 + r() * 0.03);
    g.add(spot);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.07, 4).scale(1, 1, 0.25), orange);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = -0.1;
  tail.name = 'tail';
  g.add(tail);
  return g;
}

/** Spots along the pond rims for nature.ts: rocks on the edge, reeds and grass on the bank. */
export function pondShore(m: GameMap) {
  const rocks: { x: number; z: number; s: number; y: number }[] = [];
  const bank: { x: number; z: number }[] = [];
  if (!hasPonds(m)) return { rocks, bank };
  const p = pondField(m);
  const r = rand(m.w * 977 + m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.ground[y][x] !== G.Water) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (m.ground[y + dy]?.[x + dx] === G.Water) continue;
        // a boulder sitting on the edge between this water tile and the land next to it
        for (const k of [0.25, 0.75]) {
          if (r() > 0.62) continue;
          const ex = x + 0.5 + dx * 0.42 + (dy ? k - 0.5 : 0) * 0.9, ez = y + 0.5 + dy * 0.42 + (dx ? k - 0.5 : 0) * 0.9;
          rocks.push({ x: ex, z: ez, s: 0.32 + r() * 0.3, y: Math.min(0, p.floor(ex, ez)) * 0.5 - 0.04 });
        }
        if (r() < 0.8) bank.push({ x: x + 0.5 + dx * (0.75 + r() * 0.4) + (r() - 0.5) * 0.6 * Math.abs(dy), z: y + 0.5 + dy * (0.75 + r() * 0.4) + (r() - 0.5) * 0.6 * Math.abs(dx) });
      }
    }
  }
  // a few big stones on the floor, half under water
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (m.ground[y][x] !== G.Water || r() > 0.08) continue;
      const fx = x + r(), fz = y + r();
      if (p.f(fx, fz) < 0.7) continue;
      rocks.push({ x: fx, z: fz, s: 0.3 + r() * 0.25, y: p.floor(fx, fz) - 0.02 });
    }
  }
  return { rocks, bank };
}

/** The basin, surface and pond life. Returns null on maps without ponds. */
export function buildPonds(m: GameMap): THREE.Group | null {
  if (!hasPonds(m)) return null;
  const p = pondField(m);
  const pal = PALETTE[m.theme] ?? { shallow: 0x3fc6c8, deep: 0x0f5a86, floor: 0xb8c4a8 };
  const g = new THREE.Group();
  g.name = 'ponds';

  // the rim sits just under the ground so the two never z-fight
  const basin = new THREE.Mesh(
    grid(m, p, (f) => f > 0.45, (x, z) => Math.min(-0.015, p.floor(x, z)), { aDeep: p.deep, aBank: (x, z) => 1 - smooth(0.5, 0.66, p.f(x, z)) }),
    basinMaterial(new THREE.Color(pal.floor)),
  );
  basin.receiveShadow = true;
  g.add(basin);
  const surface = new THREE.Mesh(
    grid(m, p, (f) => f > 0.44, () => SURFACE, { aDeep: p.deep, aF: p.f }),
    waterMaterial(new THREE.Color(pal.shallow), new THREE.Color(pal.deep)),
  );
  surface.renderOrder = 2;
  g.add(surface);

  // pond life, placed deterministically so every player sees the same pond
  const r = rand(m.w * 131 + m.h * 7 + 3);
  const cells: [number, number][] = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.ground[y][x] === G.Water) cells.push([x, y]);
  const fish: { o: THREE.Object3D; cx: number; cz: number; rad: number; speed: number; ph: number; y: number }[] = [];
  for (const [x, y] of cells) {
    const cx = x + 0.5, cz = y + 0.5;
    const d = p.deep(cx, cz), f = p.f(cx, cz);
    const roll = r();
    const cold = m.theme === 'snow'; // no lilies or reeds in an icy pond, just weeds and fish
    if (cold && roll < 0.3) {
      // skip
    } else if (d > 0.1 && d < 0.8 && roll < 0.2) {
      // a cluster of lily pads, one of them flowering
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const lx = cx + (r() - 0.5) * 0.8, lz = cz + (r() - 0.5) * 0.8;
        if (p.f(lx, lz) < 0.62) continue;
        const pad = lilyPad(r, i === 0 && r() < 0.8);
        pad.position.set(lx, SURFACE + 0.004, lz);
        g.add(pad);
      }
    } else if (d < 0.2 && f < 0.9 && roll < 0.3) {
      const c = cattails(r, p.floor(cx, cz));
      c.position.set(cx + (r() - 0.5) * 0.4, 0, cz + (r() - 0.5) * 0.4);
      g.add(c);
    } else if (roll < 0.42) {
      const wx = cx + (r() - 0.5) * 0.6, wz = cz + (r() - 0.5) * 0.6;
      const w = weeds(r, p.floor(wx, wz));
      w.position.set(wx, 0, wz);
      g.add(w);
    }
    if (d > 0.35 && r() < 0.16) {
      // a koi circling a deep spot, on a loop that stays in the water
      let rad = 0.5 + r() * 0.7;
      while (rad > 0.25 && [0, 1, 2, 3].some((k) => p.f(cx + Math.cos(k * 1.57) * (rad + 0.15), cz + Math.sin(k * 1.57) * (rad + 0.15)) < 0.65)) rad -= 0.1;
      if (rad <= 0.25) continue;
      const o = koi(r);
      g.add(o);
      fish.push({ o, cx, cz, rad, speed: (0.35 + r() * 0.4) * (r() < 0.5 ? -1 : 1), ph: r() * 6.3, y: SURFACE - 0.035 });
    }
  }
  g.userData.tick = (t: number) => {
    time.value = t;
    for (const k of fish) {
      const a = k.ph + t * k.speed / k.rad;
      const wob = Math.sin(t * 1.3 + k.ph) * 0.12;
      k.o.position.set(k.cx + Math.cos(a) * k.rad * (1 + wob), k.y, k.cz + Math.sin(a) * k.rad);
      k.o.rotation.y = -a + (k.speed < 0 ? Math.PI : 0); // models face +Z
      const tail = k.o.getObjectByName('tail');
      if (tail) tail.rotation.y = Math.sin(t * 12 + k.ph) * 0.5;
    }
  };
  return g;
}
