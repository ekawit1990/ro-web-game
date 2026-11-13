import * as THREE from 'three';
import type { GameMap, Obj } from '../game/maps';
import { Pile, rngFor } from './ruins';
import { canvasTexture, sparkTexture } from './toon';

/**
 * Code-built scenery for เมืองคีย์มนตรา (the keyboardists' city of magic) and อเวจี (the abyss):
 * - the octagonal city wall with eight corner towers and gatehouses on the four flat sides,
 * - the piano spire in the middle: tiered white stone, bands of piano keys, a violet cone and a floating orb,
 * - lilac stone houses with steep violet roofs, some with a little turret,
 * - obsidian spikes and the reaper's blood circle with skulls round it.
 * Stone of one kind is merged into one mesh with vertex colours (see Pile in ruins.ts).
 */

const WALL = ['#b9b2c4', '#c4bccd', '#aca5b8'];
const ROOF = ['#5b45a0', '#4a52a8', '#6a3f8f'];
const TRIM = '#e8e2ef';
const CONE4 = new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4);
const CONE = new THREE.ConeGeometry(0.5, 1, 12, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
const TETRA = new THREE.ConeGeometry(0.5, 1, 5, 1);
const SPHERE = new THREE.SphereGeometry(0.5, 12, 8);
const v3 = (x: number, y = x, z = x) => new THREE.Vector3(x, y, z);

function house(p: Pile, r: () => number, o: Extract<Obj, { kind: 'building' }>) {
  const wall = WALL[o.wall % WALL.length];
  const roof = ROOF[o.roof % ROOF.length];
  const h = 1.2 + o.floors * 0.9;
  const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
  const w = o.w - 0.15, d = o.h - 0.15;
  p.box(cx, 0, cz, w, h, d, wall);
  p.box(cx, h - 0.12, cz, w + 0.12, 0.14, d + 0.12, TRIM); // a cornice under the roof
  p.box(cx, 0, cz, w + 0.08, 0.25, d + 0.08, '#8f879c'); // plinth
  // a steep four-sided roof
  p.shape(CONE4, cx, h + 0.02 + (Math.max(w, d) * 0.55) / 2, cz, v3(w, Math.max(w, d) * 0.55 + 0.5, d), roof);
  // door and windows on the street side (face: 0 = +y, 1 = +x, 2 = -y, 3 = -x)
  const face = o.face ?? 0;
  const [nx, nz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][face];
  const fx = cx + (nx * w) / 2, fz = cz + (nz * d) / 2;
  const along = face % 2 ? d : w;
  const rot = face % 2 ? Math.PI / 2 : 0;
  p.box(fx + nx * 0.03, 0, fz + nz * 0.03, 0.55, 1.0, 0.08, '#3a2a4a', rot);
  for (let f = 0; f < o.floors; f++) {
    for (const s of [-1, 1]) {
      if (along < 2.4 && f === 0) continue;
      const off = s * along * 0.3;
      const wx = fx + (face % 2 ? 0 : off) + nx * 0.03, wz = fz + (face % 2 ? off : 0) + nz * 0.03;
      p.box(wx, 1.15 + f * 0.9, wz, 0.38, 0.5, 0.08, '#7fb0ff', rot);
    }
  }
  // now and then a round turret on a corner
  if (r() < 0.35) {
    const tx = o.x + 0.35, tz = o.y + 0.35;
    const th = h + 1.1;
    p.shape(CYL, tx, th / 2, tz, v3(0.7, th, 0.7), wall);
    p.shape(CONE, tx, th + 0.55, tz, v3(0.9, 1.1, 0.9), roof);
  }
}

/** The octagonal city wall: eight runs with a walkway and merlons, towers on the corners, gatehouses. */
function octWall(p: Pile, o: Extract<Obj, { kind: 'octwall' }>) {
  const R = o.r; // apothem: distance from the centre to each flat side
  const side = 2 * R * Math.tan(Math.PI / 8);
  const H = 3.2;
  const stone = '#a49cb2';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2; // 0 = east, the flat sides face the axes
    const cx = o.x + Math.cos(a) * R, cz = o.y + Math.sin(a) * R;
    const rot = -a + Math.PI / 2;
    const gated = i % 2 === 0;
    const runs = gated ? [[-(side / 2 + o.gate / 2) / 2 - o.gate / 4, side / 2 - o.gate / 2], [(side / 2 + o.gate / 2) / 2 + o.gate / 4, side / 2 - o.gate / 2]] : [[0, side]];
    for (const [off, len] of runs) {
      const ux = -Math.sin(a), uz = Math.cos(a); // along the side
      const x = cx + ux * off, z = cz + uz * off;
      p.box(x, 0, z, len, H, 1.4, stone, rot);
      p.box(x, H, z, len, 0.15, 1.6, TRIM, rot);
      const n = Math.floor(len / 1.1);
      for (let k = 0; k < n; k++) {
        const t = -len / 2 + 0.55 + k * 1.1;
        for (const s of [-1, 1]) p.box(x + ux * t + Math.cos(a) * s * 0.65, H + 0.15, z + uz * t + Math.sin(a) * s * 0.65, 0.5, 0.45, 0.25, stone, rot);
      }
    }
    if (gated) {
      // gatehouse: two towers either side of the opening and an arch over it
      const ux = -Math.sin(a), uz = Math.cos(a);
      for (const s of [-1, 1]) {
        const x = cx + ux * s * (o.gate / 2 + 0.9), z = cz + uz * s * (o.gate / 2 + 0.9);
        p.shape(CYL, x, (H + 1.6) / 2, z, v3(2.2, H + 1.6, 2.2), stone);
        p.shape(CONE, x, H + 1.6 + 1.1, z, v3(2.6, 2.2, 2.6), ROOF[0]);
      }
      p.box(cx, H - 0.6, cz, o.gate + 0.6, 1.2, 1.6, stone, rot);
    }
    // corner tower between this side and the next
    const b = a + Math.PI / 8;
    const cr = R / Math.cos(Math.PI / 8);
    const tx = o.x + Math.cos(b) * cr, tz = o.y + Math.sin(b) * cr;
    p.shape(CYL, tx, (H + 2.2) / 2, tz, v3(3, H + 2.2, 3), stone);
    p.box(tx, H + 2.2, tz, 3.3, 0.2, 3.3, TRIM, b);
    p.shape(CONE, tx, H + 2.4 + 1.5, tz, v3(3.4, 3, 3.4), ROOF[1]);
  }
}

let keysTex: THREE.Texture | undefined;
/** A band of piano keys, wrapped round the spire. */
function keys() {
  return (keysTex ??= (() => {
    const t = canvasTexture(512, 64, (c) => {
      c.fillStyle = '#f6f2fa';
      c.fillRect(0, 0, 512, 64);
      const n = 28;
      c.fillStyle = '#4a4458';
      for (let i = 0; i <= n; i++) c.fillRect((i / n) * 512 - 1, 0, 2, 64);
      c.fillStyle = '#16121e';
      for (let i = 0; i < n; i++) if (![2, 6].includes(i % 7)) c.fillRect(((i + 1) / n) * 512 - 6, 0, 12, 38);
    });
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.x = 3;
    return t;
  })());
}

/** The piano spire: four white tiers, each ringed with piano keys, a violet cone, a glowing orb and rings. */
function spire(o: Extract<Obj, { kind: 'spire' }>) {
  const g = new THREE.Group();
  const cx = o.x + o.r, cz = o.y + o.r;
  g.position.set(cx, 0, cz);
  const stone = new THREE.MeshToonMaterial({ color: '#c9bedc' });
  const keyMat = new THREE.MeshToonMaterial({ map: keys() });
  const roofMat = new THREE.MeshToonMaterial({ color: '#5b3f9a' });
  let y = 0;
  const tiers = [[o.r * 0.95, 3.2], [o.r * 0.78, 3.6], [o.r * 0.6, 4], [o.r * 0.44, 4.4]];
  for (const [r, h] of tiers) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 24), stone);
    body.position.y = y + h / 2;
    g.add(body);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.96, 1.1, 32, 1, true), keyMat);
    band.position.y = y + h * 0.62;
    g.add(band);
    const ledge = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.3, 24), roofMat);
    ledge.position.y = y + h;
    g.add(ledge);
    y += h;
  }
  const cone = new THREE.Mesh(new THREE.ConeGeometry(o.r * 0.5, 7, 24), roofMat);
  cone.position.y = y + 3.5;
  g.add(cone);
  // the door on the south side
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.2), new THREE.MeshToonMaterial({ color: '#2a1e3a' }));
  door.position.set(0, 1.1, o.r * 0.96);
  g.add(door);
  // the orb and its rings, turning in the update loop
  const orbY = y + 8.2;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), new THREE.MeshBasicMaterial({ color: '#cfe0ff' }));
  orb.position.y = orbY;
  g.add(orb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTexture(), color: 0x9a7aff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(4.5);
  glow.position.y = orbY;
  g.add(glow);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2 + i * 0.45, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: i === 1 ? '#ffffff' : '#b49aff', transparent: true, opacity: 0.85 }));
    ring.position.y = orbY;
    ring.rotation.x = Math.PI / 2 + i * 0.5;
    rings.push(ring);
    g.add(ring);
  }
  g.traverse((x) => {
    if ((x as THREE.Mesh).isMesh) {
      x.castShadow = true;
      x.receiveShadow = true;
    }
  });
  g.userData.tick = (t: number) => {
    rings.forEach((r, i) => {
      r.rotation.z = t * (0.6 + i * 0.3) * (i % 2 ? -1 : 1);
      r.rotation.x = Math.PI / 2 + Math.sin(t * 0.7 + i) * 0.6;
    });
    orb.position.y = glow.position.y = orbY + Math.sin(t * 1.5) * 0.25;
    glow.material.opacity = 0.7 + Math.sin(t * 3) * 0.2;
  };
  return g;
}

let circleTex: THREE.Texture | undefined;
/** The reaper's circle: rings and runes in blood red, a pentagram. */
function bloodTexture() {
  return (circleTex ??= canvasTexture(512, 512, (c) => {
    c.translate(256, 256);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 250);
    g.addColorStop(0, 'rgba(120,0,30,0.55)');
    g.addColorStop(0.8, 'rgba(60,0,20,0.4)');
    g.addColorStop(1, 'rgba(60,0,20,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 250, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(255,40,60,0.95)';
    for (const [r, w] of [[238, 6], [226, 2], [180, 3], [120, 2]]) {
      c.lineWidth = w;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.stroke();
    }
    c.lineWidth = 4;
    c.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = ((i * 2) / 5) * Math.PI * 2 - Math.PI / 2;
      if (i) c.lineTo(Math.cos(a) * 178, Math.sin(a) * 178);
      else c.moveTo(Math.cos(a) * 178, Math.sin(a) * 178);
    }
    c.stroke();
    c.font = 'bold 26px serif';
    c.fillStyle = 'rgba(255,60,80,0.95)';
    c.textAlign = 'center';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗ';
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      c.save();
      c.rotate(a);
      c.fillText(runes[i], 0, -197);
      c.restore();
    }
  }));
}

function bloodCircle(o: Extract<Obj, { kind: 'bloodcircle' }>, p: Pile) {
  const g = new THREE.Group();
  const mk = (additive: boolean) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(o.r * 2, o.r * 2), new THREE.MeshBasicMaterial({
      map: bloodTexture(), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(o.x, additive ? 0.05 : 0.04, o.y);
    g.add(m);
    return m;
  };
  mk(false);
  const glow = mk(true);
  // skulls round the rim
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const x = o.x + Math.cos(a) * (o.r + 0.4), z = o.y + Math.sin(a) * (o.r + 0.4);
    p.shape(SPHERE, x, 0.32, z, v3(0.55, 0.5, 0.6), '#d8cfc4');
    p.box(x, 0.02, z, 0.36, 0.2, 0.3, '#cfc5b8', a);
    for (const s of [-1, 1]) p.shape(SPHERE, x + Math.cos(a + Math.PI / 2) * s * 0.12 - Math.cos(a) * 0.22, 0.36, z + Math.sin(a + Math.PI / 2) * s * 0.12 - Math.sin(a) * 0.22, v3(0.13), '#1a0a0e');
  }
  g.userData.tick = (t: number) => {
    glow.rotation.z = t * 0.15;
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.sin(t * 2) * 0.1;
  };
  return g;
}

function spike(p: Pile, r: () => number, o: Extract<Obj, { kind: 'spike' }>) {
  const cx = o.x + 0.5, cz = o.y + 0.5;
  const n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = o.s * (0.6 + r() * 0.8) * 1.6;
    const w = 0.25 + r() * 0.25;
    const a = r() * Math.PI * 2;
    const off = i ? 0.25 : 0;
    p.shape(TETRA, cx + Math.cos(a) * off, h / 2, cz + Math.sin(a) * off, v3(w, h, w), i % 2 ? '#2a1424' : '#1a0c16', a, (r() - 0.5) * 0.4);
  }
}

/** All of it for one map; null on maps without any. The spire and the circle animate through their own `userData.tick`. */
export function buildMagicProps(map: GameMap): THREE.Group | null {
  if (map.theme !== 'magic' && map.theme !== 'abyss') return null;
  const g = new THREE.Group();
  g.name = 'magic';
  const p = new Pile();
  for (const o of map.objects) {
    const r = rngFor(Math.floor(o.x) * 7919 + Math.floor(o.y) * 104729 + 29);
    if (o.kind === 'building' && o.style === 'magic') house(p, r, o);
    else if (o.kind === 'octwall') octWall(p, o);
    else if (o.kind === 'spike') spike(p, r, o);
    else if (o.kind === 'spire') {
      g.add(spire(o));
    } else if (o.kind === 'bloodcircle') {
      g.add(bloodCircle(o, p));
    }
  }
  const stone = p.mesh(new THREE.MeshToonMaterial({ vertexColors: true }));
  if (stone) g.add(stone);
  return g.children.length ? g : null;
}
