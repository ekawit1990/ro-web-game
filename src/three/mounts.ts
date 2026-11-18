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
  const skin = ITEMS[item]?.mount?.skin;
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
      if (skin === 'tiger') tigerSkin(mat, model);
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

/**
 * The tiger-striped scooters (ราชาเสือโคร่ง drops, 2026-11-18) are the same 3 models with their paint turned into
 * tiger fur in the shader: texels that are body paint (saturated colour; on the silver one, light grey) become
 * orange with black stripes laid out in the model's own space, so they run across the body seamlessly whatever the
 * baked texture's layout. Tyres, seat, chrome and lights keep their colours.
 */
function tigerSkin(mat: THREE.MeshToonMaterial, model: string) {
  const mask = model === 'scooter_silver'
    ? 'smoothstep(0.42, 0.58, lum) * (1.0 - smoothstep(0.18, 0.32, sat))'
    : 'smoothstep(0.28, 0.45, sat) * smoothstep(0.1, 0.22, mx)';
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTigerPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTigerPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTigerPos;')
      .replace('#include <map_fragment>', `#include <map_fragment>
      {
        vec3 c = diffuseColor.rgb;
        float mx = max(c.r, max(c.g, c.b));
        float mn = min(c.r, min(c.g, c.b));
        float sat = (mx - mn) / max(mx, 1e-3);
        float lum = dot(c, vec3(0.3, 0.59, 0.11));
        float paint = ${mask};
        vec3 fur = mix(vec3(0.62, 0.16, 0.01), vec3(1.0, 0.5, 0.08), smoothstep(0.05, 0.5, lum));
        vec3 p = vTigerPos;
        float s = sin(p.z * 20.0 + sin(p.y * 7.0) * 1.6 + sin(p.x * 9.0) * 1.1) + 0.35 * sin(p.y * 29.0 + p.z * 5.0);
        float stripe = smoothstep(0.6, 0.72, s);
        diffuseColor.rgb = mix(c, mix(fur, vec3(0.015, 0.01, 0.008), stripe), paint);
      }`);
  };
  mat.customProgramCacheKey = () => `tiger_${model}`;
}
