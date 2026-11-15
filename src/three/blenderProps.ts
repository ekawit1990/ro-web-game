import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Props modelled in Blender (tools/blender/build_*.py -> public/models/weapons/<name>.glb.gz).
 * Each one is made in the same frame and size as the code-built prop it replaces, so the code
 * version is drawn first and its meshes are swapped once the file has arrived. Anchors (hand
 * targets, strap pins: plain Object3Ds) and meshes tagged `userData.keep` stay as they are.
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/weapons/`;
const loading = new Map<string, Promise<THREE.Object3D | null>>();
const ready = new Map<string, THREE.Object3D>();

function load(name: string) {
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
    const m = c as THREE.Mesh;
    if (!m.isMesh || m.userData.keep) continue;
    g.remove(m);
    m.geometry.dispose(); // materials are shared caches in the builders: leave them
  }
  g.add(model.clone());
}

/** Swaps `g`'s code-built meshes for the Blender model `name`: now if it's loaded, else when it arrives. */
export function useBlenderModel(g: THREE.Object3D, name: string) {
  const model = ready.get(name);
  if (model) swap(g, model);
  else void load(name).then((m) => m && swap(g, m));
  return g;
}
