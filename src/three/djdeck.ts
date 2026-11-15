import * as THREE from 'three';
import type { KeyboardProp } from './keyboard';

/**
 * A DJ controller built from code, at real size in metres (no makers' names or logos): two jog wheels, a mixer
 * with channel faders and EQ knobs in the middle, a colour screen, performance pads and pitch faders.
 * Same frame as the keyboard (keyboard.ts) so the DJ holds and plays it the same way:
 * the long side runs along X (+X is the player's left), +Y is up, the player stands at -Z.
 */

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key)!;
}
const std = (hex: number, roughness = 0.5, metalness = 0) => mat(`${hex}-${roughness}-${metalness}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness, metalness }));
const lit = (hex: number) => mat(`lit${hex}`, () => new THREE.MeshBasicMaterial({ color: hex }));

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

/** The middle screen: two scrolling waveforms and a tempo readout. */
function screen(accent: string) {
  return mat(`djlcd${accent}`, () => new THREE.MeshBasicMaterial({
    map: tex(256, 128, (c) => {
      c.fillStyle = '#0b0d14';
      c.fillRect(0, 0, 256, 128);
      for (const [y0, col] of [[30, '#4fc3ff'], [80, '#ff5fa2']] as const) {
        c.strokeStyle = col;
        c.lineWidth = 2;
        c.beginPath();
        for (let x = 6; x < 250; x += 3) {
          const h = (Math.sin(x * 0.21) * 0.5 + Math.sin(x * 0.057 + y0) * 0.5) * 14 + 2;
          c.moveTo(x, y0 - h);
          c.lineTo(x, y0 + h);
        }
        c.stroke();
      }
      c.fillStyle = accent;
      c.fillRect(126, 4, 3, 120);
      c.fillStyle = '#e8eefc';
      c.font = 'bold 13px sans-serif';
      c.fillText('128.0', 8, 122);
      c.fillText('128.0', 200, 122);
    }),
  }));
}

/** A jog wheel's top: brushed ring, dark platter with a centre display. */
function platter(accent: string) {
  return mat(`djjog${accent}`, () => new THREE.MeshStandardMaterial({
    roughness: 0.35,
    metalness: 0.4,
    map: tex(128, 128, (c) => {
      c.translate(64, 64);
      const g = c.createRadialGradient(0, 0, 4, 0, 0, 64);
      g.addColorStop(0, '#2a2d36');
      g.addColorStop(0.62, '#15171d');
      g.addColorStop(0.64, '#9aa0ab');
      g.addColorStop(1, '#5d626d');
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, 64, 0, Math.PI * 2);
      c.fill();
      // grip dimples on the outer ring
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        c.beginPath();
        c.arc(Math.cos(a) * 54, Math.sin(a) * 54, 1.6, 0, Math.PI * 2);
        c.fill();
      }
      // centre display with a play-position marker
      c.fillStyle = '#070809';
      c.beginPath();
      c.arc(0, 0, 18, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = accent;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 14, -Math.PI / 2, Math.PI * 0.9);
      c.stroke();
    }),
  }));
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

function cyl(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 16) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  o.position.set(x, y, z);
  return o;
}

/** Item `shape` of DJ weapons: size and colours. */
export const DJ_STYLES: Record<string, { body: number; panel: number; trim: number; accent: string; pads: number[]; width: number; jog: number; decks: 2 | 4; glow?: number }> = {
  dj_mini: { body: 0x2b2d33, panel: 0x1d1f24, trim: 0x8a8f99, accent: '#4fc3ff', pads: [0x4fc3ff, 0xff5fa2], width: 0.6, jog: 0.068, decks: 2 },
  dj_basic: { body: 0x1c1d22, panel: 0x141519, trim: 0x6b6f78, accent: '#ff9d2e', pads: [0xff4d4d, 0xffc94d, 0x4dd2ff, 0x7dff9a], width: 0.78, jog: 0.085, decks: 2 },
  dj_neon: { body: 0x14141a, panel: 0x0c0c10, trim: 0x2a2a34, accent: '#38e8ff', pads: [0x38e8ff, 0xff38c8], width: 0.82, jog: 0.088, decks: 2, glow: 0x38e8ff },
  dj_grand: { body: 0xf2f0ea, panel: 0x22242a, trim: 0xd4af37, accent: '#ffcf4d', pads: [0xff4d4d, 0xffcf4d, 0x4dd2ff, 0xb45cff], width: 0.98, jog: 0.088, decks: 4 },
};

export function buildDjDeck(styleId?: string): KeyboardProp {
  const st = DJ_STYLES[styleId ?? ''] ?? DJ_STYLES.dj_basic;
  const g = new THREE.Group();
  const W = st.width, D = 0.3, H = 0.045;
  const body = std(st.body, 0.45);
  const panel = std(st.panel, 0.6);
  const trim = std(st.trim, 0.3, 0.6);
  g.add(box(W, H, D, body, 0, H / 2, 0));
  // top plate, chrome edge
  g.add(box(W - 0.02, 0.003, D - 0.02, panel, 0, H + 0.001, 0));
  g.add(box(W - 0.01, 0.004, 0.006, trim, 0, H - 0.002, -D / 2 + 0.004));
  g.add(box(W - 0.01, 0.004, 0.006, trim, 0, H - 0.002, D / 2 - 0.004));
  const top = H + 0.003;

  // the mixer in the middle: screen at the back, EQ knobs, channel faders and a crossfader at the front
  const mixW = st.decks === 4 ? 0.22 : 0.17;
  const lcd = new THREE.Mesh(new THREE.PlaneGeometry(mixW - 0.02, 0.06), screen(st.accent));
  lcd.rotation.x = -Math.PI / 2;
  lcd.position.set(0, top + 0.002, D / 2 - 0.05);
  g.add(lcd, box(mixW - 0.008, 0.004, 0.068, std(0x0a0a0c), 0, top, D / 2 - 0.05));
  const knob = std(0x2b2d33, 0.35, 0.2);
  const ch = st.decks === 4 ? 4 : 2;
  for (let c = 0; c < ch; c++) {
    const x = (c - (ch - 1) / 2) * (mixW / ch);
    for (let r = 0; r < 3; r++) g.add(cyl(0.008, 0.012, knob, x, top + 0.006, D / 2 - 0.1 - r * 0.026, 12));
    g.add(box(0.004, 0.002, 0.05, std(0x050505), x, top + 0.001, -0.045));
    g.add(box(0.014, 0.012, 0.01, trim, x, top + 0.006, -0.03 - c * 0.006));
    // level meter LEDs
    for (let i = 0; i < 5; i++) g.add(box(0.005, 0.002, 0.004, lit(i < 3 ? 0x4dff88 : i < 4 ? 0xffd24d : 0xff4d4d), x + 0.012, top + 0.001, -0.075 + i * 0.008));
  }
  g.add(box(0.06, 0.002, 0.004, std(0x050505), 0, top + 0.001, -D / 2 + 0.03));
  g.add(box(0.012, 0.01, 0.014, trim, 0.008, top + 0.005, -D / 2 + 0.03));

  // a jog wheel (with pads and a pitch fader) on each side, two more decks' worth on the big one
  const deckW = (W - mixW) / 2;
  const sides = [1, -1];
  for (const sx of sides) {
    const cx = sx * (mixW / 2 + deckW / 2);
    const jog = cyl(st.jog, 0.012, std(0x0d0e11, 0.4), cx, top + 0.005, 0.02, 28);
    const face = new THREE.Mesh(new THREE.CircleGeometry(st.jog * 0.96, 28), platter(st.accent));
    face.rotation.x = -Math.PI / 2;
    face.position.set(cx, top + 0.0115, 0.02);
    g.add(jog, face);
    if (st.glow) {
      // a neon ring round the platter
      const ring = new THREE.Mesh(new THREE.TorusGeometry(st.jog * 1.02, 0.003, 6, 36), lit(sx > 0 ? st.glow : 0xff38c8));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(cx, top + 0.008, 0.02);
      g.add(ring);
    }
    // performance pads: 2 rows of 4 in front of the jog
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) {
        const col = st.pads[(i + r) % st.pads.length];
        g.add(box(0.026, 0.006, 0.022, (i + r) % 3 === 0 ? lit(col) : std(col, 0.5), cx + (i - 1.5) * 0.03, top + 0.003, -D / 2 + 0.035 + r * 0.027));
      }
    }
    // play / cue buttons and the pitch fader on the outside edge
    g.add(cyl(0.009, 0.006, lit(0x7dff9a), cx + sx * (deckW / 2 - 0.035), top + 0.003, -0.05, 12));
    g.add(cyl(0.009, 0.006, lit(0xffb04d), cx + sx * (deckW / 2 - 0.035), top + 0.003, -0.075, 12));
    g.add(box(0.004, 0.002, 0.09, std(0x050505), cx + sx * (deckW / 2 - 0.02), top + 0.001, 0.05));
    g.add(box(0.016, 0.01, 0.01, trim, cx + sx * (deckW / 2 - 0.02), top + 0.005, 0.05));
    if (st.decks === 4) {
      // the big one: a row of browse knobs and loop buttons along the back
      for (let i = 0; i < 4; i++) g.add(cyl(0.006, 0.01, knob, cx + (i - 1.5) * 0.03, top + 0.005, D / 2 - 0.03, 10));
    }
  }

  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  // wrists rest just behind the jog wheels
  const left = new THREE.Object3D();
  left.position.set(mixW / 2 + deckW / 2, top + 0.06, -0.06);
  const right = new THREE.Object3D();
  right.position.set(-(mixW / 2 + deckW / 2), top + 0.06, -0.06);
  g.add(left, right);
  return { group: g, left, right };
}
