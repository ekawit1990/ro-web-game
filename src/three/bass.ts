import * as THREE from 'three';

/**
 * A detailed electric bass / guitar built from code, at real size in metres.
 * Frame: the neck runs along +X (headstock at +X), +Y is the side that faces up when played
 * (thickest string), +Z is out of the face. The origin is where the neck meets the body.
 */

export interface StringedProp {
  group: THREE.Group;
  /** Where the fretting (left) wrist goes. */
  grip: THREE.Object3D;
  /** Where the plucking (right) wrist goes. */
  pluck: THREE.Object3D;
}

interface Spec {
  body: string;
  strings: number;
  scale: number; // nut to bridge
  bodyScale: number;
}

const SPECS: Record<'bass' | 'guitar', Spec> = {
  bass: { body: '#2f1f86', strings: 4, scale: 0.864, bodyScale: 1 },
  guitar: { body: '#d8541e', strings: 6, scale: 0.648, bodyScale: 0.86 },
};

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key)!;
}
const chrome = () => mat('chrome', () => new THREE.MeshStandardMaterial({ color: 0xd4d9e0, metalness: 0.45, roughness: 0.25 }));
const black = () => mat('black', () => new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.45 }));
const maple = () => mat('maple', () => new THREE.MeshStandardMaterial({ color: 0xe6ad62, roughness: 0.4 }));
const rosewood = () => mat('rosewood', () => new THREE.MeshStandardMaterial({ color: 0x3b1d14, roughness: 0.7 }));
const pearlDot = () => mat('dot', () => new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.3 }));
const stringMat = () => mat('string', () => new THREE.MeshStandardMaterial({ color: 0xe2e5ea, metalness: 0.4, roughness: 0.3 }));

function pearl() {
  return mat('pearl', () => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f3f2f5';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 260; i++) {
      const v = 228 + Math.floor(Math.random() * 27);
      g.fillStyle = `rgba(${v},${v},${Math.min(255, v + 8)},0.5)`;
      g.beginPath();
      g.ellipse(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 7, 1 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(4, 4);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.25, clearcoat: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0xc8d4ff) });
  });
}

function finish(color: string) {
  return mat(`finish${color}`, () => new THREE.MeshPhysicalMaterial({ color, metalness: 0.35, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08 }));
}

function shapeOf(pts: [number, number][], k = 1) {
  const s = new THREE.Shape();
  const v = pts.map(([x, y]) => new THREE.Vector2(x * k, y * k));
  s.moveTo(v[0].x, v[0].y);
  s.splineThru([...v.slice(1), v[0]]);
  return s;
}

function slab(shape: THREE.Shape, depth: number, m: THREE.Material, z: number, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 24,
  });
  const o = new THREE.Mesh(g, m);
  o.position.z = z;
  return o;
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

function cyl(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'z', seg = 14) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  o.position.set(x, y, z);
  if (axis === 'z') o.rotation.x = Math.PI / 2;
  if (axis === 'x') o.rotation.z = Math.PI / 2;
  return o;
}

/** A thin cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material) {
  const len = a.distanceTo(b);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}

export function buildStringed(kind: 'bass' | 'guitar'): StringedProp {
  const sp = SPECS[kind];
  const k = sp.bodyScale;
  const g = new THREE.Group();
  const T = 0.042 * k; // body thickness

  // offset-waist body with a long upper horn
  const body = shapeOf([
    [0.0, 0.034], [0.09, 0.055], [0.135, 0.088], [0.115, 0.128], [0.04, 0.138], [-0.1, 0.117], [-0.25, 0.163], [-0.38, 0.158],
    [-0.442, 0.06], [-0.442, -0.06], [-0.38, -0.166], [-0.25, -0.168], [-0.12, -0.122], [-0.03, -0.132], [0.05, -0.108],
    [0.062, -0.07], [0.03, -0.046], [0.0, -0.034],
  ], k);
  g.add(slab(body, T, finish(sp.body), 0, 0.006));

  // pearl pickguard
  const guard = shapeOf([
    [0.0, 0.036], [0.075, 0.058], [0.088, 0.088], [0.035, 0.118], [-0.08, 0.104], [-0.18, 0.128], [-0.25, 0.108], [-0.262, 0.05],
    [-0.215, -0.03], [-0.16, -0.098], [-0.075, -0.112], [-0.01, -0.06], [0.0, -0.036],
  ], k);
  const face = T + 0.006;
  g.add(slab(guard, 0.0025, pearl(), face));

  const nutX = 0.47;
  const bridgeX = nutX - sp.scale;
  const fretX = (n: number) => nutX - sp.scale * (1 - Math.pow(2, -n / 12));
  const boardEnd = fretX(kind === 'bass' ? 20.5 : 22.5);

  // neck: maple, tapered, with a rosewood fretboard
  const wNut = kind === 'bass' ? 0.042 : 0.043, wHeel = kind === 'bass' ? 0.062 : 0.056;
  const heelX = boardEnd - 0.06;
  const widthAt = (x: number) => wHeel + (wNut - wHeel) * ((x - heelX) / (nutX - heelX));
  const tapered = (x0: number, x1: number, d: number, m: THREE.Material, z: number) => {
    const geo = new THREE.BoxGeometry(x1 - x0, 1, d, 24, 1, 1);
    const p = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * widthAt(p.getX(i) + (x0 + x1) / 2));
    geo.computeVertexNormals();
    const o = new THREE.Mesh(geo, m);
    o.position.set((x0 + x1) / 2, 0, z);
    return o;
  };
  g.add(tapered(heelX, nutX, 0.022, maple(), face + 0.006));
  g.add(tapered(boardEnd, nutX, 0.006, rosewood(), face + 0.02));
  const boardTop = face + 0.023;
  for (let n = 1; n <= (kind === 'bass' ? 20 : 22); n++) {
    const x = fretX(n);
    g.add(box(0.0018, widthAt(x) * 0.97, 0.002, chrome(), x, 0, boardTop + 0.0008));
  }
  for (const n of [3, 5, 7, 9, 12, 15, 17, 19]) {
    const x = (fretX(n) + fretX(n - 1)) / 2;
    const ys = n === 12 ? [-0.012, 0.012] : [0];
    for (const y of ys) g.add(cyl(0.0035, 0.001, pearlDot(), x, y, boardTop + 0.0002, 'z', 10));
  }
  g.add(box(0.004, wNut, 0.006, mat('nut', () => new THREE.MeshStandardMaterial({ color: 0xf2ead8 })), nutX, 0, boardTop + 0.002));

  // Fender-like headstock (no logo), tuners on the upper side
  const head = shapeOf([
    [nutX - 0.002, -0.021], [nutX - 0.002, 0.021], [nutX + 0.04, 0.03], [nutX + 0.1, 0.046], [nutX + 0.18, 0.058],
    [nutX + 0.212, 0.042], [nutX + 0.205, 0.004], [nutX + 0.13, -0.014], [nutX + 0.05, -0.026],
  ]);
  g.add(slab(head, 0.014, maple(), face + 0.002, 0.002));
  const headTop = face + 0.018;
  const tuners = sp.strings === 4 ? 4 : 6;
  const tunerX: number[] = [];
  for (let i = 0; i < tuners; i++) {
    const x = nutX + 0.045 + i * (sp.strings === 4 ? 0.042 : 0.026);
    tunerX.push(x);
    const y = sp.strings === 4 ? 0.026 + i * 0.006 : 0.022 + i * 0.005;
    g.add(cyl(0.0045, 0.02, chrome(), x, y, headTop + 0.008));
    g.add(cyl(0.008, 0.004, chrome(), x, y, headTop + 0.001));
    const key = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), chrome());
    key.scale.set(1, 0.55, 0.32);
    key.position.set(x, y + 0.042, face + 0.002);
    g.add(key, rod(new THREE.Vector3(x, y, face + 0.002), new THREE.Vector3(x, y + 0.035, face + 0.002), 0.0028, chrome()));
  }

  // pickups: split P + J for the bass, two humbuckers for the guitar
  if (kind === 'bass') {
    g.add(box(0.022, 0.044, 0.016, black(), -0.2, 0.024, face + 0.006));
    g.add(box(0.022, 0.044, 0.016, black(), -0.212, -0.024, face + 0.006));
    g.add(box(0.02, 0.09, 0.016, black(), -0.31, 0, face + 0.006));
  } else {
    for (const x of [-0.17, -0.27]) g.add(box(0.04, 0.072, 0.014, black(), x * k, 0, face + 0.006));
  }

  // bridge and controls
  const bx = bridgeX * (kind === 'bass' ? 1 : 1);
  g.add(box(0.06, 0.082, 0.004, chrome(), bx - 0.022, 0, face + 0.002));
  const n = sp.strings;
  const spreadNut = kind === 'bass' ? 0.0145 : 0.018;
  const spreadBridge = kind === 'bass' ? 0.028 : 0.026;
  for (let i = 0; i < n; i++) {
    const y = -spreadBridge + (2 * spreadBridge * i) / (n - 1);
    g.add(box(0.016, 0.012, 0.01, chrome(), bx - 0.004, y, face + 0.008));
  }
  g.add(box(0.11, 0.032, 0.003, chrome(), -0.27 * k, -0.105 * k, face + 0.001));
  for (const x of [-0.24, -0.29]) g.add(cyl(0.011, 0.016, chrome(), x * k, -0.105 * k, face + 0.01, 'z', 18));
  g.add(cyl(0.006, 0.01, chrome(), -0.36 * k, -0.135 * k, face + 0.005));

  // strings: thickest on +Y
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const a = new THREE.Vector3(nutX, -spreadNut + 2 * spreadNut * f, boardTop + 0.004);
    const b = new THREE.Vector3(bx - 0.004, -spreadBridge + 2 * spreadBridge * f, face + 0.013);
    const head = new THREE.Vector3(tunerX[Math.min(tunerX.length - 1, n - 1 - i)], 0.024, headTop + 0.012);
    const r = kind === 'bass' ? 0.0008 + 0.0007 * f : 0.0004 + 0.0005 * f;
    g.add(rod(a, b, r, stringMat()), rod(a, head, r, stringMat()));
  }

  // strap buttons
  g.add(cyl(0.006, 0.012, chrome(), 0.13 * k, 0.09 * k, T / 2, 'y'));
  g.add(cyl(0.006, 0.012, chrome(), -0.448 * k, 0, T / 2, 'x'));

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  const grip = new THREE.Object3D();
  grip.position.set(fretX(kind === 'bass' ? 5 : 6), -0.03, face + 0.01);
  const pluck = new THREE.Object3D();
  pluck.position.set(-0.27 * k, 0.06, face + 0.045);
  g.add(grip, pluck);
  g.userData.strapPins = [new THREE.Vector3(0.13 * k, 0.1 * k, T / 2), new THREE.Vector3(-0.46 * k, 0, T / 2)];
  return { group: g, grip, pluck };
}
