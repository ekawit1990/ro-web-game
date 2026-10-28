import * as THREE from 'three';
import { Appearance, CLASSES, ClassKey, HAIR_COLORS, MONSTERS } from '../data';
import { canvasTexture, mesh, outline, shade, shadows, toon } from './toon';

/**
 * Chibi anime characters and monsters built from primitives (no third-party models).
 * Units: 1 = one map tile. Characters face +Z, feet at y = 0.
 */

export interface Look extends Appearance {
  cls?: ClassKey;
  body?: string; // NPC outfit colour
}

export interface CharRig {
  root: THREE.Group; // positioned/rotated by the world
  body: THREE.Group; // bobbing, sitting, lying down
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  hatSlot: THREE.Group;
  hat: string;
  height: number;
}

const SKIN = '#ffe2c8';
const S = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const CYL = (rt: number, rb: number, h: number, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);
const CAP = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);

// ---------------------------------------------------------------- face

const faceCache = new Map<string, THREE.Texture>();

function faceTexture(face: number, female: boolean, hair: string) {
  const key = `${face}_${female}_${hair}`;
  if (faceCache.has(key)) return faceCache.get(key)!;
  const t = canvasTexture(256, 160, (c) => {
    const ey = 84;
    const brow = shade(hair, -40);
    const eye = (x: number) => {
      if (face === 0 || face === 2) {
        // big anime eyes: white, iris, pupil, highlights
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.ellipse(x, ey, 19, face === 2 ? 17 : 24, 0, 0, Math.PI * 2);
        c.fill();
        const g = c.createLinearGradient(0, ey - 22, 0, ey + 22);
        g.addColorStop(0, '#2a3f7a');
        g.addColorStop(1, female ? '#5aa0e6' : '#4f8c5c');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(x, ey + 3, 14, face === 2 ? 14 : 19, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#10121c';
        c.beginPath();
        c.ellipse(x, ey + 4, 6, 9, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#fff';
        c.beginPath();
        c.ellipse(x - 6, ey - 7, 5, 6, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(x + 6, ey + 10, 2.5, 0, Math.PI * 2);
        c.fill();
        // upper lid
        c.strokeStyle = '#1a1210';
        c.lineWidth = 5;
        c.beginPath();
        c.ellipse(x, ey, 20, face === 2 ? 17 : 24, 0, Math.PI * 1.1, Math.PI * 1.9);
        c.stroke();
        if (face === 2) {
          c.lineWidth = 6;
          c.beginPath();
          c.moveTo(x - 22, ey - 20 + (x < 128 ? -4 : 6));
          c.lineTo(x + 22, ey - 20 + (x < 128 ? 6 : -4));
          c.stroke();
        }
        if (female) {
          c.lineWidth = 3;
          c.beginPath();
          c.moveTo(x + (x < 128 ? -18 : 18), ey - 14);
          c.lineTo(x + (x < 128 ? -27 : 27), ey - 22);
          c.stroke();
        }
      } else if (face === 1) {
        c.strokeStyle = '#1a1210';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.beginPath();
        c.arc(x, ey + 8, 15, Math.PI * 1.15, Math.PI * 1.85);
        c.stroke();
      } else {
        c.strokeStyle = '#1a1210';
        c.lineWidth = 6;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(x - 16, ey + 2);
        c.quadraticCurveTo(x, ey + 10, x + 16, ey + 2);
        c.stroke();
      }
    };
    eye(84);
    eye(172);
    // brows
    c.strokeStyle = brow;
    c.lineWidth = 5;
    c.lineCap = 'round';
    for (const x of [84, 172]) {
      c.beginPath();
      c.moveTo(x - 16, 44 + (face === 2 ? (x < 128 ? -2 : 6) : 0));
      c.lineTo(x + 16, 44 + (face === 2 ? (x < 128 ? 6 : -2) : 0));
      c.stroke();
    }
    // blush + mouth
    c.fillStyle = 'rgba(255,120,130,0.35)';
    c.beginPath();
    c.ellipse(56, 120, 18, 8, 0, 0, Math.PI * 2);
    c.ellipse(200, 120, 18, 8, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#a0463c';
    c.lineWidth = 4;
    c.beginPath();
    if (face === 1) c.arc(128, 122, 10, 0.15 * Math.PI, 0.85 * Math.PI);
    else {
      c.moveTo(120, 128);
      c.quadraticCurveTo(128, 133, 136, 128);
    }
    c.stroke();
  });
  faceCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- hair

function buildHair(head: THREE.Group, style: number, female: boolean, color: string) {
  const mat = toon(color);
  const dark = toon(shade(color, -30));
  const R = 0.35;
  // top cap + back of the head (face stays open)
  const top = mesh(new THREE.SphereGeometry(R, 24, 12, 0, Math.PI * 2, 0, 1.25), mat);
  top.position.y = 0.01;
  head.add(top);
  const back = mesh(new THREE.SphereGeometry(R * 0.99, 24, 10, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 1.15, 1.25), mat);
  head.add(back);
  // fringe over the forehead
  const fringe = (n: number, len: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * spread;
      const c = mesh(new THREE.ConeGeometry(0.075, len, 6), mat);
      c.position.set(Math.sin(a) * 0.31, 0.12, Math.cos(a) * 0.3);
      c.rotation.set(Math.PI - 0.35, 0, -a * 0.6);
      head.add(c);
    }
  };

  if (style === 0) {
    // spiky
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const c = mesh(new THREE.ConeGeometry(0.09, 0.32, 6), mat);
      c.position.set(Math.sin(a) * 0.22, 0.28, Math.cos(a) * 0.22 - 0.03);
      c.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
      head.add(c);
    }
    fringe(5, 0.24, 1.6);
  } else if (style === 1) {
    // neat bowl cut
    const bowl = mesh(new THREE.SphereGeometry(R * 1.04, 24, 12, 0, Math.PI * 2, 0, 1.45), mat);
    head.add(bowl);
    fringe(7, 0.16, 1.9);
  } else if (style === 2) {
    // side-swept with long back
    fringe(5, 0.28, 1.4);
    const side = mesh(CAP(0.07, 0.3), mat);
    side.position.set(0.3, -0.12, 0.12);
    side.rotation.z = 0.15;
    head.add(side);
    if (female) {
      const longBack = mesh(new THREE.BoxGeometry(0.58, 0.62, 0.16), mat);
      longBack.position.set(0, -0.28, -0.2);
      longBack.rotation.x = 0.12;
      head.add(longBack);
    }
  } else if (style === 3) {
    // ponytail
    fringe(5, 0.22, 1.6);
    const knot = mesh(S(0.08), dark);
    knot.position.set(0, 0.12, -0.34);
    head.add(knot);
    const tail = mesh(new THREE.ConeGeometry(0.11, 0.6, 8), mat);
    tail.position.set(0, -0.18, -0.42);
    tail.rotation.x = Math.PI + 0.35;
    tail.name = 'swing';
    head.add(tail);
  } else if (style === 4) {
    // long straight
    fringe(7, 0.22, 1.8);
    const longBack = mesh(new THREE.BoxGeometry(0.66, 0.85, 0.16), mat);
    longBack.position.set(0, -0.36, -0.2);
    longBack.rotation.x = 0.1;
    head.add(longBack);
    for (const s of [-1, 1]) {
      const lock = mesh(CAP(0.07, 0.55), mat);
      lock.position.set(s * 0.32, -0.32, 0.06);
      head.add(lock);
    }
  } else {
    // twin buns (+ twin tails for girls)
    fringe(5, 0.22, 1.6);
    for (const s of [-1, 1]) {
      const bun = mesh(S(0.12), mat);
      bun.position.set(s * 0.3, 0.22, -0.08);
      head.add(bun);
      if (female) {
        const tail = mesh(new THREE.ConeGeometry(0.1, 0.62, 8), mat);
        tail.position.set(s * 0.38, -0.12, -0.1);
        tail.rotation.set(Math.PI, 0, s * -0.2);
        tail.name = 'swing';
        head.add(tail);
      }
    }
  }
}

// ---------------------------------------------------------------- instruments

function instrument(rig: CharRig, cls: ClassKey) {
  const handR = rig.armR.getObjectByName('hand')!;
  const handL = rig.armL.getObjectByName('hand')!;
  if (cls === 'singer') {
    const mic = new THREE.Group();
    mic.add(mesh(CYL(0.025, 0.02, 0.2), toon('#222222'), 0, 0.06, 0));
    mic.add(mesh(S(0.05), toon('#b0b6bd'), 0, 0.18, 0));
    mic.rotation.x = -0.6;
    handR.add(mic);
    rig.armR.rotation.x = -1.1; // holding the mic up
  } else if (cls === 'guitarist' || cls === 'bassist') {
    const bass = cls === 'bassist';
    const g = new THREE.Group();
    const bodyMat = toon(bass ? '#5a3a8a' : '#d9822b');
    const big = mesh(CYL(bass ? 0.17 : 0.16, bass ? 0.17 : 0.16, 0.07, 18), bodyMat);
    big.rotation.x = Math.PI / 2;
    g.add(big);
    const small = mesh(CYL(0.12, 0.12, 0.07, 18), bodyMat, 0, 0.17, 0);
    small.rotation.x = Math.PI / 2;
    g.add(small);
    if (!bass) {
      const hole = mesh(CYL(0.045, 0.045, 0.072, 14), toon('#2a180a'), 0, 0.08, 0);
      hole.rotation.x = Math.PI / 2;
      g.add(hole);
    }
    g.add(mesh(new THREE.BoxGeometry(0.05, bass ? 0.62 : 0.5, 0.03), toon('#6b4320'), 0, bass ? 0.55 : 0.48, 0.01));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.1, 0.03), toon('#2a180a'), 0, bass ? 0.9 : 0.77, 0.01));
    g.position.set(0.02, 0.62, 0.2);
    g.rotation.set(0, 0, -1.05);
    rig.body.add(g);
    rig.armR.rotation.set(-0.5, 0, 0.3);
    rig.armL.rotation.set(-1.0, 0, -0.5);
  } else if (cls === 'drummer') {
    for (const h of [handL, handR]) {
      const stick = mesh(CYL(0.014, 0.02, 0.36), toon('#e3c18f'), 0, 0.12, 0.06);
      stick.rotation.x = -1.1;
      h.add(stick);
    }
  } else if (cls === 'keyboardist') {
    const k = new THREE.Group();
    k.add(mesh(new THREE.BoxGeometry(0.62, 0.05, 0.16), toon('#263238')));
    const keys = canvasTexture(128, 32, (c) => {
      c.fillStyle = '#fafafa';
      c.fillRect(0, 0, 128, 32);
      c.fillStyle = '#222';
      for (let x = 4; x < 128; x += 9) if ((x / 9) % 7 !== 2) c.fillRect(x + 5, 0, 5, 18);
      c.strokeStyle = '#999';
      for (let x = 0; x < 128; x += 9) c.strokeRect(x, 0, 9, 32);
    });
    const top = mesh(new THREE.PlaneGeometry(0.52, 0.11), toon('#ffffff', { map: keys }), 0.02, 0.026, 0.01);
    top.rotation.x = -Math.PI / 2;
    top.userData.noOutline = true;
    k.add(top);
    k.add(mesh(new THREE.BoxGeometry(0.06, 0.02, 0.04), toon('#40c4ff', { emissive: 0x0a4a66 }), -0.28, 0.03, 0));
    k.position.set(0, 0.62, 0.26);
    k.rotation.set(0.5, 0, 0.15);
    rig.body.add(k);
    rig.armR.rotation.set(-0.9, 0, 0.2);
    rig.armL.rotation.set(-0.9, 0, -0.2);
  }
}

// ---------------------------------------------------------------- hats

export function setHat(rig: CharRig, item: string) {
  if (rig.hat === item) return;
  rig.hat = item;
  rig.hatSlot.clear();
  const g = new THREE.Group();
  if (item === 'note_ribbon') {
    const pink = toon('#ff6fae');
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.ConeGeometry(0.1, 0.2, 4), pink, s * 0.11, 0, 0);
      wing.rotation.z = s * Math.PI / 2;
      g.add(wing);
    }
    g.add(mesh(S(0.05), toon('#ff3d8b')));
    g.position.set(0.16, 0.3, 0.05);
    g.rotation.z = -0.4;
  } else if (item === 'headphones') {
    const band = mesh(new THREE.TorusGeometry(0.37, 0.025, 8, 24, Math.PI), toon('#37474f'));
    band.position.y = 0.02;
    g.add(band);
    for (const s of [-1, 1]) {
      const cup = mesh(CYL(0.1, 0.1, 0.07, 16), toon('#263238'), s * 0.37, 0.0, 0);
      cup.rotation.z = Math.PI / 2;
      g.add(cup);
      const pad = mesh(CYL(0.06, 0.06, 0.075, 16), toon('#ef5350'), s * 0.375, 0, 0);
      pad.rotation.z = Math.PI / 2;
      g.add(pad);
    }
  } else if (item === 'rock_cap') {
    g.add(mesh(new THREE.SphereGeometry(0.37, 20, 10, 0, Math.PI * 2, 0, 1.35), toon('#212121'), 0, 0.03, 0));
    const brim = mesh(CYL(0.24, 0.24, 0.025, 20), toon('#111111'), 0, 0.12, 0.3);
    brim.scale.set(1.2, 1, 0.8);
    g.add(brim);
    g.add(mesh(new THREE.OctahedronGeometry(0.06), toon('#ffd600'), 0, 0.3, 0.27));
  } else return;
  outline(g, 0.012);
  shadows(g);
  rig.hatSlot.add(g);
}

// ---------------------------------------------------------------- characters

export function buildCharacter(look: Look, hat = ''): CharRig {
  const female = look.gender === 'f';
  const cls = look.cls ? CLASSES[look.cls] : null;
  const outfit = look.body ?? cls?.color ?? '#888888';
  const hairColor = HAIR_COLORS[look.hair_color] ?? HAIR_COLORS[0];
  const skin = toon(SKIN, { emissive: 0x3a2a20 }); // softer shadow band on faces
  const cloth = toon(outfit);
  const clothDark = toon(shade(outfit, -45));
  const pants = toon('#3d3550');
  const shoe = toon('#4a2f22');

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const limb = (x: number, y: number, len: number, r: number, mat: THREE.Material, end: THREE.Material, endR: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    pivot.add(mesh(CAP(r, len), mat, 0, -len / 2 - r * 0.5, 0));
    const hand = mesh(S(endR, 12, 10), end, 0, -len - r, 0.01);
    hand.name = 'hand';
    pivot.add(hand);
    body.add(pivot);
    return pivot;
  };
  const legL = limb(-0.09, 0.42, 0.26, 0.065, female ? skin : pants, shoe, 0.08);
  const legR = limb(0.09, 0.42, 0.26, 0.065, female ? skin : pants, shoe, 0.08);
  for (const l of [legL, legR]) l.getObjectByName('hand')!.scale.set(1, 0.7, 1.4);

  // torso
  if (female) {
    body.add(mesh(CYL(0.15, 0.17, 0.3), cloth, 0, 0.72, 0));
    const skirtMat = cloth.clone();
    skirtMat.side = THREE.DoubleSide;
    const skirt = mesh(new THREE.ConeGeometry(0.3, 0.32, 18, 1, true), skirtMat, 0, 0.5, 0);
    body.add(skirt);
    body.add(mesh(CYL(0.155, 0.155, 0.05), clothDark, 0, 0.62, 0));
  } else {
    body.add(mesh(CYL(0.17, 0.19, 0.38), cloth, 0, 0.66, 0));
    body.add(mesh(CYL(0.19, 0.19, 0.06), clothDark, 0, 0.48, 0));
  }
  body.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.02), toon(shade(outfit, 60)), 0, 0.72, 0.17));
  body.add(mesh(CYL(0.06, 0.07, 0.08), skin, 0, 0.89, 0));

  const armL = limb(-0.23, 0.84, 0.24, 0.05, cloth, skin, 0.06);
  const armR = limb(0.23, 0.84, 0.24, 0.05, cloth, skin, 0.06);
  armL.rotation.z = -0.15;
  armR.rotation.z = 0.15;

  // head
  const head = new THREE.Group();
  head.position.y = 1.2;
  const skull = mesh(S(0.33, 28, 20), skin);
  skull.scale.set(1, 0.96, 0.96);
  head.add(skull);
  const face = mesh(
    new THREE.SphereGeometry(0.333, 24, 12, Math.PI / 2 - 0.95, 1.9, 1.15, 0.95),
    new THREE.MeshBasicMaterial({ map: faceTexture(look.face, female, hairColor), transparent: true }),
  );
  face.scale.copy(skull.scale);
  face.userData.noOutline = true;
  head.add(face);
  buildHair(head, look.hair, female, hairColor);
  const hatSlot = new THREE.Group();
  head.add(hatSlot);
  body.add(head);

  const rig: CharRig = { root, body, head, armL, armR, legL, legR, hatSlot, hat: '', height: 1.6 };
  if (look.cls) instrument(rig, look.cls);
  outline(body, 0.014);
  shadows(root);
  setHat(rig, hat);
  rig.armL.userData.rest = rig.armL.rotation.clone();
  rig.armR.userData.rest = rig.armR.rotation.clone();
  return rig;
}

/** Procedural animation: walking, idle breathing, sitting, attack swing, lying down. */
export function animateCharacter(rig: CharRig, t: number, s: { moving: boolean; sitting: boolean; dead: boolean; attack: number }) {
  const restL = rig.armL.userData.rest as THREE.Euler;
  const restR = rig.armR.userData.rest as THREE.Euler;
  rig.body.rotation.set(0, 0, 0);
  rig.body.position.set(0, 0, 0);
  if (s.dead) {
    rig.body.rotation.x = -Math.PI / 2;
    rig.body.position.y = 0.15;
    return;
  }
  const swing = s.moving ? Math.sin(t * 11) : 0;
  rig.legL.rotation.x = swing * 0.6;
  rig.legR.rotation.x = -swing * 0.6;
  rig.armL.rotation.x = restL.x - swing * 0.45 * (restL.x === 0 ? 1 : 0.3);
  rig.armR.rotation.x = restR.x + swing * 0.45 * (restR.x === 0 ? 1 : 0.3);
  rig.body.position.y = s.moving ? Math.abs(Math.sin(t * 11)) * 0.05 : Math.sin(t * 2) * 0.01;
  rig.head.rotation.z = s.moving ? 0 : Math.sin(t * 1.3) * 0.03;
  for (const c of rig.head.children) if (c.name === 'swing') c.rotation.z = Math.sin(t * (s.moving ? 9 : 2)) * 0.12;
  if (s.sitting) {
    rig.body.position.y = -0.3;
    rig.legL.rotation.x = -1.4;
    rig.legR.rotation.x = -1.4;
  }
  if (s.attack > 0) {
    // quick strike: both arms forward
    const k = Math.sin(s.attack * Math.PI);
    rig.armR.rotation.x = restR.x - k * 1.4;
    rig.armL.rotation.x = restL.x - k * 0.8;
    rig.body.rotation.x = k * 0.12;
  }
}

// ---------------------------------------------------------------- monsters

export interface MonsterRig {
  root: THREE.Group;
  body: THREE.Group;
  height: number;
}

function eyes(g: THREE.Object3D, y: number, z: number, spread: number, r: number) {
  for (const s of [-1, 1]) {
    const e = mesh(S(r, 12, 10), toon('#141414'), s * spread, y, z + 0.05);
    e.scale.set(0.8, 1.1, 0.6);
    e.add(mesh(S(r * 0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), -r * 0.25, r * 0.35, r * 0.6));
    e.userData.noOutline = true;
    g.add(e);
  }
}

export function buildMonster(id: string): MonsterRig {
  const def = MONSTERS[id];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const col = def.color;
  const mat = toon(col);
  const sz = def.size * 0.62;
  let height = sz * 1.1;

  switch (id) {
    case 'drop': {
      const b = mesh(S(0.36, 20, 16), toon(col, { transparent: true, opacity: 0.92 }), 0, 0.33, 0);
      b.scale.set(1, 0.9, 1);
      body.add(b);
      body.add(mesh(new THREE.ConeGeometry(0.28, 0.42, 20), toon(col, { transparent: true, opacity: 0.92 }), 0, 0.74, 0));
      eyes(body, 0.36, 0.3, 0.12, 0.05);
      height = 1;
      break;
    }
    case 'chick': {
      body.add(mesh(S(0.38), mat, 0, 0.38, 0));
      const beak = mesh(new THREE.ConeGeometry(0.07, 0.16, 8), toon('#ff8f00'), 0, 0.38, 0.4);
      beak.rotation.x = Math.PI / 2;
      body.add(beak);
      for (const s of [-1, 1]) {
        const w = mesh(S(0.16), toon(shade(col, -25)), s * 0.36, 0.36, -0.02);
        w.scale.set(0.4, 0.8, 1);
        body.add(w);
        body.add(mesh(CYL(0.025, 0.025, 0.1), toon('#ff8f00'), s * 0.12, 0.04, 0));
      }
      body.add(mesh(new THREE.ConeGeometry(0.05, 0.16, 6), toon(shade(col, -15)), 0, 0.8, 0));
      eyes(body, 0.5, 0.33, 0.14, 0.05);
      break;
    }
    case 'mushy': {
      body.add(mesh(CYL(0.18, 0.22, 0.4), toon('#f3e3c8'), 0, 0.2, 0));
      const cap = mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat, 0, 0.38, 0);
      cap.scale.y = 0.75;
      body.add(cap);
      for (const [x, z, y] of [[0.2, 0.25, 0.55], [-0.25, 0.15, 0.58], [0.05, -0.3, 0.6], [-0.1, 0.32, 0.5], [0.3, -0.1, 0.55]]) {
        body.add(mesh(S(0.05, 8, 6), toon('#ffffff'), x, y, z));
      }
      eyes(body, 0.24, 0.19, 0.08, 0.04);
      break;
    }
    case 'rabbit': {
      body.add(mesh(S(0.36), mat, 0, 0.36, 0));
      for (const s of [-1, 1]) {
        const ear = mesh(CAP(0.07, 0.3), mat, s * 0.13, 0.85, -0.04);
        ear.rotation.z = s * -0.15;
        ear.add(mesh(CAP(0.035, 0.24), toon('#f8bbd0'), 0, 0, 0.04));
        body.add(ear);
      }
      body.add(mesh(S(0.04, 8, 6), toon('#e91e63'), 0, 0.33, 0.35));
      eyes(body, 0.44, 0.31, 0.14, 0.05);
      break;
    }
    case 'buzzer': {
      const b = mesh(S(0.34), mat, 0, 0.55, 0);
      b.scale.set(0.9, 0.85, 1.2);
      body.add(b);
      for (const z of [-0.12, 0.08]) {
        const ring = mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), toon('#2b2b2b'), 0, 0.55, z);
        ring.scale.set(1, 0.95, 1);
        body.add(ring);
      }
      for (const s of [-1, 1]) {
        const w = mesh(S(0.22, 12, 8), toon('#ffffff', { transparent: true, opacity: 0.7 }), s * 0.2, 0.9, -0.05);
        w.scale.set(0.5, 0.15, 1);
        w.name = 'wing';
        w.userData.noOutline = true;
        body.add(w);
      }
      const sting = mesh(new THREE.ConeGeometry(0.06, 0.16, 8), toon('#2b2b2b'), 0, 0.5, -0.45);
      sting.rotation.x = -Math.PI / 2;
      body.add(sting);
      eyes(body, 0.6, 0.36, 0.13, 0.05);
      height = 1.1;
      break;
    }
    case 'frog': {
      const b = mesh(S(0.4), mat, 0, 0.28, 0);
      b.scale.set(1.1, 0.7, 1);
      body.add(b);
      const belly = mesh(S(0.3), toon(shade(col, 45)), 0, 0.24, 0.12);
      belly.scale.set(1, 0.6, 0.8);
      body.add(belly);
      for (const s of [-1, 1]) {
        body.add(mesh(S(0.12), mat, s * 0.18, 0.52, 0.12));
        body.add(mesh(S(0.08, 10, 8), toon('#ffffff'), s * 0.18, 0.55, 0.2));
        body.add(mesh(S(0.04, 8, 6), toon('#111111'), s * 0.18, 0.56, 0.27));
      }
      break;
    }
    case 'bat': {
      body.add(mesh(S(0.24), mat, 0, 0.75, 0));
      for (const s of [-1, 1]) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(0.55, 0.25);
        shape.lineTo(0.5, -0.05);
        shape.lineTo(0.38, -0.12);
        shape.lineTo(0.26, -0.05);
        shape.lineTo(0.12, -0.14);
        shape.lineTo(0, -0.08);
        const wingMat = toon(shade(col, -20)).clone();
        wingMat.side = THREE.DoubleSide;
        const w = mesh(new THREE.ShapeGeometry(shape), wingMat, s * 0.15, 0.75, 0);
        w.scale.x = s;
        w.name = 'wing';
        w.userData.noOutline = true;
        body.add(w);
        const ear = mesh(new THREE.ConeGeometry(0.07, 0.18, 6), mat, s * 0.12, 0.98, 0);
        body.add(ear);
      }
      for (const s of [-1, 1]) body.add(mesh(S(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffeb3b }), s * 0.09, 0.78, 0.21));
      height = 1.2;
      break;
    }
    case 'rocky': {
      const b = mesh(new THREE.DodecahedronGeometry(0.42), toon(col), 0, 0.38, 0);
      b.scale.set(1, 0.9, 0.9);
      body.add(b);
      body.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), toon('#222222'), -0.12, 0.52, 0.36));
      body.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.03), toon('#222222'), 0.12, 0.52, 0.36));
      eyes(body, 0.44, 0.36, 0.12, 0.045);
      break;
    }
    case 'metronome': {
      const b = mesh(new THREE.CylinderGeometry(0.16, 0.38, 0.9, 4), mat, 0, 0.45, 0);
      b.rotation.y = Math.PI / 4;
      body.add(b);
      const face = mesh(new THREE.PlaneGeometry(0.3, 0.5), toon('#efebe9'), 0, 0.45, 0.2);
      face.rotation.x = -0.36;
      face.userData.noOutline = true;
      body.add(face);
      const arm = new THREE.Group();
      arm.position.set(0, 0.12, 0.24);
      arm.add(mesh(new THREE.BoxGeometry(0.03, 0.7, 0.02), toon('#424242'), 0, 0.35, 0));
      arm.add(mesh(new THREE.BoxGeometry(0.1, 0.07, 0.04), toon('#ffb300'), 0, 0.5, 0));
      arm.name = 'pendulum';
      arm.rotation.x = -0.36;
      body.add(arm);
      eyes(body, 0.32, 0.27, 0.08, 0.04);
      height = 1.1;
      break;
    }
    default: {
      // jelly and the boss
      const b = mesh(S(0.4, 24, 16), toon(col, { transparent: true, opacity: 0.93 }), 0, 0.3, 0);
      b.scale.set(1.05, 0.78, 1.05);
      body.add(b);
      const shine = mesh(S(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }), -0.16, 0.5, 0.25);
      shine.scale.set(1, 0.6, 0.6);
      shine.userData.noOutline = true;
      body.add(shine);
      eyes(body, 0.34, 0.37, 0.13, 0.05);
      height = 0.7;
    }
  }
  if (def.boss) {
    const crown = new THREE.Group();
    crown.add(mesh(CYL(0.2, 0.2, 0.1, 16), toon('#ffd700')));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      crown.add(mesh(new THREE.ConeGeometry(0.05, 0.16, 6), toon('#ffd700'), Math.sin(a) * 0.17, 0.12, Math.cos(a) * 0.17));
    }
    crown.add(mesh(S(0.04, 8, 6), toon('#e53935'), 0, 0.02, 0.2));
    crown.position.y = 0.64;
    body.add(crown);
    height = 0.95;
  }
  body.scale.setScalar(sz / 0.5);
  outline(body, 0.02);
  shadows(root);
  return { root, body, height: height * (sz / 0.5) };
}

export function animateMonster(rig: MonsterRig, id: string, t: number, phase: number, moving: boolean) {
  const b = rig.body;
  const k = b.userData.base ?? (b.userData.base = b.scale.x);
  if (id === 'bat' || id === 'buzzer') {
    b.position.y = 0.15 + Math.sin(t * 3 + phase) * 0.08;
    for (const c of b.children) if (c.name === 'wing') c.rotation.y = Math.sin(t * (id === 'bat' ? 14 : 40) + phase) * 0.6;
  } else if (moving) {
    b.position.y = Math.abs(Math.sin(t * 9 + phase)) * 0.18;
    b.scale.set(k * (1 + Math.sin(t * 18 + phase) * 0.04), k * (1 - Math.sin(t * 18 + phase) * 0.06), k);
  } else {
    b.position.y = 0;
    const squash = Math.sin(t * 2.6 + phase) * 0.04;
    b.scale.set(k * (1 + squash), k * (1 - squash), k * (1 + squash));
  }
  const p = b.getObjectByName('pendulum');
  if (p) p.rotation.z = Math.sin(t * 4 + phase) * 0.6;
}
