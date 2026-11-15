import * as THREE from 'three';
import type { Obj } from '../game/maps';
import { loadBlenderModel } from './blenderProps';
import { Pile, rngFor } from './ruins';

/**
 * The houses of เมืองคีย์มนตรา modelled in Blender (tools/blender/build_magic_houses.py): one model per
 * footprint (door side x depth x floors) plus a corner turret. Every material is a colour slot, painted here
 * with the house's own wall / roof colours, and all the houses are merged into two meshes (stone and
 * glowing glass) so the whole town draws in two calls. Footprints are the map's, so collisions don't change.
 */

type House = Extract<Obj, { kind: 'building' }>;

export function houseColours(wall: string, roof: string, trim: string): Record<string, THREE.ColorRepresentation> {
  return {
    wall, roof, trim,
    glass: '#9cc4ff', door: '#3a2a4a', stone: '#8f879c',
    dark: new THREE.Color(roof).multiplyScalar(0.55),
  };
}

const clamp = (n: number) => Math.max(2, Math.min(5, Math.round(n)));

/** Which model a house uses and how it is turned (face: 0 = +y/+Z, 1 = +x, 2 = -y, 3 = -x). */
function modelOf(o: House) {
  const face = o.face ?? 0;
  const [L, D] = face % 2 ? [o.h, o.w] : [o.w, o.h];
  return { name: `town/magic_${clamp(L)}x${clamp(D)}x${o.floors > 1 ? 2 : 1}`, rot: [0, Math.PI / 2, Math.PI, -Math.PI / 2][face] };
}

/** True if this house gets a turret (the same draw as magic.ts makes). */
export const hasTurret = (o: House) => rngFor(Math.floor(o.x) * 7919 + Math.floor(o.y) * 104729 + 29)() < 0.35;

/**
 * Builds the Blender houses for `houses` and calls `done` with a group of two merged meshes, or null if
 * any model failed to load (the code-built houses then stay).
 */
export async function buildBlenderHouses(houses: House[], colours: (o: House) => Record<string, THREE.ColorRepresentation>) {
  const names = new Set<string>(['town/magic_turret_1', 'town/magic_turret_2']);
  for (const o of houses) names.add(modelOf(o).name);
  const models = new Map<string, THREE.Object3D>();
  for (const [n, m] of await Promise.all([...names].map(async (n) => [n, await loadBlenderModel(n)] as const))) {
    if (!m) return null;
    models.set(n, m);
  }
  const stone = new Pile(), glass = new Pile();
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  const place = (model: THREE.Object3D, at: THREE.Matrix4, cols: Record<string, THREE.ColorRepresentation>) => {
    model.updateMatrixWorld(true);
    model.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const slot = (m.material as THREE.Material).name.split('.')[0];
      const world = new THREE.Matrix4().multiplyMatrices(at, m.matrixWorld);
      (slot === 'glass' ? glass : stone).add(m.geometry, cols[slot] ?? '#ff00ff', world);
    });
  };
  for (const o of houses) {
    const { name, rot } = modelOf(o);
    const cols = colours(o);
    mtx.compose(new THREE.Vector3(o.x + o.w / 2, 0, o.y + o.h / 2), q.setFromAxisAngle(up, rot), one);
    place(models.get(name)!, mtx, cols);
    if (hasTurret(o)) place(models.get(`town/magic_turret_${o.floors > 1 ? 2 : 1}`)!, mtx.clone().makeTranslation(o.x + 0.35, 0, o.y + 0.35), cols);
  }
  const g = new THREE.Group();
  g.name = 'blenderHouses';
  const a = stone.mesh(new THREE.MeshToonMaterial({ vertexColors: true }));
  const b = glass.mesh(new THREE.MeshToonMaterial({ vertexColors: true, emissive: '#2a3c6a' }));
  if (a) g.add(a);
  if (b) {
    b.castShadow = false;
    g.add(b);
  }
  return g;
}

const LANDMARK: Record<string, THREE.ColorRepresentation> = {
  wall: '#ece6f2', stone: '#a49cb2', roof: '#5b45a0', trim: '#fbf8ff', glass: '#9cc4ff', door: '#3a2a4a', dark: '#16121e', gold: '#e0b84a',
};

/**
 * A landmark (the conservatory, the gazebo): a plain code stand-in at once, swapped for the Blender model
 * (town/<name>) painted in toon colours by slot when it has loaded. Origin at the footprint centre.
 */
export function landmark(name: string, w: number, d: number, h: number) {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.8, h, d * 0.8), new THREE.MeshToonMaterial({ color: LANDMARK.wall }));
  stand.position.y = h / 2;
  stand.castShadow = stand.receiveShadow = true;
  g.add(stand);
  void loadBlenderModel(`town/${name}`).then((src) => {
    if (!src) return;
    const m = src.clone();
    const mats = new Map<string, THREE.Material>();
    m.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      const slot = (mesh.material as THREE.Material).name.split('.')[0];
      if (!mats.has(slot)) {
        mats.set(slot, new THREE.MeshToonMaterial({
          color: LANDMARK[slot] ?? '#ff00ff',
          emissive: slot === 'glass' ? '#2a3c6a' : slot === 'gold' ? '#3a2a00' : '#000000',
        }));
      }
      mesh.material = mats.get(slot)!;
      mesh.castShadow = mesh.receiveShadow = true;
    });
    g.add(m);
    g.remove(stand);
    stand.geometry.dispose();
  });
  return g;
}
