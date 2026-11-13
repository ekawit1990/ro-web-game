import * as THREE from 'three';

/**
 * The MVP microphones (item `shape` of singer weapons, 2026-11-13), after the user's pictures of stage mics:
 * an instrument mic with a slotted barrel, a slim studio stick, a tapered grey vocal mic, a black one with a
 * red mesh behind a silver cage, a dark one with a silver band, the classic ball-grille vocal mic and a
 * chrome vintage mic on a yoke. No makers' names or logos, only the shapes.
 *
 * Same frame as the plain mic: the hand grips round y = 0, the handle runs down to y ≈ -0.06 and the grille
 * sits on top (up to y ≈ 0.24).
 */
export interface MicStyle {
  /** handle profile [radius, y] from the bottom up */
  handle: [number, number][];
  body: string;
  /** brushed metal handle (a light streak down it) instead of matte */
  metal?: boolean;
  head: 'flat' | 'dome' | 'ball' | 'vintage';
  headR: number;
  /** height of the straight part of the grille */
  headH: number;
  grille: string;
  pattern: 'mesh' | 'slots' | 'ribs' | 'cage';
  /** seen through a cage grille */
  inner?: string;
  /** ring between the handle and the grille */
  band?: string;
  /** colour of the item / glow */
  color: string;
}

export const MIC_STYLES: Record<string, MicStyle> = {
  mic_inst: {
    handle: [[0.019, -0.065], [0.021, -0.055], [0.022, 0.1], [0.023, 0.115]],
    body: '#1b1b1e', head: 'flat', headR: 0.0235, headH: 0.1, grille: '#17171a', pattern: 'slots', color: '#26262b',
  },
  mic_stick: {
    handle: [[0.013, -0.065], [0.0155, -0.055], [0.022, 0.11], [0.0235, 0.125]],
    body: '#4b5057', metal: true, head: 'flat', headR: 0.026, headH: 0.065, grille: '#1c1e21', pattern: 'ribs', band: '#33363b', color: '#4b5057',
  },
  mic_taper: {
    handle: [[0.0155, -0.065], [0.018, -0.055], [0.026, 0.105], [0.0285, 0.118]],
    body: '#757b82', metal: true, head: 'dome', headR: 0.031, headH: 0.045, grille: '#1a1a1d', pattern: 'mesh', band: '#111114', color: '#757b82',
  },
  mic_red: {
    handle: [[0.014, -0.065], [0.0165, -0.055], [0.023, 0.105], [0.0265, 0.118]],
    body: '#17171a', head: 'dome', headR: 0.03, headH: 0.048, grille: '#d5d9de', pattern: 'cage', inner: '#c4141f', band: '#d5d9de', color: '#c4141f',
  },
  mic_silverband: {
    handle: [[0.0155, -0.065], [0.018, -0.055], [0.026, 0.1], [0.028, 0.112]],
    body: '#3c4047', metal: true, head: 'dome', headR: 0.0305, headH: 0.052, grille: '#1b1c1f', pattern: 'mesh', band: '#d3d7dc', color: '#3c4047',
  },
  mic_ball: {
    handle: [[0.0155, -0.065], [0.018, -0.055], [0.025, 0.1], [0.028, 0.114]],
    body: '#1f2023', head: 'ball', headR: 0.045, headH: 0, grille: '#c8ccd1', pattern: 'mesh', band: '#9ca1a7', color: '#c8ccd1',
  },
  mic_vintage: {
    handle: [], body: '#d4d9de', metal: true, head: 'vintage', headR: 0.046, headH: 0.06, grille: '#d4d9de', pattern: 'ribs', color: '#d4d9de',
  },
};

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key)!;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

/** Chrome without an environment map: bright and dark streaks painted round it. */
function chrome(color: string) {
  return mat(`chrome${color}`, () => {
    const map = canvasTex(128, 8, (g) => {
      const grad = g.createLinearGradient(0, 0, 128, 0);
      const stops: [number, string][] = [[0, '#6c7178'], [0.12, '#ffffff'], [0.2, '#9aa0a7'], [0.38, '#40444a'], [0.5, '#e9edf1'], [0.62, '#7d838a'], [0.8, '#ffffff'], [0.9, '#585d63'], [1, '#6c7178']];
      for (const [k, c] of stops) grad.addColorStop(k, c);
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 8);
    });
    return new THREE.MeshStandardMaterial({ color, map, metalness: 0.35, roughness: 0.22 });
  });
}

function handleMat(s: MicStyle) {
  if (!s.metal) return mat(`mh${s.body}`, () => new THREE.MeshStandardMaterial({ color: s.body, roughness: 0.6, metalness: 0.15 }));
  return mat(`mhm${s.body}`, () => {
    const map = canvasTex(64, 8, (g) => {
      const grad = g.createLinearGradient(0, 0, 64, 0);
      for (const [k, v] of [[0, 0.75], [0.2, 1.25], [0.3, 0.95], [0.55, 0.7], [0.75, 1.15], [1, 0.75]] as const) {
        const c = Math.round(255 * Math.min(1, v * 0.8));
        grad.addColorStop(k, `rgb(${c},${c},${c})`);
      }
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 8);
    });
    return new THREE.MeshStandardMaterial({ color: s.body, map, metalness: 0.45, roughness: 0.35 });
  });
}

/** The grille: a fine mesh, slots, ribs or a wire cage, as a texture round the head. */
function grilleMat(s: MicStyle, part: 'side' | 'top' = 'side') {
  const key = `mg${s.pattern}${s.grille}${s.inner ?? ''}${part}`;
  return mat(key, () => {
    if (s.pattern === 'slots' && part === 'side') {
      // two rows of long slots with the grey mesh showing through
      const map = canvasTex(256, 128, (g) => {
        g.fillStyle = s.grille;
        g.fillRect(0, 0, 256, 128);
        for (const row of [0, 1]) {
          for (let i = 0; i < 12; i++) {
            const x = 6 + i * (256 / 12);
            const y = 10 + row * 60;
            g.fillStyle = '#7c838b';
            g.beginPath();
            g.roundRect(x, y, 9, 46, 4);
            g.fill();
            g.fillStyle = 'rgba(0,0,0,0.35)';
            for (let k = y + 3; k < y + 44; k += 3) g.fillRect(x + 1, k, 7, 1);
          }
        }
      });
      return new THREE.MeshStandardMaterial({ map, roughness: 0.5, metalness: 0.3 });
    }
    if (s.pattern === 'ribs' && s.head !== 'vintage') {
      const map = canvasTex(64, 64, (g) => {
        g.fillStyle = s.grille;
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = 'rgba(255,255,255,0.18)';
        for (let y = 0; y < 64; y += 6) g.fillRect(0, y, 64, 2);
        g.fillStyle = 'rgba(0,0,0,0.5)';
        for (let x = 0; x < 64; x += 4) for (let y = 0; y < 64; y += 4) g.fillRect(x + 1, y + 3, 2, 1);
      }, [6, 3]);
      return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.35 });
    }
    if (s.pattern === 'cage') {
      // a silver wire cage over the red mesh (the cage is a separate see-through layer)
      if (part === 'top') {
        const map = canvasTex(64, 64, (g) => {
          g.fillStyle = s.inner!;
          g.fillRect(0, 0, 64, 64);
          g.fillStyle = 'rgba(60,0,0,0.7)';
          for (let x = 0; x < 64; x += 4) for (let y = 0; y < 64; y += 4) g.fillRect(x + (y % 8 ? 2 : 0), y, 2, 2);
        }, [5, 3]);
        return new THREE.MeshStandardMaterial({ map, roughness: 0.6, emissive: new THREE.Color(s.inner).multiplyScalar(0.18) });
      }
      const map = canvasTex(128, 128, (g) => {
        g.clearRect(0, 0, 128, 128);
        g.fillStyle = '#ffffff';
        for (let y = 0; y < 128; y += 16) g.fillRect(0, y, 128, 3);
        for (let x = 0; x < 128; x += 16) g.fillRect(x, 0, 3, 128);
      }, [3, 1]);
      return new THREE.MeshStandardMaterial({ color: s.grille, map, alphaTest: 0.5, transparent: false, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.25 });
    }
    // fine mesh: little dark holes in a metal weave
    const map = canvasTex(64, 64, (g) => {
      g.fillStyle = s.grille;
      g.fillRect(0, 0, 64, 64);
      const light = new THREE.Color(s.grille).getHSL({ h: 0, s: 0, l: 0 }).l > 0.5;
      g.fillStyle = light ? 'rgba(20,22,26,0.55)' : 'rgba(0,0,0,0.6)';
      for (let x = 0; x < 64; x += 4) for (let y = 0; y < 64; y += 4) g.fillRect(x + (y % 8 ? 2 : 0), y, 2, 2);
      g.fillStyle = light ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
      for (let x = 0; x < 64; x += 4) for (let y = 2; y < 64; y += 4) g.fillRect(x + (y % 8 === 2 ? 0 : 2), y, 1, 1);
    }, part === 'top' ? [4, 4] : [8, 3]);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.45, metalness: 0.4 });
  });
}

/** A lathe profile turned round Y. */
function lathe(points: [number, number][], segments = 20) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Head profile: the straight barrel from y0, then (dome) a quarter circle closing at the top. */
function headProfile(s: MicStyle, y0: number, inset = 0): [number, number][] {
  const r = s.headR - inset;
  const pts: [number, number][] = [[r * 0.88, y0], [r, y0 + 0.004], [r, y0 + s.headH]];
  if (s.head === 'dome') {
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      pts.push([Math.max(0.0005, r * Math.cos(a)), y0 + s.headH + r * 0.8 * Math.sin(a)]);
    }
  }
  return pts;
}

function ring(r: number, y: number, h: number, material: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), material);
  m.position.y = y;
  return m;
}

function buildVintage(s: MicStyle) {
  const g = new THREE.Group();
  const metal = chrome(s.body);
  // the stem and its little foot: what the hand holds
  const stem = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.026), metal);
  stem.position.y = -0.005;
  g.add(stem);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.004), mat('vplate', () => new THREE.MeshStandardMaterial({ color: '#202226', roughness: 0.5 })));
  plate.position.set(0, -0.01, 0.0145);
  g.add(plate);
  const sw = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.004), metal);
  sw.position.set(0, -0.022, 0.017);
  g.add(sw);
  // the yoke: a U bracket holding the capsule, a round knob at each pivot
  const yokeH = 0.07;
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, yokeH, 0.016), metal);
    arm.position.set(side * 0.055, 0.09, 0);
    g.add(arm);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 14), metal);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(side * 0.061, 0.12, 0);
    g.add(knob);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.116, 0.008, 0.018), metal);
  bar.position.y = 0.056;
  g.add(bar);
  // the capsule: a rounded oblong with deep horizontal grooves, a centre spine and a round badge
  const ribs = mat('vribs', () => {
    const map = canvasTex(128, 128, (cx) => {
      const grad = cx.createLinearGradient(0, 0, 128, 0);
      for (const [k, c] of [[0, '#8a9097'], [0.1, '#ffffff'], [0.25, '#b9bec4'], [0.4, '#5d6268'], [0.55, '#f2f4f6'], [0.75, '#9aa0a6'], [0.9, '#ffffff'], [1, '#8a9097']] as const) grad.addColorStop(k, c);
      cx.fillStyle = grad;
      cx.fillRect(0, 0, 128, 128);
      cx.fillStyle = 'rgba(12,14,18,0.85)';
      for (let y = 6; y < 122; y += 9) cx.fillRect(0, y, 128, 4);
      cx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let y = 10; y < 122; y += 9) cx.fillRect(0, y, 128, 1);
      // the centre spine over the front (u = 0) and the back (u = 0.5)
      cx.fillStyle = '#f4f6f8';
      for (const x of [0, 62, 124]) cx.fillRect(x, 0, 4, 128);
      cx.fillStyle = 'rgba(0,0,0,0.35)';
      for (const x of [4, 66]) cx.fillRect(x, 0, 1, 128);
      cx.fillRect(123, 0, 1, 128);
      cx.fillRect(61, 0, 1, 128);
    });
    return new THREE.MeshStandardMaterial({ color: '#e6eaee', map, metalness: 0.35, roughness: 0.25 });
  });
  // a rounded oblong turned on a lathe, its points evenly spread so the grooves come out even
  const halfH = s.headR + s.headH / 2;
  const prof: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const y = -halfH + (2 * halfH * i) / 40;
    const k = Math.abs(y / halfH);
    prof.push([Math.max(0.0008, s.headR * Math.pow(Math.max(0, 1 - Math.pow(k, 2.8)), 1 / 2.8)), y]);
  }
  const cap = new THREE.Mesh(lathe(prof, 28), ribs);
  cap.scale.set(1, 1, 0.72);
  cap.position.y = 0.12;
  g.add(cap);
  const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16), metal);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, 0.155, s.headR * 0.72 + 0.002);
  g.add(badge);
  return g;
}

/** One of the MIC_STYLES as a model (grip at y = 0, grille up). */
export function buildMic(style: string) {
  const s = MIC_STYLES[style];
  if (s.head === 'vintage') return buildVintage(s);
  const g = new THREE.Group();
  const body = handleMat(s);
  const handle = new THREE.Mesh(lathe([[0, s.handle[0][1]], ...s.handle, [0, s.handle[s.handle.length - 1][1]]]), body);
  g.add(handle);
  // the dark cap at the bottom where the cable plugs in
  const bottom = s.handle[0];
  g.add(ring(bottom[0] * 0.92, bottom[1] - 0.004, 0.008, mat('mbot', () => new THREE.MeshStandardMaterial({ color: '#0f0f11', roughness: 0.7 }))));
  const top = s.handle[s.handle.length - 1][1];
  let y0 = top;
  if (s.band && s.head !== 'ball') {
    g.add(ring(s.headR * 0.98, top + 0.006, 0.012, s.band === '#d3d7dc' || s.band === '#d5d9de' ? chrome(s.band) : mat(`mband${s.band}`, () => new THREE.MeshStandardMaterial({ color: s.band, roughness: 0.35, metalness: 0.5 }))));
    y0 = top + 0.012;
  }
  if (s.head === 'ball') {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(s.headR, 24, 18), grilleMat(s));
    ball.scale.y = 0.94;
    ball.position.y = y0 + s.headR * 0.78;
    g.add(ball);
    // the seam round the middle of the ball and the collar it screws into
    const seam = new THREE.Mesh(new THREE.TorusGeometry(s.headR * 1.0, 0.0028, 6, 32), chrome(s.band!));
    seam.rotation.x = Math.PI / 2;
    seam.position.y = ball.position.y - s.headR * 0.12;
    g.add(seam);
    g.add(ring(s.headR * 0.62, y0 + 0.004, 0.012, chrome(s.band!)));
    return g;
  }
  if (s.pattern === 'cage') {
    // red mesh inside, silver wire cage just outside it
    g.add(new THREE.Mesh(lathe(headProfile(s, y0, 0.003)), grilleMat(s, 'top')));
    g.add(new THREE.Mesh(lathe(headProfile(s, y0), 24), grilleMat(s, 'side')));
    g.add(ring(s.headR * 1.02, y0 + 0.006, 0.01, chrome(s.grille)));
    return g;
  }
  g.add(new THREE.Mesh(lathe(headProfile(s, y0), 24), grilleMat(s)));
  if (s.head === 'flat') {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(s.headR, 24), s.pattern === 'slots' ? grilleMat({ ...s, pattern: 'mesh', grille: '#55595f' }, 'top') : grilleMat(s, 'top'));
    cap.rotation.x = -Math.PI / 2;
    cap.position.y = y0 + s.headH;
    g.add(cap);
    // a thin rim round the top edge
    const rim = new THREE.Mesh(new THREE.TorusGeometry(s.headR, 0.0022, 6, 28), mat(`mrim${s.grille}`, () => new THREE.MeshStandardMaterial({ color: '#2c2e33', roughness: 0.4, metalness: 0.5 })));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y0 + s.headH;
    g.add(rim);
  }
  return g;
}
