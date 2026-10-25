import { Room, type Client } from 'colyseus';
import { schema, t, type SchemaType } from '@colyseus/schema';
import {
  CLASSES, Character, Derived, ITEMS, InvItem, MAGIC_SP_COST, MONSTERS, SPAWNS, SpawnDef, derive,
} from '../../src/data/index.ts';
import { MAP_H, MAP_W, NPCS, buildMap, inTown } from '../../src/game/map.ts';
import type { JoinOptions, ServerDb } from './db.ts';

const TOWN_SPAWN = { x: 5.5, y: 5.5 };
const TICK_MS = 50;

export const PlayerState = schema({
  name: t.string(),
  cls: t.string(),
  level: t.number(),
  x: t.number(),
  y: t.number(),
  hp: t.number(),
  maxHp: t.number(),
  sp: t.number(),
  maxSp: t.number(),
  dead: t.boolean(),
}, 'PlayerState');
export type PlayerState = SchemaType<typeof PlayerState>;

export const MonsterState = schema({
  key: t.string(),
  x: t.number(),
  y: t.number(),
  hp: t.number(),
  maxHp: t.number(),
  dead: t.boolean(),
}, 'MonsterState');
export type MonsterState = SchemaType<typeof MonsterState>;

export const FieldState = schema({
  players: t.map(PlayerState),
  monsters: t.map(MonsterState),
}, 'FieldState');
export type FieldState = SchemaType<typeof FieldState>;

/** Server-only data about a connected player. */
interface Seat {
  client: Client;
  userId: string;
  char: Character;
  inv: InvItem[];
  derived: Derived;
  lastAttack: number;
  lastMoveAt: number;
  lastChat: number;
  busy: boolean;
}

/** Server-only data about a monster. */
interface Brain {
  spawn: SpawnDef;
  target: string | null; // sessionId
  lastAttack: number;
  wanderAt: number;
  wanderTo: { x: number; y: number } | null;
  damage: Map<string, number>; // sessionId -> damage dealt, for sharing rewards
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const cleanText = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * One shared field map. The server owns monsters, combat, HP and rewards;
 * browsers only send intentions (move here, attack that, use this).
 */
export class FieldRoom extends Room<{ state: FieldState }> {
  static db: ServerDb;

  maxClients = 100;
  private map = buildMap();
  private seats = new Map<string, Seat>();
  private brains = new Map<string, Brain>();
  private now = 0;

  onCreate() {
    this.state = new FieldState();
    for (const n of NPCS) this.map.blocked[n.y][n.x] = true;
    let n = 0;
    for (const s of SPAWNS) {
      for (let i = 0; i < s.count; i++) {
        const id = `m${n++}`;
        const def = MONSTERS[s.monster];
        const spot = this.randomSpot(s);
        const m = new MonsterState();
        Object.assign(m, { key: s.monster, x: spot.x, y: spot.y, hp: def.hp, maxHp: def.hp, dead: false });
        this.state.monsters.set(id, m);
        this.brains.set(id, { spawn: s, target: null, lastAttack: 0, wanderAt: 0, wanderTo: null, damage: new Map() });
      }
    }

    this.onMessage('move', (c, msg: { x: number; y: number }) => this.onMove(c, msg));
    this.onMessage('attack', (c, msg: { id: string }) => this.onAttack(c, msg));
    this.onMessage('heal', (c) => this.onHeal(c));
    this.onMessage('useItem', (c, msg: { invId: string }) => this.onUseItem(c, msg));
    this.onMessage('respawn', (c) => this.onRespawn(c));
    this.onMessage('refresh', (c, msg: JoinOptions) => this.onRefresh(c, msg));
    this.onMessage('chat', (c, msg: { text: string }) => this.onChat(c, msg));

    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
    this.clock.setInterval(() => this.regen(), 2000);
    this.clock.setInterval(() => this.saveAll(), 30000);
  }

  async onAuth(_client: Client, options: JoinOptions) {
    if (!options?.charId) throw new Error('missing character');
    return FieldRoom.db.load(options);
  }

  onJoin(client: Client, _options: JoinOptions, auth: Awaited<ReturnType<ServerDb['load']>>) {
    // the same character logged in twice: drop the older connection
    for (const s of this.seats.values()) if (s.char.id === auth.char.id) s.client.leave();

    const derived = derive(auth.char, auth.inv);
    const c = auth.char;
    let x = c.pos_x;
    let y = c.pos_y;
    if (!this.walkable(x, y)) ({ x, y } = TOWN_SPAWN);
    const p = new PlayerState();
    Object.assign(p, {
      name: c.name, cls: c.cls, level: c.level, x, y,
      maxHp: derived.maxHp, hp: c.hp > 0 ? Math.min(c.hp, derived.maxHp) : derived.maxHp,
      maxSp: derived.maxSp, sp: c.sp >= 0 ? Math.min(c.sp, derived.maxSp) : derived.maxSp,
      dead: false,
    });
    this.state.players.set(client.sessionId, p);
    this.seats.set(client.sessionId, {
      client, userId: auth.userId, char: c, inv: auth.inv, derived, lastAttack: 0, lastMoveAt: this.now, lastChat: 0, busy: false,
    });
    this.broadcast('system', { text: `${c.name} เข้ามาในแผนที่` }, { except: client });
  }

  async onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    this.seats.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    for (const b of this.brains.values()) {
      if (b.target === client.sessionId) b.target = null;
      b.damage.delete(client.sessionId);
    }
    if (seat && p) await this.save(seat, p).catch((e) => console.warn('save failed', e.message));
  }

  async onDispose() {
    await this.saveAll();
  }

  // ------------------------------------------------------------ messages

  private onMove(c: Client, msg: { x: number; y: number }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    if (!p || !seat || p.dead || typeof msg?.x !== 'number' || typeof msg?.y !== 'number') return;
    const elapsed = Math.max(0.05, (this.now - seat.lastMoveAt) / 1000);
    const maxStep = (seat.derived.moveSpeed / 32) * elapsed * 1.5 + 0.75;
    if (dist(p.x, p.y, msg.x, msg.y) > maxStep || !this.walkable(msg.x, msg.y)) {
      c.send('correct', { x: p.x, y: p.y }); // too fast or into a wall
      return;
    }
    seat.lastMoveAt = this.now;
    p.x = msg.x;
    p.y = msg.y;
  }

  private onAttack(c: Client, msg: { id: string }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    const m = this.state.monsters.get(msg?.id);
    const brain = this.brains.get(msg?.id);
    if (!p || !seat || !m || !brain || p.dead || m.dead) return;
    if (this.now - seat.lastAttack < seat.derived.attackDelay * 0.9) return;
    const cls = CLASSES[seat.char.cls];
    const def = MONSTERS[m.key];
    if (dist(p.x, p.y, m.x, m.y) > cls.range + def.size * 0.3 + 0.8) return;
    seat.lastAttack = this.now;

    let dmg: number;
    if (cls.attackType === 'magic' && p.sp >= MAGIC_SP_COST) {
      p.sp -= MAGIC_SP_COST;
      dmg = seat.derived.matk * rand(0.95, 1.15) - def.def / 2;
    } else {
      dmg = seat.derived.atk * rand(0.9, 1.1) - def.def;
    }
    const crit = Math.random() < 0.05 + seat.char.dex * 0.003;
    if (crit) dmg *= 1.5;
    const amount = Math.max(1, Math.round(dmg));

    m.hp = Math.max(0, m.hp - amount);
    brain.damage.set(c.sessionId, (brain.damage.get(c.sessionId) ?? 0) + amount);
    if (!brain.target) brain.target = c.sessionId;
    this.broadcast('hit', { by: c.sessionId, m: msg.id, dmg: amount, crit });
    if (m.hp <= 0) this.killMonster(msg.id, m, brain);
  }

  private onHeal(c: Client) {
    const p = this.state.players.get(c.sessionId);
    const healer = NPCS.find((n) => n.id === 'healer')!;
    if (!p || p.dead || dist(p.x, p.y, healer.x + 0.5, healer.y + 0.5) > 2.5) return;
    p.hp = p.maxHp;
    p.sp = p.maxSp;
    c.send('healed', {});
  }

  private async onUseItem(c: Client, msg: { invId: string }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    if (!p || !seat || p.dead || seat.busy) return;
    seat.busy = true;
    try {
      const itemId = await FieldRoom.db.useItem(seat.userId, seat.char.id, String(msg?.invId));
      const it = ITEMS[itemId];
      p.hp = Math.min(p.maxHp, p.hp + (it.heal ?? 0));
      p.sp = Math.min(p.maxSp, p.sp + (it.sp ?? 0));
      await this.resync(seat);
      c.send('used', { itemId });
    } catch (e) {
      c.send('error', { text: (e as Error).message });
    } finally {
      seat.busy = false;
    }
  }

  private async onRespawn(c: Client) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    if (!p || !seat || !p.dead || seat.busy) return;
    seat.busy = true;
    try {
      seat.char = await FieldRoom.db.onDeath(seat.userId, seat.char.id);
      Object.assign(p, { dead: false, x: TOWN_SPAWN.x, y: TOWN_SPAWN.y, hp: Math.ceil(p.maxHp / 2), sp: Math.ceil(p.maxSp / 2) });
      seat.lastMoveAt = this.now;
      c.send('correct', { x: p.x, y: p.y });
      await this.resync(seat);
    } catch (e) {
      c.send('error', { text: (e as Error).message });
    } finally {
      seat.busy = false;
    }
  }

  /** The browser changed stats/equipment/inventory through the menus: reload them. */
  private async onRefresh(c: Client, msg: JoinOptions) {
    const seat = this.seats.get(c.sessionId);
    const p = this.state.players.get(c.sessionId);
    if (!seat || !p) return;
    try {
      const { char, inv } = await FieldRoom.db.reload(seat.userId, seat.char.id, msg);
      seat.char = char;
      seat.inv = inv;
      this.applyDerived(seat, p);
    } catch (e) {
      c.send('error', { text: (e as Error).message });
    }
  }

  private onChat(c: Client, msg: { text: string }) {
    const seat = this.seats.get(c.sessionId);
    const text = cleanText(msg?.text, 120);
    if (!seat || !text || this.now - seat.lastChat < 700) return;
    seat.lastChat = this.now;
    this.broadcast('chat', { id: c.sessionId, name: seat.char.name, text });
  }

  // ------------------------------------------------------------ simulation

  private tick(dtMs: number) {
    this.now += dtMs;
    const dt = Math.min(dtMs, 100) / 1000;
    this.state.monsters.forEach((m, id) => this.updateMonster(id, m, this.brains.get(id)!, dt));
  }

  private updateMonster(id: string, m: MonsterState, b: Brain, dt: number) {
    if (m.dead) return;
    const def = MONSTERS[m.key];
    const home = { x: (b.spawn.area[0] + b.spawn.area[2]) / 2, y: (b.spawn.area[1] + b.spawn.area[3]) / 2 };

    let target = b.target ? this.state.players.get(b.target) : undefined;
    if (target && (target.dead || inTown(target.x, target.y) || dist(m.x, m.y, home.x, home.y) > 16)) {
      b.target = null;
      target = undefined;
    }
    if (!target && def.aggressive) {
      let best = 5;
      this.state.players.forEach((p, sid) => {
        const d = dist(m.x, m.y, p.x, p.y);
        if (!p.dead && !inTown(p.x, p.y) && d < best) {
          best = d;
          b.target = sid;
          target = p;
        }
      });
    }

    let goal: { x: number; y: number } | null = null;
    let speed = def.speed / 32;
    if (target) {
      const reach = 1.0 + def.size * 0.35;
      if (dist(m.x, m.y, target.x, target.y) > reach) goal = { x: target.x, y: target.y };
      else if (this.now - b.lastAttack > 1600) {
        b.lastAttack = this.now;
        this.monsterHit(id, m, b.target!, target);
      }
      speed *= 1.3;
    } else {
      if (this.now > b.wanderAt) {
        b.wanderAt = this.now + rand(2500, 6000);
        b.wanderTo = Math.random() < 0.6 ? this.randomSpot(b.spawn) : null;
      }
      goal = b.wanderTo;
    }
    if (!goal) return;

    const dx = goal.x - m.x;
    const dy = goal.y - m.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) {
      b.wanderTo = null;
      return;
    }
    const step = Math.min(d, speed * dt);
    const nx = m.x + (dx / d) * step;
    const ny = m.y + (dy / d) * step;
    if (this.monsterCanStand(nx, ny)) {
      m.x = nx;
      m.y = ny;
    } else if (this.monsterCanStand(nx, m.y)) m.x = nx;
    else if (this.monsterCanStand(m.x, ny)) m.y = ny;
    else b.wanderTo = null;
  }

  private monsterHit(id: string, m: MonsterState, sid: string, p: PlayerState) {
    const seat = this.seats.get(sid);
    if (!seat) return;
    const def = MONSTERS[m.key];
    const dmg = Math.max(1, Math.round(def.atk * rand(0.85, 1.15) - seat.derived.def));
    p.hp = Math.max(0, p.hp - dmg);
    this.broadcast('mhit', { m: id, to: sid, dmg });
    if (p.hp <= 0) {
      p.dead = true;
      for (const b of this.brains.values()) if (b.target === sid) b.target = null;
    }
  }

  private killMonster(id: string, m: MonsterState, b: Brain) {
    m.dead = true;
    const def = MONSTERS[m.key];
    // everyone who did at least 10% of the damage gets the full reward (party-friendly boss fights)
    const total = [...b.damage.values()].reduce((s, v) => s + v, 0) || 1;
    const winners = [...b.damage.entries()].filter(([, d]) => d / total >= 0.1).map(([sid]) => sid);
    b.damage.clear();
    b.target = null;
    for (const sid of winners) this.reward(sid, m.key);

    this.clock.setTimeout(() => {
      const spot = this.randomSpot(b.spawn);
      Object.assign(m, { x: spot.x, y: spot.y, hp: def.hp, dead: false });
      b.wanderTo = null;
      if (def.boss) this.broadcast('system', { text: `${def.name} ปรากฏตัวขึ้นอีกครั้ง!` });
    }, (b.spawn.respawnSec ?? 8) * 1000);
    if (def.boss) this.broadcast('system', { text: `${def.name} ถูกปราบแล้ว!` });
  }

  private async reward(sid: string, monster: string) {
    const seat = this.seats.get(sid);
    const p = this.state.players.get(sid);
    if (!seat || !p) return;
    try {
      const r = await FieldRoom.db.reportKill(seat.userId, seat.char.id, monster);
      seat.char = { ...r.character };
      if (r.drops.length) seat.inv = (await FieldRoom.db.reload(seat.userId, seat.char.id)).inv;
      this.applyDerived(seat, p);
      if (r.leveledUp) {
        p.hp = p.maxHp;
        p.sp = p.maxSp;
        this.broadcast('system', { text: `${seat.char.name} เลเวลอัปเป็น Lv ${seat.char.level}!` });
      }
      seat.client.send('reward', { monster, exp: r.exp, zeny: r.zeny, drops: r.drops, leveledUp: r.leveledUp });
      seat.client.send('sync', { character: seat.char, inventory: seat.inv });
    } catch (e) {
      seat.client.send('error', { text: `บันทึกผลไม่ได้: ${(e as Error).message}` });
    }
  }

  private regen() {
    this.state.players.forEach((p, sid) => {
      const seat = this.seats.get(sid);
      if (!seat || p.dead) return;
      const fighting = [...this.brains.values()].some((b) => b.target === sid);
      if (fighting) return;
      const boost = inTown(p.x, p.y) ? 4 : 1;
      p.hp = Math.min(p.maxHp, p.hp + Math.ceil((p.maxHp * 0.01 + seat.char.vit / 5) * boost));
      p.sp = Math.min(p.maxSp, p.sp + Math.ceil((1 + seat.char.int / 6) * boost));
    });
  }

  // ------------------------------------------------------------ helpers

  private applyDerived(seat: Seat, p: PlayerState) {
    seat.derived = derive(seat.char, seat.inv);
    p.level = seat.char.level;
    p.maxHp = seat.derived.maxHp;
    p.maxSp = seat.derived.maxSp;
    p.hp = Math.min(p.hp, p.maxHp);
    p.sp = Math.min(p.sp, p.maxSp);
  }

  private async resync(seat: Seat) {
    const { char, inv } = await FieldRoom.db.reload(seat.userId, seat.char.id);
    seat.char = char;
    seat.inv = inv;
    const p = this.state.players.get(seat.client.sessionId);
    if (p) this.applyDerived(seat, p);
    seat.client.send('sync', { character: seat.char, inventory: seat.inv });
  }

  private save(seat: Seat, p: PlayerState) {
    const pos = p.dead ? TOWN_SPAWN : { x: p.x, y: p.y };
    const hp = p.dead ? Math.ceil(p.maxHp / 2) : p.hp;
    return FieldRoom.db.saveState(seat.userId, seat.char.id, { hp, sp: p.sp, x: pos.x, y: pos.y });
  }

  private async saveAll() {
    await Promise.all(
      [...this.seats.entries()].map(([sid, seat]) => {
        const p = this.state.players.get(sid);
        return p ? this.save(seat, p).catch(() => {}) : undefined;
      }),
    );
  }

  private walkable(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && !this.map.blocked[ty][tx];
  }

  private monsterCanStand(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return tx > 0 && ty > 0 && tx < MAP_W - 1 && ty < MAP_H - 1 && !this.map.blocked[ty][tx] && !inTown(x, y);
  }

  private randomSpot(s: SpawnDef) {
    const [x0, y0, x1, y1] = s.area;
    for (let i = 0; i < 50; i++) {
      const x = rand(x0, x1);
      const y = rand(y0, y1);
      if (this.monsterCanStand(x, y)) return { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
    }
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  }
}
