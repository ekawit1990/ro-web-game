import * as THREE from 'three';

/** Shared helpers for the cel-shaded (anime) look: toon materials, outlines, canvas textures. */

let gradient: THREE.DataTexture | null = null;

/** Three hard light bands, the classic anime shading. */
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 180, 180, 180, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

export function toon(color: THREE.ColorRepresentation, opts: { map?: THREE.Texture; transparent?: boolean; opacity?: number; emissive?: number } = {}) {
  const key = opts.map || opts.transparent || opts.emissive ? '' : String(new THREE.Color(color).getHex());
  if (key && toonCache.has(key)) return toonCache.get(key)!;
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: gradientMap(), map: opts.map ?? null, transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
  });
  if (opts.emissive) m.emissive = new THREE.Color(opts.emissive);
  if (key) toonCache.set(key, m);
  return m;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: 0x2a1f1a, side: THREE.BackSide });

/** Inverted-hull outline: a slightly bigger black copy drawn from the inside. */
export function outline(group: THREE.Object3D, thickness = 0.018) {
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.noOutline && !o.userData.isOutline) meshes.push(o as THREE.Mesh);
  });
  for (const m of meshes) {
    const g = m.geometry;
    g.computeBoundingSphere();
    const r = g.boundingSphere?.radius || 1;
    const o = new THREE.Mesh(g, outlineMat);
    o.userData.isOutline = true;
    o.scale.setScalar(1 + thickness / Math.max(0.02, r));
    o.castShadow = false;
    m.add(o);
  }
}

export function shadows(group: THREE.Object3D, cast = true, receive = false) {
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
}

export function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, v + amt));
  return `#${((c(n >> 16) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0')}`;
}

/** A glyph or emoji as a sprite texture (projectiles, effects). */
const glyphCache = new Map<string, THREE.Texture>();
export function glyphTexture(text: string, color: string) {
  const key = text + color;
  if (glyphCache.has(key)) return glyphCache.get(key)!;
  const t = canvasTexture(64, 64, (c) => {
    c.font = 'bold 48px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.strokeText(text, 32, 34);
    c.fillStyle = color;
    c.fillText(text, 32, 34);
  });
  glyphCache.set(key, t);
  return t;
}

let sparkTex: THREE.Texture | null = null;
export function sparkTexture() {
  if (sparkTex) return sparkTex;
  sparkTex = canvasTexture(64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 1, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
  return sparkTex;
}
