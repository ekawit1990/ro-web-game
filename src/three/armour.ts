import * as THREE from 'three';
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { ARMOUR, tabardTexture } from './models';
import { mesh, outline, toon } from './toon';

/**
 * Dresses any VRoid model in the one outfit every player wears (quilted leather, bronze pauldrons,
 * steel breastplate, bracers and greaves, a chevron tabard):
 *  1. the model's own clothes are recoloured to leather tones, keeping their folds and shading;
 *  2. armour plates are fitted to the body by measuring the skinned vertices of each limb,
 *     then hung on the skeleton so they follow the animation.
 * Call it on a freshly loaded model in its rest (T) pose.
 */
export function dressArmour(vrm: VRM, root: THREE.Object3D) {
  recolourClothes(vrm.scene);
  root.updateMatrixWorld(true);
  const parts = measure(vrm);
  const raw = (n: VRMHumanBoneName) => vrm.humanoid.getRawBoneNode(n);
  const pos = (n: VRMHumanBoneName) => raw(n)?.getWorldPosition(new THREE.Vector3());
  const steel = toon(ARMOUR.steel);
  const bronze = toon(ARMOUR.bronze);
  const leather = toon('#5c4128');
  const trim = toon(ARMOUR.trim);
  // world-space distances are in model metres times the game scale
  const unit = parts.height / 1.6;
  const hang = (bone: VRMHumanBoneName, o: THREE.Object3D) => {
    const b = raw(bone);
    if (!b) return;
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
      }
    });
    outline(o, 0.006 * unit);
    root.add(o);
    o.updateMatrixWorld(true);
    b.attach(o);
  };

  // ---- breastplate: an elliptical shell round the chest, fitted to its widest slice
  const torso = parts.get('torso');
  const hipsY = pos('hips')?.y;
  if (torso && hipsY !== undefined) {
    const top = torso.yHi - 0.02 * unit;
    const bottom = THREE.MathUtils.lerp(hipsY, top, 0.38);
    const fit = ellipseFit(torso.pts.filter((p) => p.y > bottom && p.y < top), torso.cx, torso.cz);
    if (fit) {
      const h = top - bottom;
      // a band of a squashed sphere: widest across the chest, curving in at the waist and the collar
      const t0 = 0.3 * Math.PI;
      const t1 = 0.78 * Math.PI;
      const span = Math.cos(t0) - Math.cos(t1);
      const plate = mesh(new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, t0, t1 - t0), doubleSided(steel));
      plate.scale.set(fit.rx * 1.06 + 0.006 * unit, h / span, fit.rz * 1.08 + 0.008 * unit);
      plate.position.set(torso.cx, top - Math.cos(t0) * plate.scale.y, fit.cz);
      // a raised centre ridge down the front, like the reference's breastplate
      const ridge = mesh(new THREE.CapsuleGeometry(0.006 * unit, h * 0.55, 3, 6), steel, torso.cx, bottom + h * 0.48, fit.cz + plate.scale.z * 0.97);
      const g = new THREE.Group();
      g.add(plate, ridge);
      hang('upperChest', g);

      // belt with a gold triangle buckle where the plate ends
      const belt = new THREE.Group();
      const ring = mesh(new THREE.CylinderGeometry(1, 1, 0.045 * unit, 28, 1, true), doubleSided(leather), torso.cx, bottom - 0.035 * unit, fit.cz);
      ring.scale.set(plate.scale.x * Math.sin(t1) + 0.006 * unit, 1, plate.scale.z * Math.sin(t1) + 0.006 * unit);
      belt.add(ring);
      const buckle = mesh(new THREE.ConeGeometry(0.03 * unit, 0.04 * unit, 3), trim, torso.cx, bottom - 0.035 * unit, fit.cz + ring.scale.z + 0.004 * unit);
      buckle.rotation.set(Math.PI / 2, 0, Math.PI);
      buckle.scale.z = 0.3;
      belt.add(buckle);

      // chevron tabard flaps, front and back, hanging from the belt
      const tabMat = toon('#ffffff', { map: tabardTexture() });
      tabMat.side = THREE.DoubleSide;
      const w = plate.scale.x * 0.85;
      const len = (bottom - hipsY) * 0.55 + 0.3 * unit;
      const yTop = bottom - 0.05 * unit;
      const yBot = yTop - len;
      const hipPts = parts.get('hips')?.pts ?? [];
      // how far the hips/skirt reach out front (side 1) or back (-1) around a height, near the middle
      const reach = (y: number, side: number) => {
        const zs = hipPts.filter((p) => Math.abs(p.y - y) < 0.04 * unit && Math.abs(p.x - torso.cx) < w / 2).map((p) => side * (p.z - fit.cz)).sort((a, b) => a - b);
        return zs.length ? q(zs, 0.97) : 0;
      };
      for (const side of [1, -1]) {
        const zTop = Math.max(ring.scale.z, reach(yTop, side)) + 0.012 * unit;
        const zBot = Math.max(zTop, reach(yBot, side) + 0.012 * unit, reach((yTop + yBot) / 2, side) + 0.012 * unit);
        const tab = new THREE.Mesh(new THREE.PlaneGeometry(w, len), tabMat);
        tab.userData.noOutline = true;
        tab.position.set(torso.cx, (yTop + yBot) / 2, fit.cz + side * (zTop + zBot) / 2);
        tab.rotation.x = side * Math.atan2(zBot - zTop, len);
        if (side < 0) tab.rotation.y = Math.PI;
        belt.add(tab);
      }
      hang('hips', belt);
    }
  }

  // ---- bronze pauldrons (two overlapping lames) and steel bracers
  for (const side of ['left', 'right'] as const) {
    const up = parts.get(`${side}UpperArm`);
    const sh = pos(`${side}UpperArm`);
    const el = pos(`${side}LowerArm`);
    if (up && sh && el) {
      const along = el.clone().sub(sh).normalize();
      const r = up.radius;
      const g = new THREE.Group();
      for (const [k, at, scale] of [[0, 0.1, 1.0], [1, 0.75, 0.88]] as const) {
        const cap = mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), doubleSided(bronze));
        cap.scale.set(r * 1.9 * scale, r * 1.3 * scale, r * 1.85 * scale);
        cap.position.copy(sh).addScaledVector(along, r * at).add(new THREE.Vector3(0, r * (0.25 - k * 0.25), 0));
        // tilt the cap down the arm
        cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0).addScaledVector(along, 0.35 + k * 0.25).normalize());
        g.add(cap);
      }
      hang(`${side}UpperArm`, g);
    }
    const lo = parts.get(`${side}LowerArm`);
    const hand = pos(`${side}Hand`);
    if (lo && el && hand) {
      const len = el.distanceTo(hand);
      const bracer = new THREE.Group();
      const tube = mesh(new THREE.CylinderGeometry(lo.radius * 1.35, lo.radius * 1.2, len * 0.55, 16, 1, true), doubleSided(steel));
      const rim = mesh(new THREE.TorusGeometry(lo.radius * 1.35, 0.005 * unit, 6, 18), trim);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = len * 0.275;
      tube.add(rim);
      bracer.add(tube);
      bracer.position.copy(el).lerp(hand, 0.6);
      bracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), el.clone().sub(hand).normalize());
      hang(`${side}LowerArm`, bracer);
    }

    // ---- greaves over the shins with a knee cop
    const shin = parts.get(`${side}LowerLeg`);
    const knee = pos(`${side}LowerLeg`);
    const foot = pos(`${side}Foot`);
    if (shin && knee && foot) {
      const len = knee.distanceTo(foot);
      const greave = new THREE.Group();
      const tube = mesh(new THREE.CylinderGeometry(shin.radius * 1.35, shin.radius * 1.2, len * 0.55, 16, 1, true), doubleSided(steel));
      greave.add(tube);
      // knee cop: a small bronze dome on the front of the knee
      const cop = mesh(new THREE.SphereGeometry(shin.radius * 0.9, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), doubleSided(bronze), 0, len * 0.33, shin.radius * 0.7);
      cop.rotation.x = Math.PI / 2;
      cop.scale.set(1, 0.55, 1);
      greave.add(cop);
      greave.position.copy(knee).lerp(foot, 0.45);
      greave.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), knee.clone().sub(foot).normalize());
      hang(`${side}LowerLeg`, greave);
    }
  }
}

function doubleSided(m: THREE.Material) {
  if (m.side === THREE.DoubleSide) return m;
  const c = m.clone();
  c.side = THREE.DoubleSide;
  return c;
}

// ---------------------------------------------------------------- measuring the body

interface Part {
  pts: THREE.Vector3[];
  /** Typical distance of the part's vertices from its bone axis. */
  radius: number;
  cx: number;
  cz: number;
  yHi: number;
}

const TORSO: VRMHumanBoneName[] = ['spine', 'chest', 'upperChest'];
const LIMBS: VRMHumanBoneName[] = ['leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftLowerLeg', 'rightLowerLeg'];
const CHILD: Partial<Record<VRMHumanBoneName, VRMHumanBoneName>> = {
  leftUpperArm: 'leftLowerArm', rightUpperArm: 'rightLowerArm', leftLowerArm: 'leftHand', rightLowerArm: 'rightHand',
  leftLowerLeg: 'leftFoot', rightLowerLeg: 'rightFoot',
};

/** Groups the body's skinned vertices (world space, rest pose) by the bone that moves them most. */
function measure(vrm: VRM) {
  const byNode = new Map<THREE.Object3D, VRMHumanBoneName>();
  for (const [name, b] of Object.entries(vrm.humanoid.humanBones)) if (b?.node) byNode.set(b.node, name as VRMHumanBoneName);
  // skirt, coat-tail and hair bones aren't humanoid bones: count them with the humanoid bone they hang from
  const humanOf = (b: THREE.Object3D | null): VRMHumanBoneName | undefined => {
    for (let o = b; o; o = o.parent) {
      const n = byNode.get(o);
      if (n) return n;
    }
  };
  const groups = new Map<string, THREE.Vector3[]>();
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const v = new THREE.Vector3();
  vrm.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || /face|hair/i.test(m.name)) return;
    const geo = m.geometry;
    const idx = geo.getAttribute('skinIndex');
    const wt = geo.getAttribute('skinWeight');
    const n = geo.getAttribute('position').count;
    // every 2nd vertex is plenty for fitting
    for (let i = 0; i < n; i += 2) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (wt.getComponent(i, k) > wt.getComponent(i, best)) best = k;
      let name = humanOf(m.skeleton.bones[idx.getComponent(i, best)]);
      if (!name) continue;
      if (TORSO.includes(name)) name = 'upperChest';
      m.getVertexPosition(i, v);
      m.applyBoneTransform(i, v);
      const w = m.localToWorld(v.clone());
      const key = name === 'upperChest' ? 'torso' : name;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(w);
    }
  });

  const parts = new Map<string, Part>();
  const torso = groups.get('torso');
  if (torso?.length) {
    const xs = torso.map((p) => p.x).sort((a, b) => a - b);
    const zs = torso.map((p) => p.z).sort((a, b) => a - b);
    const ys = torso.map((p) => p.y).sort((a, b) => a - b);
    parts.set('torso', { pts: torso, radius: 0, cx: (q(xs, 0.03) + q(xs, 0.97)) / 2, cz: (q(zs, 0.03) + q(zs, 0.97)) / 2, yHi: q(ys, 0.97) });
  }
  const hips = [...(groups.get('hips') ?? []), ...(groups.get('leftUpperLeg') ?? []), ...(groups.get('rightUpperLeg') ?? [])];
  if (hips.length) parts.set('hips', { pts: hips, radius: 0, cx: 0, cz: 0, yHi: 0 });
  for (const name of LIMBS) {
    const pts = groups.get(name);
    const a = vrm.humanoid.getRawBoneNode(name)?.getWorldPosition(new THREE.Vector3());
    const b = vrm.humanoid.getRawBoneNode(CHILD[name]!)?.getWorldPosition(new THREE.Vector3());
    if (!pts?.length || !a || !b) continue;
    const axis = b.clone().sub(a);
    const len2 = axis.lengthSq();
    const d = pts
      .map((p) => {
        const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(axis) / len2, 0, 1);
        return p.distanceTo(a.clone().addScaledVector(axis, t));
      })
      .sort((x, y) => x - y);
    parts.set(name, { pts, radius: q(d, 0.6), cx: 0, cz: 0, yHi: 0 });
  }
  return Object.assign(parts, { height: box.max.y - box.min.y });
}

const q = (sorted: number[], f: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * f))];

/** Smallest ellipse (centred on cx, with the slice's own front/back centre) that holds ~97% of the points. */
function ellipseFit(pts: THREE.Vector3[], cx: number, cz0: number) {
  if (pts.length < 20) return null;
  const xs = pts.map((p) => Math.abs(p.x - cx)).sort((a, b) => a - b);
  const zsAll = pts.map((p) => p.z).sort((a, b) => a - b);
  const cz = (q(zsAll, 0.02) + q(zsAll, 0.98)) / 2 || cz0;
  const zs = pts.map((p) => Math.abs(p.z - cz)).sort((a, b) => a - b);
  const ax = Math.max(1e-3, q(xs, 0.9));
  const az = Math.max(1e-3, q(zs, 0.9));
  // grow both radii together until the points fit
  const s = pts.map((p) => Math.hypot((p.x - cx) / ax, (p.z - cz) / az)).sort((a, b) => a - b);
  const k = q(s, 0.92);
  return { rx: ax * k, rz: az * k, cz };
}

// ---------------------------------------------------------------- recolouring the model's clothes

const tinted = new WeakMap<object, THREE.Texture>();

/** Recolours the model's clothes to the armour palette by luminance, so folds and seams survive. */
function recolourClothes(scene: THREE.Object3D) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = ([] as THREE.Material[]).concat(m.material);
    for (const mat of mats) {
      const name = mat.name;
      if (!/CLOTH/i.test(name)) continue;
      const tone = /shoes/i.test(name) ? ARMOUR.boot : /bottoms/i.test(name) ? ARMOUR.trousers : /tops|onepiece/i.test(name) ? ARMOUR.quilt : ARMOUR.leather;
      const mm = mat as THREE.Material & {
        map?: THREE.Texture | null; color?: THREE.Color; shadeColorFactor?: THREE.Color;
        shadeMultiplyTexture?: THREE.Texture | null; matcapTexture?: THREE.Texture | null; matcapFactor?: THREE.Color;
      };
      const quilted = /tops|onepiece/i.test(name);
      if (mm.map?.image) mm.map = recolour(mm.map, tone, quilted);
      mm.color?.set('#ffffff');
      if (mm.shadeColorFactor) mm.shadeColorFactor.set(tone).multiplyScalar(0.55);
      if ('shadeMultiplyTexture' in mm) mm.shadeMultiplyTexture = null;
      if (mm.matcapFactor) mm.matcapFactor.set('#000000');
      mat.needsUpdate = true;
    }
  });
}

function recolour(tex: THREE.Texture, tone: string, quilted: boolean): THREE.Texture {
  const done = tinted.get(tex.image);
  if (done) return done;
  const img = tex.image as CanvasImageSource & { width: number; height: number };
  const w = img.width;
  const h = img.height;
  if (!w || !h) return tex;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.drawImage(img, 0, 0);
  const data = c.getImageData(0, 0, w, h);
  const px = data.data;
  // spread the luminance into a narrow bright band so a black skirt and a white shirt end up the same leather
  let lo = 1, hi = 0;
  for (let i = 0; i < px.length; i += 16) {
    if (px[i + 3] < 8) continue;
    const l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  }
  const span = Math.max(0.05, hi - lo);
  const hex = new THREE.Color(tone).getHex(); // sRGB bytes, like the canvas
  const col = { r: (hex >> 16) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
  for (let i = 0; i < px.length; i += 4) {
    const l = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
    let k = 0.62 + 0.45 * ((l - lo) / span);
    if (quilted) {
      // diamond stitching
      const x = (i / 4) % w;
      const y = Math.floor(i / 4 / w);
      const a = (x + y) % 22;
      const b = (x - y + 4096) % 22;
      if (a < 2 || b < 2) k *= 0.72;
    }
    px[i] = Math.min(255, col.r * 255 * k);
    px[i + 1] = Math.min(255, col.g * 255 * k);
    px[i + 2] = Math.min(255, col.b * 255 * k);
  }
  c.putImageData(data, 0, 0);
  const out = new THREE.CanvasTexture(cv);
  out.colorSpace = tex.colorSpace;
  out.flipY = tex.flipY;
  out.wrapS = tex.wrapS;
  out.wrapT = tex.wrapT;
  out.channel = tex.channel;
  tinted.set(tex.image, out);
  return out;
}
