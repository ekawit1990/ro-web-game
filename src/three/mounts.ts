import * as THREE from 'three';
import { ITEMS } from '../data';
import { loadBlenderModel } from './blenderProps';

/**
 * Mounts (2026-11-18): the scooters from the mount slot, ridden with the ride button.
 * Models: public/models/mounts/<model>.glb.gz from tools/blender/build_mounts.py (Meshy AI, CC BY 4.0):
 * nodes Body / WheelF / WheelR (wheel origin = axle, `radius` in extras) and the rider's anchors
 * Seat / GripL / GripR / Foot. Front = +Z, ground at y = 0, the same frame as a character's root.
 */

/** Where the rider goes, in the vehicle's (= the character root's) frame. */
export interface RideSeat {
  seat: THREE.Vector3;
  gripL: THREE.Vector3;
  gripR: THREE.Vector3;
  foot: THREE.Vector3;
}

export interface MountRig {
  group: THREE.Group;
  model: string;
  wheels: { obj: THREE.Object3D; r: number }[];
  seat?: RideSeat;
}

const SCALE = 1;

/** A mount for this item (an empty group at first; the model drops in once loaded). */
export function buildMount(item: string): MountRig | null {
  const model = ITEMS[item]?.mount?.model;
  if (!model) return null;
  const group = new THREE.Group();
  group.name = 'mount';
  const rig: MountRig = { group, model, wheels: [] };
  void loadBlenderModel(`mounts/${model}`).then((src) => {
    if (!src) return;
    const m = src.clone();
    m.scale.setScalar(SCALE);
    group.add(m);
    m.updateMatrixWorld(true);
    const at = (name: string) => {
      const o = m.getObjectByName(name);
      return o ? o.getWorldPosition(new THREE.Vector3()).applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert()) : undefined;
    };
    // positions relative to the group (group may already sit in the scene: measure in its frame)
    group.updateMatrixWorld(true);
    const seat = at('Seat'), gripL = at('GripL'), gripR = at('GripR'), foot = at('Foot');
    if (seat && gripL && gripR && foot) rig.seat = { seat, gripL, gripR, foot };
    for (const name of ['WheelF', 'WheelR']) {
      const w = m.getObjectByName(name);
      if (w) rig.wheels.push({ obj: w, r: Number(w.userData.radius) || 0.2 });
    }
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      // flat colour lighting like the rest of the toon world: drop the PBR look
      const old = mesh.material as THREE.MeshStandardMaterial;
      const mat = new THREE.MeshToonMaterial({ map: old.map ?? null, color: old.color ?? 0xffffff });
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      mesh.material = mat;
    });
  });
  return rig;
}

/** Turns the wheels for `dist` tiles of travel. */
export function spinMount(rig: MountRig, dist: number) {
  for (const w of rig.wheels) w.obj.rotation.x += dist / (w.r * SCALE);
}

export function disposeMount(rig: MountRig) {
  rig.group.removeFromParent();
  rig.group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
  });
}
