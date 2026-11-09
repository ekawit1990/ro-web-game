import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture, glyphTexture } from './toon';
import type { XSlashCtx } from './xslash';

/**
 * The bassist's skills in neon green and cyan, after the user's two reference pictures (2026-11-09): neon floors
 * of concentric rings with a five-line staff, staff ribbons circling, LED equalizer bars, thin pillars and beams
 * of light, a dome of light for Kick Drum, glowing notes and clefs, twinkling stars (the "neon set" below).
 * The first green set (also here, partly still used): Emerald magic circles with a speaker
 * cone in the middle, four bass strings and bass clefs round the rim; jade crystal spikes bursting out of the
 * ground, green shock rings that thump like a bass drop, equalizer bars, cracks glowing green, leaves for the
 * regen buff, a hex shield for Kick Drum and mirror shards for จังหวะยก. Same building blocks as the guitarist's
 * red set (guitarfx.ts) and the keyboardist's blue set (keyfx.ts). Dark green layers use normal blending so they
 * read on light ground; the glow is additive.
 */

const Q = PHONE ? 0.5 : 1;
const TEX = PHONE ? 256 : 512;

/** Palette: neon green and cyan (the user's reference pictures, 2026-11-09). */
export const BS = { deep: 0x04502a, jade: 0x0fa35a, green: 0x22e070, lime: 0xa8ff5a, mint: 0xe4ffe9, gold: 0xf0ff9a, cyan: 0x40e8ff, aqua: 0x20ffd0 };

let circleTex: THREE.Texture | undefined;
let shockTex: THREE.Texture | undefined;
let rayTex: THREE.Texture | undefined;
let crackTex: THREE.Texture | undefined;
let bladeTex: THREE.Texture | undefined;
let puffTex: THREE.Texture | undefined;
let leafTex: THREE.Texture | undefined;
let hexTex: THREE.Texture | undefined;
let plusTex: THREE.Texture | undefined;
let spikeGeo: THREE.BufferGeometry | undefined;
let rockGeo: THREE.BufferGeometry | undefined;
let rockMat: THREE.Material | undefined;
let shardGeo: THREE.BufferGeometry | undefined;
const arcGeos = new Map<string, THREE.BufferGeometry>();

const noteTex = (g: string) => glyphTexture(g, '#d8ffe0', 'rgba(0,80,30,0.95)');
const NOTES = ['♪', '♫', '♬', '♩'];

/** A bass clef (the curl and its two dots) centred on 0,0, about 60 px tall. */
function bassClef(c: CanvasRenderingContext2D, w: number) {
  c.lineWidth = w;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(-6, -10, 6, Math.PI, Math.PI * 2.2);
  c.moveTo(-12, -10);
  c.bezierCurveTo(-12, -30, 20, -32, 18, -6);
  c.bezierCurveTo(16, 14, -4, 26, -18, 30);
  c.stroke();
  c.beginPath();
  c.arc(-12, -10, 4 + w * 0.3, 0, Math.PI * 2);
  c.fill();
  for (const y of [-16, 0]) {
    c.beginPath();
    c.arc(28, y, 3.5 + w * 0.3, 0, Math.PI * 2);
    c.fill();
  }
}

/** The emerald magic circle: a speaker cone in the middle, a hexagram, four bass strings with frets, bass clefs. */
function circle() {
  return (circleTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 248);
    g.addColorStop(0, 'rgba(170,255,140,0.55)');
    g.addColorStop(0.5, 'rgba(20,200,90,0.2)');
    g.addColorStop(0.95, 'rgba(0,120,50,0.45)');
    g.addColorStop(1, 'rgba(0,120,50,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 248, 0, Math.PI * 2);
    c.fill();
    const draw = (col: string, extra: number) => {
      c.strokeStyle = col;
      c.fillStyle = col;
      const ring = (r: number, w: number) => {
        c.lineWidth = w + extra;
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.stroke();
      };
      ring(242, 6);
      ring(232, 2);
      // the four bass strings and their frets
      for (const r of [218, 208, 198, 188]) ring(r, r === 218 ? 3 : 1.6);
      c.lineWidth = 2 + extra;
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * 184, Math.sin(a) * 184);
        c.lineTo(Math.cos(a) * 222, Math.sin(a) * 222);
        c.stroke();
      }
      ring(178, 4);
      // hexagram
      c.lineWidth = 3.5 + extra;
      for (const r0 of [0, Math.PI / 3]) {
        c.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = r0 - Math.PI / 2 + (i / 3) * Math.PI * 2;
          if (i) c.lineTo(Math.cos(a) * 176, Math.sin(a) * 176);
          else c.moveTo(Math.cos(a) * 176, Math.sin(a) * 176);
        }
        c.stroke();
      }
      ring(118, 3);
      // the speaker cone: rings getting closer towards the dust cap, with a cross of ribs
      ring(96, 5);
      ring(82, 1.5);
      ring(68, 1.5);
      ring(54, 1.5);
      ring(36, 6);
      c.beginPath();
      c.arc(0, 0, 22 + extra / 2, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 2 + extra;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(Math.cos(a) * 36, Math.sin(a) * 36);
        c.lineTo(Math.cos(a) * 96, Math.sin(a) * 96);
        c.stroke();
      }
      // bass clefs in the hexagram's points
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2 + Math.PI / 6;
        c.save();
        c.translate(Math.cos(a) * 146, Math.sin(a) * 146);
        c.rotate(a + Math.PI / 2);
        c.scale(0.55, 0.55);
        bassClef(c, 6 + extra * 1.5);
        c.restore();
      }
    };
    c.shadowColor = '#00c050';
    c.shadowBlur = 16;
    draw('rgba(0,60,25,0.92)', 5);
    c.shadowBlur = 7;
    c.shadowColor = '#b0ff90';
    draw('#eaffea', 0);
  }));
}

function shock() {
  return (shockTex ??= canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(40,220,100,0)');
    g.addColorStop(0.6, 'rgba(40,220,100,0)');
    g.addColorStop(0.84, 'rgba(60,240,110,0.85)');
    g.addColorStop(0.93, 'rgba(235,255,225,1)');
    g.addColorStop(1, 'rgba(235,255,225,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  }));
}

function ray() {
  return (rayTex ??= canvasTexture(16, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 16, 128);
    c.globalCompositeOperation = 'destination-in';
    const f = c.createLinearGradient(0, 128, 0, 0);
    f.addColorStop(0, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = f;
    c.fillRect(0, 0, 16, 128);
  }));
}

/** Glowing green cracks radiating from the middle. */
function cracks() {
  return (crackTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      let px = x;
      let py = y;
      const steps = 6;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(px, py);
      for (let i = 0; i < steps; i++) {
        a += (Math.random() - 0.5) * 0.7;
        px += Math.cos(a) * (len / steps);
        py += Math.sin(a) * (len / steps);
        c.lineTo(px, py);
        if (depth > 0 && Math.random() < 0.3) {
          c.stroke();
          branch(px, py, a + (Math.random() < 0.5 ? 0.7 : -0.7), len * 0.45, w * 0.6, depth - 1);
          c.lineWidth = w;
          c.beginPath();
          c.moveTo(px, py);
        }
      }
      c.stroke();
    };
    const all = (col: string, blur: number, wk: number) => {
      c.strokeStyle = col;
      c.shadowColor = '#30ff80';
      c.shadowBlur = blur;
      const rnd = Math.random;
      let seed = 7;
      Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 11; i++) branch(0, 0, (i / 11) * Math.PI * 2, 200 + (i % 3) * 30, 9 * wk, 2);
      Math.random = rnd;
    };
    all('rgba(0,60,20,0.95)', 0, 1.6);
    all('#40ff90', 14, 0.8);
    all('#f0fff0', 4, 0.3);
  }));
}

/** Across the chop: deep green rim -> green -> lime -> white edge, fading at the tips. */
function blade() {
  return (bladeTex ??= canvasTexture(256, 64, (c) => {
    const g = c.createLinearGradient(0, 64, 0, 0);
    g.addColorStop(0, 'rgba(0,70,30,0)');
    g.addColorStop(0.15, 'rgba(0,90,35,0.9)');
    g.addColorStop(0.45, 'rgba(20,210,90,1)');
    g.addColorStop(0.75, 'rgba(170,255,120,1)');
    g.addColorStop(0.92, 'rgba(255,255,240,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 64);
    c.globalCompositeOperation = 'destination-in';
    const f = c.createLinearGradient(0, 0, 256, 0);
    f.addColorStop(0, 'rgba(0,0,0,0)');
    f.addColorStop(0.35, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = f;
    c.fillRect(0, 0, 256, 64);
  }));
}

function puff() {
  return (puffTex ??= canvasTexture(64, 64, (c) => {
    for (const [x, y, r] of [[32, 34, 22], [22, 28, 14], [42, 26, 15], [30, 20, 12], [44, 40, 12]]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }));
}

/** A glowing green leaf (ลูกส่ง: regen). */
function leaf() {
  return (leafTex ??= canvasTexture(64, 64, (c) => {
    c.translate(32, 32);
    c.rotate(-0.6);
    c.shadowColor = '#40ff80';
    c.shadowBlur = 8;
    const g = c.createLinearGradient(0, -26, 0, 26);
    g.addColorStop(0, '#eaffd0');
    g.addColorStop(0.5, '#5af07a');
    g.addColorStop(1, '#0a8a40');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, -26);
    c.bezierCurveTo(18, -14, 18, 14, 0, 26);
    c.bezierCurveTo(-18, 14, -18, -14, 0, -26);
    c.fill();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(240,255,230,0.9)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -22);
    c.lineTo(0, 24);
    c.stroke();
  }));
}

/** A honeycomb of hexes fading to the edges (Kick Drum: the shield). */
function hex() {
  return (hexTex ??= canvasTexture(256, 256, (c) => {
    c.strokeStyle = 'rgba(200,255,210,1)';
    c.shadowColor = '#40ff90';
    c.shadowBlur = 6;
    c.lineWidth = 3;
    const r = 22;
    const w = Math.sqrt(3) * r;
    for (let row = -1; row < 9; row++) {
      for (let col = -1; col < 8; col++) {
        const cx = col * w + (row % 2 ? w / 2 : 0);
        const cy = row * r * 1.5;
        c.beginPath();
        for (let i = 0; i <= 6; i++) {
          const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
          if (i) c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          else c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        }
        c.stroke();
      }
    }
  }));
}

/** A plus sign (regen). */
function plus() {
  return (plusTex ??= canvasTexture(64, 64, (c) => {
    c.shadowColor = '#40ff80';
    c.shadowBlur = 10;
    c.fillStyle = '#f0fff0';
    c.fillRect(26, 10, 12, 44);
    c.fillRect(10, 26, 44, 12);
  }));
}

/** A crescent strip (u along, v across) of `arc` radians at radius r, thickest at the leading end. */
function arcGeometry(r: number, w: number, arc: number) {
  const key = `${r}_${w}_${arc}`;
  const old = arcGeos.get(key);
  if (old) return old;
  const n = PHONE ? 16 : 32;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const th = -arc / 2 + u * arc;
    const ww = w * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.4 + 0.6 * u);
    for (const [rr, v] of [[r + ww / 2, 1], [r - ww / 2, 0]] as const) {
      pos.push(Math.cos(th) * rr, Math.sin(th) * rr, 0);
      uv.push(u, v);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  arcGeos.set(key, g);
  return g;
}

function groundPlane(tex: THREE.Texture, size: number, additive = false) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

function sprite(ctx: XSlashCtx, tex: THREE.Texture, color: number, additive: boolean) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
  ctx.scene.add(s);
  return s;
}

/** Remove from the scene and free materials (and geometries made just for this object). */
function dispose(ctx: XSlashCtx, ...objs: THREE.Object3D[]) {
  for (const o of objs) {
    ctx.scene.remove(o);
    o.traverse((x) => {
      const mesh = x as THREE.Mesh;
      const mat = mesh.material as THREE.Material | undefined;
      if (mat && mat !== rockMat) mat.dispose();
      const geo = mesh.geometry as THREE.BufferGeometry | undefined;
      if (geo && geo !== spikeGeo && geo !== rockGeo && geo !== shardGeo && !(mesh as unknown as THREE.Sprite).isSprite && ![...arcGeos.values()].includes(geo)) geo.dispose();
    });
  }
}

/** Run `f(t)` every frame for `sec` seconds after `delay`. */
function anim(ctx: XSlashCtx, sec: number, delay: number, f: (t: number, k: number, dt: number) => void, end: () => void) {
  let t = -delay;
  ctx.add((dt) => {
    t += dt;
    if (t < 0) return true;
    const k = Math.min(1, t / sec);
    f(t, k, dt);
    if (k >= 1) {
      end();
      return false;
    }
    return true;
  });
}

// ------------------------------------------------------------------ building blocks

/** The emerald circle: snaps open, turns, a soft additive copy thumps on top like a speaker. */
export function greenCircle(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0, beat = 0.5) {
  const m = groundPlane(circle(), r * 2);
  const glow = groundPlane(circle(), r * 2, true);
  m.position.set(x, 0.05, z);
  glow.position.set(x, 0.06, z);
  m.visible = glow.visible = false;
  ctx.scene.add(m, glow);
  const mat = m.material as THREE.MeshBasicMaterial;
  const gmat = glow.material as THREE.MeshBasicMaterial;
  gmat.color.set(BS.lime);
  anim(ctx, sec, delay, (t) => {
    m.visible = glow.visible = true;
    const k = Math.min(1, t / 0.2);
    const fade = Math.min(1, (sec - t) / 0.4);
    const thump = Math.exp(-((t % beat) / beat) * 6);
    m.scale.setScalar((0.4 + 0.6 * (1 - Math.pow(1 - k, 3))) * (1 + thump * 0.04));
    glow.scale.copy(m.scale).multiplyScalar(1.02);
    m.rotation.z = t * 0.7;
    glow.rotation.z = -t * 0.5;
    mat.opacity = Math.max(0, fade);
    gmat.opacity = Math.max(0, (0.25 + 0.4 * thump) * fade);
  }, () => dispose(ctx, m, glow));
}

export function greenShock(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0) {
  const m = groundPlane(shock(), 2, true);
  const solid = groundPlane(shock(), 2);
  m.position.set(x, 0.09, z);
  solid.position.set(x, 0.08, z);
  m.visible = solid.visible = false;
  ctx.scene.add(m, solid);
  const mat = m.material as THREE.MeshBasicMaterial;
  const smat = solid.material as THREE.MeshBasicMaterial;
  smat.color.set(0x007a30);
  anim(ctx, sec, delay, (_t, k) => {
    m.visible = solid.visible = true;
    m.scale.setScalar(0.2 + r * (1 - Math.pow(1 - k, 2.5)));
    solid.scale.copy(m.scale).multiplyScalar(1.03);
    mat.opacity = 1 - k;
    smat.opacity = 0.8 * (1 - k);
  }, () => dispose(ctx, m, solid));
}

function groundCracks(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0) {
  const m = groundPlane(cracks(), r * 2);
  const glow = groundPlane(cracks(), r * 2, true);
  m.position.set(x, 0.07, z);
  glow.position.set(x, 0.08, z);
  m.rotation.z = glow.rotation.z = Math.random() * 6;
  m.visible = glow.visible = false;
  ctx.scene.add(m, glow);
  const mat = m.material as THREE.MeshBasicMaterial;
  const gmat = glow.material as THREE.MeshBasicMaterial;
  anim(ctx, sec, delay, (t) => {
    m.visible = glow.visible = true;
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.15), 3);
    m.scale.setScalar(0.3 + 0.7 * grow);
    glow.scale.copy(m.scale);
    mat.opacity = Math.min(1, (sec - t) / 0.5);
    gmat.opacity = Math.max(0, 0.9 * (1 - t / (sec * 0.7)));
  }, () => dispose(ctx, m, glow));
}

/**
 * Jade crystal spikes bursting out of the ground in a ring of radius r round (x,z) (r = 0: a cluster), leaning
 * outwards, with a glowing copy on each; they shoot up, hold, then sink back.
 */
function jadeSpikes(ctx: XSlashCtx, x: number, z: number, r: number, n: number, height: number, sec: number, delay = 0) {
  spikeGeo ??= new THREE.ConeGeometry(0.5, 1, 5, 1).translate(0, 0.5, 0);
  const count = Math.max(3, Math.round(n * Q));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const rr = r > 0 ? r * (0.85 + Math.random() * 0.3) : Math.random() * 0.6;
    const g = new THREE.Group();
    const solid = new THREE.Mesh(spikeGeo, new THREE.MeshLambertMaterial({ color: 0x1fbf6a, emissive: 0x0a7a3a, flatShading: true, transparent: true }));
    const glow = new THREE.Mesh(spikeGeo, new THREE.MeshBasicMaterial({ color: BS.lime, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.12);
    g.add(solid, glow);
    g.position.set(x + Math.cos(a) * rr, 0, z + Math.sin(a) * rr);
    const lean = r > 0 ? 0.25 + Math.random() * 0.3 : 0.15 + Math.random() * 0.45;
    // lean away from the middle
    g.rotation.order = 'YXZ';
    g.rotation.set(0, -a, 0);
    g.rotateZ(-lean);
    const h = height * (0.6 + Math.random() * 0.6);
    const w = h * (0.22 + Math.random() * 0.1);
    g.visible = false;
    ctx.scene.add(g);
    const d = delay + Math.random() * 0.08;
    anim(ctx, sec, d, (t, k) => {
      g.visible = true;
      const up = Math.min(1, t / 0.12);
      const down = k > 0.7 ? (k - 0.7) / 0.3 : 0;
      g.scale.set(w, h * (1 - Math.pow(1 - up, 3)) * (1 - down), w);
      g.position.y = -down * h * 0.3;
      (glow.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      (solid.material as THREE.MeshLambertMaterial).opacity = 1 - down;
    }, () => dispose(ctx, g));
  }
}

function rays(ctx: XSlashCtx, at: THREE.Vector3, n: number, len: number) {
  const count = Math.max(4, Math.round(n * Q));
  for (let i = 0; i < count; i++) {
    const s = i % 3 === 1 ? sprite(ctx, ray(), 0x006a28, false) : sprite(ctx, ray(), i % 3 ? BS.green : BS.mint, true);
    s.center.set(0.5, 0);
    s.position.copy(at);
    s.material.depthTest = false;
    s.material.rotation = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    s.renderOrder = 11;
    const l = len * (0.5 + Math.random() * 0.7);
    anim(ctx, 0.45, 0, (_t, k) => {
      s.scale.set(0.18 * (1 - k * 0.5), l * Math.min(1, k * 4), 1);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

function flash(ctx: XSlashCtx, at: THREE.Vector3, size: number, color: number, sec: number, tex: THREE.Texture) {
  const s = sprite(ctx, tex, color, true);
  s.material.depthTest = false;
  s.renderOrder = 9;
  s.position.copy(at);
  anim(ctx, sec, 0, (_t, k) => {
    s.scale.setScalar(size * (0.5 + k * 0.8));
    s.material.opacity = 1 - k;
  }, () => dispose(ctx, s));
}

function rocks(ctx: XSlashCtx, x: number, z: number, n: number, power: number) {
  rockGeo ??= new THREE.DodecahedronGeometry(1, 0);
  rockMat ??= new THREE.MeshLambertMaterial({ color: 0x3a4a30, emissive: 0x0a3a14, flatShading: true });
  const list = Array.from({ length: Math.max(2, Math.round(n * Q)) }, () => {
    const m = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.07 + Math.random() * 0.17;
    m.scale.set(s, s * (0.7 + Math.random() * 0.6), s * (0.8 + Math.random() * 0.5));
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.5 + Math.random());
    m.position.set(x + Math.cos(a) * 0.3, 0.1, z + Math.sin(a) * 0.3);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    ctx.scene.add(m);
    return { m, s: m.scale.clone(), v: new THREE.Vector3(Math.cos(a) * sp, 3.5 + Math.random() * 4 * (power / 4), Math.sin(a) * sp), spin: (Math.random() - 0.5) * 18 };
  });
  const life = 1.3;
  anim(ctx, life, 0, (t, _k, dt) => {
    for (const r of list) {
      r.v.y -= 16 * dt;
      r.m.position.addScaledVector(r.v, dt);
      if (r.m.position.y < 0.05) {
        r.m.position.y = 0.05;
        r.v.y = Math.abs(r.v.y) * 0.3;
        r.v.x *= 0.5;
        r.v.z *= 0.5;
      }
      r.m.rotation.x += r.spin * dt;
      r.m.rotation.z += r.spin * 0.6 * dt;
      r.m.scale.copy(r.s).multiplyScalar(Math.max(0, Math.min(1, (life - t) / 0.3)));
    }
  }, () => list.forEach((r) => ctx.scene.remove(r.m)));
}

/** Dust rolling out from an impact. */
function dust(ctx: XSlashCtx, x: number, z: number, n: number, spread: number, delay = 0) {
  for (let i = 0; i < Math.max(2, Math.round(n * Q)); i++) {
    const s = sprite(ctx, puff(), i % 2 ? 0x3a5a3a : 0xa0c090, false);
    const a = Math.random() * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a), 0.3, Math.sin(a)).multiplyScalar(spread * (0.5 + Math.random() * 0.6));
    s.position.set(x + Math.cos(a) * 0.4, 0.3, z + Math.sin(a) * 0.4);
    s.material.rotation = Math.random() * 6;
    s.visible = false;
    const size = 0.8 + Math.random() * 0.8;
    anim(ctx, 0.9 + Math.random() * 0.5, delay, (_t, k, dt) => {
      s.visible = true;
      s.position.addScaledVector(v, dt * (1 - k));
      s.scale.setScalar(size * (0.6 + k * 1.4));
      s.material.opacity = 0.55 * (1 - k);
    }, () => dispose(ctx, s));
  }
}

/** Green motes drifting up and fading. */
function motes(ctx: XSlashCtx, x: number, z: number, spread: number, n: number, glowTex: THREE.Texture, delay = 0, rise = 1) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = sprite(ctx, glowTex, Math.random() < 0.5 ? BS.green : BS.lime, true);
    const a = Math.random() * Math.PI * 2;
    const rr = Math.random() * spread;
    s.position.set(x + Math.cos(a) * rr, 0.15 + Math.random() * 0.5, z + Math.sin(a) * rr);
    s.visible = false;
    const v = new THREE.Vector3(Math.cos(a) * 0.5, (1.4 + Math.random() * 2.2) * rise, Math.sin(a) * 0.5);
    const size = 0.1 + Math.random() * 0.16;
    anim(ctx, 0.9 + Math.random() * 0.9, delay + Math.random() * 0.25, (t, k, dt) => {
      s.visible = true;
      s.position.addScaledVector(v, dt);
      s.position.x += Math.sin(t * 9 + i) * 0.006;
      s.scale.setScalar(size * (1 - k * 0.5));
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

/** A column of green light rising out of the ground. */
function lightPillar(ctx: XSlashCtx, x: number, z: number, r: number, height: number, sec: number, delay = 0) {
  const mk = (color: number, rr: number, add: boolean) =>
    new THREE.Mesh(
      new THREE.CylinderGeometry(rr, rr * 1.2, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: ray(), color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }),
    );
  const outer = mk(0x007a30, r * 1.15, false);
  const inner = mk(BS.green, r, true);
  const core = mk(BS.mint, r * 0.45, true);
  const g = new THREE.Group();
  g.add(outer, inner, core);
  g.position.set(x, 0, z);
  g.visible = false;
  ctx.scene.add(g);
  anim(ctx, sec, delay, (t, k) => {
    g.visible = true;
    const h = Math.max(0.01, Math.min(1, t / 0.18) * height);
    for (const m of [outer, inner, core]) {
      m.scale.set(1 - k * 0.4, h, 1 - k * 0.4);
      m.position.y = h / 2;
      (m.material as THREE.MeshBasicMaterial).opacity = (m === outer ? 0.35 : 0.9) * (1 - k);
    }
    g.rotation.y = t * 3;
  }, () => dispose(ctx, g));
}

/** Equalizer bars rising and bouncing round a circle of radius r (the bass line, made visible). */
function eqBars(ctx: XSlashCtx, x: number, z: number, r: number, n: number, height: number, sec: number, delay = 0) {
  const count = Math.max(8, Math.round(n * Q));
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const s = sprite(ctx, ray(), i % 2 ? BS.green : BS.lime, true);
    const dark = sprite(ctx, ray(), 0x00602a, false);
    for (const q of [s, dark]) {
      q.center.set(0.5, 0);
      q.position.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
      q.visible = false;
    }
    const ph = Math.random() * 6;
    const sp = 9 + Math.random() * 6;
    anim(ctx, sec, delay, (t, k) => {
      s.visible = dark.visible = true;
      const bounce = 0.35 + 0.65 * Math.abs(Math.sin(t * sp + ph));
      const h = height * bounce * Math.min(1, t / 0.15) * (1 - Math.pow(k, 3));
      s.scale.set(0.3, Math.max(0.01, h), 1);
      dark.scale.set(0.42, Math.max(0.01, h * 1.05), 1);
      s.material.opacity = 1 - k * 0.7;
      dark.material.opacity = 0.45 * (1 - k);
    }, () => dispose(ctx, s, dark));
  }
}

/** Notes shooting up in a ring and fading. */
function risingNotes(ctx: XSlashCtx, x: number, z: number, r: number, n: number, delay = 0) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex(NOTES[i % 4]), transparent: true, depthWrite: false }));
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const rr = r * (0.6 + Math.random() * 0.5);
    s.visible = false;
    ctx.scene.add(s);
    anim(ctx, 1.1 + Math.random() * 0.4, delay + Math.random() * 0.2, (_t, k) => {
      s.visible = true;
      s.position.set(x + Math.cos(a + k * 1.5) * rr, 0.4 + k * 2.4, z + Math.sin(a + k * 1.5) * rr);
      s.scale.setScalar(0.5 * (1 - k * 0.3));
      s.material.opacity = Math.min(1, (1 - k) * 2.5);
    }, () => dispose(ctx, s));
  }
}

/** Sparks pulled in from all round to a point (power gathering). */
function gather(ctx: XSlashCtx, at: THREE.Vector3, n: number, r: number, sec: number, glowTex: THREE.Texture) {
  for (let i = 0; i < Math.max(4, Math.round(n * Q)); i++) {
    const s = sprite(ctx, glowTex, i % 2 ? BS.lime : BS.mint, true);
    const a = Math.random() * Math.PI * 2;
    const el = (Math.random() - 0.2) * 1.2;
    const from = new THREE.Vector3(Math.cos(a) * r, el * r * 0.6 + 0.5, Math.sin(a) * r);
    const d = Math.random() * sec * 0.4;
    s.visible = false;
    anim(ctx, sec - d, d, (_t, k) => {
      s.visible = true;
      const e = k * k;
      s.position.set(at.x + from.x * (1 - e), at.y + (from.y - at.y) * (1 - e), at.z + from.z * (1 - e));
      s.scale.setScalar(0.18 + e * 0.1);
      s.material.opacity = Math.min(1, k * 3);
    }, () => dispose(ctx, s));
  }
}

/**
 * A giant green crescent chopping straight down onto `at` (the bass coming down like an axe), facing the camera.
 */
function fallingChop(ctx: XSlashCtx, at: THREE.Vector3, r: number, w: number, tilt: number, sec: number, color: number) {
  const geo = arcGeometry(r, w, Math.PI * 0.8);
  const solid = new THREE.MeshBasicMaterial({ map: blade(), transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const add = new THREE.MeshBasicMaterial({ map: blade(), color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  for (const m of [solid, add]) {
    const mesh = new THREE.Mesh(geo, m);
    mesh.renderOrder = 10;
    spin.add(mesh);
  }
  g.position.copy(at);
  ctx.scene.add(g);
  anim(ctx, sec, 0, (_t, k) => {
    g.quaternion.copy(ctx.camera.quaternion);
    g.rotateZ(tilt);
    const swing = Math.min(1, k / 0.3);
    spin.position.set(0, r, 0);
    spin.rotation.z = Math.PI * 0.25 - (1 - Math.pow(1 - swing, 3)) * Math.PI * 1.15;
    const out = Math.max(0, (k - 0.4) / 0.6);
    spin.scale.setScalar(1 + out * 0.15);
    solid.opacity = 1 - out;
    add.opacity = 0.75 * (1 - out);
  }, () => dispose(ctx, g));
}

// ------------------------------------------------------------------ neon set (after the user's reference pictures)

let floorTex: THREE.Texture | undefined;
let staffTex: THREE.Texture | undefined;
let twinkleTex: THREE.Texture | undefined;
let ledTex: THREE.Texture | undefined;
let domeTex: THREE.Texture | undefined;
let swirlTex: THREE.Texture | undefined;
const neonNotes = new Map<string, THREE.Texture>();

/** A treble clef drawn with paths (no 𝄞 glyph: Android phones have no font for it), about 100 px tall, centred. */
function trebleClef(c: CanvasRenderingContext2D) {
  c.beginPath();
  c.moveTo(4, 48);
  c.bezierCurveTo(-14, 52, -14, 30, 2, 30);
  c.moveTo(2, 30);
  c.lineTo(-6, -46);
  c.bezierCurveTo(-8, -62, 14, -60, 10, -42);
  c.bezierCurveTo(6, -24, -26, -8, -24, 14);
  c.bezierCurveTo(-22, 34, 22, 34, 22, 12);
  c.bezierCurveTo(22, -6, -4, -8, -6, 8);
  c.bezierCurveTo(-7, 18, 4, 22, 8, 16);
  c.stroke();
}

/** A glowing neon note / clef: white core, coloured glow. `g` is a glyph, or 'treble' / 'bass'. */
function neonNote(g: string, glow: string) {
  const key = g + glow;
  const old = neonNotes.get(key);
  if (old) return old;
  const t = canvasTexture(128, 128, (c) => {
    c.translate(64, 64);
    const draw = () => {
      if (g === 'treble') {
        c.scale(0.85, 0.85);
        trebleClef(c);
        c.setTransform(1, 0, 0, 1, 64, 64);
      } else if (g === 'bass') {
        c.scale(1.3, 1.3);
        bassClef(c, 7);
        c.setTransform(1, 0, 0, 1, 64, 64);
      } else c.fillText(g, 0, 6);
    };
    c.font = 'bold 92px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.shadowColor = glow;
    for (const [blur, col, w] of [[24, glow, 12], [10, glow, 7], [3, '#ffffff', 4]] as const) {
      c.shadowBlur = blur;
      c.strokeStyle = col;
      c.fillStyle = col;
      c.lineWidth = w;
      if (g === 'treble' || g === 'bass') draw();
      else {
        c.strokeText(g, 0, 6);
        draw();
      }
    }
  });
  neonNotes.set(key, t);
  return t;
}

const GLOWS = ['#30ff80', '#40e8ff', '#a8ff5a', '#20ffd0'];
const neon = (i: number) => neonNote(['♪', '♫', '♬', '♩', '♪', 'treble', '♫', 'bass'][i % 8], GLOWS[i % 4]);

/** The neon floor: a soft glow, thin concentric rings in green and cyan, a five-line staff ring with notes, spark ticks. */
function neonFloor() {
  return (floorTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 250);
    g.addColorStop(0, 'rgba(150,255,190,0.55)');
    g.addColorStop(0.25, 'rgba(40,230,110,0.3)');
    g.addColorStop(0.7, 'rgba(20,200,120,0.12)');
    g.addColorStop(0.92, 'rgba(40,220,255,0.3)');
    g.addColorStop(1, 'rgba(40,220,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 250, 0, Math.PI * 2);
    c.fill();
    const ring = (r: number, w: number, col: string, blur = 10) => {
      c.shadowColor = col;
      c.shadowBlur = blur;
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
      c.shadowBlur = 0;
      c.strokeStyle = 'rgba(255,255,255,0.95)';
      c.lineWidth = Math.max(1, w * 0.35);
      c.stroke();
    };
    ring(244, 5, '#40e8ff', 16);
    ring(232, 2, '#30ff80');
    ring(196, 3, '#a8ff5a');
    // the staff: five lines between r=150 and r=174, note heads on it
    for (let i = 0; i < 5; i++) ring(150 + i * 6, 1.4, '#7dffb0', 4);
    c.fillStyle = '#eafff0';
    c.shadowColor = '#30ff80';
    c.shadowBlur = 8;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 152 + ((i * 7) % 5) * 6;
      c.save();
      c.translate(Math.cos(a) * r, Math.sin(a) * r);
      c.rotate(a + Math.PI / 2);
      c.beginPath();
      c.ellipse(0, 0, 6, 4.5, -0.4, 0, Math.PI * 2);
      c.fill();
      c.fillRect(4.5, -18, 2, 18);
      c.restore();
    }
    ring(112, 4, '#40e8ff', 14);
    ring(98, 1.5, '#30ff80');
    ring(60, 3, '#a8ff5a', 12);
    ring(34, 2, '#ffffff', 10);
    // spark ticks
    c.shadowColor = '#40e8ff';
    c.shadowBlur = 6;
    c.strokeStyle = 'rgba(230,255,250,0.9)';
    c.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + (i % 3) * 0.05;
      const r0 = [200, 116, 64][i % 3];
      const r1 = r0 + 10 + (i % 4) * 8;
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      c.stroke();
    }
  }));
}

/** A five-line staff with notes and a bass clef along it (repeats sideways); white, tinted by the material. */
function staffStrip() {
  if (staffTex) return staffTex;
  staffTex = canvasTexture(512, 64, (c) => {
    c.shadowColor = '#ffffff';
    c.shadowBlur = 5;
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.fillStyle = 'rgba(255,255,255,1)';
    c.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(0, 16 + i * 8);
      c.lineTo(512, 16 + i * 8);
      c.stroke();
    }
    c.save();
    c.translate(26, 32);
    c.scale(0.45, 0.45);
    bassClef(c, 6);
    c.restore();
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 48;
      const y = 16 + ((i * 3) % 7) * 4;
      c.beginPath();
      c.ellipse(x, y + 2, 6, 4.5, -0.4, 0, Math.PI * 2);
      c.fill();
      c.fillRect(x + 4.5, y - 22, 2, 24);
      if (i % 3 === 1) c.fillRect(x + 4.5, y - 22, 26, 4);
    }
  });
  staffTex.wrapS = THREE.RepeatWrapping;
  return staffTex;
}

/** A four-point twinkle star. */
function twinkle() {
  return (twinkleTex ??= canvasTexture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 14);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#ffffff';
    for (const [w, h] of [[2.2, 31], [31, 2.2]]) {
      c.beginPath();
      c.moveTo(32 - w, 32);
      c.lineTo(32, 32 - h);
      c.lineTo(32 + w, 32);
      c.lineTo(32, 32 + h);
      c.closePath();
      c.fill();
    }
  }));
}

/** An LED equalizer bar: stacked segments, yellow-white on top, green, cyan at the foot. */
function led() {
  return (ledTex ??= canvasTexture(16, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#f6ffb0');
    g.addColorStop(0.35, '#8dff6a');
    g.addColorStop(0.7, '#30ff90');
    g.addColorStop(1, '#30d8ff');
    c.fillStyle = g;
    for (let y = 2; y < 128; y += 8) c.fillRect(2, y, 12, 5);
  }));
}

/** Dome: bright at the rim (the canvas middle = the equator on a hemisphere), fading to the top, with sparkles. */
function dome() {
  return (domeTex ??= canvasTexture(128, 256, (c) => {
    // a hemisphere maps the whole canvas: top = the pole, bottom = the rim on the ground
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(60,255,160,0.06)');
    g.addColorStop(0.5, 'rgba(40,230,200,0.16)');
    g.addColorStop(0.82, 'rgba(50,255,130,0.45)');
    g.addColorStop(0.96, 'rgba(200,255,220,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 256);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < 90; i++) c.fillRect(Math.random() * 128, Math.random() * 250, 1.5, 1.5);
    c.strokeStyle = 'rgba(200,255,240,0.6)';
    c.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 240;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (Math.random() - 0.5) * 20, y + 4 + Math.random() * 10);
      c.stroke();
    }
  }));
}

/** A ground swirl: a curved comet streak (u along: tail -> head, v across). */
function swirl() {
  return (swirlTex ??= canvasTexture(256, 64, (c) => {
    const g = c.createLinearGradient(0, 64, 0, 0);
    g.addColorStop(0, 'rgba(40,220,255,0)');
    g.addColorStop(0.3, 'rgba(40,220,255,0.8)');
    g.addColorStop(0.6, 'rgba(60,255,150,1)');
    g.addColorStop(0.85, 'rgba(240,255,240,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 64);
    c.globalCompositeOperation = 'destination-in';
    const f = c.createLinearGradient(0, 0, 256, 0);
    f.addColorStop(0, 'rgba(0,0,0,0)');
    f.addColorStop(0.6, 'rgba(0,0,0,0.9)');
    f.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = f;
    c.fillRect(0, 0, 256, 64);
  }));
}

/** The neon floor under (x,z): snaps open, turns, a brighter copy pulses on the beat. */
function neonCircle(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0, beat = 0.5) {
  const m = groundPlane(neonFloor(), r * 2, true);
  const m2 = groundPlane(neonFloor(), r * 2, true);
  const shade = groundPlane(neonFloor(), r * 2);
  (shade.material as THREE.MeshBasicMaterial).color.set(0x0a6a40);
  (m2.material as THREE.MeshBasicMaterial).color.set(BS.green);
  for (const [o, y] of [[shade, 0.045], [m, 0.05], [m2, 0.055]] as const) {
    o.position.set(x, y, z);
    o.visible = false;
  }
  ctx.scene.add(shade, m, m2);
  anim(ctx, sec, delay, (t) => {
    const k = Math.min(1, t / 0.2);
    const fade = Math.max(0, Math.min(1, (sec - t) / 0.4));
    const thump = Math.exp(-((t % beat) / beat) * 6);
    const sc = (0.4 + 0.6 * (1 - Math.pow(1 - k, 3))) * (1 + thump * 0.04);
    for (const o of [shade, m, m2]) o.visible = true;
    m.scale.setScalar(sc);
    shade.scale.setScalar(sc);
    m2.scale.setScalar(sc * (1.04 + thump * 0.05));
    m.rotation.z = shade.rotation.z = t * 0.5;
    m2.rotation.z = -t * 0.35;
    (m.material as THREE.MeshBasicMaterial).opacity = fade;
    (shade.material as THREE.MeshBasicMaterial).opacity = 0.45 * fade;
    (m2.material as THREE.MeshBasicMaterial).opacity = (0.25 + 0.5 * thump) * fade;
  }, () => dispose(ctx, shade, m, m2));
}

/** An open band round the y axis with the staff on it: a ribbon of music circling at height y. */
function staffBand(r: number, color: number, repeat: number, h = 0.32) {
  const tex = staffStrip().clone();
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(repeat, 1);
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, PHONE ? 32 : 64, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  return { m, tex };
}

/** Staff ribbons circling (x,z) for `sec`: each at its own height, tilt and speed; grows in, fades out. */
function staffRibbons(ctx: XSlashCtx, at: () => THREE.Vector3, list: { r: number; y: number; tilt: number; spin: number; color: number; rise?: number }[], sec: number, delay = 0) {
  const bands = list.map((b) => {
    const { m, tex } = staffBand(b.r, b.color, Math.max(2, Math.round(b.r * 1.6)), Math.min(0.8, 0.22 + b.r * 0.1));
    m.visible = false;
    ctx.scene.add(m);
    return { ...b, m, tex };
  });
  anim(ctx, sec, delay, (t, k) => {
    const p = at();
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.3), 3);
    for (const b of bands) {
      b.m.visible = true;
      b.m.position.set(p.x, b.y + (b.rise ?? 0) * k, p.z);
      b.m.rotation.set(b.tilt, t * b.spin, b.tilt * 0.6);
      b.m.scale.set(0.5 + 0.5 * grow, 1, 0.5 + 0.5 * grow);
      (b.m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (1 - k) * 3) * grow;
    }
  }, () => bands.forEach((b) => {
    dispose(ctx, b.m);
    b.tex.dispose();
  }));
}

/** Twinkling four-point stars popping round (x,z) within r, between heights y0..y1. */
function twinkles(ctx: XSlashCtx, x: number, z: number, r: number, n: number, sec: number, y0 = 0.1, y1 = 2, delay = 0) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = sprite(ctx, twinkle(), [0xffffff, BS.lime, BS.cyan, BS.mint][i % 4], true);
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * r;
    s.position.set(x + Math.cos(a) * rr, y0 + Math.random() * (y1 - y0), z + Math.sin(a) * rr);
    s.visible = false;
    const size = 0.25 + Math.random() * 0.45;
    const life = 0.35 + Math.random() * 0.4;
    anim(ctx, life, delay + Math.random() * sec, (_t, k) => {
      s.visible = true;
      s.scale.setScalar(size * Math.sin(k * Math.PI));
      s.material.rotation = k * 0.8;
      s.material.opacity = 1;
    }, () => dispose(ctx, s));
  }
}

/** Thin beams of light fanning up out of (x,z) (the reference's rays). */
function beams(ctx: XSlashCtx, x: number, z: number, n: number, height: number, sec: number, delay = 0) {
  for (let i = 0; i < Math.max(4, Math.round(n * Q)); i++) {
    const s = sprite(ctx, ray(), i % 3 === 0 ? 0xffffff : i % 3 === 1 ? BS.green : BS.cyan, true);
    s.center.set(0.5, 0);
    s.position.set(x + (Math.random() - 0.5) * 0.6, 0.1, z + (Math.random() - 0.5) * 0.6);
    s.material.rotation = (Math.random() - 0.5) * 1.1;
    s.visible = false;
    const h = height * (0.5 + Math.random() * 0.7);
    const w = 0.06 + Math.random() * 0.1;
    anim(ctx, sec * (0.7 + Math.random() * 0.3), delay + Math.random() * 0.15, (_t, k) => {
      s.visible = true;
      s.scale.set(w * (1 - k * 0.5), h * Math.min(1, k * 5), 1);
      s.material.opacity = 1 - k;
    }, () => dispose(ctx, s));
  }
}

/** A dense ring of LED equalizer bars bouncing round (x,z) at radius r. */
function ledRing(ctx: XSlashCtx, x: number, z: number, r: number, n: number, height: number, sec: number, delay = 0) {
  const count = Math.max(16, Math.round(n * Q));
  const bars: { s: THREE.Sprite; ph: number; sp: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const s = sprite(ctx, led(), 0xffffff, true);
    s.center.set(0.5, 0);
    s.position.set(x + Math.cos(a) * r, 0.02, z + Math.sin(a) * r);
    s.visible = false;
    bars.push({ s, ph: Math.random() * 6, sp: 6 + Math.random() * 8 });
  }
  anim(ctx, sec, delay, (t, k) => {
    for (const b of bars) {
      b.s.visible = true;
      const bounce = 0.25 + 0.75 * Math.abs(Math.sin(t * b.sp + b.ph)) * (0.6 + 0.4 * Math.sin(t * 3 + b.ph * 2));
      const h = Math.max(0.02, height * bounce * Math.min(1, t / 0.15) * (1 - Math.pow(k, 4)));
      b.s.scale.set(0.22, h, 1);
      b.s.material.opacity = 0.95 * (1 - Math.pow(k, 3));
    }
  }, () => bars.forEach((b) => dispose(ctx, b.s)));
}

/** Big glowing notes and clefs floating up and drifting round (x,z). */
function floatNotes(ctx: XSlashCtx, x: number, z: number, r: number, n: number, sec: number, delay = 0, size = 0.55) {
  for (let i = 0; i < Math.max(3, Math.round(n * Q)); i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: neon(i + Math.floor(Math.random() * 8)), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const a = Math.random() * Math.PI * 2;
    const rr = r * (0.35 + Math.random() * 0.65);
    const y = 0.3 + Math.random() * 1.6;
    const sz = size * (0.7 + Math.random() * 0.7);
    s.visible = false;
    ctx.scene.add(s);
    anim(ctx, sec * (0.7 + Math.random() * 0.3), delay + Math.random() * 0.3, (_t, k) => {
      s.visible = true;
      const an = a + k * 0.9;
      s.position.set(x + Math.cos(an) * rr, y + k * 1.2, z + Math.sin(an) * rr);
      s.scale.setScalar(sz * Math.min(1, k * 6));
      s.material.opacity = Math.min(1, (1 - k) * 2.5);
    }, () => dispose(ctx, s));
  }
}

/** Curved comet streaks sweeping round (x,z) on the ground, flat (the reference's wave slash). */
function groundSwirls(ctx: XSlashCtx, x: number, z: number, r: number, n: number, sec: number, delay = 0) {
  for (let i = 0; i < n; i++) {
    const geo = arcGeometry(r * (0.7 + i * 0.18), 0.5 + i * 0.12, Math.PI * 0.9);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: swirl(), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.12 + i * 0.05, z);
    m.visible = false;
    const start = Math.random() * Math.PI * 2;
    const dir = i % 2 ? -1 : 1;
    ctx.scene.add(m);
    anim(ctx, sec, delay + i * 0.06, (_t, k) => {
      m.visible = true;
      m.rotation.z = start + dir * k * Math.PI * 1.6;
      m.scale.set(dir, 1, 1).multiplyScalar(0.6 + 0.5 * k);
      (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (1 - k) * 2.2);
    }, () => dispose(ctx, m));
  }
}

/** A thin, intense column of light straight up (the reference's buff pillar). */
function neonPillar(ctx: XSlashCtx, at: () => THREE.Vector3, height: number, sec: number, delay = 0) {
  const mk = (color: number, w: number) => {
    const s = sprite(ctx, ray(), color, true);
    s.center.set(0.5, 0);
    s.material.depthTest = false;
    s.visible = false;
    return { s, w };
  };
  const parts = [mk(BS.green, 1.1), mk(BS.cyan, 0.6), mk(0xffffff, 0.22)];
  const base = sprite(ctx, twinkle(), 0xffffff, true);
  base.visible = false;
  anim(ctx, sec, delay, (t, k) => {
    const p = at();
    const up = Math.min(1, t / 0.15);
    for (const { s, w } of parts) {
      s.visible = true;
      s.position.set(p.x, 0, p.z);
      // ray() is brightest at the foot and fades toward the top
      s.scale.set(w * (1 - k * 0.6) * (0.9 + 0.1 * Math.sin(t * 30)), height * up, 1);
      s.material.opacity = 1 - Math.pow(k, 2);
    }
    base.visible = true;
    base.position.set(p.x, 0.3, p.z);
    base.scale.setScalar(2.2 * (1 - k * 0.5));
    base.material.opacity = 1 - k;
  }, () => dispose(ctx, ...parts.map((q) => q.s), base));
}

/** A big hemisphere of light over (x,z) with a staff ribbon round its foot (Kick Drum, the reference's dome). */
function lightDome(ctx: XSlashCtx, at: () => THREE.Vector3, r: number, sec: number, delay = 0) {
  const geo = new THREE.SphereGeometry(r, PHONE ? 24 : 40, PHONE ? 10 : 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: dome(), color: 0xc8ffe0, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 6, 64), new THREE.MeshBasicMaterial({ color: BS.mint, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  rim.rotation.x = Math.PI / 2;
  m.visible = rim.visible = false;
  ctx.scene.add(m, rim);
  anim(ctx, sec, delay, (t, k) => {
    const p = at();
    const grow = 1 - Math.pow(1 - Math.min(1, t / 0.3), 3);
    m.visible = rim.visible = true;
    m.position.set(p.x, 0, p.z);
    m.scale.set(grow, grow, grow);
    m.rotation.y = t * 0.4;
    rim.position.set(p.x, 0.05, p.z);
    rim.scale.setScalar(Math.max(0.01, grow));
    const fade = Math.min(1, (1 - k) * 3);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.6 * fade;
    (rim.material as THREE.MeshBasicMaterial).opacity = fade;
  }, () => dispose(ctx, m, rim));
  staffRibbons(ctx, at, [
    { r: r * 0.98, y: 0.25, tilt: 0, spin: 0.6, color: BS.mint },
    { r: r * 0.7, y: r * 0.55, tilt: 0.12, spin: -0.8, color: BS.cyan },
  ], sec, delay + 0.1);
}

// ------------------------------------------------------------------ skills

/**
 * โน้ตราก ("ดุ๊ม!"): a neon floor opens under the target while light gathers, a giant neon crescent chops
 * down out of the sky, then the hit: a cyan-green flash, a starburst of twinkles and rays, comet streaks
 * swirling out along the ground, shock rings, beams shooting up and glowing notes flying off.
 */
export function rootNoteChop(ctx: XSlashCtx, at: () => THREE.Vector3, hitMs: number, glowTex: THREE.Texture) {
  const p0 = at();
  neonCircle(ctx, p0.x, p0.z, 2.3, 1.7, 0, 0.3);
  gather(ctx, p0.clone().setY(p0.y + 0.4), 22, 2.6, hitMs / 1000, glowTex);
  setTimeout(() => {
    const p = at().setY(at().y + 0.3);
    fallingChop(ctx, p, 2.4, 1.3, 0, 0.75, BS.cyan);
    fallingChop(ctx, p, 2.0, 0.6, 0.05, 0.7, 0xffffff);
  }, Math.max(0, hitMs - 230));
  setTimeout(() => {
    const p = at();
    ctx.sound(true);
    flash(ctx, p, 5.5, BS.green, 0.5, glowTex);
    flash(ctx, p, 3.2, BS.cyan, 0.4, glowTex);
    flash(ctx, p, 2.2, 0xffffff, 0.3, twinkle());
    rays(ctx, p, 18, 3.4);
    greenShock(ctx, p.x, p.z, 4.4, 0.55);
    greenShock(ctx, p.x, p.z, 6.2, 0.8, 0.12);
    groundSwirls(ctx, p.x, p.z, 1.6, 3, 0.8);
    beams(ctx, p.x, p.z, 10, 4.5, 0.8);
    twinkles(ctx, p.x, p.z, 2.4, 22, 0.6, 0.1, 2.2);
    floatNotes(ctx, p.x, p.z, 2, 7, 1.4, 0.05);
    motes(ctx, p.x, p.z, 2, 20, glowTex, 0.05);
    ctx.sparks(new THREE.Vector3(p.x, 0.4, p.z), BS.green, Math.round(36 * Q), 8);
    ctx.sparks(new THREE.Vector3(p.x, 0.4, p.z), BS.cyan, Math.round(24 * Q), 7);
    ctx.shake(0.45);
  }, hitMs);
}

/**
 * จังหวะ Straight (the user's second reference picture): a big neon floor of concentric rings the size of the
 * area, a dense ring of LED equalizer bars bouncing round the bassist, beams of light fanning up from the
 * middle, staff ribbons sweeping round the rim, glowing notes and clefs floating everywhere and stars
 * twinkling; three sub-bass beats each send a shock ring out, the last one the biggest.
 */
export function straightBeatQuake(ctx: XSlashCtx, x: number, z: number, radius: number, glowTex: THREE.Texture) {
  const beat = 0.2;
  const at = () => new THREE.Vector3(x, 0, z);
  neonCircle(ctx, x, z, radius, 1.8, 0, beat);
  ledRing(ctx, x, z, radius * 0.42, 60, 1.9, 1.6, 0.03);
  beams(ctx, x, z, 14, 6, 1.1, 0.05);
  staffRibbons(ctx, at, [
    { r: radius * 0.85, y: 0.3, tilt: 0.1, spin: 1.2, color: BS.green },
    { r: radius * 0.62, y: 0.7, tilt: -0.12, spin: -1.5, color: BS.cyan },
  ], 1.5, 0.05);
  floatNotes(ctx, x, z, radius * 0.9, 18, 1.6, 0.05, 0.95);
  twinkles(ctx, x, z, radius, 40, 1.3, 0.1, 2.4);
  for (let i = 0; i < 3; i++) {
    const last = i === 2;
    setTimeout(() => {
      ctx.sound(last);
      greenShock(ctx, x, z, radius * (0.7 + i * 0.25), 0.5);
      flash(ctx, new THREE.Vector3(x, 0.4, z), 3 + i, i % 2 ? BS.cyan : BS.green, 0.35, glowTex);
      ctx.sparks(new THREE.Vector3(x, 0.3, z), i % 2 ? BS.cyan : BS.green, Math.round((16 + i * 10) * Q), 5 + i * 2);
      ctx.shake(last ? 0.4 : 0.18);
      if (last) {
        groundSwirls(ctx, x, z, radius * 0.55, 3, 0.9);
        motes(ctx, x, z, radius * 0.8, 30, glowTex);
      }
    }, i * beat * 1000);
  }
}

/**
 * The cast of a bass buff (the user's first reference picture): a thin intense pillar of light, the neon floor,
 * staff ribbons whirling round and rising, notes and twinkles. Kick Drum (protects the party) also throws up a
 * big dome of light with a staff round its foot; จังหวะยก mirror shards; ลูกส่ง leaves and plus signs.
 */
export function bassBuffCast(ctx: XSlashCtx, at: () => THREE.Vector3, kind: 'guard' | 'reflect' | 'regen', glowTex: THREE.Texture) {
  const p0 = at();
  ctx.sound(true);
  neonCircle(ctx, p0.x, p0.z, kind === 'guard' ? 3.2 : 2.4, 1.6, 0, 0.35);
  greenShock(ctx, p0.x, p0.z, 3.6, 0.6);
  neonPillar(ctx, at, 7, 1.2);
  staffRibbons(ctx, at, [
    { r: 1.6, y: 0.25, tilt: 0.08, spin: 2.2, color: BS.green, rise: 0.4 },
    { r: 1.15, y: 0.9, tilt: -0.15, spin: -2.6, color: BS.cyan, rise: 0.8 },
    { r: 0.8, y: 1.6, tilt: 0.1, spin: 3, color: BS.mint, rise: 1 },
  ], 1.4);
  twinkles(ctx, p0.x, p0.z, 2.2, 20, 1, 0.1, 2.5);
  floatNotes(ctx, p0.x, p0.z, 1.8, 7, 1.4, 0, 0.75);
  motes(ctx, p0.x, p0.z, 1, 16, glowTex);
  if (kind === 'guard') {
    lightDome(ctx, at, 3, 1.8, 0.05);
  } else if (kind === 'reflect') {
    shardGeo ??= new THREE.OctahedronGeometry(1, 0);
    const n = Math.max(6, Math.round(12 * Q));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? BS.cyan : BS.lime, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      const a = (i / n) * Math.PI * 2;
      const y = 0.4 + (i % 3) * 0.5;
      ctx.scene.add(m);
      anim(ctx, 1, 0, (t, k) => {
        const p = at();
        const r = 0.3 + 1.6 * (1 - Math.pow(1 - Math.min(1, t / 0.35), 3)) - k * 0.6;
        m.position.set(p.x + Math.cos(a + t * 3) * r, y + k * 0.5, p.z + Math.sin(a + t * 3) * r);
        m.scale.set(0.09, 0.22, 0.09);
        m.rotation.set(t * 5, t * 7, 0);
        (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      }, () => dispose(ctx, m));
    }
  } else {
    const n = Math.max(8, Math.round(18 * Q));
    for (let i = 0; i < n; i++) {
      const s = sprite(ctx, i % 4 === 3 ? plus() : leaf(), 0xffffff, i % 4 === 3);
      const a = (i / n) * Math.PI * 2;
      anim(ctx, 1.3, i * 0.02, (t, k) => {
        const p = at();
        const r = 1.4 - k * 0.9;
        s.position.set(p.x + Math.cos(a + t * 4) * r, 0.1 + k * 2.6, p.z + Math.sin(a + t * 4) * r);
        s.scale.setScalar(0.32);
        s.material.rotation = t * 3 + i;
        s.material.opacity = Math.min(1, (1 - k) * 2);
      }, () => dispose(ctx, s));
    }
  }
}

export interface BassAuraLayers {
  guard: boolean;
  reflect: boolean;
  regen: boolean;
}

/**
 * The aura round the bassist while any of their buffs lasts: a neon floor that thumps on a bass beat with a
 * ring going out each beat, two staff ribbons circling the body, a soft green-cyan haze, glowing notes
 * orbiting, twinkles and motes drifting up. On top, per buff: Kick Drum a small dome of light, จังหวะยก mirror
 * shards circling, ลูกส่ง leaves and plus signs rising. `layers()` says which buffs are on; runs until `alive()`
 * turns false, then fades out.
 */
export function bassAura(ctx: XSlashCtx, at: () => THREE.Vector3, alive: () => boolean, layers: () => BassAuraLayers, glowTex: THREE.Texture) {
  const base = groundPlane(neonFloor(), 2.4, true);
  const shade = groundPlane(neonFloor(), 2.4);
  (shade.material as THREE.MeshBasicMaterial).color.set(0x0a6a40);
  const glow = groundPlane(glowTex, 2.8, true);
  (glow.material as THREE.MeshBasicMaterial).color.set(BS.aqua);
  const beatRing = groundPlane(shock(), 2, true);
  ctx.scene.add(shade, base, glow, beatRing);
  const haze = sprite(ctx, glowTex, BS.green, true);
  haze.material.depthTest = false;
  const haze2 = sprite(ctx, glowTex, BS.cyan, true);
  haze2.material.depthTest = false;
  const ribbons = [staffBand(0.95, BS.green, 3), staffBand(0.75, BS.cyan, 2)];
  ribbons.forEach((b) => ctx.scene.add(b.m));
  const nn = PHONE ? 4 : 7;
  const notes = Array.from({ length: nn }, (_, i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: neon(i), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ctx.scene.add(s);
    return { s, a: (i / nn) * Math.PI * 2, h: 0.5 + (i % 3) * 0.5, r: 0.95 + (i % 2) * 0.2 };
  });
  // Kick Drum
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: dome(), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  ctx.scene.add(shell);
  // จังหวะยก
  shardGeo ??= new THREE.OctahedronGeometry(1, 0);
  const shards = Array.from({ length: PHONE ? 3 : 5 }, (_, i) => {
    const m = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? BS.cyan : BS.lime, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    ctx.scene.add(m);
    return m;
  });
  let guardK = 0;
  let reflectK = 0;
  let regenK = 0;
  const parts: { s: THREE.Sprite; t: number; life: number; a: number; r: number; kind: 'mote' | 'leaf' | 'plus' | 'star' }[] = [];
  let spawn = 0;
  let spawnRegen = 0;
  let t = 0;
  let fade = 1;
  const BEAT = 0.75;
  ctx.add((dt) => {
    t += dt;
    if (!alive()) fade = Math.max(0, fade - dt / 0.5);
    const f = Math.min(1, t / 0.4) * fade;
    const L = layers();
    const ease = (cur: number, on: boolean) => Math.max(0, Math.min(1, cur + (on ? dt : -dt) / 0.4));
    guardK = ease(guardK, L.guard);
    reflectK = ease(reflectK, L.reflect);
    regenK = ease(regenK, L.regen);
    const p = at();
    const bt = (t % BEAT) / BEAT;
    const thump = Math.exp(-bt * 7);
    base.position.set(p.x, 0.05, p.z);
    shade.position.set(p.x, 0.045, p.z);
    base.rotation.z = shade.rotation.z = t * 0.35;
    base.scale.setScalar(1 + thump * 0.06);
    shade.scale.copy(base.scale);
    (base.material as THREE.MeshBasicMaterial).opacity = 0.95 * f;
    (shade.material as THREE.MeshBasicMaterial).opacity = 0.4 * f;
    glow.position.set(p.x, 0.055, p.z);
    glow.scale.setScalar(0.8 + thump * 0.25);
    (glow.material as THREE.MeshBasicMaterial).opacity = (0.3 + 0.35 * thump) * f;
    beatRing.position.set(p.x, 0.07, p.z);
    beatRing.scale.setScalar(0.6 + bt * 1.8);
    (beatRing.material as THREE.MeshBasicMaterial).opacity = (1 - bt) * 0.8 * f;
    haze.position.set(p.x, 0.95, p.z);
    haze.scale.set(1.8 + thump * 0.25, 2.5, 1);
    haze.material.opacity = (0.3 + 0.15 * thump) * f;
    haze2.position.set(p.x, 0.5, p.z);
    haze2.scale.set(1.6, 1.2, 1);
    haze2.material.opacity = 0.25 * f;
    ribbons.forEach((b, i) => {
      b.m.position.set(p.x, 0.5 + i * 0.75 + Math.sin(t * 1.6 + i * 2) * 0.12, p.z);
      b.m.rotation.set(Math.sin(t * 0.9 + i) * 0.22, t * (i ? -1.3 : 1.0), Math.cos(t * 0.8 + i) * 0.16);
      (b.m.material as THREE.MeshBasicMaterial).opacity = (0.75 + 0.25 * thump) * f;
    });
    for (const n of notes) {
      const an = n.a + t * 1.1;
      n.s.position.set(p.x + Math.cos(an) * n.r, n.h + Math.sin(t * 2 + n.a * 2) * 0.16, p.z + Math.sin(an) * n.r);
      n.s.scale.setScalar(0.45 + 0.08 * thump);
      n.s.material.opacity = f;
    }
    shell.visible = guardK > 0.01;
    shell.position.set(p.x, 0, p.z);
    shell.scale.set(1.25, 1.7, 1.25).multiplyScalar(1 + thump * 0.03);
    shell.rotation.y = t * 0.6;
    (shell.material as THREE.MeshBasicMaterial).opacity = (0.55 + 0.3 * thump) * guardK * f;
    shards.forEach((m, i) => {
      m.visible = reflectK > 0.01;
      const a = (i / shards.length) * Math.PI * 2 + t * 1.8;
      m.position.set(p.x + Math.cos(a) * 1.1, 0.9 + Math.sin(t * 2.5 + i) * 0.35, p.z + Math.sin(a) * 1.1);
      m.scale.set(0.07, 0.17, 0.07).multiplyScalar(0.4 + 0.6 * reflectK);
      m.rotation.set(0, -a, t * 4 + i);
      (m.material as THREE.MeshBasicMaterial).opacity = (0.75 + 0.25 * Math.sin(t * 10 + i * 2)) * reflectK * f;
    });
    spawn += dt * f;
    const every = PHONE ? 0.14 : 0.07;
    while (spawn > every) {
      spawn -= every;
      const star = Math.random() < 0.35;
      const s = sprite(ctx, star ? twinkle() : glowTex, [BS.green, BS.lime, BS.cyan, 0xffffff][Math.floor(Math.random() * 4)], true);
      parts.push({ s, t: 0, life: star ? 0.5 + Math.random() * 0.3 : 0.8 + Math.random() * 0.6, a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * (star ? 0.9 : 0.55), kind: star ? 'star' : 'mote' });
    }
    spawnRegen += dt * f * regenK;
    const leafEvery = PHONE ? 0.3 : 0.15;
    while (spawnRegen > leafEvery) {
      spawnRegen -= leafEvery;
      const isPlus = Math.random() < 0.35;
      const s = sprite(ctx, isPlus ? plus() : leaf(), 0xffffff, isPlus);
      parts.push({ s, t: 0, life: 1.2 + Math.random() * 0.6, a: Math.random() * Math.PI * 2, r: 0.45 + Math.random() * 0.5, kind: isPlus ? 'plus' : 'leaf' });
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const sp = parts[i];
      sp.t += dt;
      const k = sp.t / sp.life;
      if (sp.kind === 'star') {
        if (sp.t === dt) sp.s.position.set(p.x + Math.cos(sp.a) * sp.r, 0.2 + Math.random() * 1.8, p.z + Math.sin(sp.a) * sp.r);
        sp.s.scale.setScalar(0.35 * Math.sin(Math.min(1, k) * Math.PI));
      } else {
        const turn = sp.kind === 'mote' ? k : k * 3;
        sp.s.position.set(p.x + Math.cos(sp.a + turn) * sp.r, 0.1 + k * (sp.kind === 'mote' ? 2.2 : 2), p.z + Math.sin(sp.a + turn) * sp.r);
        sp.s.scale.setScalar(sp.kind === 'mote' ? 0.22 * (1 - k * 0.5) : 0.32);
        if (sp.kind === 'leaf') sp.s.material.rotation = sp.t * 3 + sp.a;
      }
      sp.s.material.opacity = Math.min(1, (1 - k) * 2) * f;
      if (k >= 1) {
        dispose(ctx, sp.s);
        parts.splice(i, 1);
      }
    }
    if (fade <= 0) {
      dispose(ctx, base, shade, glow, beatRing, haze, haze2, shell, ...ribbons.map((b) => b.m), ...notes.map((n) => n.s), ...shards, ...parts.map((sp) => sp.s));
      ribbons.forEach((b) => b.tex.dispose());
      return false;
    }
    return true;
  });
}
