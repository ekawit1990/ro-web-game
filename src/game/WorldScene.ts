import Phaser from 'phaser';
import type { Room } from '@colyseus/sdk';
import { CLASSES, ClassKey, MONSTERS, SKILLS, skillSp } from '../data';
import { charKey, groundKey, GROUND_VARIANTS, hatKey, makeEffectTextures, monsterKey, objectKey } from './art';
import { Iso, TH, TW } from './iso';
import { findPath, GameMap, Npc, walkable } from './maps';
import type { Session } from './session';

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

/** Anything drawn standing on the map. x/y are tile coordinates. */
interface Actor {
  x: number;
  y: number;
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  shadowDepthBias?: number;
}

interface PlayerActor extends Actor {
  id: string;
  tx: number;
  ty: number;
  look: string; // texture key without direction, to notice appearance changes
  cls: ClassKey;
  dir: 'f' | 'b';
  hat?: Phaser.GameObjects.Image;
  hatId: string;
  bar: Phaser.GameObjects.Graphics;
  moving: number;
  dead: boolean;
  sitting: boolean;
  bubble?: Phaser.GameObjects.Container;
}

interface MonsterActor extends Actor {
  id: string;
  key: string;
  bar: Phaser.GameObjects.Graphics;
  dead: boolean;
  hp: number;
  maxHp: number;
  phase: number;
}

type Target =
  | { kind: 'monster'; id: string }
  | { kind: 'npc'; npc: Npc };

interface Footprint { x0: number; y0: number; x1: number; y1: number; depth: number; sx0: number; sx1: number }

export class WorldScene extends Phaser.Scene {
  private session!: Session;
  private room!: Room;
  private map!: GameMap;
  private hooks!: WorldHooks;
  private iso!: Iso;

  private me!: PlayerActor;
  private players = new Map<string, PlayerActor>();
  private monsters = new Map<string, MonsterActor>();
  private footprints: Footprint[] = [];
  private path: { x: number; y: number }[] = [];
  private target: Target | null = null;
  private pendingSkill: { id: string; target?: string } | null = null;
  private targetingSkill: string | null = null;
  private lastAttack = 0;
  private lastSend = 0;
  private sentX = 0;
  private sentY = 0;
  private dead = false;
  private marker!: Phaser.GameObjects.Image;
  private cursorRing!: Phaser.GameObjects.Ellipse;
  private unsubs: (() => void)[] = [];

  constructor() {
    super('world');
  }

  init(data: { session: Session; room: Room; map: GameMap; hooks: WorldHooks; x: number; y: number }) {
    this.session = data.session;
    this.room = data.room;
    this.map = data.map;
    this.hooks = data.hooks;
    this.iso = new Iso(this.map.h);
    this.players.clear();
    this.monsters.clear();
    this.footprints = [];
    this.path = [];
    this.target = null;
    this.pendingSkill = null;
    this.targetingSkill = null;
    this.dead = false;
    this.unsubs = [];
    this.sentX = data.x;
    this.sentY = data.y;
  }

  create(data: { x: number; y: number }) {
    makeEffectTextures(this);
    this.drawGround();
    this.drawObjects();
    this.drawNpcs();
    this.drawPortals();

    const c = this.session.char;
    this.me = this.makePlayer(this.room.sessionId, {
      name: c.name, cls: c.cls, level: c.level, gender: c.gender, hair: c.hair, hairColor: c.hair_color, face: c.face,
      head: this.session.equippedOf('head')?.item_id ?? '', x: data.x, y: data.y, hp: 1, maxHp: 1, sp: 0, maxSp: 0,
      dead: false, sitting: false,
    });
    this.me.label.setColor('#fff7c2');

    const size = (this.map.w + this.map.h) * (TW / 2);
    this.cameras.main.setBounds(-200, -300, size + 400, (this.map.w + this.map.h) * (TH / 2) + 500);
    this.cameras.main.startFollow(this.me.sprite, true, 0.15, 0.15, 0, 30);
    this.cameras.main.setBackgroundColor(this.map.safe ? '#33402f' : '#2f4a2a');

    this.marker = this.add.image(0, 0, 'marker').setVisible(false).setDepth(1);
    this.cursorRing = this.add.ellipse(0, 0, 60, 26).setStrokeStyle(2, 0xff5a5a).setVisible(false).setDepth(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (p.rightButtonDown()) return this.cancelTargeting();
      if (over.length) return; // handled by the object itself
      this.clickGround(p.worldX, p.worldY);
    });
    this.input.mouse?.disableContextMenu();
    this.listen();
    this.events.once('shutdown', () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
    });
  }

  // ------------------------------------------------------------ static map

  private drawGround() {
    const W = (this.map.w + this.map.h) * (TW / 2);
    const H = (this.map.w + this.map.h) * (TH / 2) + TH;
    const rt = this.add.renderTexture(0, 0, W, H).setOrigin(0, 0).setDepth(-100000);
    rt.beginDraw();
    for (let y = 0; y < this.map.h; y++) {
      for (let x = 0; x < this.map.w; x++) {
        const s = this.iso.toScreen(x, y);
        const key = groundKey(this, this.map.ground[y][x], (x * 7 + y * 13) % GROUND_VARIANTS);
        rt.batchDraw(key, s.x - TW / 2, s.y);
      }
    }
    rt.endDraw();
  }

  private drawObjects() {
    this.map.objects.forEach((o, i) => {
      const [key, ox, oy] = objectKey(this, o, i);
      let fx: number; // footprint
      let fy: number;
      let fw = 1;
      let fh = 1;
      let ax: number; // anchor in tile coords
      let ay: number;
      if (o.kind === 'building') {
        [fx, fy, fw, fh] = [o.x, o.y, o.w, o.h];
        [ax, ay] = [o.x + o.w, o.y + o.h];
      } else if (o.kind === 'stall') {
        [fx, fy, fw, fh] = [o.x, o.y, 2, 2];
        [ax, ay] = [o.x + 2, o.y + 2];
      } else if (o.kind === 'fountain') {
        [fx, fy, fw, fh] = [Math.floor(o.x), Math.floor(o.y), 4, 4];
        [ax, ay] = [fx + 2, fy + 2];
      } else {
        [fx, fy] = [o.x, o.y];
        [ax, ay] = [o.x + 0.5, o.y + 0.5];
      }
      const s = this.iso.toScreen(ax, ay);
      const front = this.iso.toScreen(fx + fw, fy + fh);
      const img = this.add.image(s.x, s.y, key).setOrigin(ox, oy).setDepth(front.y);
      if (fw * fh > 1) {
        const l = this.iso.toScreen(fx, fy + fh);
        const r = this.iso.toScreen(fx + fw, fy);
        this.footprints.push({ x0: fx, y0: fy, x1: fx + fw, y1: fy + fh, depth: front.y, sx0: l.x - 30, sx1: r.x + 30 });
      }
      if (o.kind === 'tree') {
        this.tweens.add({ targets: img, angle: { from: -1, to: 1 }, duration: 2200 + (i % 7) * 200, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      }
    });
  }

  private drawNpcs() {
    for (const n of this.map.npcs) {
      const s = this.iso.toScreen(n.x + 0.5, n.y + 0.5);
      const img = this.add.image(s.x, s.y, charKey(this, n.look, 'f')).setOrigin(0.5, 0.95).setDepth(s.y);
      img.setInteractive({ useHandCursor: true, pixelPerfect: false });
      img.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (p.rightButtonDown()) return;
        this.cancelTargeting();
        this.target = { kind: 'npc', npc: n };
        this.walkNear(n.x + 0.5, n.y + 0.5, 1.5);
      });
      this.add.text(s.x, s.y + 4, n.name, nameStyle('#9fe3ff')).setOrigin(0.5, 0).setDepth(900000);
      this.tweens.add({ targets: img, scaleY: 1.02, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    }
  }

  private drawPortals() {
    for (const p of this.map.portals) {
      const s = this.iso.toScreen(p.x + 0.5, p.y + 0.5);
      const img = this.add.image(s.x, s.y, 'portal').setDepth(s.y - 40).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: img, scale: { from: 0.9, to: 1.1 }, alpha: { from: 0.7, to: 1 }, duration: 900, yoyo: true, repeat: -1 });
      this.add.text(s.x, s.y - 34, `➜ ${p.label}`, nameStyle('#c8f0ff')).setOrigin(0.5).setDepth(900000);
      const spark = this.add.particles(s.x, s.y, 'spark', {
        lifespan: 900, speedY: { min: -60, max: -20 }, speedX: { min: -12, max: 12 }, scale: { start: 0.5, end: 0 },
        quantity: 1, frequency: 120, blendMode: 'ADD', emitZone: { type: 'random', source: new Phaser.Geom.Ellipse(0, 0, 60, 26) } as never,
      });
      spark.setDepth(s.y + 1);
    }
  }

  // ------------------------------------------------------------ actors

  private makePlayer(id: string, rp: RemotePlayer): PlayerActor {
    const look = { cls: rp.cls as ClassKey, gender: rp.gender as 'm' | 'f', hair: rp.hair, hair_color: rp.hairColor, face: rp.face };
    const s = this.iso.toScreen(rp.x, rp.y);
    const sprite = this.add.image(s.x, s.y, charKey(this, look, 'f')).setOrigin(0.5, 0.95);
    const label = this.add.text(s.x, s.y + 4, `${rp.name}`, nameStyle('#ffffff')).setOrigin(0.5, 0).setDepth(900000);
    const actor: PlayerActor = {
      id, x: rp.x, y: rp.y, tx: rp.x, ty: rp.y, sprite, label, look: lookKey(rp), cls: rp.cls as ClassKey, dir: 'f',
      hatId: '', bar: this.add.graphics().setDepth(900001), moving: 0, dead: rp.dead, sitting: rp.sitting,
    };
    if (id !== this.room.sessionId) {
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', (p: Phaser.Input.Pointer) => {
        if (this.targetingSkill && SKILLS[this.targetingSkill].type === 'heal_target') return this.castAt(this.targetingSkill, id);
        const cam = this.cameras.main;
        this.hooks.playerMenu(id, rp.name, (sprite.x - cam.worldView.x) * cam.zoom, (sprite.y - 70 - cam.worldView.y) * cam.zoom);
        p.event.stopPropagation();
      });
    } else {
      sprite.setInteractive();
      sprite.on('pointerdown', () => {
        if (this.targetingSkill && SKILLS[this.targetingSkill].type === 'heal_target') this.castAt(this.targetingSkill, id);
      });
    }
    this.setHat(actor, rp.head);
    this.players.set(id, actor);
    return actor;
  }

  private setHat(a: PlayerActor, item: string) {
    if (a.hatId === item) return;
    a.hatId = item;
    a.hat?.destroy();
    a.hat = undefined;
    const key = item ? hatKey(this, item) : null;
    if (key) a.hat = this.add.image(a.sprite.x, a.sprite.y, key).setOrigin(0.5, 0.95);
  }

  private makeMonster(id: string, rm: RemoteMonster): MonsterActor {
    const def = MONSTERS[rm.key];
    const key = monsterKey(this, rm.key);
    const tex = this.textures.get(key).getSourceImage() as HTMLCanvasElement;
    const s = this.iso.toScreen(rm.x, rm.y);
    const sprite = this.add.image(s.x, s.y, key).setOrigin(0.5, (tex.height - 5) / tex.height);
    sprite.setInteractive({ useHandCursor: true });
    sprite.on('pointerover', () => this.cursorRing.setVisible(true).setPosition(sprite.x, sprite.y).setSize(tex.width, tex.width * 0.42));
    sprite.on('pointerout', () => this.cursorRing.setVisible(false));
    sprite.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return;
      if (this.targetingSkill) return this.castAt(this.targetingSkill, id);
      this.target = { kind: 'monster', id };
      this.path = [];
    });
    const label = this.add
      .text(s.x, s.y + 4, def.boss ? `★ ${def.name} Lv${def.level}` : def.name, nameStyle(def.boss ? '#ffd54a' : '#ffdede'))
      .setOrigin(0.5, 0)
      .setDepth(900000)
      .setVisible(!!def.boss);
    sprite.on('pointerover', () => label.setVisible(true));
    sprite.on('pointerout', () => label.setVisible(!!def.boss));
    const m: MonsterActor = {
      id, key: rm.key, x: rm.x, y: rm.y, sprite, label, bar: this.add.graphics().setDepth(900001), dead: rm.dead, hp: rm.hp,
      maxHp: rm.maxHp, phase: Math.random() * 6,
    };
    if (rm.dead) sprite.setVisible(false).disableInteractive();
    this.monsters.set(id, m);
    return m;
  }

  /** Position + depth. Characters standing in front of a big object must draw over it. */
  private place(a: Actor, lift = 0) {
    const s = this.iso.toScreen(a.x, a.y);
    a.sprite.setPosition(s.x, s.y - lift);
    let depth = s.y;
    for (const f of this.footprints) {
      if (s.x < f.sx0 || s.x > f.sx1 || depth > f.depth) continue;
      if (a.x >= f.x1 || a.y >= f.y1) depth = Math.max(depth, f.depth + 1 + s.y * 0.001);
    }
    a.sprite.setDepth(depth);
    a.label.setPosition(s.x, s.y + 4);
    return s;
  }

  // ------------------------------------------------------------ input

  private clickGround(sx: number, sy: number) {
    if (this.dead) return;
    if (this.targetingSkill) {
      if (SKILLS[this.targetingSkill].type === 'heal_target') return this.castAt(this.targetingSkill, this.room.sessionId);
      return this.cancelTargeting();
    }
    const w = this.iso.toWorld(sx, sy);
    this.target = null;
    this.pendingSkill = null;
    this.walkTo(w.x, w.y);
  }

  private walkTo(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!walkable(this.map, tx + 0.5, ty + 0.5)) return;
    const p = findPath(this.map, Math.floor(this.me.x), Math.floor(this.me.y), tx, ty);
    if (!p) return;
    if (p.length) p[p.length - 1] = { x, y };
    this.path = p;
    const s = this.iso.toScreen(tx + 0.5, ty + 0.5);
    this.marker.setPosition(s.x, s.y).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.marker, alpha: 0, duration: 800 });
  }

  /** Walk to the closest free tile around a point. */
  private walkNear(x: number, y: number, range: number) {
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
      this.targetingSkill = id;
      this.hooks.targeting(skill.name);
      this.input.setDefaultCursor('crosshair');
    } else if (skill.type === 'heal_target') {
      if (this.targetingSkill === id) return this.castAt(id, this.room.sessionId); // press twice = self
      this.targetingSkill = id;
      this.hooks.targeting(skill.name);
      this.input.setDefaultCursor('crosshair');
    } else {
      this.room.send('skill', { id });
    }
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
    this.input.setDefaultCursor('default');
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
        if (msg.dmg === 0) this.missText(m.sprite.x, m.sprite.y - m.sprite.displayHeight * 0.8);
        else this.damageText(m.sprite.x, m.sprite.y - m.sprite.displayHeight * 0.8, msg.dmg, msg.crit ? 'crit' : a === this.me ? 'deal' : 'other');
        if (msg.dmg) this.flash(m.sprite);
      };
      if (a) {
        this.face(a, m.x, m.y);
        this.attackFx(a, m, land);
      } else land();
    });
    on('mhit', (msg: { m: string; to: string; dmg: number }) => {
      const v = this.players.get(msg.to);
      const m = this.monsters.get(msg.m);
      if (m) this.tweens.add({ targets: m.sprite, scaleX: 1.15, scaleY: 0.9, duration: 80, yoyo: true });
      if (!v) return;
      if (msg.dmg === 0) this.missText(v.sprite.x, v.sprite.y - 70);
      else {
        this.damageText(v.sprite.x, v.sprite.y - 70, msg.dmg, 'take');
        this.flash(v.sprite, 0xff3333);
      }
      if (v === this.me && m && !m.dead && !this.target && !this.path.length) this.target = { kind: 'monster', id: m.id };
    });
    on('skill', (msg: { by: string; skill: string; x: number; y: number; target?: string; hits: { m?: string; p?: string; dmg: number }[] }) =>
      this.skillFx(msg));
    on('fx', (msg: { kind: string; to: string; item?: string }) => {
      const a = this.players.get(msg.to);
      if (!a) return;
      if (msg.kind === 'potion') this.potionFx(a);
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
      this.potionFx(this.me, 0x9be0ff);
    });
    on('chat', (msg: { id: string; text: string }) => this.bubble(msg.id, msg.text));
  }

  // ------------------------------------------------------------ frame update

  update(time: number, delta: number) {
    const state = this.room.state as RemoteState | undefined;
    if (!state?.players) return;
    const dt = Math.min(delta, 100) / 1000;
    this.syncMonsters(state, dt, time);
    this.syncPlayers(state, dt, time);
    this.updateMe(state, dt, time);
  }

  private syncMonsters(state: RemoteState, dt: number, time: number) {
    const k = Math.min(1, dt * 10);
    state.monsters.forEach((rm, id) => {
      const m = this.monsters.get(id) ?? this.makeMonster(id, rm);
      if (rm.dead && !m.dead) this.killMonster(m);
      else if (!rm.dead && m.dead) {
        m.dead = false;
        m.x = rm.x;
        m.y = rm.y;
        m.sprite.setVisible(true).setAlpha(0).setScale(1).setInteractive({ useHandCursor: true });
        this.tweens.add({ targets: m.sprite, alpha: 1, duration: 400 });
      }
      const dx = rm.x - m.x;
      const dy = rm.y - m.y;
      const moving = Math.hypot(dx, dy) > 0.02;
      const sdx = dx - dy; // screen direction
      if (Math.abs(sdx) > 0.02) m.sprite.setFlipX(sdx > 0);
      m.x += dx * k;
      m.y += dy * k;
      m.hp = rm.hp;
      m.maxHp = rm.maxHp;
      if (m.dead) return;
      const hop = moving ? Math.abs(Math.sin(time / 110 + m.phase)) * 6 : Math.sin(time / 400 + m.phase) * 1.2;
      this.place(m, hop);
      m.sprite.setScale(1 + (moving ? 0 : Math.sin(time / 300 + m.phase) * 0.03), 1 - (moving ? 0 : Math.sin(time / 300 + m.phase) * 0.03));
      this.drawBar(m.bar, m.sprite.x, m.sprite.y + 2, m.hp / m.maxHp, m.hp < m.maxHp, 0xe04848);
    });
  }

  private syncPlayers(state: RemoteState, dt: number, time: number) {
    const seen = new Set<string>();
    state.players.forEach((rp, id) => {
      seen.add(id);
      let a = this.players.get(id);
      if (a && a.look !== lookKey(rp)) {
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
        a.label.setText(rp.name);
      }
      a.dead = rp.dead;
      a.sitting = rp.sitting;
      this.setHat(a, rp.head);
      a.moving = Math.max(0, a.moving - dt);
      this.drawPlayer(a, time, rp);
    });
    for (const [id, a] of this.players) if (!seen.has(id) && a !== this.me) {
      this.destroyPlayer(a);
      this.players.delete(id);
    }
  }

  private drawPlayer(a: PlayerActor, time: number, rp: RemotePlayer) {
    const look = { cls: a.cls, gender: rp.gender as 'm' | 'f', hair: rp.hair, hair_color: rp.hairColor, face: rp.face };
    const key = charKey(this, look, a.dir);
    if (a.sprite.texture.key !== key) a.sprite.setTexture(key);
    const bob = a.moving > 0 ? Math.abs(Math.sin(time / 90)) * 3 : 0;
    const s = this.place(a, bob);
    a.sprite.setAngle(a.dead ? 90 : 0).setAlpha(a.dead ? 0.6 : 1);
    a.sprite.setScale(1, a.sitting ? 0.82 : 1);
    if (a.hat) {
      a.hat.setPosition(a.sprite.x, a.sprite.y).setDepth(a.sprite.depth + 0.01).setFlipX(a.sprite.flipX);
      a.hat.setAngle(a.sprite.angle).setScale(1, a.sitting ? 0.82 : 1).setVisible(a.dir === 'f' || a.hatId !== 'note_ribbon');
    }
    this.drawBar(a.bar, s.x, s.y + 20, rp.hp / Math.max(1, rp.maxHp), true, 0x4cd964, a === this.me ? rp.sp / Math.max(1, rp.maxSp) : -1);
    a.label.setY(s.y + 26);
    if (a.bubble) a.bubble.setPosition(s.x, a.sprite.y - 90);
  }

  private updateMe(state: RemoteState, dt: number, time: number) {
    const me = this.me;
    if (this.dead) return;
    const speed = this.session.derived.moveSpeed / TILE_PX;

    // chase the current target
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
      // heal_target on a player
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

    // follow the path
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

    // portals
    for (const p of this.map.portals) {
      if (Math.hypot(me.x - (p.x + 0.5), me.y - (p.y + 0.5)) < 1.2) {
        if (!this.warping) {
          this.warping = true;
          this.room.send('move', { x: me.x, y: me.y });
          this.time.delayedCall(120, () => this.room.send('warp'));
          this.time.delayedCall(3000, () => (this.warping = false));
        }
      }
    }
  }
  private warping = false;

  // ------------------------------------------------------------ effects

  private face(a: PlayerActor | Actor, x: number, y: number) {
    const sdx = (x - a.x) - (y - a.y);
    const sdy = (x - a.x) + (y - a.y);
    if (Math.abs(sdx) > 0.05) a.sprite.setFlipX(sdx < 0);
    if ('dir' in a && Math.abs(sdy) > 0.05) a.dir = sdy < 0 ? 'b' : 'f';
  }

  private attackFx(a: PlayerActor, m: MonsterActor, land: () => void) {
    const cls = CLASSES[a.cls];
    if (!cls.projectile) {
      // melee: lunge
      const sx = a.sprite.x;
      this.tweens.add({ targets: a.sprite, x: sx + (m.sprite.x > sx ? 8 : -8), duration: 70, yoyo: true });
      this.time.delayedCall(90, land);
      return;
    }
    const p = this.add.image(a.sprite.x, a.sprite.y - 40, cls.projectile).setDepth(900002);
    if (cls.projectile === 'wave') p.setRotation(Phaser.Math.Angle.Between(p.x, p.y, m.sprite.x, m.sprite.y - 20));
    this.tweens.add({
      targets: p, x: m.sprite.x, y: m.sprite.y - 20, duration: 220, onComplete: () => {
        p.destroy();
        land();
      },
    });
  }

  private skillFx(msg: { by: string; skill: string; x: number; y: number; target?: string; hits: { m?: string; p?: string; dmg: number }[] }) {
    const skill = SKILLS[msg.skill];
    const a = this.players.get(msg.by);
    if (!skill) return;
    if (a) {
      // RO-style skill shout above the caster
      const t = this.add.text(a.sprite.x, a.sprite.y - 96, `${skill.name}!!`, {
        fontFamily: 'Kanit, sans-serif', fontSize: '15px', color: '#ffffff', stroke: '#1a3a7a', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(900010);
      this.tweens.add({ targets: t, y: t.y - 16, alpha: 0, delay: 600, duration: 500, onComplete: () => t.destroy() });
      this.face(a, msg.x, msg.y);
    }
    const s = this.iso.toScreen(msg.x, msg.y);
    const tint = Phaser.Display.Color.HexStringToColor(CLASSES[skill.cls].color).color;
    if (skill.type === 'aoe' || skill.type === 'aoe_self' || skill.type === 'heal') {
      const r = (skill.radius ?? 1) * TW * 0.7;
      const ring = this.add.ellipse(s.x, s.y, 10, 5, tint, 0.35).setStrokeStyle(3, tint).setDepth(s.y - 1);
      this.tweens.add({ targets: ring, width: r * 2, height: r, alpha: 0, duration: 650, onComplete: () => ring.destroy() });
      this.burst(s.x, s.y - 10, tint, 18);
    } else if (skill.type === 'buff' && a) {
      this.levelFx(a, '', tint);
    } else if (skill.type === 'single' && a) {
      const glyph = CLASSES[skill.cls].projectile ?? 'note';
      for (let i = 0; i < Math.min(3, skill.hits ?? 1); i++) {
        const p = this.add.image(a.sprite.x, a.sprite.y - 40, glyph).setDepth(900002).setScale(1.5).setTint(0xffffff);
        this.tweens.add({ targets: p, x: s.x, y: s.y - 24, delay: i * 90, duration: 200, onComplete: () => p.destroy() });
      }
      this.time.delayedCall(220, () => this.burst(s.x, s.y - 24, tint, 10));
    }
    msg.hits.forEach((h, i) => {
      this.time.delayedCall(240 + i * 110, () => {
        if (h.m) {
          const m = this.monsters.get(h.m);
          if (!m) return;
          this.damageText(m.sprite.x, m.sprite.y - m.sprite.displayHeight * 0.8 - i * 4, h.dmg, msg.by === this.room.sessionId ? 'skill' : 'other');
          this.flash(m.sprite);
        } else if (h.p) {
          const p = this.players.get(h.p);
          if (p) this.damageText(p.sprite.x, p.sprite.y - 70, -h.dmg, 'heal');
        }
      });
    });
  }

  private burst(x: number, y: number, tint: number, n: number) {
    const e = this.add.particles(x, y, 'spark', {
      speed: { min: 60, max: 180 }, lifespan: 450, scale: { start: 0.7, end: 0 }, tint, blendMode: 'ADD', emitting: false,
    }).setDepth(900003);
    e.explode(n);
    this.time.delayedCall(600, () => e.destroy());
  }

  private potionFx(a: PlayerActor, tint = 0x7dff9a) {
    for (let i = 0; i < 8; i++) {
      const p = this.add.image(a.sprite.x + Phaser.Math.Between(-14, 14), a.sprite.y - 10, 'spark')
        .setTint(tint).setScale(0.5).setBlendMode('ADD').setDepth(900003);
      this.tweens.add({ targets: p, y: p.y - 60, alpha: 0, delay: i * 40, duration: 600, onComplete: () => p.destroy() });
    }
  }

  private levelFx(a: PlayerActor, text: string, tint: number) {
    const pillar = this.add.rectangle(a.sprite.x, a.sprite.y, 46, 10, tint, 0.45).setOrigin(0.5, 1).setDepth(a.sprite.depth - 0.5)
      .setBlendMode('ADD');
    this.tweens.add({ targets: pillar, height: 220, alpha: 0, duration: 1100, onComplete: () => pillar.destroy() });
    this.burst(a.sprite.x, a.sprite.y - 40, tint, 24);
    if (!text) return;
    const t = this.add.text(a.sprite.x, a.sprite.y - 110, text, {
      fontFamily: 'Georgia, serif', fontSize: '24px', fontStyle: 'bold italic', color: '#fff27a', stroke: '#7a4a00', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(900010);
    this.tweens.add({ targets: t, y: t.y - 30, alpha: 0, delay: 900, duration: 700, onComplete: () => t.destroy() });
  }

  /** RO-style bouncing damage numbers. */
  private damageText(x: number, y: number, n: number, kind: 'deal' | 'crit' | 'take' | 'skill' | 'other' | 'heal') {
    const style = {
      deal: ['#ffffff', '#000000', 22], crit: ['#ffe34a', '#a33000', 30], take: ['#ff4d4d', '#3a0000', 22],
      skill: ['#fff1a8', '#4a2a00', 26], other: ['#c9dcff', '#0d2350', 18], heal: ['#6dff8a', '#0b3a14', 22],
    }[kind] as [string, string, number];
    const t = this.add.text(x, y, kind === 'crit' ? `${n}` : `${n}`, {
      fontFamily: 'Impact, "Arial Black", sans-serif', fontSize: `${style[2]}px`, color: style[0], stroke: style[1], strokeThickness: 4,
    }).setOrigin(0.5).setDepth(900020);
    if (kind === 'crit') {
      const star = this.add.star(x, y, 10, 18, 34, 0xff9a2a, 0.85).setDepth(900019);
      this.tweens.add({ targets: star, scale: 1.4, alpha: 0, angle: 30, duration: 400, onComplete: () => star.destroy() });
    }
    const dx = Phaser.Math.Between(-30, 30);
    t.setScale(kind === 'crit' ? 1.6 : 1.2);
    this.tweens.add({ targets: t, scale: 1, duration: 120 });
    this.tweens.add({ targets: t, x: x + dx, duration: 900 });
    this.tweens.add({ targets: t, y: y - 40, duration: 350, ease: 'Quad.out', yoyo: true, hold: 0, onYoyo: () => undefined });
    this.tweens.add({ targets: t, alpha: 0, delay: 700, duration: 300, onComplete: () => t.destroy() });
  }

  private missText(x: number, y: number) {
    const t = this.add.text(x, y, 'Miss', {
      fontFamily: 'Georgia, serif', fontSize: '18px', fontStyle: 'bold italic', color: '#ffd6d6', stroke: '#5a0000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(900020);
    this.tweens.add({ targets: t, y: y - 30, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  private flash(img: Phaser.GameObjects.Image, color = 0xffffff) {
    img.setTintFill(color);
    this.time.delayedCall(70, () => img.clearTint());
  }

  private killMonster(m: MonsterActor) {
    m.dead = true;
    m.bar.clear();
    m.label.setVisible(false);
    m.sprite.disableInteractive();
    this.cursorRing.setVisible(false);
    this.tweens.add({ targets: m.sprite, alpha: 0, scaleY: 0.2, duration: 450, onComplete: () => m.sprite.setVisible(false) });
    if (this.target?.kind === 'monster' && this.target.id === m.id) this.target = null;
  }

  private destroyPlayer(a: PlayerActor) {
    a.sprite.destroy();
    a.label.destroy();
    a.bar.destroy();
    a.hat?.destroy();
    a.bubble?.destroy();
    this.players.delete(a.id);
  }

  private drawBar(g: Phaser.GameObjects.Graphics, x: number, y: number, frac: number, visible: boolean, color: number, sp = -1) {
    g.clear();
    if (!visible) return;
    const w = 40;
    g.fillStyle(0x10141a, 0.85).fillRect(x - w / 2 - 1, y - 1, w + 2, sp >= 0 ? 9 : 6);
    g.fillStyle(frac < 0.25 ? 0xff3b30 : color, 1).fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, frac)), 4);
    if (sp >= 0) g.fillStyle(0x3f7fe8, 1).fillRect(x - w / 2, y + 4, w * Math.max(0, Math.min(1, sp)), 3);
  }

  bubble(id: string, text: string) {
    const a = this.players.get(id);
    if (!a) return;
    a.bubble?.destroy();
    const t = this.add.text(0, 0, text, {
      fontFamily: 'Kanit, sans-serif', fontSize: '13px', color: '#222', wordWrap: { width: 180 }, align: 'center',
    }).setOrigin(0.5);
    const bg = this.add.graphics();
    const w = t.width + 16;
    const h = t.height + 8;
    bg.fillStyle(0xffffff, 0.95).fillRoundedRect(-w / 2, -h / 2, w, h, 6).lineStyle(1, 0x7a8aa0).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.fillStyle(0xffffff, 0.95).fillTriangle(-5, h / 2 - 1, 5, h / 2 - 1, 0, h / 2 + 6);
    const c = this.add.container(a.sprite.x, a.sprite.y - 90, [bg, t]).setDepth(900030);
    a.bubble = c;
    this.time.delayedCall(4500, () => {
      if (a.bubble === c) a.bubble = undefined;
      c.destroy();
    });
  }

  // ------------------------------------------------------------ for the HUD

  /** Positions for the minimap, in tile coordinates. */
  minimapDots() {
    const others: { x: number; y: number }[] = [];
    for (const a of this.players.values()) if (a !== this.me) others.push({ x: a.x, y: a.y });
    return { me: { x: this.me.x, y: this.me.y }, others };
  }

  isTargeting() {
    return !!this.targetingSkill;
  }

}

function nameStyle(color: string): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: 'Kanit, sans-serif', fontSize: '12px', color, stroke: '#000000', strokeThickness: 3 };
}

function lookKey(rp: RemotePlayer) {
  return `${rp.cls}_${rp.gender}_${rp.hair}_${rp.hairColor}_${rp.face}`;
}

