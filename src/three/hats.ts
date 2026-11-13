import * as THREE from 'three';
import { mesh, toon } from './toon';

/**
 * The 50 music hats (2026-11-10), built from primitives like the other hats.
 * Hat space: the head is a ball of radius ~0.35 at the origin, the forehead line is y ≈ 0.12, the front is +Z.
 * Each hat item carries `hat: { kind, c: [colours], v?: variant }` (gamedata.json); `kind` picks a builder here.
 */
export interface HatLook { kind: string; c: string[]; v?: string }

const S = (r: number, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);
const CYL = (rt: number, rb: number, h: number, seg = 18) => new THREE.CylinderGeometry(rt, rb, h, seg);
const glow = (c: string, k = 0.55) => toon(c, { emissive: new THREE.Color(c).multiplyScalar(k).getHex() });

/** Top of the head: a dome down to the forehead line. */
function dome(g: THREE.Group, color: string, r = 0.37, y = 0.03, down = 1.35) {
  return g.add(mesh(new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, down), toon(color), 0, y, 0));
}
/** A flat ring brim round the head at height y. */
function brim(g: THREE.Group, color: string, r: number, y = 0.12, thick = 0.025, sx = 1, sz = 1) {
  const b = mesh(CYL(r, r, thick, 26), toon(color), 0, y, 0);
  b.scale.set(sx, 1, sz);
  g.add(b);
  return b;
}
/** A band (short open cylinder) round the head. */
function hatBand(g: THREE.Group, color: string, r: number, y: number, h = 0.05) {
  g.add(mesh(CYL(r, r, h, 26), toon(color), 0, y, 0));
}
/** A headband over the top, ear to ear. */
function headband(g: THREE.Group, color: string, r = 0.385, thick = 0.028) {
  const b = mesh(new THREE.TorusGeometry(r, thick, 8, 28, Math.PI), toon(color), 0, 0.03, 0);
  g.add(b);
}
/** A music note (eighth note) as a flat extruded shape, about `s` tall. */
function noteShape(s: number, flag = true) {
  const sh = new THREE.Shape();
  sh.absellipse(0, 0, 0.32 * s, 0.22 * s, 0, Math.PI * 2, false, -0.35);
  const stem = new THREE.Shape();
  stem.moveTo(0.22 * s, 0.05 * s);
  stem.lineTo(0.3 * s, 0.05 * s);
  stem.lineTo(0.3 * s, 1.0 * s);
  if (flag) {
    stem.quadraticCurveTo(0.62 * s, 0.82 * s, 0.6 * s, 0.5 * s);
    stem.quadraticCurveTo(0.52 * s, 0.72 * s, 0.3 * s, 0.76 * s);
    stem.lineTo(0.3 * s, 0.76 * s);
  }
  stem.lineTo(0.22 * s, 1.0 * s);
  stem.closePath();
  const geo = new THREE.ExtrudeGeometry([sh, stem], { depth: 0.035 * s * 3, bevelEnabled: false, curveSegments: 10 });
  geo.translate(-0.15 * s, -0.45 * s, -0.05 * s);
  return geo;
}
function note(g: THREE.Group, color: string, s: number, x: number, y: number, z: number, ry = 0, rz = 0) {
  const n = mesh(noteShape(s), glow(color, 0.35), x, y, z);
  n.rotation.set(0, ry, rz);
  g.add(n);
  return n;
}
function star(g: THREE.Group, color: string, s: number, x: number, y: number, z: number) {
  const sh = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 ? s * 0.42 : s;
    if (i) sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const st = mesh(new THREE.ExtrudeGeometry(sh, { depth: s * 0.35, bevelEnabled: false }), glow(color, 0.4), x, y, z);
  g.add(st);
  return st;
}
function gem(g: THREE.Group, color: string, s: number, x: number, y: number, z: number) {
  const m = mesh(new THREE.OctahedronGeometry(s), glow(color, 0.45), x, y, z);
  m.scale.set(1, 1.3, 0.7);
  m.userData.noOutline = true;
  g.add(m);
  return m;
}
function pom(g: THREE.Group, color: string, r: number, x: number, y: number, z: number) {
  g.add(mesh(S(r), toon(color), x, y, z));
}
/** A ring of points (crowns, spikes): n cones round radius r. */
function ringOf(n: number, r: number, f: (a: number, x: number, z: number, i: number) => void, arc = Math.PI * 2, from = 0) {
  for (let i = 0; i < n; i++) {
    const a = from + (arc === Math.PI * 2 ? (i / n) * arc : (i / Math.max(1, n - 1)) * arc);
    f(a, Math.sin(a) * r, Math.cos(a) * r, i);
  }
}
/** A pair of animal ears on a headband. */
function ears(g: THREE.Group, kind: string, c: string, inner: string) {
  headband(g, c, 0.385, 0.024);
  for (const s of [-1, 1]) {
    let e: THREE.Mesh, i: THREE.Mesh;
    if (kind === 'bunny') {
      e = mesh(new THREE.CapsuleGeometry(0.07, 0.36, 4, 10), toon(c), s * 0.16, 0.6, -0.02);
      i = mesh(new THREE.CapsuleGeometry(0.04, 0.28, 4, 8), toon(inner), s * 0.16, 0.6, 0.035);
      e.rotation.z = i.rotation.z = -s * 0.18;
    } else if (kind === 'bear') {
      e = mesh(S(0.11), toon(c), s * 0.27, 0.36, 0);
      i = mesh(S(0.065), toon(inner), s * 0.27, 0.36, 0.06);
      e.scale.z = 0.6;
    } else {
      // cat / fox: pointed (fox taller)
      const h = kind === 'fox' ? 0.3 : 0.22;
      e = mesh(new THREE.ConeGeometry(0.11, h, 4), toon(c), s * 0.22, 0.38 + h / 2 - 0.1, 0);
      i = mesh(new THREE.ConeGeometry(0.065, h * 0.65, 4), toon(inner), s * 0.215, 0.36 + h / 2 - 0.12, 0.035);
      e.rotation.z = i.rotation.z = -s * 0.45;
    }
    g.add(e, i);
  }
}
function horn(g: THREE.Group, color: string, s: number, x: number, y: number, z: number, side: number, curl = 0.6) {
  // a curved horn: shrinking cones laid end to end, bending outwards then up
  let px = x, py = y, a = side * 0.5;
  for (let k = 0; k < 4; k++) {
    const len = 0.1 * s, r0 = 0.06 * s * (1 - k * 0.22), r1 = 0.06 * s * (1 - (k + 1) * 0.22);
    const dx = Math.sin(a), dy = Math.cos(a);
    const seg = mesh(CYL(Math.max(0.006, r1), r0 * 1.05, len * 1.15, 10), toon(color), px + dx * len / 2, py + dy * len / 2, z);
    seg.rotation.z = -a;
    g.add(seg);
    px += dx * len;
    py += dy * len;
    a -= side * curl * 0.35;
  }
}
function feather(g: THREE.Group, color: string, s: number, x: number, y: number, z: number, rz: number, rx = 0) {
  const f = mesh(S(0.06 * s, 10, 8), toon(color), x, y, z);
  f.scale.set(0.45, 2.6, 0.25);
  f.rotation.set(rx, 0, rz);
  g.add(f);
}
function flower(g: THREE.Group, color: string, centre: string, s: number, x: number, y: number, z: number, ry: number) {
  const f = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const p = mesh(S(0.045 * s, 8, 6), toon(color), Math.cos(a) * 0.045 * s, Math.sin(a) * 0.045 * s, 0);
    p.scale.z = 0.4;
    f.add(p);
  }
  f.add(mesh(S(0.03 * s, 8, 6), toon(centre), 0, 0, 0.012));
  f.position.set(x, y, z);
  f.rotation.y = ry;
  g.add(f);
}

/** The cone-shaped sides and flat top of a cylinder hat (top hat, fez, shako...). */
function tube(g: THREE.Group, color: string, rTop: number, rBot: number, h: number, y: number) {
  g.add(mesh(CYL(rTop, rBot, h, 24), toon(color), 0, y + h / 2, 0));
}

type Build = (g: THREE.Group, c: string[], v: string) => void;

const BUILD: Record<string, Build> = {
  cap(g, [c1, c2, c3], v) {
    dome(g, c1);
    const b = brim(g, c2, 0.24, 0.12, 0.025, 1.2, 0.8);
    b.position.z = v === 'back' ? -0.3 : 0.3;
    pom(g, c2, 0.04, 0, 0.4, 0);
    if (v === 'back') star(g, c3, 0.08, -0.04, 0.27, 0.3);
    else note(g, c3, 0.17, 0, 0.27, 0.3);
  },
  beanie(g, [c1, c2, c3], v) {
    const d = dome(g, c1, 0.38, 0.03, 1.4);
    d.scale.y = 1.12;
    g.add(mesh(new THREE.TorusGeometry(0.36, 0.045, 8, 28), toon(c2), 0, 0.12, 0).rotateX(Math.PI / 2));
    if (v === 'stripes') {
      for (const [y, r] of [[0.25, 0.338], [0.36, 0.25]] as const)
        g.add(mesh(new THREE.TorusGeometry(r, 0.028, 6, 26), toon(c3), 0, y, 0).rotateX(Math.PI / 2));
    } else if (v === 'rasta') {
      for (const [y, r, col] of [[0.22, 0.352, c2], [0.31, 0.3, c3]] as const)
        g.add(mesh(new THREE.TorusGeometry(r, 0.03, 6, 26), toon(col), 0, y, 0).rotateX(Math.PI / 2));
    }
    if (c3 && v !== 'rasta') pom(g, c3, 0.09, 0, 0.47, 0);
    note(g, c3 ?? c2, 0.12, 0.17, 0.16, 0.33, 0.45);
  },
  beret(g, [c1, c2]) {
    const top = mesh(S(0.4, 22, 10), toon(c1), -0.06, 0.3, -0.02);
    top.scale.set(1, 0.32, 1);
    top.rotation.z = 0.2;
    g.add(top);
    g.add(mesh(new THREE.TorusGeometry(0.335, 0.03, 6, 26), toon(c1), 0, 0.17, 0).rotateX(Math.PI / 2));
    g.add(mesh(CYL(0.012, 0.02, 0.06, 8), toon(c1), -0.08, 0.43, 0));
    note(g, c2, 0.13, 0.22, 0.26, 0.26, 0.6);
  },
  fedora(g, [c1, c2, c3]) {
    const crown = mesh(CYL(0.27, 0.34, 0.28, 22), toon(c1), 0, 0.3, 0);
    g.add(crown);
    const dent = mesh(S(0.2, 14, 8), toon(c1), 0, 0.42, 0);
    dent.scale.set(1.2, 0.35, 1.4);
    g.add(dent);
    hatBand(g, c2, 0.343, 0.2, 0.06);
    const b = brim(g, c1, 0.52, 0.16, 0.025);
    b.rotation.x = 0.12;
    if (c3) feather(g, c3, 1.3, 0.3, 0.32, -0.08, -0.6);
  },
  tophat(g, [c1, c2, c3], v) {
    tube(g, c1, 0.29, 0.27, 0.5, 0.14);
    hatBand(g, c2, 0.28, 0.2, 0.08);
    brim(g, c1, 0.46, 0.15, 0.03, 1, 0.92);
    if (v === 'metronome') {
      // a little metronome on the front band, with its swinging rod
      const m = mesh(new THREE.ConeGeometry(0.08, 0.16, 4), toon(c3), 0, 0.3, 0.29);
      m.rotation.y = Math.PI / 4;
      g.add(m);
      const rod = mesh(CYL(0.008, 0.008, 0.16, 6), toon('#eeeeee'), 0.02, 0.33, 0.33);
      rod.rotation.z = -0.35;
      g.add(rod);
    } else if (v === 'mask') {
      const mk = mesh(S(0.09, 14, 10, ), toon(c3), 0.16, 0.24, 0.25);
      mk.scale.set(1, 0.6, 0.35);
      g.add(mk);
      feather(g, c2, 1.2, -0.2, 0.52, 0.12, 0.4);
    } else note(g, c3, 0.16, 0.18, 0.22, 0.27, 0.6);
  },
  cowboy(g, [c1, c2, c3], v) {
    const crown = mesh(CYL(0.25, 0.33, 0.27, 20), toon(c1), 0, 0.29, 0);
    g.add(crown);
    hatBand(g, c2, 0.33, 0.19, 0.05);
    // brim curled up at both sides: a wide flat ring plus two turned-up wings
    if (v === 'sombrero') {
      const crown2 = mesh(CYL(0.12, 0.25, 0.25, 20), toon(c1), 0, 0.5, 0);
      g.add(crown2);
      const b = mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 32), toon(c2), 0, 0.17, 0);
      b.rotation.x = Math.PI / 2;
      g.add(b);
      brim(g, c1, 0.62, 0.15, 0.025);
      ringOf(8, 0.5, (a, x, z) => pom(g, c3, 0.035, x, 0.17, z));
    } else {
      brim(g, c1, 0.5, 0.15, 0.025, 1, 1.1);
      for (const s of [-1, 1]) {
        const w = mesh(new THREE.BoxGeometry(0.16, 0.022, 0.6), toon(c1), s * 0.5, 0.22, 0);
        w.rotation.z = s * 0.7;
        g.add(w);
      }
      star(g, c3, 0.06, 0, 0.19, 0.33);
    }
  },
  crown(g, [c1, c2, c3], v) {
    const n = v === 'crystal' ? 7 : 8;
    hatBand(g, c1, 0.3, 0.22, 0.1);
    ringOf(n, 0.3, (a, x, z, i) => {
      if (v === 'crystal') {
        const sp = mesh(new THREE.OctahedronGeometry(0.07), glow(i % 2 ? c2 : c3 ?? c2, 0.5), x, 0.36 + (i % 2 ? 0 : 0.06), z);
        sp.scale.set(0.7, 2.2, 0.7);
        sp.userData.noOutline = true;
        g.add(sp);
      } else {
        const p = mesh(new THREE.ConeGeometry(0.055, 0.17, 4), toon(c1), x, 0.35, z);
        p.rotation.y = a;
        g.add(p);
        pom(g, c2, 0.025, x, 0.45, z);
      }
    });
    gem(g, c3 ?? c2, 0.05, 0, 0.22, 0.31);
  },
  tiara(g, [c1, c2, c3]) {
    headband(g, c1, 0.38, 0.02);
    // the decorated front arc
    ringOf(7, 0.37, (a, x, z, i) => {
      const h = 0.07 + (3 - Math.abs(i - 3)) * 0.035;
      const p = mesh(new THREE.ConeGeometry(0.03, h, 4), toon(c1), x, 0.32 + h / 2, z * 0.95);
      p.rotation.y = a;
      g.add(p);
      if (i % 2 === 0) pom(g, c3 ?? '#ffffff', 0.022, x, 0.32, z * 0.97);
    }, 1.3, -0.65);
    gem(g, c2, 0.055, 0, 0.42, 0.36);
  },
  halo(g, [c1, c2], v) {
    const r = mesh(new THREE.TorusGeometry(0.26, 0.03, 8, 30), glow(c1, 0.7), 0, 0.62, -0.04);
    r.rotation.x = Math.PI / 2 - 0.25;
    r.userData.noOutline = true;
    g.add(r);
    if (v === 'echo') {
      for (const [k, y] of [[1.3, 0.55], [1.65, 0.5]] as const) {
        const e = mesh(new THREE.TorusGeometry(0.26 * k, 0.012, 6, 30), toon(c2, { transparent: true, opacity: 0.6, emissive: new THREE.Color(c2).multiplyScalar(0.5).getHex() }), 0, y, -0.04);
        e.rotation.x = Math.PI / 2 - 0.25;
        e.userData.noOutline = true;
        g.add(e);
      }
    }
    if (v === 'wings') {
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          const f = mesh(S(0.1, 10, 8), toon(c2), s * (0.42 + k * 0.06), 0.18 + k * 0.07, -0.08);
          f.scale.set(0.35, 1.6 - k * 0.3, 0.5);
          f.rotation.z = s * (0.6 + k * 0.25);
          g.add(f);
        }
      }
    }
  },
  horns(g, [c1, c2], v) {
    headband(g, c2, 0.385, 0.026);
    const s = v === 'big' ? 1.7 : 1.15;
    for (const side of [-1, 1]) horn(g, c1, s, side * 0.2, 0.33, 0.06, side, v === 'big' ? 1.1 : 0.4);
  },
  ears(g, [c1, c2, c3], v) {
    ears(g, v, c1, c2);
    if (c3) note(g, c3, 0.12, 0.3, 0.22, 0.2, 0.9);
  },
  antenna(g, [c1, c2, c3]) {
    headband(g, c1);
    for (const s of [-1, 1]) {
      // a springy wire with a note on top
      for (let k = 0; k < 7; k++) {
        const t = k / 6;
        g.add(mesh(new THREE.TorusGeometry(0.025, 0.007, 4, 10), toon('#cfd8dc'), s * (0.16 + t * 0.06), 0.38 + t * 0.22, 0));
      }
      note(g, s < 0 ? c2 : c3 ?? c2, 0.2, s * 0.24, 0.7, 0);
    }
  },
  flowers(g, [c1, c2, c3], v) {
    const ring = mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 26), toon(v === 'laurel' ? c1 : '#6a9a3a'), 0, 0.2, 0);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    ringOf(v === 'laurel' ? 16 : 9, 0.34, (a, x, z, i) => {
      if (v === 'laurel') {
        const l = mesh(S(0.05, 8, 6), toon(i % 2 ? c1 : c2), x, 0.24, z);
        l.scale.set(0.5, 1.6, 0.3);
        l.rotation.set(0, a, i % 2 ? 0.5 : -0.5);
        g.add(l);
      } else flower(g, i % 2 ? c1 : c2, c3 ?? '#ffeb3b', 1.1, x, 0.22, z, a);
    });
    if (v === 'laurel') gem(g, c3, 0.05, 0, 0.24, 0.35);
  },
  bandana(g, [c1, c2, c3], v) {
    const d = dome(g, c1, 0.375, 0.02, 1.45);
    d.scale.y = 0.92;
    // the knot and two tails at the back
    pom(g, c1, 0.06, 0, 0.12, -0.37);
    for (const s of [-1, 1]) {
      const t = mesh(new THREE.BoxGeometry(0.08, 0.2, 0.02), toon(c1), s * 0.06, 0.0, -0.39);
      t.rotation.z = s * 0.3;
      g.add(t);
    }
    if (v === 'plate') {
      const p = mesh(new THREE.BoxGeometry(0.24, 0.1, 0.03), toon(c2), 0, 0.18, 0.35);
      p.rotation.x = -0.2;
      g.add(p);
      note(g, c3, 0.08, 0, 0.17, 0.37);
    } else ringOf(8, 0.37, (a, x, z) => pom(g, c2, 0.025, x * 0.97, 0.2, z * 0.97));
  },
  viking(g, [c1, c2, c3], v) {
    dome(g, c1, 0.38, 0.03, 1.4);
    g.add(mesh(new THREE.TorusGeometry(0.37, 0.035, 6, 28), toon(c2), 0, 0.12, 0).rotateX(Math.PI / 2));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), toon(c2), 0, 0.3, 0.32).rotateX(-0.6));
    if (v === 'knight') {
      // crest plume instead of horns
      for (let k = 0; k < 6; k++) feather(g, c3, 1.4, 0, 0.42 + Math.sin(k * 0.5) * 0.04, 0.18 - k * 0.09, 0, -0.3 + k * 0.25);
    } else if (v === 'samurai') {
      const cr = mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20, Math.PI), toon(c3), 0, 0.3, 0.36);
      cr.rotation.z = 0;
      g.add(cr);
      for (const s of [-1, 1]) {
        const flap = mesh(new THREE.BoxGeometry(0.2, 0.18, 0.03), toon(c1), s * 0.38, 0.05, 0.05);
        flap.rotation.set(0, s * 1.3, s * 0.4);
        g.add(flap);
      }
    } else {
      for (const s of [-1, 1]) horn(g, c3, 1.3, s * 0.34, 0.2, 0, s, 1.2);
    }
  },
  witch(g, [c1, c2, c3]) {
    const cone = mesh(new THREE.ConeGeometry(0.3, 0.75, 20), toon(c1), 0.0, 0.52, -0.05);
    cone.rotation.x = -0.18;
    cone.rotation.z = 0.15;
    g.add(cone);
    hatBand(g, c2, 0.3, 0.19, 0.06);
    brim(g, c1, 0.56, 0.15, 0.025);
    star(g, c3, 0.06, 0.12, 0.22, 0.3);
    note(g, c3, 0.12, -0.14, 0.3, 0.25, -0.4);
  },
  party(g, [c1, c2, c3]) {
    const cone = new THREE.Group();
    cone.add(mesh(new THREE.ConeGeometry(0.22, 0.5, 18), toon(c1), 0, 0.25, 0));
    for (let k = 0; k < 3; k++) {
      const st = mesh(new THREE.TorusGeometry(0.19 - k * 0.055, 0.018, 6, 20), toon(c2), 0, 0.06 + k * 0.12, 0);
      st.rotation.x = Math.PI / 2;
      cone.add(st);
    }
    cone.add(mesh(S(0.06), toon(c3), 0, 0.52, 0));
    cone.position.set(0.05, 0.3, 0);
    cone.rotation.z = -0.2;
    g.add(cone);
    note(g, c3, 0.1, -0.15, 0.45, 0.2, -0.3);
  },
  shako(g, [c1, c2, c3]) {
    tube(g, c1, 0.3, 0.27, 0.42, 0.12);
    hatBand(g, c2, 0.285, 0.15, 0.05);
    hatBand(g, c2, 0.302, 0.52, 0.04);
    // the front badge and the tall plume
    gem(g, '#ffd54f', 0.06, 0, 0.32, 0.29);
    const visor = mesh(CYL(0.22, 0.22, 0.02, 20), toon('#1b1b1b'), 0, 0.14, 0.24);
    visor.scale.z = 0.6;
    g.add(visor);
    for (let k = 0; k < 5; k++) feather(g, c3, 1.6, (k - 2) * 0.03, 0.72, 0.18, (k - 2) * 0.12);
  },
  bow(g, [c1, c2]) {
    for (const s of [-1, 1]) {
      const w = mesh(new THREE.ConeGeometry(0.15, 0.3, 4), toon(c1), s * 0.15, 0, 0);
      w.rotation.z = s * Math.PI / 2;
      g.add(w);
    }
    pom(g, c2, 0.06, 0, 0, 0);
    g.position.set(0.15, 0.35, 0.02);
    g.rotation.z = -0.35;
  },
  goggles(g, [c1, c2, c3], v) {
    // a strap round the head with two big lenses pushed up on the forehead
    g.add(mesh(new THREE.TorusGeometry(0.37, 0.03, 6, 28), toon(c1), 0, 0.22, 0).rotateX(Math.PI / 2 - 0.15));
    for (const s of [-1, 1]) {
      const f = mesh(CYL(0.09, 0.09, 0.06, 18), toon(c3 ?? '#424242'), s * 0.12, 0.29, 0.33);
      f.rotation.x = Math.PI / 2 - 0.25;
      g.add(f);
      const l = mesh(CYL(0.07, 0.07, 0.065, 18), glow(c2, 0.6), s * 0.12, 0.29, 0.335);
      l.rotation.x = Math.PI / 2 - 0.25;
      l.userData.noOutline = true;
      g.add(l);
    }
    if (v === 'dj') for (const s of [-1, 1]) g.add(mesh(CYL(0.06, 0.06, 0.05, 14), toon(c1), s * 0.37, 0.2, 0).rotateZ(Math.PI / 2));
  },
  mohawk(g, [c1, c2, c3], v) {
    if (v === 'helm') {
      dome(g, c1, 0.38, 0.03, 1.4);
      g.add(mesh(new THREE.TorusGeometry(0.37, 0.03, 6, 28), toon(c3), 0, 0.12, 0).rotateX(Math.PI / 2));
    } else headband(g, c1);
    for (let k = 0; k < 6; k++) {
      const a = -0.95 + k * 0.38;
      const sp = mesh(new THREE.ConeGeometry(0.06, 0.24, 8), toon(c2), 0, 0.03 + Math.cos(a) * 0.42, Math.sin(a) * 0.42);
      sp.rotation.x = a;
      g.add(sp);
    }
    if (v === 'helm') ringOf(6, 0.37, (a, x, z) => {
      const st = mesh(new THREE.ConeGeometry(0.03, 0.08, 6), toon(c3), x, 0.14, z);
      st.rotation.set(Math.PI / 2 * Math.cos(a), 0, -Math.PI / 2 * Math.sin(a));
      g.add(st);
    });
  },
  vinyl(g, [c1, c2]) {
    // a vinyl record worn tilted like a flat cap, with a tone arm pin
    const rec = mesh(CYL(0.46, 0.46, 0.025, 32), toon(c1), 0, 0.34, 0);
    rec.rotation.set(0.2, 0, -0.15);
    g.add(rec);
    for (const r of [0.38, 0.3, 0.22]) {
      const gr = mesh(new THREE.TorusGeometry(r, 0.006, 4, 32), toon('#3a3a3a'), 0, 0.355, 0);
      gr.rotation.set(Math.PI / 2 + 0.2, 0, -0.15);
      gr.userData.noOutline = true;
      g.add(gr);
    }
    const lab = mesh(CYL(0.13, 0.13, 0.03, 20), toon(c2), 0, 0.348, 0);
    lab.rotation.set(0.2, 0, -0.15);
    g.add(lab);
    dome(g, c1, 0.34, 0.03, 1.0);
  },
  speaker(g, [c1, c2, c3]) {
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.36, 0.42), toon(c1), 0, 0.48, 0));
    for (const [y, r] of [[0.53, 0.12], [0.37, 0.05]] as const) {
      const cone = mesh(CYL(r, r * 0.4, 0.04, 20), toon(c2), 0, y, 0.215);
      cone.rotation.x = Math.PI / 2;
      g.add(cone);
      g.add(mesh(S(r * 0.35, 10, 8), toon(c3), 0, y, 0.22));
    }
    brim(g, c1, 0.3, 0.29, 0.05);
  },
  drum(g, [c1, c2, c3]) {
    // a little snare drum on the head with two sticks crossed in it
    g.add(mesh(CYL(0.27, 0.27, 0.2, 22), toon(c1), 0, 0.44, 0));
    g.add(mesh(CYL(0.272, 0.272, 0.02, 22), toon(c2), 0, 0.545, 0));
    for (const y of [0.34, 0.54]) g.add(mesh(new THREE.TorusGeometry(0.275, 0.015, 6, 24), toon('#cfd8dc'), 0, y, 0).rotateX(Math.PI / 2));
    ringOf(8, 0.275, (a, x, z) => g.add(mesh(new THREE.BoxGeometry(0.02, 0.18, 0.02), toon('#cfd8dc'), x, 0.44, z)));
    for (const s of [-1, 1]) {
      const st = mesh(CYL(0.012, 0.018, 0.5, 8), toon(c3), s * 0.1, 0.66, 0.05);
      st.rotation.set(0.2, 0, s * 0.55);
      g.add(st);
    }
    brim(g, c1, 0.3, 0.33, 0.03);
  },
  jester(g, [c1, c2, c3]) {
    dome(g, c1, 0.37, 0.03, 1.35);
    for (const [s, col] of [[-1, c1], [1, c2]] as const) {
      for (let k = 0; k < 4; k++) {
        const seg = mesh(CYL(0.1 - k * 0.02, 0.12 - k * 0.02, 0.14, 12), toon(col), s * (0.2 + k * 0.08), 0.36 + k * 0.05 - (k > 2 ? 0.08 : 0), 0);
        seg.rotation.z = -s * (0.9 + k * 0.25);
        g.add(seg);
      }
      pom(g, c3, 0.05, s * 0.52, 0.32, 0);
    }
    g.add(mesh(new THREE.TorusGeometry(0.37, 0.04, 6, 28), toon(c3), 0, 0.12, 0).rotateX(Math.PI / 2));
  },
  mortarboard(g, [c1, c2]) {
    dome(g, c1, 0.36, 0.02, 1.25);
    const top = mesh(new THREE.BoxGeometry(0.66, 0.03, 0.66), toon(c1), 0, 0.37, 0);
    top.rotation.y = Math.PI / 4;
    g.add(top);
    pom(g, c2, 0.03, 0, 0.39, 0);
    g.add(mesh(CYL(0.008, 0.008, 0.3, 6), toon(c2), 0.3, 0.24, 0.12));
    pom(g, c2, 0.04, 0.3, 0.08, 0.12);
    note(g, c2, 0.1, -0.2, 0.42, 0.05);
  },
  tricorn(g, [c1, c2, c3]) {
    dome(g, c1, 0.34, 0.1, 1.4);
    const R = 0.6;
    const b = mesh(CYL(R, R, 0.025, 3), toon(c1), 0, 0.15, 0);
    g.add(b);
    for (const a of [Math.PI / 3, Math.PI, (5 * Math.PI) / 3]) {
      const side = new THREE.Group();
      side.rotation.y = a;
      const wall = mesh(new THREE.BoxGeometry(R * 1.55, 0.2, 0.03), toon(c1), 0, 0.24, R * 0.47);
      wall.rotation.x = 0.4;
      side.add(wall);
      const trim = mesh(new THREE.BoxGeometry(R * 1.55, 0.025, 0.04), toon(c2), 0, 0.335, R * 0.47 + 0.04);
      trim.rotation.x = 0.4;
      side.add(trim);
      g.add(side);
    }
    star(g, c3, 0.06, 0, 0.3, 0.33);
  },
  chada(g, [c1, c2, c3], v) {
    // a tiered Thai crown: stacked rings narrowing to a spire
    hatBand(g, c1, 0.33, 0.2, 0.1);
    for (let k = 0; k < 5; k++) g.add(mesh(CYL(0.26 - k * 0.045, 0.3 - k * 0.045, 0.1, 18), toon(k % 2 ? c2 : c1), 0, 0.3 + k * 0.1, 0));
    const sp = mesh(new THREE.ConeGeometry(0.06, 0.4, 12), toon(c1), 0, 0.95, 0);
    g.add(sp);
    ringOf(8, 0.335, (a, x, z) => gem(g, c3, 0.025, x, 0.2, z));
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.ConeGeometry(0.05, 0.26, 6), toon(c1), s * 0.36, 0.16, -0.04);
      wing.rotation.z = -s * 2.4;
      g.add(wing);
    }
    if (v === 'flame') for (let k = 0; k < 3; k++) {
      const f = mesh(new THREE.ConeGeometry(0.05 - k * 0.012, 0.18, 8), glow(k ? '#ffb300' : '#ff5722', 0.8), 0, 1.12 + k * 0.08, 0);
      f.userData.noOutline = true;
      g.add(f);
    }
  },
  ngob(g, [c1, c2]) {
    // a wide woven cone (Thai farmer's hat) on a small inner crown
    const mat = toon(c1).clone();
    mat.side = THREE.DoubleSide;
    const cone = mesh(new THREE.ConeGeometry(0.62, 0.34, 28, 1, true), mat, 0, 0.4, 0);
    g.add(cone);
    for (const k of [0.25, 0.55, 0.8]) g.add(mesh(new THREE.TorusGeometry(0.62 * k, 0.008, 4, 28), toon(c2), 0, 0.57 - 0.34 * k, 0).rotateX(Math.PI / 2));
    g.add(mesh(CYL(0.28, 0.32, 0.12, 18), toon(c2), 0, 0.2, 0));
    note(g, c2, 0.1, 0.25, 0.42, 0.33, 0.5, 0.5);
  },
  santa(g, [c1, c2, c3]) {
    const cone = mesh(new THREE.ConeGeometry(0.33, 0.6, 18), toon(c1), 0.1, 0.48, -0.05);
    cone.rotation.set(-0.5, 0, -0.5);
    g.add(cone);
    g.add(mesh(new THREE.TorusGeometry(0.35, 0.06, 8, 28), toon(c2), 0, 0.15, 0).rotateX(Math.PI / 2));
    pom(g, c2, 0.08, 0.36, 0.62, -0.25);
    // a little bell
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8, 0, Math.PI * 2, 0, 2), toon(c3), 0.36, 0.53, -0.25));
  },
  pumpkin(g, [c1, c2, c3]) {
    for (let k = 0; k < 6; k++) {
      const lobe = mesh(S(0.22, 14, 10), toon(c1), Math.sin((k / 6) * Math.PI * 2) * 0.17, 0.4, Math.cos((k / 6) * Math.PI * 2) * 0.17);
      lobe.scale.set(0.8, 0.9, 0.8);
      g.add(lobe);
    }
    g.add(mesh(CYL(0.03, 0.05, 0.14, 8), toon(c2), 0, 0.64, 0));
    // carved face glowing from inside
    for (const s of [-1, 1]) {
      const e = mesh(new THREE.ConeGeometry(0.04, 0.06, 3), glow(c3, 0.9), s * 0.08, 0.45, 0.34);
      e.rotation.x = Math.PI / 2;
      e.userData.noOutline = true;
      g.add(e);
    }
    const m = mesh(new THREE.BoxGeometry(0.16, 0.03, 0.02), glow(c3, 0.9), 0, 0.36, 0.35);
    m.userData.noOutline = true;
    g.add(m);
  },
  mushroom(g, [c1, c2, c3]) {
    const cap = mesh(new THREE.SphereGeometry(0.46, 22, 12, 0, Math.PI * 2, 0, 1.45), toon(c1), 0, 0.13, 0);
    cap.scale.y = 0.75;
    g.add(cap);
    ringOf(6, 0.3, (a, x, z) => {
      const d = mesh(S(0.06, 10, 8), toon(c2), x, 0.36, z);
      d.scale.y = 0.4;
      g.add(d);
    });
    pom(g, c2, 0.07, 0, 0.48, 0);
    note(g, c3, 0.12, 0.3, 0.42, 0.2, 0.9);
  },
  critter(g, [c1, c2, c3], v) {
    // a little animal sitting on the head: frog or chick
    const body = mesh(S(0.2, 16, 12), toon(c1), 0, 0.48, 0);
    body.scale.set(1.1, 0.8, 1);
    g.add(body);
    if (v === 'frog') {
      for (const s of [-1, 1]) {
        g.add(mesh(S(0.08), toon(c1), s * 0.12, 0.62, 0.08));
        g.add(mesh(S(0.05), toon('#ffffff'), s * 0.12, 0.64, 0.14));
        g.add(mesh(S(0.025), toon('#111111'), s * 0.12, 0.645, 0.185));
        const leg = mesh(S(0.07), toon(c1), s * 0.2, 0.36, 0.1);
        leg.scale.set(1, 0.5, 1.5);
        g.add(leg);
      }
      const mouth = mesh(new THREE.TorusGeometry(0.1, 0.01, 4, 12, Math.PI), toon(c2), 0, 0.5, 0.19);
      mouth.rotation.z = Math.PI;
      g.add(mouth);
    } else {
      g.add(mesh(S(0.13), toon(c1), 0, 0.68, 0.04));
      for (const s of [-1, 1]) g.add(mesh(S(0.022), toon('#111111'), s * 0.05, 0.7, 0.15));
      const beak = mesh(new THREE.ConeGeometry(0.035, 0.08, 6), toon(c2), 0, 0.67, 0.18);
      beak.rotation.x = Math.PI / 2;
      g.add(beak);
      for (const s of [-1, 1]) {
        const w = mesh(S(0.08), toon(c1), s * 0.2, 0.5, 0);
        w.scale.set(0.4, 0.8, 1);
        w.rotation.z = s * 0.5;
        g.add(w);
      }
      feather(g, c1, 0.6, 0, 0.8, 0.02, 0);
    }
    note(g, c3, 0.1, 0.24, 0.62, 0.05, 0.4);
  },
  cloud(g, [c1, c2, c3]) {
    for (const [x, y, z, r] of [[0, 0.62, 0, 0.17], [-0.17, 0.57, 0.02, 0.13], [0.17, 0.57, 0, 0.14], [0.06, 0.7, -0.05, 0.12], [-0.08, 0.56, 0.12, 0.1]] as const)
      g.add(mesh(S(r, 14, 10), toon(c1), x, y, z));
    note(g, c2, 0.11, -0.12, 0.42, 0.1, 0, 0.2);
    note(g, c3, 0.09, 0.13, 0.39, 0.05, 0, -0.2);
  },
  fez(g, [c1, c2]) {
    tube(g, c1, 0.2, 0.27, 0.26, 0.14);
    g.add(mesh(CYL(0.006, 0.006, 0.08, 4), toon(c2), 0, 0.44, 0));
    const t = mesh(CYL(0.006, 0.006, 0.26, 4), toon(c2), 0.16, 0.36, 0);
    t.rotation.z = 0.6;
    g.add(t);
    g.add(mesh(new THREE.SphereGeometry(0.05, 10, 8, 0, Math.PI * 2, 0, 2), toon(c2), 0.24, 0.25, 0));
  },
  turban(g, [c1, c2, c3]) {
    for (let k = 0; k < 4; k++) {
      const t = mesh(new THREE.TorusGeometry(0.34 - k * 0.06, 0.07, 8, 26), toon(k % 2 ? c2 : c1), 0, 0.17 + k * 0.08, 0);
      t.rotation.set(Math.PI / 2 + (k % 2 ? 0.15 : -0.15), 0, 0);
      g.add(t);
    }
    g.add(mesh(S(0.15, 14, 10), toon(c1), 0, 0.42, 0));
    gem(g, c3, 0.06, 0, 0.28, 0.38);
    feather(g, '#fafafa', 1.2, 0.04, 0.45, 0.33, -0.2);
  },
  captain(g, [c1, c2, c3]) {
    const top = mesh(CYL(0.42, 0.33, 0.16, 24), toon(c1), 0, 0.3, 0);
    g.add(top);
    hatBand(g, c2, 0.335, 0.18, 0.08);
    const visor = mesh(CYL(0.25, 0.25, 0.022, 20), toon('#1b1b1b'), 0, 0.14, 0.26);
    visor.scale.z = 0.6;
    g.add(visor);
    note(g, c3, 0.11, 0, 0.21, 0.35);
    for (const s of [-1, 1]) feather(g, c3, 0.6, s * 0.1, 0.22, 0.34, s * 1.2);
  },
  flamecrown(g, [c1, c2, c3]) {
    hatBand(g, c3, 0.31, 0.2, 0.08);
    ringOf(9, 0.3, (a, x, z, i) => {
      const f = mesh(new THREE.ConeGeometry(0.07, 0.24 + (i % 2) * 0.08, 8), glow(i % 2 ? c1 : c2, 0.8), x, 0.36 + (i % 2) * 0.04, z);
      f.userData.noOutline = true;
      g.add(f);
    });
    gem(g, c2, 0.05, 0, 0.21, 0.32);
  },
  wings(g, [c1, c2]) {
    headband(g, c2, 0.385, 0.02);
    for (const s of [-1, 1]) {
      const w = new THREE.Shape();
      w.moveTo(0, 0);
      w.quadraticCurveTo(0.15, 0.3, 0.42, 0.35);
      w.lineTo(0.36, 0.22);
      w.lineTo(0.42, 0.14);
      w.lineTo(0.3, 0.08);
      w.lineTo(0.32, -0.02);
      w.quadraticCurveTo(0.15, 0.02, 0, 0);
      const m = mesh(new THREE.ExtrudeGeometry(w, { depth: 0.02, bevelEnabled: false }), toon(c1), s * 0.33, 0.2, -0.02);
      m.scale.x = s;
      m.rotation.y = -s * 0.35;
      g.add(m);
    }
  },
  clef(g, [c1, c2]) {
    // a big note hair clip at the side
    note(g, c1, 0.34, 0.27, 0.32, 0.08, 0.9, -0.3);
    pom(g, c2, 0.045, 0.3, 0.2, 0.12);
  },
};
// A tuba bell worn like a hat: the brass flare opening upwards, valves at the side.
BUILD.horn = (g, [c1, c2, c3]) => {
  const bell = mesh(CYL(0.42, 0.25, 0.34, 26, ), toon(c1), 0, 0.33, 0);
  g.add(bell);
  const im = toon(c2).clone();
  im.side = THREE.BackSide;
  const inner = mesh(CYL(0.39, 0.15, 0.3, 26), im, 0, 0.35, 0);
  g.add(inner);
  g.add(mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 28), toon(c1), 0, 0.5, 0).rotateX(Math.PI / 2));
  for (let k = 0; k < 3; k++) g.add(mesh(CYL(0.025, 0.025, 0.12, 8), toon(c3), 0.3 + k * 0.05, 0.25, 0.22));
};

/** Builds a music hat into `g`. Returns false when the look is unknown. */
export function buildHat(g: THREE.Group, look: HatLook | undefined): boolean {
  const b = look && BUILD[look.kind];
  if (!b) return false;
  b(g, look.c, look.v ?? '');
  return true;
}

export const HAT_KINDS = Object.keys(BUILD);
