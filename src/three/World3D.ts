import * as THREE from 'three';
import type { Room } from '@colyseus/sdk';
import { CLASSES, ClassKey, MONSTERS, SKILLS, skillSp } from '../data';
import { findPath, GameMap, Npc, walkable } from '../game/maps';
import type { Session } from '../game/session';
import { escapeHtml } from '../ui/screens';
import { animateMonster, buildCharacter, buildMonster, CharRig, Look, MonsterRig, setHat } from './models';
import { animateRig, buildVrmCharacter } from './vrm';
import { buildGround, buildPortal, buildProps } from './props';
import { glyphTexture, sparkTexture } from './toon';

const TILE_PX = 32; // derived.moveSpeed is pixels/second at this tile size (same as the server)
const MOVE_SEND_MS = 100;

export interface WorldHooks {
  system(text: string): void;
  toast(text: string, kind?: 'good' | 'bad'): void;
  talk(npc: Npc): void;
  playerMenu(sessionId: string, name: string, x: number, y: number): void;
  death(dead: boolean): void;
  targeting(skillName: string | null): void;
}

interface RemotePlayer {
  name: string; cls: string; level: number; gender: string; hair: number; hairColor: number; face: number; head: string;
  x: number; y: number; hp: number; maxHp: number; sp: number; maxSp: number; dead: boolean; sitting: boolean;
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
  dead: boolean;
  sitting: boolean;
  hp: number;
  maxHp: number;
  label: Label;
  hit: THREE.Mesh;
  bubble?: { el: HTMLElement; until: number };
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
  label: Label;
  hit: THREE.Mesh;
  fade: number;
}

type Target = { kind: 'monster'; id: string } | { kind: 'npc'; npc: Npc };

interface Float { el: HTMLElement; pos: THREE.Vector3; born: number; life: number; dx: number; rise: number }
type Effect = (dt: number) => boolean; // false = finished

// one WebGL renderer for the whole session (map switches only swap the scene)
let renderer: THREE.WebGLRenderer | null = null;

export class World3D {
  private session: Session;
  private room: Room;
  private map: GameMap;
  private hooks: WorldHooks;
  private container: HTMLElement;
  private overlay: HTMLElement;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  private sun = new THREE.DirectionalLight(0xffffff, 2.2);
  private ray = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private raf = 0;
  private yaw = Math.PI / 4;
  private pitch = 0.9;
  private dist = 17;
  private camTarget = new THREE.Vector3();

  private me!: PlayerActor;
  private players = new Map<string, PlayerActor>();
  private monsters = new Map<string, MonsterActor>();
  private hits: THREE.Mesh[] = [];
  private npcHits = new Map<THREE.Object3D, Npc>();
  private path: { x: number; y: number }[] = [];
  private target: Target | null = null;
  private pendingSkill: { id: string; target?: string } | null = null;
  private targetingSkill: string | null = null;
  private lastAttack = 0;
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

    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      head: this.session.equippedOf('head')?.item_id ?? '', x: data.x, y: data.y, hp: 1, maxHp: 1, sp: 0, maxSp: 0, dead: false, sitting: false,
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

  destroy() {
    cancelAnimationFrame(this.raf);
    this.ac.abort();
    this.unsubs.forEach((u) => u());
    this.overlay.remove();
    renderer?.domElement.remove();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose();
    });
    renderer?.renderLists.dispose();
  }

  // ------------------------------------------------------------ scene

  private buildScene() {
    const town = this.map.safe;
    this.scene.background = new THREE.Color(town ? '#b9e2ff' : '#83c7ff');
    this.scene.fog = new THREE.Fog(this.scene.background, 42, 105);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a7a50, 1.55));
    this.sun.position.set(-8, 14, 6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -18;
    sc.right = sc.top = 18;
    sc.near = 1;
    sc.far = 60;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(buildGround(this.map));
    const props = buildProps(this.map);
    this.scene.add(props);
    props.traverse((o) => {
      if (o.name === 'flag' || o.name === 'water') this.animated.push(o);
    });

    for (const n of this.map.npcs) {
      const rig = buildCharacter({ ...n.look });
      rig.root.position.set(n.x + 0.5, 0, n.y + 0.5);
      this.scene.add(rig.root);
      const hit = this.hitCylinder(0.45, 1.7);
      rig.root.add(hit);
      this.npcHits.set(hit, n);
      this.hits.push(hit);
      this.animated.push(rig.root);
      rig.root.userData.rig = rig;
      this.upgradeNpc(rig, { ...n.look }, hit);
      this.staticLabel(`<span class="npc">${escapeHtml(n.name)}</span>`, new THREE.Vector3(n.x + 0.5, 0, n.y + 0.5));
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
    const look = { cls: rp.cls as ClassKey, gender: rp.gender as 'm' | 'f', hair: rp.hair, hair_color: rp.hairColor, face: rp.face };
    const rig = buildCharacter(look, rp.head);
    rig.root.position.set(rp.x, 0, rp.y);
    this.scene.add(rig.root);
    const hit = this.hitCylinder(0.4, 1.6);
    hit.userData.player = id;
    rig.root.add(hit);
    this.hits.push(hit);
    const a: PlayerActor = {
      id, name: rp.name, rig, x: rp.x, y: rp.y, tx: rp.x, ty: rp.y, look: lookKey(rp), cls: rp.cls as ClassKey, moving: 0, attack: 0,
      dead: rp.dead, sitting: rp.sitting, hp: rp.hp, maxHp: rp.maxHp, label: this.makeLabel(escapeHtml(rp.name), true, id === this.room.sessionId), hit,
    };
    this.players.set(id, a);
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
    a.rig = v;
  }

  private async upgradeNpc(old: CharRig, look: Look, hit: THREE.Mesh) {
    const v = await buildVrmCharacter(look);
    if (!v || this.ac.signal.aborted) return;
    v.root.position.copy(old.root.position);
    v.root.add(hit);
    v.root.userData.rig = v;
    this.scene.remove(old.root);
    this.scene.add(v.root);
    this.animated = this.animated.map((o) => (o === old.root ? v.root : o));
  }

  private destroyPlayer(a: PlayerActor) {
    this.scene.remove(a.rig.root);
    a.label.el.remove();
    a.bubble?.el.remove();
    this.hits = this.hits.filter((h) => h !== a.hit);
    this.players.delete(a.id);
  }

  private makeMonster(id: string, rm: RemoteMonster): MonsterActor {
    const def = MONSTERS[rm.key];
    const rig = buildMonster(rm.key);
    rig.root.position.set(rm.x, 0, rm.y);
    this.scene.add(rig.root);
    const hit = this.hitCylinder(Math.max(0.4, def.size * 0.45), rig.height + 0.2);
    hit.userData.monster = id;
    rig.root.add(hit);
    this.hits.push(hit);
    const label = this.makeLabel(def.boss ? `★ ${escapeHtml(def.name)} Lv${def.level}` : escapeHtml(def.name), true);
    label.el.classList.add('mon');
    if (def.boss) label.el.classList.add('boss');
    const m: MonsterActor = {
      id, key: rm.key, rig, x: rm.x, y: rm.y, dead: rm.dead, hp: rm.hp, maxHp: rm.maxHp, phase: Math.random() * 6, moving: false, label, hit,
      fade: rm.dead ? 0 : 1,
    };
    rig.root.visible = !rm.dead;
    this.monsters.set(id, m);
    return m;
  }

  // ------------------------------------------------------------ input

  private bindInput() {
    const cv = renderer!.domElement;
    const sig = { signal: this.ac.signal };
    let drag: { x: number; yaw: number; moved: boolean } | null = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault(), sig);
    cv.addEventListener('pointerdown', (e) => {
      if (e.button === 2) {
        drag = { x: e.clientX, yaw: this.yaw, moved: false };
        cv.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button === 0) this.click(e.clientX, e.clientY);
    }, sig);
    cv.addEventListener('pointermove', (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        if (Math.abs(dx) > 4) drag.moved = true;
        this.yaw = drag.yaw - dx * 0.008;
        return;
      }
      this.hover(e.clientX, e.clientY);
    }, sig);
    cv.addEventListener('pointerup', (e) => {
      if (e.button === 2 && drag) {
        if (!drag.moved) this.cancelTargeting();
        drag = null;
      }
    }, sig);
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = Math.max(7, Math.min(28, this.dist + Math.sign(e.deltaY) * 1.2));
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
      if (type === 'heal_target') return this.castAt(this.targetingSkill, pid ?? this.room.sessionId);
      if (mid && !this.monsters.get(mid)?.dead) return this.castAt(this.targetingSkill, mid);
      return this.cancelTargeting();
    }
    if (mid && !this.monsters.get(mid)?.dead) {
      this.target = { kind: 'monster', id: mid };
      this.path = [];
      return;
    }
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
    if (this.session.sp < skillSp(skill, lv)) return this.hooks.toast('SP ไม่พอ', 'bad');
    if (skill.type === 'single' || skill.type === 'aoe') {
      const t = this.target?.kind === 'monster' ? this.monsters.get(this.target.id) : undefined;
      if (t && !t.dead) return this.castAt(id, t.id);
      this.startTargeting(id);
    } else if (skill.type === 'heal_target') {
      if (this.targetingSkill === id) return this.castAt(id, this.room.sessionId); // press twice = self
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
    if (SKILLS[id].type !== 'heal_target') this.target = { kind: 'monster', id: target };
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

  toggleSit() {
    if (!this.dead) this.room.send('sit'); // moving stands up again on the server
  }

  // ------------------------------------------------------------ server messages

  private listen() {
    const on = (type: string, fn: (msg: any) => void) => this.unsubs.push(this.room.onMessage(type, fn));
    on('hit', (msg: { by: string; m: string; dmg: number; crit: boolean }) => {
      const m = this.monsters.get(msg.m);
      const a = this.players.get(msg.by);
      if (!m) return;
      const land = () => {
        const p = this.top(m);
        if (msg.dmg === 0) this.floatText(p, 'Miss', 'miss');
        else {
          this.floatText(p, String(msg.dmg), msg.crit ? 'crit' : a === this.me ? 'deal' : 'other');
          this.flash(m.rig.root);
        }
      };
      if (a) {
        this.face(a, m.x, m.y);
        a.attack = 1;
        this.attackFx(a, m, land);
      } else land();
    });
    on('mhit', (msg: { m: string; to: string; dmg: number }) => {
      const v = this.players.get(msg.to);
      const m = this.monsters.get(msg.m);
      if (m && v) this.lunge(m.rig.root, v.x - m.x, v.y - m.y);
      if (!v) return;
      const p = new THREE.Vector3(v.x, 1.7, v.y);
      if (msg.dmg === 0) this.floatText(p, 'Miss', 'miss');
      else {
        this.floatText(p, String(msg.dmg), 'take');
        this.flash(v.rig.root, 0xff3333);
      }
      if (v === this.me && m && !m.dead && !this.target && !this.path.length) this.target = { kind: 'monster', id: m.id };
    });
    on('skill', (msg) => this.skillFx(msg));
    on('fx', (msg: { kind: string; to: string }) => {
      const a = this.players.get(msg.to);
      if (!a) return;
      if (msg.kind === 'potion') this.sparkle(a, 0x7dff9a);
      if (msg.kind === 'levelup') this.levelFx(a, 'LEVEL UP!', 0xfff27a);
      if (msg.kind === 'joblevelup') this.levelFx(a, 'JOB LEVEL UP!', 0x9be0ff);
    });
    on('correct', (msg: { x: number; y: number }) => {
      this.me.x = msg.x;
      this.me.y = msg.y;
      this.sentX = msg.x;
      this.sentY = msg.y;
      this.path = [];
    });
    on('healed', () => {
      this.hooks.toast('ครูเพลง: พักเสียงสักหน่อยนะ (ฟื้น HP/SP เต็ม)', 'good');
      this.sparkle(this.me, 0x9be0ff);
    });
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
    // ambient animation
    for (const o of this.animated) {
      if (o.name === 'flag') o.rotation.y = Math.sin(t * 2 + o.id) * 0.25;
      else if (o.name === 'water') o.position.y = 0.36 + Math.sin(t * 2) * 0.01;
      else if (o.userData.rig) animateRig(o.userData.rig, t + o.id, { moving: false, sitting: false, dead: false, attack: 0 });
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
    this.effects = this.effects.filter((fx) => fx(dt));

    // camera follows the player
    this.camTarget.lerp(new THREE.Vector3(this.me.x, 0.8, this.me.y), Math.min(1, dt * 8));
    const d = this.dist;
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * Math.cos(this.pitch) * d,
      this.camTarget.y + Math.sin(this.pitch) * d,
      this.camTarget.z + Math.cos(this.yaw) * Math.cos(this.pitch) * d,
    );
    this.camera.lookAt(this.camTarget);
    this.sun.position.set(this.camTarget.x - 8, 14, this.camTarget.z + 6);
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
        if (this.target?.kind === 'monster' && this.target.id === id) this.target = null;
      } else if (!rm.dead && m.dead) {
        m.dead = false;
        m.x = rm.x;
        m.y = rm.y;
        m.fade = 0;
        m.rig.root.visible = true;
      }
      const dx = rm.x - m.x;
      const dy = rm.y - m.y;
      m.moving = Math.hypot(dx, dy) > 0.02;
      if (m.moving) m.rig.root.rotation.y = Math.atan2(dx, dy);
      m.x += dx * k;
      m.y += dy * k;
      m.hp = rm.hp;
      m.maxHp = rm.maxHp;
      m.fade = Math.max(0, Math.min(1, m.fade + (m.dead ? -dt * 2.5 : dt * 2.5)));
      m.rig.root.visible = m.fade > 0;
      m.rig.root.scale.set(1, 0.2 + m.fade * 0.8, 1);
      m.rig.root.position.set(m.x, 0, m.y);
      animateMonster(m.rig, m.key, t, m.phase, m.moving);
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
      if (a === this.me) {
        this.session.setVitals(rp.hp, rp.sp);
        if (rp.dead !== this.dead) {
          this.dead = rp.dead;
          this.path = [];
          this.target = null;
          this.hooks.death(rp.dead);
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
      a.hp = rp.hp;
      a.maxHp = rp.maxHp;
      setHat(a.rig, rp.head);
      a.moving = Math.max(0, a.moving - dt);
      a.attack = Math.max(0, a.attack - dt * 4);
      a.rig.root.position.set(a.x, 0, a.y);
      animateRig(a.rig, t, { moving: a.moving > 0, sitting: a.sitting, dead: a.dead, attack: a.attack });
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

    if (this.target?.kind === 'monster') {
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
      const show = !m.dead && (!!def.boss || m.hp < m.maxHp || this.hoverMonster === m || (this.target?.kind === 'monster' && this.target.id === m.id));
      this.place(m.label.el, new THREE.Vector3(m.x, 0, m.y), show);
      m.label.el.classList.toggle('named', !!def.boss || this.hoverMonster === m);
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

  private top(m: MonsterActor) {
    return new THREE.Vector3(m.x, m.rig.height + 0.2, m.y);
  }

  /** RO-style damage numbers and shouts, floating above a point in the world. */
  private floatText(pos: THREE.Vector3, text: string, kind: string, life = 900) {
    const el = document.createElement('div');
    el.className = `wf ${kind}`;
    el.textContent = text;
    this.overlay.appendChild(el);
    this.floats.push({ el, pos: pos.clone(), born: this.now, life, dx: kind === 'shout' || kind === 'level' ? 0 : (Math.random() - 0.5) * 0.8, rise: kind === 'level' ? 0.9 : 0.6 });
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

  private attackFx(a: PlayerActor, m: MonsterActor, land: () => void) {
    const cls = CLASSES[a.cls];
    if (!cls.projectile) {
      this.lunge(a.rig.root, m.x - a.x, m.y - a.y);
      setTimeout(land, 90);
      return;
    }
    const glyph = { note: ['♪', '#ffd166'], chord: ['♫', '#7ff0e6'], wave: ['〰', '#ff8cc8'] }[cls.projectile];
    this.projectile(new THREE.Vector3(a.x, 1.0, a.y), new THREE.Vector3(m.x, m.rig.height * 0.6, m.y), glyphTexture(glyph[0], glyph[1]), 0.5, 220, land);
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
      new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.05, y);
    this.scene.add(m);
    const disk = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }),
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

  private skillFx(msg: { by: string; skill: string; x: number; y: number; target?: string; hits: { m?: string; p?: string; dmg: number }[] }) {
    const skill = SKILLS[msg.skill];
    const a = this.players.get(msg.by);
    if (!skill) return;
    const color = new THREE.Color(CLASSES[skill.cls].color).getHex();
    if (a) {
      this.floatText(new THREE.Vector3(a.x, 2.2, a.y), `${skill.name}!!`, 'shout', 1100);
      this.face(a, msg.x, msg.y);
      a.attack = 1;
    }
    if (skill.type === 'aoe' || skill.type === 'aoe_self' || skill.type === 'heal') {
      this.ring(msg.x, msg.y, skill.radius ?? 1, color);
      this.burst(new THREE.Vector3(msg.x, 0.3, msg.y), color, 22, 4);
    } else if (skill.type === 'buff' && a) {
      this.levelFx(a, '', color);
    } else if (skill.type === 'single' && a) {
      const glyph = CLASSES[skill.cls].projectile ? { note: '♪', chord: '♫', wave: '〰' }[CLASSES[skill.cls].projectile!] : '✦';
      for (let i = 0; i < Math.min(3, skill.hits ?? 1); i++) {
        this.projectile(new THREE.Vector3(a.x, 1.0, a.y), new THREE.Vector3(msg.x, 0.6, msg.y), glyphTexture(glyph, '#ffffff'), 0.7, 200, undefined, i * 90);
      }
      setTimeout(() => this.burst(new THREE.Vector3(msg.x, 0.6, msg.y), color, 12), 220);
    }
    msg.hits.forEach((h, i) => {
      setTimeout(() => {
        if (h.m) {
          const m = this.monsters.get(h.m);
          if (!m) return;
          this.floatText(this.top(m).add(new THREE.Vector3(0, i * 0.12, 0)), String(h.dmg), msg.by === this.room.sessionId ? 'skill' : 'other');
          this.flash(m.rig.root);
        } else if (h.p) {
          const p = this.players.get(h.p);
          if (p) this.floatText(new THREE.Vector3(p.x, 1.8, p.y), `+${-h.dmg}`, 'heal');
        }
      }, 240 + i * 110);
    });
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
    for (const a of this.players.values()) if (a !== this.me) others.push({ x: a.x, y: a.y });
    return { me: { x: this.me.x, y: this.me.y }, others };
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    renderer!.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function lookKey(rp: RemotePlayer) {
  return `${rp.cls}_${rp.gender}_${rp.hair}_${rp.hairColor}_${rp.face}`;
}
