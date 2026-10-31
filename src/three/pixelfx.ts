import * as THREE from 'three';

/**
 * Plays pixel-art skill effects baked from pixelfx (https://github.com/patch-gg/pixelfx, MIT) by
 * tools/bake_fx.mjs: one small sprite sheet per effect in public/fx/, drawn as a camera-facing sprite.
 * Sheets load the first time an effect plays, and every copy of an effect shares one GPU texture.
 */
interface Sheet {
  w: number;
  h: number;
  cols: number;
  n: number;
  fps: number;
  pivot: [number, number];
  add: boolean;
}

/** World units per sheet pixel (the sheets are drawn at different pixel sizes). */
const SCALE: Record<string, number> = {
  note_burst: 0.018,
  heal_ring: 0.024,
  tempo: 0.022,
  control: 0.034,
  solo_star: 0.03,
  shield: 0.032,
  block: 0.022,
  stab_hit: 0.012,
};

let index: Promise<Record<string, Sheet>> | null = null;
const textures = new Map<string, THREE.Texture>();

function sheets() {
  index ??= fetch(`${import.meta.env.BASE_URL}fx/fx.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return index;
}

function texture(name: string) {
  let t = textures.get(name);
  if (!t) {
    t = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}fx/${name}.png`);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    textures.set(name, t);
  }
  return t;
}

/** Start loading the sheets a class uses, so the first cast doesn't pop in late. */
export function preloadFx(names: string[]) {
  void sheets().then((idx) => names.forEach((n) => idx[n] && texture(n)));
}

export interface FxOptions {
  /** Where the effect's pivot (usually its feet) goes; called every frame so it can follow a character. */
  at: () => THREE.Vector3;
  /** Play this many seconds at most (loops repeat until then). */
  seconds?: number;
  scale?: number;
}

/**
 * Plays effect `name`. Returns a promise of a per-frame updater (dt in seconds -> still alive?) for the
 * world's effect list, or null if the effect doesn't exist.
 */
export async function playFx(scene: THREE.Scene, name: string, o: FxOptions): Promise<((dt: number) => boolean) | null> {
  const s = (await sheets())[name];
  if (!s) return null;
  const tex = texture(name).clone(); // shares the image (one upload), own UV window
  const rows = Math.ceil(s.n / s.cols);
  tex.repeat.set(1 / s.cols, 1 / rows);
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false, depthTest: false,
    blending: s.add ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const sprite = new THREE.Sprite(mat);
  const k = (o.scale ?? 1) * (SCALE[name] ?? 0.02);
  sprite.scale.set(s.w * k, s.h * k, 1);
  sprite.center.set(s.pivot[0] / s.w, 1 - s.pivot[1] / s.h);
  sprite.renderOrder = 20;
  scene.add(sprite);
  const life = o.seconds ?? s.n / s.fps;
  let t = 0;
  const show = () => {
    const f = Math.floor(t * s.fps) % s.n;
    tex.offset.set((f % s.cols) / s.cols, 1 - (Math.floor(f / s.cols) + 1) / rows);
    sprite.position.copy(o.at());
  };
  show();
  return (dt) => {
    t += dt;
    if (t >= life) {
      scene.remove(sprite);
      mat.dispose();
      tex.dispose(); // the clone only; the shared image stays cached
      return false;
    }
    show();
    // fade the last bit of a looped effect that's cut short
    mat.opacity = Math.min(1, (life - t) / 0.25);
    return true;
  };
}
