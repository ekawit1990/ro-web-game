import * as THREE from 'three';
import type { Theme } from '../game/maps';

/**
 * Per-map lighting mood: a lower, coloured sun gives long shadows and warm light, and a cooler sky light fills the
 * shadow side, so characters stand out from the ground. Costs nothing extra on the GPU (same lights, same shadow map).
 */
export interface Mood {
  sun: number; // sun colour
  sunI: number; // sun intensity
  elev: number; // sun height above the horizon, degrees (lower = longer shadows)
  az: number; // sun direction around the player, degrees
  sky: number; // hemisphere sky colour (shadow-side fill)
  ground: number; // hemisphere ground bounce colour
  skyI: number;
  exposure: number;
  rim: [number, number, number]; // character edge light colour
}

const base: Mood = { sun: 0xfff1d6, sunI: 2.6, elev: 40, az: -55, sky: 0xcfe3ff, ground: 0x7a7a52, skyI: 1.25, exposure: 1.12, rim: [0.32, 0.3, 0.26] };

export const MOODS: Record<Theme, Mood> = {
  town: { ...base },
  meadow: { ...base, sun: 0xffefcc, elev: 38 },
  forest: { ...base, sun: 0xfff0c8, sunI: 2.4, sky: 0xbfe0d4, ground: 0x4f6a3a, rim: [0.26, 0.32, 0.24] },
  marsh: { ...base, sun: 0xf6efd2, sunI: 2.2, elev: 34, sky: 0xc4d2c0, ground: 0x5a6440, exposure: 1.08, rim: [0.26, 0.3, 0.26] },
  canyon: { ...base, sun: 0xffcf95, sunI: 3.0, elev: 30, sky: 0xb8c8ff, ground: 0xa06a40, skyI: 1.1, rim: [0.4, 0.3, 0.22] },
  snow: { ...base, sun: 0xfff6ec, sunI: 2.2, elev: 32, sky: 0xc8dcff, ground: 0x9aa8c0, skyI: 1.2, exposure: 1.0, rim: [0.28, 0.32, 0.4] },
  volcano: { ...base, sun: 0xff9a5a, sunI: 2.6, elev: 34, sky: 0x9a7aa0, ground: 0x7a3020, skyI: 1.2, exposure: 1.15, rim: [0.5, 0.25, 0.15] },
  desert: { ...base, sun: 0xffd8a0, sunI: 3.0, elev: 32, sky: 0xa8bcff, ground: 0xc89050, skyI: 1.05, exposure: 1.15, rim: [0.42, 0.32, 0.24] },
  inferno: { ...base, sun: 0xff7a3a, sunI: 2.3, elev: 30, sky: 0x8a5a7a, ground: 0x8a2a10, skyI: 1.15, exposure: 1.18, rim: [0.6, 0.24, 0.1] },
  beach: { ...base, sun: 0xfff2d8, sunI: 2.8, elev: 44, sky: 0xbfe4ff, ground: 0xd8c08a, skyI: 1.25, exposure: 1.12, rim: [0.3, 0.32, 0.34] },
  cave: { ...base, sun: 0xa8b8ff, sunI: 1.5, elev: 55, sky: 0x8a7ad0, ground: 0x2a6a7a, skyI: 1.35, exposure: 1.2, rim: [0.3, 0.45, 0.6] },
  deadwood: { ...base, sun: 0xd8c8e8, sunI: 1.9, elev: 28, sky: 0xa898b8, ground: 0x4a4436, skyI: 1.2, exposure: 1.1, rim: [0.36, 0.3, 0.42] },
  ruins: { ...base, sun: 0xffd2b0, sunI: 2.1, elev: 22, sky: 0xa8a8c8, ground: 0x5a5648, skyI: 1.2, exposure: 1.12, rim: [0.42, 0.34, 0.4] },
};

/** Unit vector from the player towards the sun for this mood. */
export function sunDir(m: Mood) {
  const e = THREE.MathUtils.degToRad(m.elev);
  const a = THREE.MathUtils.degToRad(m.az);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e));
}

let currentRim: [number, number, number] = base.rim;
/** The world sets the rim colour for its map; characters loaded afterwards pick it up. */
export const rimNow = () => currentRim;
export function useRim(r: [number, number, number]) {
  currentRim = r;
}

/** MToon edge light on a VRM character, so it reads against bright ground (anime "rim light"). */
export function setRim(root: THREE.Object3D, rim: [number, number, number]) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const mat of ([] as THREE.Material[]).concat(mesh.material)) {
      const mt = mat as THREE.Material & { isMToonMaterial?: boolean; parametricRimColorFactor?: THREE.Color; parametricRimFresnelPowerFactor?: number; parametricRimLiftFactor?: number };
      if (!mt.isMToonMaterial || !mt.parametricRimColorFactor) continue;
      mt.parametricRimColorFactor.setRGB(...rim);
      mt.parametricRimFresnelPowerFactor = 4;
      mt.parametricRimLiftFactor = 0.04;
    }
  });
}
