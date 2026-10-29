import * as THREE from 'three';

/**
 * A portable 49-key keyboard built from code, at real size in metres (no brand logos).
 * Frame: keys run along X (+X is the player's left), +Y is up, the player stands at -Z,
 * so the keys sit on the -Z edge and the control panel on the +Z side.
 */

export interface KeyboardProp {
  group: THREE.Group;
  /** Where the left / right wrists rest above the keys. */
  left: THREE.Object3D;
  right: THREE.Object3D;
}

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key)!;
}
const std = (hex: number, roughness = 0.5, metalness = 0) => mat(`${hex}-${roughness}-${metalness}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness }));

function tex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function grille() {
  return mat('grille', () => new THREE.MeshStandardMaterial({
    roughness: 0.8,
    map: tex(128, 128, (c) => {
      c.fillStyle = '#26282c';
      c.fillRect(0, 0, 128, 128);
      c.fillStyle = '#0b0b0d';
      for (let y = 4; y < 128; y += 8) for (let x = (y / 8) % 2 ? 8 : 4; x < 128; x += 8) {
        c.beginPath();
        c.arc(x, y, 2.4, 0, Math.PI * 2);
        c.fill();
      }
    }),
  }));
}

function screen() {
  return mat('lcd', () => new THREE.MeshBasicMaterial({
    map: tex(128, 64, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, '#3a8cff');
      g.addColorStop(1, '#1550c8');
      c.fillStyle = g;
      c.fillRect(0, 0, 128, 64);
      c.fillStyle = '#e8f4ff';
      c.font = 'bold 15px sans-serif';
      c.fillText('001 Piano', 8, 22);
      c.font = '11px sans-serif';
      c.fillText('Tempo 120  ♪', 8, 42);
      c.fillRect(8, 50, 70, 4);
    }),
  }));
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

export function buildKeyboard(): KeyboardProp {
  const g = new THREE.Group();
  const W = 0.86, D = 0.27, H = 0.06;
  const body = std(0x17181b, 0.45);
  // chassis with a raised back panel and a thin chrome-ish trim
  g.add(box(W, H, D, body, 0, H / 2, 0));
  g.add(box(W - 0.01, 0.004, 0.006, std(0x6b6f78, 0.3, 0.6), 0, H - 0.002, D / 2 - 0.004));

  // speaker grilles at both ends
  for (const sx of [-1, 1]) {
    const s = box(0.085, 0.004, 0.22, grille(), sx * (W / 2 - 0.05), H + 0.001, -0.015);
    g.add(s);
  }

  // 49 keys: 29 white, black keys in the usual 2-3 groups
  const keysW = 0.66, top = H;
  const whiteW = keysW / 29;
  const whiteMat = std(0xf6f6f2, 0.35);
  const blackMat = std(0x0c0c0e, 0.3);
  const kz = -D / 2 + 0.07; // keys run from the front lip back into the body
  for (let i = 0; i < 29; i++) {
    const x = keysW / 2 - whiteW * (i + 0.5);
    g.add(box(whiteW * 0.92, 0.014, 0.125, whiteMat, x, top + 0.004, kz - 0.005));
    const n = i % 7; // C D E F G A B
    if (i < 28 && n !== 2 && n !== 6) g.add(box(whiteW * 0.56, 0.014, 0.075, blackMat, x - whiteW / 2, top + 0.013, kz + 0.02));
  }
  g.add(box(keysW + 0.01, 0.006, 0.012, body, 0, top + 0.012, kz + 0.064)); // felt strip behind the keys

  // control panel: screen, knobs, buttons, slider
  const pz = D / 2 - 0.055;
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.045), screen());
  lcd.rotation.x = -Math.PI / 2;
  lcd.position.set(0, top + 0.0025, pz);
  g.add(lcd, box(0.112, 0.003, 0.056, std(0x2a2c31), 0, top + 0.0005, pz));
  const knob = std(0x2b2d33, 0.35, 0.2);
  for (let i = 0; i < 4; i++) {
    for (const sx of [-1, 1]) {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.012, 14), knob);
      k.position.set(sx * (0.09 + i * 0.03), top + 0.006, pz + 0.018);
      g.add(k);
    }
  }
  const lit = [0xff4d4d, 0x4dd2ff, 0xffffff, 0xffc94d];
  for (let i = 0; i < 8; i++) {
    for (const sx of [-1, 1]) {
      const on = (i + (sx > 0 ? 1 : 0)) % 3 === 0;
      const m = on ? mat(`led${i}`, () => new THREE.MeshBasicMaterial({ color: lit[i % lit.length] })) : std(0x3a3d44, 0.4);
      g.add(box(0.012, 0.004, 0.008, m, sx * (0.08 + i * 0.018), top + 0.002, pz - 0.014));
    }
  }
  g.add(box(0.006, 0.003, 0.05, std(0x050505), -0.34, top + 0.001, pz + 0.002));
  g.add(box(0.016, 0.01, 0.012, std(0x8a8f99, 0.3, 0.5), -0.34, top + 0.006, pz + 0.01));
  // pitch / mod wheels on the left end of the panel
  for (const dx of [0, 0.022]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 18), std(0x222429, 0.6));
    w.rotation.z = Math.PI / 2;
    w.position.set(W / 2 - 0.12 - dx, top + 0.004, pz);
    g.add(w);
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  // wrists hover just behind the keys, a hand-span apart
  const left = new THREE.Object3D();
  left.position.set(0.13, top + 0.055, kz - 0.095);
  const right = new THREE.Object3D();
  right.position.set(-0.13, top + 0.055, kz - 0.095);
  g.add(left, right);
  return { group: g, left, right };
}
