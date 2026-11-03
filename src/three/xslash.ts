import * as THREE from 'three';
import { PHONE } from './device';
import { canvasTexture, glyphTexture } from './toon';

/**
 * คลื่นเสียงทำลาย: a big glowing purple X of two curved blades that flies along the ground, with a magic
 * circle under the drummer, shock rings, rocks thrown up, dust and sparks, and a bigger X blast where it ends.
 * Everything is made here from canvas textures and a handful of meshes (half as many pieces on phones).
 */

type Effect = (dt: number) => boolean;

export interface XSlashCtx {
  scene: THREE.Scene;
  camera: THREE.Camera;
  add: (e: Effect) => void;
  /** a spray of additive sparks (World3D.burst) */
  sparks: (at: THREE.Vector3, color: number, n: number, speed: number) => void;
  /** "ฟาก!" */
  sound: (big: boolean) => void;
  shake: (amp: number) => void;
}

const Q = PHONE ? 0.5 : 1; // how many pieces (rocks, dust, rays)
const TEX = PHONE ? 256 : 512;

let bladeTex: THREE.Texture | undefined;
let circleTex: THREE.Texture | undefined;
let shockTex: THREE.Texture | undefined;
let rayTex: THREE.Texture | undefined;
let puffTex: THREE.Texture | undefined;
let staffTex: THREE.Texture | undefined;
let rockGeo: THREE.BufferGeometry | undefined;
let rockMat: THREE.Material | undefined;
const bladeGeos = new Map<string, THREE.BufferGeometry>();

/** Across the blade: dark violet rim -> purple -> pink -> white-hot edge; fading out at both tips. */
function blade() {
  return (bladeTex ??= canvasTexture(256, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(40,0,80,0)');
    g.addColorStop(0.12, 'rgba(50,5,110,0.85)');
    g.addColorStop(0.35, 'rgba(150,40,240,0.95)');
    g.addColorStop(0.55, 'rgba(255,120,255,1)');
    g.addColorStop(0.72, 'rgba(255,240,255,1)');
    g.addColorStop(0.8, 'rgba(255,255,255,1)');
    g.addColorStop(0.9, 'rgba(230,150,255,0.7)');
    g.addColorStop(1, 'rgba(200,100,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 64);
    // streaks of energy along the blade
    for (let i = 0; i < 14; i++) {
      c.strokeStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`;
      c.lineWidth = 1 + Math.random() * 1.5;
      const y = 20 + Math.random() * 30;
      const x = Math.random() * 180;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 40 + Math.random() * 60, y + (Math.random() - 0.5) * 6);
      c.stroke();
    }
    // fade the tips
    c.globalCompositeOperation = 'destination-in';
    const f = c.createLinearGradient(0, 0, 256, 0);
    f.addColorStop(0, 'rgba(0,0,0,0)');
    f.addColorStop(0.15, 'rgba(0,0,0,1)');
    f.addColorStop(0.8, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = f;
    c.fillRect(0, 0, 256, 64);
  }));
}

/** A glowing magic circle: rings, a ring of music notes, an eight-point star (light lines over a dark violet outline). */
function circle() {
  return (circleTex ??= canvasTexture(TEX, TEX, (c) => {
    const s = TEX / 512;
    c.translate(TEX / 2, TEX / 2);
    c.scale(s, s);
    // a soft purple floor under it all
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 245);
    g.addColorStop(0, 'rgba(200,90,255,0.45)');
    g.addColorStop(0.75, 'rgba(120,30,220,0.25)');
    g.addColorStop(0.97, 'rgba(120,30,220,0.4)');
    g.addColorStop(1, 'rgba(120,30,220,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 245, 0, Math.PI * 2);
    c.fill();
    c.font = 'bold 30px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const notes = ['♪', '♫', '♬', '♩'];
    const draw = (col: string, extra: number) => {
      c.strokeStyle = col;
      c.fillStyle = col;
      const ring = (r: number, w: number) => {
        c.lineWidth = w + extra;
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.stroke();
      };
      ring(238, 6);
      ring(222, 2);
      ring(180, 3);
      ring(110, 3);
      ring(60, 4);
      c.lineWidth = 2 + extra;
      for (let i = 0; i < 16; i++) {
        c.save();
        c.rotate((i / 16) * Math.PI * 2);
        if (extra) c.strokeText(notes[i % 4], 0, -201);
        else c.fillText(notes[i % 4], 0, -201);
        c.restore();
        c.save();
        c.rotate(((i + 0.5) / 16) * Math.PI * 2);
        c.fillRect(-1.5 - extra / 2, -220, 3 + extra, 16);
        c.restore();
      }
      // eight-point star: two squares, and spokes from the inner ring
      c.lineWidth = 4 + extra;
      for (const r0 of [0, Math.PI / 4]) {
        c.beginPath();
        for (let i = 0; i <= 4; i++) {
          const a = r0 + (i / 4) * Math.PI * 2;
          if (i) c.lineTo(Math.cos(a) * 180, Math.sin(a) * 180);
          else c.moveTo(Math.cos(a) * 180, Math.sin(a) * 180);
        }
        c.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        c.beginPath();
        c.moveTo(Math.cos(a) * 60, Math.sin(a) * 60);
        c.lineTo(Math.cos(a) * 110, Math.sin(a) * 110);
        c.stroke();
      }
    };
    c.shadowColor = '#9a30ff';
    c.shadowBlur = 16;
    draw('rgba(90,10,170,0.9)', 5);
    c.shadowBlur = 6;
    c.shadowColor = '#ff9cff';
    draw('#fff0ff', 0);
  }));
}

/** A soft ring, brightest just inside the edge. */
function shock() {
  return (shockTex ??= canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(160,60,255,0)');
    g.addColorStop(0.62, 'rgba(160,60,255,0)');
    g.addColorStop(0.86, 'rgba(210,120,255,0.75)');
    g.addColorStop(0.94, 'rgba(255,240,255,1)');
    g.addColorStop(1, 'rgba(255,240,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  }));
}

/** A thin light ray, bright at the base. */
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

/** A lumpy dust puff. */
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

/** A curved blade strip with UVs (u along, v across), its middle at the origin, bowing towards +x. */
function bladeGeometry(len: number, width: number) {
  const key = `${len}_${width}`;
  const old = bladeGeos.get(key);
  if (old) return old;
  const n = PHONE ? 16 : 28;
  const angle = Math.PI * 0.42;
  const radius = len / angle;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const th = -angle / 2 + u * angle;
    // thick towards the leading end, sharp at both tips
    const w = width * Math.pow(Math.sin(Math.PI * u), 0.7) * (0.55 + 0.45 * u);
    for (const [r, v] of [[radius + w / 2, 1], [radius - w / 2, 0]] as const) {
      pos.push(Math.cos(th) * r - radius, Math.sin(th) * r, 0);
      uv.push(u, v);
    }
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  bladeGeos.set(key, g);
  return g;
}

/** Two crossed blades (an X), each drawn twice: a solid pass for the colour and an additive pass for the glow. */
function xBlades(len: number, width: number) {
  const geo = bladeGeometry(len, width);
  const solid = new THREE.MeshBasicMaterial({ map: blade(), transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: false });
  const add = new THREE.MeshBasicMaterial({ map: blade(), color: 0xff9cff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const g = new THREE.Group();
  const blades: THREE.Group[] = [];
  for (const [r, flip] of [[Math.PI / 4, 1], [-Math.PI / 4, -1]] as const) {
    const b = new THREE.Group();
    b.rotation.z = r;
    b.scale.x = flip; // mirror one so the two curves bow away from each other
    for (const m of [solid, add]) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = 10;
      b.add(mesh);
    }
    g.add(b);
    blades.push(b);
  }
  return { g, blades, mats: [solid, add] };
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

function dispose(ctx: XSlashCtx, ...objs: THREE.Object3D[]) {
  for (const o of objs) {
    ctx.scene.remove(o);
    o.traverse((x) => {
      const mat = (x as THREE.Mesh).material as THREE.Material | undefined;
      mat?.dispose();
    });
  }
}

/** A magic circle on the ground at (x,z), `r` tiles across its radius, turning, for `sec` seconds. */
function magicCircle(ctx: XSlashCtx, x: number, z: number, r: number, sec: number) {
  const m = groundPlane(circle(), r * 2);
  m.position.set(x, 0.05, z);
  m.rotation.order = 'YXZ';
  ctx.scene.add(m);
  const glow = groundPlane(circle(), r * 2, true);
  glow.position.set(x, 0.06, z);
  glow.rotation.order = 'YXZ';
  ctx.scene.add(glow);
  const mat = m.material as THREE.MeshBasicMaterial;
  const gmat = glow.material as THREE.MeshBasicMaterial;
  (gmat.color as THREE.Color).set(0xc060ff);
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / 0.2);
    const fade = Math.min(1, (sec - t) / 0.4);
    m.scale.setScalar(0.4 + 0.6 * (1 - Math.pow(1 - k, 3)));
    glow.scale.copy(m.scale);
    m.rotation.y = t * 0.8;
    glow.rotation.y = -t * 0.5;
    mat.opacity = Math.max(0, fade);
    gmat.opacity = Math.max(0, 0.3 * fade * (0.7 + 0.3 * Math.sin(t * 20)));
    if (t >= sec) {
      dispose(ctx, m, glow);
      m.geometry.dispose();
      glow.geometry.dispose();
      return false;
    }
    return true;
  });
}

/** An expanding ring on the ground. */
function shockRing(ctx: XSlashCtx, x: number, z: number, r: number, sec: number, delay = 0) {
  const m = groundPlane(shock(), 2);
  m.position.set(x, 0.08, z);
  m.visible = false;
  ctx.scene.add(m);
  const mat = m.material as THREE.MeshBasicMaterial;
  let t = -delay;
  ctx.add((dt) => {
    t += dt;
    if (t < 0) return true;
    m.visible = true;
    const k = Math.min(1, t / sec);
    m.scale.setScalar(0.2 + r * (1 - Math.pow(1 - k, 2.5)));
    mat.opacity = 1 - k;
    if (k >= 1) {
      dispose(ctx, m);
      m.geometry.dispose();
      return false;
    }
    return true;
  });
}

/** Rocks torn out of the ground, flung outwards; they bounce once and shrink away. */
function rocks(ctx: XSlashCtx, x: number, z: number, n: number, power: number) {
  rockGeo ??= new THREE.DodecahedronGeometry(1, 0);
  rockMat ??= new THREE.MeshLambertMaterial({ color: 0x7a5844, flatShading: true });
  const list = Array.from({ length: Math.max(1, Math.round(n)) }, () => {
    const m = new THREE.Mesh(rockGeo, rockMat);
    const s = 0.07 + Math.random() * 0.16;
    m.scale.set(s, s * (0.7 + Math.random() * 0.6), s * (0.8 + Math.random() * 0.5));
    const a = Math.random() * Math.PI * 2;
    const sp = power * (0.5 + Math.random());
    m.position.set(x + Math.cos(a) * 0.3, 0.1, z + Math.sin(a) * 0.3);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    ctx.scene.add(m);
    return { m, s: m.scale.clone(), v: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 4 * (power / 4), Math.sin(a) * sp), spin: (Math.random() - 0.5) * 18 };
  });
  const life = 1.3;
  let t = 0;
  ctx.add((dt) => {
    t += dt;
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
      const k = Math.max(0, Math.min(1, (life - t) / 0.3));
      r.m.scale.copy(r.s).multiplyScalar(k);
    }
    if (t >= life) {
      for (const r of list) ctx.scene.remove(r.m);
      return false;
    }
    return true;
  });
}

/** Lilac dust clouds rolling out. */
function dust(ctx: XSlashCtx, x: number, z: number, n: number, spread: number) {
  for (let i = 0; i < Math.max(1, Math.round(n)); i++) {
    const s = sprite(ctx, puff(), 0xecd6f6, false);
    const a = Math.random() * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)).multiplyScalar(spread * (0.5 + Math.random() * 0.6));
    s.position.set(x + Math.cos(a) * 0.4, 0.35, z + Math.sin(a) * 0.4);
    s.material.rotation = Math.random() * 6;
    const size = 0.8 + Math.random() * 0.7;
    const life = 0.9 + Math.random() * 0.4;
    let t = 0;
    ctx.add((dt) => {
      t += dt;
      const k = t / life;
      s.position.addScaledVector(v, dt * (1 - k));
      s.scale.setScalar(size * (0.6 + k * 1.4));
      s.material.opacity = 0.7 * (1 - k);
      if (k >= 1) {
        dispose(ctx, s);
        return false;
      }
      return true;
    });
  }
}

/** Light rays shooting out of a point in all directions (screen space). */
function rays(ctx: XSlashCtx, at: THREE.Vector3, n: number, len: number, deep = false) {
  for (let i = 0; i < Math.max(1, Math.round(n)); i++) {
    const s = deep && i % 3 ? sprite(ctx, ray(), 0x8a2be2, false) : sprite(ctx, ray(), i % 3 ? 0xd890ff : 0xffffff, true);
    s.center.set(0.5, 0);
    s.position.copy(at);
    s.material.depthTest = false;
    s.material.rotation = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    s.renderOrder = 11;
    const l = len * (0.5 + Math.random() * 0.7);
    let t = 0;
    ctx.add((dt) => {
      t += dt / 0.4;
      s.scale.set(0.16 * (1 - t * 0.5), l * Math.min(1, t * 4), 1);
      s.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) {
        dispose(ctx, s);
        return false;
      }
      return true;
    });
  }
}

/** A white-hot flash. */
function flash(ctx: XSlashCtx, at: THREE.Vector3, size: number, color: number, sec: number, tex: THREE.Texture) {
  const s = sprite(ctx, tex, color, true);
  s.material.depthTest = false;
  s.renderOrder = 9;
  s.position.copy(at);
  let t = 0;
  ctx.add((dt) => {
    t += dt / sec;
    s.scale.setScalar(size * (0.5 + t * 0.8));
    s.material.opacity = Math.max(0, 1 - t);
    if (t >= 1) {
      dispose(ctx, s);
      return false;
    }
    return true;
  });
}

/** The big X blast: two blades slash in one after the other, then the X swells and fades. */
function xBlast(ctx: XSlashCtx, at: THREE.Vector3, size: number, glowTex: THREE.Texture) {
  const { g, blades, mats } = xBlades(size, size * 0.26);
  g.position.copy(at);
  ctx.scene.add(g);
  blades.forEach((b) => (b.visible = false));
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    g.quaternion.copy(ctx.camera.quaternion);
    blades.forEach((b, i) => {
      const k = Math.min(1, (t - i * 0.07) / 0.1);
      b.visible = k > 0;
      // slash in: the blade grows along its length
      b.children.forEach((c) => c.scale.set(1, Math.max(0.01, k), 1));
    });
    const out = Math.max(0, (t - 0.25) / 0.45);
    g.scale.setScalar(1 + out * 0.35);
    mats[0].opacity = Math.max(0, 1 - out);
    mats[1].opacity = Math.max(0, 0.6 * (1 - out));
    if (out >= 1) {
      dispose(ctx, g);
      return false;
    }
    return true;
  });
  flash(ctx, at, size * 1.3, 0xc060ff, 0.5, glowTex);
  flash(ctx, at, size * 0.6, 0xffffff, 0.3, glowTex);
}

/**
 * The whole skill: from (fx,fz) along (dx,dz) for `length` tiles at `speed` tiles/s, an X `width` tiles wide.
 * `glowTex` is the shared soft spark texture.
 */
export function xSlashWave(ctx: XSlashCtx, fx: number, fz: number, dx: number, dz: number, length: number, speed: number, width: number, glowTex: THREE.Texture) {
  const dur = length / speed;
  const size = width * 2;
  const color = 0xb04cff;
  // the cast: a magic circle and a ring under the drummer, a first X right in front
  ctx.sound(false);
  magicCircle(ctx, fx, fz, 2.2, dur + 0.5);
  shockRing(ctx, fx, fz, 2.6, 0.5);
  dust(ctx, fx, fz, 4 * Q, 1.6);

  const { g, blades, mats } = xBlades(size, size * 0.26);
  ctx.scene.add(g);
  const hot = sprite(ctx, glowTex, 0xffffff, true);
  hot.material.depthTest = false;
  hot.renderOrder = 12;
  const core = sprite(ctx, glowTex, color, true);
  core.material.depthTest = false;
  core.renderOrder = 9;
  // a glowing scar left on the ground
  const trackGeo = new THREE.PlaneGeometry(width * 0.7, 1);
  const trackMat = new THREE.MeshBasicMaterial({ map: ray(), color: 0xc070ff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const track = new THREE.Mesh(trackGeo, trackMat);
  track.rotation.order = 'YXZ';
  track.rotation.set(-Math.PI / 2, Math.atan2(dx, dz), 0);
  ctx.scene.add(track);

  let t = 0;
  let debris = 0;
  let ended = false;
  const step = PHONE ? 0.22 : 0.12;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / dur);
    const d = 0.6 + k * length;
    const at = new THREE.Vector3(fx + dx * d, 0.9, fz + dz * d);
    g.position.copy(at);
    g.quaternion.copy(ctx.camera.quaternion);
    g.rotateZ(Math.sin(t * 9) * 0.08);
    // slash in at the start
    blades.forEach((b, i) => {
      const s = Math.min(1, (t - i * 0.08) / 0.12);
      b.visible = s > 0;
      b.children.forEach((c) => c.scale.set(1, Math.max(0.01, s), 1));
    });
    g.scale.setScalar(1 + Math.sin(t * 22) * 0.04);
    core.position.copy(at);
    core.scale.setScalar(size * (0.9 + Math.sin(t * 30) * 0.1));
    hot.position.copy(at);
    hot.scale.setScalar(size * 0.35 * (0.9 + Math.sin(t * 40) * 0.15));
    track.scale.y = d;
    track.position.set(fx + (dx * d) / 2, 0.04, fz + (dz * d) / 2);
    // rocks, dust and sparks kicked up along the way
    debris += dt;
    if (debris > step && t < dur) {
      debris = 0;
      rocks(ctx, at.x, at.z, 2 * Q + 0.5, 2.2);
      dust(ctx, at.x, at.z, 1, 1.2);
      ctx.sparks(at.clone().setY(0.6), 0xe8a0ff, PHONE ? 2 : 4, 3);
    }
    if (t >= dur && !ended) {
      ended = true;
      const end = new THREE.Vector3(fx + dx * (length + 0.6), 0.9, fz + dz * (length + 0.6));
      ctx.sound(true);
      ctx.shake(0.35);
      xBlast(ctx, end, size * 1.3, glowTex);
      magicCircle(ctx, end.x, end.z, 2.8, 0.9);
      shockRing(ctx, end.x, end.z, 3.6, 0.55);
      shockRing(ctx, end.x, end.z, 2.4, 0.5, 0.12);
      rocks(ctx, end.x, end.z, 12 * Q, 3.5);
      dust(ctx, end.x, end.z, 8 * Q, 2.4);
      rays(ctx, end, 12 * Q, 3.2);
      ctx.sparks(end, 0xe8a0ff, Math.round(30 * Q), 7);
    }
    const fade = t > dur ? 1 - (t - dur) / 0.25 : 1;
    mats[0].opacity = Math.max(0, fade);
    mats[1].opacity = Math.max(0, 0.6 * fade);
    core.material.opacity = Math.max(0, 0.6 * fade);
    hot.material.opacity = Math.max(0, 0.9 * fade);
    trackMat.opacity = Math.max(0, 0.55 * (t > dur ? 1 - (t - dur) / 0.6 : 1));
    if (t > dur + 0.6) {
      dispose(ctx, g, core, hot, track);
      trackGeo.dispose();
      return false;
    }
    return true;
  });
}

// ------------------------------------------------------------ กระเดื่องคู่

/** A strip of music staff: five glowing lines with notes on them, fading at both ends (wraps round a ring). */
function staff() {
  return (staffTex ??= canvasTexture(PHONE ? 512 : 1024, 128, (c) => {
    const w = PHONE ? 512 : 1024;
    const k = w / 1024;
    c.scale(k, 1);
    const top = 34;
    const gap = 14;
    const notes = ['♪', '♫', '♬', '♩', '♪', '♫'];
    const draw = (col: string, extra: number) => {
      c.strokeStyle = col;
      c.fillStyle = col;
      c.lineWidth = 5 + extra;
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.moveTo(0, top + i * gap);
        c.lineTo(1024, top + i * gap);
        c.stroke();
      }
      // bar lines and notes sitting on the staff
      for (let b = 0; b < 4; b++) c.fillRect(250 * b + 240 - extra / 2, top, 3 + extra, gap * 4);
      c.font = 'bold 54px sans-serif';
      c.textBaseline = 'middle';
      c.lineWidth = 3 + extra;
      for (let i = 0; i < 12; i++) {
        const x = 30 + i * 82;
        const y = top + ((i * 3) % 5) * gap + 4;
        if (extra) c.strokeText(notes[i % notes.length], x, y);
        else c.fillText(notes[i % notes.length], x, y);
      }
    };
    c.shadowColor = '#a040ff';
    c.shadowBlur = 12;
    draw('rgba(110,20,200,0.95)', 6);
    c.shadowColor = '#ffb0ff';
    c.shadowBlur = 6;
    draw('#fff2ff', 0);
    // fade both ends
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    const f = c.createLinearGradient(0, 0, w, 0);
    f.addColorStop(0, 'rgba(0,0,0,0)');
    f.addColorStop(0.12, 'rgba(0,0,0,1)');
    f.addColorStop(0.88, 'rgba(0,0,0,1)');
    f.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = f;
    c.fillRect(0, 0, w, 128);
  }));
}

function staffMap() {
  const t = staff();
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = 2; // the ribbon is long: two strips of staff round it
  return t;
}

/** A ribbon of music staff curving round (x,z), slightly tilted, spinning and opening out. */
function staffRing(ctx: XSlashCtx, x: number, z: number, r: number, y: number, tilt: number, spin: number, sec: number, delay: number) {
  const geo = new THREE.CylinderGeometry(r, r, 1.1, PHONE ? 32 : 56, 1, true, 0, Math.PI * 1.5);
  const mats = [false, true].map(
    (add) =>
      new THREE.MeshBasicMaterial({ map: staffMap(), color: add ? 0xd070ff : 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }),
  );
  const g = new THREE.Group();
  for (const m of mats) g.add(new THREE.Mesh(geo, m));
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.set(tilt, 0, tilt * 0.6);
  pivot.add(g);
  ctx.scene.add(pivot);
  let t = -delay;
  ctx.add((dt) => {
    t += dt;
    if (t < 0) return true;
    const k = Math.min(1, t / 0.35);
    g.rotation.y += spin * dt * (2.2 - k);
    g.scale.set(0.45 + 0.55 * (1 - Math.pow(1 - k, 3)), 1, 0.45 + 0.55 * (1 - Math.pow(1 - k, 3)));
    const fade = Math.min(k, Math.max(0, (sec - t) / 0.4));
    mats[0].opacity = fade;
    mats[1].opacity = 0.85 * fade;
    if (t >= sec) {
      dispose(ctx, pivot);
      geo.dispose();
      return false;
    }
    return true;
  });
}

/** Dark-violet crescents lying on the ground, sweeping round the circle's edge. */
function groundSwooshes(ctx: XSlashCtx, x: number, z: number, r: number, sec: number) {
  const n = 3;
  const geo = bladeGeometry(r * 1.6, r * 0.16);
  const mat = new THREE.MeshBasicMaterial({ map: blade(), transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = (i / n) * Math.PI * 2;
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.x = r; // the blade bows round the circle
    arm.add(m);
    g.add(arm);
  }
  g.position.set(x, 0.07, z);
  ctx.scene.add(g);
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / 0.3);
    g.rotation.y -= dt * (5 - 3.5 * k);
    g.scale.setScalar(0.5 + 0.5 * (1 - Math.pow(1 - k, 3)));
    mat.opacity = Math.max(0, Math.min(k * 1.5, (sec - t) / 0.4));
    if (t >= sec) {
      dispose(ctx, g);
      return false;
    }
    return true;
  });
}

/** A column of light shooting up from (x,z). */
function lightPillar(ctx: XSlashCtx, x: number, z: number, height: number, sec: number) {
  const parts = [
    { c: 0xb050ff, w: 1.6 },
    { c: 0xffffff, w: 0.5 },
  ].map(({ c, w }) => {
    const s = sprite(ctx, ray(), c, true);
    s.center.set(0.5, 0);
    s.position.set(x, 0, z);
    s.renderOrder = 11;
    return { s, w };
  });
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    const k = Math.min(1, t / 0.15);
    for (const p of parts) {
      p.s.scale.set(p.w * (1 + Math.sin(t * 30) * 0.08) * (1 - Math.max(0, t - sec * 0.5) / sec), height * k, 1);
      p.s.material.opacity = Math.max(0, Math.min(1, (sec - t) / (sec * 0.5)));
    }
    if (t >= sec) {
      dispose(ctx, ...parts.map((p) => p.s));
      return false;
    }
    return true;
  });
}

/** Big glowing music notes rising and drifting round the drummer. */
function risingNotes(ctx: XSlashCtx, x: number, z: number, r: number, n: number) {
  const glyphs = ['♪', '♫', '♬', '♩'];
  for (let i = 0; i < n; i++) {
    const s = sprite(ctx, glyphTexture(glyphs[i % 4], '#fbe8ff', 'rgba(150,40,240,0.9)'), 0xffffff, false);
    s.renderOrder = 12;
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5;
    const rad = r * (0.5 + Math.random() * 0.5);
    const size = 0.5 + Math.random() * 0.45;
    const life = 1.1 + Math.random() * 0.5;
    let t = -Math.random() * 0.3;
    ctx.add((dt) => {
      t += dt;
      if (t < 0) {
        s.visible = false;
        return true;
      }
      s.visible = true;
      const k = t / life;
      const a = ang + k * 1.2;
      s.position.set(x + Math.cos(a) * rad * (0.6 + k * 0.4), 0.3 + k * 3.2, z + Math.sin(a) * rad * (0.6 + k * 0.4));
      s.scale.setScalar(size * Math.min(1, t * 6));
      s.material.opacity = Math.max(0, Math.min(1, (1 - k) * 2.5));
      if (k >= 1) {
        dispose(ctx, s);
        return false;
      }
      return true;
    });
  }
}

/**
 * กระเดื่องคู่: two kick-drum stomps. A magic circle opens under the drummer, music-staff ribbons whirl round,
 * dark swooshes sweep the ground, a column of light shoots up and notes rise; each stomp ("ตูม!") sends a
 * shockwave out to `radius` tiles.
 */
export function doubleKickBlast(ctx: XSlashCtx, x: number, z: number, radius: number, glowTex: THREE.Texture) {
  const sec = 1.6;
  magicCircle(ctx, x, z, radius * 0.62, sec);
  groundSwooshes(ctx, x, z, radius * 0.8, sec * 0.85);
  staffRing(ctx, x, z, radius * 0.62, 0.7, 0.12, 2.4, sec, 0);
  staffRing(ctx, x, z, radius * 0.72, 1.5, -0.16, -1.8, sec - 0.1, 0.1);
  if (!PHONE) staffRing(ctx, x, z, radius * 0.5, 2.2, 0.2, 3, sec - 0.2, 0.18);
  lightPillar(ctx, x, z, 7, 1.0);
  risingNotes(ctx, x, z, radius * 0.6, Math.round(12 * Q));
  // the two stomps
  [0, 0.23].forEach((at, i) => {
    let t = -at;
    let done = false;
    ctx.add((dt) => {
      t += dt;
      if (t < 0 || done) return !done;
      done = true;
      ctx.sound(i === 1);
      ctx.shake(i ? 0.35 : 0.25);
      shockRing(ctx, x, z, radius + 0.5, 0.55);
      shockRing(ctx, x, z, radius * 0.6, 0.45, 0.06);
      flash(ctx, new THREE.Vector3(x, 0.5, z), 4 + i * 1.5, i ? 0xffffff : 0xc060ff, 0.35, glowTex);
      ctx.sparks(new THREE.Vector3(x, 0.4, z), 0xe8a0ff, Math.round(22 * Q), 6);
      if (i) dust(ctx, x, z, 6 * Q, 2.6);
      return false;
    });
  });
}

// ------------------------------------------------------------ จังหวะส่ง

let shardGeo: THREE.BufferGeometry | undefined;
let shardMat: THREE.Material | undefined;

/** Thin purple crystal shards bursting out of a hit. */
function shards(ctx: XSlashCtx, at: THREE.Vector3, n: number, power: number) {
  shardGeo ??= new THREE.OctahedronGeometry(1, 0);
  shardMat ??= new THREE.MeshBasicMaterial({ color: 0x5a1aa8 });
  const list = Array.from({ length: Math.max(1, Math.round(n)) }, () => {
    const m = new THREE.Mesh(shardGeo, shardMat);
    const s = 0.06 + Math.random() * 0.08;
    m.scale.set(s * 0.5, s * 2.2, s * 0.5);
    m.position.copy(at);
    m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    ctx.scene.add(m);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(power * (0.5 + Math.random()));
    return { m, s: m.scale.clone(), v, spin: (Math.random() - 0.5) * 20 };
  });
  let t = 0;
  const life = 0.8;
  ctx.add((dt) => {
    t += dt;
    for (const r of list) {
      r.v.y -= 9 * dt;
      r.m.position.addScaledVector(r.v, dt);
      r.m.rotation.x += r.spin * dt;
      r.m.scale.copy(r.s).multiplyScalar(Math.max(0, Math.min(1, (life - t) / 0.25)));
    }
    if (t >= life) {
      for (const r of list) ctx.scene.remove(r.m);
      return false;
    }
    return true;
  });
}

/** A flat strip of light lying along a dash: from (x0,z0) to (x1,z1) at height y, `w` wide. */
function streakPlane(ctx: XSlashCtx, x0: number, z0: number, x1: number, z1: number, y: number, w: number, color: number, sec: number, delay: number, flat: boolean) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.PlaneGeometry(w, len);
  const additive = color === 0xffffff;
  const mat = new THREE.MeshBasicMaterial({ map: ray(), color, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.order = 'YXZ';
  // the ray texture is bright at v=0 (local -y): point that end at the landing spot. Flat = lying on the
  // ground; otherwise standing edge-up in the vertical plane through the path.
  const yaw = Math.atan2(x1 - x0, z1 - z0);
  if (flat) m.rotation.set(-Math.PI / 2, yaw, 0);
  else m.rotation.set(0, yaw + Math.PI / 2, -Math.PI / 2);
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  ctx.scene.add(m);
  let t = -delay;
  ctx.add((dt) => {
    t += dt;
    if (t < 0) return true;
    const k = t / sec;
    mat.opacity = Math.max(0, k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85);
    m.scale.x = 1 - k * 0.6;
    if (k >= 1) {
      dispose(ctx, m);
      geo.dispose();
      return false;
    }
    return true;
  });
}

/**
 * จังหวะส่ง: the drummer shoots from (fx,fz) to (tx,tz) in `dashMs` like a purple comet: speed lines, an
 * energy trail on the ground and a loop of light round the path, dust kicked up behind; at the target a
 * starburst of rays, a ring on the ground, crystal shards and sparks. `big` = the x2 hit from hiding.
 */
export function sendOffDash(ctx: XSlashCtx, fx: number, fz: number, tx: number, tz: number, dashMs: number, big: boolean, glowTex: THREE.Texture) {
  const len = Math.hypot(tx - fx, tz - fz);
  if (len < 0.2) return;
  const dx = (tx - fx) / len;
  const dz = (tz - fz) / len;
  const k = big ? 1.35 : 1;
  const dash = dashMs / 1000;
  ctx.sound(false);
  // behind: dust and a little ring where the drummer pushed off
  dust(ctx, fx, fz, 3 * Q + 1, 1.4);
  shockRing(ctx, fx, fz, 1.6, 0.4);
  // the trail: a wide glow on the ground and speed lines at different heights, a bit past the start
  const bx = fx - dx * 1.2;
  const bz = fz - dz * 1.2;
  streakPlane(ctx, bx, bz, tx, tz, 0.06, 1.8 * k, 0x7a1fe0, 0.6, 0, true);
  streakPlane(ctx, bx, bz, tx, tz, 0.08, 0.6 * k, 0xffffff, 0.45, 0, true);
  const lines = Math.round(7 * Q) + 2;
  for (let i = 0; i < lines; i++) {
    const side = (Math.random() - 0.5) * 1.6;
    const sx = -dz * side;
    const sz = dx * side;
    const back = 0.5 + Math.random() * 1.8;
    streakPlane(ctx, bx - dx * back + sx, bz - dz * back + sz, tx - dx * 0.4 + sx, tz - dz * 0.4 + sz, 0.3 + Math.random() * 1.3, 0.08 + Math.random() * 0.12, [0x8a2be2, 0xb050ff, 0xffffff][i % 3], 0.45, Math.random() * dash * 0.6, false);
  }
  // a loop of light round the path: an oval ring stretched along the dash
  const loop = groundPlane(shock(), 2);
  loop.rotation.order = 'YXZ';
  loop.rotation.set(-Math.PI / 2, Math.atan2(dx, dz), 0);
  loop.position.set((fx + tx) / 2, 0.5, (fz + tz) / 2);
  (loop.material as THREE.MeshBasicMaterial).color.set(0xa040ff);
  ctx.scene.add(loop);
  let lt = 0;
  ctx.add((dt) => {
    lt += dt;
    const q = Math.min(1, lt / 0.25);
    loop.scale.set(1.2 * k * (0.5 + q * 0.5), (len / 2 + 1) * (0.6 + q * 0.4), 1);
    (loop.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - lt / 0.55);
    if (lt >= 0.55) {
      dispose(ctx, loop);
      loop.geometry.dispose();
      return false;
    }
    return true;
  });
  // the hit
  let t = 0;
  ctx.add((dt) => {
    t += dt;
    if (t < dash) return true;
    const at = new THREE.Vector3(tx, 0.8, tz);
    ctx.sound(true);
    ctx.shake(0.3 * k);
    const deep = sprite(ctx, glowTex, 0x7a1fe0, false);
    deep.material.depthTest = false;
    deep.renderOrder = 8;
    deep.position.copy(at);
    let dt2 = 0;
    ctx.add((d) => {
      dt2 += d / 0.45;
      deep.scale.setScalar(3.6 * k * (0.6 + dt2 * 0.6));
      deep.material.opacity = Math.max(0, 0.9 * (1 - dt2));
      if (dt2 >= 1) {
        dispose(ctx, deep);
        return false;
      }
      return true;
    });
    flash(ctx, at, 4.5 * k, 0xb050ff, 0.4, glowTex);
    flash(ctx, at, 2 * k, 0xffffff, 0.25, glowTex);
    rays(ctx, at, 14 * Q + 2, 2.6 * k, true);
    shockRing(ctx, tx, tz, 2.6 * k, 0.5);
    shockRing(ctx, tx, tz, 1.6 * k, 0.4, 0.08);
    shards(ctx, at, 10 * Q * k, 5);
    ctx.sparks(at, 0xe8a0ff, Math.round(28 * Q * k), 7);
    return false;
  });
}
