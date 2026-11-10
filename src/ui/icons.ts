import { ITEMS } from '../data';
import * as THREE from 'three';
import { buildCharacter, setEar, type CharRig, type Look } from '../three/models';
import { buildHat } from '../three/hats';
import { outline } from '../three/toon';
import { animateRig, buildVrmCharacter, releaseVrm } from '../three/vrm';
import { BASS_SHAPES, GUITAR_SHAPES } from '../three/guitarShapes';
import { STICK_STYLES } from '../three/sticks';
import { KEYBOARD_STYLES } from '../three/keyboard';

const cache = new Map<string, string>();

const EMOJI: Record<string, string> = {
  dagger: '🗡️', steel_dagger: '🗡️', basic_mic: '🎤', golden_mic: '🎤', acoustic_guitar: '🎸', electric_guitar: '🎸', wood_sticks: '🥢', steel_sticks: '🥢',
  basic_bass: '🎸', five_string_bass: '🎸', mini_keyboard: '🎹', synth: '🎹', band_tshirt: '👕', leather_jacket: '🧥',
  note_ribbon: '🎀', headphones: '🎧', earbuds: '🎧', in_ear_monitor: '🎧', gaming_headset: '🎧', dj_headphones: '🎧', cat_headphones: '🎧', rock_cap: '🧢', pick_necklace: '📿', metronome_charm: '⏱️', banana: '🍌', carrot: '🥕',
  note_shard: '🎵', silent_spore: '🍄', buzz_stinger: '📌', rock_chip: '🪨', golden_clef: '🗝️', drop_crystal: '💎',
  chick_feather: '🪶', sneakers: '👟', stage_boots: '🥾', dance_shoes: '👠', rock_boots: '🥾',
  tuning_ore: '💠', velvet_patch: '🧶', pure_tuning_ore: '🔷', gold_velvet: '🟨',
  crystal_dagger: '🗡️', banshee_mic: '🎤', inferno_guitar: '🎸', thunder_sticks: '🥢', kraken_bass: '🎸', cathedral_organ: '🎹', magma_plate: '🦺',
  crab_shell: '🦀', synth_gel: '🫧', conch_shell: '🐚', gull_feather: '🪶', reggae_skin: '🐸', dj_ink: '🖋️', coral_piece: '🪸', kraken_tentacle: '🐙',
  crystal_wing: '🦇', echo_gel: '🫧', amethyst: '💜', miner_lamp: '🏮', glow_spore: '🍄', shadow_shuriken: '✴️', echo_crown: '👑',
  lost_note: '🎶', bone_mic: '🦴', rotten_root: '🪵', zombie_fur: '🧶', funeral_score: '📜', death_bone: '🦴', banshee_veil: '🕸️',
  opera_mask: '🎭', rusty_crest: '🛡️', bell_clapper: '🔔', march_drum: '🥁', dark_hymnal: '📕', angel_bell: '🛎️', phantom_crown: '👑',
  lava_carapace: '🦀', boiling_gel: '🫧', hellfire_fang: '🦷', demon_pick: '🔻', obsidian_core: '⚫', lava_scale: '🐉', volcano_heart: '❤️‍🔥',
  note_stud: '🎵', pick_earring: '🔸', star_earring: '⭐', crystal_earring: '💎', rabbit_ear: '🐰', frog_skin: '🐸', bat_wing: '🦇', gear_spring: '⚙️',
};

/** A 32x32 icon for an item, as a data URL (drawn once, then cached). */
export function itemIcon(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const item = ITEMS[id];
  if (item?.hat) {
    const url = hatIcon(id);
    if (url) {
      cache.set(id, url);
      return url;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = 32;
  cv.height = 32;
  const c = cv.getContext('2d')!;
  if (item?.type === 'card') {
    // a little card: the monster's colour on top, a parchment frame, a gold corner
    c.fillStyle = '#5b4a2e';
    c.fillRect(6, 2, 20, 28);
    c.fillStyle = '#f3e6c4';
    c.fillRect(7, 3, 18, 26);
    c.fillStyle = item.color;
    c.fillRect(9, 5, 14, 13);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.arc(16, 11.5, 4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#8d6e63';
    for (let y = 21; y <= 26; y += 2.5) c.fillRect(9, y, 14, 1);
    c.fillStyle = '#e0b21f';
    c.fillRect(21, 3, 4, 4);
  } else if (item?.shape && (GUITAR_SHAPES[item.shape] || BASS_SHAPES[item.shape])) {
    guitarIcon(c, item.shape, item.color);
  } else if (item?.shape && STICK_STYLES[item.shape]) {
    mvpGlow(c);
    for (const [x, a] of [[12, -0.35], [20, 0.35]] as const) {
      c.save();
      c.translate(x, 17);
      c.rotate(a);
      c.fillStyle = STICK_STYLES[item.shape].color;
      c.fillRect(-1.6, -9, 3.2, 22);
      c.fillStyle = '#e3c18f';
      c.beginPath();
      c.moveTo(-1.6, -9);
      c.lineTo(-0.7, -14);
      c.lineTo(0.7, -14);
      c.lineTo(1.6, -9);
      c.fill();
      c.beginPath();
      c.arc(0, -14.5, 1.3, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
  } else if (item?.shape && KEYBOARD_STYLES[item.shape]) {
    mvpGlow(c);
    const k = KEYBOARD_STYLES[item.shape];
    c.fillStyle = '#' + k.body.toString(16).padStart(6, '0');
    c.fillRect(2, 10, 28, 13);
    c.strokeStyle = '#555';
    c.lineWidth = 0.6;
    c.strokeRect(2, 10, 28, 13);
    c.fillStyle = '#fafafa';
    c.fillRect(5, 15, 22, 7);
    c.fillStyle = '#111';
    for (let i = 0; i < 10; i++) if (i % 7 !== 2 && i % 7 !== 6) c.fillRect(6.6 + i * 2.2, 15, 1.2, 4);
    c.strokeStyle = '#bbb';
    for (let i = 0; i <= 10; i++) {
      c.beginPath();
      c.moveTo(5 + i * 2.2, 15);
      c.lineTo(5 + i * 2.2, 22);
      c.stroke();
    }
  } else if (item?.type === 'consumable' && !EMOJI[id]) {
    // potion bottle in the item's colour
    c.fillStyle = '#d9d9d9';
    c.fillRect(13, 4, 6, 6);
    c.fillStyle = '#8d6e63';
    c.fillRect(12, 2, 8, 4);
    c.beginPath();
    c.moveTo(12, 10);
    c.lineTo(20, 10);
    c.quadraticCurveTo(28, 16, 26, 24);
    c.quadraticCurveTo(24, 30, 16, 30);
    c.quadraticCurveTo(8, 30, 6, 24);
    c.quadraticCurveTo(4, 16, 12, 10);
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fill();
    c.strokeStyle = '#555';
    c.stroke();
    c.beginPath();
    c.moveTo(7, 19);
    c.quadraticCurveTo(16, 16, 25, 19);
    c.quadraticCurveTo(25, 29, 16, 29);
    c.quadraticCurveTo(7, 29, 7, 19);
    c.fillStyle = item.color;
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillRect(10, 14, 2, 6);
  } else {
    c.font = '22px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (item?.vrm) {
      // outfits: a round swatch in the outfit's main colour behind the garment
      c.fillStyle = item.color;
      c.beginPath();
      c.arc(16, 16, 14, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#e0b21f';
      c.lineWidth = 2;
      c.stroke();
    }
    c.fillText(EMOJI[id] ?? (item?.vrm ? (item.type === 'head' ? (item.part?.includes('Glasses') ? '👓' : '🎩') : item.gender === 'f' ? '👗' : '🥼') : '❔'), 16, 18);
    if (item && !item.shape && (id.includes('bass') || id === 'golden_mic' || id === 'steel_dagger' || id === 'electric_guitar' || id === 'steel_sticks' || id === 'synth' || (item.type === 'weapon' && item.element))) {
      // tint upgraded variants so they read differently
      c.globalCompositeOperation = 'source-atop';
      c.fillStyle = item.color + '66';
      c.fillRect(0, 0, 32, 32);
    }
  }
  const url = cv.toDataURL();
  cache.set(id, url);
  return url;
}

let hatCam: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;

/** Music hats: the 3D hat itself, drawn once at 64x64 (shared little renderer) with an MVP glow for boss hats. */
function hatIcon(id: string): string | null {
  try {
    if (!hatCam) {
      const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      r.setSize(64, 64, false);
      r.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(1, 2, 2);
      scene.add(sun);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
      hatCam = { r, scene, cam };
    }
    const { r, scene, cam } = hatCam;
    const g = new THREE.Group();
    if (!buildHat(g, ITEMS[id].hat)) return null;
    outline(g, 0.012);
    g.rotation.y = -0.5;
    scene.add(g);
    // frame the hat: fit its bounding sphere
    const box = new THREE.Box3().setFromObject(g);
    const sph = box.getBoundingSphere(new THREE.Sphere());
    const dist = sph.radius / Math.sin((cam.fov * Math.PI) / 360) * 0.82;
    cam.position.set(sph.center.x, sph.center.y + dist * 0.35, sph.center.z + dist * 0.94);
    cam.lookAt(sph.center);
    r.setClearColor(0x000000, 0);
    r.render(scene, cam);
    scene.remove(g);
    g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d')!;
    if (ITEMS[id].mvp) {
      c.scale(2, 2);
      mvpGlow(c);
      c.setTransform(1, 0, 0, 1, 0, 0);
    }
    c.drawImage(r.domElement, 0, 0, 64, 64);
    return cv.toDataURL();
  } catch {
    return null;
  }
}

let preview: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera } | null = null;

/** Renders a 3D character (with optional hat) onto a 2D canvas: creator preview, character slots, equipment window.
 *  Draws the built-in character at once, then the VRoid model on top when one is configured.
 *  `free`: drop the model from memory once drawn (only where no game world is running, e.g. the creator). */
export function drawLook(cv: HTMLCanvasElement, look: Look, dir: 'f' | 'b' | number = 'f', hat?: string, vrm = true, armed = true, ear = '', free = false) {
  const token = String(Math.random());
  cv.dataset.look = token;
  render(cv, buildCharacter(look, hat), dir, armed, ear);
  if (vrm) buildVrmCharacter(look, hat).then((rig) => {
    if (rig && cv.dataset.look === token) render(cv, rig, dir, armed, ear);
    if (rig && free) releaseVrm(rig);
  });
}

function render(cv: HTMLCanvasElement, rig: CharRig, dir: 'f' | 'b' | number, armed = true, ear = '') {
  setEar(rig, ear);
  if (!preview) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(2, 3, 4);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
    preview = { r, scene, cam };
  }
  const { r, scene, cam } = preview;
  rig.root.rotation.y = typeof dir === 'number' ? dir : dir === 'b' ? Math.PI : -0.35;
  animateRig(rig, 0, { moving: false, sitting: false, dead: false, attack: 0, armed });
  scene.add(rig.root);
  r.setPixelRatio(1);
  r.setSize(cv.width, cv.height, false);
  cam.aspect = cv.width / cv.height;
  cam.position.set(0, 1.0, 4.4);
  cam.lookAt(0, 0.82, 0);
  cam.updateProjectionMatrix();
  r.render(scene, cam);
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, cv.width, cv.height);
  c.drawImage(r.domElement, 0, 0, cv.width, cv.height);
  scene.remove(rig.root);
}

/** MVP guitars: the body outline of that guitar, neck up to the top-right, with a gold MVP glow. */
function mvpGlow(c: CanvasRenderingContext2D) {
  const glow = c.createRadialGradient(16, 16, 2, 16, 16, 16);
  glow.addColorStop(0, 'rgba(255,215,80,0.55)');
  glow.addColorStop(1, 'rgba(255,215,80,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, 32, 32);
}

function guitarIcon(c: CanvasRenderingContext2D, shape: string, color: string) {
  const bass = !GUITAR_SHAPES[shape];
  const sh = GUITAR_SHAPES[shape] ?? BASS_SHAPES[shape];
  c.save();
  mvpGlow(c);
  // guitar frame -> icon: neck along +X, rotated so the headstock points to the top-right
  c.translate(bass ? 12 : 13, bass ? 20 : 19);
  c.rotate(-Math.PI / 4);
  const k = bass ? 25 : 30;
  const neck = bass ? 0.75 : 0.62;
  c.fillStyle = '#8a5a2a';
  c.fillRect(0, -1.3, neck * k, 2.6);
  c.fillStyle = '#222';
  c.fillRect(neck * k, -1.8, 0.1 * k, 3.6);
  c.beginPath();
  sh.outline.forEach(([x, y], i) => (i ? c.lineTo(x * k, -y * k) : c.moveTo(x * k, -y * k)));
  c.closePath();
  const fin = sh.finish;
  c.fillStyle = fin.kind === 'solid' || fin.kind === 'metal' || fin.kind === 'wood' || fin.kind === 'flame' ? fin.color : fin.kind === 'burst' ? fin.stops[1] : fin.kind === 'zebra' ? fin.a : fin.color;
  if (fin.kind === 'solid') c.fillStyle = color;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = fin.kind === 'band' ? '#f2f2f2' : '#1a1a1a';
  c.stroke();
  if (fin.kind === 'zebra') {
    c.clip();
    c.strokeStyle = fin.b;
    c.lineWidth = 1.4;
    for (let x = -16; x < 4; x += 3) {
      c.beginPath();
      c.moveTo(x, -8);
      c.lineTo(x + 4, 0);
      c.lineTo(x, 8);
      c.stroke();
    }
  }
  c.restore();
}
