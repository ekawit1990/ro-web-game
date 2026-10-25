import Phaser from 'phaser';
import { CLASSES, ClassKey, MONSTERS } from '../data';
import { NPCS, TILE } from './map';

/**
 * All art is drawn in code, so the game ships with no third-party or copyrighted assets.
 * Replace any texture key with a real sprite sheet later (e.g. this.load.image('tree', ...)).
 */

function canvas(scene: Phaser.Scene, key: string, w: number, h: number) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  return { tex, ctx: tex.getContext() };
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function speckle(ctx: CanvasRenderingContext2D, ox: number, color: string, n: number, seed: number) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const x = (seed / 233280) * TILE;
    seed = (seed * 9301 + 49297) % 233280;
    const y = (seed / 233280) * TILE;
    ctx.fillRect(ox + x, y, 2, 2);
  }
}

function drawTiles(scene: Phaser.Scene) {
  const { tex, ctx } = canvas(scene, 'tiles', TILE * 7, TILE);
  // 0 grass
  ctx.fillStyle = '#6dbb4f';
  ctx.fillRect(0, 0, TILE, TILE);
  speckle(ctx, 0, '#5ea844', 14, 1);
  // 1 grass 2
  ctx.fillStyle = '#74c256';
  ctx.fillRect(TILE, 0, TILE, TILE);
  speckle(ctx, TILE, '#86d066', 10, 7);
  // 2 dirt
  ctx.fillStyle = '#c9a26b';
  ctx.fillRect(TILE * 2, 0, TILE, TILE);
  speckle(ctx, TILE * 2, '#b38d58', 16, 3);
  // 3 stone floor
  ctx.fillStyle = '#c7c2b6';
  ctx.fillRect(TILE * 3, 0, TILE, TILE);
  ctx.strokeStyle = '#a9a396';
  ctx.lineWidth = 1;
  ctx.strokeRect(TILE * 3 + 0.5, 0.5, TILE / 2, TILE / 2);
  ctx.strokeRect(TILE * 3 + TILE / 2 + 0.5, TILE / 2 + 0.5, TILE / 2 - 1, TILE / 2 - 1);
  // 4 water
  ctx.fillStyle = '#3d8fd6';
  ctx.fillRect(TILE * 4, 0, TILE, TILE);
  ctx.strokeStyle = '#7fc0f0';
  ctx.beginPath();
  ctx.moveTo(TILE * 4 + 6, 12);
  ctx.quadraticCurveTo(TILE * 4 + 11, 8, TILE * 4 + 16, 12);
  ctx.moveTo(TILE * 4 + 16, 24);
  ctx.quadraticCurveTo(TILE * 4 + 21, 20, TILE * 4 + 26, 24);
  ctx.stroke();
  // 5 fence (on stone)
  ctx.fillStyle = '#c7c2b6';
  ctx.fillRect(TILE * 5, 0, TILE, TILE);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(TILE * 5 + 2, 10, TILE - 4, 5);
  ctx.fillRect(TILE * 5 + 2, 20, TILE - 4, 5);
  ctx.fillStyle = '#6b4320';
  ctx.fillRect(TILE * 5 + 4, 4, 6, 26);
  ctx.fillRect(TILE * 5 + 22, 4, 6, 26);
  // 6 flowers
  ctx.fillStyle = '#6dbb4f';
  ctx.fillRect(TILE * 6, 0, TILE, TILE);
  const flowers: [number, number, string][] = [[8, 9, '#ff7eb6'], [22, 14, '#fff27a'], [13, 24, '#ffffff'], [25, 26, '#ff7eb6']];
  for (const [x, y, c] of flowers) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(TILE * 6 + x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.refresh();
}

function drawTree(scene: Phaser.Scene) {
  const { tex, ctx } = canvas(scene, 'tree', 44, 60);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(22, 54, 15, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7b4a26';
  ctx.fillRect(18, 34, 8, 20);
  const blobs: [number, number, number, string][] = [
    [22, 22, 17, '#2f7d32'], [13, 28, 11, '#2f7d32'], [31, 28, 11, '#2f7d32'], [22, 16, 12, '#3f9a43'], [17, 20, 6, '#58b55c'],
  ];
  for (const [x, y, r, c] of blobs) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  tex.refresh();
}

function drawPerson(scene: Phaser.Scene, key: string, body: string, hair: string, instrument?: ClassKey | 'none') {
  const { tex, ctx } = canvas(scene, key, 44, 50);
  ctx.save();
  ctx.translate(4, 1); // person is drawn 36px wide, centred in the 44px canvas
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(18, 44, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // legs
  ctx.fillStyle = '#3b3b4f';
  ctx.fillRect(12, 34, 5, 9);
  ctx.fillRect(19, 34, 5, 9);
  // body
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(9, 20, 18, 17, 5);
  ctx.fill();
  ctx.fillStyle = shade(body, -40);
  ctx.fillRect(9, 31, 18, 3);
  // head
  ctx.fillStyle = '#ffd9b3';
  ctx.beginPath();
  ctx.arc(18, 13, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.arc(18, 10, 9.5, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(9, 9, 4, 7);
  ctx.fillStyle = '#222';
  ctx.fillRect(20, 13, 2, 3);
  ctx.fillRect(24, 13, 2, 3);
  ctx.restore();

  // instruments are drawn in front of the body, in canvas coordinates (centre x = 22)
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, w: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  const dot = (x: number, y: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  const hand = (x: number, y: number) => dot(x, y, 2.6, '#ffd9b3');

  if (instrument === 'singer') {
    // microphone with a cable
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(35, 31);
    ctx.quadraticCurveTo(40, 40, 34, 47);
    ctx.stroke();
    line(35, 31, 34, 22, '#222', 3);
    hand(35, 28);
    dot(34, 19, 4, '#9aa0a6');
    dot(33, 18, 1.4, '#e0e0e0');
  } else if (instrument === 'guitarist' || instrument === 'bassist') {
    const bass = instrument === 'bassist';
    const bodyColor = bass ? '#5a3a8a' : '#d9822b';
    // neck + headstock
    line(22, 30, bass ? 42 : 39, bass ? 6 : 11, '#6b4320', bass ? 3 : 2.5);
    line(bass ? 40 : 37, bass ? 8.5 : 13, bass ? 43 : 40, bass ? 5 : 10, '#3b2410', 4);
    // body (two lobes)
    dot(15, 34, bass ? 7 : 6.5, bodyColor);
    dot(20, 29, bass ? 5.5 : 5, bodyColor);
    if (bass) {
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(11, 33, 7, 2);
    } else {
      dot(17, 32, 2.2, '#3b2410');
    }
    hand(31, 20);
    hand(17, 30);
  } else if (instrument === 'drummer') {
    // a stick in each hand
    line(9, 31, 2, 17, '#e3c18f', 2.5);
    line(35, 31, 42, 17, '#e3c18f', 2.5);
    dot(2, 17, 1.8, '#f3dcb5');
    dot(42, 17, 1.8, '#f3dcb5');
    hand(9, 31);
    hand(35, 31);
  } else if (instrument === 'keyboardist') {
    // keytar-style keyboard held across the body
    ctx.save();
    ctx.translate(22, 31);
    ctx.rotate(-0.18);
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.roundRect(-19, -5, 38, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(-16, -2, 30, 6);
    ctx.fillStyle = '#222';
    for (let x = -14; x < 13; x += 4) ctx.fillRect(x, -2, 1.6, 3.5);
    ctx.fillStyle = '#40c4ff';
    ctx.fillRect(15, -3, 3, 2);
    ctx.restore();
    hand(9, 33);
    hand(33, 29);
  }
  tex.refresh();
}

function drawMonster(scene: Phaser.Scene, key: string, color: string, size: number, boss?: boolean, kind?: string) {
  const w = Math.round(40 * size);
  const h = Math.round(40 * size) + (boss ? 14 : 0);
  const { tex, ctx } = canvas(scene, key, w, h);
  const cx = w / 2;
  const base = h - 4;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, base, w * 0.36, 4 * size, 0, 0, Math.PI * 2);
  ctx.fill();
  const r = w * 0.38;
  const cy = base - r * 0.9;
  if (kind === 'mushy') {
    ctx.fillStyle = '#f3e3c8';
    ctx.fillRect(cx - r * 0.45, cy - r * 0.1, r * 0.9, r * 0.95);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.15, r, r * 0.65, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    [[-0.5, -0.45], [0.3, -0.55], [0, -0.3]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx * r, cy + dy * r, r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (kind === 'buzzer') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.5, cy - r * 0.8, r * 0.45, r * 0.3, -0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + r * 0.5, cy - r * 0.8, r * 0.45, r * 0.3, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(cx - r * 0.2, cy - r * 0.72, r * 0.18, r * 1.44);
    ctx.fillRect(cx + r * 0.25, cy - r * 0.65, r * 0.18, r * 1.3);
  } else if (kind === 'rocky') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - r, base - 2);
    ctx.lineTo(cx - r * 0.8, cy - r * 0.6);
    ctx.lineTo(cx - r * 0.1, cy - r);
    ctx.lineTo(cx + r * 0.7, cy - r * 0.7);
    ctx.lineTo(cx + r, base - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(color, -30);
    ctx.fillRect(cx - r * 0.6, cy + r * 0.3, r * 0.4, r * 0.15);
  } else {
    // jelly blob
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx - r, base - 2);
    ctx.quadraticCurveTo(cx - r * 1.05, cy - r * 0.9, cx, cy - r);
    ctx.quadraticCurveTo(cx + r * 1.05, cy - r * 0.9, cx + r, base - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.4, cy - r * 0.5, r * 0.25, r * 0.12, -0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // eyes
  const eyeY = kind === 'mushy' ? cy + r * 0.35 : cy;
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(cx - r * 0.3, eyeY, Math.max(2, r * 0.1), 0, Math.PI * 2);
  ctx.arc(cx + r * 0.3, eyeY, Math.max(2, r * 0.1), 0, Math.PI * 2);
  ctx.fill();
  if (boss) {
    ctx.fillStyle = '#ffd700';
    const top = cy - r - 2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.45, top);
    ctx.lineTo(cx - r * 0.45, top - 12);
    ctx.lineTo(cx - r * 0.2, top - 5);
    ctx.lineTo(cx, top - 14);
    ctx.lineTo(cx + r * 0.2, top - 5);
    ctx.lineTo(cx + r * 0.45, top - 12);
    ctx.lineTo(cx + r * 0.45, top);
    ctx.closePath();
    ctx.fill();
  }
  tex.refresh();
}

function drawDots(scene: Phaser.Scene) {
  const glyph = (key: string, text: string, color: string) => {
    const c = canvas(scene, key, 22, 22);
    c.ctx.font = 'bold 18px sans-serif';
    c.ctx.textAlign = 'center';
    c.ctx.textBaseline = 'middle';
    c.ctx.lineWidth = 3;
    c.ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    c.ctx.strokeText(text, 11, 12);
    c.ctx.fillStyle = color;
    c.ctx.fillText(text, 11, 12);
    c.tex.refresh();
  };
  glyph('note', '\u266A', '#ffd166');
  glyph('chord', '\u266B', '#7ff0e6');

  const wave = canvas(scene, 'wave', 20, 20);
  wave.ctx.lineWidth = 2;
  [4, 7, 10].forEach((r, i) => {
    wave.ctx.strokeStyle = `rgba(255,140,200,${1 - i * 0.25})`;
    wave.ctx.beginPath();
    wave.ctx.arc(4, 10, r, -0.9, 0.9);
    wave.ctx.stroke();
  });
  wave.tex.refresh();

  const marker = canvas(scene, 'marker', 20, 10);
  marker.ctx.strokeStyle = '#fff27a';
  marker.ctx.lineWidth = 2;
  marker.ctx.beginPath();
  marker.ctx.ellipse(10, 5, 8, 3.5, 0, 0, Math.PI * 2);
  marker.ctx.stroke();
  marker.tex.refresh();
}

export function makeTextures(scene: Phaser.Scene) {
  drawTiles(scene);
  drawTree(scene);
  drawDots(scene);
  const hair: Record<ClassKey, string> = {
    singer: '#7b2d5b', guitarist: '#3b2410', drummer: '#1f1f1f', bassist: '#c0392b', keyboardist: '#f1c40f',
  };
  for (const [key, def] of Object.entries(CLASSES) as [ClassKey, (typeof CLASSES)[ClassKey]][]) {
    drawPerson(scene, `char_${key}`, def.color, hair[key], key);
  }
  for (const npc of NPCS) drawPerson(scene, `npc_${npc.id}`, npc.color, npc.id === 'healer' ? '#ddd' : '#333', 'none');
  for (const [id, m] of Object.entries(MONSTERS)) {
    drawMonster(scene, `mon_${id}`, m.color, m.size, m.boss, id === 'king_jelly' ? 'jelly' : id);
  }
}
