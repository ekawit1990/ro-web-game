import * as THREE from 'three';
import type { HatLook } from './hats';
import { blenderModelNow, loadBlenderModel } from './blenderProps';
import { toon } from './toon';

/**
 * The music hats modelled in Blender (tools/blender/build_hats.py -> public/models/hats/<kind>[_<v>].glb.gz),
 * in the same hat space as hats.ts. Their materials carry no colour, only a name the item's colours fill in:
 * 'c1'..'c3' = hat.c[0..2], 'glow_<slot>' glowing, 'trans_<slot>' see-through, '#rrggbb' fixed.
 * The code-built hat shows until the model has arrived.
 */

const fileOf = (look: HatLook) => `hats/${look.kind}${look.v ? `_${look.v}` : ''}`;

function slot(c: string[], key: string) {
  if (key.startsWith('#')) return key;
  const i = Number(key.slice(1)) - 1;
  return c[i] ?? c[i - 1] ?? c[0] ?? '#cccccc';
}

function paint(model: THREE.Object3D, c: string[]) {
  const out = model.clone();
  out.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const [name, flag] = ((m.material as THREE.Material).name || 'c1').split('|');
    if (flag === 'no') m.userData.noOutline = true;
    if (name.startsWith('glow_')) {
      const col = slot(c, name.slice(5));
      m.material = toon(col, { emissive: new THREE.Color(col).multiplyScalar(0.5).getHex() });
      m.userData.noOutline = true;
    } else if (name.startsWith('trans_')) {
      const col = slot(c, name.slice(6));
      m.material = toon(col, { transparent: true, opacity: 0.6, emissive: new THREE.Color(col).multiplyScalar(0.5).getHex() });
      m.userData.noOutline = true;
    } else m.material = toon(slot(c, name));
    m.castShadow = true;
  });
  return out;
}

/**
 * Puts the Blender hat for `look` into `g` (replacing what is drawn there): straight away when it is
 * loaded, else when it arrives and `still()` says the hat is still worn. `done` re-adds outlines etc.
 */
export function useBlenderHat(g: THREE.Group, look: HatLook, still: () => boolean, done: (g: THREE.Group) => void) {
  const put = (model: THREE.Object3D) => {
    for (const ch of [...g.children]) {
      g.remove(ch);
      ch.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    g.add(paint(model, look.c));
    done(g);
  };
  const now = blenderModelNow(fileOf(look));
  if (now) return put(now);
  void loadBlenderModel(fileOf(look)).then((m) => m && still() && put(m));
}
