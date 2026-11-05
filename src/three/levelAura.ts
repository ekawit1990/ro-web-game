import * as THREE from 'three';
import { PHONE } from './device';

/**
 * The golden aura at the feet of a Base Lv 99 character: a glowing ring with turning rune marks on the ground,
 * a soft column of light up to the knees and sparks drifting up. Built from shared textures/geometry, so a town
 * full of Lv 99 players costs a few draw calls each and no extra GPU memory.
 */

const GOLD = new THREE.Color('#ffd54a');
let parts: { ring: THREE.Texture; runes: THREE.Texture; beam: THREE.Texture; spark: THREE.Texture; disc: THREE.PlaneGeometry; tube: THREE.CylinderGeometry } | null = null;

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function shared() {
  if (parts) return parts;
  const ring = canvasTex(256, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,230,120,0.55)');
    g.addColorStop(0.45, 'rgba(255,210,80,0.18)');
    g.addColorStop(0.72, 'rgba(255,214,90,0.9)');
    g.addColorStop(0.8, 'rgba(255,240,170,1)');
    g.addColorStop(0.88, 'rgba(255,200,60,0.45)');
    g.addColorStop(1, 'rgba(255,190,40,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  const runes = canvasTex(256, (c, s) => {
    c.translate(s / 2, s / 2);
    c.strokeStyle = 'rgba(255,236,150,0.95)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, s * 0.31, 0, Math.PI * 2);
    c.stroke();
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, s * 0.235, 0, Math.PI * 2);
    c.stroke();
    // little notes and ticks round the band, like a score written in a circle
    c.fillStyle = 'rgba(255,240,170,1)';
    for (let i = 0; i < 16; i++) {
      c.save();
      c.rotate((i / 16) * Math.PI * 2);
      if (i % 2) {
        c.fillRect(-1.5, -s * 0.3, 3, s * 0.05);
      } else {
        c.beginPath();
        c.ellipse(0, -s * 0.27, 6, 4.2, -0.4, 0, Math.PI * 2);
        c.fill();
        c.fillRect(4, -s * 0.27 - 16, 2.2, 16);
      }
      c.restore();
    }
    // a six-point star in the middle
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(255,226,120,0.7)';
    for (const off of [0, Math.PI / 3]) {
      c.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = off + (i / 3) * Math.PI * 2;
        const x = Math.sin(a) * s * 0.2;
        const y = -Math.cos(a) * s * 0.2;
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }
  });
  const beam = canvasTex(64, (c, s) => {
    // bright at the bottom (v = 0 at the cylinder's foot), fading up; soft at the sides of the strip
    const g = c.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, 'rgba(255,220,100,0.85)');
    g.addColorStop(0.35, 'rgba(255,214,90,0.35)');
    g.addColorStop(1, 'rgba(255,214,90,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  const spark = canvasTex(32, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,230,1)');
    g.addColorStop(0.3, 'rgba(255,220,110,0.9)');
    g.addColorStop(1, 'rgba(255,200,60,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
  const disc = new THREE.PlaneGeometry(1, 1);
  disc.rotateX(-Math.PI / 2);
  const tube = new THREE.CylinderGeometry(0.42, 0.5, 0.85, 24, 1, true);
  tube.translate(0, 0.425, 0);
  parts = { ring, runes, beam, spark, disc, tube };
  return parts;
}

const add = (map: THREE.Texture, opacity = 1) =>
  new THREE.MeshBasicMaterial({ map, color: GOLD, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });

export function buildMaxAura(): THREE.Group {
  const p = shared();
  const g = new THREE.Group();
  g.name = 'lv99-aura';
  const ring = new THREE.Mesh(p.disc, add(p.ring, 0.9));
  ring.scale.setScalar(1.3);
  ring.position.y = 0.02;
  const runes = new THREE.Mesh(p.disc, add(p.runes, 0.85));
  runes.scale.setScalar(1.2);
  runes.position.y = 0.03;
  const beam = new THREE.Mesh(p.tube, add(p.beam, 0.55));
  const n = PHONE ? 10 : 18;
  const pos = new Float32Array(n * 3);
  const seeds = Array.from({ length: n }, () => ({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.35, k: Math.random(), v: 0.35 + Math.random() * 0.35 }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(geo, new THREE.PointsMaterial({
    map: p.spark, color: GOLD, size: 0.12, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  sparks.frustumCulled = false;
  for (const m of [ring, runes, beam]) m.renderOrder = 2;
  g.add(ring, runes, beam, sparks);
  g.userData = { ring, runes, beam, sparks, seeds };
  return g;
}

/** Turns the rings, breathes the light and lifts the sparks. `t` in seconds. */
export function animateMaxAura(g: THREE.Group, t: number) {
  const { ring, runes, beam, sparks, seeds } = g.userData as {
    ring: THREE.Mesh; runes: THREE.Mesh; beam: THREE.Mesh; sparks: THREE.Points; seeds: { a: number; r: number; k: number; v: number }[];
  };
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
  runes.rotation.y = t * 0.6;
  ring.rotation.y = -t * 0.25;
  (ring.material as THREE.MeshBasicMaterial).opacity = 0.5 + pulse * 0.3;
  (beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.14;
  beam.scale.set(1, 0.85 + pulse * 0.2, 1);
  const pos = (sparks.geometry.getAttribute('position') as THREE.BufferAttribute);
  for (let i = 0; i < seeds.length; i++) {
    const s = seeds[i];
    const life = (s.k + t * s.v * 0.6) % 1;
    const a = s.a + t * 0.8 + life * 1.5;
    const r = s.r * (1 - life * 0.4);
    pos.setXYZ(i, Math.cos(a) * r, 0.05 + life * 1.1, Math.sin(a) * r);
  }
  pos.needsUpdate = true;
  (sparks.material as THREE.PointsMaterial).opacity = 0.85;
}
