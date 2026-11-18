import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Props modelled in Blender (tools/blender/build_*.py -> public/models/weapons/<name>.glb.gz).
 * Each one is made in the same frame and size as the code-built prop it replaces, so the code
 * version is drawn first and its meshes are swapped once the file has arrived. Anchors (hand
 * targets, strap pins: plain Object3Ds) and meshes tagged `userData.keep` stay as they are.
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/`;
const loading = new Map<string, Promise<THREE.Object3D | null>>();
const ready = new Map<string, THREE.Object3D>();

/** Loads models/<name>.glb.gz once (name like 'weapons/guitar'); null if missing or broken. */
export function loadBlenderModel(name: string) {
  return load(name.includes('/') ? name : `weapons/${name}`);
}

function load(name: string) {
  if (name.includes('tiger')) return Promise.resolve(null); // the ราชาเสือโคร่ง set (2026-11-18) is code only: no file to fetch
  if (!loading.has(name)) {
    loading.set(name, (async () => {
      try {
        const res = await fetch(`${BASE}${name}.glb.gz`);
        if (!res.ok) return null;
        let buf = await res.arrayBuffer();
        const b = new Uint8Array(buf);
        // a host (or vite dev) may already have unpacked it
        if (b[0] === 0x1f && b[1] === 0x8b) buf = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buf, BASE);
        gltf.scene.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        ready.set(name, gltf.scene);
        return gltf.scene;
      } catch (e) {
        console.warn('blender prop failed', name, e);
        return null;
      }
    })());
  }
  return loading.get(name)!;
}

function swap(g: THREE.Object3D, model: THREE.Object3D) {
  for (const c of [...g.children]) {
    // anchors (plain Object3Ds: hand targets, strap pins) and `keep` meshes stay; meshes and groups of them go
    if (c.userData.keep || !((c as THREE.Mesh).isMesh || (c as THREE.Group).isGroup)) continue;
    g.remove(c);
    c.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); // materials are shared caches in the builders: leave them
  }
  g.add(model.clone());
}

/** Swaps `g`'s code-built meshes for the Blender model `name`: now if it's loaded, else when it arrives. */
export function useBlenderModel(g: THREE.Object3D, name: string) {
  const key = name.includes('/') ? name : `weapons/${name}`;
  const model = ready.get(key);
  if (model) swap(g, model);
  else void load(key).then((m) => m && swap(g, m));
  return g;
}

/** The loaded model if it is already here (no fetch). */
export function blenderModelNow(name: string) {
  return ready.get(name.includes('/') ? name : `weapons/${name}`);
}
