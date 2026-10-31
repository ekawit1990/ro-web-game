import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Obj } from '../game/maps';
import { toon } from './toon';
import { buildGoods } from './townprops';
import { track } from '../ui/loadProgress';

/**
 * Low-poly medieval buildings and props by Quaternius (Medieval Village Pack, CC0),
 * converted to gzipped GLB in public/models/village/. They replace the code-drawn
 * town once loaded; the footprints (and so the server's collision) stay the same.
 * Every model's door faces +Z.
 */

const BASE = `${import.meta.env.BASE_URL ?? '/'}models/village/`;
const loader = new GLTFLoader();
const cache = new Map<string, Promise<THREE.Object3D | null>>();

async function gunzip(buf: ArrayBuffer) {
  const b = new Uint8Array(buf);
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf; // a host may have unpacked it already
  const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
  return ds.arrayBuffer();
}

function load(name: string) {
  if (!cache.has(name)) {
    cache.set(name, track((async () => {
      try {
        const res = await fetch(`${BASE}${name}.glb.gz`);
        if (!res.ok) return null;
        const gltf = await loader.parseAsync(await gunzip(await res.arrayBuffer()), BASE);
        gltf.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh) return;
          // the world is cel-shaded: same colours, toon bands
          m.material = toon((m.material as THREE.MeshStandardMaterial).color.clone().multiplyScalar(1.12));
          m.castShadow = true;
          m.receiveShadow = true;
        });
        return gltf.scene;
      } catch (e) {
        console.warn('village model failed', name, e);
        return null;
      }
    })()));
  }
  return cache.get(name)!;
}

/** Which model stands on each building footprint: small lots get houses, big ones the trades. */
const HOUSES = ['House_1', 'House_2', 'House_3'];
const BIG = ['Inn', 'Blacksmith', 'Stable', 'Mill', 'Sawmill', 'Inn', 'Bell_Tower'];
const STALLS = ['MarketStand_1', 'MarketStand_2'];
const CRATES = ['Crate', 'Barrel', 'Bags', 'Package_1', 'Barrel', 'Crate'];

interface Place {
  model: string;
  x: number; // centre, world units
  z: number;
  fw: number; // footprint along X / Z (tiles)
  fh: number;
  face: number; // door direction: 0 = +Z (south), 1 = +X, 2 = -Z, 3 = -X
  maxScale: number;
  fill: number;
}

function plan(objects: Obj[], cx: number, cy: number): Place[] {
  const out: Place[] = [];
  let b = 0, st = 0, cr = 0;
  for (const o of objects) {
    if (o.kind === 'building') {
      const x = o.x + o.w / 2, z = o.y + o.h / 2;
      const dx = cx - x, dz = cy - z;
      // door towards the street the map put it on, else towards the plaza
      const face = o.face ?? (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : dz > 0 ? 0 : 2);
      const big = o.w * o.h >= 30;
      const list = big ? BIG : HOUSES;
      out.push({ model: list[(b++ * 7 + o.x + o.y) % list.length], x, z, fw: o.w, fh: o.h, face, maxScale: 2.1, fill: 0.96 });
    } else if (o.kind === 'stall') {
      const x = o.x + 1, z = o.y + 1;
      out.push({ model: STALLS[st++ % 2], x, z, fw: 2, fh: 2, face: Math.abs(cx - x) > Math.abs(cy - z) ? (cx > x ? 1 : 3) : cy > z ? 0 : 2, maxScale: 1.9, fill: 0.95 });
    } else if (o.kind === 'crate') {
      out.push({ model: CRATES[cr++ % CRATES.length], x: o.x + 0.5, z: o.y + 0.5, fw: 1, fh: 1, face: cr % 4, maxScale: 4, fill: 0.7 });
    } else if (o.kind === 'bench') {
      out.push({ model: 'Bench_1', x: o.x + 0.5, z: o.y + 0.5, fw: 1, fh: 1, face: 0, maxScale: 1.8, fill: 1.1 });
    }
  }
  return out;
}

function fit(src: THREE.Object3D, p: Place) {
  const obj = src.clone();
  const turned = new THREE.Group();
  turned.add(obj);
  turned.rotation.y = (p.face * Math.PI) / 2;
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  // footprint seen in the model's own axes
  const [w, h] = p.face % 2 ? [p.fh, p.fw] : [p.fw, p.fh];
  const s = Math.min(p.maxScale, (w * p.fill) / size.x, (h * p.fill) / size.z);
  obj.scale.setScalar(s);
  const c = box.getCenter(new THREE.Vector3());
  obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
  turned.position.set(p.x, 0, p.z);
  return turned;
}

/**
 * Swaps the code-drawn buildings, stalls, crates and benches of `props` for the village models
 * as they arrive. Objects built by props.ts carry `userData.obj` (their map object).
 */
export async function upgradeVillage(props: THREE.Group, objects: Obj[], center: { x: number; y: number }, alive: () => boolean) {
  const places = plan(objects, center.x, center.y);
  const old = new Map<string, THREE.Object3D>();
  for (const c of props.children) {
    const o = c.userData.obj as Obj | undefined;
    if (o && 'x' in o) old.set(`${o.kind}:${o.x}:${o.y}`, c);
  }
  const keyOf = (o: Obj) => `${o.kind}:${o.x}:${o.y}`;
  const targets = objects.filter((o) => o.kind === 'building' || o.kind === 'stall' || o.kind === 'crate' || o.kind === 'bench');
  await Promise.all(places.map(async (p, i) => {
    const src = await load(p.model);
    if (!src || !alive()) return;
    const was = old.get(keyOf(targets[i]));
    const placed = fit(src, p);
    if (targets[i].kind === 'stall') {
      // stock laid out in front of the counter, inside the stall's own footprint
      for (const side of [-1, 1]) {
        const g = buildGoods(targets[i].x * 2 + (side > 0 ? 1 : 0), targets[i].y * 2 + 7);
        g.position.set(side * 0.5, 0, 0.72);
        g.scale.setScalar(0.85);
        placed.add(g);
      }
    }
    props.add(placed);
    if (was) props.remove(was);
  }));
}
