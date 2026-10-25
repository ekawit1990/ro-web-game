import Phaser from 'phaser';
import type { Room } from '@colyseus/sdk';
import { CLASSES, ITEMS, MAGIC_SP_COST, MONSTERS, MonsterDef, SPAWNS, SpawnDef } from '../data';
import type { Net, PeerInfo } from '../services/net';
import { TOWN_SPAWN } from '../services/localStore';
import { MAP_H, MAP_W, NPCS, TILE, WorldMap, buildMap, findPath, inTown } from './map';
import type { Session } from './session';
import { makeTextures } from './textures';

export interface WorldHooks {
  toast(text: string, kind?: 'good' | 'bad'): void;
  system(text: string): void;
  openShop(): void;
  onDeath(): void;
  chat(name: string, text: string): void;
}

/** Shape of the Colyseus room state (see server/src/FieldRoom.ts). */
interface RemotePlayer { name: string; cls: string; level: number; x: number; y: number; hp: number; maxHp: number; sp: number; maxSp: number; dead: boolean }
interface RemoteMonster { key: string; x: number; y: number; hp: number; maxHp: number; dead: boolean }
interface RemoteState {
  players: { forEach(cb: (p: RemotePlayer, id: string) => void): void; get(id: string): RemotePlayer | undefined };
  monsters: { forEach(cb: (m: RemoteMonster, id: string) => void): void };
}

interface Actor {
  sprite: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  x: number; // tile units (float)
  y: number;
}

interface Monster extends Actor {
  uid: number;
  rid?: string; // id on the game server
  key: string;
  def: MonsterDef;
  spawn: SpawnDef;
  hp: number;
  dead: boolean;
  aggro: boolean;
  lastAttack: number;
  wanderAt: number;
  wanderTo: { x: number; y: number } | null;
  hpBar: Phaser.GameObjects.Graphics;
}

interface Npc extends Actor {
  id: string;
}

interface Peer extends Actor {
  tx: number;
  ty: number;
  cls: PeerInfo['cls'];
  level: number;
}

type Target = { kind: 'monster'; m: Monster } | { kind: 'npc'; n: Npc } | null;

const px = (t: number) => t * TILE;

export class WorldScene extends Phaser.Scene {
  private session!: Session;
  private net!: Net;
  private hooks!: WorldHooks;
  private map!: WorldMap;
  private player!: Actor;
  private path: { x: number; y: number }[] = [];
  private target: Target = null;
  private lastAttack = 0;
  private lastRepath = 0;
  private lastSent = 0;
  private sentPos = { x: 0, y: 0 };
  private dead = false;
  private monsters: Monster[] = [];
  private npcs: Npc[] = [];
  private peers = new Map<string, Peer>();
  private marker!: Phaser.GameObjects.Image;
  private uidSeq = 0;
  /** Online: the Colyseus room. Offline: undefined and monsters are simulated here. */
  private room?: Room;
  private remoteMonsters = new Map<string, Monster>();
  private unsubs: (() => void)[] = [];

  constructor() {
    super('world');
  }

  init(data: { session: Session; net: Net; hooks: WorldHooks; room?: Room }) {
    this.session = data.session;
    this.net = data.net;
    this.hooks = data.hooks;
    this.room = data.room;
    this.remoteMonsters = new Map();
    this.unsubs = [];
    this.monsters = [];
    this.npcs = [];
    this.peers = new Map();
    this.path = [];
    this.target = null;
    this.dead = false;
  }

  create() {
    if (!this.textures.exists('tiles')) makeTextures(this);
    this.map = buildMap();

    const tm = this.make.tilemap({ data: this.map.tiles, tileWidth: TILE, tileHeight: TILE });
    const tileset = tm.addTilesetImage('tiles', 'tiles', TILE, TILE, 0, 0)!;
    tm.createLayer(0, tileset, 0, 0)!.setDepth(-10);

    for (const t of this.map.trees) {
      this.add.image(px(t.x + 0.5), px(t.y + 1) + 4, 'tree').setOrigin(0.5, 1).setDepth(px(t.y + 1));
    }

    for (const n of NPCS) {
      const sprite = this.add.image(px(n.x + 0.5), px(n.y + 0.5) + 8, `npc_${n.id}`).setOrigin(0.5, 1);
      sprite.setInteractive({ useHandCursor: true });
      const npc: Npc = { id: n.id, x: n.x + 0.5, y: n.y + 0.5, sprite, label: this.makeLabel(n.name, '#ffe08a') };
      sprite.setData('npc', npc);
      this.map.blocked[n.y][n.x] = true;
      this.npcs.push(npc);
    }

    const c = this.session.char;
    let sx = c.pos_x;
    let sy = c.pos_y;
    if (!(sx > 0 && sy > 0 && sx < MAP_W && sy < MAP_H) || this.map.blocked[Math.floor(sy)][Math.floor(sx)]) {
      sx = TOWN_SPAWN.x;
      sy = TOWN_SPAWN.y;
    }
    this.player = {
      x: sx,
      y: sy,
      sprite: this.add.image(0, 0, `char_${c.cls}`).setOrigin(0.5, 1),
      label: this.makeLabel(c.name, '#ffffff'),
    };

    if (!this.room) for (const s of SPAWNS) for (let i = 0; i < s.count; i++) this.spawnMonster(s);
    else this.listenRemote(this.room);

    this.marker = this.add.image(0, 0, 'marker').setVisible(false).setDepth(-5);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, px(MAP_W), px(MAP_H));
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.setRoundPixels(true);
    const fitZoom = () => cam.setZoom(this.scale.width < 600 ? 0.9 : 1.15);
    fitZoom();
    this.scale.on('resize', fitZoom);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => this.onClick(p, over));

    if (!this.room) {
      this.time.addEvent({ delay: 2000, loop: true, callback: () => this.regen() });
      this.time.addEvent({ delay: 10000, loop: true, callback: () => this.save() });
    }

    this.events.once('shutdown', () => {
      this.scale.off('resize', fitZoom);
      this.unsubs.forEach((u) => u());
      if (!this.room) this.save();
      this.net.leave();
    });
    this.syncActor(this.player);
  }

  // ------------------------------------------------------------ public API (HUD, network)

  addPeer(p: PeerInfo) {
    if (this.peers.has(p.id)) return;
    const peer: Peer = {
      x: p.x, y: p.y, tx: p.x, ty: p.y, cls: p.cls, level: p.level,
      sprite: this.add.image(0, 0, `char_${p.cls}`).setOrigin(0.5, 1).setAlpha(0.95),
      label: this.makeLabel(`${p.name} Lv${p.level}`, '#9fd3ff'),
    };
    this.peers.set(p.id, peer);
    this.syncActor(peer);
  }

  removePeer(id: string) {
    const p = this.peers.get(id);
    if (!p) return;
    p.sprite.destroy();
    p.label.destroy();
    this.peers.delete(id);
  }

  movePeer(id: string, x: number, y: number) {
    const p = this.peers.get(id);
    if (!p) return;
    p.tx = x;
    p.ty = y;
  }

  bubble(name: string, text: string) {
    let actor: Actor | undefined;
    if (name === this.session.char.name) actor = this.player;
    else actor = [...this.peers.values()].find((p) => p.label.text.startsWith(`${name} Lv`));
    if (!actor) return;
    const t = this.add
      .text(actor.sprite.x, actor.sprite.y - 64, text, {
        fontFamily: 'Kanit, sans-serif', fontSize: '13px', color: '#222', backgroundColor: '#ffffffee',
        padding: { x: 6, y: 3 }, wordWrap: { width: 180 },
      })
      .setOrigin(0.5, 1)
      .setDepth(100000);
    const follow = this.time.addEvent({ delay: 16, loop: true, callback: () => t.setPosition(actor!.sprite.x, actor!.sprite.y - 64) });
    this.time.delayedCall(4500, () => {
      follow.remove();
      t.destroy();
    });
  }

  respawn() {
    this.dead = false;
    this.player.x = TOWN_SPAWN.x;
    this.player.y = TOWN_SPAWN.y;
    this.player.sprite.setAlpha(1).setAngle(0);
    this.path = [];
    this.target = null;
    this.monsters.forEach((m) => (m.aggro = false));
    this.syncActor(this.player);
    this.net.sendMove(this.player.x, this.player.y);
  }

  playerTile() {
    return { x: this.player.x, y: this.player.y };
  }

  // ------------------------------------------------------------ input

  private onClick(p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) {
    if (this.dead) return;
    const hit = over.find((o) => o.getData('monster') || o.getData('npc'));
    if (hit?.getData('monster')) {
      const m = hit.getData('monster') as Monster;
      if (!m.dead) this.target = { kind: 'monster', m };
      this.lastRepath = 0;
      return;
    }
    if (hit?.getData('npc')) {
      this.target = { kind: 'npc', n: hit.getData('npc') as Npc };
      this.lastRepath = 0;
      return;
    }
    this.target = null;
    const tx = Math.floor(p.worldX / TILE);
    const ty = Math.floor(p.worldY / TILE);
    this.walkTo(tx, ty);
    this.marker.setPosition(px(tx + 0.5), px(ty + 0.5)).setVisible(true);
  }

  private walkTo(tx: number, ty: number): boolean {
    const path = findPath(this.map, Math.floor(this.player.x), Math.floor(this.player.y), tx, ty);
    if (!path) return false;
    this.path = path;
    return true;
  }

  /** Walk to the closest free tile next to (x, y). */
  private approach(x: number, y: number) {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const cands: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) cands.push([fx + dx, fy + dy]);
    cands.sort((a, b) => Phaser.Math.Distance.Between(a[0], a[1], this.player.x, this.player.y) -
      Phaser.Math.Distance.Between(b[0], b[1], this.player.x, this.player.y));
    for (const [cx, cy] of cands) if (this.walkTo(cx, cy)) return;
    this.walkTo(fx, fy);
  }

  // ------------------------------------------------------------ loop

  update(time: number, delta: number) {
    const dt = Math.min(delta, 100) / 1000;
    if (this.room) this.syncRemote(dt);
    if (!this.dead) this.updatePlayer(time, dt);
    if (!this.room) for (const m of this.monsters) this.updateMonster(m, time, dt);
    for (const p of this.peers.values()) {
      p.x += (p.tx - p.x) * Math.min(1, dt * 8);
      p.y += (p.ty - p.y) * Math.min(1, dt * 8);
      this.syncActor(p);
    }
    if (time - this.lastSent > 120 && (this.player.x !== this.sentPos.x || this.player.y !== this.sentPos.y)) {
      this.lastSent = time;
      this.sentPos = { x: this.player.x, y: this.player.y };
      const x = +this.player.x.toFixed(2);
      const y = +this.player.y.toFixed(2);
      if (this.room) this.room.send('move', { x, y });
      else this.net.sendMove(x, y);
    }
  }

  private updatePlayer(time: number, dt: number) {
    const t = this.target;
    if (t?.kind === 'monster' && t.m.dead) this.target = null;

    if (t?.kind === 'monster' && !t.m.dead) {
      const m = t.m;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y);
      const range = CLASSES[this.session.char.cls].range + m.def.size * 0.3;
      if (d > range) {
        if (time - this.lastRepath > 350 || !this.path.length) {
          this.lastRepath = time;
          this.approach(m.x, m.y);
        }
      } else {
        this.path = [];
        this.face(m.x);
        if (time - this.lastAttack >= this.session.derived.attackDelay) {
          this.lastAttack = time;
          if (this.room) {
            this.room.send('attack', { id: m.rid });
            this.lunge(this.player, m.x);
          } else this.attack(m);
        }
      }
    } else if (t?.kind === 'npc') {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t.n.x, t.n.y);
      if (d <= 1.6) {
        this.path = [];
        this.target = null;
        this.face(t.n.x);
        this.talk(t.n);
      } else if (time - this.lastRepath > 500 || !this.path.length) {
        this.lastRepath = time;
        this.approach(t.n.x, t.n.y);
      }
    }

    if (this.path.length) {
      const next = this.path[0];
      const speed = this.session.derived.moveSpeed / TILE;
      const dx = next.x - this.player.x;
      const dy = next.y - this.player.y;
      const dist = Math.hypot(dx, dy);
      const step = speed * dt;
      if (dist <= step) {
        this.player.x = next.x;
        this.player.y = next.y;
        this.path.shift();
        if (!this.path.length) this.marker.setVisible(false);
      } else {
        this.player.x += (dx / dist) * step;
        this.player.y += (dy / dist) * step;
      }
      if (Math.abs(dx) > 0.01) this.face(next.x);
    }
    this.syncActor(this.player);
    if (this.path.length) this.player.sprite.y -= Math.abs(Math.sin(time / 70)) * 3;
  }

  private face(x: number) {
    this.player.sprite.setFlipX(x < this.player.x);
  }

  private updateMonster(m: Monster, time: number, dt: number) {
    if (m.dead) return;
    const d = Phaser.Math.Distance.Between(m.x, m.y, this.player.x, this.player.y);
    const home = { x: (m.spawn.area[0] + m.spawn.area[2]) / 2, y: (m.spawn.area[1] + m.spawn.area[3]) / 2 };
    const playerSafe = this.dead || inTown(this.player.x, this.player.y);

    if (!playerSafe && !m.aggro && m.def.aggressive && d < 5) m.aggro = true;
    if (m.aggro && (playerSafe || Phaser.Math.Distance.Between(m.x, m.y, home.x, home.y) > 16)) m.aggro = false;

    let goal: { x: number; y: number } | null = null;
    let speed = m.def.speed / TILE;
    if (m.aggro) {
      const reach = 1.0 + m.def.size * 0.35;
      if (d > reach) goal = { x: this.player.x, y: this.player.y };
      else if (time - m.lastAttack > 1600) {
        m.lastAttack = time;
        this.monsterHit(m);
      }
      speed *= 1.3;
    } else {
      if (time > m.wanderAt) {
        m.wanderAt = time + Phaser.Math.Between(2500, 6000);
        m.wanderTo = Math.random() < 0.6 ? this.randomSpot(m.spawn) : null;
      }
      goal = m.wanderTo;
    }

    if (goal) {
      const dx = goal.x - m.x;
      const dy = goal.y - m.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.1) {
        m.wanderTo = null;
      } else {
        const step = Math.min(dist, speed * dt);
        const nx = m.x + (dx / dist) * step;
        const ny = m.y + (dy / dist) * step;
        if (this.monsterCanStand(nx, ny)) {
          m.x = nx;
          m.y = ny;
        } else if (this.monsterCanStand(nx, m.y)) m.x = nx;
        else if (this.monsterCanStand(m.x, ny)) m.y = ny;
        else m.wanderTo = null;
        m.sprite.setFlipX(dx < 0);
      }
    }
    this.syncActor(m);
    if (goal) m.sprite.setScale(1, 1 + Math.sin(time / 120 + m.uid) * 0.05);
    this.drawHpBar(m);
  }

  private monsterCanStand(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1 && !this.map.blocked[ty][tx] && !inTown(x, y);
  }

  // ------------------------------------------------------------ combat

  private attack(m: Monster) {
    const s = this.session;
    const cls = CLASSES[s.char.cls];
    const projectile = cls.projectile;
    let dmg: number;
    if (cls.attackType === 'magic' && s.sp >= MAGIC_SP_COST) {
      s.sp -= MAGIC_SP_COST;
      s.emit();
      dmg = s.derived.matk * Phaser.Math.FloatBetween(0.95, 1.15) - m.def.def / 2;
    } else {
      dmg = s.derived.atk * Phaser.Math.FloatBetween(0.9, 1.1) - m.def.def;
    }
    const crit = Math.random() < 0.05 + s.char.dex * 0.003;
    if (crit) dmg *= 1.5;
    const amount = Math.max(1, Math.round(dmg));

    const land = () => {
      if (m.dead) return;
      m.hp -= amount;
      m.aggro = true;
      this.floatText(m.sprite.x, m.sprite.y - m.sprite.height, crit ? `${amount}!` : `${amount}`, crit ? '#ffef5a' : '#ffffff');
      this.tweens.add({ targets: m.sprite, alpha: 0.4, duration: 60, yoyo: true });
      if (m.hp <= 0) this.killMonster(m);
    };

    this.lunge(this.player, m.x);
    this.shoot(this.player, m, projectile, land);
  }

  /** a small lunge so every attack reads clearly */
  private lunge(a: Actor, towardX: number) {
    this.tweens.add({ targets: a.sprite, x: a.sprite.x + (towardX < a.x ? -5 : 5), duration: 70, yoyo: true });
  }

  /** Attack visual from an attacker to a monster; `land` runs when it hits. */
  private shoot(from_: Actor, m: Monster, projectile: string | null, land: () => void) {
    if (!projectile) {
      this.slash(m);
      land();
      return;
    }
    const from = { x: from_.sprite.x, y: from_.sprite.y - 24 };
    const to = { x: m.sprite.x, y: m.sprite.y - m.sprite.height / 2 };
    const p = this.add.image(from.x, from.y, projectile).setDepth(99999);
    if (projectile === 'wave') p.setRotation(Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y));
    else this.tweens.add({ targets: p, scale: 1.3, duration: 120, yoyo: true, repeat: -1 });
    this.tweens.add({
      targets: p, x: to.x, y: to.y, duration: Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) * 1.6,
      onComplete: () => {
        p.destroy();
        land();
      },
    });
  }

  private slash(m: Monster) {
    const g = this.add.graphics().setDepth(99999);
    g.lineStyle(3, 0xffffff, 0.9);
    const cx = m.sprite.x;
    const cy = m.sprite.y - m.sprite.height / 2;
    g.beginPath();
    g.arc(cx, cy, 16, -2.2, -0.4);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  private monsterHit(m: Monster) {
    if (this.dead) return;
    const s = this.session;
    const dmg = Math.max(1, Math.round(m.def.atk * Phaser.Math.FloatBetween(0.85, 1.15) - s.derived.def));
    s.hp = Math.max(0, s.hp - dmg);
    s.emit();
    this.floatText(this.player.sprite.x, this.player.sprite.y - 50, `${dmg}`, '#ff6b6b');
    this.player.sprite.setTintFill(0xff4444);
    this.time.delayedCall(90, () => this.player.sprite.clearTint());
    this.tweens.add({ targets: m.sprite, y: m.sprite.y - 6, duration: 80, yoyo: true });
    if (!this.target && !this.path.length) this.target = { kind: 'monster', m }; // fight back, like RO auto-counter
    if (s.hp <= 0) this.die();
  }

  private die() {
    this.dead = true;
    this.path = [];
    this.target = null;
    this.player.sprite.setAlpha(0.6).setAngle(90);
    this.monsters.forEach((m) => (m.aggro = false));
    this.hooks.onDeath();
  }

  private killMonster(m: Monster) {
    m.dead = true;
    m.hpBar.clear();
    m.label.setVisible(false);
    m.sprite.disableInteractive();
    this.tweens.add({ targets: m.sprite, alpha: 0, scaleY: 0.2, duration: 400 });
    if (this.target?.kind === 'monster' && this.target.m === m) this.target = null;

    this.session.kill(m.key).then(
      (r) => {
        const bits = [`+${r.exp} EXP`, `+${r.zeny} z`];
        this.hooks.toast(`${m.def.name}: ${bits.join('  ')}`, 'good');
        for (const d of r.drops) this.hooks.toast(`ได้รับ ${ITEMS[d]?.name ?? d}`, 'good');
        if (r.leveledUp) this.levelUpFx(r.character.level);
      },
      (e: Error) => this.hooks.toast(`บันทึกผลไม่ได้: ${e.message}`, 'bad'),
    );

    this.time.delayedCall((m.spawn.respawnSec ?? 8) * 1000, () => {
      const spot = this.randomSpot(m.spawn);
      Object.assign(m, { x: spot.x, y: spot.y, hp: m.def.hp, dead: false, aggro: false });
      m.sprite.setAlpha(1).setScale(1).setInteractive({ useHandCursor: true });
      this.syncActor(m);
      if (m.def.boss) this.hooks.system(`${m.def.name} ปรากฏตัวขึ้นอีกครั้ง!`);
    });
  }

  private levelUpFx(level: number, announce = true) {
    if (announce) {
      this.hooks.system(`เลเวลอัป! ตอนนี้ Lv ${level} ได้แต้มสเตตัสเพิ่ม`);
      this.net.updateInfo({ level });
    }
    const ring = this.add.circle(this.player.sprite.x, this.player.sprite.y - 20, 10, 0xfff27a, 0.6).setDepth(99998);
    this.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: 700, onComplete: () => ring.destroy() });
    this.floatText(this.player.sprite.x, this.player.sprite.y - 70, 'LEVEL UP!', '#fff27a', 22);
  }

  // ------------------------------------------------------------ online (Colyseus)

  private listenRemote(room: Room) {
    const actorOf = (sid: string): Actor | undefined => (sid === room.sessionId ? this.player : this.peers.get(sid));
    const on = (type: string, fn: (msg: any) => void) => this.unsubs.push(room.onMessage(type, fn));

    on('hit', (msg: { by: string; m: string; dmg: number; crit: boolean }) => {
      const m = this.remoteMonsters.get(msg.m);
      const attacker = actorOf(msg.by);
      if (!m) return;
      const cls = attacker === this.player ? CLASSES[this.session.char.cls] : CLASSES[(attacker as Peer | undefined)?.cls ?? 'drummer'];
      const land = () => {
        this.floatText(m.sprite.x, m.sprite.y - m.sprite.height, msg.crit ? `${msg.dmg}!` : `${msg.dmg}`,
          msg.crit ? '#ffef5a' : attacker === this.player ? '#ffffff' : '#bcd7ff');
        this.tweens.add({ targets: m.sprite, alpha: 0.4, duration: 60, yoyo: true });
      };
      if (attacker && attacker !== this.player) this.lunge(attacker, m.x);
      if (attacker) this.shoot(attacker, m, cls.projectile, land);
      else land();
    });
    on('mhit', (msg: { m: string; to: string; dmg: number }) => {
      const victim = actorOf(msg.to);
      const m = this.remoteMonsters.get(msg.m);
      if (m) this.tweens.add({ targets: m.sprite, y: m.sprite.y - 6, duration: 80, yoyo: true });
      if (!victim) return;
      this.floatText(victim.sprite.x, victim.sprite.y - 50, `${msg.dmg}`, '#ff6b6b');
      if (victim === this.player) {
        this.player.sprite.setTintFill(0xff4444);
        this.time.delayedCall(90, () => this.player.sprite.clearTint());
        if (!this.target && !this.path.length && m && !m.dead) this.target = { kind: 'monster', m }; // fight back
      }
    });
    on('reward', (msg: { monster: string; exp: number; zeny: number; drops: string[]; leveledUp: boolean }) => {
      this.hooks.toast(`${MONSTERS[msg.monster]?.name ?? msg.monster}: +${msg.exp} EXP  +${msg.zeny} z`, 'good');
      for (const d of msg.drops) this.hooks.toast(`ได้รับ ${ITEMS[d]?.name ?? d}`, 'good');
      if (msg.leveledUp) this.levelUpFx(0, false);
    });
    on('sync', (msg: { character: Session['char']; inventory: Session['inv'] }) => this.session.applySync(msg.character, msg.inventory));
    on('correct', (msg: { x: number; y: number }) => {
      this.player.x = msg.x;
      this.player.y = msg.y;
      this.path = [];
      this.syncActor(this.player);
    });
    on('healed', () => {
      this.hooks.toast('ครูเพลง: พักเสียงหน่อยนะ (ฟื้น HP/SP เต็ม)', 'good');
      const ring = this.add.circle(this.player.sprite.x, this.player.sprite.y - 20, 8, 0x9be0ff, 0.6).setDepth(99998);
      this.tweens.add({ targets: ring, radius: 40, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    });
    on('used', (msg: { itemId: string }) => this.hooks.toast(`ใช้ ${ITEMS[msg.itemId]?.name ?? msg.itemId}`));
    on('chat', (msg: { name: string; text: string }) => {
      this.hooks.chat(msg.name, msg.text);
      this.bubble(msg.name, msg.text);
    });
    on('system', (msg: { text: string }) => this.hooks.system(msg.text));
    on('error', (msg: { text: string }) => this.hooks.toast(msg.text, 'bad'));
  }

  /** Mirror the server state into sprites, once per frame. */
  private syncRemote(dt: number) {
    const state = this.room!.state as RemoteState | undefined;
    if (!state?.players) return;
    const k = Math.min(1, dt * 10);

    const seenM = new Set<string>();
    state.monsters.forEach((rm, id) => {
      seenM.add(id);
      let m = this.remoteMonsters.get(id);
      if (!m) {
        m = this.spawnMonster(SPAWNS.find((s) => s.monster === rm.key)!, { x: rm.x, y: rm.y });
        m.rid = id;
        m.dead = rm.dead;
        m.sprite.setAlpha(rm.dead ? 0 : 1);
        this.remoteMonsters.set(id, m);
      }
      if (rm.dead && !m.dead) this.fadeMonster(m);
      else if (!rm.dead && m.dead) {
        m.x = rm.x;
        m.y = rm.y;
        this.reviveMonster(m);
      }
      if (Math.abs(rm.x - m.x) > 0.01) m.sprite.setFlipX(rm.x < m.x);
      const moving = Math.hypot(rm.x - m.x, rm.y - m.y) > 0.01;
      m.x += (rm.x - m.x) * k;
      m.y += (rm.y - m.y) * k;
      m.hp = rm.hp;
      this.syncActor(m);
      m.sprite.setScale(1, moving ? 1 + Math.sin(this.time.now / 120 + m.uid) * 0.05 : 1);
      if (!m.dead) this.drawHpBar(m);
    });

    const seenP = new Set<string>();
    state.players.forEach((rp, sid) => {
      if (sid === this.room!.sessionId) {
        const s = this.session;
        if (s.hp !== rp.hp || s.sp !== rp.sp) {
          s.hp = rp.hp;
          s.sp = rp.sp;
          s.emit();
        }
        if (rp.dead && !this.dead) this.die();
        else if (!rp.dead && this.dead) this.revive(rp.x, rp.y);
        return;
      }
      seenP.add(sid);
      if (!this.peers.has(sid)) {
        this.addPeer({ id: sid, name: rp.name, cls: rp.cls as PeerInfo['cls'], level: rp.level, x: rp.x, y: rp.y });
      }
      const peer = this.peers.get(sid)!;
      if (peer.level !== rp.level) {
        peer.level = rp.level;
        peer.label.setText(`${rp.name} Lv${rp.level}`);
      }
      if (Math.abs(rp.x - peer.tx) > 0.01) peer.sprite.setFlipX(rp.x < peer.x);
      peer.tx = rp.x;
      peer.ty = rp.y;
      peer.sprite.setAlpha(rp.dead ? 0.5 : 0.95).setAngle(rp.dead ? 90 : 0);
    });
    for (const id of [...this.peers.keys()]) if (!seenP.has(id)) this.removePeer(id);
  }

  private fadeMonster(m: Monster) {
    m.dead = true;
    m.hpBar.clear();
    m.label.setVisible(false);
    m.sprite.disableInteractive();
    this.tweens.add({ targets: m.sprite, alpha: 0, scaleY: 0.2, duration: 400 });
    if (this.target?.kind === 'monster' && this.target.m === m) this.target = null;
  }

  private reviveMonster(m: Monster) {
    m.dead = false;
    m.hp = m.def.hp;
    m.sprite.setAlpha(1).setScale(1).setInteractive({ useHandCursor: true });
    m.label.setVisible(!!m.def.boss);
    this.syncActor(m);
  }

  private revive(x: number, y: number) {
    this.dead = false;
    this.player.x = x;
    this.player.y = y;
    this.player.sprite.setAlpha(1).setAngle(0);
    this.path = [];
    this.target = null;
    this.syncActor(this.player);
  }

  // ------------------------------------------------------------ npcs, regen, save

  private talk(n: Npc) {
    if (n.id === 'shop') this.hooks.openShop();
    if (n.id === 'healer' && this.room) {
      this.room.send('heal');
    } else if (n.id === 'healer') {
      const s = this.session;
      s.hp = s.derived.maxHp;
      s.sp = s.derived.maxSp;
      s.emit();
      this.hooks.toast('ครูเพลง: พักเสียงหน่อยนะ (ฟื้น HP/SP เต็ม)', 'good');
      const ring = this.add.circle(this.player.sprite.x, this.player.sprite.y - 20, 8, 0x9be0ff, 0.6).setDepth(99998);
      this.tweens.add({ targets: ring, radius: 40, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    }
  }

  private regen() {
    if (this.dead) return;
    const s = this.session;
    const fighting = this.monsters.some((m) => m.aggro && !m.dead);
    if (fighting) return;
    const boost = inTown(this.player.x, this.player.y) ? 4 : 1;
    s.hp = Math.min(s.derived.maxHp, s.hp + Math.ceil((s.derived.maxHp * 0.01 + s.char.vit / 5) * boost));
    s.sp = Math.min(s.derived.maxSp, s.sp + Math.ceil((1 + s.char.int / 6) * boost));
    s.emit();
  }

  private save() {
    if (this.dead) return;
    this.session.save(+this.player.x.toFixed(2), +this.player.y.toFixed(2)).catch(() => {});
  }

  // ------------------------------------------------------------ helpers

  private spawnMonster(spawn: SpawnDef, at?: { x: number; y: number }): Monster {
    const def = MONSTERS[spawn.monster];
    const spot = at ?? this.randomSpot(spawn);
    const sprite = this.add.image(0, 0, `mon_${spawn.monster}`).setOrigin(0.5, 1);
    sprite.setInteractive({ useHandCursor: true, pixelPerfect: false });
    const label = this.makeLabel(`${def.name} Lv${def.level}`, def.boss ? '#ff8a8a' : '#ffffff').setVisible(!!def.boss);
    const m: Monster = {
      uid: this.uidSeq++, key: spawn.monster, def, spawn, x: spot.x, y: spot.y, sprite, label, hp: def.hp, dead: false,
      aggro: false, lastAttack: 0, wanderAt: 0, wanderTo: null, hpBar: this.add.graphics(),
    };
    sprite.setData('monster', m);
    if (!def.boss) {
      sprite.on('pointerover', () => label.setVisible(!m.dead));
      sprite.on('pointerout', () => label.setVisible(false));
    }
    this.monsters.push(m);
    this.syncActor(m);
    return m;
  }

  private randomSpot(s: SpawnDef) {
    const [x0, y0, x1, y1] = s.area;
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.FloatBetween(x0, x1);
      const y = Phaser.Math.FloatBetween(y0, y1);
      if (this.monsterCanStand(x, y)) return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }

  private syncActor(a: Actor) {
    const sx = px(a.x);
    const sy = px(a.y) + 10;
    a.sprite.setPosition(sx, sy).setDepth(sy);
    a.label.setPosition(sx, sy + 2).setDepth(sy + 0.5);
  }

  private drawHpBar(m: Monster) {
    m.hpBar.clear();
    if (m.hp >= m.def.hp) return;
    const w = 32;
    const x = m.sprite.x - w / 2;
    const y = m.sprite.y + 15;
    m.hpBar.setDepth(m.sprite.depth + 0.6);
    m.hpBar.fillStyle(0x000000, 0.6).fillRect(x - 1, y - 1, w + 2, 6);
    m.hpBar.fillStyle(0xe0464b).fillRect(x, y, (w * Math.max(0, m.hp)) / m.def.hp, 4);
  }

  private makeLabel(text: string, color: string) {
    return this.add
      .text(0, 0, text, { fontFamily: 'Kanit, sans-serif', fontSize: '12px', color, stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5, 0);
  }

  private floatText(x: number, y: number, text: string, color: string, size = 16) {
    const t = this.add
      .text(x, y, text, {
        fontFamily: 'Kanit, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#000', strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100001);
    this.tweens.add({ targets: t, y: y - 36, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }
}
