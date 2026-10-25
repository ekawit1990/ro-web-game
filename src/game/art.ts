import Phaser from 'phaser';
import { Appearance, CLASSES, ClassKey, HAIR_COLORS, MONSTERS } from '../data';
import type { Obj } from './maps';
import { TH, TW } from './iso';

/**
 * All art is drawn in code (no third-party or copyrighted assets), in a soft
 * hand-painted style inspired by classic isometric MMOs. Any texture key can be
 * swapped for a real sprite later with this.load.image(key, url).
 */

type Ctx = CanvasRenderingContext2D;

function mk(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, Math.ceil(w), Math.ceil(h))!;
  draw(tex.getContext());
  tex.refresh();
  return key;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function rng(seed: number) {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

function poly(c: Ctx, pts: number[][], fill: string, stroke?: string, lw = 1) {
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function ellipse(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

const diamond = (c: Ctx) => {
  c.beginPath();
  c.moveTo(TW / 2, 0);
  c.lineTo(TW, TH / 2);
  c.lineTo(TW / 2, TH);
  c.lineTo(0, TH / 2);
  c.closePath();
};

// ---------------------------------------------------------------- ground tiles

export const GROUND_VARIANTS = 3;

export function groundKey(scene: Phaser.Scene, type: number, v: number): string {
  return mk(scene, `g${type}_${v}`, TW, TH, (c) => {
    const r = rng(type * 97 + v * 13 + 5);
    c.save();
    diamond(c);
    c.clip();
    const base = ['#6aa84f', '#74b356', '#b8925f', '#a9a399', '#c9c1b2', '#3f86c9', '#6aa84f'][type];
    c.fillStyle = base;
    c.fillRect(0, 0, TW, TH);
    if (type === 0 || type === 1 || type === 6) {
      for (let i = 0; i < 26; i++) {
        c.fillStyle = r() < 0.5 ? shade(base, -18) : shade(base, 14);
        const x = r() * TW;
        const y = r() * TH;
        c.fillRect(x, y, 1.5, 3);
      }
      if (type === 6) {
        for (let i = 0; i < 5; i++) {
          c.fillStyle = ['#ff7eb6', '#fff27a', '#ffffff', '#b39ddb'][Math.floor(r() * 4)];
          c.beginPath();
          c.arc(12 + r() * 40, 8 + r() * 16, 2, 0, Math.PI * 2);
          c.fill();
        }
      }
    } else if (type === 2) {
      for (let i = 0; i < 14; i++) ellipse(c, r() * TW, r() * TH, 1.5 + r() * 2, 1 + r(), shade(base, r() < 0.5 ? -22 : 16));
    } else if (type === 3 || type === 4) {
      // cobblestones in staggered iso rows
      const big = type === 4;
      const sw = big ? 14 : 10;
      const sh = big ? 7 : 5;
      for (let row = -1; row < TH / sh + 1; row++) {
        for (let col = -1; col < TW / sw + 1; col++) {
          const x = col * sw + (row % 2 ? sw / 2 : 0) + (r() - 0.5) * 2;
          const y = row * sh + (r() - 0.5);
          const tone = (r() - 0.5) * 30;
          c.beginPath();
          c.ellipse(x + sw / 2, y + sh / 2, sw / 2 - 1, sh / 2 - 0.8, 0, 0, Math.PI * 2);
          c.fillStyle = shade(base, tone);
          c.fill();
          c.fillStyle = 'rgba(255,255,255,0.18)';
          c.fillRect(x + 2, y + 1, sw / 3, 1);
        }
      }
      c.fillStyle = 'rgba(60,50,40,0.18)';
      c.fillRect(0, 0, TW, TH);
      c.globalCompositeOperation = 'destination-over';
      c.fillStyle = shade(base, -45);
      c.fillRect(0, 0, TW, TH);
      c.globalCompositeOperation = 'source-over';
    } else if (type === 5) {
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        const x = 10 + r() * 40;
        const y = 6 + r() * 20;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 5, y - 3, x + 10, y);
        c.stroke();
      }
    }
    c.restore();
  });
}

// ---------------------------------------------------------------- map objects

const WALLS = ['#efe2c6', '#e6d3b0', '#d9cbb8'];
const ROOFS = ['#b5532f', '#4f6fa8', '#6b8e3d'];
const STRIPES: [string, string][] = [['#2e7d32', '#f1f1f1'], ['#3a5fa8', '#f1f1f1'], ['#c0392b', '#f6e7b4'], ['#e09a2d', '#fff4d6']];

/** Returns [textureKey, originX, originY] so that the origin sits on the object's front ground corner. */
export function objectKey(scene: Phaser.Scene, o: Obj, i: number): [string, number, number] {
  switch (o.kind) {
    case 'building': return building(scene, o, i);
    case 'stall': return stall(scene, o.color);
    case 'tree': return tree(scene, !!o.big);
    case 'bench': return [mk(scene, 'bench', 64, 48, drawBench), 0.5, 0.82];
    case 'lamp': return [mk(scene, 'lamp', 24, 96, drawLamp), 0.5, 0.96];
    case 'fountain': return [mk(scene, 'fountain', 200, 150, drawFountain), 0.5, 100 / 150];
    case 'crate': return [mk(scene, 'crate', 48, 50, drawCrate), 0.5, 0.86];
    case 'banner': return [mk(scene, `banner${o.color}`, 40, 120, (c) => drawBanner(c, o.color)), 0.5, 0.97];
    case 'rock': return [mk(scene, 'rock', 56, 40, drawRock), 0.5, 0.8];
  }
}

function building(scene: Phaser.Scene, o: Extract<Obj, { kind: 'building' }>, i: number): [string, number, number] {
  const { w, h } = o;
  const wallH = 46 + o.floors * 34;
  const roofH = 18 + Math.min(w, h) * 9;
  const W = (w + h) * (TW / 2);
  const H = (w + h) * (TH / 2) + wallH + roofH + 8;
  const Y0 = wallH + roofH + 6;
  const P = (a: number, b: number, up = 0) => [(a - b) * (TW / 2) + h * (TW / 2), (a + b) * (TH / 2) + Y0 - up];
  const key = mk(scene, `bld${i}`, W, H, (c) => {
    const wall = WALLS[o.wall % WALLS.length];
    const roof = ROOFS[o.roof % ROOFS.length];
    const beam = '#6d4a2b';
    // left wall (faces south-west)
    poly(c, [P(0, h), P(w, h), P(w, h, wallH), P(0, h, wallH)], shade(wall, -10), beam, 2);
    // right wall (faces south-east)
    poly(c, [P(w, h), P(w, 0), P(w, 0, wallH), P(w, h, wallH)], shade(wall, -38), beam, 2);
    // timber frame
    c.strokeStyle = beam;
    c.lineWidth = 3;
    for (let f = 1; f <= o.floors; f++) {
      const up = (wallH / (o.floors + 0.4)) * f;
      for (const [a0, b0, a1, b1] of [[0, h, w, h], [w, h, w, 0]]) {
        const s = P(a0, b0, up);
        const e = P(a1, b1, up);
        c.beginPath();
        c.moveTo(s[0], s[1]);
        c.lineTo(e[0], e[1]);
        c.stroke();
      }
    }
    for (let a = 0; a <= w; a += Math.max(1, Math.floor(w / 3))) {
      const s = P(a, h);
      const e = P(a, h, wallH);
      c.beginPath();
      c.moveTo(s[0], s[1]);
      c.lineTo(e[0], e[1]);
      c.stroke();
    }
    for (let b = 0; b <= h; b += Math.max(1, Math.floor(h / 2))) {
      const s = P(w, b);
      const e = P(w, b, wallH);
      c.beginPath();
      c.moveTo(s[0], s[1]);
      c.lineTo(e[0], e[1]);
      c.stroke();
    }
    // windows
    const win = (a: number, b: number, up: number, side: 'l' | 'r') => {
      const ww = 0.45;
      const wh = 18;
      const pts = side === 'l'
        ? [P(a, b, up), P(a + ww, b, up), P(a + ww, b, up + wh), P(a, b, up + wh)]
        : [P(a, b, up), P(a, b - ww, up), P(a, b - ww, up + wh), P(a, b, up + wh)];
      poly(c, pts, side === 'l' ? '#7fa7c9' : '#5b7f9e', '#f4efe4', 2);
    };
    for (let f = 0; f < o.floors; f++) {
      const up = 14 + f * (wallH / (o.floors + 0.4));
      for (let a = 0.8; a < w - 0.6; a += 1.6) if (!(f === 0 && Math.abs(a - w / 2) < 0.9)) win(a, h, up, 'l');
      for (let b = h - 0.8; b > 0.6; b -= 1.6) win(w, b, up, 'r');
    }
    // door
    poly(c, [P(w / 2 - 0.4, h), P(w / 2 + 0.4, h), P(w / 2 + 0.4, h, 30), P(w / 2 - 0.4, h, 30)], '#5a3a22', '#3b2414', 2);
    // gable roof along x
    const e = 0.35; // eaves
    const r0 = P(-e, h / 2, wallH + roofH);
    const r1 = P(w + e, h / 2, wallH + roofH);
    poly(c, [P(-e, -e, wallH - 4), P(w + e, -e, wallH - 4), r1, r0], shade(roof, -25));
    poly(c, [P(-e, h + e, wallH - 4), P(w + e, h + e, wallH - 4), r1, r0], roof, shade(roof, -40), 1.5);
    poly(c, [P(w + e, -e, wallH - 4), P(w + e, h + e, wallH - 4), r1], shade(roof, -50), shade(roof, -60), 1.5);
    // roof tile rows
    c.strokeStyle = shade(roof, -35);
    c.lineWidth = 1;
    for (let k = 1; k < 6; k++) {
      const t = k / 6;
      const s = [P(-e, h + e, wallH - 4), r0];
      const en = [P(w + e, h + e, wallH - 4), r1];
      const a = [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t];
      const b = [en[0][0] + (en[1][0] - en[0][0]) * t, en[0][1] + (en[1][1] - en[0][1]) * t];
      c.beginPath();
      c.moveTo(a[0], a[1]);
      c.lineTo(b[0], b[1]);
      c.stroke();
    }
    // chimney
    const ch = P(w * 0.7, h * 0.3, wallH + roofH * 0.7);
    c.fillStyle = '#8d6e63';
    c.fillRect(ch[0] - 5, ch[1] - 20, 10, 22);
  });
  // origin: the bottom (front) footprint corner
  const front = P(w, h);
  return [key, front[0] / W, front[1] / H];
}

function stall(scene: Phaser.Scene, color: number): [string, number, number] {
  const key = mk(scene, `stall${color}`, 130, 130, (c) => {
    const [a, b] = STRIPES[color % STRIPES.length];
    const P = (x: number, y: number, up = 0) => [(x - y) * 32 + 65, (x + y) * 16 + 62 - up];
    // counter box
    poly(c, [P(0, 2), P(2, 2), P(2, 2, 26), P(0, 2, 26)], '#8a5a2b', '#5a3a1a');
    poly(c, [P(2, 2), P(2, 0), P(2, 0, 26), P(2, 2, 26)], '#6d4520', '#5a3a1a');
    poly(c, [P(0, 0, 26), P(2, 0, 26), P(2, 2, 26), P(0, 2, 26)], '#a87440', '#5a3a1a');
    // goods
    const goods = ['#e53935', '#fdd835', '#43a047', '#fb8c00', '#8e24aa', '#7cb342'];
    for (let i = 0; i < 9; i++) {
      const g = P(0.35 + (i % 3) * 0.65, 0.35 + Math.floor(i / 3) * 0.65, 30);
      ellipse(c, g[0], g[1], 6, 4, goods[(i + color) % goods.length]);
    }
    // poles
    c.fillStyle = '#4e342e';
    for (const [x, y] of [[0, 2], [2, 2], [2, 0]]) {
      const p = P(x, y, 26);
      c.fillRect(p[0] - 1.5, p[1] - 34, 3, 34);
    }
    // striped awning (pyramid)
    const top = P(1, 1, 86);
    const corners = [P(-0.2, -0.2, 58), P(2.2, -0.2, 58), P(2.2, 2.2, 58), P(-0.2, 2.2, 58)];
    for (let s = 0; s < 4; s++) {
      const p0 = corners[s];
      const p1 = corners[(s + 1) % 4];
      for (let k = 0; k < 6; k++) {
        const t0 = k / 6;
        const t1 = (k + 1) / 6;
        const q0 = [p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0];
        const q1 = [p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1];
        const dark = s === 1 || s === 0 ? -25 : 0;
        poly(c, [q0, q1, top], shade(k % 2 ? b : a, dark).replace('rgb', 'rgb'));
      }
    }
    // scalloped edge
    for (const s of [2, 3]) {
      const p0 = corners[s];
      const p1 = corners[(s + 1) % 4];
      for (let k = 0; k < 6; k++) {
        const t = (k + 0.5) / 6;
        ellipse(c, p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t + 2, 5, 3.5, k % 2 ? b : a);
      }
    }
  });
  return [key, 0.5, (2 * 32 + 62) / 130];
}

function tree(scene: Phaser.Scene, big: boolean): [string, number, number] {
  const s = big ? 1.35 : 1;
  const key = mk(scene, big ? 'tree_big' : 'tree', 90 * s, 120 * s, (c) => {
    c.scale(s, s);
    ellipse(c, 45, 108, 30, 10, 'rgba(0,0,0,0.25)');
    c.fillStyle = '#6b4423';
    c.beginPath();
    c.moveTo(39, 108);
    c.lineTo(42, 70);
    c.lineTo(48, 70);
    c.lineTo(52, 108);
    c.fill();
    const blobs: [number, number, number, string][] = [
      [45, 52, 30, '#2e6b2f'], [24, 62, 18, '#2e6b2f'], [66, 62, 18, '#2e6b2f'], [45, 38, 24, '#3a8a3c'],
      [32, 48, 16, '#3a8a3c'], [58, 50, 16, '#3a8a3c'], [40, 30, 12, '#5cae4f'], [54, 40, 9, '#5cae4f'], [30, 58, 7, '#5cae4f'],
    ];
    for (const [x, y, r, col] of blobs) ellipse(c, x, y, r, r * 0.9, col);
  });
  return [key, 0.5, 0.9];
}

function drawBench(c: Ctx) {
  const P = (x: number, y: number, up = 0) => [(x - y) * 26 + 32, (x + y) * 13 + 22 - up];
  c.fillStyle = '#333';
  for (const [x, y] of [[0.1, 0.9], [1.4, 0.9], [1.4, 0.4]]) {
    const p = P(x, y);
    c.fillRect(p[0] - 1, p[1] - 12, 2, 12);
  }
  poly(c, [P(0, 0.3, 12), P(1.5, 0.3, 12), P(1.5, 1, 12), P(0, 1, 12)], '#2e7d32', '#1b5e20');
  poly(c, [P(0, 0.3, 12), P(1.5, 0.3, 12), P(1.5, 0.3, 26), P(0, 0.3, 26)], '#388e3c', '#1b5e20');
}

function drawLamp(c: Ctx) {
  ellipse(c, 12, 92, 8, 3, 'rgba(0,0,0,0.25)');
  c.fillStyle = '#37474f';
  c.fillRect(10, 22, 4, 70);
  c.fillRect(6, 88, 12, 4);
  c.fillStyle = '#263238';
  c.fillRect(4, 10, 16, 4);
  c.fillStyle = '#ffe082';
  c.fillRect(6, 14, 12, 12);
  c.fillStyle = '#263238';
  c.beginPath();
  c.moveTo(3, 10);
  c.lineTo(12, 2);
  c.lineTo(21, 10);
  c.fill();
}

function drawFountain(c: Ctx) {
  ellipse(c, 100, 118, 92, 34, 'rgba(0,0,0,0.2)');
  ellipse(c, 100, 108, 90, 36, '#9e9e9e');
  ellipse(c, 100, 100, 90, 36, '#c7c2b6');
  ellipse(c, 100, 100, 78, 29, '#4a90d9');
  ellipse(c, 92, 94, 40, 10, 'rgba(255,255,255,0.25)');
  c.fillStyle = '#bdb6a8';
  c.fillRect(92, 44, 16, 56);
  ellipse(c, 100, 46, 26, 9, '#c7c2b6');
  ellipse(c, 100, 44, 20, 6, '#4a90d9');
  c.strokeStyle = 'rgba(200,230,255,0.9)';
  c.lineWidth = 2;
  for (const dx of [-14, -6, 6, 14]) {
    c.beginPath();
    c.moveTo(100, 30);
    c.quadraticCurveTo(100 + dx * 2, 22, 100 + dx * 3.2, 74);
    c.stroke();
  }
  ellipse(c, 100, 28, 6, 6, '#e3f2fd');
}

function drawCrate(c: Ctx) {
  const P = (x: number, y: number, up = 0) => [(x - y) * 22 + 24, (x + y) * 11 + 20 - up];
  poly(c, [P(0, 1), P(1, 1), P(1, 1, 22), P(0, 1, 22)], '#a1764a', '#5d4037', 1.5);
  poly(c, [P(1, 1), P(1, 0), P(1, 0, 22), P(1, 1, 22)], '#7f5a35', '#5d4037', 1.5);
  poly(c, [P(0, 0, 22), P(1, 0, 22), P(1, 1, 22), P(0, 1, 22)], '#bf9363', '#5d4037', 1.5);
}

function drawBanner(c: Ctx, color: number) {
  const col = ['#3a5fa8', '#b71c1c'][color % 2];
  c.fillStyle = '#5d4037';
  c.fillRect(18, 6, 4, 112);
  c.fillStyle = '#d4af37';
  c.fillRect(6, 10, 28, 4);
  poly(c, [[8, 14], [32, 14], [32, 72], [20, 64], [8, 72]], col, shade(col, -40));
  c.fillStyle = '#fff3c4';
  c.font = 'bold 20px serif';
  c.textAlign = 'center';
  c.fillText('♪', 20, 46);
}

function drawRock(c: Ctx) {
  ellipse(c, 28, 32, 24, 7, 'rgba(0,0,0,0.25)');
  poly(c, [[6, 30], [12, 12], [26, 6], [42, 10], [50, 28], [36, 34], [16, 34]], '#8d8d8d', '#616161');
  poly(c, [[12, 12], [26, 6], [30, 18], [18, 22]], '#a8a8a8');
}

// ---------------------------------------------------------------- characters

export interface Look extends Appearance {
  cls?: ClassKey;
  body?: string; // NPC outfit colour
}

const SKIN = '#ffe0c4';

/** A character sprite, facing the viewer ('f') or away ('b'). Origin = feet. */
export function charKey(scene: Phaser.Scene, look: Look, dir: 'f' | 'b'): string {
  const key = `pc_${look.cls ?? 'npc'}_${look.body ?? ''}_${look.gender}_${look.hair}_${look.hair_color}_${look.face}_${dir}`;
  return mk(scene, key, 60, 84, (c) => paintChar(c, look, dir));
}

/** Draws a character on any 60x84 canvas (also used by the character creator preview). */
export function paintChar(c: Ctx, look: Look, dir: 'f' | 'b') {
  const cls = look.cls ? CLASSES[look.cls] : null;
  const outfit = look.body ?? cls?.color ?? '#888';
  const hair = HAIR_COLORS[look.hair_color] ?? HAIR_COLORS[0];
  const female = look.gender === 'f';
  const cx = 30;
  const back = dir === 'b';

  ellipse(c, cx, 80, 13, 4, 'rgba(0,0,0,0.28)');
  if (back && look.cls) drawInstrument(c, look.cls, cx, true);
  drawHairBack(c, look.hair, female, hair, cx, back);
  // legs
  c.fillStyle = '#4a3b35';
  c.fillRect(cx - 7, 66, 5, 12);
  c.fillRect(cx + 2, 66, 5, 12);
  c.fillStyle = '#3a2a22';
  c.fillRect(cx - 8, 76, 7, 3);
  c.fillRect(cx + 1, 76, 7, 3);
  // body
  if (female) {
    poly(c, [[cx - 9, 50], [cx + 9, 50], [cx + 13, 70], [cx - 13, 70]], outfit, shade(outfit, -50));
  } else {
    c.fillStyle = shade(outfit, -35);
    c.fillRect(cx - 9, 62, 18, 6);
    poly(c, [[cx - 10, 49], [cx + 10, 49], [cx + 10, 64], [cx - 10, 64]], outfit, shade(outfit, -50));
  }
  c.fillStyle = shade(outfit, 35);
  c.fillRect(cx - 3, 50, 6, back ? 0 : 10);
  // arms
  c.fillStyle = shade(outfit, -15);
  c.fillRect(cx - 14, 51, 5, 12);
  c.fillRect(cx + 9, 51, 5, 12);
  ellipse(c, cx - 11.5, 64, 3, 3, SKIN);
  ellipse(c, cx + 11.5, 64, 3, 3, SKIN);
  // big chibi head
  ellipse(c, cx, 32, 17, 18, SKIN);
  if (!back) drawFace(c, look.face, female, cx);
  drawHairFront(c, look.hair, female, hair, cx, back);
  if (!back && look.cls) drawInstrument(c, look.cls, cx, false);
}

function drawFace(c: Ctx, face: number, female: boolean, cx: number) {
  const ey = 35;
  c.fillStyle = '#2b1b14';
  if (face === 0) {
    // big round eyes
    for (const s of [-1, 1]) {
      ellipse(c, cx + s * 6.5, ey, 3, 4, '#2b1b14');
      ellipse(c, cx + s * 6.5 - 1, ey - 1.5, 1.2, 1.2, '#fff');
    }
  } else if (face === 1) {
    // happy closed eyes
    c.strokeStyle = '#2b1b14';
    c.lineWidth = 1.8;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(cx + s * 6.5, ey + 1, 3, Math.PI * 1.1, Math.PI * 1.9);
      c.stroke();
    }
  } else if (face === 2) {
    // sharp eyes
    for (const s of [-1, 1]) poly(c, [[cx + s * 3.5, ey - 1], [cx + s * 9.5, ey - 3], [cx + s * 9, ey + 2], [cx + s * 4, ey + 2]], '#2b1b14');
  } else {
    // sleepy eyes
    for (const s of [-1, 1]) c.fillRect(cx + s * 6.5 - 3, ey, 6, 2);
  }
  if (female) {
    c.strokeStyle = '#2b1b14';
    c.lineWidth = 1;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + s * 9, ey - 3);
      c.lineTo(cx + s * 11, ey - 5);
      c.stroke();
    }
    ellipse(c, cx - 10, ey + 6, 2.5, 1.5, 'rgba(255,120,120,0.45)');
    ellipse(c, cx + 10, ey + 6, 2.5, 1.5, 'rgba(255,120,120,0.45)');
  }
  c.fillStyle = '#c0605a';
  c.fillRect(cx - 1.5, ey + 8, 3, 1.5);
}

/** Hair behind the head (long styles), drawn first. */
function drawHairBack(c: Ctx, style: number, female: boolean, col: string, cx: number, back: boolean) {
  const dark = shade(col, -30);
  if (style === 4 || (female && style === 2)) {
    poly(c, [[cx - 17, 28], [cx + 17, 28], [cx + 16, 60], [cx - 16, 60]], back ? col : dark);
  }
  if (style === 3) {
    // ponytail
    ellipse(c, cx + (back ? 0 : 14), 30, 6, 6, dark);
    poly(c, [[cx + (back ? -5 : 12), 30], [cx + (back ? 5 : 20), 30], [cx + (back ? 3 : 20), 56], [cx + (back ? -3 : 14), 56]], back ? col : dark);
  }
  if (style === 5) {
    // twin buns / tails
    for (const s of [-1, 1]) {
      ellipse(c, cx + s * 17, 24, 7, 7, col);
      if (female) poly(c, [[cx + s * 14, 26], [cx + s * 21, 26], [cx + s * 20, 52], [cx + s * 15, 52]], dark);
    }
  }
}

function drawHairFront(c: Ctx, style: number, female: boolean, col: string, cx: number, back: boolean) {
  const light = shade(col, 35);
  // skull cap
  c.beginPath();
  c.ellipse(cx, back ? 30 : 26, 18, back ? 18 : 15, 0, Math.PI, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  if (back) {
    ellipse(c, cx, 32, 17.5, 16, col);
    if (style === 4 || (female && style === 2)) poly(c, [[cx - 17, 32], [cx + 17, 32], [cx + 15, 58], [cx - 15, 58]], col);
    return;
  }
  if (style === 0) {
    // spiky
    for (let i = -3; i <= 3; i++) poly(c, [[cx + i * 5 - 4, 24], [cx + i * 5 + 4, 24], [cx + i * 6, 10 - Math.abs(i)]], col);
    poly(c, [[cx - 16, 24], [cx + 16, 24], [cx + 12, 31], [cx + 4, 27], [cx - 3, 32], [cx - 10, 27], [cx - 16, 31]], col);
  } else if (style === 1) {
    // neat bowl cut
    poly(c, [[cx - 18, 26], [cx + 18, 26], [cx + 18, 34], [cx - 18, 34]], col);
    c.fillStyle = SKIN;
    c.fillRect(cx - 12, 30, 24, 5);
    poly(c, [[cx - 18, 26], [cx + 18, 26], [cx + 15, 31], [cx - 15, 31]], col);
  } else if (style === 2) {
    // long side-swept bangs
    poly(c, [[cx - 18, 24], [cx + 18, 22], [cx + 16, 30], [cx - 4, 34], [cx - 17, 40]], col);
  } else if (style === 3) {
    poly(c, [[cx - 17, 24], [cx + 17, 24], [cx + 14, 30], [cx, 28], [cx - 14, 31]], col);
  } else if (style === 4) {
    poly(c, [[cx - 18, 24], [cx + 18, 24], [cx + 18, 54], [cx + 13, 54], [cx + 12, 32], [cx - 12, 32], [cx - 13, 54], [cx - 18, 54]], col);
    poly(c, [[cx - 14, 26], [cx + 14, 26], [cx + 10, 32], [cx - 10, 32]], col);
  } else {
    poly(c, [[cx - 17, 24], [cx + 17, 24], [cx + 12, 31], [cx - 12, 31]], col);
  }
  c.fillStyle = light;
  c.fillRect(cx - 8, 15, 10, 2);
}

function drawInstrument(c: Ctx, cls: ClassKey, cx: number, back: boolean) {
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, w: number) => {
    c.strokeStyle = color;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  };
  if (back) {
    // carried on the back
    if (cls === 'guitarist' || cls === 'bassist') {
      line(cx - 6, 72, cx + 10, 30, '#3b2410', 3);
      ellipse(c, cx - 4, 64, 9, 11, cls === 'bassist' ? '#4a2f78' : '#c8742a');
    } else if (cls === 'keyboardist') {
      poly(c, [[cx - 16, 50], [cx + 16, 44], [cx + 16, 52], [cx - 16, 58]], '#263238');
    } else if (cls === 'drummer') {
      line(cx - 6, 46, cx - 2, 70, '#e3c18f', 2.5);
      line(cx + 6, 46, cx + 2, 70, '#e3c18f', 2.5);
    }
    return;
  }
  if (cls === 'singer') {
    line(cx + 13, 62, cx + 14, 48, '#222', 3);
    ellipse(c, cx + 14, 45, 4.5, 4.5, '#9aa0a6');
    ellipse(c, cx + 13, 44, 1.6, 1.6, '#eee');
    c.strokeStyle = '#222';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx + 13, 63);
    c.quadraticCurveTo(cx + 22, 72, cx + 16, 82);
    c.stroke();
  } else if (cls === 'guitarist' || cls === 'bassist') {
    const bass = cls === 'bassist';
    const body = bass ? '#5a3a8a' : '#d9822b';
    line(cx, 60, cx + 26, bass ? 28 : 34, '#6b4320', bass ? 3.5 : 3);
    line(cx + 24, bass ? 30 : 36, cx + 28, bass ? 25 : 31, '#2a180a', 5);
    ellipse(c, cx - 6, 64, bass ? 10 : 9, bass ? 9 : 8, body);
    ellipse(c, cx + 1, 58, bass ? 7 : 6.5, bass ? 6.5 : 6, body);
    if (bass) {
      c.fillStyle = '#eee';
      c.fillRect(cx - 11, 63, 9, 2);
    } else ellipse(c, cx - 3, 61, 2.6, 2.6, '#2a180a');
    ellipse(c, cx + 16, 44, 3, 3, SKIN);
  } else if (cls === 'drummer') {
    line(cx - 12, 64, cx - 22, 44, '#e3c18f', 3);
    line(cx + 12, 64, cx + 22, 44, '#e3c18f', 3);
    ellipse(c, cx - 22, 44, 2.2, 2.2, '#f3dcb5');
    ellipse(c, cx + 22, 44, 2.2, 2.2, '#f3dcb5');
  } else if (cls === 'keyboardist') {
    c.save();
    c.translate(cx, 60);
    c.rotate(-0.2);
    c.fillStyle = '#263238';
    c.beginPath();
    c.roundRect(-22, -6, 44, 12, 2);
    c.fill();
    c.fillStyle = '#fafafa';
    c.fillRect(-19, -3, 34, 7);
    c.fillStyle = '#222';
    for (let x = -17; x < 14; x += 4) c.fillRect(x, -3, 1.8, 4);
    c.fillStyle = '#40c4ff';
    c.fillRect(16, -4, 4, 3);
    c.restore();
  }
}

/** Headgear drawn on top of the head. Origin = feet, same canvas as characters. */
const HATS: Record<string, (c: Ctx) => void> = {
    note_ribbon: (c) => {
      poly(c, [[30, 14], [18, 6], [18, 22]], '#ff6fae', '#c2185b');
      poly(c, [[30, 14], [42, 6], [42, 22]], '#ff6fae', '#c2185b');
      ellipse(c, 30, 14, 4, 4, '#ff3d8b');
    },
    headphones: (c) => {
      c.strokeStyle = '#37474f';
      c.lineWidth = 4;
      c.beginPath();
      c.arc(30, 32, 19, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
      ellipse(c, 12, 34, 5, 8, '#263238');
      ellipse(c, 48, 34, 5, 8, '#263238');
      ellipse(c, 12, 34, 2.5, 5, '#ef5350');
      ellipse(c, 48, 34, 2.5, 5, '#ef5350');
    },
    rock_cap: (c) => {
      c.beginPath();
      c.ellipse(30, 22, 19, 12, 0, Math.PI, Math.PI * 2);
      c.fillStyle = '#212121';
      c.fill();
      poly(c, [[12, 22], [52, 22], [56, 27], [20, 27]], '#111');
      c.fillStyle = '#ffd600';
      c.font = 'bold 11px sans-serif';
      c.fillText('★', 26, 20);
    },
};

export function hatKey(scene: Phaser.Scene, item: string): string | null {
  if (!HATS[item]) return null;
  return mk(scene, `hat_${item}`, 60, 84, HATS[item]);
}

export function paintHat(c: Ctx, item: string) {
  HATS[item]?.(c);
}

// ---------------------------------------------------------------- monsters

export function monsterKey(scene: Phaser.Scene, id: string): string {
  const m = MONSTERS[id];
  const s = m.size;
  const w = Math.round(56 * s);
  const h = Math.round(56 * s) + (m.boss ? 20 : 0);
  return mk(scene, `mon_${id}`, w, h, (c) => drawMonster(c, id, w, h, m.color, !!m.boss));
}

function drawMonster(c: Ctx, id: string, w: number, h: number, color: string, boss: boolean) {
  const cx = w / 2;
  const base = h - 5;
  const r = w * 0.36;
  const cy = base - r * 0.95;
  ellipse(c, cx, base, w * 0.34, w * 0.09, 'rgba(0,0,0,0.25)');
  const eyes = (y: number, spread = 0.32, size = 0.11) => {
    for (const sx of [-1, 1]) {
      ellipse(c, cx + sx * r * spread, y, Math.max(2, r * size), Math.max(2.4, r * size * 1.25), '#1a1a1a');
      ellipse(c, cx + sx * r * spread - 1, y - 1.5, Math.max(0.8, r * 0.04), Math.max(0.8, r * 0.04), '#fff');
    }
  };
  const blob = (col: string) => {
    c.beginPath();
    c.moveTo(cx - r, base - 2);
    c.quadraticCurveTo(cx - r * 1.08, cy - r * 0.95, cx, cy - r);
    c.quadraticCurveTo(cx + r * 1.08, cy - r * 0.95, cx + r, base - 2);
    c.closePath();
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.5, r * 0.1, cx, cy, r * 1.2);
    g.addColorStop(0, shade(col, 50));
    g.addColorStop(1, col);
    c.fillStyle = g;
    c.fill();
    ellipse(c, cx - r * 0.38, cy - r * 0.48, r * 0.22, r * 0.12, 'rgba(255,255,255,0.6)');
  };

  switch (id) {
    case 'drop': {
      c.beginPath();
      c.moveTo(cx, cy - r * 1.5);
      c.quadraticCurveTo(cx + r * 1.1, cy, cx + r * 0.85, base - r * 0.3);
      c.arc(cx, base - r * 0.5, r * 0.85, 0, Math.PI);
      c.quadraticCurveTo(cx - r * 1.1, cy, cx, cy - r * 1.5);
      const g = c.createLinearGradient(cx - r, cy - r, cx + r, base);
      g.addColorStop(0, shade(color, 60));
      g.addColorStop(1, color);
      c.fillStyle = g;
      c.fill();
      ellipse(c, cx - r * 0.35, cy - r * 0.2, r * 0.15, r * 0.3, 'rgba(255,255,255,0.6)');
      eyes(cy + r * 0.25);
      break;
    }
    case 'chick': {
      ellipse(c, cx, cy + r * 0.1, r * 0.95, r * 0.9, color);
      ellipse(c, cx - r * 0.85, cy + r * 0.15, r * 0.3, r * 0.2, shade(color, -25));
      ellipse(c, cx + r * 0.85, cy + r * 0.15, r * 0.3, r * 0.2, shade(color, -25));
      poly(c, [[cx - r * 0.15, cy + r * 0.15], [cx + r * 0.15, cy + r * 0.15], [cx, cy + r * 0.38]], '#ff8f00');
      poly(c, [[cx - 2, cy - r * 0.85], [cx + 3, cy - r * 1.2], [cx + 4, cy - r * 0.8]], shade(color, -15));
      eyes(cy - r * 0.1, 0.35, 0.1);
      c.fillStyle = '#ff8f00';
      c.fillRect(cx - r * 0.4, base - 4, 3, 4);
      c.fillRect(cx + r * 0.3, base - 4, 3, 4);
      break;
    }
    case 'mushy': {
      c.fillStyle = '#f3e3c8';
      c.fillRect(cx - r * 0.45, cy - r * 0.1, r * 0.9, r * 1.0);
      c.beginPath();
      c.ellipse(cx, cy - r * 0.1, r * 1.05, r * 0.75, 0, Math.PI, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
      for (const [dx, dy] of [[-0.55, -0.45], [0.3, -0.6], [0.05, -0.3], [0.65, -0.25]]) ellipse(c, cx + dx * r, cy + dy * r, r * 0.12, r * 0.1, '#fff');
      eyes(cy + r * 0.38, 0.22, 0.09);
      break;
    }
    case 'rabbit': {
      for (const sx of [-1, 1]) {
        ellipse(c, cx + sx * r * 0.35, cy - r * 1.05, r * 0.18, r * 0.55, color);
        ellipse(c, cx + sx * r * 0.35, cy - r * 1.05, r * 0.08, r * 0.4, '#f8bbd0');
      }
      ellipse(c, cx, cy + r * 0.05, r * 0.9, r * 0.85, color);
      ellipse(c, cx, cy + r * 0.05, r * 0.9, r * 0.85, 'rgba(0,0,0,0.04)');
      eyes(cy - r * 0.05, 0.35, 0.1);
      ellipse(c, cx, cy + r * 0.25, r * 0.08, r * 0.06, '#e91e63');
      c.fillStyle = '#e53935';
      c.font = `${Math.round(r * 0.6)}px sans-serif`;
      c.fillText('♪', cx + r * 0.5, cy - r * 0.6);
      break;
    }
    case 'buzzer': {
      ellipse(c, cx - r * 0.55, cy - r * 0.85, r * 0.5, r * 0.32, 'rgba(255,255,255,0.75)');
      ellipse(c, cx + r * 0.55, cy - r * 0.85, r * 0.5, r * 0.32, 'rgba(255,255,255,0.75)');
      ellipse(c, cx, cy, r, r * 0.78, color);
      c.fillStyle = '#2b2b2b';
      c.fillRect(cx - r * 0.25, cy - r * 0.74, r * 0.2, r * 1.48);
      c.fillRect(cx + r * 0.25, cy - r * 0.66, r * 0.2, r * 1.32);
      eyes(cy - r * 0.05, 0.6, 0.1);
      poly(c, [[cx + r * 0.9, cy + r * 0.1], [cx + r * 1.3, cy + r * 0.25], [cx + r * 0.9, cy + r * 0.35]], '#2b2b2b');
      break;
    }
    case 'frog': {
      ellipse(c, cx, cy + r * 0.2, r * 1.05, r * 0.75, color);
      ellipse(c, cx, cy + r * 0.35, r * 0.7, r * 0.45, shade(color, 45));
      for (const sx of [-1, 1]) {
        ellipse(c, cx + sx * r * 0.45, cy - r * 0.45, r * 0.3, r * 0.3, color);
        ellipse(c, cx + sx * r * 0.45, cy - r * 0.45, r * 0.18, r * 0.2, '#fff');
        ellipse(c, cx + sx * r * 0.45, cy - r * 0.42, r * 0.09, r * 0.12, '#111');
      }
      c.strokeStyle = shade(color, -60);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy + r * 0.05, r * 0.35, 0.2, Math.PI - 0.2);
      c.stroke();
      break;
    }
    case 'bat': {
      for (const sx of [-1, 1]) {
        poly(c, [[cx + sx * r * 0.4, cy - r * 0.2], [cx + sx * r * 1.4, cy - r * 0.9], [cx + sx * r * 1.25, cy - r * 0.2],
          [cx + sx * r * 1.4, cy + r * 0.25], [cx + sx * r * 0.9, cy + r * 0.05], [cx + sx * r * 0.5, cy + r * 0.35]], shade(color, -20));
      }
      ellipse(c, cx, cy, r * 0.6, r * 0.62, color);
      poly(c, [[cx - r * 0.45, cy - r * 0.35], [cx - r * 0.3, cy - r * 0.95], [cx - r * 0.1, cy - r * 0.45]], color);
      poly(c, [[cx + r * 0.45, cy - r * 0.35], [cx + r * 0.3, cy - r * 0.95], [cx + r * 0.1, cy - r * 0.45]], color);
      ellipse(c, cx - r * 0.22, cy - r * 0.05, r * 0.1, r * 0.12, '#ffeb3b');
      ellipse(c, cx + r * 0.22, cy - r * 0.05, r * 0.1, r * 0.12, '#ffeb3b');
      poly(c, [[cx - r * 0.1, cy + r * 0.2], [cx - r * 0.04, cy + r * 0.35], [cx + r * 0.02, cy + r * 0.2]], '#fff');
      break;
    }
    case 'rocky': {
      poly(c, [[cx - r, base - 2], [cx - r * 0.85, cy - r * 0.55], [cx - r * 0.1, cy - r], [cx + r * 0.75, cy - r * 0.7], [cx + r, base - 2]], color, shade(color, -40), 2);
      poly(c, [[cx - r * 0.85, cy - r * 0.55], [cx - r * 0.1, cy - r], [cx, cy - r * 0.3], [cx - r * 0.5, cy - r * 0.2]], shade(color, 25));
      eyes(cy + r * 0.05, 0.3, 0.1);
      c.fillStyle = '#222';
      c.fillRect(cx - r * 0.5, cy - r * 0.25, r * 0.35, 2.5);
      c.fillRect(cx + r * 0.15, cy - r * 0.25, r * 0.35, 2.5);
      break;
    }
    case 'metronome': {
      poly(c, [[cx - r * 0.85, base - 2], [cx + r * 0.85, base - 2], [cx + r * 0.35, cy - r * 1.15], [cx - r * 0.35, cy - r * 1.15]], color, shade(color, -45), 2);
      poly(c, [[cx - r * 0.5, base - 6], [cx + r * 0.5, base - 6], [cx + r * 0.25, cy - r * 0.6], [cx - r * 0.25, cy - r * 0.6]], '#efebe9');
      c.strokeStyle = '#424242';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(cx, base - 10);
      c.lineTo(cx + r * 0.4, cy - r * 1.05);
      c.stroke();
      c.fillStyle = '#ffb300';
      c.fillRect(cx + r * 0.18, cy - r * 0.5, 8, 6);
      eyes(cy + r * 0.3, 0.28, 0.09);
      break;
    }
    default:
      blob(color);
      eyes(cy);
  }
  if (boss) {
    const top = cy - r - 4;
    poly(c, [[cx - r * 0.5, top], [cx - r * 0.5, top - 16], [cx - r * 0.22, top - 7], [cx, top - 18], [cx + r * 0.22, top - 7],
      [cx + r * 0.5, top - 16], [cx + r * 0.5, top]], '#ffd700', '#b8860b', 1.5);
    ellipse(c, cx, top - 6, 3, 3, '#e53935');
  }
}

// ---------------------------------------------------------------- effects

export function makeEffectTextures(scene: Phaser.Scene) {
  const glyph = (key: string, text: string, color: string) =>
    mk(scene, key, 26, 26, (c) => {
      c.font = 'bold 22px sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,0.6)';
      c.strokeText(text, 13, 14);
      c.fillStyle = color;
      c.fillText(text, 13, 14);
    });
  glyph('note', '♪', '#ffd166');
  glyph('chord', '♫', '#7ff0e6');
  mk(scene, 'wave', 24, 24, (c) => {
    c.lineWidth = 2.5;
    [5, 8, 11].forEach((r, i) => {
      c.strokeStyle = `rgba(255,140,200,${1 - i * 0.25})`;
      c.beginPath();
      c.arc(5, 12, r, -0.9, 0.9);
      c.stroke();
    });
  });
  mk(scene, 'spark', 32, 32, (c) => {
    const g = c.createRadialGradient(16, 16, 1, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,240,150,0.8)');
    g.addColorStop(1, 'rgba(255,200,50,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  });
  mk(scene, 'marker', 40, 20, (c) => {
    c.strokeStyle = '#7ff0e6';
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(20, 10, 16, 7, 0, 0, Math.PI * 2);
    c.stroke();
  });
  mk(scene, 'portal', 96, 64, (c) => {
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = `rgba(${90 + i * 30},${170 + i * 20},255,${0.9 - i * 0.15})`;
      c.lineWidth = 4;
      c.beginPath();
      c.ellipse(48, 32, 40 - i * 9, 20 - i * 4.5, 0, 0, Math.PI * 2);
      c.stroke();
    }
    const g = c.createRadialGradient(48, 32, 2, 48, 32, 40);
    g.addColorStop(0, 'rgba(200,240,255,0.9)');
    g.addColorStop(1, 'rgba(80,160,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(48, 32, 40, 20, 0, 0, Math.PI * 2);
    c.fill();
  });
}
