import type { Client } from 'colyseus';
import { CASTLE_ID, GUILD_COST, GUILD_MAX, WAR_PRIZE, cleanGuildName, nextWar, warNow, warScheduleText, type GuildView } from '../../src/game/pvp.ts';
import type { ServerDb } from './db.ts';

/**
 * Guilds (2026-11-10). Unlike parties they are kept in the database (guilds / guild_members / guild_castles,
 * see supabase/add-guild-war.sql), so a server restart doesn't lose them; this module keeps a copy in memory
 * for every map room (they all run in this one process) and writes each change through.
 * Also runs the guild war clock: start/end announcements and the prize for the guild holding the castle.
 */

/** A character that is in a map room right now. */
export interface GuildPresence {
  charId: string;
  userId: string;
  sessionId: string;
  roomId: string;
  map: string;
  client: Client;
  info(): { name: string; cls: string; level: number };
  /** The name over their head changed (joined / left a guild). */
  setGuild(name: string): void;
  /** Their character changed in the database (the war prize): reload it. */
  resync(): void;
}

interface Member {
  id: string;
  name: string;
  cls: string;
  level: number;
}

export interface Guild {
  id: string;
  name: string;
  leader: string;
  members: Member[];
}

const INVITE_MS = 30 * 1000;

let db: ServerDb;
let ready: Promise<void> | null = null;
const guilds = new Map<string, Guild>();
const guildOf = new Map<string, Guild>(); // character id -> guild
const online = new Map<string, GuildPresence>();
const invites = new Map<string, { guild: Guild; from: string; until: number }>();
let castleOwner: string | null = null; // guild id
/** The war that is running (its end, UTC ms), so the clock notices when it starts and ends. */
let warEnd: number | null = null;
const busy = new Set<string>(); // characters with a guild call to the database in flight

class GuildError extends Error {}
const fail = (text: string): never => {
  throw new GuildError(text);
};

function send(charId: string, type: string, msg: unknown) {
  online.get(charId)?.client.send(type, msg);
}

function tell(g: Guild, text: string, except?: string) {
  for (const m of g.members) if (m.id !== except) send(m.id, 'system', { text: `[กิลด์] ${text}` });
}

function everyone(text: string) {
  for (const p of online.values()) p.client.send('system', { text });
}

function nameOf(charId: string) {
  return online.get(charId)?.info().name ?? guildOf.get(charId)?.members.find((m) => m.id === charId)?.name ?? '?';
}

function viewFor(g: Guild, me: string): GuildView {
  return {
    id: g.id, name: g.name, leader: g.leader, me, max: GUILD_MAX, castle: castleOwner === g.id,
    members: g.members.map((m) => {
      const p = online.get(m.id);
      const i = p?.info();
      return { id: m.id, name: i?.name ?? m.name, cls: i?.cls ?? m.cls, level: i?.level ?? m.level, online: !!p, map: p?.map ?? '' };
    }),
  };
}

function push(g: Guild) {
  for (const m of g.members) send(m.id, 'guild', viewFor(g, m.id));
}

function setTag(charId: string, name: string) {
  online.get(charId)?.setGuild(name);
}

async function guarded<T>(charId: string, fn: () => Promise<T>) {
  if (busy.has(charId)) fail('รอสักครู่ กำลังบันทึกข้อมูลกิลด์');
  busy.add(charId);
  try {
    return await fn();
  } finally {
    busy.delete(charId);
  }
}

async function load() {
  const { guilds: rows, castles } = await db.guildsLoad();
  guilds.clear();
  guildOf.clear();
  for (const r of rows) {
    if (!r.members.length) continue;
    const g: Guild = { id: r.id, name: r.name, leader: r.leader ?? '', members: r.members.map((m) => ({ id: m.char, name: m.name, cls: m.cls, level: m.level })) };
    if (!g.members.some((m) => m.id === g.leader)) {
      // the leader's character was deleted: the first member takes over
      g.leader = g.members[0].id;
      db.guildLeader(g.id, g.leader).catch((e) => console.warn('guild leader fix failed', e.message));
    }
    guilds.set(g.id, g);
    for (const m of g.members) guildOf.set(m.id, g);
  }
  castleOwner = castles.find((c) => c.castle === CASTLE_ID)?.guild ?? null;
  if (castleOwner && !guilds.has(castleOwner)) castleOwner = null;
  console.log(`guilds: ${guilds.size} loaded, castle held by ${castleOwner ? guilds.get(castleOwner)!.name : 'nobody'}`);
}

/** The war clock: announcements a few minutes before, at the start, and the prize at the end. */
let warned = 0;
async function clock() {
  const now = Date.now();
  const w = warNow(now);
  if (w && warEnd === null) {
    warEnd = w.end;
    everyone(`⚔ สงครามกิลด์เริ่มแล้ว! ไปที่ปราสาทแห่งเสียง (ทหารประกาศสงครามกิลด์ในเมืองเมโลเดีย) ตีคริสตัลแห่งเสียงให้แตกเพื่อยึดปราสาท`);
  } else if (!w && warEnd !== null) {
    warEnd = null;
    await endWar().catch((e) => console.warn('war end failed', e.message));
  } else if (!w) {
    const until = nextWar(now).start - now;
    if (until < 10 * 60000 && now - warned > 15 * 60000) {
      warned = now;
      everyone(`⚔ อีก ${Math.ceil(until / 60000)} นาที สงครามกิลด์จะเริ่มที่ปราสาทแห่งเสียง!`);
    }
  }
}

async function endWar() {
  const g = castleOwner ? guilds.get(castleOwner) : undefined;
  if (!g) {
    everyone('⚔ สงครามกิลด์จบแล้ว ไม่มีกิลด์ใดครองปราสาทแห่งเสียง');
    return;
  }
  everyone(`⚔ สงครามกิลด์จบแล้ว! กิลด์ "${g.name}" ครองปราสาทแห่งเสียง สมาชิกที่ออนไลน์ได้รับ ${WAR_PRIZE.toLocaleString()} z`);
  for (const m of g.members) {
    const p = online.get(m.id);
    if (!p) continue;
    try {
      await db.grantReward(p.userId, p.charId, { exp: 0, jobExp: 0, zeny: WAR_PRIZE, items: [], quest: false });
      p.resync();
    } catch (e) {
      console.warn('war prize failed', m.name, (e as Error).message);
    }
  }
}

export const Guilds = {
  isGuildError: (e: unknown): e is Error => e instanceof GuildError,

  /** Loads the guilds from the database once (every join waits for it) and starts the war clock. */
  init(database: ServerDb) {
    db = database;
    if (!ready) {
      ready = load().catch((e) => {
        console.warn('guilds: load failed (run supabase/add-guild-war.sql?)', e.message);
        ready = null; // try again on the next join
      });
      warEnd = warNow() ? warNow()!.end : null;
      setInterval(() => void clock(), 5000).unref?.();
    }
    return ready;
  },

  ready() {
    return ready ?? Promise.resolve();
  },

  of(charId: string): Guild | undefined {
    return guildOf.get(charId);
  },

  nameOf(charId: string) {
    return guildOf.get(charId)?.name ?? '';
  },

  /** Same guild (and both in one). */
  allies(a: string, b: string) {
    const g = guildOf.get(a);
    return !!g && g === guildOf.get(b);
  },

  castleOwner(): Guild | undefined {
    return castleOwner ? guilds.get(castleOwner) : undefined;
  },

  /** The crystal broke: the castle goes to this guild. */
  capture(guildId: string) {
    const g = guilds.get(guildId);
    if (!g) return;
    castleOwner = g.id;
    db.castleSet(CASTLE_ID, g.id).catch((e) => console.warn('castle save failed', e.message));
    everyone(`⚔ กิลด์ "${g.name}" ยึดปราสาทแห่งเสียงได้แล้ว!`);
    for (const x of guilds.values()) push(x);
  },

  online(p: GuildPresence) {
    online.set(p.charId, p);
    const g = guildOf.get(p.charId);
    if (g) {
      const m = g.members.find((x) => x.id === p.charId)!;
      Object.assign(m, p.info());
      push(g);
    }
    const inv = invites.get(p.charId);
    if (inv && inv.until > Date.now()) p.client.send('guildInvite', { guild: inv.guild.name, from: nameOf(inv.from) });
  },

  offline(charId: string, sessionId: string) {
    const p = online.get(charId);
    if (!p || p.sessionId !== sessionId) return;
    online.delete(charId);
    const g = guildOf.get(charId);
    if (g) push(g);
  },

  refresh(charId: string) {
    const g = guildOf.get(charId);
    send(charId, 'guild', g ? viewFor(g, charId) : null);
  },

  /** Makes a guild for GUILD_COST zeny (taken in the same database call). */
  async create(charId: string, name: unknown) {
    const p = online.get(charId) ?? fail('ไม่พบตัวละคร');
    if (guildOf.has(charId)) fail('คุณอยู่ในกิลด์แล้ว');
    const clean = cleanGuildName(name) ?? fail('ชื่อกิลด์ต้องยาว 2-16 ตัว ใช้ตัวอักษร ตัวเลข หรือเว้นวรรค');
    if ([...guilds.values()].some((g) => g.name.toLowerCase() === clean!.toLowerCase())) fail('ชื่อกิลด์นี้มีคนใช้แล้ว');
    await guarded(charId, async () => {
      const id = await db.guildCreate(p.userId, charId, clean!, GUILD_COST);
      const i = p.info();
      const g: Guild = { id, name: clean!, leader: charId, members: [{ id: charId, ...i }] };
      guilds.set(id, g);
      guildOf.set(charId, g);
      setTag(charId, g.name);
      p.resync();
      push(g);
      everyone(`🏰 ${i.name} ก่อตั้งกิลด์ "${g.name}"`);
    });
  },

  invite(from: string, target: { charId?: string; name?: unknown }) {
    const g = guildOf.get(from) ?? fail('คุณยังไม่มีกิลด์ (สร้างที่นายทะเบียนกิลด์ในเมืองเมโลเดีย)');
    if (g.leader !== from) fail('หัวหน้ากิลด์เท่านั้นที่ชวนคนเข้าได้');
    let to = target.charId;
    if (!to) {
      const want = String(target.name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!want) fail('พิมพ์ชื่อตัวละครที่จะชวน');
      to = [...online.values()].find((p) => p.info().name.toLowerCase() === want)?.charId;
      if (!to) fail('ไม่พบผู้เล่นชื่อนี้ที่ออนไลน์อยู่');
    }
    if (to === from) fail('ชวนตัวเองไม่ได้');
    if (!online.has(to!)) fail('ผู้เล่นคนนี้ไม่ได้ออนไลน์');
    if (guildOf.has(to!)) fail(`${nameOf(to!)} อยู่ในกิลด์อื่นแล้ว`);
    if (g.members.length >= GUILD_MAX) fail(`กิลด์เต็มแล้ว (${GUILD_MAX} คน)`);
    invites.set(to!, { guild: g, from, until: Date.now() + INVITE_MS });
    send(to!, 'guildInvite', { guild: g.name, from: nameOf(from) });
    send(from, 'system', { text: `ส่งคำชวนเข้ากิลด์ไปที่ ${nameOf(to!)} แล้ว` });
  },

  async respond(charId: string, accept: unknown) {
    const inv = invites.get(charId);
    invites.delete(charId);
    if (!inv || inv.until < Date.now() || !guilds.has(inv.guild.id)) fail('คำชวนหมดเวลาแล้ว');
    const g = inv!.guild;
    if (!accept) {
      send(inv!.from, 'system', { text: `${nameOf(charId)} ปฏิเสธคำชวนเข้ากิลด์` });
      return;
    }
    if (guildOf.has(charId)) fail('คุณอยู่ในกิลด์แล้ว');
    if (g.members.length >= GUILD_MAX) fail(`กิลด์เต็มแล้ว (${GUILD_MAX} คน)`);
    await guarded(charId, async () => {
      await db.guildJoin(g.id, charId);
      const i = online.get(charId)?.info() ?? { name: '?', cls: '', level: 1 };
      g.members.push({ id: charId, ...i });
      guildOf.set(charId, g);
      setTag(charId, g.name);
      tell(g, `${i.name} เข้าร่วมกิลด์`);
      push(g);
    });
  },

  async leave(charId: string) {
    const g = guildOf.get(charId) ?? fail('คุณไม่ได้อยู่ในกิลด์');
    if (g.leader === charId && g.members.length > 1) fail('หัวหน้ากิลด์ต้องมอบตำแหน่งให้คนอื่นก่อนออก (หรือเชิญทุกคนออกแล้วยุบกิลด์)');
    await guarded(charId, async () => {
      if (g.members.length <= 1) {
        // the last one out closes the guild
        await db.guildDelete(g.id);
        guilds.delete(g.id);
        if (castleOwner === g.id) castleOwner = null;
        everyone(`🏰 กิลด์ "${g.name}" ถูกยุบแล้ว`);
      } else await db.guildLeave(charId);
      g.members = g.members.filter((m) => m.id !== charId);
      guildOf.delete(charId);
      setTag(charId, '');
      send(charId, 'guild', null);
      send(charId, 'system', { text: g.members.length ? `ออกจากกิลด์ "${g.name}" แล้ว` : `ยุบกิลด์ "${g.name}" แล้ว` });
      if (g.members.length) {
        tell(g, `${nameOf(charId)} ออกจากกิลด์`);
        push(g);
      }
    });
  },

  async kick(leader: string, target: unknown) {
    const g = guildOf.get(leader) ?? fail('คุณไม่ได้อยู่ในกิลด์');
    if (g.leader !== leader) fail('หัวหน้ากิลด์เท่านั้นที่เชิญสมาชิกออกได้');
    const m = g.members.find((x) => x.id === target);
    if (!m || m.id === leader) fail('เชิญคนนี้ออกไม่ได้');
    await guarded(leader, async () => {
      await db.guildLeave(m!.id);
      g.members = g.members.filter((x) => x.id !== m!.id);
      guildOf.delete(m!.id);
      setTag(m!.id, '');
      send(m!.id, 'guild', null);
      send(m!.id, 'system', { text: `คุณถูกเชิญออกจากกิลด์ "${g.name}"` });
      tell(g, `${m!.name} ถูกเชิญออกจากกิลด์`);
      push(g);
    });
  },

  async setLeader(leader: string, target: unknown) {
    const g = guildOf.get(leader) ?? fail('คุณไม่ได้อยู่ในกิลด์');
    if (g.leader !== leader) fail('หัวหน้ากิลด์เท่านั้นที่มอบตำแหน่งได้');
    const m = g.members.find((x) => x.id === target);
    if (!m || m.id === leader) fail('มอบให้คนนี้ไม่ได้');
    await guarded(leader, async () => {
      await db.guildLeader(g.id, m!.id);
      g.leader = m!.id;
      tell(g, `${m!.name} เป็นหัวหน้ากิลด์คนใหม่`);
      push(g);
    });
  },

  /** Guild chat (`/g ข้อความ`): reaches members on every map. */
  chat(charId: string, text: string) {
    const g = guildOf.get(charId) ?? fail('คุณไม่ได้อยู่ในกิลด์');
    for (const m of g.members) send(m.id, 'guildChat', { name: nameOf(charId), text });
  },

  /** What the castle herald says (and the castle map's banner). */
  castleInfo() {
    const w = warNow();
    return { owner: Guilds.castleOwner()?.name ?? '', warEnds: w?.end, nextWar: nextWar().start, schedule: warScheduleText() };
  },
};

// invites run out
setInterval(() => {
  const now = Date.now();
  for (const [k, inv] of invites) if (inv.until < now) invites.delete(k);
}, 5000).unref?.();
