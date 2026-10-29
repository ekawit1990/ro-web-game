import * as THREE from 'three';
import { outline, shadows, toon } from './toon';

/**
 * Market-town dressing built from code: a two-tier stone fountain with running water, piles of
 * barrels, sacks and fruit baskets beside the stalls, hand carts, clipped hedges, trees in stone
 * planters and a signpost. 1 unit = 1 tile; every group stands on y = 0 at its tile centre.
 */

const hash = (x: number, y: number, k = 0) => {
  let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const M = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  return o;
};
const lathe = (pts: [number, number][], seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// ---------------------------------------------------------------- fountain

const time = { value: 0 };

function poolMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: time },
    vertexShader: /* glsl */ `
      varying vec2 vXZ; varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz; vXZ = position.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vXZ; varying vec3 vWorld;
      void main() {
        float d = length(vXZ);
        // rings spreading out from where the falls land, plus a criss-cross shimmer
        float ring = sin(d * 18.0 - uTime * 4.0) * 0.5 + 0.5;
        vec2 g = vec2(cos(vXZ.x * 9.0 + uTime * 1.6), cos(vXZ.y * 11.0 - uTime * 1.9)) * 0.08 + normalize(vXZ + 1e-4) * (ring - 0.5) * 0.12;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 l = normalize(vec3(-0.35, 1.0, 0.45));
        float spec = pow(max(dot(reflect(-l, n), v), 0.0), 70.0);
        float caus = pow(0.5 + 0.5 * sin(vXZ.x * 14.0 + sin(vXZ.y * 9.0 + uTime) * 2.0) * sin(vXZ.y * 13.0 - uTime * 1.3), 6.0);
        vec3 col = mix(vec3(0.42, 0.82, 0.86), vec3(0.12, 0.45, 0.62), smoothstep(0.0, 1.4, d) * 0.6 + 0.2);
        col += vec3(0.9, 1.0, 1.0) * caus * 0.25 + spec;
        gl_FragColor = vec4(col, 0.8 + spec * 0.2);
        #include <colorspace_fragment>
      }`,
  });
}

function fallMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: time },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main() {
        // thin streaks sliding down, broken up so the sheet never looks solid
        float s = sin(vUv.x * 260.0 + sin(vUv.x * 37.0) * 3.0) * 0.5 + 0.5;
        float flow = fract(vUv.y * 2.5 + uTime * 1.8 + sin(vUv.x * 53.0) * 0.3);
        float a = (0.18 + 0.45 * s * flow) * smoothstep(0.0, 0.12, vUv.y) * (0.6 + 0.4 * smoothstep(1.0, 0.7, vUv.y));
        gl_FragColor = vec4(mix(vec3(0.75, 0.92, 1.0), vec3(1.0), s * 0.6), a);
        #include <colorspace_fragment>
      }`,
  });
}

export function buildFountain(): THREE.Group {
  const g = new THREE.Group();
  const stone = toon('#d6cfbf'), dark = toon('#b9b1a0'), trim = toon('#c9c1af');
  // wide step, then the basin wall with a rounded lip
  g.add(M(new THREE.CylinderGeometry(2.0, 2.05, 0.08, 48), dark, 0, 0.04, 0));
  const basin = M(lathe([[1.62, 0.14], [1.66, 0.48], [1.74, 0.54], [1.86, 0.54], [1.9, 0.48], [1.88, 0.4], [1.92, 0.08], [0, 0.08]].reverse() as [number, number][], 48), stone);
  g.add(basin);
  // carved panels round the outside of the wall
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const p = M(new THREE.BoxGeometry(0.06, 0.3, 0.04), trim, Math.sin(a) * 1.9, 0.27, Math.cos(a) * 1.9);
    p.rotation.y = a;
    g.add(p);
  }
  const pool = M(new THREE.CircleGeometry(1.64, 48), poolMaterial(), 0, 0.42, 0);
  pool.rotation.x = -Math.PI / 2;
  pool.renderOrder = 2;
  g.add(pool);
  // pedestal, lower bowl, upper column, top bowl and finial
  g.add(M(lathe([[0, 0.1], [0.34, 0.1], [0.34, 0.2], [0.24, 0.28], [0.2, 0.6], [0.24, 0.9], [0.3, 1.0], [0, 1.0]], 28), stone));
  g.add(M(lathe([[0, 0.98], [0.3, 1.0], [0.62, 1.14], [0.8, 1.3], [0.84, 1.36], [0.76, 1.36], [0.6, 1.24], [0, 1.2]], 40), stone));
  const pool2 = M(new THREE.CircleGeometry(0.75, 40), poolMaterial(), 0, 1.32, 0);
  pool2.rotation.x = -Math.PI / 2;
  pool2.renderOrder = 2;
  g.add(pool2);
  g.add(M(lathe([[0, 1.25], [0.16, 1.25], [0.12, 1.5], [0.15, 1.7], [0, 1.7]], 20), stone));
  g.add(M(lathe([[0, 1.68], [0.16, 1.7], [0.34, 1.8], [0.4, 1.88], [0.34, 1.88], [0, 1.84]], 28), stone));
  g.add(M(lathe([[0, 1.84], [0.07, 1.86], [0.05, 2.0], [0.09, 2.08], [0, 2.2]], 16), trim));
  // water sheets falling over each bowl's lip, and a little jet from the top
  const fall = fallMaterial();
  const f1 = M(new THREE.CylinderGeometry(0.86, 0.98, 0.94, 48, 1, true), fall, 0, 0.88, 0);
  const f2 = M(new THREE.CylinderGeometry(0.41, 0.5, 0.52, 32, 1, true), fall, 0, 1.6, 0);
  const jet = M(new THREE.CylinderGeometry(0.02, 0.05, 0.3, 8, 1, true), fall, 0, 2.3, 0);
  for (const f of [f1, f2, jet]) f.renderOrder = 3;
  g.add(f1, f2, jet);
  // foam where the falls land
  const foam = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false });
  const r1 = M(new THREE.TorusGeometry(0.98, 0.05, 6, 48), foam, 0, 0.43, 0);
  const r2 = M(new THREE.TorusGeometry(0.5, 0.035, 6, 32), foam, 0, 1.33, 0);
  r1.rotation.x = r2.rotation.x = Math.PI / 2;
  g.add(r1, r2);
  for (const o of [basin]) outline(o, 0.015);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    // casts onto the plaza, but receiving its own shadow streaks the curved stone
    if (m.isMesh && !(m.material as THREE.Material).transparent) m.castShadow = true;
  });
  g.userData.tick = (t: number) => {
    time.value = t;
  };
  return g;
}

// ---------------------------------------------------------------- market goods

const wood = toon('#8a5a32'), woodDark = toon('#5e3b20'), band = toon('#3b3b3b');
const FRUIT = ['#d23c2a', '#f08a24', '#7cb342', '#f2c94c', '#8e3b8f'].map((c) => toon(c));

function barrel(s = 1) {
  const g = new THREE.Group();
  g.add(M(lathe([[0, 0], [0.15, 0], [0.18, 0.12], [0.185, 0.2], [0.18, 0.28], [0.15, 0.4], [0, 0.4]], 16), wood));
  for (const y of [0.07, 0.33]) {
    const b = M(new THREE.TorusGeometry(0.172, 0.012, 4, 16), band, 0, y, 0);
    b.rotation.x = Math.PI / 2;
    g.add(b);
  }
  g.add(M(new THREE.CircleGeometry(0.15, 16).rotateX(-Math.PI / 2), woodDark, 0, 0.401, 0));
  g.scale.setScalar(s);
  return g;
}

function sack(r: () => number) {
  const g = new THREE.Group();
  const cloth = toon(r() < 0.5 ? '#cbb68a' : '#b89f72');
  const body = M(new THREE.SphereGeometry(0.17, 12, 10), cloth, 0, 0.16, 0);
  body.scale.set(1, 1.15, 0.85);
  g.add(body, M(new THREE.ConeGeometry(0.06, 0.12, 8), cloth, 0, 0.38, 0));
  g.rotation.set((r() - 0.5) * 0.3, r() * 6.3, (r() - 0.5) * 0.3);
  return g;
}

function basket(r: () => number) {
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(0.17, 0.13, 0.13, 14), toon('#a8743e'), 0, 0.065, 0));
  g.add(M(new THREE.TorusGeometry(0.165, 0.015, 4, 14).rotateX(Math.PI / 2), toon('#8c5c2c'), 0, 0.13, 0));
  const fruit = FRUIT[Math.floor(r() * FRUIT.length)];
  const ball = new THREE.SphereGeometry(0.045, 8, 6);
  for (let i = 0; i < 11; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.12;
    g.add(M(ball, fruit, Math.cos(a) * d, 0.14 + (0.12 - d) * 0.5 + r() * 0.02, Math.sin(a) * d));
  }
  return g;
}

function crateOf(r: () => number) {
  const g = new THREE.Group();
  g.add(M(new THREE.BoxGeometry(0.36, 0.22, 0.28), wood, 0, 0.11, 0));
  for (const z of [-0.141, 0.141]) g.add(M(new THREE.BoxGeometry(0.37, 0.03, 0.01), woodDark, 0, 0.16, z));
  const veg = FRUIT[Math.floor(r() * FRUIT.length)];
  const ball = new THREE.SphereGeometry(0.05, 8, 6);
  for (let i = 0; i < 9; i++) g.add(M(ball, veg, (r() - 0.5) * 0.26, 0.23 + r() * 0.03, (r() - 0.5) * 0.18));
  g.rotation.y = r() * 0.6 - 0.3;
  return g;
}

/** A small pile of stock: barrels, sacks, crates and baskets of produce. */
export function buildGoods(x: number, y: number) {
  let k = 0;
  const r = () => hash(x, y, k++);
  const g = new THREE.Group();
  const slots: [number, number][] = [[-0.22, -0.2], [0.2, -0.18], [-0.18, 0.22], [0.22, 0.2]];
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const p = r();
    const o = p < 0.28 ? barrel(0.9 + r() * 0.2) : p < 0.52 ? sack(r) : p < 0.78 ? basket(r) : crateOf(r);
    o.position.set(slots[i][0] + (r() - 0.5) * 0.08, 0, slots[i][1] + (r() - 0.5) * 0.08);
    g.add(o);
  }
  shadows(g, true, true);
  return g;
}

// ---------------------------------------------------------------- carts, hedges, planters, signs

function wheel() {
  const g = new THREE.Group();
  const rim = M(new THREE.TorusGeometry(0.3, 0.035, 6, 20), woodDark);
  g.add(rim, M(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10).rotateX(Math.PI / 2), woodDark));
  for (let i = 0; i < 6; i++) {
    const s = M(new THREE.BoxGeometry(0.03, 0.56, 0.03), wood);
    s.rotation.z = (i / 6) * Math.PI;
    g.add(s);
  }
  return g;
}

/** A two-wheeled hand cart loaded with sacks, two tiles long along X. */
export function buildCart(x: number, y: number) {
  let k = 0;
  const r = () => hash(x, y, 50 + k++);
  const g = new THREE.Group();
  g.add(M(new THREE.BoxGeometry(1.2, 0.06, 0.72), wood, 0, 0.42, 0));
  for (const z of [-0.36, 0.36]) g.add(M(new THREE.BoxGeometry(1.2, 0.16, 0.04), wood, 0, 0.53, z));
  for (const x2 of [-0.6, 0.6]) g.add(M(new THREE.BoxGeometry(0.04, 0.16, 0.72), wood, x2, 0.53, 0));
  for (const z of [-0.44, 0.44]) {
    const w = wheel();
    w.position.set(-0.1, 0.3, z);
    g.add(w);
    const h = M(new THREE.BoxGeometry(0.75, 0.04, 0.04), woodDark, 0.95, 0.3, z * 0.7);
    h.rotation.z = 0.32;
    g.add(h);
  }
  g.add(M(new THREE.BoxGeometry(0.04, 0.38, 0.04), woodDark, -0.5, 0.2, 0));
  for (let i = 0; i < 4; i++) {
    const s = sack(r);
    s.position.set(-0.35 + i * 0.24, 0.45, (r() - 0.5) * 0.25);
    g.add(s);
  }
  const b = basket(r);
  b.position.set(0.32, 0.46, 0.15);
  g.add(b);
  g.position.set(0.5, 0, 0); // centred on its two tiles
  g.rotation.y = hash(x, y, 9) < 0.5 ? 0 : Math.PI;
  const root = new THREE.Group();
  root.add(g);
  shadows(root, true, true);
  return root;
}

const leaf = toon('#4f8f3a'), leafLight = toon('#69a84a');

/** A clipped hedge filling a w×h tile strip. */
export function buildHedge(x: number, y: number, w: number, h: number) {
  const g = new THREE.Group();
  const H = 0.55;
  const core = M(new THREE.BoxGeometry(w - 0.08, H, h - 0.08), leaf, w / 2 - 0.5, H / 2, h / 2 - 0.5);
  g.add(core);
  // leafy lumps so the box doesn't read as a box
  const ball = new THREE.IcosahedronGeometry(0.16, 1);
  let k = 0;
  for (let i = 0; i < (w * h) * 14; i++) {
    const r = () => hash(x, y, 100 + k++);
    const side = Math.floor(r() * 5);
    let px = r() * (w - 0.1) - 0.45, pz = r() * (h - 0.1) - 0.45, py = r() * H;
    if (side === 0) py = H;
    else if (side === 1) px = -0.46;
    else if (side === 2) px = w - 0.54;
    else if (side === 3) pz = -0.46;
    else pz = h - 0.54;
    const b = M(ball, r() < 0.4 ? leafLight : leaf, px, Math.min(H, py), pz);
    b.scale.setScalar(0.6 + r() * 0.6);
    g.add(b);
  }
  shadows(g, true, true);
  return g;
}

/** A square stone planter; nature.ts puts a young tree in it. */
export function buildPlanter() {
  const g = new THREE.Group();
  const stone = toon('#bdb4a1');
  g.add(M(new THREE.BoxGeometry(0.86, 0.32, 0.86), stone, 0, 0.16, 0));
  g.add(M(new THREE.BoxGeometry(0.94, 0.06, 0.94), toon('#cfc6b3'), 0, 0.34, 0));
  g.add(M(new THREE.BoxGeometry(0.74, 0.04, 0.74), toon('#5a4330'), 0, 0.36, 0));
  for (let i = 0; i < 6; i++) {
    const b = M(new THREE.IcosahedronGeometry(0.09, 1), i % 2 ? leaf : leafLight, (hash(i, 1) - 0.5) * 0.6, 0.4, (hash(i, 2) - 0.5) * 0.6);
    g.add(b);
  }
  outline(g, 0.012);
  shadows(g, true, true);
  return g;
}

function board(text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#b0804c';
  x.fillRect(0, 0, 256, 64);
  x.strokeStyle = 'rgba(70,40,20,0.35)';
  for (let i = 0; i < 6; i++) {
    x.beginPath();
    x.moveTo(0, 8 + i * 10);
    x.bezierCurveTo(80, 4 + i * 10, 160, 14 + i * 10, 256, 8 + i * 10);
    x.stroke();
  }
  x.fillStyle = '#3a2412';
  x.font = 'bold 30px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A wooden signpost with arrows pointing out of town. */
export function buildSign() {
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(0.05, 0.06, 1.7, 8), woodDark, 0, 0.85, 0));
  // [text, height, which way the arrow points along X]
  const arrows: [string, number, number][] = [['ทุ่งเมโลดี้', 1.45, 1], ['ตลาด', 1.15, -1]];
  for (const [text, y, dir] of arrows) {
    const shape = new THREE.Shape();
    shape.moveTo(-0.45 * dir, -0.1);
    shape.lineTo(0.38 * dir, -0.1);
    shape.lineTo(0.5 * dir, 0);
    shape.lineTo(0.38 * dir, 0.1);
    shape.lineTo(-0.45 * dir, 0.1);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false });
    const face = new THREE.MeshToonMaterial({ map: board(text) });
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * dir + 0.45) / 0.95 * dir + (dir < 0 ? 1 : 0), (uv.getY(i) + 0.1) / 0.2);
    const b = new THREE.Mesh(geo, [face, wood]);
    b.position.set(0.32 * dir, y, 0.06);
    g.add(b);
  }
  shadows(g, true, true);
  return g;
}
