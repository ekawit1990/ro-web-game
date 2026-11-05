import * as THREE from 'three';
import { G, isLava, type GameMap } from '../game/maps';
import { canvasTexture, sparkTexture } from './toon';
import { PHONE } from './device';

/**
 * The lava maps (ภูเขาไฟเมทัล, ปล่องลาวานรก), after the reference picture: molten lava with a moving crust and
 * bubbles that pop, jagged basalt along the shores with a hot glow at their feet, steam rising off the lava, and a
 * big volcano with lava running down its sides, a glowing crater, smoke and flying embers. All purely visual: the
 * lava tiles are blocked on the map.
 */

const time = { value: 0 };

/** Smooth 0..1 "lava-ness" of the map at R samples per tile (0.5 = the shoreline), as a texture. */
function lavaMask(m: GameMap, R: number) {
  const W = m.w * R, H = m.h * R;
  const lava = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.ground[y][x] === G.Water && !onVolcano(m, x, y);
  const data = new Uint8Array(W * H);
  const K = 1.6; // blur radius in tiles
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / R, v = (py + 0.5) / R;
      let s = 0, n = 0;
      for (let j = -2; j <= 2; j++) {
        for (let i = -2; i <= 2; i++) {
          const tx = Math.floor(u + i * 0.5), ty = Math.floor(v + j * 0.5);
          const w = Math.exp(-((i * 0.5) ** 2 + (j * 0.5) ** 2) / K);
          s += (lava(tx, ty) ? 1 : 0) * w;
          n += w;
        }
      }
      data[py * W + px] = Math.round((s / n) * 255);
    }
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RedFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

function onVolcano(m: GameMap, x: number, y: number) {
  return m.objects.some((o) => o.kind === 'volcano' && Math.hypot(x + 0.5 - o.x, y + 0.5 - o.y) <= o.r);
}

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  // distance to the nearest cell edge (crust plates)
  float cellEdge(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash(i + g), hash(i + g + 17.0));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    return d2 - d1;
  }
`;

/** Molten lava colour at a world point: hot rivers between darker crust plates, bubbles popping. */
const LAVA_COLOR = /* glsl */ `
  vec3 lavaColor(vec2 p, float t, float shore) {
    vec2 flow = vec2(t * 0.06, t * 0.035);
    float n = fbm(p * 0.45 + flow);
    float n2 = fbm(p * 1.3 - flow * 1.7 + n);
    // crust plates drifting slowly, molten seams between them
    float e = cellEdge(p * 0.9 + vec2(n * 1.2, n2) + flow * 2.0);
    float seam = 1.0 - smoothstep(0.02, 0.22, e);
    float heat = clamp(n2 * 1.25 - 0.1 + seam * 0.7, 0.0, 1.0);
    vec3 crust = vec3(0.22, 0.05, 0.02);
    vec3 hot = mix(vec3(0.95, 0.22, 0.02), vec3(1.0, 0.62, 0.08), heat);
    hot = mix(hot, vec3(1.0, 0.92, 0.45), pow(heat, 4.0));
    float crusted = smoothstep(0.45, 0.7, n) * (1.0 - seam) * 0.85;
    vec3 col = mix(hot, crust, crusted);
    // bubbles: one per cell, growing then popping with a bright ring
    vec2 bp = p * 1.4;
    vec2 bi = floor(bp);
    float ph = fract(t * (0.25 + hash(bi) * 0.3) + hash(bi + 3.1));
    vec2 bc = bi + 0.25 + 0.5 * vec2(hash(bi + 7.0), hash(bi + 11.0));
    float r = ph * 0.32;
    float d = length(bp - bc);
    float bubble = (1.0 - smoothstep(r - 0.04, r, d)) * step(hash(bi + 5.0), 0.35);
    col = mix(col, vec3(1.0, 0.8, 0.3), bubble * (0.6 - ph * 0.4));
    col += vec3(1.0, 0.7, 0.3) * smoothstep(0.035, 0.0, abs(d - r)) * step(0.85, ph) * step(hash(bi + 5.0), 0.35);
    // cooling, darker crust along the shore
    col = mix(col, crust * 1.4, smoothstep(0.62, 0.5, shore) * 0.85);
    return col;
  }
`;

function lavaMaterial(mask: THREE.Texture | null, size: THREE.Vector2) {
  return new THREE.ShaderMaterial({
    fog: true,
    transparent: true,
    depthWrite: false,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uTime: time, uMask: { value: mask }, uSize: { value: size } },
    vertexShader: /* glsl */ `
      varying vec2 vXZ;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vXZ = world.xz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform sampler2D uMask; uniform vec2 uSize;
      varying vec2 vXZ;
      #include <fog_pars_fragment>
      ${NOISE}
      ${LAVA_COLOR}
      void main() {
        float shore = ${mask ? 'texture2D(uMask, vXZ / uSize).r' : '1.0'};
        if (shore < 0.44) discard;
        vec3 col = lavaColor(vXZ, uTime, shore);
        gl_FragColor = vec4(col, smoothstep(0.44, 0.52, shore));
        #include <fog_fragment>
      }`,
  });
}

/** Jagged basalt: an icosahedron pushed about by noise, pointed upwards. */
function basaltGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const pos = g.attributes.position as THREE.BufferAttribute;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bumps = Array.from({ length: 6 }, () => new THREE.Vector3(rnd() - 0.5, rnd() * 0.8, rnd() - 0.5).normalize());
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    let k = 1;
    for (const b of bumps) k += Math.max(0, n.dot(b) - 0.6) * 1.6;
    v.multiplyScalar(k);
    v.y = v.y > 0 ? v.y * 1.6 : v.y * 0.3;
    pos.setXYZ(i, v.x, v.y + 0.12, v.z);
  }
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

/** Dark rock that glows hot near the bottom (where it meets the lava). */
function basaltMaterial() {
  const m = new THREE.MeshToonMaterial({ color: 0x3a2e2b });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvH = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vH;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.32, 0.04) * smoothstep(0.32, 0.0, vH) * 1.1;');
  };
  return m;
}

// ---------------------------------------------------------------- the volcano

/** Lathe profile: wide foot, concave flanks, a narrow rim and a crater dipping inside it. */
function coneGeometry(R: number, H: number) {
  const pts: THREE.Vector2[] = [];
  const rim = R * 0.2;
  pts.push(new THREE.Vector2(0.0001, H * 0.86)); // crater floor
  pts.push(new THREE.Vector2(rim * 0.7, H * 0.88));
  pts.push(new THREE.Vector2(rim * 0.92, H * 0.98));
  pts.push(new THREE.Vector2(rim, H)); // rim
  for (let i = 1; i <= 14; i++) {
    const t = i / 14;
    const r = rim + (R - rim) * Math.pow(t, 1.7); // concave flank
    pts.push(new THREE.Vector2(r, H * (1 - t) ** 1.25));
  }
  pts.push(new THREE.Vector2(R + 0.6, -0.05));
  pts.reverse(); // the lathe faces outwards when the profile runs from the foot up
  const g = new THREE.LatheGeometry(pts, PHONE ? 40 : 64);
  // rugged: push vertices in and out by a little noise (not the rim's inner lip)
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const a = Math.atan2(v.z, v.x);
    const r = Math.hypot(v.x, v.z);
    if (r < rim * 0.95) continue;
    const k = 1 + (Math.sin(a * 7 + v.y * 0.7) * 0.04 + Math.sin(a * 17 - v.y * 1.3) * 0.025) * Math.min(1, v.y / (H * 0.2) + 0.3);
    pos.setXYZ(i, v.x * k, v.y + Math.sin(a * 11) * 0.15 * (v.y / H), v.z * k);
  }
  g.computeVertexNormals();
  return g;
}

/** Dark rock with layers, and lava streams running down from the rim (also the glow map). */
function coneTextures(seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const W = PHONE ? 512 : 1024, H = PHONE ? 256 : 512;
  const streams: { x: number; w: number; len: number; wob: number }[] = [];
  for (let i = 0; i < 9; i++) streams.push({ x: rnd() * W, w: 6 + rnd() * 14, len: 0.45 + rnd() * 0.55, wob: rnd() * 6 });
  const drawStreams = (c: CanvasRenderingContext2D, glowOnly: boolean) => {
    for (const st of streams) {
      // the lathe's v runs from the crater (0) to the foot (1): streams start at the rim and run down
      for (let pass = 0; pass < (glowOnly ? 2 : 3); pass++) {
        c.beginPath();
        const top = H * 0.06;
        c.moveTo(st.x, top);
        for (let y = top; y < H * st.len; y += 6) {
          const x = st.x + Math.sin(y * 0.03 + st.wob) * 10 + Math.sin(y * 0.11 + st.wob * 2) * 4;
          c.lineTo(x, y);
        }
        const w = st.w * (pass === 0 ? 2.4 : pass === 1 ? 1 : 0.4);
        c.lineWidth = w;
        c.lineCap = 'round';
        c.strokeStyle = pass === 0 ? 'rgba(255,70,0,0.35)' : pass === 1 ? '#ff6a10' : '#ffd35a';
        c.stroke();
      }
    }
    // the rim glows
    const g = c.createLinearGradient(0, 0, 0, H * 0.12);
    g.addColorStop(0, 'rgba(255,120,20,0.95)');
    g.addColorStop(1, 'rgba(255,60,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H * 0.12);
  };
  const map = canvasTexture(W, H, (c) => {
    c.fillStyle = '#2e2422';
    c.fillRect(0, 0, W, H);
    // rock strata and speckle
    for (let y = 0; y < H; y += 3) {
      c.fillStyle = `rgba(${70 + rnd() * 30},${50 + rnd() * 20},${40 + rnd() * 15},${0.15 + rnd() * 0.2})`;
      c.fillRect(0, y, W, 2 + rnd() * 3);
    }
    for (let i = 0; i < W * H / 60; i++) {
      c.fillStyle = rnd() < 0.5 ? 'rgba(15,10,10,0.5)' : 'rgba(110,90,80,0.35)';
      c.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 4, 2 + rnd() * 3);
    }
    drawStreams(c, false);
  });
  map.wrapS = THREE.RepeatWrapping;
  const glow = canvasTexture(W / 2, H / 2, (c) => {
    c.fillStyle = '#000';
    c.fillRect(0, 0, W / 2, H / 2);
    c.scale(0.5, 0.5);
    drawStreams(c, true);
  });
  glow.wrapS = THREE.RepeatWrapping;
  return { map, glow };
}

/** Points that rise, spread and fade: smoke from the crater, steam off the lava. */
function plume(count: number, color: number, size: number, opacity: number, additive: boolean) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(count), 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTex: { value: sparkTexture() }, uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uOpacity: { value: opacity } },
    vertexShader: /* glsl */ `
      attribute float aLife; varying float vLife; uniform float uSize;
      void main() {
        vLife = aLife;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (0.5 + aLife * 1.6) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uTex; uniform vec3 uColor; uniform float uOpacity; varying float vLife;
      void main() {
        float a = texture2D(uTex, gl_PointCoord).a * uOpacity * smoothstep(0.0, 0.15, vLife) * (1.0 - vLife);
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function buildVolcano(x: number, z: number, r: number, seed: number) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const R = r + 1.5;
  const H = r * 1.45;
  const { map, glow } = coneTextures(seed);
  const cone = new THREE.Mesh(coneGeometry(R, H), new THREE.MeshToonMaterial({ map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 1.2 }));
  cone.castShadow = true;
  cone.receiveShadow = true;
  g.add(cone);
  // the crater's lava pool
  const pool = new THREE.Mesh(new THREE.CircleGeometry(R * 0.2 * 0.8, 40), lavaMaterial(null, new THREE.Vector2(1, 1)));
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = H * 0.9;
  g.add(pool);
  // a hot glow over the crater
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), color: 0xff6a20, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.set(R * 1.1, R * 0.7, 1);
  halo.position.y = H * 1.02;
  g.add(halo);
  if (!PHONE) {
    const light = new THREE.PointLight(0xff5a1a, 60, R * 2.6, 1.6);
    light.position.y = H * 1.05;
    g.add(light);
  }
  // smoke, and embers thrown out of the crater
  const smoke = plume(PHONE ? 40 : 70, 0x3a3030, 9, 0.55, false);
  const embers = plume(PHONE ? 40 : 80, 0xff8a2a, 1.6, 1, true);
  g.add(smoke, embers);
  const sm = Array.from({ length: (smoke.geometry.attributes.aLife as THREE.BufferAttribute).count }, (_, i) => ({ t0: i * 0.17, a: i * 2.4, sp: 0.5 + ((i * 37) % 10) / 20 }));
  const em = Array.from({ length: (embers.geometry.attributes.aLife as THREE.BufferAttribute).count }, (_, i) => ({
    t0: (i * 0.137) % 6, a: i * 2.39, out: 1.5 + ((i * 53) % 17) / 4, up: 6 + ((i * 29) % 13) / 2,
  }));
  g.userData.tick = (t: number) => {
    const sp = smoke.geometry.attributes.position as THREE.BufferAttribute;
    const sl = smoke.geometry.attributes.aLife as THREE.BufferAttribute;
    for (let i = 0; i < sm.length; i++) {
      const life = ((t * 0.09 * sm[i].sp + sm[i].t0) % 1 + 1) % 1;
      const drift = life * life * 6;
      sp.setXYZ(i, Math.cos(sm[i].a) * (0.6 + life * 2.5) + drift * 0.8, H + life * 14, Math.sin(sm[i].a) * (0.6 + life * 2.5) + drift * 0.3);
      sl.setX(i, life);
    }
    sp.needsUpdate = sl.needsUpdate = true;
    const ep = embers.geometry.attributes.position as THREE.BufferAttribute;
    const el = embers.geometry.attributes.aLife as THREE.BufferAttribute;
    for (let i = 0; i < em.length; i++) {
      // bursts: each ember flies on a 6 s loop, out and up, then falls back on the flank
      const k = ((t + em[i].t0) % 6) / 6;
      const fly = Math.min(1, k * 2.2);
      const d = em[i].out * fly * 2.2;
      const y = H + em[i].up * fly - 9.8 * 0.5 * (fly * 1.1) ** 2 * 1.4;
      ep.setXYZ(i, Math.cos(em[i].a) * d, Math.max(0.3, y), Math.sin(em[i].a) * d);
      el.setX(i, k < 0.45 ? 0.2 + k : 1);
    }
    ep.needsUpdate = el.needsUpdate = true;
    halo.material.opacity = 0.45 + Math.sin(t * 2.3) * 0.08 + Math.sin(t * 5.1) * 0.04;
  };
  return g;
}

// ---------------------------------------------------------------- the whole lava layer

export function buildLava(m: GameMap): THREE.Group | null {
  if (!isLava(m.theme)) return null;
  const g = new THREE.Group();
  g.name = 'lava';
  const cells: [number, number][] = [];
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.ground[y][x] === G.Water && !onVolcano(m, x, y)) cells.push([x, y]);
  let s = m.w * 977 + m.h;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  if (cells.length) {
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(m.w, m.h), lavaMaterial(lavaMask(m, PHONE ? 3 : 4), new THREE.Vector2(m.w, m.h)));
    surface.rotation.x = -Math.PI / 2;
    surface.position.set(m.w / 2, 0.03, m.h / 2);
    surface.renderOrder = 1;
    g.add(surface);

    // jagged basalt along the shores, glowing where it meets the lava
    const shore = cells.filter(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
      const gr = m.ground[y + dy]?.[x + dx];
      return gr !== undefined && gr !== G.Water;
    }));
    const shapes = [basaltGeometry(11), basaltGeometry(23), basaltGeometry(37)];
    const mat = basaltMaterial();
    const lists: THREE.Matrix4[][] = shapes.map(() => []);
    const q = new THREE.Quaternion();
    for (const [x, y] of shore) {
      if (rnd() > 0.42) continue;
      const sc = 0.5 + rnd() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.3);
      lists[Math.floor(rnd() * shapes.length)].push(new THREE.Matrix4().compose(
        new THREE.Vector3(x + 0.2 + rnd() * 0.6, -0.05, y + 0.2 + rnd() * 0.6), q, new THREE.Vector3(sc, sc * (0.7 + rnd() * 0.8), sc),
      ));
    }
    shapes.forEach((geo, i) => {
      if (!lists[i].length) return;
      const im = new THREE.InstancedMesh(geo, mat, lists[i].length);
      lists[i].forEach((mx, k) => im.setMatrixAt(k, mx));
      im.castShadow = true;
      im.receiveShadow = true;
      g.add(im);
    });

    // steam off the lava
    const steam = plume(PHONE ? 50 : 110, 0xd8c8c0, 3.2, 0.32, false);
    const vents = Array.from({ length: (steam.geometry.attributes.aLife as THREE.BufferAttribute).count }, () => {
      const [x, y] = cells[Math.floor(rnd() * cells.length)];
      return { x: x + rnd(), z: y + rnd(), t0: rnd(), sp: 0.12 + rnd() * 0.1 };
    });
    g.add(steam);
    const prev = g.userData.tick as ((t: number) => void) | undefined;
    g.userData.tick = (t: number) => {
      prev?.(t);
      const sp = steam.geometry.attributes.position as THREE.BufferAttribute;
      const sl = steam.geometry.attributes.aLife as THREE.BufferAttribute;
      for (let i = 0; i < vents.length; i++) {
        const v = vents[i];
        const life = (t * v.sp + v.t0) % 1;
        sp.setXYZ(i, v.x + Math.sin(t * 0.7 + i) * 0.3 * life, 0.1 + life * 3.2, v.z + life * 0.6);
        sl.setX(i, life);
      }
      sp.needsUpdate = sl.needsUpdate = true;
    };
  }

  // the volcanoes
  const volcanoes: THREE.Group[] = [];
  for (const o of m.objects) if (o.kind === 'volcano') volcanoes.push(buildVolcano(o.x, o.y, o.r, Math.round(o.x * 31 + o.y)));
  for (const v of volcanoes) g.add(v);

  // embers drifting over the whole map
  const drift = plume(PHONE ? 60 : 140, 0xff7a2a, 0.9, 0.9, true);
  const motes = Array.from({ length: (drift.geometry.attributes.aLife as THREE.BufferAttribute).count }, () => ({ x: rnd() * m.w, z: rnd() * m.h, t0: rnd(), sp: 0.05 + rnd() * 0.06 }));
  g.add(drift);
  const lavaTick = g.userData.tick as ((t: number) => void) | undefined;
  g.userData.tick = (t: number) => {
    time.value = t;
    lavaTick?.(t); // (the volcanoes tick on their own: the world finds every object with a tick)
    const dp = drift.geometry.attributes.position as THREE.BufferAttribute;
    const dl = drift.geometry.attributes.aLife as THREE.BufferAttribute;
    for (let i = 0; i < motes.length; i++) {
      const k = motes[i];
      const life = (t * k.sp + k.t0) % 1;
      dp.setXYZ(i, k.x + Math.sin(t * 0.5 + i) * 0.8, 0.2 + life * 6, k.z + Math.cos(t * 0.4 + i * 1.3) * 0.8);
      dl.setX(i, life);
    }
    dp.needsUpdate = dl.needsUpdate = true;
  };
  return g;
}

// ---------------------------------------------------------------- the ground

/**
 * Cracked basalt for the lava maps' ground canvas: plates with dark seams, some seams glowing, and a glow map
 * (`glow`, lower resolution) for the hot seams and the lava edges.
 */
export function paintBasalt(c: CanvasRenderingContext2D, m: GameMap, T: number) {
  const W = m.w * T, H = m.h * T;
  const img = c.getImageData(0, 0, W, H);
  const d = img.data;
  const cell = 1.7; // plate size in tiles
  const hash = (x: number, y: number, k: number) => {
    let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const glowAt = (gx: number, gy: number) => hash(gx, gy, 9) < 0.2; // which plate borders run hot
  // jitter of every plate centre, looked up instead of hashed per pixel
  const CW = Math.ceil(m.w / cell) + 3, CH = Math.ceil(m.h / cell) + 3;
  const jx = new Float32Array(CW * CH), jy = new Float32Array(CW * CH), shadeP = new Float32Array(CW * CH);
  for (let j = 0; j < CH; j++) for (let i = 0; i < CW; i++) {
    jx[j * CW + i] = hash(i - 1, j - 1, 1);
    jy[j * CW + i] = hash(i - 1, j - 1, 2);
    shadeP[j * CW + i] = 0.82 + hash(i - 1, j - 1, 3) * 0.3;
  }
  for (let py = 0; py < H; py++) {
    const ty = (py / T) | 0;
    for (let px = 0; px < W; px++) {
      const tx = (px / T) | 0;
      const gr = m.ground[ty][tx];
      if (gr === G.Water) {
        // under the lava surface: dark hot rock, so the lava's soft edge doesn't show orange squares
        const k = (py * W + px) * 4;
        d[k] = 70; d[k + 1] = 26; d[k + 2] = 14;
        continue;
      }
      const u = (px + 0.5) / T / cell, v = (py + 0.5) / T / cell;
      const iu = Math.floor(u), iv = Math.floor(v);
      let d1 = 9, d2 = 9, n1u = 0, n1v = 0, n2u = 0, n2v = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const cu = iu + i, cv = iv + j;
          const ci = (cv + 1) * CW + cu + 1;
          const dx = cu + jx[ci] - u, dy = cv + jy[ci] - v;
          const dd = dx * dx + dy * dy;
          if (dd < d1) { d2 = d1; n2u = n1u; n2v = n1v; d1 = dd; n1u = cu; n1v = cv; } else if (dd < d2) { d2 = dd; n2u = cu; n2v = cv; }
        }
      }
      const edge = Math.sqrt(d2) - Math.sqrt(d1);
      const k = (py * W + px) * 4;
      // each plate a little lighter or darker, a lit top edge
      const plate = shadeP[(n1v + 1) * CW + n1u + 1];
      let r = d[k] * plate, g = d[k + 1] * plate, b = d[k + 2] * plate;
      const seamW = gr === G.Dirt ? 0.025 : 0.045;
      if (edge < seamW) {
        const hot = glowAt(Math.min(n1u, n2u) * 7 + Math.max(n1u, n2u), Math.min(n1v, n2v) * 7 + Math.max(n1v, n2v)) && gr !== G.Dirt;
        const t = 1 - edge / seamW;
        if (hot) {
          r = r + (255 - r) * t;
          g = g + (120 + 80 * t - g) * t;
          b = b * (1 - t) + 20 * t;
        } else {
          r *= 1 - 0.6 * t; g *= 1 - 0.6 * t; b *= 1 - 0.6 * t;
        }
      } else if (edge < seamW * 2.2) {
        const t = (edge - seamW) / (seamW * 1.2);
        r *= 1.12 - 0.12 * t; g *= 1.1 - 0.1 * t; b *= 1.08 - 0.08 * t;
      }
      d[k] = Math.min(255, r);
      d[k + 1] = Math.min(255, g);
      d[k + 2] = Math.min(255, b);
    }
  }
  c.putImageData(img, 0, 0);

  // glow map at 8 px per tile: hot seams (blurred) and the lava's edge
  const S = 8;
  return canvasTexture(m.w * S, m.h * S, (gc) => {
    gc.fillStyle = '#000';
    gc.fillRect(0, 0, m.w * S, m.h * S);
    gc.drawImage(c.canvas, 0, 0, m.w * S, m.h * S);
    const gi = gc.getImageData(0, 0, m.w * S, m.h * S);
    const gd = gi.data;
    for (let i = 0; i < gd.length; i += 4) {
      // keep only the bright orange: seams and lava
      const hot = gd[i] > 180 && gd[i + 1] > 70 && gd[i + 2] < 90 ? 1 : 0;
      gd[i] *= hot; gd[i + 1] *= hot * 0.8; gd[i + 2] *= hot * 0.4;
    }
    gc.putImageData(gi, 0, 0);
    gc.fillStyle = 'rgba(255,90,10,0.35)'; // the lava glows softly onto its shore
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        if (m.ground[y][x] !== G.Water) continue;
        gc.beginPath();
        gc.arc((x + 0.5) * S, (y + 0.5) * S, S * 0.9, 0, Math.PI * 2);
        gc.fill();
      }
    }
    gc.filter = 'blur(4px)';
    gc.globalCompositeOperation = 'lighter';
    gc.drawImage(gc.canvas, 0, 0);
    gc.filter = 'none';
  });
}
