import { Room, type Client } from 'colyseus';
import { schema, t, type SchemaType } from '@colyseus/schema';
import {
  Buffs, CLASSES, CROWD_MAX, Character, Derived, ENDOW_SEC, ITEMS, type Element, elementMult, monsterElement, InvItem, JOB_CHANGE, MAGIC_SP_COST, MONSTERS, SKILLS, SPAWNS, SpawnDef, derive,
  STAT_KEYS, buffBlocks, buffStats, canUseSkill, debuffSec, isHealerBuff, type MonsterDef, type SkillDef, hitChance, monsterFlee, monsterHit, questCounts,
  skillHeal, skillPower, skillSp, skillStatMult, targetsMonster, targetsPlayer, totalStats, outfitOf,
} from '../../src/data/index.ts';
import { GameMap, WARP_TOWNS, getMap, walkable } from '../../src/game/maps.ts';
import type { RewardShare, TradeOffer } from '../../src/services/store.ts';
import type { JoinOptions, Loaded, ServerDb } from './db.ts';
import { Parties, type Party } from './party.ts';

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
  weapon: t.string(), // equipped weapon item id ('' = bare hands), for drawing
  ear: t.string(), // equipped headphones item id, for drawing
  body: t.string(), // equipped outfit item id (armor with a VRoid model, '' = none): the character's look
  x: t.number(),
  y: t.number(),
  hp: t.number(),
  maxHp: t.number(),
  sp: t.number(),
  maxSp: t.number(),
  dead: t.boolean(),
  sitting: t.boolean(),
  hidden: t.boolean(), // หนีไปกลับ PR: other players don't draw this one
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
type SeatBuff = {
  until: number;
  blocks?: number;
  /** % of monster damage hit back (จังหวะยก), % faster HP regen (ลูกส่ง), % of party members' damage taken over (Kick Drum) */
  reflectPct?: number;
  regenPct?: number;
  guardPct?: number;
  /** หนีไปกลับ PR */
  stealth?: boolean;
} & Buffs;

/** Buff key of an element converter on the weapon (one at a time). */
const ENDOW_KEY = (itemId: string) => `item:${itemId}`;

interface Seat {
  client: Client;
  userId: string;
  char: Character;
  inv: InvItem[];
  derived: Derived;
  /** skill id -> buff; `blocks` = physical hits a shield buff still stops. */
  buffs: Map<string, SeatBuff>;
  cooldowns: Map<string, number>;
  lastAttack: number;
  lastMoveAt: number;
  lastChat: number;
  busy: boolean;
  trade?: Trade;
  /** A skill being cast (เสียงสูง): goes off when the timer fires unless the player moves first. */
  cast?: { id: string; sp: number; timer: { clear(): void } };
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
  /** Palm muting: Def lowered by defDownPct % until defDownUntil; pulled monsters don't give up the chase until pulledUntil */
  defDownUntil?: number;
  defDownPct?: number;
  pulledUntil?: number;
}

/** Where a character arrives after taking a portal (set by the room they left). */
const arrivals = new Map<string, {
  map: string; x: number; y: number; at: number; hp?: number; sp?: number;
  /** an element converter still on the weapon: which item, and when it wears off (Date.now() ms) */
  endow?: { item: string; until: number };
}>();

/** Where a skill was aimed: a monster, a player, or just a spot. */
interface Aim {
  x: number;
  y: number;
  monster?: string;
  ally?: string;
}

/** The 'skill' message every browser gets to draw a skill. `at` = ms after the message that the hit lands (waves). */
interface SkillFx {
  by: string;
  skill: string;
  x: number;
  y: number;
  target?: string;
  allies?: string[];
  fromX?: number;
  fromY?: number;
  dirX?: number;
  dirY?: number;
  bonus?: boolean;
  pulled?: string[];
  hits: { m?: string; p?: string; dmg: number; at?: number }[];
}

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
    this.onMessage('npcWarp', (c, msg: { to: string }) => this.onNpcWarp(c, msg));
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
    // parties (see party.ts): `to` is a session id in this room, `id` a character id
    this.onMessage('partyGet', (c) => this.party(c, (me) => Parties.refresh(me)));
    this.onMessage('partyCreate', (c, msg: { name?: string }) => this.party(c, (me) => Parties.create(me, msg?.name)));
    this.onMessage('partyInvite', (c, msg: { to?: string; name?: string }) => this.party(c, (me) => {
      const charId = msg?.to ? this.seats.get(msg.to)?.char.id : undefined;
      if (msg?.to && !charId) throw new Error('ผู้เล่นคนนี้ออกไปแล้ว');
      Parties.invite(me, { charId, name: msg?.name });
    }));
    this.onMessage('partyRespond', (c, msg: { accept: boolean }) => this.party(c, (me) => Parties.respond(me, !!msg?.accept)));
    this.onMessage('partyLeave', (c) => this.party(c, (me) => Parties.leave(me)));
    this.onMessage('partyKick', (c, msg: { id: string }) => this.party(c, (me) => Parties.kick(me, msg?.id)));
    this.onMessage('partyLeader', (c, msg: { id: string }) => this.party(c, (me) => Parties.setLeader(me, msg?.id)));

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
    let carry: { hp?: number; sp?: number; endow?: { item: string; until: number } } = {};
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
      head: '', weapon: '', ear: '', body: '', hidden: false, x, y, maxHp: seat.derived.maxHp, maxSp: seat.derived.maxSp,
      hp: (carry.hp ?? c.hp) > 0 ? Math.min(carry.hp ?? c.hp, seat.derived.maxHp) : seat.derived.maxHp,
      sp: (carry.sp ?? c.sp) >= 0 ? Math.min(carry.sp ?? c.sp, seat.derived.maxSp) : seat.derived.maxSp,
      dead: false, sitting: false,
    });
    this.state.players.set(client.sessionId, p);
    this.seats.set(client.sessionId, seat);
    if (carry.endow && carry.endow.until > Date.now() && ITEMS[carry.endow.item]?.endow) {
      const left = carry.endow.until - Date.now();
      seat.buffs.set(ENDOW_KEY(carry.endow.item), { until: this.now + left, endow: ITEMS[carry.endow.item].endow });
      client.send('buff', { skill: ENDOW_KEY(carry.endow.item), seconds: left / 1000 });
    }
    this.applyDerived(seat, p);
    client.send('welcome', { map: this.map.id, x, y });
    Parties.online({
      charId: c.id, sessionId: client.sessionId, roomId: this.roomId, map: this.map.id, client,
      info: () => ({ name: seat.char.name, cls: seat.char.cls, level: seat.char.level, hp: p.hp, maxHp: p.maxHp, sp: p.sp, maxSp: p.maxSp, dead: p.dead }),
    });
    this.broadcast('system', { text: `${c.name} เข้ามาใน${this.map.name}` }, { except: client });
  }

  async onLeave(client: Client) {
    const seat = this.seats.get(client.sessionId);
    seat?.cast?.timer.clear();
    const p = this.state.players.get(client.sessionId);
    this.cancelTrade(seat?.trade, 'อีกฝ่ายออกจากแผนที่');
    if (seat) Parties.offline(seat.char.id, client.sessionId);
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
    if (seat.cast && dist(p.x, p.y, msg.x, msg.y) > 0.05) this.cancelCast(c.sessionId, seat, p);
    p.x = msg.x;
    p.y = msg.y;
    p.sitting = false;
  }

  /** Moving breaks a cast: the SP comes back and the skill can be used again straight away. */
  private cancelCast(sid: string, seat: Seat, p: PlayerState) {
    const cast = seat.cast;
    if (!cast) return;
    cast.timer.clear();
    seat.cast = undefined;
    seat.cooldowns.delete(cast.id);
    p.sp = Math.min(p.maxSp, p.sp + cast.sp);
    this.broadcast('castEnd', { by: sid, skill: cast.id, done: false });
  }

  private onSit(c: Client) {
    const p = this.state.players.get(c.sessionId);
    if (p && !p.dead) p.sitting = !p.sitting;
  }

  private onHeal(c: Client) {
    const p = this.state.players.get(c.sessionId);
    const healer = this.map.npcs.find((n) => n.id === 'healer');
    if (!p || p.dead || !healer || dist(p.x, p.y, healer.x + 0.5, healer.y + 0.5) > 2.5) return;
    // ครูเพลงใจดี also hands out every buff skill in the game, each at its max level
    const seat = this.seats.get(c.sessionId);
    if (seat) {
      for (const [id, skill] of Object.entries(SKILLS)) {
        if (!isHealerBuff(skill)) continue;
        const b = this.buffFor(skill, skill.maxLevel);
        seat.buffs.set(id, b);
        c.send('buff', { skill: id, seconds: skill.buff!.durationSec, blocks: b.blocks || undefined, from: 'healer' });
      }
      this.applyDerived(seat, p);
    }
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
    arrivals.set(seat.char.id, { map: portal.to, x: portal.toX, y: portal.toY, at: Date.now(), hp: p.hp, sp: p.sp, endow: this.endowOf(seat) });
    c.send('warp', { map: portal.to });
    MapRoom.db
      .saveState(seat.userId, seat.char.id, { hp: p.hp, sp: p.sp, map: portal.to, x: portal.toX, y: portal.toY })
      .catch((e) => console.warn('warp save failed', e.message));
  }

  /** บูรพา's paid warp to another town: the fare comes off in the same database call that moves the character. */
  private async onNpcWarp(c: Client, msg: { to: string }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    const npc = this.map.npcs.find((n) => n.id === 'warper');
    const dest = WARP_TOWNS.find((t) => t.map === msg?.to);
    if (!p || !seat || p.dead || seat.busy || !npc || !dest || dest.map === this.map.id) return;
    if (dist(p.x, p.y, npc.x + 0.5, npc.y + 0.5) > 3) return c.send('error', { text: 'เดินเข้าไปใกล้บูรพาก่อน' });
    if (seat.char.zeny < dest.cost) return c.send('error', { text: `Zeny ไม่พอ (ค่าวาร์ป ${dest.cost.toLocaleString()} z)` });
    seat.busy = true;
    this.cancelTrade(seat.trade, 'อีกฝ่ายวาร์ปออกไปแล้ว');
    try {
      const to = getMap(dest.map).spawn;
      seat.char = await MapRoom.db.payWarp(seat.userId, seat.char.id, dest.cost, { hp: p.hp, sp: p.sp, map: dest.map, x: to.x, y: to.y });
      arrivals.set(seat.char.id, { map: dest.map, x: to.x, y: to.y, at: Date.now(), hp: p.hp, sp: p.sp, endow: this.endowOf(seat) });
      c.send('sync', { character: seat.char, inventory: seat.inv });
      c.send('warp', { map: dest.map });
    } catch (e) {
      c.send('error', { text: (e as Error).message });
    } finally {
      seat.busy = false;
    }
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
      if (it.endow) {
        // an element converter: replaces any other one on the weapon
        for (const k of [...seat.buffs.keys()]) {
          if (seat.buffs.get(k)!.endow) {
            seat.buffs.delete(k);
            c.send('buff', { skill: k, seconds: 0 });
          }
        }
        seat.buffs.set(ENDOW_KEY(itemId), { until: this.now + ENDOW_SEC * 1000, endow: it.endow });
        c.send('buff', { skill: ENDOW_KEY(itemId), seconds: ENDOW_SEC });
      }
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
    const party = /^(?:\/p(?:\s+|$)|%\s*)/i.exec(text);
    if (party) {
      const said = text.slice(party[0].length).trim();
      if (said) this.party(c, (me) => Parties.chat(me, said));
      return;
    }
    this.broadcast('chat', { id: c.sessionId, name: seat.char.name, text });
  }

  // ------------------------------------------------------------ combat

  private onAttack(c: Client, msg: { id: string }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    const m = this.state.monsters.get(msg?.id);
    const brain = this.brains.get(msg?.id);
    if (!p || !seat || !m || !brain || p.dead || m.dead || seat.cast) return;
    if (this.now - seat.lastAttack < seat.derived.attackDelay * 0.9) return;
    const cls = CLASSES[seat.char.cls];
    const def = MONSTERS[m.key];
    if (dist(p.x, p.y, m.x, m.y) > cls.range + def.size * 0.3 + 0.8) return;
    seat.lastAttack = this.now;
    p.sitting = false;
    this.unhide(c.sessionId, seat, p); // attacking gives a hidden drummer away

    if (Math.random() > hitChance(seat.derived.hit, monsterFlee(def))) {
      this.engage(brain, c.sessionId);
      this.broadcast('hit', { by: c.sessionId, m: msg.id, dmg: 0, crit: false });
      return;
    }
    let dmg: number;
    if (cls.attackType === 'magic' && p.sp >= MAGIC_SP_COST) {
      p.sp -= MAGIC_SP_COST;
      dmg = seat.derived.matk * rand(0.95, 1.15) - this.monsterDef(brain, def) / 2;
    } else {
      dmg = seat.derived.atk * rand(0.9, 1.1) - this.monsterDef(brain, def);
    }
    const crit = Math.random() < seat.derived.crit / 100;
    if (crit) dmg = dmg * 1.4 + this.monsterDef(brain, def); // crits ignore defense, like RO
    const mult = this.elementVs(seat.derived.atkElement, def);
    const amount = mult === 0 ? 0 : Math.max(1, Math.round(dmg * mult));
    this.broadcast('hit', { by: c.sessionId, m: msg.id, dmg: amount, crit, el: this.elTag(mult) });
    if (amount > 0) this.damageMonster(msg.id, m, brain, c.sessionId, amount);
    else this.engage(brain, c.sessionId);
  }

  private onSkill(c: Client, msg: { id: string; target?: string }) {
    const p = this.state.players.get(c.sessionId);
    const seat = this.seats.get(c.sessionId);
    const skill = SKILLS[msg?.id];
    if (!p || !seat || !skill || p.dead || seat.cast) return;
    const lv = seat.char.skills?.[msg.id] ?? 0;
    if (!canUseSkill(skill, seat.char.cls) || lv < 1 || skill.type === 'passive') return;
    if ((seat.cooldowns.get(msg.id) ?? 0) > this.now) return;
    const sp = skillSp(skill, lv);
    if (p.sp < sp) return c.send('error', { text: 'SP ไม่พอ' });

    // find and validate the target
    const aim: Aim = { x: p.x, y: p.y };
    if (targetsMonster(skill)) {
      const m = this.state.monsters.get(msg.target ?? '');
      if (!m || m.dead) return;
      if (dist(p.x, p.y, m.x, m.y) > (skill.range ?? 1) + MONSTERS[m.key].size * 0.3 + 0.8) return;
      Object.assign(aim, { monster: msg.target, x: m.x, y: m.y });
    } else if (targetsPlayer(skill)) {
      aim.ally = msg.target && this.state.players.has(msg.target) ? msg.target : c.sessionId;
      const a = this.state.players.get(aim.ally)!;
      if (a.dead || dist(p.x, p.y, a.x, a.y) > (skill.range ?? 1) + 0.8) return;
      aim.x = a.x;
      aim.y = a.y;
    }

    p.sp -= sp;
    p.sitting = false;
    seat.cooldowns.set(msg.id, this.now + (skill.cooldown ?? 1000));
    if (skill.castMs) {
      // เสียงสูง: stand still and sing for castMs, then it goes off towards where the target was
      const sid = c.sessionId;
      const timer = this.clock.setTimeout(() => {
        if (seat.cast?.timer !== timer) return;
        seat.cast = undefined;
        const me = this.state.players.get(sid);
        if (!me || me.dead || this.seats.get(sid) !== seat) return;
        this.broadcast('castEnd', { by: sid, skill: msg.id, done: true });
        this.useSkill(c, seat, me, msg.id, skill, lv, aim);
      }, skill.castMs);
      seat.cast = { id: msg.id, sp, timer };
      this.broadcast('cast', { by: sid, skill: msg.id, ms: skill.castMs, x: aim.x, y: aim.y });
      return;
    }
    this.useSkill(c, seat, p, msg.id, skill, lv, aim);
  }

  private useSkill(c: Client, seat: Seat, p: PlayerState, id: string, skill: SkillDef, lv: number, aim: Aim) {
    const { x: tx, y: ty } = aim;
    let monsterId = aim.monster;
    if (monsterId && this.state.monsters.get(monsterId)?.dead) monsterId = undefined;
    const ally = aim.ally;
    const fx: SkillFx = { by: c.sessionId, skill: id, x: tx, y: ty, target: monsterId ?? ally, hits: [] };
    const base = skill.magic ? seat.derived.matk : seat.derived.atk;
    let power = (skillPower(skill, lv) / 100) * skillStatMult(skill, totalStats(seat.char, seat.derived), seat.derived.hit);
    // จังหวะส่ง from hiding, Slide with Vibrato on
    if (skill.bonusIf && seat.buffs.has(skill.bonusIf.buff)) {
      power *= skill.bonusIf.mult;
      fx.bonus = true;
    }
    // attack skills give a hidden drummer away
    if (skill.power) this.unhide(c.sessionId, seat, p);
    if (skill.scale === 'distance' && monsterId) {
      // dash next to the monster; damage x tiles dashed
      const m = this.state.monsters.get(monsterId)!;
      const d = dist(p.x, p.y, m.x, m.y);
      const stop = Math.min(d, 0.8 + MONSTERS[m.key].size * 0.3);
      const nx = m.x - ((m.x - p.x) / Math.max(d, 0.01)) * stop;
      const ny = m.y - ((m.y - p.y) / Math.max(d, 0.01)) * stop;
      power *= Math.max(1, Math.min(skill.range ?? 5, d));
      Object.assign(fx, { fromX: p.x, fromY: p.y });
      if (walkable(this.map, nx, ny)) {
        p.x = nx;
        p.y = ny;
        seat.lastMoveAt = this.now;
        c.send('correct', { x: nx, y: ny });
      }
    } else if (skill.scale === 'crowd') {
      // damage x monsters around you
      let n = 0;
      this.state.monsters.forEach((m) => {
        if (!m.dead && dist(tx, ty, m.x, m.y) <= (skill.radius ?? 1) + MONSTERS[m.key].size * 0.3) n++;
      });
      power *= Math.max(1, Math.min(CROWD_MAX, n));
    }
    const element: Element = skill.element ?? seat.derived.atkElement ?? 'neutral';
    const rollDamage = (m: MonsterState, brain: Brain) => {
      const def = this.monsterDef(brain, MONSTERS[m.key]);
      const mult = this.elementVs(element, MONSTERS[m.key]);
      if (mult === 0) return 0;
      return Math.max(1, Math.round((base * power * rand(0.95, 1.1) - (skill.magic ? def / 2 : def)) * mult));
    };
    const hitMonster = (mid: string, m: MonsterState) => {
      const brain = this.brains.get(mid)!;
      for (let i = 0; i < (skill.hits ?? 1); i++) {
        const dmg = rollDamage(m, brain);
        fx.hits.push({ m: mid, dmg });
        if (dmg > 0) this.damageMonster(mid, m, brain, c.sessionId, dmg);
        else this.engage(brain, c.sessionId);
        if (m.dead) break;
      }
      if (skill.knockback && !m.dead) this.knockBack(m, brain, p.x, p.y, skill.knockback);
    };

    if (skill.type === 'single' && monsterId) {
      hitMonster(monsterId, this.state.monsters.get(monsterId)!);
    } else if (skill.type === 'line') {
      // a wave that travels from you towards the target: everything in its path gets hit when the wave gets there
      const len = Math.hypot(tx - p.x, ty - p.y) || 1;
      const ux = (tx - p.x) / len;
      const uy = (ty - p.y) / len;
      const ox = p.x;
      const oy = p.y;
      const speed = skill.speed ?? 10;
      Object.assign(fx, { fromX: ox, fromY: oy, dirX: ux, dirY: uy });
      this.state.monsters.forEach((m, mid) => {
        if (m.dead) return;
        const r = MONSTERS[m.key].size * 0.3;
        const along = (m.x - ox) * ux + (m.y - oy) * uy;
        const side = Math.abs((m.x - ox) * uy - (m.y - oy) * ux);
        if (along < -0.5 || along > (skill.length ?? 5) + r || side > (skill.width ?? 1) / 2 + r) return;
        const at = Math.round((Math.max(0, along) / speed) * 1000);
        const brain = this.brains.get(mid)!;
        const dmg = rollDamage(m, brain);
        fx.hits.push({ m: mid, dmg, at });
        this.clock.setTimeout(() => {
          if (!m.dead && this.seats.has(c.sessionId) && dmg > 0) this.damageMonster(mid, m, brain, c.sessionId, dmg);
        }, at);
      });
    } else if (skill.type === 'aoe' || skill.type === 'aoe_self') {
      const until = this.now + debuffSec(skill, lv) * 1000;
      const pulled: string[] = [];
      this.state.monsters.forEach((m, mid) => {
        if (m.dead || dist(tx, ty, m.x, m.y) > (skill.radius ?? 1) + MONSTERS[m.key].size * 0.3) return;
        const brain = this.brains.get(mid)!;
        if (skill.provoke || skill.pull) brain.target = c.sessionId;
        if (skill.defDownPct) {
          brain.defDownPct = skill.defDownPct;
          brain.defDownUntil = until;
        }
        if (skill.pull) {
          // Palm muting: everything in range comes running to you (bosses only turn to you)
          brain.pulledUntil = until;
          if (!MONSTERS[m.key].boss) this.pullIn(m, brain, p, pulled.length);
          pulled.push(mid);
        }
        if (skill.power) hitMonster(mid, m);
      });
      if (skill.pull) fx.pulled = pulled;
    } else if (skill.type === 'heal' || skill.type === 'heal_target') {
      const amount = skillHeal(skill, lv) + seat.char.int * 2;
      this.state.players.forEach((a, sid) => {
        if (a.dead) return;
        const inRange = skill.type === 'heal' ? dist(p.x, p.y, a.x, a.y) <= (skill.radius ?? 1) : sid === ally;
        if (!inRange) return;
        a.hp = Math.min(a.maxHp, a.hp + amount);
        fx.hits.push({ p: sid, dmg: -amount });
      });
    } else if (skill.buff && (skill.type === 'buff' || skill.type === 'buff_target' || skill.type === 'buff_party')) {
      // buff: yourself; buff_target: the player you picked; buff_party: you and your party members on this map
      let to: string[] = [skill.type === 'buff_target' ? ally! : c.sessionId];
      if (skill.type === 'buff_party') {
        const party = Parties.of(seat.char.id);
        if (party) {
          const ids = new Set(party.members.map((m) => m.id));
          to = [...this.seats].filter(([sid, s]) => ids.has(s.char.id) && !this.state.players.get(sid)?.dead).map(([sid]) => sid);
          if (!to.includes(c.sessionId)) to.push(c.sessionId);
        }
        fx.allies = to;
      }
      for (const sid of to) {
        const ts = this.seats.get(sid);
        const tp = this.state.players.get(sid);
        if (!ts || !tp) continue;
        const b = this.buffFor(skill, lv);
        ts.buffs.set(id, b);
        this.applyDerived(ts, tp);
        ts.client.send('buff', { skill: id, seconds: skill.buff.durationSec, blocks: b.blocks || undefined });
      }
    }
    this.broadcast('skill', fx);
  }

  /** Damage multiplier for `el` against this monster's element and level. */
  private elementVs(el: Element | undefined, def: MonsterDef) {
    const [mel, lv] = monsterElement(def);
    return elementMult(el ?? 'neutral', mel, lv);
  }

  /** Tag on a hit message so browsers can show "weak" / "resist": 'up' >= 150%, 'down' < 75%, '' otherwise. */
  private elTag(mult: number) {
    return mult >= 1.5 ? 'up' : mult < 0.75 ? 'down' : '';
  }

  /** The element converter on a player's weapon, for carrying it to the next map. */
  private endowOf(seat: Seat) {
    for (const [k, b] of seat.buffs) {
      if (b.endow && b.until > this.now) return { item: k.slice(5), until: Date.now() + (b.until - this.now) };
    }
    return undefined;
  }

  /** Monster Def, lowered while Palm muting's debuff lasts. */
  private monsterDef(b: Brain, def: MonsterDef) {
    return b.defDownUntil && b.defDownUntil > this.now ? def.def * (1 - (b.defDownPct ?? 0) / 100) : def.def;
  }

  /** Pushes a monster `tiles` straight away from (fx, fy), stopping at walls. Bosses don't budge. */
  private knockBack(m: MonsterState, b: Brain, fx: number, fy: number, tiles: number) {
    if (MONSTERS[m.key].boss) return;
    const d = dist(fx, fy, m.x, m.y) || 1;
    const ux = (m.x - fx) / d;
    const uy = (m.y - fy) / d;
    for (let i = 0; i < tiles * 4; i++) {
      const nx = m.x + ux * 0.25;
      const ny = m.y + uy * 0.25;
      if (!this.monsterCanStand(nx, ny)) break;
      m.x = nx;
      m.y = ny;
    }
    b.wanderTo = null;
  }

  /** Palm muting: puts a monster in a ring right next to the player (the n-th one pulled). */
  private pullIn(m: MonsterState, b: Brain, p: PlayerState, n: number) {
    const r = 1.0 + MONSTERS[m.key].size * 0.35;
    const a0 = Math.atan2(m.y - p.y, m.x - p.x);
    for (let k = 0; k < 6; k++) {
      const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.6 + n * 0.05;
      const nx = p.x + Math.cos(a) * r;
      const ny = p.y + Math.sin(a) * r;
      if (this.monsterCanStand(nx, ny) || walkable(this.map, nx, ny)) {
        m.x = nx;
        m.y = ny;
        break;
      }
    }
    b.wanderTo = null;
  }

  /** Ends หนีไปกลับ PR. */
  private unhide(sid: string, seat: Seat, p: PlayerState) {
    for (const [k, b] of seat.buffs) {
      if (!b.stealth) continue;
      seat.buffs.delete(k);
      seat.client.send('buff', { skill: k, seconds: 0 });
    }
    if (p.hidden) {
      p.hidden = false;
      this.broadcast('fx', { kind: 'reveal', to: sid });
    }
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
      const theirs = trade.offers[other].items.map((o) => {
        const row = otherSeat.inv.find((i) => i.id === o.inv);
        return { item: row?.item_id ?? '', qty: o.qty, refine: row?.refine ?? 0, cards: row?.cards ?? [] };
      });
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
    const leash = !(b.pulledUntil && b.pulledUntil > this.now) && dist(m.x, m.y, home.x, home.y) > 18;
    // a hidden player (หนีไปกลับ PR) can only be seen by bosses
    if (target && (target.dead || leash || (target.hidden && !def.boss))) {
      b.target = null;
      target = undefined;
    }
    if (!target && def.aggressive) {
      let best = 5;
      this.state.players.forEach((p, sid) => {
        const d = dist(m.x, m.y, p.x, p.y);
        if (!p.dead && (!p.hidden || def.boss) && d < best) {
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
    // a shield buff (ประสานเสียง) eats the hit
    for (const [k, b] of seat.buffs) {
      if (!b.blocks) continue;
      b.blocks--;
      if (b.blocks <= 0) {
        seat.buffs.delete(k);
        seat.client.send('buff', { skill: k, seconds: 0 });
      } else seat.client.send('buff', { skill: k, seconds: (b.until - this.now) / 1000, blocks: b.blocks });
      this.broadcast('mhit', { m: id, to: sid, dmg: 0, block: true });
      return;
    }
    const mult = elementMult(monsterElement(def)[0], seat.derived.defElement ?? 'neutral', 1);
    if (mult === 0) {
      this.broadcast('mhit', { m: id, to: sid, dmg: 0 });
      return;
    }
    let dmg = Math.max(1, Math.round((def.atk * rand(0.85, 1.15) - seat.derived.def) * mult));
    // Kick Drum: a bassist in the party (on this map) takes part of the hit
    const party = Parties.of(seat.char.id);
    if (party) {
      const ids = new Set(party.members.map((pm) => pm.id));
      for (const [gsid, gs] of this.seats) {
        const gp = this.state.players.get(gsid);
        const pct = [...gs.buffs.values()].reduce((sum, gb) => sum + (gb.guardPct ?? 0), 0);
        if (gsid === sid || !gp || gp.dead || !pct || !ids.has(gs.char.id)) continue;
        const share = Math.min(dmg, Math.round((dmg * Math.min(100, pct)) / 100));
        if (share <= 0) break;
        dmg -= share;
        this.broadcast('mhit', { m: id, to: gsid, dmg: share, guard: sid });
        this.hurt(gsid, gs, gp, share);
        break;
      }
    }
    this.broadcast('mhit', { m: id, to: sid, dmg });
    this.hurt(sid, seat, p, dmg);
    // จังหวะยก: part of the hit goes back into the monster
    const reflect = [...seat.buffs.values()].reduce((sum, rb) => sum + (rb.reflectPct ?? 0), 0);
    const back = Math.round((dmg * reflect) / 100);
    const b = this.brains.get(id);
    if (back > 0 && b && !m.dead) {
      this.broadcast('reflect', { m: id, by: sid, dmg: back });
      this.damageMonster(id, m, b, sid, back);
    }
  }

  /** Takes HP off a player; at 0 they fall. */
  private hurt(sid: string, seat: Seat, p: PlayerState, dmg: number) {
    p.hp = Math.max(0, p.hp - dmg);
    p.sitting = false;
    if (p.hp <= 0 && !p.dead) {
      p.dead = true;
      this.cancelCast(sid, seat, p);
      this.unhide(sid, seat, p);
      this.cancelTrade(seat.trade, 'อีกฝ่ายหมดสติ');
      for (const b of this.brains.values()) if (b.target === sid) b.target = null;
    }
  }

  private killMonster(id: string, m: MonsterState, b: Brain) {
    m.dead = true;
    const def = MONSTERS[m.key];
    // Damage is added up per party (a solo player is their own group). Every group that did at least 10%
    // gets a full reward: a solo player keeps it, a party splits it evenly between its members on this map.
    const total = [...b.damage.values()].reduce((s, v) => s + v, 0) || 1;
    const groups = new Map<string, { party?: Party; sids: string[]; dmg: number }>();
    for (const [sid, d] of b.damage) {
      const seat = this.seats.get(sid);
      if (!seat) continue;
      const party = Parties.of(seat.char.id);
      const key = party ? party.id : sid;
      const g = groups.get(key) ?? { party, sids: [], dmg: 0 };
      g.sids.push(sid);
      g.dmg += d;
      groups.set(key, g);
    }
    b.damage.clear();
    b.target = null;
    for (const g of groups.values()) {
      if (g.dmg / total < 0.1) continue;
      if (g.party) this.partyReward(g.party, m.key, new Set(g.sids));
      else this.reward(g.sids[0], m.key);
    }

    this.clock.setTimeout(() => {
      const spot = this.randomSpot(b.spawn);
      Object.assign(m, { x: spot.x, y: spot.y, hp: def.hp, dead: false });
      b.wanderTo = null;
      if (def.boss) this.broadcast('system', { text: `${def.name} ปรากฏตัวขึ้นอีกครั้ง!` });
    }, (b.spawn.respawnSec ?? 8) * 1000);
    if (def.boss) this.broadcast('system', { text: `${def.name} ถูกปราบแล้ว!` });
  }

  /**
   * Even share: one monster's Base EXP, Job EXP and zeny are divided equally between the party members on this
   * map who are still standing; each drop goes to the next member in turn (round-robin). EXP rounds up so
   * nobody gets 0; zeny that doesn't divide evenly goes round the same way as the items.
   */
  private partyReward(party: Party, monster: string, hitters: Set<string>) {
    const def = MONSTERS[monster];
    const ids = new Set(party.members.map((m) => m.id));
    const order = party.members.map((m) => m.id);
    let sharers = [...this.seats.entries()]
      .filter(([sid, s]) => ids.has(s.char.id) && !this.state.players.get(sid)?.dead)
      .sort((a, b) => order.indexOf(a[1].char.id) - order.indexOf(b[1].char.id))
      .map(([sid]) => sid);
    if (!sharers.length) sharers = [...hitters].filter((sid) => this.seats.has(sid)).slice(0, 1);
    if (sharers.length <= 1) {
      if (sharers[0]) this.reward(sharers[0], monster);
      return;
    }
    const n = sharers.length;
    const items = def.drops.filter(([, chance]) => Math.random() < chance).map(([id]) => id);
    const zeny = def.zeny[0] + Math.floor(Math.random() * (def.zeny[1] - def.zeny[0] + 1));
    const shares: RewardShare[] = sharers.map((sid) => ({
      exp: Math.ceil(def.exp / n), jobExp: Math.ceil(def.jobExp / n), zeny: Math.floor(zeny / n), items: [],
      quest: hitters.has(sid) && questCounts(def),
    }));
    for (let i = 0; i < zeny % n; i++) shares[Parties.rotate(party, n)].zeny++;
    const names = sharers.map((sid) => this.seats.get(sid)!.char.name);
    for (const item of items) {
      const who = Parties.rotate(party, n);
      shares[who].items.push(item);
      // everyone sees who got what
      for (const [i, sid] of sharers.entries()) {
        if (i !== who) this.seats.get(sid)!.client.send('system', { text: `[ปาร์ตี้] ${names[who]} ได้รับ ${ITEMS[item]?.name ?? item}` });
      }
    }
    sharers.forEach((sid, i) => this.reward(sid, monster, shares[i], n));
  }

  /** Gives one player a kill: the whole monster (rolled by the database), or their party share. */
  private async reward(sid: string, monster: string, share?: RewardShare, sharedBy = 1) {
    const seat = this.seats.get(sid);
    const p = this.state.players.get(sid);
    if (!seat || !p) return;
    try {
      const before = seat.char.job_quest ?? -1;
      const r = share
        ? await MapRoom.db.grantReward(seat.userId, seat.char.id, share)
        : await MapRoom.db.reportKill(seat.userId, seat.char.id, monster);
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
      const q = seat.char.job_quest ?? -1;
      if (q >= 0 && q !== before) {
        seat.client.send('system', {
          text: q >= JOB_CHANGE.kills ? 'เควสเปลี่ยนอาชีพสำเร็จ! กลับไปหาครูแนะแนวอาชีพที่เมืองเมโลเดีย (มือกลองไปหาครูกลองที่เมืองทะเลทรายตะโพน)' : `เควสเปลี่ยนอาชีพ: ${q} / ${JOB_CHANGE.kills}`,
        });
      }
      seat.client.send('reward', {
        monster, exp: r.exp, jobExp: r.jobExp, zeny: r.zeny, drops: r.drops, leveledUp: r.leveledUp, jobLeveledUp: r.jobLeveledUp,
        shared: sharedBy,
      });
      seat.client.send('sync', { character: seat.char, inventory: seat.inv });
    } catch (e) {
      seat.client.send('error', { text: `บันทึกผลไม่ได้: ${(e as Error).message}` });
    }
  }

  /** Runs a party action for this player; a refusal goes back as an error toast. */
  private party(c: Client, fn: (charId: string) => void) {
    const seat = this.seats.get(c.sessionId);
    if (!seat) return;
    try {
      fn(seat.char.id);
    } catch (e) {
      c.send('error', { text: (e as Error).message });
    }
  }

  private regen() {
    this.state.players.forEach((p, sid) => {
      const seat = this.seats.get(sid);
      if (!seat || p.dead) return;
      const overweight = seat.derived.weight >= seat.derived.maxWeight * 0.9;
      if (overweight) return;
      // ลูกส่ง (buff) and Arpeggio (passive) make HP come back faster, and keep it coming back in a fight
      let regenPct = [...seat.buffs.values()].reduce((sum, b) => sum + (b.regenPct ?? 0), 0);
      for (const [id, lv] of Object.entries(seat.char.skills ?? {})) regenPct += (SKILLS[id]?.passive?.regenPct ?? 0) * lv;
      const hpTick = p.maxHp * 0.01 + seat.char.vit / 5;
      const fighting = [...this.brains.values()].some((b) => b.target === sid);
      if (fighting) {
        if (regenPct > 0) p.hp = Math.min(p.maxHp, p.hp + Math.ceil((hpTick * regenPct) / 100));
        return;
      }
      const boost = (this.map.safe ? 3 : 1) * (p.sitting ? 2 : 1);
      p.hp = Math.min(p.maxHp, p.hp + Math.ceil(hpTick * boost * (1 + regenPct / 100)));
      p.sp = Math.min(p.maxSp, p.sp + Math.ceil((1 + seat.char.int / 6) * boost));
    });
  }

  // ------------------------------------------------------------ helpers

  /** The buff a skill gives at `lv` (aspd/def for 'buff', stats/shield for the keyboardist's buffs). */
  private buffFor(skill: SkillDef, lv: number): SeatBuff {
    const blocks = buffBlocks(skill, lv);
    return {
      until: this.now + skill.buff!.durationSec * 1000,
      ...(skill.buff!.aspdPct ? { aspdPct: skill.buff!.aspdPct * lv } : {}),
      ...(skill.buff!.def ? { def: skill.buff!.def * lv } : {}),
      ...(skill.buff!.hitPct ? { hitPct: skill.buff!.hitPct * lv } : {}),
      ...(skill.buff!.fleePct ? { fleePct: skill.buff!.fleePct * lv } : {}),
      ...(skill.buff!.reflectPct ? { reflectPct: skill.buff!.reflectPct * lv } : {}),
      ...(skill.buff!.regenPct ? { regenPct: skill.buff!.regenPct * lv } : {}),
      ...(skill.buff!.guardPct ? { guardPct: skill.buff!.guardPct * lv } : {}),
      ...(skill.buff!.stealth ? { stealth: true } : {}),
      ...(skill.buff!.stats ? { stats: buffStats(skill, lv) } : {}),
      ...(blocks > 0 ? { blocks } : {}),
    };
  }

  private applyDerived(seat: Seat, p: PlayerState) {
    const buffs: Buffs = { aspdPct: 0, def: 0, hitPct: 0, fleePct: 0 };
    const stats: Buffs['stats'] = {};
    let hidden = false;
    for (const b of seat.buffs.values()) {
      buffs.aspdPct! += b.aspdPct ?? 0;
      buffs.def! += b.def ?? 0;
      buffs.hitPct! += b.hitPct ?? 0;
      buffs.fleePct! += b.fleePct ?? 0;
      if (b.stealth) hidden = true;
      if (b.endow) buffs.endow = b.endow;
      for (const k of STAT_KEYS) if (b.stats?.[k]) stats[k] = (stats[k] ?? 0) + b.stats[k]!;
    }
    if (Object.keys(stats).length) buffs.stats = stats;
    seat.derived = derive(seat.char, seat.inv, buffs);
    p.level = seat.char.level;
    p.cls = seat.char.cls;
    p.maxHp = seat.derived.maxHp;
    p.maxSp = seat.derived.maxSp;
    if (p.hidden && !hidden) this.broadcast('fx', { kind: 'reveal', to: seat.client.sessionId });
    p.hidden = hidden;
    p.hp = Math.min(p.hp, p.maxHp);
    p.sp = Math.min(p.sp, p.maxSp);
    p.head = seat.inv.find((i) => i.equipped && ITEMS[i.item_id]?.type === 'head')?.item_id ?? '';
    p.weapon = seat.inv.find((i) => i.equipped && ITEMS[i.item_id]?.type === 'weapon')?.item_id ?? '';
    p.ear = seat.inv.find((i) => i.equipped && ITEMS[i.item_id]?.type === 'earring')?.item_id ?? '';
    const armor = seat.inv.find((i) => i.equipped && ITEMS[i.item_id]?.type === 'armor')?.item_id;
    p.body = outfitOf(armor) ? armor! : '';
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
