/**
 * Bot players (2026-11-13): 40 bots that hunt monsters on the field maps and 10 that sit in เมืองเมโลเดีย
 * selling ป้ามะลิ's list 10% cheaper. They live only inside a map room (no database row, no seat): the room
 * makes its bots when it starts and they go away with it. They count as online players, never as rankers.
 *
 * What they may not do: hit a monster a real player is already fighting (they back off when one joins in),
 * fight bosses, get rewards, die, trade, join parties or guilds, or go to the PVP maps.
 */
import { CLASSES, ITEMS, MONSTERS, SHOP, SKILLS, SPAWNS, botShopPrice, castTime, type ClassKey, type SpawnDef } from '../../src/data/index.ts';
import { type GameMap, walkable } from '../../src/game/maps.ts';

export const BOT_PREFIX = 'bot:';
export const isBot = (sid: string | null | undefined) => !!sid && sid.startsWith(BOT_PREFIX);

export interface BotDef {
  id: string;
  name: string;
  cls: ClassKey;
  level: number;
  gender: 'm' | 'f';
  hair: number;
  hairColor: number;
  face: number;
  weapon: string;
  head: string;
  ear: string;
  map: string;
  /** shop bots: the sign over their head and what they sell (ป้ามะลิ's items) */
  shop?: { title: string; items: { item: string; qty: number }[] };
}

// ------------------------------------------------------------------ the roster (the same every start)

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIGHTER_NAMES = [
  'ต้นกล้าสายลุย', 'MintyBeat', 'แก้วตาโซปราโน', 'RiffHunter', 'หมูกรอบเบสหนัก', 'DrumKid77', 'น้ำหวานไมค์ทอง', 'BassBoyTH',
  'ฟ้าใสคีย์เพราะ', 'SoloNoMore', 'เจ้าหญิงคอร์ดซี', 'TempoTiger', 'บีทแรงแห่งอีสาน', 'PickNPlay', 'ข้าวเหนียวกลอง', 'LoFiLily',
  'ไมค์หล่นอีกแล้ว', 'SnareStorm', 'ดาวเหนือเบส5สาย', 'KeyKitten', 'แจ่มใสสายซัพ', 'FretFury', 'ส้มตำริฟฟ์แซ่บ', 'EchoBunny',
  'กีตาร์ไฟลุก', 'GrooveNinja', 'ป๋าแจมทุกวง', 'HighNoteHana', 'ลูกชิ้นบีทบ็อกซ์', 'VibratoVee', 'นักล่าโน้ตหลง', 'OctaveOwl',
  'เสียงสูงปรี๊ด', 'BeatBreaker', 'หนุ่มเบสริมโขง', 'ChordChaser', 'มะนาวสแนร์รัว', 'MetroGnome', 'ซินธ์สีชมพู', 'CrescendoKai',
];
const SHOP_NAMES = ['ป้านิดยาถูก', 'ShopMeiMei', 'เจ๊หมวยขายส่ง', 'NoteMart', 'ลุงแดงของดี', 'PotionPapa', 'น้องพลอยร้านยา', 'BargainBard', 'พี่โอ๊ตลดกระหน่ำ', 'SaleSiren'];
const SHOP_TITLES = [
  'ยาถูกกว่าป้ามะลิ 10%', 'ของใช้ลดราคา -10%', 'น้ำ+ยา ราคาส่ง', 'ร้านเล็กราคาเป็นมิตร', 'ลดทั้งร้าน 10%',
  'ของจำเป็นนักผจญภัย', 'ขายถูก รีบซื้อก่อนหมด', 'ร้านยาประจำเมือง', 'ลดกระหน่ำ 10%', 'ของเติมพลังราคาดี',
];
const SHOP_SHOUTS = [
  'ขายของใช้ถูกกว่าป้ามะลิ 10% แวะดูก่อนออกล่าได้นะ', 'น้ำ ยา ผงธาตุ มีครบ ลด 10% จ้า', 'ใครจะออกไปตีมอน แวะซื้อยาก่อนนะ',
  'ร้านเปิดแล้ว ของถูกกว่าในร้าน NPC', 'ยาแดงยาเหลืองราคาส่ง แตะที่ป้ายร้านได้เลย',
];

/** Field maps the hunters spread over: how many go there and the Base Lv range they have. */
const HUNT: [map: string, count: number, lvMin: number, lvMax: number][] = [
  ['field', 6, 5, 12], ['forest', 5, 13, 20], ['marsh', 4, 16, 22], ['canyon', 4, 20, 26], ['snow', 3, 23, 29], ['volcano', 3, 30, 38],
  ['beach', 3, 35, 44], ['cave', 3, 45, 57], ['deadwood', 3, 56, 68], ['ruins', 2, 70, 82], ['inferno', 2, 85, 97], ['abyss', 2, 92, 99],
];
export const SHOP_MAP = 'town';
const JOBS: ClassKey[] = ['singer', 'guitarist', 'drummer', 'bassist', 'keyboardist'];

function buildRoster(): BotDef[] {
  const r = rng(20261113);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const int = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
  const weapons = (cls: ClassKey) => Object.entries(ITEMS)
    .filter(([, d]) => d.type === 'weapon' && d.classes?.includes(cls))
    .sort((a, b) => (a[1].atk ?? a[1].matk ?? 0) - (b[1].atk ?? b[1].matk ?? 0))
    .map(([id]) => id);
  // hats that anyone can wear (not the outfit-locked ones), and headphones
  const hats = Object.entries(ITEMS).filter(([, d]) => d.type === 'head' && !d.gender).map(([id]) => id);
  const ears = Object.entries(ITEMS).filter(([, d]) => d.type === 'earring').map(([id]) => id);
  const look = (level: number, cls: ClassKey) => {
    const w = weapons(cls);
    // a better instrument the higher they are: the shop ones first, the MVP ones from Lv 60
    const tier = level < 15 ? 0 : level < 35 ? 1 : level < 60 ? 2 : int(3, w.length - 1);
    const gender: 'm' | 'f' = r() < 0.5 ? 'm' : 'f';
    return {
      gender, hair: int(0, 40), hairColor: int(0, 7), face: int(0, 3),
      weapon: w[Math.min(tier, w.length - 1)] ?? '',
      head: level >= 15 && r() < 0.6 ? pick(hats) : '',
      ear: level >= 20 && r() < 0.4 ? pick(ears) : '',
    };
  };
  const bots: BotDef[] = [];
  let n = 0;
  for (const [map, count, lo, hi] of HUNT) {
    for (let i = 0; i < count; i++) {
      const level = int(lo, hi);
      const cls: ClassKey = level < 10 || (level < 14 && r() < 0.5) ? 'teen' : pick(JOBS);
      bots.push({ id: `h${n}`, name: FIGHTER_NAMES[n], cls, level, map, ...look(level, cls) });
      n++;
    }
  }
  // shop bots: every item on ป้ามะลิ's list is in at least one shop
  const dealt: string[][] = SHOP_NAMES.map(() => []);
  [...SHOP].sort(() => r() - 0.5).forEach((item, k) => dealt[k % dealt.length].push(item));
  for (let i = 0; i < SHOP_NAMES.length; i++) {
    const level = int(18, 65);
    const cls = pick(JOBS);
    const items = new Set<string>(dealt[i]);
    const want = int(4, 7);
    while (items.size < want) items.add(pick(SHOP));
    bots.push({
      id: `s${i}`, name: SHOP_NAMES[i], cls, level, map: SHOP_MAP, ...look(level, cls),
      shop: {
        title: SHOP_TITLES[i],
        items: [...items].map((item) => ({ item, qty: ITEMS[item].type === 'consumable' ? int(10, 30) * 10 : int(2, 5) })),
      },
    });
  }
  return bots;
}

export const BOTS: BotDef[] = buildRoster();
/** Every bot counts as online, on whichever map it lives. */
export const BOT_COUNT = BOTS.length;

// ------------------------------------------------------------------ one room's bots

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const WALK = (150 * 0.9) / 32; // tiles/s, a player's walking speed
/** One single-target skill per class the bots show off now and then (keyboardists just attack). */
const BOT_SKILL: Partial<Record<ClassKey, string>> = {
  teen: 'quick_slash', singer: 'dynamics', guitarist: 'hammer_on', drummer: 'snare_roll', bassist: 'root_note',
};

/** The parts of a player's state a bot fills in (PlayerState in MapRoom). */
export interface BotPlayer {
  name: string; cls: string; level: number; gender: string; hair: number; hairColor: number; face: number;
  head: string; weapon: string; ear: string; body: string; x: number; y: number;
  hp: number; maxHp: number; sp: number; maxSp: number; dead: boolean; sitting: boolean; hidden: boolean; guild: string; shop: string;
}
interface MonsterLike { key: string; x: number; y: number; hp: number; maxHp: number; dead: boolean }
interface BrainLike { target: string | null; damage: Map<string, number>; spawn: SpawnDef }

export interface BotShopItem { inv: string; item: string; qty: number; price: number; refine: number; cards: string[] }

/** What a room lends its bots. */
export interface BotHost {
  map: GameMap;
  players: { set(id: string, p: BotPlayer): void; get(id: string): BotPlayer | undefined; delete(id: string): void };
  monsters: { forEach(fn: (m: MonsterLike, id: string) => void): void; get(id: string): MonsterLike | undefined };
  brains: Map<string, BrainLike>;
  newPlayer(): BotPlayer;
  /** a real (connected) player's session id */
  isPlayer(sid: string): boolean;
  broadcast(type: string, msg: unknown): void;
  damageMonster(id: string, amount: number, by: string): void;
}

interface Bot {
  def: BotDef;
  sid: string;
  p: BotPlayer;
  target?: string;
  goal?: { x: number; y: number };
  /** idle until (wandering pause, resting) */
  waitUntil: number;
  resting: boolean;
  lastAttack: number;
  delay: number;
  skillAt: number;
  cast?: { skill: string; mid: string; until: number };
  kills: number;
  restAfter: number;
  stuck: number;
  shop?: { title: string; items: BotShopItem[] };
  restockAt: number;
  shoutAt: number;
}

export class RoomBots {
  private bots = new Map<string, Bot>();
  private now = 0;

  constructor(private host: BotHost) {
    const defs = BOTS.filter((b) => b.map === host.map.id);
    const stalls = defs.some((d) => d.shop) ? this.stallSpots(defs.filter((d) => d.shop).length) : [];
    let s = 0;
    for (const def of defs) {
      const p = host.newPlayer();
      const maxHp = Math.round(120 + def.level * 38 * (def.cls === 'teen' ? 0.8 : 1));
      const maxSp = Math.round(30 + def.level * 6);
      const at = def.shop ? stalls[s++] ?? host.map.spawn : this.huntSpot(def);
      Object.assign(p, {
        name: def.name, cls: def.cls, level: def.level, gender: def.gender, hair: def.hair, hairColor: def.hairColor, face: def.face,
        head: def.head, weapon: def.weapon, ear: def.ear, body: '', x: at.x, y: at.y,
        hp: maxHp, maxHp, sp: maxSp, maxSp, dead: false, sitting: false, hidden: false, guild: '', shop: '',
      });
      const sid = BOT_PREFIX + def.id;
      const bot: Bot = {
        def, sid, p, waitUntil: rand(0, 3000), resting: false, lastAttack: 0,
        delay: Math.round(rand(850, 1250) * (def.cls === 'drummer' ? 0.8 : 1)), skillAt: rand(4000, 9000),
        kills: 0, restAfter: Math.round(rand(6, 14)), stuck: 0, restockAt: 0, shoutAt: rand(60000, 300000),
      };
      if (def.shop) {
        this.restock(bot);
        p.shop = def.shop.title;
        p.sitting = true;
      }
      host.players.set(sid, p);
      this.bots.set(sid, bot);
    }
  }

  get count() {
    return this.bots.size;
  }

  has(sid: string) {
    return this.bots.has(sid);
  }

  name(sid: string) {
    return this.bots.get(sid)?.def.name ?? '';
  }

  // -------------------------------------------------------------- shops

  private restock(bot: Bot) {
    const def = bot.def.shop!;
    bot.shop = {
      title: def.title,
      items: def.items.map((it) => ({ inv: `${bot.sid}:${it.item}`, item: it.item, qty: it.qty, price: botShopPrice(it.item), refine: 0, cards: [] })),
    };
    bot.restockAt = this.now + 15 * 60000;
  }

  /** The shop as the browsers see it (same shape as a player's shop). */
  shopOf(sid: string) {
    const bot = this.bots.get(sid);
    if (!bot?.shop) return { sid, open: false };
    return { sid, open: true, name: bot.def.name, title: bot.shop.title, items: bot.shop.items.filter((i) => i.qty > 0) };
  }

  /** The row a buyer picked, if the bot still has that many. */
  shopItem(sid: string, inv: string, qty: number) {
    const it = this.bots.get(sid)?.shop?.items.find((i) => i.inv === inv);
    return it && qty >= 1 && qty <= it.qty ? it : undefined;
  }

  sold(sid: string, inv: string, qty: number) {
    const it = this.bots.get(sid)?.shop?.items.find((i) => i.inv === inv);
    if (it) it.qty = Math.max(0, it.qty - qty);
  }

  // -------------------------------------------------------------- monsters hitting a bot

  /** A monster's blow on a bot: they flinch, lose some HP and drink a potion when it gets low. Bots never fall. */
  hurt(sid: string, monsterId: string) {
    const bot = this.bots.get(sid);
    const m = this.host.monsters.get(monsterId);
    if (!bot || !m) return;
    const def = MONSTERS[m.key];
    const { p } = bot;
    if (Math.random() < 0.15) return this.host.broadcast('mhit', { m: monsterId, to: sid, dmg: 0 });
    const dmg = Math.max(1, Math.round(def.atk * rand(0.85, 1.15) - bot.def.level * 1.1));
    this.host.broadcast('mhit', { m: monsterId, to: sid, dmg });
    p.hp = Math.max(1, p.hp - dmg);
    p.sitting = false;
    bot.resting = false;
    if (p.hp < p.maxHp * 0.35) {
      p.hp = p.maxHp;
      this.host.broadcast('fx', { kind: 'potion', to: sid });
    }
  }

  // -------------------------------------------------------------- every tick

  tick(dtMs: number) {
    this.now += dtMs;
    const dt = Math.min(dtMs, 100) / 1000;
    for (const bot of this.bots.values()) {
      if (bot.shop) this.tickShop(bot);
      else this.tickHunter(bot, dt);
    }
  }

  private tickShop(bot: Bot) {
    if (this.now >= bot.restockAt) this.restock(bot);
    if (this.now >= bot.shoutAt) {
      bot.shoutAt = this.now + rand(6, 12) * 60000;
      const text = SHOP_SHOUTS[Math.floor(Math.random() * SHOP_SHOUTS.length)];
      this.host.broadcast('chat', { id: bot.sid, name: bot.def.name, text });
    }
  }

  private tickHunter(bot: Bot, dt: number) {
    const { p } = bot;
    // slow regen, faster sitting down
    if (Math.random() < dt) p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * (bot.resting ? 0.08 : 0.01)));
    if (bot.cast) {
      if (this.now >= bot.cast.until) this.castLands(bot);
      return;
    }
    if (bot.resting) {
      if (this.now < bot.waitUntil) return;
      bot.resting = false;
      p.sitting = false;
    }
    let m = bot.target ? this.host.monsters.get(bot.target) : undefined;
    if (bot.target && (!m || !this.fair(bot, bot.target, m))) {
      bot.target = undefined;
      m = undefined;
      bot.waitUntil = this.now + rand(300, 1200);
    }
    if (!m) {
      if (this.now < bot.waitUntil && !bot.goal) return;
      const found = this.findTarget(bot);
      if (found) {
        bot.target = found;
        bot.goal = undefined;
        m = this.host.monsters.get(found)!;
      } else {
        if (!bot.goal && this.now >= bot.waitUntil) {
          bot.goal = this.wanderSpot(bot);
          bot.waitUntil = this.now + rand(2500, 6000);
        }
        if (bot.goal && this.step(bot, bot.goal, 0.2, dt)) bot.goal = undefined;
        return;
      }
    }
    const def = MONSTERS[m.key];
    const reach = Math.max(1, CLASSES[bot.def.cls].range) + def.size * 0.3 + 0.4;
    if (dist(p.x, p.y, m.x, m.y) > reach) {
      this.step(bot, m, reach - 0.3, dt);
      return;
    }
    bot.stuck = 0;
    // a skill now and then (with its cast bar), otherwise a normal attack
    const skill = BOT_SKILL[bot.def.cls];
    if (skill && this.now >= bot.skillAt && this.now - bot.lastAttack >= bot.delay) {
      const ms = SKILLS[skill] ? castTime(SKILLS[skill], bot.def.level * 0.6) : 0; // bots have DEX too
      bot.skillAt = this.now + rand(6000, 11000);
      bot.cast = { skill, mid: bot.target!, until: this.now + ms };
      if (ms) this.host.broadcast('cast', { by: bot.sid, skill, ms, x: m.x, y: m.y });
      return;
    }
    if (this.now - bot.lastAttack < bot.delay) return;
    bot.lastAttack = this.now;
    const missed = Math.random() < 0.08;
    const crit = !missed && Math.random() < 0.12;
    const dmg = missed ? 0 : Math.max(1, Math.round(this.blow(bot, def) * (crit ? 1.5 : 1)));
    this.host.broadcast('hit', { by: bot.sid, m: bot.target, dmg, crit });
    this.landHit(bot, bot.target!, dmg);
  }

  private castLands(bot: Bot) {
    const cast = bot.cast!;
    bot.cast = undefined;
    bot.lastAttack = this.now;
    const m = this.host.monsters.get(cast.mid);
    const skill = SKILLS[cast.skill];
    if (skill.castMs) this.host.broadcast('castEnd', { by: bot.sid, skill: cast.skill, done: true });
    if (!m || m.dead || !this.fair(bot, cast.mid, m)) return;
    const hits = skill.hits ?? 1;
    const total = this.blow(bot, MONSTERS[m.key]) * rand(1.6, 2.2);
    const fx = { by: bot.sid, skill: cast.skill, x: m.x, y: m.y, target: cast.mid, hits: [] as { m: string; dmg: number }[] };
    let left = m.hp;
    for (let i = 0; i < hits && left > 0; i++) {
      const dmg = Math.max(1, Math.round((total / hits) * rand(0.9, 1.1)));
      fx.hits.push({ m: cast.mid, dmg });
      left -= dmg;
    }
    this.host.broadcast('skill', fx);
    this.landHit(bot, cast.mid, fx.hits.reduce((s, h) => s + h.dmg, 0));
  }

  /** One normal blow: a monster of their level goes down in about 4-8 hits. */
  private blow(bot: Bot, def: (typeof MONSTERS)[string]) {
    const over = Math.max(0.6, Math.min(1.6, 1 + (bot.def.level - def.level) * 0.04));
    return (def.hp / rand(4, 8)) * over;
  }

  private landHit(bot: Bot, mid: string, dmg: number) {
    const m = this.host.monsters.get(mid);
    if (!m || m.dead) return;
    if (dmg > 0) {
      const dies = m.hp <= dmg;
      this.host.damageMonster(mid, dmg, bot.sid);
      if (dies) {
        bot.target = undefined;
        bot.kills++;
        bot.waitUntil = this.now + rand(400, 1500);
        if (bot.kills >= bot.restAfter) {
          // sit down for a while, like people do
          bot.kills = 0;
          bot.restAfter = Math.round(rand(6, 14));
          bot.resting = true;
          bot.p.sitting = true;
          bot.waitUntil = this.now + rand(8000, 16000);
        }
      }
    } else {
      const b = this.host.brains.get(mid);
      if (b && !b.target) b.target = bot.sid;
    }
  }

  /** The bot may (keep) fighting this one: no real player has touched it, it isn't a boss, nobody else's. */
  private fair(bot: Bot, mid: string, m: MonsterLike) {
    if (m.dead) return false;
    const def = MONSTERS[m.key];
    if (def.boss || def.mvp || def.structure || def.level > bot.def.level + 6) return false;
    const b = this.host.brains.get(mid);
    if (!b) return false;
    if (b.target && b.target !== bot.sid && (this.host.isPlayer(b.target) || this.taken(b.target, mid))) return false;
    for (const sid of b.damage.keys()) if (sid !== bot.sid) return false;
    return true;
  }

  private taken(by: string, mid: string) {
    return this.bots.get(by)?.target === mid;
  }

  private findTarget(bot: Bot) {
    const { p } = bot;
    const claimed = new Set([...this.bots.values()].map((b) => b.target).filter(Boolean));
    let best: string | undefined;
    let bestD = 14;
    this.host.monsters.forEach((m, id) => {
      if (claimed.has(id) || !this.fair(bot, id, m)) return;
      const d = dist(p.x, p.y, m.x, m.y);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    });
    return best;
  }

  /** Walks towards `to`, stopping `stop` tiles short; true when there. Gets unstuck by giving up the goal. */
  private step(bot: Bot, to: { x: number; y: number }, stop: number, dt: number) {
    const { p } = bot;
    p.sitting = false;
    const dx = to.x - p.x;
    const dy = to.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d <= stop + 0.05) return true;
    const s = Math.min(d - stop, WALK * dt);
    const nx = p.x + (dx / d) * s;
    const ny = p.y + (dy / d) * s;
    const map = this.host.map;
    if (walkable(map, nx, ny)) {
      p.x = nx;
      p.y = ny;
    } else if (walkable(map, nx, p.y) && Math.abs(dx) > 0.05) p.x = nx;
    else if (walkable(map, p.x, ny) && Math.abs(dy) > 0.05) p.y = ny;
    else bot.stuck += dt;
    if (bot.stuck > 1.2) {
      bot.stuck = 0;
      bot.target = undefined;
      bot.goal = this.wanderSpot(bot);
      bot.waitUntil = this.now + rand(1500, 3000);
    }
    return false;
  }

  // -------------------------------------------------------------- places

  private standable(x: number, y: number) {
    const m = this.host.map;
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx < 1 || ty < 1 || tx >= m.w - 1 || ty >= m.h - 1 || m.blocked[ty][tx]) return false;
    return !m.portals.some((pt) => dist(x, y, pt.x, pt.y) < 4);
  }

  /** Somewhere in a spawn area of monsters their level. */
  private huntSpot(def: BotDef) {
    const spawns = SPAWNS.filter((s) => s.map === def.map && !MONSTERS[s.monster].boss);
    const fit = spawns.filter((s) => MONSTERS[s.monster].level <= def.level + 2);
    const s = (fit.length ? fit : spawns)[Math.floor(Math.random() * (fit.length || spawns.length))];
    if (s) {
      const [x0, y0, x1, y1] = s.area;
      for (let i = 0; i < 60; i++) {
        const x = Math.floor(rand(x0, x1)) + 0.5;
        const y = Math.floor(rand(y0, y1)) + 0.5;
        if (this.standable(x, y)) return { x, y };
      }
    }
    return { ...this.host.map.spawn };
  }

  private wanderSpot(bot: Bot) {
    const { p } = bot;
    for (let i = 0; i < 30; i++) {
      const x = Math.floor(p.x + rand(-8, 8)) + 0.5;
      const y = Math.floor(p.y + rand(-8, 8)) + 0.5;
      if (this.standable(x, y)) return { x, y };
    }
    return this.huntSpot(bot.def);
  }

  /** Stalls around the town square: open ground, clear of the NPCs, the arrival point and each other. */
  private stallSpots(n: number) {
    const m = this.host.map;
    const r = rng(77);
    const cx = m.w / 2;
    const cy = m.h / 2;
    const open = (x: number, y: number) => {
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) if (!walkable(m, x + ox, y + oy)) return false;
      return true;
    };
    const cands: { x: number; y: number }[] = [];
    for (let y = Math.floor(cy - 13); y <= cy + 13; y++) {
      for (let x = Math.floor(cx - 13); x <= cx + 13; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const d = dist(px, py, cx, cy);
        if (d < 4 || d > 13 || !open(px, py)) continue;
        if (m.npcs.some((npc) => dist(px, py, npc.x + 0.5, npc.y + 0.5) < 2.5)) continue;
        if (dist(px, py, m.spawn.x, m.spawn.y) < 3 || m.portals.some((pt) => dist(px, py, pt.x, pt.y) < 5)) continue;
        cands.push({ x: px, y: py });
      }
    }
    const out: { x: number; y: number }[] = [];
    while (out.length < n && cands.length) {
      const c = cands.splice(Math.floor(r() * cands.length), 1)[0];
      if (out.every((o) => dist(o.x, o.y, c.x, c.y) >= 2.6)) out.push(c);
    }
    return out;
  }
}
