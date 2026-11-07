import * as THREE from 'three';
import { MONSTERS } from '../data';
import { buildMonster } from './models';
import { upgradeMonster } from './monsters';

/**
 * Card art: a picture of a monster rendered from its own in-game model (not drawn art), used in the
 * item window of monster cards. One small offscreen renderer is made on demand and dropped after a
 * few seconds idle, so phones don't keep a second WebGL context around. Pictures are cached as data URLs.
 */

const W = 240;
const H = 300;
const cache = new Map<string, Promise<string>>();
let renderer: THREE.WebGLRenderer | null = null;
let idle = 0;

function getRenderer() {
  clearTimeout(idle);
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  idle = window.setTimeout(() => {
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer = null;
  }, 8000);
  return renderer;
}

async function render(key: string): Promise<string> {
  const rig = buildMonster(key);
  const anim = await upgradeMonster(rig, key, () => true).catch(() => null);
  if (anim) anim.update(0.35, false); // a moment into the idle pose, not the bind pose
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7f99, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 5);
  scene.add(sun);
  const back = new THREE.DirectionalLight(0xbfd8ff, 1.2);
  back.position.set(-3, 2, -4);
  scene.add(back);
  // turn three-quarters towards the viewer, like a card portrait
  rig.root.rotation.y = -0.5;
  scene.add(rig.root);
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 100);
  const fit = Math.max(size.y, (size.x * H) / W, 0.3);
  const dist = (fit * 0.62) / Math.tan(THREE.MathUtils.degToRad(15));
  cam.position.set(center.x, center.y + size.y * 0.12, center.z + dist);
  cam.lookAt(center);
  const r = getRenderer();
  r.setClearColor(0x000000, 0);
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  scene.clear();
  return url;
}

/** A data URL picture of the monster (cached). Resolves to '' if it can't be drawn. */
export function monsterPortrait(key: string): Promise<string> {
  if (!MONSTERS[key]) return Promise.resolve('');
  if (!cache.has(key)) cache.set(key, render(key).catch((e) => {
    console.warn('portrait failed', key, e);
    cache.delete(key);
    return '';
  }));
  return cache.get(key)!;
}
