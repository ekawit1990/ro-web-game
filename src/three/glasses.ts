import * as THREE from 'three';
import { ITEMS } from '../data';
import { mesh, outline, toon } from './toon';
import { tigerTexture } from './tiger';

/**
 * Music glasses (2026-11-18): the glasses slot, drawn from code like the hats.
 * Same space as the hats (src/three/hats.ts): the head is a ball of radius ~0.35 at the origin, front = +Z.
 * Each glasses item carries `glasses: { kind, c: [frame, lens, extra] }` in gamedata.json.
 */
export interface GlassesLook { kind: string; c: string[] }

/** Eye line in hat space (measured on the semi-chibi VRoid heads). */
export const EYE_Y = -0.165;
const FRONT_Z = 0.37;
const EYE_X = 0.125;

type Pt = [number, number];
const glow = (c: string, k = 0.55) => toon(c, { emissive: new THREE.Color(c).multiplyScalar(k).getHex() });
const lensMat = (c: string, opacity = 0.55) =>
  new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });

function circle(r: number, n = 24, sx = 1, sy = 1): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r * sx, Math.sin(a) * r * sy];
  });
}
function poly(n: number, r: number, rot = 0): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}
function star(r: number, inner: number): Pt[] {
  return Array.from({ length: 10 }, (_, i) => {
    const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
    const k = i % 2 ? inner : r;
    return [Math.cos(a) * k, Math.sin(a) * k];
  });
}
function heart(s: number): Pt[] {
  return Array.from({ length: 32 }, (_, i) => {
    const t = (i / 32) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return [(x / 17) * s, (y / 17) * s + s * 0.1];
  });
}
/** Cat-eye: a rounded lens with the outer top corner swept up into a point (outer side = +x). */
function catEye(s: number): Pt[] {
  return [[-0.9, 0.1], [-0.75, 0.55], [-0.2, 0.62], [0.55, 0.65], [1.25, 1.0], [1.0, 0.25], [0.8, -0.35], [0.3, -0.62],
    [-0.35, -0.6], [-0.8, -0.35]].map(([x, y]) => [x * s, y * s] as Pt);
}
/** Flames along the top edge of a wide lens. */
function flame(s: number): Pt[] {
  const top: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const x = -1 + i * 0.25;
    top.push([x, i % 2 ? 0.95 + (i % 4 === 1 ? 0.25 : 0) : 0.5]);
  }
  return [...top.reverse(), [-1.05, -0.2], [-0.7, -0.6], [0.7, -0.6], [1.05, -0.2]].map(([x, y]) => [x * s, y * s] as Pt);
}

/** Flat shape (lens) and a ring round it (frame), facing +Z. Points go round the lens; outer side = +x. */
function lensAndRim(g: THREE.Group, pts: Pt[], x: number, mirror: boolean, frame: THREE.Material, lens: THREE.Material | null, rim = 1.22, depth = 0.025) {
  const P = pts.map(([px, py]) => new THREE.Vector2(mirror ? -px : px, py));
  if (mirror) P.reverse();
  // centre of the outline, so the rim grows out evenly
  const c = P.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / P.length);
  const outer = new THREE.Shape(P.map((p) => p.clone().sub(c).multiplyScalar(rim).add(c)));
  outer.holes.push(new THREE.Path([...P].reverse()));
  const f = mesh(new THREE.ExtrudeGeometry(outer, { depth, bevelEnabled: false, curveSegments: 4 }), frame, x, 0, -depth / 2);
  g.add(f);
  if (lens) {
    const l = mesh(new THREE.ShapeGeometry(new THREE.Shape(P)), lens, x, 0, 0.002);
    l.userData.noOutline = true;
    g.add(l);
  }
  // half-width of the frame on the outer side, where the temple starts
  return Math.max(...P.map((p) => Math.abs(p.x))) * rim;
}

/** Arms (temples) from the front corners back over the ears, and a bridge over the nose. */
function temples(g: THREE.Group, mat: THREE.Material, outerX: number, y = 0.02) {
  for (const s of [-1, 1]) {
    const len = FRONT_Z + 0.06;
    const t = mesh(new THREE.BoxGeometry(0.018, 0.022, len), mat, s * (outerX + 0.004), y, -len / 2);
    t.rotation.y = s * -0.08;
    g.add(t);
  }
}
function bridge(g: THREE.Group, mat: THREE.Material, w = 0.07, y = 0.02) {
  g.add(mesh(new THREE.BoxGeometry(w, 0.018, 0.018), mat, 0, y, 0));
}

/** Tiger eye: an almond lens slanting up to a point at the outer corner (outer side = +x). */
function tigerEye(s: number): Pt[] {
  return [[-0.95, 0.0], [-0.7, 0.42], [-0.15, 0.6], [0.5, 0.62], [1.2, 0.78], [1.0, 0.2], [0.7, -0.3], [0.15, -0.5],
    [-0.45, -0.45], [-0.85, -0.25]].map(([x, y]) => [x * s, y * s] as Pt);
}

const BUILD: Record<string, (g: THREE.Group, c: string[]) => void> = {
  // แว่นตาลายพยัคฆ์ (ราชาเสือโคร่ง, 2026-11-18): tiger-striped almond frames, amber lenses, little round ears on top
  tiger(g, [c1, c2, c3]) {
    const fur = toon('#ffffff', { map: tigerTexture('glasses', { repeat: [5, 5], size: [128, 128], seed: 31 }) });
    const ox = pair(g, tigerEye(0.088), fur, lensMat(c2, 0.6), 1.26, 0.03);
    for (const s of [-1, 1]) {
      // a round ear on each top corner, black at the back with a white middle
      const ear = mesh(new THREE.SphereGeometry(0.035, 12, 8), toon(c1), s * (ox - 0.06), 0.085, -0.004);
      ear.scale.z = 0.45;
      const inner = mesh(new THREE.SphereGeometry(0.02, 10, 6), toon('#fff4e2'), s * (ox - 0.06), 0.083, 0.008);
      inner.scale.z = 0.4;
      inner.userData.noOutline = true;
      g.add(ear, inner);
      // a slit pupil glinting in each lens
      const slit = mesh(new THREE.BoxGeometry(0.01, 0.06, 0.004), toon(c3), s * EYE_X, 0.005, 0.006);
      slit.userData.noOutline = true;
      g.add(slit);
    }
  },
  round(g, [c1, c2, c3]) {
    const ox = pair(g, circle(0.08), toon(c1), lensMat(c2, 0.45));
    // little leaves on the hinges
    for (const s of [-1, 1]) {
      const leaf = mesh(new THREE.SphereGeometry(0.03, 8, 6), toon(c3), s * (ox + 0.01), 0.06, -0.01);
      leaf.scale.set(0.6, 0.3, 1.2);
      leaf.rotation.z = s * 0.6;
      g.add(leaf);
    }
  },
  cateye(g, [c1, c2, c3]) {
    pair(g, catEye(0.085), toon(c1), lensMat(c2, 0.5));
    for (const s of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.018, 0.06, 4), toon(c3), s * 0.26, 0.1, 0).rotateZ(-s * 0.9));
  },
  flame(g, [c1, c2, c3]) {
    const ox = pair(g, flame(0.085), toon(c1), lensMat('#1a1a1a', 0.8));
    // the flames themselves glow over the dark lenses
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const fl = mesh(new THREE.ConeGeometry(0.018, 0.06 + (i % 2) * 0.03, 6), glow(i % 2 ? c3 : c2, 0.7), s * (EYE_X - 0.05 + i * 0.05), 0.09 + (i % 2) * 0.01, 0.01);
        fl.userData.noOutline = true;
        g.add(fl);
      }
    }
    void ox;
  },
  star(g, [c1, c2, c3]) {
    pair(g, star(0.11, 0.05), toon(c1), lensMat(c2, 0.55), 1.28);
    for (const s of [-1, 1]) {
      const sp = mesh(new THREE.OctahedronGeometry(0.02), glow(c3, 0.8), s * (EYE_X + 0.09), 0.09, 0.02);
      sp.userData.noOutline = true;
      g.add(sp);
    }
  },
  heart(g, [c1, c2, c3]) {
    pair(g, heart(0.085), toon(c1), lensMat(c2, 0.55));
    g.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), toon(c3), 0, 0.045, 0.01));
  },
  hex(g, [c1, c2, c3]) {
    pair(g, poly(6, 0.085, Math.PI / 6), toon(c1), lensMat(c2, 0.5));
    for (const s of [-1, 1]) {
      const gem = mesh(new THREE.OctahedronGeometry(0.022), glow(c3, 0.5), s * 0.22, 0.07, 0.01);
      gem.scale.y = 1.5;
      g.add(gem);
    }
  },
  shutter(g, [c1, c2]) {
    // piano-key shutter shades: a white frame, black slats across like the black keys
    const f = toon(c1);
    const ox = pair(g, [[-0.09, -0.06], [0.1, -0.06], [0.11, 0.06], [-0.09, 0.065]], f, null, 1.18);
    const k = toon(c2);
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        g.add(mesh(new THREE.BoxGeometry(0.19, 0.014, 0.012), i % 2 ? f : k, s * EYE_X, -0.045 + i * 0.03, 0.004));
      }
    }
    void ox;
  },
  visor(g, [c1, c2, c3]) {
    // one wide dark band across both eyes, studded, with a red light line through it
    const f = toon(c1);
    const pts: Pt[] = [[-0.27, -0.05], [0.27, -0.05], [0.3, 0.06], [-0.3, 0.06]];
    const w = lensAndRim(g, pts, 0, false, f, lensMat('#101418', 0.82), 1.12);
    const line = mesh(new THREE.BoxGeometry(0.5, 0.012, 0.01), glow(c2, 0.9), 0, 0.005, 0.008);
    line.userData.noOutline = true;
    g.add(line);
    for (let i = 0; i < 6; i++) g.add(mesh(new THREE.SphereGeometry(0.012, 6, 4), toon(c3), -0.27 + i * 0.108, 0.075, 0.012));
    temples(g, f, w);
  },
  goggle(g, [c1, c2, c3]) {
    const ox = pair(g, circle(0.08, 24, 1.15, 0.85), toon(c1), lensMat(c2, 0.45), 1.35, 0.05);
    // a strap all the way round the head
    const strap = mesh(new THREE.TorusGeometry(0.36, 0.016, 6, 32, Math.PI * 1.25), toon(c3), 0, 0.02, -0.33);
    strap.rotation.set(Math.PI / 2, 0, Math.PI * 1.125);
    g.add(strap);
    void ox;
  },
  monocle(g, [c1, c2, c3]) {
    // one gold lens over the right eye (the wearer's right = -x), a chain down to the ear
    const f = toon(c1);
    const pts = circle(0.075);
    lensAndRim(g, pts, 0, true, f, lensMat(c2, 0.4), 1.2, 0.02);
    for (const m of g.children.slice(-2)) m.position.x = -EYE_X;
    for (let i = 0; i < 7; i++) {
      const a = i / 6;
      const link = mesh(new THREE.TorusGeometry(0.01, 0.003, 4, 8), f, -EYE_X - 0.06 - a * 0.2, -0.07 - Math.sin(a * Math.PI) * 0.08, -a * 0.25);
      link.rotation.y = Math.PI / 2 * (i % 2);
      link.userData.noOutline = true;
      g.add(link);
    }
    g.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), toon(c3), -EYE_X + 0.07, 0.06, 0.01));
  },
  speaker(g, [c1, c2, c3]) {
    const ox = pair(g, circle(0.085), toon(c1), null, 1.25, 0.035);
    for (const s of [-1, 1]) {
      // the cone: rings getting smaller towards a glowing dust cap
      const cone = mesh(new THREE.ConeGeometry(0.085, 0.03, 24, 1, true), toon('#2b2220'), s * EYE_X, 0, 0.0);
      cone.rotation.x = -Math.PI / 2;
      g.add(cone);
      for (const r of [0.07, 0.05]) {
        const ring = mesh(new THREE.TorusGeometry(r, 0.005, 4, 24), glow(c2, 0.6), s * EYE_X, 0, 0.012);
        ring.userData.noOutline = true;
        g.add(ring);
      }
      const cap = mesh(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glow(c3, 0.9), s * EYE_X, 0, 0.015);
      cap.rotation.x = Math.PI / 2;
      cap.userData.noOutline = true;
      g.add(cap);
    }
    void ox;
  },
  vinyl(g, [c1, c2, c3]) {
    const ox = pair(g, circle(0.088), toon('#2a2a2a'), toon(c1), 1.12);
    for (const s of [-1, 1]) {
      for (const r of [0.075, 0.062, 0.05]) {
        const groove = mesh(new THREE.TorusGeometry(r, 0.0035, 4, 28), glow(r === 0.062 ? c3 : c2, 0.8), s * EYE_X, 0, 0.008);
        groove.userData.noOutline = true;
        g.add(groove);
      }
      const label = mesh(new THREE.CircleGeometry(0.03, 20), glow(c2, 0.9), s * EYE_X, 0, 0.009);
      label.userData.noOutline = true;
      g.add(label);
      g.add(mesh(new THREE.CircleGeometry(0.006, 8), toon('#000000'), s * EYE_X, 0, 0.011));
    }
    void ox;
  },
};

/** Two lenses (mirrored), a bridge and the temples; returns the outer half-width. */
function pair(g: THREE.Group, pts: Pt[], frame: THREE.Material, lens: THREE.Material | null, rim = 1.22, depth = 0.025) {
  let w = 0;
  for (const s of [-1, 1]) {
    const before = g.children.length;
    w = lensAndRim(g, pts, 0, s < 0, frame, lens, rim, depth);
    for (const m of g.children.slice(before)) m.position.x += s * EYE_X;
  }
  bridge(g, frame, EYE_X * 2 - 0.15);
  temples(g, frame, EYE_X + w);
  return EYE_X + w;
}

/** Builds glasses into `g` (in hat space); false if the item has none. */
export function buildGlasses(g: THREE.Group, look: GlassesLook | undefined) {
  const fn = look && BUILD[look.kind];
  if (!fn) return false;
  const front = new THREE.Group();
  fn(front, look.c);
  front.position.set(0, EYE_Y, FRONT_Z);
  g.add(front);
  outline(front, 0.006);
  return true;
}

export const glassesOf = (item: string | undefined) => (item ? ITEMS[item]?.glasses : undefined);
