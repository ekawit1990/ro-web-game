import * as THREE from 'three';

/**
 * The 6 MVP drumstick pairs (item `shape` of drummer weapons): a painted shaft, natural-wood taper and bead tip.
 * Same frame and size as the plain stick: 0.4 long along Y, tip at +Y.
 */
export const STICK_STYLES: Record<string, { color: string; glitter?: boolean }> = {
  stick_black: { color: '#1c1c22', glitter: true },
  stick_red: { color: '#e8361f' },
  stick_blue: { color: '#56c2ee' },
  stick_green: { color: '#8fdc6a' },
  stick_pink: { color: '#f27aa6' },
  stick_purple: { color: '#c7a2ec' },
};

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  if (!mats.has(key)) mats.set(key, make());
  return mats.get(key)!;
}

function paint(style: { color: string; glitter?: boolean }) {
  return mat(`stick${style.color}`, () => {
    if (!style.glitter) return new THREE.MeshPhysicalMaterial({ color: style.color, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.1 });
    // black glitter: tiny silver flecks over a dark base
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const g = c.getContext('2d')!;
    g.fillStyle = style.color;
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 900; i++) {
      const v = 120 + Math.floor(Math.random() * 135);
      g.fillStyle = `rgb(${v},${v},${v + 10})`;
      g.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random(), 1 + Math.random());
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshPhysicalMaterial({ map: t, metalness: 0.55, roughness: 0.35, clearcoat: 1 });
  });
}
const wood = () => mat('stickWood', () => new THREE.MeshStandardMaterial({ color: 0xe3c18f, roughness: 0.55 }));

function lathe(pts: [number, number][], m: THREE.Material) {
  return new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 14), m);
}

export function buildStick(id: string): THREE.Object3D {
  const style = STICK_STYLES[id] ?? { color: '#e3c18f' };
  const g = new THREE.Group();
  // painted shaft from the butt to where the taper starts
  g.add(lathe([[0, -0.2], [0.017, -0.199], [0.019, -0.195], [0.019, 0.07], [0.0185, 0.1]], paint(style)));
  // bare-wood taper, neck and bead tip
  g.add(lathe([[0.0185, 0.1], [0.016, 0.13], [0.011, 0.16], [0.0075, 0.178], [0.0105, 0.186], [0.0115, 0.192], [0.009, 0.198], [0, 0.2]], wood()));
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return g;
}
