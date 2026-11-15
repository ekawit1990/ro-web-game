import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Obj } from '../game/maps';
import { loadBlenderModel } from './blenderProps';
import { boxUV, DARK, DOME, gradient, plaster, PLASTER, WOOD } from './desert';

/**
 * The desert town's adobe houses modelled in Blender (tools/blender/build_desert_houses.py): one model per
 * footprint, plus a small dome and a roof-top room set on some roofs, as the code houses had. Materials are
 * colour slots painted here; every house is merged into one mesh on the shared plaster texture.
 */

type House = Extract<Obj, { kind: 'building' }>;
const CLOTH = ['#c0392b', '#2e86c1', '#d4ac0d', '#7d3c98', '#1e8449', '#e67e22'];
const clamp = (n: number) => Math.max(2, Math.min(5, Math.round(n)));
const hash = (o: House, k: number) => Math.abs((o.x * 73856093) ^ (o.y * 19349663) ^ (k * 83492791)) % 9973;

function colours(o: House): Record<string, THREE.ColorRepresentation> {
  const wall = PLASTER[o.wall % PLASTER.length];
  return {
    wall, base: new THREE.Color(wall).multiplyScalar(0.82), trim: '#c9a774', dark: DARK, wood: WOOD,
    cloth: CLOTH[hash(o, 1) % CLOTH.length], clay: '#b5653a',
  };
}

export async function buildBlenderDesert(houses: House[]) {
  const names = new Set<string>(['town/desert_dome', 'town/desert_room']);
  const plan = houses.map((o) => {
    const face = o.face ?? 0;
    const [L, D] = face % 2 ? [o.h, o.w] : [o.w, o.h];
    const name = `town/desert_${clamp(L)}x${clamp(D)}x${o.floors > 1 ? 2 : 1}`;
    names.add(name);
    return { o, name, rot: [0, Math.PI / 2, Math.PI, -Math.PI / 2][face] };
  });
  const models = new Map<string, THREE.Object3D>();
  for (const [n, m] of await Promise.all([...names].map(async (n) => [n, await loadBlenderModel(n)] as const))) {
    if (!m) return null;
    m.updateMatrixWorld(true);
    models.set(n, m);
  }
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  const add = (model: THREE.Object3D, at: THREE.Matrix4, cols: Record<string, THREE.ColorRepresentation>) => {
    model.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.geometry;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', src.attributes.position);
      g.setAttribute('normal', src.attributes.normal);
      g.setIndex(src.index);
      const geo = g.toNonIndexed().applyMatrix4(new THREE.Matrix4().multiplyMatrices(at, m.matrixWorld));
      col.set(cols[(m.material as THREE.Material).name.split('.')[0]] ?? '#ff00ff');
      const n = geo.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set([col.r, col.g, col.b], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
      parts.push(boxUV(geo));
    });
  };
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (const { o, name, rot } of plan) {
    const cols = colours(o);
    const cx = o.x + o.w / 2, cz = o.y + o.h / 2;
    add(models.get(name)!, mtx.compose(new THREE.Vector3(cx, 0, cz), q.setFromAxisAngle(up, rot), new THREE.Vector3(1, 1, 1)), cols);
    // roof extras, as desert.ts draws them: a little dome, or a room on a one-storey roof
    const w = o.w - 0.12, d = o.h - 0.12, H = 1.25 + o.floors * 0.85;
    const kind = o.roof % 3;
    if (kind === 1 && Math.min(w, d) >= 2) {
      const rad = Math.min(w, d) * 0.28;
      add(models.get('town/desert_dome')!, new THREE.Matrix4().compose(new THREE.Vector3(cx, H, cz), new THREE.Quaternion(), new THREE.Vector3(rad, rad, rad)),
        { ...cols, cloth: DOME[hash(o, 2) % DOME.length] });
    } else if (kind === 2 && o.floors === 1 && w >= 2.4 && d >= 2.4) {
      const rw = w * 0.45, rd = d * 0.45;
      const rx = cx + (hash(o, 3) % 2 ? -1 : 1) * (w - rw) * 0.3, rz = cz + (hash(o, 4) % 2 ? -1 : 1) * (d - rd) * 0.3;
      add(models.get('town/desert_room')!, new THREE.Matrix4().compose(new THREE.Vector3(rx, H, rz), q.setFromAxisAngle(up, rot), (o.face ?? 0) % 2 ? new THREE.Vector3(rd, 0.9, rw) : new THREE.Vector3(rw, 0.9, rd)), cols);
    }
  }
  const body = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshToonMaterial({ vertexColors: true, map: plaster(), gradientMap: gradient }));
  body.castShadow = body.receiveShadow = true;
  body.userData.noOutline = true;
  const g = new THREE.Group();
  g.add(body);
  return g;
}
