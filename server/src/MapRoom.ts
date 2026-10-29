import { Room, type Client } from 'colyseus';
import { schema, t, type SchemaType } from '@colyseus/schema';
import {
  Buffs, CLASSES, Character, Derived, ITEMS, InvItem, MAGIC_SP_COST, MONSTERS, SKILLS, SPAWNS, SpawnDef, derive,
  hitChance, monsterFlee, monsterHit, skillHeal, skillPower, skillSp,
} from '../../src/data/index.ts';
import { GameMap, getMap, walkable } from '../../src/game/maps.ts';
import type { TradeOffer } from '../../src/services/store.ts';
import type { JoinOptions, Loaded, ServerDb } from './db.ts';

const TICK_MS = 50;
const TILE_PX = 32; // moveSpeed is in pixels/second at this tile size

export const PlayerState = schema({
  name: t.string(),
  cls: t.string(),
  level: t.number(),
  gender: t.string(),
  hair: t.number(),
  hairColor: t.number(),
  face: t.number(),
  head: t.string(), // equipped headgear item id, for drawing
  x: t.number(),
  y: t.number(),
  hp: t.number(),
  maxHp: t.number(),
  sp: t.number(),
  maxSp: t.number(),
  dead: t.boolean(),
  sitting: t.boolean(),
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

export const MapState = schema({
  map: t.string(),
  players: t.map(PlayerState),
  monsters: t.map(MonsterState),
}, 'MapState');
export type MapState = SchemaType<typeof MapState>;

/** Server-only data about a connected player. */
interface Seat {
  client: Client;
  userId: string;
  char: Character;
  inv: InvItem[];
  derived: Derived;
  buffs: Map<string, { until: number } & Buffs>;
  cooldowns: Map<string, number>;
  lastAttack: number;
  lastMoveAt: number;
  lastChat: number;
  busy: boolean;
  trade?: Trade;
}

interface Trade {
  a: string; // sessionIds
  b: string;
  open: boolean; // both accepted the request
  offers: Record<string, TradeOffer>;
  locked: Record<string, boolean>;
  confirmed: Record<string, boolean>;
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

/** Where a character arrives after taking a portal (set by the room they left). */
const arrivals = new Map<string, { map: string; x: number; y: number; at: number; hp?: number; sp?: number }>();

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const cleanText = (s: unknown, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * One map (town or field). The server owns monsters, combat, skills, HP, rewards and trades;
 * browsers only send intentions (move here, attack that, cast this, offer these items).
 */
export class MapRoom extends Room<{ state: MapState }> {
  static db: ServerDb;

  maxClients = 100;
  private map!: GameMap;
  private seats = new Map<string, Seat>();
  private brains = new Map<string, Brain>();
  private now = 0;

  onCreate(options: { map: string }) {
    this.map = getMap(options.map);
    this.state = new MapState();
    this.state.map = this.map.id;
    let n = 0;
    for (const s of SPAWNS.filter((sp) => sp.map === this.map.id)) {
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
    this.onMessage('skill', (c, msg: { id: string; target?: string }) => this.onSkill(c, msg));
    this.onMessage('sit', (c) => this.onSit(c));
    this.onMessage('heal', (c) => this.onHeal(c));
    this.onMessage('warp', (c) => this.onWarp(c));
    this.onMessage('useItem', (c, msg: { invId: string }) => this.onUseItem(c, msg));
    this.onMessage('respawn', (c) => this.onRespawn(c));
    this.onMessage('refresh', (c, msg: JoinOptions) => this.onRefresh(c, msg));
    this.onMessage('chat', (c, msg: { text: string }) => this.onChat(c, msg));
    this.onMessage('tradeRequest', (c, msg: { to: string }) => this.onTradeRequest(c, msg));
    this.onMessage('tradeRespond', (c, msg: { accept: boolean }) => this.onTradeRespond(c, msg));
    this.onMessage('tradeOffer', (c, msg: TradeOffer) => this.onTradeOffer(c, msg));
    this.onMessage('tradeLock', (c) => this.onTradeLock(c));
    this.onMessage('tradeConfirm', (c) => this.onTradeConfirm(c));
    this.onMessage('tradeCancel', (c) => this.cancelTrade(this.seats.get(c.sessionId)?.trade, 'ยกเลิกการแลกเปลี่ยน'));

    this.setSimulationInterval((dt) => this.tick(dt), TICK_MS);
    this.clock.setInterval(() => this.regen(), 2000);
    this.clock.setInterval(() => this.saveAll(), 30000);
  }

  async onAuth(_client: Client, options: JoinOptions) {
    if (!options?.charId) throw new Error('missing character');
    const t0 = Date.now();
    const loaded = await MapRoom.db.load(options);
    console.log(`join ${this.map.id}: loaded character in ${Date.now() - t0} ms`);
    return loaded;
  }

  onJoin(client: Client, _options: JoinOptions, auth: Loaded) {
    // the same character logged in twice: drop the older connection
    for (const s of this.seats.values()) if (s.char.id === auth.char.id) s.client.leave();

    const c = auth.char;
    const seat: Seat = {
      client, userId: auth.userId, char: c, inv: auth.inv, derived: derive(c, auth.inv), buffs: new Map(),
      cooldowns: new Map(), lastAttack: 0, lastMoveAt: this.now, lastChat: 0, busy: false,
    };
    let { x, y } = this.map.spawn;
    let carry: { hp?: number; sp?: number } = {};
    const arrival = arrivals.get(c.id);
    if (arrival && arrival.map === this.map.id && Date.now() - arrival.at < 60000) {
      ({ x, y } = arrival);
      carry = arrival;
      arrivals.delete(c.id);
    } else if (c.map === this.map.id && walkable(this.map, c.pos_x, c.pos_y)) {
      x = c.pos_x;
      y = c.pos_y;
    }
    const p = new PlayerState();
    Object.assign(p, {
      name: c.name, cls: c.cls, level: c.level, gender: c.gender, hair: c.hair, hairColor: c.hair_color, face: c.face,
      head: '', x, y, maxHp: seat.derived.maxHp, maxSp: seat.derived.maxSp,
      hp: (carry.hp ?? c.hp) > 0 ? Math.min(carry.hp ?? c.hp, seat.derived.maxHp) : seat.derived.maxHp,
      sp: (carry.sp ?? c.sp) >= 0 ? Math.min(carry.sp ?? c.sp, seat.derived.maxSp) : seat.derived.maxSp,
      dead: false, sitting: false,
    });
    this.state.players.set(client.sessionId, p);
    this.seats.set(client.sessionId, seat);
    this.applyDerived(seat, p);
    client.send('welcome', { map: this.map.id, x, y });
    this.broadcast('system', { text: `${c.name} เข้ามาใน${this.map.name}` }, { except: client });
  }

  async onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    const p = this.state.players.get(client.sessionId);
    this.cancelTrade(seat?.trade, 'อีกฝ่ายออกจากแผนที่');
    this.seats.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    for (const b of this.brains.values()) {
      if (b.target === client.sessionId) b.target = null;
      b.damage.delete(client.sessionId);
    }
    // a portal already saved the new map; don't overwrite it
    if (seat && p && !arrivals.has(seat.char.id)) await this.save(seat, p).catch((e) => console.warn('save failed', e.message));
  }

  async onDispose() {
    await this.saveAll();
  }

  // ------------------------------------------------------------ movement, npcs, items

  private onMove(c: Client, msg: { x: number; y: number }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    if (!p || !seat || p.dead || typeof msg?.x !== 'number' || typeof msg?.y !== 'number') return;
    const elapsed = Math.max(0.05, (this.now - seat.lastMoveAt) / 1000);
    const maxStep = (seat.derived.moveSpeed / TILE_PX) * elapsed * 1.5 + 0.75;
    if (dist(p.x, p.y, msg.x, msg.y) > maxStep || !walkable(this.map, msg.x, msg.y)) {
      c.send('correct', { x: p.x, y: p.y }); // too fast or into a wall
      return;
    }
    seat.lastMoveAt = this.now;
    p.x = msg.x;
    p.y = msg.y;
    p.sitting = false;
  }

  private onSit(c: Client) {
    const p = this.state.players.get(c.sessionId);
    if (p && !p.dead) p.sitting = !p.sitting;
  }

  private onHeal(c: Client) {
    const p = this.state.players.get(c.sessionId);
    const healer = this.map.npcs.find((n) => n.id === 'healer');
    if (!p || p.dead || !healer || dist(p.x, p.y, healer.x + 0.5, healer.y + 0.5) > 2.5) return;
    p.hp = p.maxHp;
    p.sp = p.maxSp;
    c.send('healed', {});
  }

  private async onWarp(c: Client) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    const portal = p && this.map.portals.find((pt) => dist(p.x, p.y, pt.x + 0.5, pt.y + 0.5) < 1.6);
    if (!p || !seat || p.dead || !portal) return;
    this.cancelTrade(seat.trade, 'อีกฝ่ายออกจากแผนที่');
    // the next room gets hp/sp from here, so the player doesn't wait for the database save
    arrivals.set(seat.char.id, { map: portal.to, x: portal.toX, y: portal.toY, at: Date.now(), hp: p.hp, sp: p.sp });
    c.send('warp', { map: portal.to });
    MapRoom.db
      .saveState(seat.userId, seat.char.id, { hp: p.hp, sp: p.sp, map: portal.to, x: portal.toX, y: portal.toY })
      .catch((e) => console.warn('warp save failed', e.message));
  }

  private async onUseItem(c: Client, msg: { invId: string }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    if (!p || !seat || p.dead || seat.busy) return;
    seat.busy = true;
    try {
      const itemId = await MapRoom.db.useItem(seat.userId, seat.char.id, String(msg?.invId));
      const it = ITEMS[itemId];
      p.hp = Math.min(p.maxHp, p.hp + (it.heal ?? 0));
      p.sp = Math.min(p.maxSp, p.sp + (it.sp ?? 0));
      await this.resync(seat);
      this.broadcast('fx', { kind: 'potion', to: c.sessionId, item: itemId });
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
      seat.char = await MapRoom.db.onDeath(seat.userId, seat.char.id);
      const half = { hp: Math.ceil(p.maxHp / 2), sp: Math.ceil(p.maxSp / 2) };
      await this.resync(seat);
      if (this.map.id === seat.char.map) {
        Object.assign(p, { dead: false, x: seat.char.pos_x, y: seat.char.pos_y, ...half });
        c.send('correct', { x: p.x, y: p.y });
      } else {
        // revive in town: send the player there
        arrivals.set(seat.char.id, { map: seat.char.map, x: seat.char.pos_x, y: seat.char.pos_y, at: Date.now(), ...half });
        await MapRoom.db.saveState(seat.userId, seat.char.id, { ...half, map: seat.char.map, x: seat.char.pos_x, y: seat.char.pos_y });
        c.send('warp', { map: seat.char.map });
      }
    } catch (e) {
      c.send('error', { text: (e as Error).message });
    } finally {
      seat.busy = false;
    }
  }

  /** The browser changed stats/skills/equipment/inventory through the menus: reload them. */
  private async onRefresh(c: Client, msg: JoinOptions) {
    const seat = this.seats.get(c.sessionId);
    const p = this.state.players.get(c.sessionId);
    if (!seat || !p) return;
    try {
      const { char, inv } = await MapRoom.db.reload(seat.userId, seat.char.id, msg);
      seat.char = char;
      seat.inv = inv;
      this.applyDerived(seat, p);
      if (seat.trade) this.cancelTrade(seat.trade, 'กระเป๋าเปลี่ยน ยกเลิกการแลกเปลี่ยน');
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

  // ------------------------------------------------------------ combat

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
    p.sitting = false;

    if (Math.random() > hitChance(seat.derived.hit, monsterFlee(def))) {
      this.engage(brain, c.sessionId);
      this.broadcast('hit', { by: c.sessionId, m: msg.id, dmg: 0, crit: false });
      return;
    }
    let dmg: number;
    if (cls.attackType === 'magic' && p.sp >= MAGIC_SP_COST) {
      p.sp -= MAGIC_SP_COST;
      dmg = seat.derived.matk * rand(0.95, 1.15) - def.def / 2;
    } else {
      dmg = seat.derived.atk * rand(0.9, 1.1) - def.def;
    }
    const crit = Math.random() < seat.derived.crit / 100;
    if (crit) dmg = dmg * 1.4 + def.def; // crits ignore defense, like RO
    const amount = Math.max(1, Math.round(dmg));
    this.broadcast('hit', { by: c.sessionId, m: msg.id, dmg: amount, crit });
    this.damageMonster(msg.id, m, brain, c.sessionId, amount);
  }

  private onSkill(c: Client, msg: { id: string; target?: string }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    const skill = SKILLS[msg?.id];
    if (!p || !seat || !skill || p.dead) return;
    const lv = seat.char.skills?.[msg.id] ?? 0;
    if (skill.cls !== seat.char.cls || lv < 1 || skill.type === 'passive') return;
    if ((seat.cooldowns.get(msg.id) ?? 0) > this.now) return;
    const sp = skillSp(skill, lv);
    if (p.sp < sp) return c.send('error', { text: 'SP ไม่พอ' });

    // find and validate the target
    let tx = p.x;
    let ty = p.y;
    let monsterId: string | undefined;
    let ally: string | undefined;
    if (skill.type === 'single' || skill.type === 'aoe') {
      const m = this.state.monsters.get(msg.target ?? '');
      if (!m || m.dead) return;
      if (dist(p.x, p.y, m.x, m.y) > (skill.range ?? 1) + MONSTERS[m.key].size * 0.3 + 0.8) return;
      monsterId = msg.target;
      tx = m.x;
      ty = m.y;
    } else if (skill.type === 'heal_target') {
      ally = msg.target && this.state.players.has(msg.target) ? msg.target : c.sessionId;
      const a = this.state.players.get(ally)!;
      if (a.dead || dist(p.x, p.y, a.x, a.y) > (skill.range ?? 1) + 0.8) return;
      tx = a.x;
      ty = a.y;
    }

    p.sp -= sp;
    p.sitting = false;
    seat.cooldowns.set(msg.id, this.now + (skill.cooldown ?? 1000));
    const fx: { by: string; skill: string; x: number; y: number; target?: string; hits: { m?: string; p?: string; dmg: number }[] } = {
      by: c.sessionId, skill: msg.id, x: tx, y: ty, target: monsterId ?? ally, hits: [],
    };
    const base = skill.magic ? seat.derived.matk : seat.derived.atk;
    const power = skillPower(skill, lv) / 100;
    const hitMonster = (id: string, m: MonsterState) => {
      const def = MONSTERS[m.key];
      for (let i = 0; i < (skill.hits ?? 1); i++) {
        const dmg = Math.max(1, Math.round(base * power * rand(0.95, 1.1) - (skill.magic ? def.def / 2 : def.def)));
        fx.hits.push({ m: id, dmg });
        this.damageMonster(id, m, this.brains.get(id)!, c.sessionId, dmg);
        if (m.dead) break;
      }
    };

    if (skill.type === 'single') {
      hitMonster(monsterId!, this.state.monsters.get(monsterId!)!);
    } else if (skill.type === 'aoe' || skill.type === 'aoe_self') {
      this.state.monsters.forEach((m, id) => {
        if (m.dead || dist(tx, ty, m.x, m.y) > (skill.radius ?? 1) + MONSTERS[m.key].size * 0.3) return;
        if (skill.provoke) this.brains.get(id)!.target = c.sessionId;
        hitMonster(id, m);
      });
    } else if (skill.type === 'heal' || skill.type === 'heal_target') {
      const amount = skillHeal(skill, lv) + seat.char.int * 2;
      this.state.players.forEach((a, sid) => {
        if (a.dead) return;
        const inRange = skill.type === 'heal' ? dist(p.x, p.y, a.x, a.y) <= (skill.radius ?? 1) : sid === ally;
        if (!inRange) return;
        a.hp = Math.min(a.maxHp, a.hp + amount);
        fx.hits.push({ p: sid, dmg: -amount });
      });
    } else if (skill.type === 'buff' && skill.buff) {
      seat.buffs.set(msg.id, {
        until: this.now + skill.buff.durationSec * 1000,
        aspdPct: (skill.buff.aspdPct ?? 0) * lv,
        def: (skill.buff.def ?? 0) * lv,
      });
      this.applyDerived(seat, p);
      c.send('buff', { skill: msg.id, seconds: skill.buff.durationSec });
    }
    this.broadcast('skill', fx);
  }

  private engage(b: Brain, sid: string) {
    if (!b.target) b.target = sid;
  }

  private damageMonster(id: string, m: MonsterState, brain: Brain, sid: string, amount: number) {
    if (m.dead) return;
    m.hp = Math.max(0, m.hp - amount);
    brain.damage.set(sid, (brain.damage.get(sid) ?? 0) + amount);
    this.engage(brain, sid);
    if (m.hp <= 0) this.killMonster(id, m, brain);
  }

  // ------------------------------------------------------------ trading

  private onTradeRequest(c: Client, msg: { to: string }) {
    const me = this.seats.get(c.sessionId);
    const other = this.seats.get(msg?.to);
    const pa = this.state.players.get(c.sessionId);
    const pb = this.state.players.get(msg?.to);
    if (!me || !other || !pa || !pb || me === other) return;
    if (me.trade || other.trade) return c.send('error', { text: 'อีกฝ่ายกำลังแลกเปลี่ยนอยู่' });
    if (dist(pa.x, pa.y, pb.x, pb.y) > 6) return c.send('error', { text: 'อยู่ไกลเกินไป เดินเข้าไปใกล้ ๆ ก่อน' });
    const trade: Trade = {
      a: c.sessionId, b: msg.to, open: false,
      offers: { [c.sessionId]: { items: [], zeny: 0 }, [msg.to]: { items: [], zeny: 0 } },
      locked: {}, confirmed: {},
    };
    me.trade = trade;
    other.trade = trade;
    other.client.send('tradeInvite', { from: c.sessionId, name: me.char.name, level: me.char.level });
    c.send('system', { text: `ส่งคำขอแลกเปลี่ยนไปที่ ${other.char.name} แล้ว` });
  }

  private onTradeRespond(c: Client, msg: { accept: boolean }) {
    const seat = this.seats.get(c.sessionId);
    const trade = seat?.trade;
    if (!trade || trade.b !== c.sessionId || trade.open) return;
    if (!msg?.accept) return this.cancelTrade(trade, `${seat.char.name} ปฏิเสธการแลกเปลี่ยน`);
    trade.open = true;
    this.sendTrade(trade);
  }

  private onTradeOffer(c: Client, msg: TradeOffer) {
    const seat = this.seats.get(c.sessionId);
    const trade = seat?.trade;
    if (!seat || !trade?.open || trade.locked[c.sessionId]) return;
    // only keep what the player really has
    const items: TradeOffer['items'] = [];
    for (const o of Array.isArray(msg?.items) ? msg.items.slice(0, 10) : []) {
      const row = seat.inv.find((i) => i.id === o?.inv);
      const qty = Math.floor(Number(o?.qty));
      if (row && !row.equipped && qty >= 1 && qty <= row.qty && !items.some((x) => x.inv === row.id)) items.push({ inv: row.id, qty });
    }
    const zeny = Math.max(0, Math.min(seat.char.zeny, Math.floor(Number(msg?.zeny) || 0)));
    trade.offers[c.sessionId] = { items, zeny };
    trade.locked = {};
    trade.confirmed = {};
    this.sendTrade(trade);
  }

  private onTradeLock(c: Client) {
    const trade = this.seats.get(c.sessionId)?.trade;
    if (!trade?.open) return;
    trade.locked[c.sessionId] = true;
    this.sendTrade(trade);
  }

  private async onTradeConfirm(c: Client) {
    const trade = this.seats.get(c.sessionId)?.trade;
    if (!trade?.open || !trade.locked[trade.a] || !trade.locked[trade.b]) return;
    trade.confirmed[c.sessionId] = true;
    this.sendTrade(trade);
    if (!trade.confirmed[trade.a] || !trade.confirmed[trade.b]) return;

    const sa = this.seats.get(trade.a)!;
    const sb = this.seats.get(trade.b)!;
    sa.trade = undefined;
    sb.trade = undefined;
    try {
      await MapRoom.db.trade(
        { userId: sa.userId, charId: sa.char.id, offer: trade.offers[trade.a] },
        { userId: sb.userId, charId: sb.char.id, offer: trade.offers[trade.b] },
      );
      for (const s of [sa, sb]) {
        s.client.send('tradeDone', { ok: true });
        await this.resync(s);
      }
    } catch (e) {
      for (const s of [sa, sb]) s.client.send('tradeDone', { ok: false, text: (e as Error).message });
    }
  }

  private sendTrade(trade: Trade) {
    for (const [me, other] of [[trade.a, trade.b], [trade.b, trade.a]]) {
      const seat = this.seats.get(me);
      const otherSeat = this.seats.get(other);
      if (!seat || !otherSeat) continue;
      // show the other side's items by item id (their inventory ids mean nothing to us)
      const theirs = trade.offers[other].items.map((o) => ({
        item: otherSeat.inv.find((i) => i.id === o.inv)?.item_id ?? '', qty: o.qty,
      }));
      seat.client.send('tradeState', {
        with: otherSeat.char.name,
        mine: trade.offers[me],
        theirs: { items: theirs, zeny: trade.offers[other].zeny },
        lockedMine: !!trade.locked[me], lockedTheirs: !!trade.locked[other],
        confirmedMine: !!trade.confirmed[me], confirmedTheirs: !!trade.confirmed[other],
      });
    }
  }

  private cancelTrade(trade: Trade | undefined, text: string) {
    if (!trade) return;
    for (const sid of [trade.a, trade.b]) {
      const s = this.seats.get(sid);
      if (s?.trade === trade) {
        s.trade = undefined;
        s.client.send('tradeClosed', { text });
      }
    }
  }

  // ------------------------------------------------------------ simulation

  private tick(dtMs: number) {
    this.now += dtMs;
    const dt = Math.min(dtMs, 100) / 1000;
    this.state.monsters.forEach((m, id) => this.updateMonster(id, m, this.brains.get(id)!, dt));
    for (const [sid, seat] of this.seats) {
      let changed = false;
      for (const [k, b] of seat.buffs) {
        if (b.until <= this.now) {
          seat.buffs.delete(k);
          changed = true;
        }
      }
      const p = this.state.players.get(sid);
      if (changed && p) this.applyDerived(seat, p);
    }
  }

  private updateMonster(id: string, m: MonsterState, b: Brain, dt: number) {
    if (m.dead) return;
    const def = MONSTERS[m.key];
    const home = { x: (b.spawn.area[0] + b.spawn.area[2]) / 2, y: (b.spawn.area[1] + b.spawn.area[3]) / 2 };

    let target = b.target ? this.state.players.get(b.target) : undefined;
    if (target && (target.dead || dist(m.x, m.y, home.x, home.y) > 18)) {
      b.target = null;
      target = undefined;
    }
    if (!target && def.aggressive) {
      let best = 5;
      this.state.players.forEach((p, sid) => {
        const d = dist(m.x, m.y, p.x, p.y);
        if (!p.dead && d < best) {
          best = d;
          b.target = sid;
          target = p;
        }
      });
    }

    let goal: { x: number; y: number } | null = null;
    let speed = def.speed / TILE_PX;
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
    if (Math.random() > hitChance(monsterHit(def), seat.derived.flee)) {
      this.broadcast('mhit', { m: id, to: sid, dmg: 0 });
      return;
    }
    const dmg = Math.max(1, Math.round(def.atk * rand(0.85, 1.15) - seat.derived.def));
    p.hp = Math.max(0, p.hp - dmg);
    p.sitting = false;
    this.broadcast('mhit', { m: id, to: sid, dmg });
    if (p.hp <= 0) {
      p.dead = true;
      this.cancelTrade(seat.trade, 'อีกฝ่ายหมดสติ');
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
      const r = await MapRoom.db.reportKill(seat.userId, seat.char.id, monster);
      seat.char = { ...r.character };
      if (r.drops.length) seat.inv = (await MapRoom.db.reload(seat.userId, seat.char.id)).inv;
      this.applyDerived(seat, p);
      if (r.leveledUp) {
        p.hp = p.maxHp;
        p.sp = p.maxSp;
        this.broadcast('fx', { kind: 'levelup', to: sid });
        this.broadcast('system', { text: `${seat.char.name} เลเวลอัปเป็น Base Lv ${seat.char.level}!` });
      }
      if (r.jobLeveledUp) this.broadcast('fx', { kind: 'joblevelup', to: sid });
      seat.client.send('reward', {
        monster, exp: r.exp, jobExp: r.jobExp, zeny: r.zeny, drops: r.drops, leveledUp: r.leveledUp, jobLeveledUp: r.jobLeveledUp,
      });
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
      const overweight = seat.derived.weight >= seat.derived.maxWeight * 0.9;
      if (overweight) return;
      const boost = (this.map.safe ? 3 : 1) * (p.sitting ? 2 : 1);
      p.hp = Math.min(p.maxHp, p.hp + Math.ceil((p.maxHp * 0.01 + seat.char.vit / 5) * boost));
      p.sp = Math.min(p.maxSp, p.sp + Math.ceil((1 + seat.char.int / 6) * boost));
    });
  }

  // ------------------------------------------------------------ helpers

  private applyDerived(seat: Seat, p: PlayerState) {
    const buffs: Buffs = { aspdPct: 0, def: 0 };
    for (const b of seat.buffs.values()) {
      buffs.aspdPct! += b.aspdPct ?? 0;
      buffs.def! += b.def ?? 0;
    }
    seat.derived = derive(seat.char, seat.inv, buffs);
    p.level = seat.char.level;
    p.maxHp = seat.derived.maxHp;
    p.maxSp = seat.derived.maxSp;
    p.hp = Math.min(p.hp, p.maxHp);
    p.sp = Math.min(p.sp, p.maxSp);
    p.head = seat.inv.find((i) => i.equipped && ITEMS[i.item_id]?.type === 'head')?.item_id ?? '';
    seat.client.send('derived', { derived: seat.derived });
  }

  private async resync(seat: Seat) {
    const { char, inv } = await MapRoom.db.reload(seat.userId, seat.char.id);
    seat.char = char;
    seat.inv = inv;
    const p = this.state.players.get(seat.client.sessionId);
    if (p) this.applyDerived(seat, p);
    seat.client.send('sync', { character: seat.char, inventory: seat.inv });
  }

  private save(seat: Seat, p: PlayerState) {
    if (p.dead) {
      return MapRoom.db.saveState(seat.userId, seat.char.id, {
        hp: Math.ceil(p.maxHp / 2), sp: p.sp, map: 'town', x: getMap('town').spawn.x, y: getMap('town').spawn.y,
      });
    }
    return MapRoom.db.saveState(seat.userId, seat.char.id, { hp: p.hp, sp: p.sp, map: this.map.id, x: p.x, y: p.y });
  }

  private async saveAll() {
    await Promise.all(
      [...this.seats.entries()].map(([sid, seat]) => {
        const p = this.state.players.get(sid);
        return p ? this.save(seat, p).catch(() => {}) : undefined;
      }),
    );
  }

  private monsterCanStand(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= this.map.w - 1 || ty >= this.map.h - 1 || this.map.blocked[ty][tx]) return false;
    // keep monsters away from portals so arrivals are safe
    return !this.map.portals.some((pt) => dist(x, y, pt.x, pt.y) < 5);
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
