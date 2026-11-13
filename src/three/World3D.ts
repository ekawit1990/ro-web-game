import { potionPct, spPotionPct, AUTO_POTION_EVERY } from '../game/autoPrefs';
import * as THREE from 'three';
import type { Room } from '@colyseus/sdk';
import { CLASSES, CROWD_MAX, ClassKey, ELEMENTS, ITEMS, monsterElement, MAX_LEVEL, MONSTERS, MONSTER_SKILLS, SKILLS, SPAWNS, canUseSkill, isBuffSkill, skillPower, skillSp, skillsOf, targetsMonster, targetsPlayer, outfitOf, vrmHatOf } from '../data';
import { findPath, GameMap, Npc, THEMES, isLava, walkable } from '../game/maps';
import type { Session } from '../game/session';
import { escapeHtml } from '../ui/screens';
import { MonsterAnim, preloadMonsters, upgradeMonster } from './monsters';
import { animateMonster, buildCharacter, buildMonster, CharRig, Look, MonsterRig, setEar, setHat } from './models';
import { animateMaxAura, buildMaxAura } from './levelAura';
import { animateRig, attackHit, attackMoves, attackTime, buildVrmCharacter } from './vrm';
import { npcLife, tickNpc, type NpcLife } from './townLife';
import { PHONE } from './device';
import { blueCircle, chorusFx, controlFx, keyAura, noteRainCharge, noteRainStrike, restoreFx, reviveFx, soloFx, tempoFx } from './keyfx';
import { sfx, sfxAttack, sfxBoom, sfxFak, sfxFring, sfxFwing, sfxHammer, sfxBend, sfxPalmMute, sfxPak, sfxSlide, sfxVibrato, sfxSkill, sfxSlash, sfxWhirl, sfxKeySpell, sfxNoteCharge, sfxNoteFall, sfxBassDrop, sfxBassBuff, sfxWheet, sfxMonster, sfxDiva, sfxMicBoom, sfxReaper, sfxMvp } from '../audio/sound';
import { hellfire, judgement, scytheSweep, soulChain, telegraph } from './reaperfx';
import { dynamicsHit, earTrainingBlast, highVoiceBeam, singerBuff, singerCharge, SG } from './singerfx';
import { buildGround, buildPortal, buildProps } from './props';
import { upgradeNature } from './nature';
import { upgradeVillage } from './village';
import { glyphTexture, sparkTexture } from './toon';
import { MOODS, sunDir, useRim } from './look';
import { FxOptions, playFx, preloadFx } from './pixelfx';
import { bassAura, bassBuffCast, rootNoteChop, straightBeatQuake } from './bassfx';
import { bendingStorm, hammerOnBlast, palmMuting, slideDash, vibratoAura } from './guitarfx';
import { doubleKickBlast, sendOffDash, snareGhost, snareHit, snareStorm, xSlashWave } from './xslash';

/** Classes with their own attack moves in vrm.ts (the hit lands when the blow does). */
const MOVE_CLASSES = new Set<ClassKey>(['drummer', 'guitarist', 'bassist', 'singer']);
/** Classes whose skills are drawn by jobSkillFx (in their fxColor). */
const JOB_FX = new Set<ClassKey>(['drummer', 'guitarist', 'bassist', 'singer']);

/** The band classes' effect colours read better drawn solid than added onto the bright ground. */
const SOLID_FX = new Set(['drummer', 'guitarist', 'bassist', 'singer'].map((k) => new THREE.Color(CLASSES[k as ClassKey].fxColor!).getHex()));
const blendFor = (color: number) => (SOLID_FX.has(color) ? THREE.NormalBlending : THREE.AdditiveBlending);

const TILE_PX = 32; // derived.moveSpeed is pixels/second at this tile size (same as the server)
const MOVE_SEND_MS = 100;
const COMBAT_TIME = 0.8; // seconds the instrument stays in hand (and the fighting pose stays) after an attack or skill: stand again within a second
const READY_TIME = 3; // seconds after an attack or skill the character stays ready for the next monster (rocking on its feet)

export interface WorldHooks {
  system(text: string): void;
  toast(text: string, kind?: 'good' | 'bad'): void;
  talk(npc: Npc): void;
  playerMenu(sessionId: string, name: string, x: number, y: number): void;
  /** เปิดแผงขายของ: look into another player's shop / set up (or look after) my own */
  viewShop(sessionId: string): void;
  openVend(): void;
  death(dead: boolean): void;
  targeting(skillName: string | null): void;
  /** /auto switched on or off (by the player, a manual move, death). */
  autoChanged(on: boolean): void;
}

/** The class whose look a skill's effects use (a skill every class has counts as the Teen's). */
const clsOf = (s: { cls: ClassKey | 'all' }): ClassKey => (s.cls === 'all' ? 'teen' : s.cls);

/** Touch screens have no hover: show name + Lv of monsters this close (tiles) all the time. */
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const TOUCH_NAME_RANGE = 9;
/** พุ่งแทง slide time (ms). */
const DASH_MS = 160;

/** /auto: how far (tiles) the character looks for the next monster, and when it drinks a potion / heals. */
const AUTO_RANGE = 12;
/** /auto drinks a potion when HP is under this % (the player picks it on the AUTO bar; 0 = never). */
const AUTO_HEAL_HP = 0.6;

interface RemotePlayer {
  name: string; cls: string; level: number; gender: string; hair: number; hairColor: number; face: number; head: string; weapon: string; ear: string; body?: string;
  x: number; y: number; hp: number; maxHp: number; sp: number; maxSp: number; dead: boolean; sitting: boolean; hidden?: boolean;
  /** guild name ('' = none) */
  guild?: string;
  /** player shop title ('' = none) */
  shop?: string;
}
interface RemoteMonster { key: string; x: number; y: number; hp: number; maxHp: number; dead: boolean }
interface RemoteState {
  players: { forEach(fn: (p: RemotePlayer, id: string) => void): void; get(id: string): RemotePlayer | undefined };
  monsters: { forEach(fn: (m: RemoteMonster, id: string) => void): void; get(id: string): RemoteMonster | undefined };
}

interface Label { el: HTMLElement; bar?: HTMLElement; fill?: HTMLElement; sp?: HTMLElement }

interface PlayerActor {
  id: string;
  name: string;
  rig: CharRig;
  x: number;
  y: number;
  tx: number;
  ty: number;
  look: string;
  cls: ClassKey;
  moving: number;
  attack: number;
  /** Seconds left with the instrument in hand after the last attack; then it goes back over the shoulder. */
  combat: number;
  /** Seconds left in the ready stance after the last attack or skill (weapon in hand, rocking on its feet). */
  ready?: number;
  /** Teen dagger combo: which move the last attack was, and when it was swung (ms). */
  combo?: number;
  lastSwing?: number;
  /** Has a weapon equipped (from the server). */
  armed?: boolean;
  /** พุ่งแทง: dashing from here (ms start) — drawn as a quick slide to the landing spot. */
  dash?: { x: number; y: number; t: number };
  /** หมุนตัวแทง: seconds left spinning. */
  spin?: number;
  /** Playing / singing for a buff skill or a cast until this time (ms, performance.now()). */
  performUntil?: number;
  perform?: number;
  /** หนีไปกลับ PR */
  hidden?: boolean;
  /** casting เสียงสูง: the bar over the head */
  cast?: { start: number; ms: number; bar: HTMLElement; fill: HTMLElement };
  dead: boolean;
  sitting: boolean;
  hp: number;
  maxHp: number;
  label: Label;
  hit: THREE.Mesh;
  bubble?: { el: HTMLElement; until: number };
  /** Base Lv 99: the golden aura at the feet. */
  maxAura?: THREE.Group;
  /** the guild name shown under the name */
  guild?: string;
  guildEl?: HTMLElement;
  /** เปิดแผงขายของ: the shop title, and its sign over the head */
  shop?: string;
  shopEl?: HTMLElement;
}

interface MonsterActor {
  id: string;
  key: string;
  rig: MonsterRig;
  x: number;
  y: number;
  dead: boolean;
  hp: number;
  maxHp: number;
  phase: number;
  moving: boolean;
  anim?: MonsterAnim;
  label: Label;
  hit: THREE.Mesh;
  fade: number;
  /** burst into pieces as it died: the body vanishes at once */
  burst?: boolean;
}

/** 'foe' = another player, in PVP. */
type Target = { kind: 'monster'; id: string } | { kind: 'npc'; npc: Npc } | { kind: 'foe'; id: string };

interface Float { el: HTMLElement; pos: THREE.Vector3; born: number; life: number; dx: number; rise: number }
type Effect = (dt: number) => boolean; // false = finished

// one WebGL renderer for the whole session (map switches only swap the scene)
let renderer: THREE.WebGLRenderer | null = null;

/** Closest camera zoom (the wheel / pinch range is MIN_ZOOM..28). */
const MIN_ZOOM = 3.2;

export class World3D {
  private session: Session;
  private room: Room;
  private map: GameMap;
  private hooks: WorldHooks;
  private partyIds = new Set<string>();
  /** Players can fight each other on this map right now (the server's 'pvp' message). */
  private pvp = false;
  private container: HTMLElement;
  private overlay: HTMLElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private sunOffset = new THREE.Vector3(-8, 14, 6);
  private ray = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private raf = 0;
  private yaw = Math.PI / 4;
  private pitch = 0.9;
  private dist = 17;
  private camTarget = new THREE.Vector3();
  /** Camera shake from your own big hits: seconds left and strength. */
  private shakeT = 0;
  private shakeAmp = 0;

  private me!: PlayerActor;
  private players = new Map<string, PlayerActor>();
  private monsters = new Map<string, MonsterActor>();
  private hits: THREE.Mesh[] = [];
  private npcHits = new Map<THREE.Object3D, Npc>();
  private npcs: NpcLife[] = [];
  private path: { x: number; y: number }[] = [];
  private target: Target | null = null;
  private pendingSkill: { id: string; target?: string } | null = null;
  private targetingSkill: string | null = null;
  private lastAttack = 0;
  /** /auto: fight the nearest monsters with attacks and skills on its own. */
  private auto = false;
  private autoNext = 0;
  private autoPotionAt = 0;
  private autoSpPotionAt = 0;
  /** skill id -> performance.now() when /auto may cast it again */
  private autoReady = new Map<string, number>();
  /** buff skill id -> performance.now() when it wears off */
  private autoBuffs = new Map<string, number>();
  private lastSend = 0;
  private sentX: number;
  private sentY: number;
  private dead = false;
  private warping = false;
  private floats: Float[] = [];
  private effects: Effect[] = [];
  private staticLabels: { el: HTMLElement; pos: THREE.Vector3 }[] = [];
  private marker: THREE.Mesh;
  private animated: THREE.Object3D[] = [];
  private unsubs: (() => void)[] = [];
  private ac = new AbortController();
  private hoverMonster: MonsterActor | null = null;
  private now = 0;

  constructor(container: HTMLElement, data: { session: Session; room: Room; map: GameMap; hooks: WorldHooks; x: number; y: number }) {
    this.container = container;
    this.session = data.session;
    this.room = data.room;
    this.map = data.map;
    this.hooks = data.hooks;
    this.sentX = data.x;
    this.sentY = data.y;
    // phones load skill effect sheets only when one is first seen; desktops warm up their own class's
    if (!PHONE) preloadFx(skillsOf(this.session.char.cls).map(([, s]) => s.fx ?? '').filter(Boolean));

    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: !PHONE });
      renderer.setPixelRatio(Math.min(PHONE ? 1.5 : 2, window.devicePixelRatio));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = PHONE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    container.appendChild(renderer.domElement);
    this.overlay = document.createElement('div');
    this.overlay.className = 'world-overlay';
    container.appendChild(this.overlay);

    this.buildScene();
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.25, 0.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x7ff0e6, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.scene.add(this.marker);

    const c = this.session.char;
    this.me = this.makePlayer(this.room.sessionId, {
      name: c.name, cls: c.cls, level: c.level, gender: c.gender, hair: c.hair, hairColor: c.hair_color, face: c.face,
      head: this.session.equippedOf('head')?.item_id ?? '', weapon: this.session.equippedOf('weapon')?.item_id ?? '', ear: this.session.equippedOf('earring')?.item_id ?? '', body: this.session.equippedOf('armor')?.item_id ?? '', x: data.x, y: data.y, hp: 1, maxHp: 1, sp: 0, maxSp: 0, dead: false, sitting: false,
    });
    this.me.label.el.classList.add('me');
    this.camTarget.set(data.x, 0, data.y);

    this.bindInput();
    this.listen();
    this.resize();
    window.addEventListener('resize', () => this.resize(), { signal: this.ac.signal });
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /**
   * The connection to the game server dropped and we joined the same map again (2026-11-09): carry on in
   * this world with the new room instead of loading the whole map again. The server gave us a new session
   * id and put us where it saved us.
   */
  /** Where our own character stands right now. */
  myPos() {
    return { x: this.me.x, y: this.me.y };
  }

  swapRoom(room: Room, x: number, y: number) {
    const oldId = this.room.sessionId;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.room = room;
    const me = this.me;
    this.players.delete(oldId);
    me.id = room.sessionId;
    me.hit.userData.player = room.sessionId;
    this.players.set(room.sessionId, me);
    me.x = me.tx = this.sentX = x;
    me.y = me.ty = this.sentY = y;
    me.cast?.bar.remove();
    me.cast = undefined;
    this.path = [];
    this.target = null;
    this.pendingSkill = null;
    this.warping = false;
    this.lastAttack = 0;
    this.listen();
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.unsubs.forEach((u) => u());
    this.overlay.remove();
    renderer?.domElement.remove();
    // free the GPU side of everything on this map (cached models re-upload if the next map uses them):
    // phones reload the page once enough old maps pile up in GPU memory
    const mats = new Set<THREE.Material>();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh && !(o as THREE.Points).isPoints && !(o as THREE.Line).isLine) return;
      m.geometry?.dispose();
      for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) mats.add(mat);
    });
    const disposeTex = (t: unknown) => (t as THREE.Texture)?.isTexture && (t as THREE.Texture).dispose();
    for (const mat of mats) {
      const u = (mat as THREE.ShaderMaterial).uniforms;
      if (u) for (const k in u) disposeTex(u[k].value);
      for (const v of Object.values(mat)) disposeTex(v);
      mat.dispose();
    }
    this.sun.dispose(); // its shadow map
    renderer?.renderLists.dispose();
  }

  // ------------------------------------------------------------ scene

  private buildScene() {
    this.scene.background = new THREE.Color(THEMES[this.map.theme].sky);
    // lava maps see further (the big volcano), the cave and the haunted maps less far
    const [near, far] = isLava(this.map.theme) ? [60, 150] : this.map.theme === 'cave' ? [26, 72] : this.map.theme === 'deadwood' || this.map.theme === 'ruins' || this.map.theme === 'abyss' ? [30, 88] : [42, 105];
    this.scene.fog = new THREE.Fog(this.scene.background, near, far);
    const mood = MOODS[this.map.theme];
    renderer!.toneMapping = THREE.NeutralToneMapping;
    renderer!.toneMappingExposure = mood.exposure;
    useRim(mood.rim);
    this.scene.add(new THREE.HemisphereLight(mood.sky, mood.ground, mood.skyI));
    this.sun.color.set(mood.sun);
    this.sun.intensity = mood.sunI;
    this.sunOffset.copy(sunDir(mood)).multiplyScalar(30);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(PHONE ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -18;
    sc.right = sc.top = 18;
    sc.near = 1;
    sc.far = 75;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(buildGround(this.map));
    preloadMonsters(SPAWNS.filter((sp) => sp.map === this.map.id).map((sp) => sp.monster));
    const props = buildProps(this.map);
    this.scene.add(props);
    props.traverse((o) => {
      if (o.name === 'flag' || o.name === 'water' || o.userData.tick) this.animated.push(o);
    });
    const alive = () => !this.ac.signal.aborted;
    const fountain = this.map.objects.find((o) => o.kind === 'fountain');
    const center = fountain ? { x: fountain.x + 2, y: fountain.y + 2 } : { x: this.map.w / 2, y: this.map.h / 2 };
    void upgradeVillage(props, this.map.objects, center, alive);
    void upgradeNature(props, this.map, alive);

    for (const n of this.map.npcs) {
      const rig = buildCharacter({ ...n.look });
      rig.root.position.set(n.x + 0.5, 0, n.y + 0.5);
      this.scene.add(rig.root);
      const hit = this.hitCylinder(0.45, 1.7);
      rig.root.add(hit);
      this.npcHits.set(hit, n);
      this.hits.push(hit);
      const label = new THREE.Vector3(n.x + 0.5, 0, n.y + 0.5);
      const life = npcLife(n, rig, label);
      this.npcs.push(life);
      this.upgradeNpc(life, { ...n.look }, hit);
      this.staticLabel(`<span class="npc">${escapeHtml(n.name)}</span>`, label);
    }
    for (const p of this.map.portals) {
      const g = buildPortal();
      g.position.set(p.x + 0.5, 0, p.y + 0.5);
      this.scene.add(g);
      this.animated.push(g);
      this.staticLabel(`<span class="portal">➜ ${escapeHtml(p.label)}</span>`, new THREE.Vector3(p.x + 0.5, 2.4, p.y + 0.5));
    }
  }

  private hitCylinder(r: number, h: number) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8), new THREE.MeshBasicMaterial({ visible: false }));
    m.position.y = h / 2;
    m.userData.noOutline = true;
    return m;
  }

  private staticLabel(html: string, pos: THREE.Vector3) {
    const el = document.createElement('div');
    el.className = 'wl';
    el.innerHTML = html;
    this.overlay.appendChild(el);
    this.staticLabels.push({ el, pos });
  }

  private makeLabel(html: string, bar: boolean, sp = false): Label {
    const el = document.createElement('div');
    el.className = 'wl';
    el.innerHTML = `<span class="nm">${html}</span>`;
    const l: Label = { el };
    if (bar) {
      l.bar = document.createElement('div');
      l.bar.className = 'wl-bar';
      l.bar.innerHTML = `<i></i>${sp ? '<b></b>' : ''}`;
      l.fill = l.bar.querySelector('i')!;
      l.sp = l.bar.querySelector('b') ?? undefined;
      el.prepend(l.bar);
    }
    this.overlay.appendChild(el);
    return l;
  }

  // ------------------------------------------------------------ actors

  private makePlayer(id: string, rp: RemotePlayer): PlayerActor {
    const look = lookOf(rp);
    const rig = buildCharacter(look, rp.head);
    rig.root.position.set(rp.x, 0, rp.y);
    this.scene.add(rig.root);
    const hit = this.hitCylinder(0.4, 1.6);
    hit.userData.player = id;
    rig.root.add(hit);
    this.hits.push(hit);
    const a: PlayerActor = {
      id, name: rp.name, rig, x: rp.x, y: rp.y, tx: rp.x, ty: rp.y, look: lookKey(rp), cls: rp.cls as ClassKey, moving: 0, attack: 0, combat: 0,
      dead: rp.dead, sitting: rp.sitting, hp: rp.hp, maxHp: rp.maxHp, label: this.makeLabel(escapeHtml(rp.name), true, id === this.room.sessionId), hit,
    };
    this.players.set(id, a);
    a.label.el.classList.toggle('party', this.partyIds.has(id));
    this.upgradePlayer(a, look, rp.head);
    return a;
  }

  /** Swap the built-in character for a VRoid model once it has loaded (if models are configured). */
  private async upgradePlayer(a: PlayerActor, look: Look, head: string) {
    const old = a.rig;
    const v = await buildVrmCharacter(look, head);
    if (!v || this.ac.signal.aborted || a.rig !== old || this.players.get(a.id) !== a) return;
    v.root.position.copy(old.root.position);
    v.root.rotation.y = old.root.rotation.y;
    v.root.add(a.hit);
    this.scene.remove(old.root);
    this.scene.add(v.root);
    setHat(v, old.hat);
    setEar(v, old.ear);
    a.rig = v;
  }

  private async upgradeNpc(life: NpcLife, look: Look, hit: THREE.Mesh) {
    const v = await buildVrmCharacter(look);
    if (!v || this.ac.signal.aborted) return;
    const old = life.rig;
    v.root.position.copy(old.root.position);
    v.root.rotation.copy(old.root.rotation);
    v.root.add(hit);
    this.scene.remove(old.root);
    this.scene.add(v.root);
    life.rig = v;
  }

  /** Party members on this map (session ids): their names are drawn in the party color. */
  setPvp(on: boolean) {
    this.pvp = on;
    if (!on && this.target?.kind === 'foe') this.target = null;
    for (const a of this.players.values()) a.label.el.classList.toggle('foe', on && this.hostile(a.id));
  }

  /** We may hit this player (same rules as the server: PVP on, not in our party or guild). */
  hostile(id: string) {
    if (!this.pvp || id === this.room.sessionId || this.partyIds.has(id)) return false;
    const a = this.players.get(id);
    if (!a || a.dead) return false;
    const mine = this.me?.guild ?? '';
    return !mine || a.guild !== mine;
  }

  setParty(ids: Set<string>) {
    this.partyIds = ids;
    for (const [id, a] of this.players) a.label.el.classList.toggle('party', ids.has(id));
  }

  /** The shop sign over a player's head: a bag icon and the shop's name; click to look inside. */
  private setShopSign(a: PlayerActor, title: string) {
    a.shop = title;
    a.shopEl?.remove();
    a.shopEl = undefined;
    if (!title) return;
    const el = document.createElement('div');
    el.className = `vsign${a === this.me ? ' mine' : ''}`;
    el.innerHTML = `<i class="vbag"></i><span>${escapeHtml(title)}</span>`;
    el.title = `ร้านของ ${a.name}`;
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (a === this.me) this.hooks.openVend();
      else this.hooks.viewShop(a.id);
    });
    this.overlay.appendChild(el);
    a.shopEl = el;
  }

  private destroyPlayer(a: PlayerActor) {
    this.scene.remove(a.rig.root);
    a.label.el.remove();
    a.bubble?.el.remove();
    a.shopEl?.remove();
    this.hits = this.hits.filter((h) => h !== a.hit);
    this.players.delete(a.id);
  }

  private makeMonster(id: string, rm: RemoteMonster): MonsterActor {
    const def = MONSTERS[rm.key];
    const rig = buildMonster(rm.key);
    rig.root.position.set(rm.x, 0, rm.y);
    rig.root.userData.monKey = rm.key;
    this.scene.add(rig.root);
    const hit = this.hitCylinder(Math.max(0.4, def.size * 0.45), rig.height + 0.2);
    hit.userData.monster = id;
    rig.root.add(hit);
    this.hits.push(hit);
    const [mel, melv] = monsterElement(def);
    const label = this.makeLabel(def.structure ? `💎 ${escapeHtml(def.name)}` : `${def.mvp ? '<span class="mvp-tag">MVP</span> ' : def.boss ? '<span class="mini-tag">มินิบอส</span> ' : ''}${escapeHtml(def.name)} <span class="lv">Lv.${def.level}</span> <span class="el" title="${ELEMENTS[mel].name} ${melv}">${ELEMENTS[mel].icon}${melv}</span>`, true);
    label.el.classList.add('mon');
    if (def.boss) label.el.classList.add('boss');
    if (def.mvp) label.el.classList.add('mvp');
    const m: MonsterActor = {
      id, key: rm.key, rig, x: rm.x, y: rm.y, dead: rm.dead, hp: rm.hp, maxHp: rm.maxHp, phase: Math.random() * 6, moving: false, label, hit,
      fade: rm.dead ? 0 : 1,
    };
    rig.root.visible = !rm.dead;
    this.monsters.set(id, m);
    void upgradeMonster(rig, rm.key, () => !this.ac.signal.aborted && this.monsters.get(id) === m).then((anim) => {
      if (!anim) return;
      m.anim = anim;
      if (m.dead) anim.die();
    });
    return m;
  }

  // ------------------------------------------------------------ input

  private bindInput() {
    const cv = renderer!.domElement;
    const sig = { signal: this.ac.signal };
    let drag: { x: number; yaw: number; moved: boolean } | null = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
    // fingers: tap = click, one-finger drag = turn the camera, two fingers = pinch zoom + twist
    const touches = new Map<number, { x: number; y: number }>();
    let tap: { x: number; y: number; yaw: number; moved: boolean } | null = null;
    let pinch: { span: number; angle: number; dist: number; yaw: number } | null = null;
    const two = () => {
      const [a, b] = [...touches.values()];
      return { span: Math.hypot(b.x - a.x, b.y - a.y) || 1, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    const lift = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      if (touches.size < 2) pinch = null;
      if (touches.size === 0) tap = null;
      else if (touches.size === 1) {
        // one finger stays down after a pinch: let it keep turning without jumping
        const [p] = [...touches.values()];
        tap = { x: p.x, y: p.y, yaw: this.yaw, moved: true };
      }
    };
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        cv.setPointerCapture(e.pointerId);
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 1) tap = { x: e.clientX, y: e.clientY, yaw: this.yaw, moved: false };
        else if (touches.size === 2) {
          if (tap) tap.moved = true; // a pinch is never a tap
          pinch = { ...two(), dist: this.dist, yaw: this.yaw };
        }
        return;
      }
      if (e.button === 2) {
        drag = { x: e.clientX, yaw: this.yaw, moved: false };
        cv.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button === 0) this.click(e.clientX, e.clientY);
    }, sig);
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') {
        const p = touches.get(e.pointerId);
        if (!p) return;
        p.x = e.clientX;
        p.y = e.clientY;
        if (pinch && touches.size >= 2) {
          const now = two();
          this.dist = Math.max(MIN_ZOOM, Math.min(28, pinch.dist * (pinch.span / now.span)));
          this.yaw = pinch.yaw - (now.angle - pinch.angle);
        } else if (tap && touches.size === 1) {
          const dx = e.clientX - tap.x;
          if (!tap.moved && Math.hypot(dx, e.clientY - tap.y) > 12) {
            tap.moved = true;
            tap.x = e.clientX; // start turning from here, so the camera doesn't jump by the dead zone
            tap.yaw = this.yaw;
            return;
          }
          if (tap.moved) this.yaw = tap.yaw - dx * 0.01;
        }
        return;
      }
      if (drag) {
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 4) drag.moved = true;
        this.yaw = drag.yaw - dx * 0.008;
        return;
      }
      this.hover(e.clientX, e.clientY);
    }, sig);
    cv.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') {
        const t = tap;
        if (t && !t.moved && touches.size === 1) this.click(e.clientX, e.clientY);
        lift(e);
        return;
      }
      if (e.button === 2 && drag) {
        if (!drag.moved) this.cancelTargeting();
        drag = null;
      }
    }, sig);
    cv.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') lift(e);
      else drag = null;
    }, sig);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = Math.max(MIN_ZOOM, Math.min(28, this.dist + Math.sign(e.deltaY) * 1.2));
    }, { ...sig, passive: false });
  }

  private pick(cx: number, cy: number) {
    const r = renderer!.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    const hit = this.ray.intersectObjects(this.hits, false)[0]?.object;
    const ground = new THREE.Vector3();
    const ok = this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground);
    return { hit, ground: ok ? ground : null };
  }

  private hover(cx: number, cy: number) {
    const { hit } = this.pick(cx, cy);
    const m = hit?.userData.monster ? this.monsters.get(hit.userData.monster) ?? null : null;
    this.hoverMonster = m && !m.dead ? m : null;
    renderer!.domElement.style.cursor = this.targetingSkill ? 'crosshair' : hit ? 'pointer' : 'default';
  }

  private click(cx: number, cy: number) {
    if (this.dead) return;
    const { hit, ground } = this.pick(cx, cy);
    const pid = hit?.userData.player as string | undefined;
    const mid = hit?.userData.monster as string | undefined;
    const npc = hit ? this.npcHits.get(hit) : undefined;
    if (this.targetingSkill) {
      const type = SKILLS[this.targetingSkill].type;
      if (type === 'revive') {
        // ชุบชีวิต: only a player who is down
        if (pid && this.players.get(pid)?.dead) return this.castAt(this.targetingSkill, pid);
        this.hooks.toast('เลือกเพื่อนที่หมดสติ', 'bad');
        return this.cancelTargeting();
      }
      if (targetsPlayer(SKILLS[this.targetingSkill])) return this.castAt(this.targetingSkill, pid ?? this.room.sessionId);
      if (mid && !this.monsters.get(mid)?.dead) return this.castAt(this.targetingSkill, mid);
      if (pid && this.hostile(pid)) return this.castAt(this.targetingSkill, pid);
      return this.cancelTargeting();
    }
    if (mid && !this.monsters.get(mid)?.dead) {
      this.target = { kind: 'monster', id: mid };
      this.path = [];
      return;
    }
    if (pid && this.hostile(pid)) {
      this.target = { kind: 'foe', id: pid };
      this.path = [];
      return;
    }
    if (pid && this.players.get(pid)?.shop) return this.hooks.viewShop(pid);
    if (pid && pid !== this.room.sessionId) {
      const r = renderer!.domElement.getBoundingClientRect();
      return this.hooks.playerMenu(pid, this.players.get(pid)?.name ?? '', cx - r.left, cy - r.top - 20);
    }
    if (npc) {
      this.target = { kind: 'npc', npc };
      this.pendingSkill = null;
      this.walkNear(npc.x + 0.5, npc.y + 0.5, 1.5);
      return;
    }
    if (ground) {
      this.target = null;
      this.pendingSkill = null;
      if (this.auto) this.setAuto(false); // walking somewhere yourself takes back control
      this.walkTo(ground.x, ground.z);
    }
  }

  walkTo(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!walkable(this.map, tx + 0.5, ty + 0.5)) return;
    const p = findPath(this.map, Math.floor(this.me.x), Math.floor(this.me.y), tx, ty);
    if (!p) return;
    if (p.length) p[p.length - 1] = { x, y };
    this.path = p;
    this.marker.position.set(x, 0.03, y);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  /**
   * Walk to a spot picked on the big map: anywhere on this map, however far. A blocked spot (a house,
   * water, a tree) walks to the nearest open tile instead. Returns false when there's no way there.
   */
  walkToMapSpot(x: number, y: number) {
    if (this.dead) return false;
    let tx = Math.floor(x), ty = Math.floor(y);
    if (!walkable(this.map, tx + 0.5, ty + 0.5)) {
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (let dy = -6; dy <= 6; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const d = Math.hypot(dx, dy);
          if (d < bestD && walkable(this.map, tx + dx + 0.5, ty + dy + 0.5)) {
            bestD = d;
            best = { x: tx + dx, y: ty + dy };
          }
        }
      }
      if (!best) return false;
      tx = best.x;
      ty = best.y;
      x = tx + 0.5;
      y = ty + 0.5;
    }
    const p = findPath(this.map, Math.floor(this.me.x), Math.floor(this.me.y), tx, ty, this.map.w * this.map.h + 10);
    if (!p) return false;
    this.cancelTargeting();
    this.target = null;
    this.pendingSkill = null;
    if (this.auto) this.setAuto(false); // walking somewhere yourself takes back control
    if (p.length) p[p.length - 1] = { x, y };
    this.path = p;
    this.marker.position.set(x, 0.03, y);
    (this.marker.material as THREE.MeshBasicMaterial).opacity = 1;
    return true;
  }

  /** Where the character is walking to (the end of its path), for the big map. */
  walkGoal() {
    const last = this.path[this.path.length - 1];
    return last ? { x: last.x, y: last.y } : null;
  }

  walkNear(x: number, y: number, range: number) {
    if (Math.hypot(this.me.x - x, this.me.y - y) <= range) {
      this.path = [];
      return;
    }
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const r = Math.ceil(range);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.floor(x) + dx + 0.5;
        const ny = Math.floor(y) + dy + 0.5;
        if (Math.hypot(nx - x, ny - y) > range || !walkable(this.map, nx, ny)) continue;
        const d = Math.hypot(nx - this.me.x, ny - this.me.y);
        if (d < bestD) {
          bestD = d;
          best = { x: nx, y: ny };
        }
      }
    }
    if (best) {
      const p = findPath(this.map, Math.floor(this.me.x), Math.floor(this.me.y), Math.floor(best.x), Math.floor(best.y));
      if (p) this.path = p;
    }
  }

  /** Called by hotkeys and the skill window. */
  useSkill(id: string) {
    const skill = SKILLS[id];
    const lv = this.session.char.skills?.[id] ?? 0;
    if (!skill || !lv || skill.type === 'passive' || this.dead) return;
    if (skill.type === 'vend') return this.hooks.openVend();
    if (this.session.sp < skillSp(skill, lv)) return this.hooks.toast('SP ไม่พอ', 'bad');
    if (this.me.cast) return this.hooks.toast('กำลังร่ายสกิลอยู่', 'bad');
    if (targetsMonster(skill)) {
      const t = this.target?.kind === 'monster' ? this.monsters.get(this.target.id) : undefined;
      if (t && !t.dead) return this.castAt(id, t.id);
      if (this.target?.kind === 'foe' && this.hostile(this.target.id)) return this.castAt(id, this.target.id);
      this.startTargeting(id);
    } else if (targetsPlayer(skill)) {
      if (this.targetingSkill === id && skill.type !== 'revive') return this.castAt(id, this.room.sessionId); // press twice = self
      this.startTargeting(id);
    } else {
      this.room.send('skill', { id });
    }
  }

  private startTargeting(id: string) {
    this.targetingSkill = id;
    this.hooks.targeting(SKILLS[id].name);
    renderer!.domElement.style.cursor = 'crosshair';
  }

  private castAt(id: string, target: string) {
    this.cancelTargeting();
    this.pendingSkill = { id, target };
    if (!targetsPlayer(SKILLS[id])) this.target = this.monsters.has(target) ? { kind: 'monster', id: target } : { kind: 'foe', id: target };
  }

  cancelTargeting() {
    if (!this.targetingSkill) return;
    this.targetingSkill = null;
    this.hooks.targeting(null);
    renderer!.domElement.style.cursor = 'default';
  }

  isTargeting() {
    return !!this.targetingSkill;
  }

  /** /auto on or off; returns the new state. */
  setAuto(on: boolean) {
    this.auto = on && !this.dead;
    this.autoNext = 0;
    if (!this.auto) this.pendingSkill = null;
    this.hooks.autoChanged(this.auto);
    return this.auto;
  }

  isAuto() {
    return this.auto;
  }

  /**
   * One /auto decision (a few times a second): drink a potion when low, heal, keep buffs up,
   * then pick the nearest monster and use the strongest ready skill, else plain attacks.
   */
  private autoStep() {
    const t = performance.now();
    if (t < this.autoNext) return;
    this.autoNext = t + 250;
    const s = this.session;
    const me = this.me;
    const d = s.derived;

    let drank = false;
    if (potionPct() > 0 && s.hp < d.maxHp * (potionPct() / 100) && t >= this.autoPotionAt) {
      const pot = s.inv
        .filter((i) => ITEMS[i.item_id]?.type === 'consumable' && ITEMS[i.item_id].heal)
        .sort((a, b) => (ITEMS[b.item_id].heal ?? 0) - (ITEMS[a.item_id].heal ?? 0))[0];
      if (pot) {
        s.use(pot.id);
        drank = true;
        this.autoPotionAt = t + AUTO_POTION_EVERY;
      }
    }
    // SP potions on their own 1 s timer; not in the same step as an HP one (the server takes one item at a time)
    if (!drank && spPotionPct() > 0 && s.sp < d.maxSp * (spPotionPct() / 100) && t >= this.autoSpPotionAt) {
      const pot = s.inv
        .filter((i) => ITEMS[i.item_id]?.type === 'consumable' && ITEMS[i.item_id].sp)
        .sort((a, b) => (ITEMS[b.item_id].sp ?? 0) - (ITEMS[a.item_id].sp ?? 0))[0];
      if (pot) {
        s.use(pot.id);
        this.autoSpPotionAt = t + AUTO_POTION_EVERY;
      }
    }
    if (this.pendingSkill || this.targetingSkill || me.cast) return;

    let m = this.target?.kind === 'monster' ? this.monsters.get(this.target.id) : undefined;
    if (!m || m.dead) {
      m = undefined;
      let best = AUTO_RANGE;
      for (const x of this.monsters.values()) {
        const dist = Math.hypot(x.x - me.x, x.y - me.y);
        if (!x.dead && dist < best && findPath(this.map, Math.floor(me.x), Math.floor(me.y), Math.floor(x.x), Math.floor(x.y))) {
          best = dist;
          m = x;
        }
      }
      if (!m) return;
      this.target = { kind: 'monster', id: m.id };
      this.path = [];
    }

    const cls = s.char.cls;
    const ready = (id: string) => {
      const sk = SKILLS[id];
      const lv = s.char.skills?.[id] ?? 0;
      return lv > 0 && canUseSkill(sk, cls) && (this.autoReady.get(id) ?? 0) <= t && s.sp >= skillSp(sk, lv);
    };
    const cast = (id: string, target?: string) => {
      this.autoReady.set(id, t + Math.max(SKILLS[id].cooldown ?? 1000, 800));
      if (target) this.castAt(id, target);
      else this.room.send('skill', { id });
    };
    const mine = Object.keys(s.char.skills ?? {}).filter((id) => SKILLS[id] && ready(id));
    // heal yourself
    if (s.hp < d.maxHp * AUTO_HEAL_HP) {
      const heal = mine.find((id) => SKILLS[id].type === 'heal' || SKILLS[id].type === 'heal_target');
      if (heal) return cast(heal, SKILLS[heal].type === 'heal_target' ? this.room.sessionId : undefined);
    }
    // keep buffs up
    const buff = mine.find((id) => isBuffSkill(SKILLS[id]) && (this.autoBuffs.get(id) ?? 0) < t + 1000);
    if (buff) {
      this.autoBuffs.set(buff, t + 3000); // until the server's 'buff' message says how long
      return cast(buff, SKILLS[buff].type === 'buff_target' ? this.room.sessionId : undefined);
    }
    // the strongest ready attack skill
    const lvOf = (id: string) => s.char.skills?.[id] ?? 0;
    const near = Math.hypot(m.x - me.x, m.y - me.y);
    // expected damage: พุ่งแทง grows with the gap, หมุนตัวแทง with the monsters around you
    const score = (id: string) => {
      const sk = SKILLS[id];
      let k = sk.hits ?? 1;
      if (sk.scale === 'distance') k *= Math.max(1, Math.min(sk.range ?? 5, near));
      if (sk.scale === 'crowd') {
        let n = 0;
        for (const x of this.monsters.values()) if (!x.dead && Math.hypot(x.x - me.x, x.y - me.y) <= (sk.radius ?? 2) + 0.3) n++;
        k *= Math.max(1, Math.min(CROWD_MAX, n));
      }
      return skillPower(sk, lvOf(id)) * k;
    };
    const attack = mine
      .filter((id) => {
        const sk = SKILLS[id];
        if (sk.type === 'aoe_self') return sk.power && near <= (sk.radius ?? 2);
        return sk.type === 'single' || sk.type === 'aoe' || sk.type === 'line';
      })
      .sort((a, b) => score(b) - score(a))[0];
    if (attack) cast(attack, SKILLS[attack].type === 'aoe_self' ? undefined : m.id);
    // otherwise updateMe() walks up and attacks the target as usual
  }

  toggleSit() {
    if (!this.dead) this.room.send('sit'); // moving stands up again on the server
  }

  // ------------------------------------------------------------ server messages

  private listen() {
    const on = (type: string, fn: (msg: any) => void) => this.unsubs.push(this.room.onMessage(type, fn));
    on('hit', (msg: { by: string; m: string; dmg: number; crit: boolean; el?: 'up' | 'down' | '' }) => {
      const m = this.monsters.get(msg.m);
      const a = this.players.get(msg.by);
      if (!m) return;
      const vol = this.vol(m.x, m.y, a === this.me);
      const land = () => {
        const p = this.top(m);
        sfx(msg.dmg === 0 ? 'miss' : msg.crit ? 'crit' : 'hit', vol);
        // element: "weak!" / "resists" over my own hits
        if (a === this.me && msg.el) this.floatText(p.clone().add(new THREE.Vector3(0, 0.45, 0)), msg.el === 'up' ? 'แพ้ธาตุ!' : msg.dmg === 0 ? 'ไม่ได้ผล' : 'ต้านธาตุ', msg.el === 'up' ? 'el-up' : 'el-down', 1000);
        if (msg.dmg === 0) this.floatText(p, msg.el === 'down' ? '0' : 'Miss', 'miss');
        else {
          this.floatText(p, String(msg.dmg), msg.crit ? 'crit' : a === this.me ? 'deal' : 'other');
          this.flash(m.rig.root);
          m.anim?.hit();
        }
      };
      if (a) {
        this.face(a, m.x, m.y);
        a.attack = 1;
        a.combat = COMBAT_TIME;
        a.ready = READY_TIME;
        sfxAttack(a.cls, this.vol(a.x, a.y, a === this.me));
        this.attackFx(a, m, land);
      } else land();
    });
    on('phit', (msg: { by?: string; to: string; dmg: number; crit?: boolean; block?: boolean }) => {
      // PVP: a player hit another player
      const v = this.players.get(msg.to);
      const a = msg.by ? this.players.get(msg.by) : undefined;
      if (!v) return;
      const land = () => {
        const p = new THREE.Vector3(v.x, 1.8, v.y);
        if (v === this.me) sfx(msg.dmg === 0 ? 'miss' : 'hurt');
        else sfx(msg.dmg === 0 ? 'miss' : msg.crit ? 'crit' : 'hit', this.vol(v.x, v.y, a === this.me));
        if (msg.block) this.floatText(p, 'Block', 'miss');
        else if (msg.dmg === 0) this.floatText(p, 'Miss', 'miss');
        else {
          this.floatText(p, String(msg.dmg), v === this.me ? 'take' : msg.crit ? 'crit' : a === this.me ? 'deal' : 'other');
          this.flash(v.rig.root, 0xff3333);
        }
      };
      if (a) {
        this.face(a, v.x, v.y);
        a.attack = 1;
        a.combat = COMBAT_TIME;
        a.ready = READY_TIME;
        sfxAttack(a.cls, this.vol(a.x, a.y, a === this.me));
        this.attackFx(a, this.asTarget(v), land);
      } else land();
      // hit back: someone who attacks us becomes our target if we aren't doing anything
      if (v === this.me && a && this.hostile(a.id) && !this.target && !this.path.length && msg.dmg > 0) this.target = { kind: 'foe', id: a.id };
    });
    on('mhit', (msg: { m: string; to: string; dmg: number; block?: boolean; guard?: string }) => {
      const v = this.players.get(msg.to);
      const m = this.monsters.get(msg.m);
      if (msg.guard && v) {
        // Kick Drum: the bassist takes part of a party member's hit
        const from = this.players.get(msg.guard);
        if (from) this.tether(from, v, new THREE.Color(CLASSES.bassist.fxColor!).getHex());
        this.floatText(new THREE.Vector3(v.x, 1.7, v.y), String(msg.dmg), 'take');
        return;
      }
      if (m && v) {
        if (m.anim) m.anim.attack();
        else this.lunge(m.rig.root, v.x - m.x, v.y - m.y);
      }
      if (!v) return;
      if (v === this.me) sfx(msg.dmg === 0 ? 'miss' : 'hurt');
      const p = new THREE.Vector3(v.x, 1.7, v.y);
      if (msg.block) {
        this.floatText(p, 'Block', 'miss');
        const dir = m ? Math.atan2(m.y - v.y, m.x - v.x) : 0;
        this.pixelFx('block', { at: () => new THREE.Vector3(v.x + Math.cos(dir) * 0.35, 0, v.y + Math.sin(dir) * 0.35) });
      } else if (msg.dmg === 0) this.floatText(p, 'Miss', 'miss');
      else {
        this.floatText(p, String(msg.dmg), 'take');
        this.flash(v.rig.root, 0xff3333);
      }
      if (v === this.me && m && !m.dead && !this.target && !this.path.length) this.target = { kind: 'monster', id: m.id };
    });
    on('skill', (msg) => {
      // every skill without a cast bar still gets its "วีด" as it goes off (cast skills whistle while casting)
      const sk = SKILLS[msg.skill];
      const caster = this.players.get(msg.by);
      if (sk && !sk.castMs && caster) sfxWheet(this.vol(caster.x, caster.y, caster === this.me) * 0.8);
      this.skillFx(msg);
      if (msg.by === this.room.sessionId && SKILLS[msg.skill]) {
        this.autoReady.set(msg.skill, performance.now() + (SKILLS[msg.skill].cooldown ?? 1000));
      }
    });
    on('buff', (msg: { skill: string; seconds: number }) => this.autoBuffs.set(msg.skill, performance.now() + msg.seconds * 1000));
    on('reflect', (msg: { m: string; by: string; dmg: number }) => {
      // จังหวะยก: the hit bounces back into the monster
      const m = this.monsters.get(msg.m);
      const a = this.players.get(msg.by);
      if (!m) return;
      const green = new THREE.Color(CLASSES.bassist.fxColor!).getHex();
      if (a) this.tether(a, m, green);
      this.floatText(this.top(m), String(msg.dmg), msg.by === this.room.sessionId ? 'skill' : 'other');
      this.glow(new THREE.Vector3(m.x, m.rig.height * 0.5, m.y), green, 2, 220);
    });
    on('cast', (msg: { by: string; skill: string; ms: number; x: number; y: number }) => {
      const a = this.players.get(msg.by);
      const skill = SKILLS[msg.skill];
      if (!a || !skill) return;
      this.face(a, msg.x, msg.y);
      this.castFx(a, skill, msg.ms);
      if (a === this.me) this.path = [];
      if (skill.cls === 'singer') {
        // the singer charges on a golden circle under a spotlight, notes rising round them
        const start = a.cast?.start;
        singerCharge(this.fxCtx(false, () => {}), () => new THREE.Vector3(a.x, 0, a.y), msg.ms, () => !!a.cast && a.cast.start === start && this.players.get(a.id) === a);
      }
      if (skill.waves) {
        // ตัวโน้ตทำลาย: the 3x3 area lights up and charges while the keyboardist casts
        const start = a.cast?.start;
        const vol = this.vol(msg.x, msg.y, a === this.me);
        sfxNoteCharge(vol, msg.ms);
        blueCircle(this.fxCtx(false, () => {}), () => new THREE.Vector3(a.x, 0, a.y), 1.1, msg.ms / 1000, 0, 2.5);
        noteRainCharge(this.fxCtx(false, () => {}), msg.x, msg.y, skill.radius ?? 1.5, msg.ms, () => !!a.cast && a.cast.start === start && this.players.get(a.id) === a);
      }
    });
    on('castEnd', (msg: { by: string; done: boolean }) => {
      const a = this.players.get(msg.by);
      if (!a?.cast) return;
      a.cast.bar.remove();
      a.cast = undefined;
      a.performUntil = 0;
      if (!msg.done && a === this.me) this.hooks.toast('ขยับตัว ยกเลิกการร่ายสกิล', 'bad');
    });
    on('fx', (msg: { kind: string; to: string }) => {
      const a = this.players.get(msg.to);
      if (!a) return;
      const vol = this.vol(a.x, a.y, a === this.me);
      if (msg.kind === 'reveal') {
        const purple = new THREE.Color(CLASSES.drummer.fxColor!).getHex();
        this.smoke(a.x, a.y, purple);
        return;
      }
      if (msg.kind === 'potion') {
        this.sparkle(a, 0x7dff9a);
        sfx('potion', vol);
      }
      if (msg.kind === 'levelup') {
        this.levelFx(a, 'LEVEL UP!', 0xfff27a);
        sfx('levelup', vol);
      }
      if (msg.kind === 'joblevelup') {
        this.levelFx(a, 'JOB LEVEL UP!', 0x9be0ff);
        sfx('joblevel', vol);
      }
    });
    on('correct', (msg: { x: number; y: number }) => {
      this.me.x = msg.x;
      this.me.y = msg.y;
      this.sentX = msg.x;
      this.sentY = msg.y;
      this.path = [];
    });
    on('healed', () => {
      this.hooks.toast('ครูเพลง: พักเสียงสักหน่อยนะ (ฟื้น HP/SP เต็ม + บัพทุกสกิลระดับสูงสุด นาน 5 นาที)', 'good');
      this.sparkle(this.me, 0x9be0ff);
      this.levelFx(this.me, '', 0xffd36b);
      sfx('heal');
    });
    on('mcast', (msg: { m: string; skill: string; x: number; y: number; ms: number; to?: string }) => {
      // a boss charges a skill: it shouts the name and a red circle on the ground shows where it will land
      const m = this.monsters.get(msg.m);
      const sk = MONSTER_SKILLS[msg.skill];
      if (!m || !sk) return;
      const vol = this.vol(m.x, m.y, false);
      sfxReaper('warn', vol);
      this.floatText(this.top(m).add(new THREE.Vector3(0, 0.35, 0)), `${sk.name}!!`, 'shout', Math.max(1400, msg.ms + 400)).classList.add('boss-shout');
      const alive = () => this.monsters.get(msg.m) === m && !m.dead;
      const ctx = this.fxCtx(false, () => {});
      if (sk.area === 'target') {
        const v = msg.to ? this.players.get(msg.to) : undefined;
        if (v) telegraph(ctx, () => new THREE.Vector3(v.x, 0, v.y), 0.9, msg.ms, () => alive() && this.players.get(v.id) === v);
      } else if (sk.area === 'self') telegraph(ctx, () => new THREE.Vector3(m.x, 0, m.y), sk.radius, msg.ms, alive);
      else telegraph(ctx, () => new THREE.Vector3(msg.x, 0, msg.y), sk.radius, msg.ms, alive);
      if (m.anim) m.anim.attack();
    });
    on('mskill', (msg: { m: string; skill: string; x: number; y: number; hits: { p: string; dmg: number }[]; pulled?: { p: string } }) => {
      const m = this.monsters.get(msg.m);
      const sk = MONSTER_SKILLS[msg.skill];
      if (!sk) return;
      const meHit = msg.hits.some((h) => h.p === this.room.sessionId);
      const vol = this.vol(msg.x, msg.y, meHit);
      const kind = msg.skill === 'scythe_sweep' ? 'sweep' : msg.skill === 'soul_chain' ? 'chain' : msg.skill === 'hellfire' ? 'fire' : 'judge';
      const ctx = this.fxCtx(meHit, () => sfxReaper(kind, vol));
      if (m) {
        if (m.anim) m.anim.attack();
        else this.lunge(m.rig.root, 0, 0.01);
      }
      if (msg.skill === 'scythe_sweep') scytheSweep(ctx, msg.x, msg.y, sk.radius);
      else if (msg.skill === 'hellfire') hellfire(ctx, msg.x, msg.y, sk.radius);
      else if (msg.skill === 'judgement') judgement(ctx, msg.x, msg.y, sk.radius);
      else if (msg.skill === 'soul_chain' && m) {
        const v = this.players.get(msg.hits[0]?.p ?? msg.pulled?.p ?? '');
        if (v) soulChain(ctx, () => new THREE.Vector3(m.x, 0, m.y), () => new THREE.Vector3(v.x, 0, v.y));
      }
      msg.hits.forEach((h, i) => {
        const v = this.players.get(h.p);
        if (!v) return;
        setTimeout(() => {
          if (this.players.get(h.p) !== v) return;
          const p = new THREE.Vector3(v.x, 1.7, v.y);
          if (h.dmg === 0) this.floatText(p, 'Miss', 'miss');
          else {
            this.floatText(p, String(h.dmg), 'take', 1300);
            this.flash(v.rig.root, 0xff3333);
            if (v === this.me) sfx('hurt');
          }
        }, msg.skill === 'soul_chain' ? 250 : 60 + i * 20);
      });
      if (msg.pulled?.p === this.room.sessionId) this.hooks.toast(`ถูก${sk.name}ลากเข้าไปหาบอส!`, 'bad');
    });
    on('mvp', (msg: { sid: string; name: string; monster: string }) => this.mvpFx(msg.sid, msg.name));
    on('chat', (msg: { id: string; text: string }) => this.bubble(msg.id, msg.text));
  }

  // ------------------------------------------------------------ frame

  private frame() {
    const dt = Math.min(0.25, this.clock.getDelta()); // slow devices still walk at the right speed
    this.now += dt * 1000;
    const t = this.now / 1000;
    const state = this.room.state as RemoteState | undefined;
    if (state?.players) {
      this.syncMonsters(state, dt, t);
      this.syncPlayers(state, dt, t);
      this.updateMe(state, dt);
    }
    // town NPCs: idling at their posts, strolling round them, turning to the player
    const me = this.me ? { x: this.me.x, y: this.me.y } : null;
    for (const n of this.npcs) tickNpc(n, this.map, t, dt, me);
    // ambient animation
    for (const o of this.animated) {
      if (o.name === 'flag') o.rotation.y = Math.sin(t * 2 + o.id) * 0.25;
      else if (o.name === 'water') o.position.y = 0.36 + Math.sin(t * 2) * 0.01;
      else if (o.userData.tick) o.userData.tick(t);
      else {
        for (let i = 0; i < 3; i++) {
          const ring = o.getObjectByName(`ring${i}`);
          if (ring) ring.rotation.z = t * (i % 2 ? -1 : 1) * (1 + i * 0.5);
        }
        const col = o.getObjectByName('column');
        if (col) ((col as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.14 + Math.sin(t * 3) * 0.06;
      }
    }
    const mk = this.marker.material as THREE.MeshBasicMaterial;
    mk.opacity = Math.max(0, mk.opacity - dt * 1.5);
    // effects may start new effects while they run (a thrown mic bursts when it lands): keep those too
    const running = this.effects;
    this.effects = [];
    const kept = running.filter((fx) => fx(dt));
    this.effects = kept.concat(this.effects);

    // camera follows the player
    // zoomed in past the usual range, the camera drops lower and looks at the chest: a closer, over-the-shoulder view
    const d = this.dist;
    const near = THREE.MathUtils.smoothstep(d, MIN_ZOOM, 9);
    const pitch = THREE.MathUtils.lerp(0.32, this.pitch, near);
    this.camTarget.lerp(new THREE.Vector3(this.me.x, THREE.MathUtils.lerp(1.15, 0.8, near), this.me.y), Math.min(1, dt * 8));
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * Math.cos(pitch) * d,
      this.camTarget.y + Math.sin(pitch) * d,
      this.camTarget.z + Math.cos(this.yaw) * Math.cos(pitch) * d,
    );
    this.camera.lookAt(this.camTarget);
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt);
      const k = this.shakeAmp * (this.shakeT / 0.35);
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * k, (Math.random() - 0.5) * k, (Math.random() - 0.5) * k));
    }
    this.sun.position.copy(this.camTarget).add(this.sunOffset);
    this.sun.target.position.copy(this.camTarget);
    renderer!.render(this.scene, this.camera);
    this.updateOverlay();
  }

  private syncMonsters(state: RemoteState, dt: number, t: number) {
    const k = Math.min(1, dt * 10);
    state.monsters.forEach((rm, id) => {
      const m = this.monsters.get(id) ?? this.makeMonster(id, rm);
      if (rm.dead && !m.dead) {
        m.dead = true;
        m.anim?.die();
        const def = MONSTERS[m.key];
        if (def && !def.structure) {
          sfxMonster(m.key, def.model ?? m.key, def.size, 'die', Math.min(1, this.vol(m.x, m.y, false) * 2.2), def.boss);
          if (m.rig.root.visible) this.shatter(m);
          m.burst = true;
        } else sfx('mdie', Math.min(1, this.vol(m.x, m.y, false) * 2));
        if (this.target?.kind === 'monster' && this.target.id === id) this.target = null;
      } else if (!rm.dead && m.dead) {
        m.dead = false;
        m.x = rm.x;
        m.y = rm.y;
        m.fade = 0;
        m.burst = false;
        m.rig.root.visible = true;
        m.anim?.revive();
      }
      const dx = rm.x - m.x;
      const dy = rm.y - m.y;
      m.moving = Math.hypot(dx, dy) > 0.02;
      if (m.moving) m.rig.root.rotation.y = Math.atan2(dx, dy);
      m.x += dx * k;
      m.y += dy * k;
      m.hp = rm.hp;
      m.maxHp = rm.maxHp;
      // a rigged monster plays its death clip before sinking away; a drawn one squashes flat
      m.fade = Math.max(0, Math.min(1, m.fade + (m.dead ? -dt * (m.burst ? 9 : m.anim ? 0.7 : 2.5) : dt * 2.5)));
      m.rig.root.visible = m.fade > 0;
      m.rig.root.position.set(m.x, 0, m.y);
      if (m.anim) {
        m.rig.root.scale.setScalar(m.dead ? Math.min(1, m.fade * 2.5) : 0.2 + m.fade * 0.8);
        m.anim.update(dt, m.moving && !m.dead);
      } else {
        m.rig.root.scale.set(1, 0.2 + m.fade * 0.8, 1);
        animateMonster(m.rig, m.key, t, m.phase, m.moving);
      }
    });
  }

  private syncPlayers(state: RemoteState, dt: number, t: number) {
    const seen = new Set<string>();
    state.players.forEach((rp, id) => {
      seen.add(id);
      let a = this.players.get(id);
      if (a && a !== this.me && a.look !== lookKey(rp)) {
        this.destroyPlayer(a);
        a = undefined;
      }
      if (!a) a = this.makePlayer(id, rp);
      if ((rp.guild ?? '') !== (a.guild ?? '')) {
        a.guild = rp.guild ?? '';
        a.guildEl?.remove();
        a.guildEl = undefined;
        if (a.guild) {
          a.guildEl = document.createElement('span');
          a.guildEl.className = 'gd';
          a.guildEl.textContent = `[${a.guild}]`;
          a.label.el.appendChild(a.guildEl);
        }
        if (a === this.me) for (const o of this.players.values()) o.label.el.classList.toggle('foe', this.pvp && this.hostile(o.id));
      }
      a.label.el.classList.toggle('foe', this.pvp && this.hostile(id));
      if ((rp.shop ?? '') !== (a.shop ?? '')) this.setShopSign(a, rp.shop ?? '');
      if (a === this.me && a.look !== lookKey(rp)) {
        // our own job change: swap the model in place (keeps the camera and our label)
        a.look = lookKey(rp);
        a.cls = rp.cls as ClassKey;
        const look = lookOf(rp);
        const old = a.rig;
        const rig = buildCharacter(look, rp.head);
        rig.root.position.copy(old.root.position);
        rig.root.rotation.y = old.root.rotation.y;
        rig.root.add(a.hit);
        this.scene.remove(old.root);
        this.scene.add(rig.root);
        a.rig = rig;
        this.upgradePlayer(a, look, rp.head);
      }
      if (a === this.me) {
        this.session.setVitals(rp.hp, rp.sp);
        if (rp.dead !== this.dead) {
          this.dead = rp.dead;
          this.path = [];
          this.target = null;
          if (rp.dead && this.auto) this.setAuto(false);
          this.hooks.death(rp.dead);
          if (rp.dead) sfx('death');
        }
        if (a.label.sp) a.label.sp.style.width = `${(rp.sp / Math.max(1, rp.maxSp)) * 100}%`;
      } else {
        a.tx = rp.x;
        a.ty = rp.y;
        const dx = a.tx - a.x;
        const dy = a.ty - a.y;
        const d = Math.hypot(dx, dy);
        if (d > 4) {
          a.x = a.tx;
          a.y = a.ty;
        } else if (d > 0.01) {
          const step = Math.min(d, dt * 6.5);
          this.face(a, a.tx, a.ty);
          a.x += (dx / d) * step;
          a.y += (dy / d) * step;
          a.moving = 0.15;
        }
      }
      a.dead = rp.dead;
      a.sitting = rp.sitting;
      if (!!rp.hidden !== !!a.hidden) {
        a.hidden = !!rp.hidden;
        a.label.el.classList.toggle('hiding', a.hidden);
        if (a.hidden) this.hideAura(a);
      }
      // hidden players aren't drawn for anyone else; we still see ourselves (with a purple haze)
      a.rig.root.visible = !a.hidden || a === this.me;
      a.label.el.style.visibility = a.hidden && a !== this.me ? 'hidden' : '';
      a.hp = rp.hp;
      a.maxHp = rp.maxHp;
      setHat(a.rig, rp.head);
      setEar(a.rig, rp.ear);
      if (rp.level >= MAX_LEVEL) {
        a.maxAura ??= buildMaxAura();
        if (a.maxAura.parent !== a.rig.root) a.rig.root.add(a.maxAura); // the model was swapped (outfit, job change)
        animateMaxAura(a.maxAura, performance.now() / 1000);
      } else if (a.maxAura) {
        a.maxAura.removeFromParent();
        a.maxAura = undefined;
      }
      a.armed = !!rp.weapon;
      a.moving = Math.max(0, a.moving - dt);
      const atkTime = attackTime(a.armed === false ? '' : a.cls);
      a.attack = Math.max(0, a.attack - dt * (atkTime ? 1 / atkTime : 4));
      const performing = (a.performUntil ?? 0) > performance.now() && !a.moving;
      a.perform = Math.max(0, Math.min(1, (a.perform ?? 0) + (performing ? dt * 5 : -dt * 4)));
      if (performing) a.combat = Math.max(a.combat, 1);
      a.combat = Math.max(0, a.combat - dt);
      a.ready = Math.max(0, (a.ready ?? 0) - dt);
      if (a.dead || a.sitting) a.ready = 0;
      a.rig.root.position.set(a.x, 0, a.y);
      if (a.dash) {
        const k = (performance.now() - a.dash.t) / DASH_MS;
        if (k >= 1) a.dash = undefined;
        else {
          const e = 1 - (1 - k) * (1 - k);
          a.rig.root.position.set(a.dash.x + (a.x - a.dash.x) * e, 0, a.dash.y + (a.y - a.dash.y) * e);
        }
      }
      animateRig(a.rig, t, { moving: a.moving > 0, sitting: a.sitting, dead: a.dead, attack: a.attack, drawn: a.combat > 0 || a.ready > 0, armed: a.armed, combo: a.combo, perform: a.perform, ready: a.ready > 0 });
      if (a.cast) {
        const k = Math.min(1, (performance.now() - a.cast.start) / a.cast.ms);
        a.cast.fill.style.width = `${(k * 100).toFixed(1)}%`;
      }
      if (a.spin && a.spin > 0) {
        a.spin = Math.max(0, a.spin - dt);
        a.rig.root.rotation.y += dt * 26;
      }
    });
    for (const [id, a] of this.players) {
      if (!seen.has(id) && a !== this.me) this.destroyPlayer(a);
    }
  }

  private updateMe(state: RemoteState, dt: number) {
    const me = this.me;
    if (this.dead) return;
    const speed = this.session.derived.moveSpeed / TILE_PX;
    const time = this.now;
    if (this.auto) this.autoStep();

    if (me.cast) {
      // singing เสียงสูง: stand still (walking away cancels it on the server)
    } else if (this.target?.kind === 'monster') {
      const m = this.monsters.get(this.target.id);
      if (!m || m.dead) {
        this.target = null;
        this.pendingSkill = null;
      } else {
        const skill = this.pendingSkill ? SKILLS[this.pendingSkill.id] : null;
        const reach = (skill ? skill.range ?? 1 : CLASSES[this.session.char.cls].range) + MONSTERS[m.key].size * 0.3 + 0.3;
        const d = Math.hypot(m.x - me.x, m.y - me.y);
        if (d > reach) {
          if (!this.path.length || time % 400 < 20) this.walkNear(m.x, m.y, Math.max(1, reach - 0.4));
        } else {
          this.path = [];
          this.face(me, m.x, m.y);
          if (this.pendingSkill) {
            this.room.send('skill', this.pendingSkill);
            this.pendingSkill = null;
            this.lastAttack = time;
          } else if (time - this.lastAttack >= this.session.derived.attackDelay) {
            this.lastAttack = time;
            this.room.send('attack', { id: m.id });
          }
        }
      }
    } else if (this.target?.kind === 'foe') {
      const f = this.players.get(this.target.id);
      if (!f || !this.hostile(f.id)) {
        this.target = null;
        this.pendingSkill = null;
      } else {
        const skill = this.pendingSkill ? SKILLS[this.pendingSkill.id] : null;
        const reach = (skill ? skill.range ?? 1 : CLASSES[this.session.char.cls].range) + 0.3 + 0.3;
        const d = Math.hypot(f.x - me.x, f.y - me.y);
        if (d > reach) {
          if (!this.path.length || time % 400 < 20) this.walkNear(f.x, f.y, Math.max(1, reach - 0.4));
        } else {
          this.path = [];
          this.face(me, f.x, f.y);
          if (this.pendingSkill) {
            this.room.send('skill', this.pendingSkill);
            this.pendingSkill = null;
            this.lastAttack = time;
          } else if (time - this.lastAttack >= this.session.derived.attackDelay) {
            this.lastAttack = time;
            this.room.send('attack', { id: f.id });
          }
        }
      }
    } else if (this.pendingSkill) {
      const p = state.players.get(this.pendingSkill.target ?? '');
      if (!p) this.pendingSkill = null;
      else {
        const reach = (SKILLS[this.pendingSkill.id].range ?? 1) + 0.3;
        if (Math.hypot(p.x - me.x, p.y - me.y) > reach) {
          if (!this.path.length) this.walkNear(p.x, p.y, Math.max(1, reach - 0.4));
        } else {
          this.path = [];
          this.room.send('skill', this.pendingSkill);
          this.pendingSkill = null;
        }
      }
    } else if (this.target?.kind === 'npc' && !this.path.length) {
      const n = this.target.npc;
      if (Math.hypot(n.x + 0.5 - me.x, n.y + 0.5 - me.y) <= 2.2) {
        this.face(me, n.x + 0.5, n.y + 0.5);
        this.target = null;
        this.hooks.talk(n);
      } else this.target = null;
    }

    if (this.path.length) {
      let step = speed * dt;
      while (step > 0 && this.path.length) {
        const wp = this.path[0];
        const dx = wp.x - me.x;
        const dy = wp.y - me.y;
        const d = Math.hypot(dx, dy);
        this.face(me, wp.x, wp.y);
        if (d <= step) {
          me.x = wp.x;
          me.y = wp.y;
          step -= d;
          this.path.shift();
        } else {
          me.x += (dx / d) * step;
          me.y += (dy / d) * step;
          step = 0;
        }
      }
      me.moving = 0.12;
    }
    if (time - this.lastSend > MOVE_SEND_MS && (me.x !== this.sentX || me.y !== this.sentY)) {
      this.lastSend = time;
      this.sentX = me.x;
      this.sentY = me.y;
      this.room.send('move', { x: me.x, y: me.y });
    }
    for (const p of this.map.portals) {
      if (Math.hypot(me.x - (p.x + 0.5), me.y - (p.y + 0.5)) < 1.2 && !this.warping) {
        this.warping = true;
        this.room.send('move', { x: me.x, y: me.y });
        setTimeout(() => this.room.send('warp'), 120);
        setTimeout(() => (this.warping = false), 3000);
      }
    }
  }

  // ------------------------------------------------------------ overlay (names, bars, numbers, bubbles)

  private project(v: THREE.Vector3) {
    const p = v.clone().project(this.camera);
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, visible: p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2 };
  }

  private place(el: HTMLElement, v: THREE.Vector3, show = true) {
    const p = this.project(v);
    const vis = show && p.visible;
    if (vis) el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    if (el.hidden === vis) el.hidden = !vis;
  }

  private updateOverlay() {
    for (const s of this.staticLabels) this.place(s.el, s.pos);
    for (const a of this.players.values()) {
      this.place(a.label.el, new THREE.Vector3(a.x, 0, a.y));
      if (a.shopEl) this.place(a.shopEl, new THREE.Vector3(a.x, a.sitting ? 1.75 : 2.2, a.y), !a.hidden);
      if (a.label.fill) a.label.fill.style.width = `${(a.hp / Math.max(1, a.maxHp)) * 100}%`;
      if (a.bubble) {
        if (this.now > a.bubble.until) {
          a.bubble.el.remove();
          a.bubble = undefined;
        } else this.place(a.bubble.el, new THREE.Vector3(a.x, a.sitting ? 1.6 : 2.0, a.y));
      }
    }
    for (const m of this.monsters.values()) {
      const def = MONSTERS[m.key];
      const targeted = this.target?.kind === 'monster' && this.target.id === m.id;
      const named = !!def.boss || !!def.structure || this.hoverMonster === m || targeted
        || (TOUCH && Math.hypot(m.x - this.me.x, m.y - this.me.y) < TOUCH_NAME_RANGE);
      const show = !m.dead && (named || m.hp < m.maxHp);
      this.place(m.label.el, new THREE.Vector3(m.x, 0, m.y), show);
      m.label.el.classList.toggle('named', named);
      if (m.label.fill) m.label.fill.style.width = `${(m.hp / Math.max(1, m.maxHp)) * 100}%`;
    }
    this.floats = this.floats.filter((f) => {
      const age = (this.now - f.born) / f.life;
      if (age >= 1) {
        f.el.remove();
        return false;
      }
      const up = Math.sin(Math.min(1, age * 1.6) * Math.PI * 0.5) * f.rise;
      this.place(f.el, f.pos.clone().add(new THREE.Vector3(f.dx * age, up, 0)));
      f.el.style.opacity = String(age > 0.7 ? (1 - age) / 0.3 : 1);
      return true;
    });
  }

  /** Effect volume: full for my own actions, quieter with distance for everyone else's. */
  private vol(x: number, y: number, mine: boolean) {
    if (mine) return 1;
    return Math.max(0, 1 - Math.hypot(x - this.me.x, y - this.me.y) / 14) * 0.45;
  }

  /** A player dressed up as a monster target, for the attack effects (follows them as they move). */
  private asTarget(v: PlayerActor): MonsterActor {
    return {
      get x() { return v.x; },
      get y() { return v.y; },
      id: v.id, key: '', rig: { root: v.rig.root, body: v.rig.root, height: 1.7 } as MonsterRig,
      dead: v.dead, hp: v.hp, maxHp: v.maxHp, phase: 0, moving: false, label: v.label, hit: v.hit, fade: 0,
    } as unknown as MonsterActor;
  }

  private top(m: MonsterActor) {
    return new THREE.Vector3(m.x, m.rig.height + 0.2, m.y);
  }

  /** RO-style damage numbers and shouts, floating above a point in the world. */
  private floatText(pos: THREE.Vector3, text: string, kind: string, life = 900) {
    const el = document.createElement('div');
    // numbers: chunky, wide-spaced digits with a thick outline that pop in big and white, settle into their
    // colour and float straight up (stacking on multi-hits)
    const num = /^[+]?\d+$/.test(text) && kind !== 'level' && kind !== 'shout';
    el.className = `wf ${kind}${num ? ' num' : ''}`;
    if (num) {
      const inner = document.createElement('span');
      inner.textContent = text;
      el.appendChild(inner);
    } else el.textContent = text;
    this.overlay.appendChild(el);
    const dx = kind === 'shout' || kind === 'level' ? 0 : num ? (Math.random() - 0.5) * 0.15 : (Math.random() - 0.5) * 0.8;
    this.floats.push({ el, pos: pos.clone(), born: this.now, life: num ? Math.max(life, 1100) : life, dx, rise: kind === 'level' ? 0.9 : num ? 0.85 : 0.6 });
    return el;
  }

  bubble(id: string, text: string) {
    const a = this.players.get(id);
    if (!a) return;
    a.bubble?.el.remove();
    const el = document.createElement('div');
    el.className = 'wb';
    el.textContent = text;
    this.overlay.appendChild(el);
    a.bubble = { el, until: this.now + 4500 };
  }

  // ------------------------------------------------------------ effects

  private face(a: PlayerActor, x: number, y: number) {
    const dx = x - a.x;
    const dy = y - a.y;
    if (Math.hypot(dx, dy) > 0.02) a.rig.root.rotation.y = Math.atan2(dx, dy);
  }

  private lunge(o: THREE.Object3D, dx: number, dy: number) {
    const d = Math.hypot(dx, dy) || 1;
    let t = 0;
    this.effects.push((dt) => {
      t += dt * 6;
      const k = Math.sin(Math.min(1, t) * Math.PI) * 0.25;
      o.children[0].position.set((dx / d) * k, 0, (dy / d) * k);
      if (t >= 1) o.children[0].position.set(0, 0, 0);
      return t < 1;
    });
  }

  /** Hit spark (materials are shared between actors, so no tinting). */
  private flash(o: THREE.Object3D, color = 0xffffff) {
    this.burst(new THREE.Vector3(o.position.x, 0.6, o.position.z), color, 6, 2);
    // a monster that is hit cries out in its own voice (at most every 140 ms, so multi-hits don't pile up)
    const key = o.userData.monKey as string | undefined;
    if (key && MONSTERS[key] && performance.now() - ((o.userData.voiceAt as number) ?? 0) > 140) {
      o.userData.voiceAt = performance.now();
      const def = MONSTERS[key];
      sfxMonster(key, def.model ?? key, def.size, 'hurt', this.vol(o.position.x, o.position.z, false) * 2.2, def.boss);
    }
  }

  /** A monster dying bursts into pieces of its colours that fly out, tumble, bounce once and fade. */
  private shatter(m: MonsterActor) {
    const def = MONSTERS[m.key];
    const h = m.rig.height;
    const cx = m.x;
    const cz = m.y;
    const base = new THREE.Color(def.color ?? '#cccccc');
    const cols = [base, base.clone().offsetHSL(0, 0, 0.18), base.clone().offsetHSL(0, 0, -0.2), new THREE.Color(def.glow ?? '#ffffff')];
    const n = Math.round(14 + Math.min(16, def.size * 8) + (def.boss ? 14 : 0));
    const geos = [new THREE.TetrahedronGeometry(1), new THREE.BoxGeometry(1, 1, 1), new THREE.OctahedronGeometry(1)];
    const pieces: { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; bounced: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshLambertMaterial({ color: cols[i % cols.length], transparent: true, emissive: cols[i % cols.length], emissiveIntensity: 0.25 });
      const mesh = new THREE.Mesh(geos[i % geos.length], mat);
      const sz = (0.09 + Math.random() * 0.13) * Math.max(0.7, Math.min(2.2, def.size));
      mesh.scale.set(sz, sz * (0.6 + Math.random() * 0.8), sz);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.3 * def.size;
      mesh.position.set(cx + Math.cos(a) * r, h * (0.25 + Math.random() * 0.6), cz + Math.sin(a) * r);
      const sp = 1.6 + Math.random() * 2.6;
      pieces.push({ mesh, v: new THREE.Vector3(Math.cos(a) * sp, 2 + Math.random() * 3.2, Math.sin(a) * sp), spin: new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7), bounced: false });
      this.scene.add(mesh);
    }
    // a quick white-hot flash where it stood
    const glow = this.sprite(sparkTexture(), Math.max(1.4, def.size * 1.8), cols[3].getHex(), true);
    glow.position.set(cx, h * 0.5, cz);
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      glow.material.opacity = Math.max(0, 1 - t / 0.25);
      glow.scale.setScalar(Math.max(1.4, def.size * 1.8) * (1 + t * 3));
      for (const p of pieces) {
        p.v.y -= 9.8 * dt;
        p.mesh.position.addScaledVector(p.v, dt);
        if (p.mesh.position.y < 0.04) {
          p.mesh.position.y = 0.04;
          if (!p.bounced) {
            p.bounced = true;
            p.v.y = Math.abs(p.v.y) * 0.35;
            p.v.x *= 0.5;
            p.v.z *= 0.5;
            p.spin.multiplyScalar(0.4);
          } else {
            p.v.set(0, 0, 0);
            p.spin.set(0, 0, 0);
          }
        }
        p.mesh.rotation.x += p.spin.x * dt;
        p.mesh.rotation.y += p.spin.y * dt;
        p.mesh.rotation.z += p.spin.z * dt;
        (p.mesh.material as THREE.MeshLambertMaterial).opacity = t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.5);
      }
      if (t > 1.4) {
        this.scene.remove(glow);
        glow.material.dispose();
        for (const p of pieces) {
          this.scene.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
        }
        geos.forEach((g) => g.dispose());
        return false;
      }
      return true;
    });
  }

  private sprite(tex: THREE.Texture, size: number, color = 0xffffff, additive = false) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }));
    s.scale.setScalar(size);
    this.scene.add(s);
    return s;
  }

  private projectile(from: THREE.Vector3, to: THREE.Vector3, tex: THREE.Texture, size: number, ms: number, done?: () => void, delay = 0) {
    let t = -delay / ms;
    const s = this.sprite(tex, size);
    s.visible = false;
    this.effects.push((dt) => {
      t += (dt * 1000) / ms;
      if (t < 0) return true;
      s.visible = true;
      s.position.lerpVectors(from, to, Math.min(1, t)).add(new THREE.Vector3(0, Math.sin(Math.min(1, t) * Math.PI) * 0.4, 0));
      if (t >= 1) {
        this.scene.remove(s);
        done?.();
        return false;
      }
      return true;
    });
  }

  /** Every normal attack sends black music notes flying at the monster; damage shows when the first one lands. */
  private attackFx(a: PlayerActor, m: MonsterActor, land: () => void) {
    if (a.cls === 'teen') {
      // dagger combo: slash -> stab -> overhead finisher; the hit lands when the blade does
      const now = performance.now();
      a.combo = now - (a.lastSwing ?? 0) > 1800 ? 0 : ((a.combo ?? -1) + 1) % attackMoves('teen');
      a.lastSwing = now;
      const move = a.combo;
      this.lunge(a.rig.root, m.x - a.x, m.y - a.y);
      const d = Math.hypot(m.x - a.x, m.y - a.y) || 1;
      const ux = (m.x - a.x) / d;
      const uy = (m.y - a.y) / d;
      // pixel effects are drawn facing right: mirror them when the target is left of the player on screen
      const flip = new THREE.Vector3(m.x, 1, m.y).project(this.camera).x < new THREE.Vector3(a.x, 1, a.y).project(this.camera).x;
      const r = Math.min(0.5, (MONSTERS[m.key]?.size ?? 1) * 0.3);
      const hitAt = new THREE.Vector3(m.x - ux * r, m.rig.height * 0.45, m.y - uy * r);
      const armed = a.armed !== false;
      setTimeout(() => {
        if (armed && move === 0) this.pixelFx('slash', { at: () => hitAt.clone().setY(m.rig.height * 0.3), flip });
        else if (armed && move === 1) this.pixelFx('thrust', { at: () => new THREE.Vector3(a.x + ux * 0.35, 0.95, a.y + uy * 0.35), flip });
        else if (armed) this.pixelFx('cleave', { at: () => new THREE.Vector3(m.x - ux * r, 0.02, m.y - uy * r), flip });
        this.pixelFx('stab_hit', { at: () => hitAt });
        land();
      }, attackHit('teen', move) * attackTime('teen') * 1000);
      return;
    }
    if (MOVE_CLASSES.has(a.cls) && a.armed !== false) return this.jobAttackFx(a, m, land);
    const melee = !CLASSES[a.cls].projectile;
    if (melee) this.lunge(a.rig.root, m.x - a.x, m.y - a.y);
    const notes = ['♪', '♫', '♬'];
    const first = Math.floor(Math.random() * notes.length);
    for (let i = 0; i < 3; i++) {
      const side = new THREE.Vector3(-(m.y - a.y), 0, m.x - a.x).normalize().multiplyScalar((i - 1) * 0.25);
      const from = new THREE.Vector3(a.x, 1.0 + i * 0.12, a.y).add(side);
      const to = new THREE.Vector3(m.x, m.rig.height * 0.6, m.y).addScaledVector(side, 0.3);
      const tex = glyphTexture(notes[(first + i) % notes.length], '#111111', 'rgba(255,255,255,0.9)');
      this.projectile(from, to, tex, i === 0 ? 0.55 : 0.42, melee ? 180 : 230, i === 0 ? land : undefined, i * 70);
    }
  }

  private burst(pos: THREE.Vector3, color: number, n: number, speed = 3) {
    const parts = Array.from({ length: n }, () => {
      const s = this.sprite(sparkTexture(), 0.25, color, true);
      s.position.copy(pos);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      return { s, v };
    });
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      for (const p of parts) {
        p.s.position.addScaledVector(p.v, dt);
        p.v.y -= dt * 4;
        p.s.material.opacity = Math.max(0, 1 - t / 0.6);
      }
      if (t > 0.6) parts.forEach((p) => this.scene.remove(p.s));
      return t <= 0.6;
    });
  }

  private ring(x: number, y: number, radius: number, color: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(color) }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, y);
    this.scene.add(m);
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: blendFor(color) }),
    );
    disk.rotation.x = -Math.PI / 2;
    disk.position.set(x, 0.04, y);
    this.scene.add(disk);
    let t = 0;
    this.effects.push((dt) => {
      t += dt / 0.65;
      const s = 0.2 + Math.min(1, t) * radius;
      m.scale.setScalar(s);
      disk.scale.setScalar(s);
      (m.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      (disk.material as THREE.MeshBasicMaterial).opacity = 0.25 * (1 - t);
      if (t >= 1) this.scene.remove(m, disk);
      return t < 1;
    });
  }

  private skillFx(msg: { by: string; skill: string; x: number; y: number; target?: string; allies?: string[]; fromX?: number; fromY?: number; hits: { m?: string; p?: string; dmg: number }[] }) {
    const skill = SKILLS[msg.skill];
    const a = this.players.get(msg.by);
    if (!skill) return;
    if (a && skill.scale === 'distance' && msg.fromX !== undefined && msg.fromY !== undefined) {
      a.dash = { x: msg.fromX, y: msg.fromY, t: performance.now() };
      if (a !== this.me) {
        // others: jump straight to where the server put them (the slide is drawn from `dash`)
        a.x = a.tx;
        a.y = a.ty;
      }
    }
    if (a && skill.scale === 'crowd') a.spin = 0.55;
    if (skill.cls === 'keyboardist') {
      this.keyboardFx(a, msg);
      return;
    }
    if (JOB_FX.has(clsOf(skill))) {
      this.jobSkillFx(a, msg);
      return;
    }
    const color = new THREE.Color(CLASSES[clsOf(skill)].color).getHex();
    const bladeSkill = skill.cls === 'teen' && (skill.type === 'single' || skill.type === 'aoe_self');
    if (a) {
      if (!bladeSkill) sfxSkill(clsOf(skill), skill.type, this.vol(a.x, a.y, a === this.me));
      else this.bladeFx(a, msg, a === this.me);
      this.floatText(new THREE.Vector3(a.x, 2.2, a.y), `${skill.name}!!`, 'shout', 1100);
      this.face(a, msg.x, msg.y);
      a.attack = 1;
      a.combat = COMBAT_TIME;
      a.ready = READY_TIME;
    }
    if (bladeSkill) {
      // drawn by bladeFx
    } else if (skill.type === 'aoe' || skill.type === 'aoe_self' || skill.type === 'heal') {
      this.ring(msg.x, msg.y, skill.radius ?? 1, color);
      this.burst(new THREE.Vector3(msg.x, 0.3, msg.y), color, 22, 4);
    } else if (skill.type === 'buff' && a) {
      this.levelFx(a, '', color);
    } else if (skill.type === 'buff_party') {
      // keyboardist buffs: the effect plays on everyone it reached (you and your party on this map)
      for (const sid of msg.allies ?? [msg.by]) {
        const t = this.players.get(sid);
        if (!t) continue;
        if (skill.fx) {
          const lift = ({ shield: 0.15, tempo: 0.45 } as Record<string, number>)[skill.fx] ?? 0.02;
          this.pixelFx(skill.fx, { at: () => new THREE.Vector3(t.x, lift, t.y) });
        } else this.levelFx(t, '', color);
        if (t !== a) this.burst(new THREE.Vector3(t.x, 1, t.y), color, 10);
      }
    } else if (targetsPlayer(skill)) {
      // keyboardist support skills: a pixelfx effect that follows the player it landed on
      const t = this.players.get(msg.target ?? '') ?? a;
      if (t && skill.fx) {
        const lift = ({ shield: 0.15, tempo: 0.45 } as Record<string, number>)[skill.fx] ?? 0.02;
        this.pixelFx(skill.fx, { at: () => new THREE.Vector3(t.x, lift, t.y) });
        if (t !== a) this.burst(new THREE.Vector3(t.x, 1, t.y), color, 10);
      } else if (t && skill.type === 'heal_target') this.sparkle(t, 0x7dff9a);
      else if (t) this.levelFx(t, '', color);
    } else if (skill.type === 'single' && a) {
      const glyph = ({ note: '♪', chord: '♫', wave: '〰', mic: '🎤' } as Record<string, string>)[CLASSES[clsOf(skill)].projectile ?? ''] ?? '✦';
      for (let i = 0; i < Math.min(3, skill.hits ?? 1); i++) {
        this.projectile(new THREE.Vector3(a.x, 1.0, a.y), new THREE.Vector3(msg.x, 0.6, msg.y), glyphTexture(glyph, '#ffffff'), 0.7, 200, undefined, i * 90);
      }
      setTimeout(() => {
        if (skill.fx) this.pixelFx(skill.fx, { at: () => new THREE.Vector3(msg.x, 0.6, msg.y) });
        else this.burst(new THREE.Vector3(msg.x, 0.6, msg.y), color, 12);
      }, 220);
    }
    msg.hits.forEach((h, i) => {
      setTimeout(() => {
        if (h.m) {
          const m = this.monsters.get(h.m);
          if (!m) return;
          this.floatText(this.top(m).add(new THREE.Vector3(0, i * 0.12, 0)), String(h.dmg), msg.by === this.room.sessionId ? 'skill' : 'other');
          this.flash(m.rig.root);
        } else if (h.p) this.playerNumber(h.p, h.dmg, msg.by, i);
      }, 240 + i * 110);
    });
  }

  // ------------------------------------------------------------ drummer / guitarist / bassist / singer

  /** A skill's number on a player: a heal (dmg < 0) in green, PVP damage (dmg > 0) like a hit. */
  private playerNumber(sid: string, dmg: number, by: string, i: number, color = 0xff3333) {
    const p = this.players.get(sid);
    if (!p) return;
    const at = new THREE.Vector3(p.x, 1.8 + (i % 4) * 0.1, p.y);
    if (dmg < 0) return this.floatText(at, `+${-dmg}`, 'heal');
    this.floatText(at, String(dmg), p === this.me ? 'take' : by === this.room.sessionId ? 'skill' : 'other');
    this.flash(p.rig.root, color);
    if (p === this.me) sfx('hurt');
  }

  /** Class effect colour (drummer purple, bassist green, guitarist red, singer yellow). */
  private fxColor(cls: ClassKey) {
    return new THREE.Color(CLASSES[cls].fxColor ?? CLASSES[cls].color).getHex();
  }

  /**
   * A normal attack with the class's own moves (vrm.ts): drummer sticks left/right, guitar/bass swung like a
   * sword, the singer's thrown mic. The damage shows when the blow (or the mic) lands.
   */
  private jobAttackFx(a: PlayerActor, m: MonsterActor, land: () => void) {
    const now = performance.now();
    const n = attackMoves(a.cls);
    a.combo = a.cls === 'drummer' || now - (a.lastSwing ?? 0) < 1800 ? ((a.combo ?? -1) + 1) % n : 0;
    a.lastSwing = now;
    const hitMs = attackHit(a.cls, a.combo) * attackTime(a.cls) * 1000;
    const mine = a === this.me;
    const color = this.fxColor(a.cls);
    const d = Math.hypot(m.x - a.x, m.y - a.y) || 1;
    const ux = (m.x - a.x) / d;
    const uy = (m.y - a.y) / d;
    const r = Math.min(0.5, (MONSTERS[m.key]?.size ?? 1) * 0.3);
    const hitAt = () => new THREE.Vector3(m.x - ux * r, m.rig.height * 0.5, m.y - uy * r);
    if (a.cls === 'singer') {
      // the mic leaves the hand at the release and flies in an arc
      const move = a.combo;
      setTimeout(() => {
        const from = new THREE.Vector3(a.x + ux * 0.3, 1.45, a.y + uy * 0.3);
        const ms = 120 + Math.min(9, d) * 38;
        this.micThrow(from, () => hitAt(), ms, color, () => {
          land();
          this.pixelFx('stab_hit', { at: hitAt });
          this.burst(hitAt(), color, 8, 3);
        });
      }, attackHit('singer', move) * attackTime('singer') * 1000);
      return;
    }
    const heavy = a.cls !== 'drummer';
    const move = a.combo;
    setTimeout(() => {
      const at = hitAt();
      if (heavy) {
        // instrument swing: a wide crescent along the swing (overhead = vertical, sweep = flat)
        this.crescent(at, move === 0 ? 1.45 : 0.1, 1.9, 0xffffff, 230);
        this.crescent(at, move === 0 ? 1.45 : 0.1, 1.5, color, 260, 40);
        this.pixelFx('stab_hit', { at: () => at, scale: 1.6 });
        if (mine) this.shake(0.08);
      } else {
        // a stick blow: a quick small cut, left stick down to the right, right stick the other way
        this.crescent(at, move === 0 ? -0.8 : 0.8, 1.0, 0xffffff, 160);
        this.pixelFx('stab_hit', { at: () => at });
      }
      land();
    }, hitMs);
  }

  /** The skills of the four band classes: big effects in the class colour. */
  private jobSkillFx(a: PlayerActor | undefined, msg: { by: string; skill: string; x: number; y: number; target?: string; allies?: string[]; fromX?: number; fromY?: number; dirX?: number; dirY?: number; bonus?: boolean; pulled?: string[]; hits: { m?: string; p?: string; dmg: number; at?: number }[] }) {
    const skill = SKILLS[msg.skill];
    const id = msg.skill;
    const c = this.fxColor(clsOf(skill));
    const mine = !!a && a === this.me;
    const vol = a ? this.vol(a.x, a.y, mine) : 0;
    const isBuff = skill.type === 'buff' || skill.type === 'buff_party' || skill.type === 'buff_target';
    if (a) {
      if (skill.shape !== 'x' && id !== 'double_kick' && id !== 'send_off' && id !== 'snare_roll' && id !== 'hammer_on' && id !== 'vibrato' && id !== 'slide' && id !== 'bending' && id !== 'palm_muting' && skill.cls !== 'singer') sfxSkill(clsOf(skill), skill.type, vol); // these have their own "ฟาก!" / "ตูม!" / "ฟวิ้ง!" / "ฟริ้ง!"
      this.floatText(new THREE.Vector3(a.x, 2.2, a.y), `${skill.name}!!`, 'shout', 1100);
      if (skill.type !== 'aoe_self' && !isBuff) this.face(a, msg.x, msg.y);
      a.combat = COMBAT_TIME;
      a.ready = READY_TIME;
      if (isBuff && skill.cls !== 'drummer') a.performUntil = performance.now() + 1800;
      else if (!isBuff && skill.cls !== 'singer') a.attack = 1;
    }
    const monsterAt = (mid?: string) => {
      const m = mid ? this.monsters.get(mid) : undefined;
      const f = !m && mid ? this.players.get(mid) : undefined; // PVP: a player
      return m ? new THREE.Vector3(m.x, m.rig.height * 0.5, m.y) : f ? new THREE.Vector3(f.x, 0.85, f.y) : new THREE.Vector3(msg.x, 0.7, msg.y);
    };
    const target = () => monsterAt(msg.hits[0]?.m ?? msg.hits.find((h) => h.dmg > 0)?.p ?? msg.target);
    // damage numbers: at the given time for waves, else one after another
    let numbersFrom = 240;
    let numberGap = 110;

    if (id === 'snare_roll' && a) {
      // a storm of violet blades whirling round the drummer ("ฟริ้ง!"), afterimages lunging in from both sides,
      // 16 starbursts on the target and a big one at the end with the total in yellow
      numbersFrom = 120;
      numberGap = 85;
      const total = msg.hits.reduce((sum, h) => sum + h.dmg, 0);
      const ctx = {
        scene: this.scene,
        camera: this.camera,
        add: (e: Effect) => this.effects.push(e),
        sparks: (p: THREE.Vector3, color: number, n: number, speed: number) => this.burst(p, color, n, speed),
        sound: (big: boolean) => sfxFring(vol, big),
        shake: (amp: number) => mine && this.shake(amp),
      };
      const glow = sparkTexture();
      snareStorm(ctx, a.x, a.y, 1.75, glow);
      const ghostEvery = PHONE ? 4 : 2;
      for (let i = 0; i < 16; i++) {
        setTimeout(() => {
          a.combo = i % 2;
          a.attack = 1;
          const at = target();
          snareHit(ctx, at, i === 15, glow);
          if (i % 4 === 2 && i < 15) sfxFring(vol * 0.3);
          if (i % ghostEvery === 1 && !a.dead && this.players.get(a.id) === a) {
            const side = (i % 4 === 1 ? 1 : -1) * (0.9 + Math.random() * 1.1);
            snareGhost(ctx, a.rig.root, a.x, a.y, at.x, at.z, side, 0.9 + Math.random() * 0.6);
          }
          if (i === 15 && total > 0) this.floatText(at.clone().setY(at.y + 1.9), String(total), 'total', 1800);
        }, 60 + i * 85);
      }
    } else if (id === 'ghost_exit' && a) {
      this.smoke(a.x, a.y, c);
      this.ring(a.x, a.y, 1.6, c);
    } else if (id === 'double_kick' && a) {
      // two kick-drum stomps ("ตูม!"): magic circle, whirling music staves, a column of light, rising notes
      doubleKickBlast(
        {
          scene: this.scene,
          camera: this.camera,
          add: (e) => this.effects.push(e),
          sparks: (at, color, n, speed) => this.burst(at, color, n, speed),
          sound: (big) => sfxBoom(vol, big),
          shake: (amp) => mine && this.shake(amp),
        },
        a.x, a.y, skill.radius ?? 5, sparkTexture(),
      );
    } else if (id === 'slide' && a) {
      // a red fire comet (like the drummer's จังหวะส่ง) and a red starburst where it lands (x2 with Vibrato = bigger)
      const at = target();
      slideDash(this.fxCtx(mine, (hit) => sfxSlide(vol, hit, !!msg.bonus)), msg.fromX ?? a.x, msg.fromY ?? a.y, at.x, at.z, DASH_MS, !!msg.bonus, sparkTexture());
      if (msg.bonus) setTimeout(() => this.floatText(target().setY(at.y + 1.4), 'x2!!', 'shout', 900), DASH_MS);
    } else if (id === 'send_off' && a) {
      // dash like a purple comet ("ฟวิ้ง!") and a starburst where it lands (x2 = bigger)
      const fx = msg.fromX ?? a.x;
      const fy = msg.fromY ?? a.y;
      const at = target();
      sendOffDash(
        {
          scene: this.scene,
          camera: this.camera,
          add: (e) => this.effects.push(e),
          sparks: (p, color, n, speed) => this.burst(p, color, n, speed),
          sound: (hit) => (hit ? sfxPak(vol, true) : sfxFwing(vol, !!msg.bonus)),
          shake: (amp) => mine && this.shake(amp),
        },
        fx, fy, at.x, at.z, DASH_MS, !!msg.bonus, sparkTexture(),
      );
      if (msg.bonus) setTimeout(() => this.floatText(target().setY(at.y + 1.4), 'x2!!', 'shout', 900), DASH_MS);
    } else if (skill.type === 'line' && a) {
      numbersFrom = 0;
      const fx = msg.fromX ?? a.x;
      const fy = msg.fromY ?? a.y;
      if (skill.shape === 'x') {
        xSlashWave(
          {
            scene: this.scene,
            camera: this.camera,
            add: (e) => this.effects.push(e),
            sparks: (at, color, n, speed) => this.burst(at, color, n, speed),
            sound: (big) => sfxFak(vol, big),
            shake: (amp) => mine && this.shake(amp),
          },
          fx, fy, msg.dirX ?? 0, msg.dirY ?? 1, skill.length ?? 5, skill.speed ?? 5, skill.width ?? 1.5, sparkTexture(),
        );
        if (mine) this.shake(0.2);
      } else {
        if (skill.cls === 'singer') {
          // เสียงสูง: a cannon of golden sound rings on a staff ribbon, sung as a big "อาาา!"
          a.performUntil = performance.now() + 900;
          highVoiceBeam(this.fxCtx(mine, (big) => (big ? sfxDiva(vol, true) : sfxMicBoom(vol, true))), fx, fy, msg.dirX ?? 0, msg.dirY ?? 1, skill.length ?? 5, skill.speed ?? 5, skill.width ?? 1.5);
          if (mine) this.shake(0.35);
        } else {
          this.wave(fx, fy, msg.dirX ?? 0, msg.dirY ?? 1, skill.length ?? 5, skill.speed ?? 5, skill.width ?? 1.5, c, false);
          if (mine) this.shake(0.35);
        }
      }
    } else if (id === 'root_note' && a) {
      // an emerald circle, a giant green chop out of the sky, jade spikes bursting out of the ground ("ดุ๊ม!")
      numbersFrom = 340;
      rootNoteChop(this.fxCtx(mine, (big) => sfxBassDrop(vol, big)), target, 300, sparkTexture());
    } else if (id === 'straight_beat' && a) {
      // three sub-bass beats: a huge emerald circle, equalizer bars, rings of jade spikes rolling out
      numbersFrom = 420;
      straightBeatQuake(this.fxCtx(mine, (big) => sfxBassDrop(vol, big)), a.x, a.y, skill.radius ?? 5, sparkTexture());
    } else if (id === 'hammer_on' && a) {
      // the ground smash, in red: a crimson circle, a flaming crescent out of the sky, cracks, flames, rocks ("ตึ้ง!")
      a.combo = 2;
      const hitMs = attackHit(a.cls, 2) * attackTime(a.cls) * 1000;
      numbersFrom = hitMs + 40;
      const p0 = target();
      let kx = p0.x - a.x;
      let kz = p0.z - a.y;
      const kl = Math.hypot(kx, kz) || 1;
      kx /= kl;
      kz /= kl;
      hammerOnBlast(
        {
          scene: this.scene,
          camera: this.camera,
          add: (e) => this.effects.push(e),
          sparks: (p, color, n, speed) => this.burst(p, color, n, speed),
          sound: (big) => sfxHammer(vol, big),
          shake: (amp) => mine && this.shake(amp),
        },
        target, kx, kz, hitMs, sparkTexture(),
      );
    } else if (id === 'ear_training' && a) {
      // the big golden mic slams down: circle, spotlight, pillar of light, rolling sound rings, rays, a star storm
      numbersFrom = 420;
      a.attack = 1;
      a.combo = 0;
      const t0 = target();
      const kl = Math.hypot(t0.x - a.x, t0.z - a.y) || 1;
      const kx = (t0.x - a.x) / kl;
      const kz = (t0.z - a.y) / kl;
      setTimeout(() => this.micThrow(new THREE.Vector3(a.x, 1.45, a.y), target, 260, SG.gold, () => earTrainingBlast(this.fxCtx(mine, (big) => sfxMicBoom(vol, big)), target(), kx, kz), 1.8), 280);
    } else if (id === 'dynamics' && a) {
      // two golden mics in quick succession, each lands under a spotlight in stars and rings of sound
      numbersFrom = 420;
      numberGap = 230;
      sfxDiva(vol * 0.6, false);
      for (let i = 0; i < 2; i++) {
        setTimeout(() => {
          a.attack = 1;
          a.combo = 0;
          setTimeout(() => this.micThrow(new THREE.Vector3(a.x, 1.45, a.y), target, 230, SG.gold, () => dynamicsHit(this.fxCtx(mine, (big) => sfxMicBoom(vol, big)), target(), i === 1), 1.4), 280);
        }, i * 230);
      }
    } else if (id === 'bending' && a) {
      // a red fire storm whirling up round the guitarist
      bendingStorm(this.fxCtx(mine, (big) => sfxBend(vol, big)), () => new THREE.Vector3(a.x, 0, a.y), skill.radius ?? 2, sparkTexture());
    } else if (id === 'palm_muting' && a) {
      // a red ring goes out 12 tiles, red lightning hooks every monster it catches and drags them in
      numbersFrom = 200;
      const targets = (msg.pulled ?? []).map((mid) => {
        const m = this.monsters.get(mid);
        const last = m ? new THREE.Vector3(m.x, 0, m.y) : new THREE.Vector3(a.x, 0, a.y);
        return () => {
          const mm = this.monsters.get(mid);
          if (mm) last.set(mm.x, 0, mm.y);
          return last.clone();
        };
      });
      palmMuting(this.fxCtx(mine, (big) => sfxPalmMute(vol, big)), () => new THREE.Vector3(a.x, 0, a.y), skill.radius ?? 12, targets, sparkTexture());
    } else if (isBuff) {
      for (const sid of msg.allies ?? [msg.by]) {
        const t = this.players.get(sid);
        if (!t) continue;
        this.buffFx(t, id, c);
      }
    }
    msg.hits.forEach((h, i) => {
      setTimeout(() => {
        const m = h.m ? this.monsters.get(h.m) : undefined;
        if (!m && h.p) return this.playerNumber(h.p, h.dmg, msg.by, i, c);
        if (!m) return;
        this.floatText(this.top(m).add(new THREE.Vector3(0, (i % 4) * 0.1, 0)), String(h.dmg), msg.by === this.room.sessionId ? 'skill' : 'other');
        this.flash(m.rig.root, c);
        m.anim?.hit();
      }, h.at !== undefined ? h.at + 60 : numbersFrom + i * numberGap);
    });
  }

  /** The keyboardist's skills in blue (keyfx.ts): falling notes, healing light, buffs, the shield and ชุบชีวิต. */
  private keyboardFx(a: PlayerActor | undefined, msg: { by: string; skill: string; x: number; y: number; target?: string; allies?: string[]; hits: { m?: string; p?: string; dmg: number; at?: number }[] }) {
    const id = msg.skill;
    const skill = SKILLS[id];
    const mine = a === this.me;
    const vol = this.vol(msg.x, msg.y, mine);
    if (a) {
      this.floatText(new THREE.Vector3(a.x, 2.2, a.y), `${skill.name}!!`, 'shout', 1100);
      this.face(a, msg.x, msg.y);
      a.attack = 1;
      a.combat = COMBAT_TIME;
      a.ready = READY_TIME;
    }
    const follow = (t: PlayerActor) => () => new THREE.Vector3(t.x, 0, t.y);
    if (skill.waves) {
      const waves = skill.waves;
      noteRainStrike(this.fxCtx(mine, () => {}), msg.x, msg.y, skill.radius ?? 1.5, waves, skill.waveMs ?? 300, (i) => sfxNoteFall(vol, i === waves - 1));
    } else if (skill.type === 'heal_target' || skill.type === 'revive') {
      const t = this.players.get(msg.target ?? '') ?? a;
      if (t) {
        const big = skill.type === 'revive';
        const ctx = this.fxCtx(mine, (b) => sfxKeySpell(big ? 'revive' : 'heal', vol, b));
        if (big) reviveFx(ctx, follow(t));
        else restoreFx(ctx, follow(t));
      }
    } else if (skill.type === 'buff_party') {
      const kind = ({ tempo: 'tempo', control: 'control', solo_star: 'solo', shield: 'shield' } as const)[skill.fx as 'tempo'] ?? 'tempo';
      const draw = { tempo: tempoFx, control: controlFx, solo: soloFx, shield: chorusFx }[kind];
      let first = true;
      for (const sid of msg.allies ?? [msg.by]) {
        const t = this.players.get(sid);
        if (!t) continue;
        // one sound for the whole party
        const play = first;
        first = false;
        draw(this.fxCtx(mine, (b) => play && sfxKeySpell(kind, vol, b)), follow(t));
        this.keyboardAura(t, (skill.buff?.durationSec ?? 30) * 1000);
      }
    }
    msg.hits.forEach((h, i) => {
      setTimeout(() => {
        if (h.m) {
          const m = this.monsters.get(h.m);
          if (!m) return;
          this.floatText(this.top(m).add(new THREE.Vector3(0, (i % 4) * 0.1, 0)), String(h.dmg), msg.by === this.room.sessionId ? 'skill' : 'other');
          this.flash(m.rig.root, 0x38d4ff);
          m.anim?.hit();
        } else if (h.p) this.playerNumber(h.p, h.dmg, msg.by, i, 0x38d4ff);
      }, h.at !== undefined ? h.at + 40 : skill.type === 'revive' ? 700 : 300 + i * 110);
    });
  }

  /** Player id -> their keyboardist-buff aura and when it ends (one aura per player, a new buff stretches it). */
  private keyAuras = new Map<string, { until: number }>();

  /** The blue aura round a player for as long as a keyboardist buff lasts on them. */
  private keyboardAura(t: PlayerActor, ms: number) {
    const until = performance.now() + ms;
    const cur = this.keyAuras.get(t.id);
    if (cur) {
      cur.until = Math.max(cur.until, until);
      return;
    }
    const me = { until };
    this.keyAuras.set(t.id, me);
    keyAura(this.fxCtx(false, () => {}), () => new THREE.Vector3(t.x, 0, t.y), () => {
      const ok = this.keyAuras.get(t.id) === me && !t.dead && this.players.get(t.id) === t && performance.now() < me.until;
      if (!ok && this.keyAuras.get(t.id) === me) this.keyAuras.delete(t.id);
      return ok;
    });
  }

  /** Player id -> when each of their bass buffs ends (one green aura per player, showing the buffs that are on). */
  private bassAuras = new Map<string, { guard: number; reflect: number; regen: number }>();

  /** The green aura round a bassist while any of their buffs lasts (bassfx.ts). */
  private bassAura(t: PlayerActor, kind: 'guard' | 'reflect' | 'regen', ms: number) {
    const until = performance.now() + ms;
    const cur = this.bassAuras.get(t.id);
    if (cur) {
      cur[kind] = Math.max(cur[kind], until);
      return;
    }
    const me = { guard: 0, reflect: 0, regen: 0 };
    me[kind] = until;
    this.bassAuras.set(t.id, me);
    const end = () => Math.max(me.guard, me.reflect, me.regen);
    bassAura(
      this.fxCtx(false, () => {}),
      () => new THREE.Vector3(t.x, 0, t.y),
      () => {
        const ok = this.bassAuras.get(t.id) === me && !t.dead && this.players.get(t.id) === t && performance.now() < end();
        if (!ok && this.bassAuras.get(t.id) === me) this.bassAuras.delete(t.id);
        return ok;
      },
      () => {
        const n = performance.now();
        return { guard: n < me.guard, reflect: n < me.reflect, regen: n < me.regen };
      },
      sparkTexture(),
    );
  }

  /** The context the big skill effects in xslash.ts / guitarfx.ts draw with. */
  private fxCtx(mine: boolean, sound: (big: boolean) => void) {
    return {
      scene: this.scene,
      camera: this.camera,
      add: (e: (dt: number) => boolean) => this.effects.push(e),
      sparks: (p: THREE.Vector3, color: number, n: number, speed: number) => this.burst(p, color, n, speed),
      sound,
      shake: (amp: number) => mine && this.shake(amp),
    };
  }

  /** The look of each buff on the player who got it. */
  private buffFx(t: PlayerActor, id: string, c: number) {
    if (id === 'vibrato') {
      // a red aura with red notes circling the guitarist for the whole buff
      const vol = this.vol(t.x, t.y, t === this.me);
      vibratoAura(
        {
          scene: this.scene,
          camera: this.camera,
          add: (e) => this.effects.push(e),
          sparks: (p, color, n, speed) => this.burst(p, color, n, speed),
          sound: (big) => sfxVibrato(vol, big),
          shake: () => {},
        },
        () => new THREE.Vector3(t.x, 0, t.y),
        () => !t.dead && this.players.get(t.id) === t,
        SKILLS.vibrato.buff?.durationSec ?? 30,
        sparkTexture(),
        (g) => glyphTexture(g, '#ff2a14', 'rgba(70,0,0,0.95)'),
      );
      return;
    }
    const bassKind = ({ kick_drum: 'guard', lift_beat: 'reflect', push_note: 'regen' } as const)[id as 'kick_drum'];
    if (bassKind) {
      // the bassist's buffs: a green cast burst, then the green aura for as long as the buff lasts
      const vol = this.vol(t.x, t.y, t === this.me);
      bassBuffCast(this.fxCtx(t === this.me, () => sfxBassBuff(vol)), () => new THREE.Vector3(t.x, 0, t.y), bassKind, sparkTexture());
      this.bassAura(t, bassKind, (SKILLS[id]?.buff?.durationSec ?? 30) * 1000);
      return;
    }
    if (id === 'warm_up' || id === 'enunciation') {
      // the singer's buffs: a golden circle, a spotlight, a pillar of light and notes swirling up
      const vol = this.vol(t.x, t.y, t === this.me);
      singerBuff(this.fxCtx(t === this.me, () => sfxDiva(vol * 0.8, false)), () => new THREE.Vector3(t.x, 0, t.y), id === 'warm_up' ? SG.light : SG.pink);
      return;
    }
    this.pillar(t.x, t.y, c, 0.6, 3.2);
    this.ring(t.x, t.y, 1.8, c);
    this.notes(t, c);
    this.sparkle(t, c);
  }

  /** The cast of เสียงสูง: a bar over the head, a pulsing circle under the feet, singing. */
  private castFx(a: PlayerActor, skill: { cls: ClassKey | 'all'; name: string }, ms: number) {
    const c = this.fxColor(clsOf(skill));
    if (a.cast) a.cast.bar.remove();
    // the cast bar: a dark framed slot under the name that fills up green
    const bar = document.createElement('div');
    bar.className = 'wcast';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    a.label.el.appendChild(bar);
    const start = performance.now();
    const vol = () => this.vol(a.x, a.y, a === this.me);
    sfxWheet(vol());
    let lastWheet = 0;
    a.cast = { start, ms, bar, fill };
    a.performUntil = start + ms;
    a.combat = COMBAT_TIME;
    a.ready = READY_TIME;
    this.floatText(new THREE.Vector3(a.x, 2.2, a.y), `${skill.name}...`, 'shout', 1200);
    const circle = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 6, 1), new THREE.MeshBasicMaterial({ color: c, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(c) }));
    circle.rotation.x = -Math.PI / 2;
    circle.visible = skill.cls !== 'keyboardist'; // the keyboardist casts on its own blue circle (keyfx)
    this.scene.add(circle);
    let tt = 0;
    let lastNote = 0;
    this.effects.push((dt) => {
      tt += dt;
      circle.position.set(a.x, 0.05, a.y);
      circle.rotation.z += dt * 1.5;
      circle.scale.setScalar(1.2 + Math.sin(tt * 8) * 0.12 + tt * 0.15);
      (circle.material as THREE.MeshBasicMaterial).opacity = 0.8;
      if (tt - lastNote > 0.35) {
        lastNote = tt;
        this.notes(a, c, 2);
      }
      // "วีด" keeps whistling softly while the spell charges
      if (tt - lastWheet > 0.45 && a.cast?.start === start && performance.now() - start < ms - 300) {
        lastWheet = tt;
        sfxWheet(vol(), 0, true);
      }
      if (!a.cast || a.cast.start !== start) {
        this.scene.remove(circle);
        circle.geometry.dispose();
        (circle.material as THREE.Material).dispose();
        return false;
      }
      return true;
    });
  }

  /** A spinning microphone flying in an arc to wherever `to()` is when it arrives, with a coloured trail. */
  private micThrow(from: THREE.Vector3, to: () => THREE.Vector3, ms: number, color: number, done: () => void, size = 1) {
    const mic = new THREE.Group();
    mic.add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.24, 8), new THREE.MeshBasicMaterial({ color: 0x222222 })));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xd8dde3 }));
    head.position.y = 0.15;
    mic.add(head);
    mic.scale.setScalar(size * 1.3);
    const glow = this.sprite(sparkTexture(), 0.6 * size, color, true);
    this.scene.add(mic);
    const end = to().clone();
    let t = 0;
    let trail = 0;
    this.effects.push((dt) => {
      t += (dt * 1000) / ms;
      const k = Math.min(1, t);
      end.lerp(to(), 0.3);
      mic.position.lerpVectors(from, end, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 0.6, 0));
      mic.rotation.x += dt * 25;
      mic.rotation.z += dt * 9;
      glow.position.copy(mic.position);
      trail += dt;
      if (trail > 0.025) {
        trail = 0;
        const s = this.sprite(sparkTexture(), 0.35 * size, color, true);
        s.position.copy(mic.position);
        let f = 0;
        this.effects.push((d2) => {
          f += d2 / 0.3;
          s.material.opacity = Math.max(0, 0.8 * (1 - f));
          s.scale.setScalar(0.35 * size * (1 - f * 0.6));
          if (f >= 1) this.scene.remove(s);
          return f < 1;
        });
      }
      if (t >= 1) {
        this.scene.remove(mic, glow);
        mic.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        done();
        return false;
      }
      return true;
    });
  }

  /**
   * A sound wave travelling from (fx,fy) along (dx,dy) for `length` tiles at `speed` tiles/s: arcs of sound
   * (เสียงสูง) or a big spinning X (คลื่นเสียงทำลาย), leaving a glowing track on the ground.
   */
  private wave(fx: number, fy: number, dx: number, dy: number, length: number, speed: number, width: number, color: number, x: boolean) {
    const yaw = Math.atan2(dx, dy);
    const g = new THREE.Group();
    const mats: THREE.MeshBasicMaterial[] = [];
    const mat = (c: number, o = 0.9) => {
      const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(c) });
      mats.push(m);
      return m;
    };
    const geos: THREE.BufferGeometry[] = [];
    if (x) {
      // two crossed bars of sound standing up, plus their glow
      for (const [w, c] of [[0.5, color], [0.18, 0xffffff]] as const) {
        for (const r of [Math.PI / 4, -Math.PI / 4]) {
          const geo = new THREE.PlaneGeometry(width * 1.3, w);
          geos.push(geo);
          const m = new THREE.Mesh(geo, mat(c));
          m.rotation.z = r;
          g.add(m);
        }
      }
      g.position.y = 1.0;
    } else {
      // three nested arcs facing the way it goes
      for (let i = 0; i < 3; i++) {
        const geo = crescentGeometry(width * (0.6 + i * 0.25), 0.25, Math.PI * 0.7);
        geos.push(geo);
        const m = new THREE.Mesh(geo, mat(i === 1 ? 0xffffff : color));
        m.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
        m.position.z = -i * 0.35;
        g.add(m);
      }
      g.position.y = 0.9;
    }
    const core = this.sprite(sparkTexture(), width * 1.6, color, true);
    core.material.depthTest = false;
    g.rotation.y = yaw;
    this.scene.add(g);
    // ground track
    const trackGeo = new THREE.PlaneGeometry(width * 0.8, 1);
    const track = new THREE.Mesh(trackGeo, mat(color, 0.5));
    track.rotation.order = 'YXZ';
    track.rotation.set(-Math.PI / 2, yaw, 0);
    this.scene.add(track);
    const dur = length / speed;
    let t = 0;
    let puff = 0;
    this.effects.push((dt) => {
      t += dt;
      const k = Math.min(1, t / dur);
      const d = 0.6 + k * length;
      g.position.x = fx + dx * d;
      g.position.z = fy + dy * d;
      if (x) g.children.forEach((c) => (c.rotation.z += dt * 3 * Math.sign(c.rotation.z || 1)));
      else g.scale.setScalar(0.7 + k * 0.6);
      core.position.copy(g.position);
      core.material.opacity = 0.7;
      track.scale.y = d;
      track.position.set(fx + (dx * d) / 2, 0.06, fy + (dy * d) / 2);
      puff += dt;
      if (puff > 0.06) {
        puff = 0;
        this.burst(g.position.clone(), color, 3, 2);
      }
      const fade = t > dur ? 1 - (t - dur) / 0.35 : 1;
      for (const m of mats) m.opacity = Math.max(0, (m === track.material ? 0.45 : 0.9) * fade);
      core.material.opacity = Math.max(0, 0.7 * fade);
      if (fade <= 0) {
        this.scene.remove(g, track, core);
        geos.forEach((geo) => geo.dispose());
        trackGeo.dispose();
        mats.forEach((m) => m.dispose());
        return false;
      }
      return true;
    });
    // the end: a burst where the wave dies out
    setTimeout(() => {
      const end = new THREE.Vector3(fx + dx * (length + 0.6), 0.9, fy + dy * (length + 0.6));
      this.glow(end, color, 4, 300);
      this.burst(end, color, 24, 5);
    }, dur * 1000);
  }

  /** A swirling aura round a player for `seconds`: a glowing haze plus sparks streaming up and spiralling. */
  private aura(a: PlayerActor, color: number, seconds: number) {
    const haze = this.sprite(sparkTexture(), 2.6, color, false);
    haze.material.depthTest = false;
    let t = 0;
    let spawn = 0;
    this.effects.push((dt) => {
      t += dt;
      const fade = Math.min(1, t / 0.15) * Math.min(1, (seconds - t) / 0.3);
      haze.position.set(a.x, 0.95, a.y);
      haze.scale.setScalar(2.4 + Math.sin(t * 14) * 0.15);
      haze.material.opacity = Math.max(0, 0.55 * fade);
      spawn += dt;
      while (spawn > 0.03) {
        spawn -= 0.03;
        const s = this.sprite(sparkTexture(), 0.3, color, false);
        const ang = Math.random() * Math.PI * 2;
        const r = 0.5 + Math.random() * 0.3;
        let f = 0;
        this.effects.push((d2) => {
          f += d2 / 0.7;
          const an = ang + f * 4;
          s.position.set(a.x + Math.cos(an) * r, 0.1 + f * 2.2, a.y + Math.sin(an) * r);
          s.material.opacity = Math.max(0, 0.9 * (1 - f));
          if (f >= 1) this.scene.remove(s);
          return f < 1;
        });
      }
      if (t >= seconds) {
        this.scene.remove(haze);
        return false;
      }
      return true;
    });
  }

  /** A column of light rising out of the ground. */
  private pillar(x: number, y: number, color: number, radius: number, height: number) {
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 1.15, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(color) }),
    );
    this.scene.add(m);
    let t = 0;
    this.effects.push((dt) => {
      t += dt / 0.9;
      const h = Math.max(0.01, Math.min(1, t * 2) * height);
      m.position.set(x, h / 2, y);
      m.scale.set(1 - t * 0.3, h, 1 - t * 0.3);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
      if (t >= 1) {
        this.scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      return t < 1;
    });
  }

  /** Music notes floating up round a player. */
  private notes(a: PlayerActor, color: number, n = 6) {
    const css = `#${new THREE.Color(color).getHexString()}`;
    for (let i = 0; i < n; i++) {
      const s = this.sprite(glyphTexture(['♪', '♫', '♬'][i % 3], css, 'rgba(255,255,255,0.85)'), 0.45);
      const ang = Math.random() * Math.PI * 2;
      let t = -i * 0.08;
      this.effects.push((dt) => {
        t += dt;
        const k = Math.max(0, t);
        s.visible = t >= 0;
        s.position.set(a.x + Math.cos(ang + k * 2) * 0.7, 0.6 + k * 1.6, a.y + Math.sin(ang + k * 2) * 0.7);
        s.material.opacity = Math.max(0, 1 - k / 1.1);
        if (t > 1.1) this.scene.remove(s);
        return t <= 1.1;
      });
    }
  }

  /** A puff of smoke: hiding, or showing up again. */
  private smoke(x: number, y: number, color: number) {
    this.glow(new THREE.Vector3(x, 1, y), color, 4, 350);
    for (let i = 0; i < 18; i++) {
      const s = this.sprite(sparkTexture(), 0.6, i % 3 ? color : 0x444466, false);
      const ang = (i / 18) * Math.PI * 2;
      let t = 0;
      this.effects.push((dt) => {
        t += dt / 0.8;
        s.position.set(x + Math.cos(ang) * t * 1.4, 0.3 + t * 1.2 + Math.sin(i) * 0.3, y + Math.sin(ang) * t * 1.4);
        s.scale.setScalar(0.6 + t * 0.9);
        s.material.opacity = Math.max(0, 0.75 * (1 - t));
        if (t >= 1) this.scene.remove(s);
        return t < 1;
      });
    }
  }

  /** While hidden, our own character trails purple haze so we know it's working. */
  private hideAura(a: PlayerActor) {
    if (a !== this.me) return;
    const c = this.fxColor('drummer');
    let t = 0;
    this.effects.push((dt) => {
      t += dt;
      if (t > 0.12) {
        t = 0;
        const s = this.sprite(sparkTexture(), 0.5, c, true);
        const off = new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.2 + Math.random() * 1.4, (Math.random() - 0.5) * 0.7);
        let f = 0;
        this.effects.push((d2) => {
          f += d2 / 0.7;
          s.position.set(a.x + off.x, off.y + f * 0.4, a.y + off.z);
          s.material.opacity = Math.max(0, 0.5 * (1 - f));
          if (f >= 1) this.scene.remove(s);
          return f < 1;
        });
      }
      return !!a.hidden && this.players.get(a.id) === a;
    });
  }

  /** A ring that closes in on (x,y) from `radius` (Palm muting pulling monsters in). */
  private implode(x: number, y: number, radius: number, color: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 64),
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(color) }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.07, y);
    this.scene.add(m);
    let t = 0;
    this.effects.push((dt) => {
      t += dt / 0.6;
      m.scale.setScalar(Math.max(0.3, radius * (1 - t)));
      (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, t * 3) * (1 - t * 0.5);
      if (t >= 1) {
        this.scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      return t < 1;
    });
  }

  /** A flash of light between two actors (pulled monster, Kick Drum, a reflected hit). */
  private tether(a: { x: number; y: number }, b: { x: number; y: number }, color: number) {
    const from = new THREE.Vector3(a.x, 1, a.y);
    const to = new THREE.Vector3(b.x, 1, b.y);
    const len = from.distanceTo(to);
    if (len < 0.1) return;
    const geo = new THREE.CylinderGeometry(0.05, 0.05, len, 6, 1, true);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, blending: blendFor(color) }));
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    this.scene.add(m);
    let t = 0;
    this.effects.push((dt) => {
      t += dt / 0.35;
      (m.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - t);
      m.scale.set(1 + t * 2, 1, 1 + t * 2);
      if (t >= 1) {
        this.scene.remove(m);
        geo.dispose();
        (m.material as THREE.Material).dispose();
      }
      return t < 1;
    });
  }

  // ------------------------------------------------------------ Teen blade skills

  /** Teen attack skills: steel-white crescents, shockwaves and a "ฉับ!" instead of the generic skill burst. */
  private bladeFx(a: PlayerActor, msg: { skill: string; x: number; y: number; fromX?: number; fromY?: number; hits: { m?: string; dmg: number }[] }, mine: boolean) {
    const skill = SKILLS[msg.skill];
    const vol = this.vol(a.x, a.y, mine);
    const steel = 0xdff4ff;
    const accent = new THREE.Color(CLASSES[clsOf(skill)].color).getHex();
    const hitAt = (id?: string) => {
      const m = id ? this.monsters.get(id) : undefined;
      const f = !m && id ? this.players.get(id) : undefined;
      return m ? new THREE.Vector3(m.x, m.rig.height * 0.5, m.y) : f ? new THREE.Vector3(f.x, 0.85, f.y) : new THREE.Vector3(msg.x, 0.7, msg.y);
    };
    if (skill.scale === 'distance') {
      // พุ่งแทง: a wind streak along the dash, then an X of crescents and a shockwave where the blade lands
      const fx = msg.fromX ?? a.x;
      const fy = msg.fromY ?? a.y;
      this.streak(fx, fy, msg.x, msg.y, accent);
      this.ring(fx, fy, 0.9, 0xffffff);
      setTimeout(() => {
        const at = hitAt(msg.hits[0]?.m);
        sfxSlash(vol, true);
        this.crescent(at, 0.75, 2.8, steel, 300);
        this.crescent(at, -0.75, 2.8, accent, 340, 70);
        this.glow(at, 0xffffff, 5, 260);
        this.ring(at.x, at.z, 2.6, accent);
        setTimeout(() => this.ring(at.x, at.z, 3.4, 0xffffff), 120);
        this.burst(at, steel, 36, 7);
        this.pixelFx('stab_hit', { at: () => at, scale: 3 });
        this.floatText(at.clone().setY(at.y + 1.3), 'ฉับ!', 'shout', 800);
        if (mine) this.shake(0.35);
      }, DASH_MS);
    } else if (skill.type === 'aoe_self') {
      // หมุนตัวแทง: three rings of blades spinning up around you like a whirlwind, every monster gets cut
      sfxWhirl(vol);
      const r = skill.radius ?? 2;
      for (let i = 0; i < 3; i++) this.whirlRing(a, 0.3 + i * 0.6, r * (0.9 + i * 0.25), i % 2 ? accent : steel, i * 70);
      this.ring(a.x, a.y, r + 0.4, accent);
      setTimeout(() => this.ring(a.x, a.y, r + 0.8, 0xffffff), 180);
      this.burst(new THREE.Vector3(a.x, 0.4, a.y), steel, 40, 7);
      this.glow(new THREE.Vector3(a.x, 1, a.y), 0xffffff, 4, 300);
      if (mine) this.shake(0.25);
      msg.hits.forEach((h, i) => {
        if (!h.m) return;
        setTimeout(() => {
          const at = hitAt(h.m);
          this.crescent(at, (i % 2 ? 1 : -1) * 0.6, 1.8, steel, 260);
          this.pixelFx('stab_hit', { at: () => at, scale: 2 });
        }, 200 + i * 110);
      });
    } else {
      // ฟันฉับไว (and any other Teen single-target skill): a cut per hit, crossing
      const n = Math.max(1, Math.min(3, skill.hits ?? 1));
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          const at = hitAt(msg.hits[0]?.m);
          sfxSlash(vol);
          this.crescent(at, i % 2 ? -0.7 : 0.7, 2.1, i % 2 ? accent : steel, 260);
          this.glow(at, 0xffffff, 3, 180);
          this.burst(at, steel, 12, 4);
          this.pixelFx('slash', { at: () => at.clone().setY(at.y * 0.6), scale: 2.2, flip: i % 2 === 1 });
          if (mine && i === n - 1) this.shake(0.15);
        }, 120 + i * 130);
      }
    }
  }

  private shake(amp: number) {
    this.shakeAmp = this.shakeT > 0 ? Math.max(amp, this.shakeAmp) : amp;
    this.shakeT = 0.35;
  }

  /** A tapered crescent (thick middle, sharp tips) facing the camera, tilted by `tilt` radians, that sweeps and fades. */
  private crescent(at: THREE.Vector3, tilt: number, radius: number, color: number, ms: number, delay = 0) {
    const geo = crescentGeometry(radius, radius * 0.28, Math.PI * 0.95);
    const mats = [color, 0xffffff].map((c, i) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: i ? 0.9 : 0.85, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(c) }));
    const g = new THREE.Group();
    const outer = new THREE.Mesh(geo, mats[0]);
    const core = new THREE.Mesh(crescentGeometry(radius * 0.97, radius * 0.08, Math.PI * 0.9), mats[1]);
    g.add(outer, core);
    g.position.copy(at);
    g.visible = false;
    this.scene.add(g);
    let t = -delay / ms;
    this.effects.push((dt) => {
      t += (dt * 1000) / ms;
      if (t < 0) return true;
      g.visible = true;
      g.quaternion.copy(this.camera.quaternion);
      g.rotateZ(tilt - Math.PI * 0.45 + t * 1.2);
      g.scale.setScalar(0.6 + Math.min(1, t) * 0.6);
      mats[0].opacity = 0.85 * (1 - t);
      mats[1].opacity = 0.9 * (1 - t);
      if (t >= 1) {
        this.scene.remove(g);
        geo.dispose();
        core.geometry.dispose();
        mats.forEach((m) => m.dispose());
      }
      return t < 1;
    });
  }

  /** A horizontal ring of blade arcs spinning round a player (หมุนตัวแทง). */
  private whirlRing(a: PlayerActor, height: number, radius: number, color: number, delay: number) {
    const geos = [0, 1, 2].map(() => crescentGeometry(radius, radius * 0.22, Math.PI * 0.55));
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(color) });
    const g = new THREE.Group();
    geos.forEach((geo, i) => {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.order = 'YXZ';
      m.rotation.y = (i * Math.PI * 2) / 3;
      g.add(m);
    });
    g.visible = false;
    this.scene.add(g);
    let t = -delay / 650;
    this.effects.push((dt) => {
      t += dt / 0.65;
      if (t < 0) return true;
      g.visible = true;
      g.position.set(a.rig.root.position.x, height + t * 0.4, a.rig.root.position.z);
      g.rotation.y -= dt * 22;
      g.scale.setScalar(0.5 + Math.min(1, t) * 0.7);
      mat.opacity = 0.9 * Math.min(1, (1 - t) * 2);
      if (t >= 1) {
        this.scene.remove(g);
        geos.forEach((geo) => geo.dispose());
        mat.dispose();
      }
      return t < 1;
    });
  }

  /** A wind streak on the ground and at chest height from (fx,fy) to (tx,ty): พุ่งแทง's trail. */
  private streak(fx: number, fy: number, tx: number, ty: number, color: number) {
    const len = Math.hypot(tx - fx, ty - fy);
    if (len < 0.2) return;
    const parts = [0.5, 1.0, 1.4].map((h, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(len, i === 1 ? 0.5 : 0.18),
        new THREE.MeshBasicMaterial({ color: i === 1 ? color : 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: blendFor(i === 1 ? color : 0xffffff) }),
      );
      m.position.set((fx + tx) / 2, h, (fy + ty) / 2);
      m.rotation.order = 'YXZ';
      m.rotation.y = -Math.atan2(ty - fy, tx - fx);
      m.rotation.x = i === 1 ? -Math.PI / 2 : 0;
      if (i === 1) m.position.y = 0.06;
      this.scene.add(m);
      return m;
    });
    for (let i = 1; i <= 6; i++) {
      const k = i / 7;
      setTimeout(() => this.burst(new THREE.Vector3(fx + (tx - fx) * k, 0.5, fy + (ty - fy) * k), 0xffffff, 4, 1.5), (i * DASH_MS) / 7);
    }
    let t = 0;
    this.effects.push((dt) => {
      t += dt / 0.45;
      for (const m of parts) {
        (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
        m.scale.y = 1 - t * 0.7;
      }
      if (t >= 1) parts.forEach((m) => {
        this.scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      });
      return t < 1;
    });
  }

  /** A quick bright flash (a big additive spark) at a hit. */
  private glow(at: THREE.Vector3, color: number, size: number, ms: number) {
    const s = this.sprite(sparkTexture(), size, color, true);
    s.material.depthTest = false; // a big glow would be cut off flat where it meets the ground
    s.position.copy(at);
    let t = 0;
    this.effects.push((dt) => {
      t += (dt * 1000) / ms;
      s.scale.setScalar(size * (0.6 + t * 0.8));
      s.material.opacity = Math.max(0, 1 - t);
      if (t >= 1) this.scene.remove(s);
      return t < 1;
    });
  }

  /** A baked pixelfx skill effect (src/three/pixelfx.ts), added to the effect list once its sheet is known. */
  private pixelFx(name: string, o: FxOptions) {
    void playFx(this.scene, name, o).then((fx) => fx && this.effects.push(fx));
  }

  private sparkle(a: PlayerActor, color: number) {
    for (let i = 0; i < 10; i++) {
      const s = this.sprite(sparkTexture(), 0.25, color, true);
      const off = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.2, (Math.random() - 0.5) * 0.6);
      let t = -i * 0.04;
      this.effects.push((dt) => {
        t += dt;
        s.position.set(a.x + off.x, off.y + Math.max(0, t) * 2, a.y + off.z);
        s.material.opacity = Math.max(0, 1 - t / 0.7);
        if (t > 0.7) this.scene.remove(s);
        return t <= 0.7;
      });
    }
  }

  /** The MVP banner: a pink-red starburst with a big "MVP" pops up over the player who did the most damage. */
  private mvpFx(sid: string, name: string) {
    const a = this.players.get(sid);
    if (!a) return;
    sfxMvp(this.vol(a.x, a.y, a === this.me) || 0.35);
    const el = document.createElement('div');
    el.className = 'mvpb';
    el.innerHTML = `<div class="mvpb-in"><i class="b1"></i><i class="b2"></i><b>MVP</b><small>${escapeHtml(name)}</small></div>`;
    this.overlay.appendChild(el);
    this.levelFx(a, '', 0xff4fa0);
    this.burst(new THREE.Vector3(a.x, 2.2, a.y), 0xffd23a, 30, 4);
    const born = this.now;
    const life = 5000;
    this.effects.push(() => {
      const live = this.players.get(sid) === a && this.now - born < life;
      if (!live) {
        el.remove();
        return false;
      }
      this.place(el, new THREE.Vector3(a.x, 2.35, a.y));
      if (this.now - born > life - 500) el.classList.add('out');
      return true;
    });
  }

  private levelFx(a: PlayerActor, text: string, color: number) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(pillar);
    let t = 0;
    this.effects.push((dt) => {
      t += dt / 1.1;
      pillar.position.set(a.x, (t * 4) / 2, a.y);
      pillar.scale.set(1, Math.max(0.01, t * 4), 1);
      (pillar.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
      if (t >= 1) this.scene.remove(pillar);
      return t < 1;
    });
    this.burst(new THREE.Vector3(a.x, 1, a.y), color, 24);
    if (text) this.floatText(new THREE.Vector3(a.x, 2.4, a.y), text, 'level', 1600);
  }

  // ------------------------------------------------------------ for the HUD

  minimapDots() {
    const others: { x: number; y: number }[] = [];
    for (const a of this.players.values()) if (a !== this.me && !a.hidden) others.push({ x: a.x, y: a.y });
    const monsters: { x: number; y: number; key: string }[] = [];
    for (const m of this.monsters.values()) if (!m.dead) monsters.push({ x: m.x, y: m.y, key: m.key });
    return { me: { x: this.me.x, y: this.me.y }, others, monsters };
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    renderer!.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

/** A crescent in the XY plane: an arc of `angle` radians, `width` thick at the middle, tapering to points. */
function crescentGeometry(radius: number, width: number, angle: number) {
  const n = 28;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const th = -angle / 2 + u * angle;
    const w = width * Math.sin(Math.PI * u);
    pos.push(Math.cos(th) * radius, Math.sin(th) * radius, 0, Math.cos(th) * (radius - w), Math.sin(th) * (radius - w), 0);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

function lookKey(rp: RemotePlayer) {
  return `${rp.cls}_${rp.gender}_${rp.hair}_${rp.hairColor}_${rp.face}_${outfitOf(rp.body)}_${vrmHatOf(rp.head)}_${gearOf(rp)}`;
}

/** What a player looks like: their own appearance, or the model of the outfit they wear. */
function lookOf(rp: RemotePlayer): Look {
  return { cls: rp.cls as ClassKey, gender: rp.gender as 'm' | 'f', hair: rp.hair, hair_color: rp.hairColor, face: rp.face, outfit: outfitOf(rp.body) || undefined, gear: gearOf(rp) || undefined };
}

/** The look of the MVP instrument a player carries ('' = the standard one), when it fits their class. */
function gearOf(rp: RemotePlayer) {
  const it = ITEMS[rp.weapon];
  return it?.shape && it.classes?.includes(rp.cls as ClassKey) ? it.shape : '';
}
