/**
 * PVP and guild war rules, shared by the browser and the game server (2026-11-10).
 *
 * - ลานประลอง (`arena`): players can always fight each other there. Dying costs nothing; you get up in the arena.
 * - ปราสาทแห่งเสียง (`gvg`): during the guild war (WAR_SCHEDULE, Thai time) players of different guilds fight,
 *   and the guild that breaks the คริสตัลแห่งเสียง (EMPERIUM) takes the castle. When the war ends, the guild
 *   holding the castle wins: WAR_PRIZE zeny for each of its members who is online.
 * - Party members never hurt each other; neither do members of the same guild.
 */

export const ARENA_MAP = 'arena';
export const CASTLE_MAP = 'gvg';
/** The castle's id in the database (guild_castles.castle). */
export const CASTLE_ID = 'gvg';
/** The crystal you break to take the castle: a "monster" that never moves or fights back. */
export const EMPERIUM = 'emperium';

/** Damage between players is this share of what the same blow does to a monster (so nobody dies to one hit). */
export const PVP_DAMAGE = 0.6;

export const GUILD_COST = 50_000;
export const GUILD_MAX = 30;
export const GUILD_NAME_MAX = 16;
/** Zeny each online member of the guild holding the castle gets when a war ends. */
export const WAR_PRIZE = 100_000;

/**
 * When the guild war runs, in Thai time (UTC+7): day 0 = Sunday ... 6 = Saturday, hours as "HH:MM".
 * Change this list to move or add war nights (the server and the browser both read it).
 */
export const WAR_SCHEDULE: { day: number; start: string; end: string }[] = [
  { day: 6, start: '20:00', end: '21:00' },
];

const THAI_OFFSET_MS = 7 * 3600 * 1000;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Every war window that touches the week around `now` (UTC ms), as [start, end) in UTC ms. */
function windows(now: number) {
  const thai = now + THAI_OFFSET_MS;
  const d = new Date(thai);
  // midnight of this week's Sunday, in "Thai clock" ms
  const sunday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - d.getUTCDay() * 24 * 3600 * 1000;
  const out: [number, number][] = [];
  for (const week of [-1, 0, 1]) {
    for (const w of WAR_SCHEDULE) {
      const start = sunday + week * WEEK_MS + w.day * 24 * 3600 * 1000 + minutes(w.start) * 60000 - THAI_OFFSET_MS;
      let end = sunday + week * WEEK_MS + w.day * 24 * 3600 * 1000 + minutes(w.end) * 60000 - THAI_OFFSET_MS;
      if (end <= start) end += 24 * 3600 * 1000; // runs past midnight
      out.push([start, end]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** The war running at `now`: when it ends (UTC ms), or null. */
export function warNow(now = Date.now()) {
  const w = windows(now).find(([s, e]) => s <= now && now < e);
  return w ? { start: w[0], end: w[1] } : null;
}

/** The next war to start after `now`. */
export function nextWar(now = Date.now()) {
  const w = windows(now).find(([s]) => s > now)!;
  return { start: w[0], end: w[1] };
}

/** "ทุกวันเสาร์ 20:00–21:00 น." */
export function warScheduleText() {
  return WAR_SCHEDULE.map((w) => `ทุกวัน${DAY_NAMES[w.day]} ${w.start}–${w.end} น.`).join(', ');
}

/** "2 ชม. 5 นาที" */
export function durationText(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return [d ? `${d} วัน` : '', h ? `${h} ชม.` : '', !d && mm ? `${mm} นาที` : ''].filter(Boolean).join(' ') || 'ไม่ถึง 1 นาที';
}

/** Players can hurt each other on this map right now. */
export function pvpOn(map: string, now = Date.now()) {
  return map === ARENA_MAP || (map === CASTLE_MAP && !!warNow(now));
}

/** What the browser is told about PVP on its map ('pvp' message). */
export interface PvpInfo {
  on: boolean;
  /** the castle: who holds it and the war times */
  owner?: string;
  warEnds?: number;
  nextWar?: number;
}

/** The guild window (see server/src/guild.ts). */
export interface GuildView {
  id: string;
  name: string;
  leader: string;
  me: string;
  max: number;
  castle: boolean;
  members: { id: string; name: string; cls: string; level: number; online: boolean; map: string }[];
}

/** One row of the arena scoreboard. */
export interface PvpScore {
  name: string;
  guild: string;
  kills: number;
  deaths: number;
}

/** A guild name: Thai/English letters, digits and spaces, 2-16 long. */
export function cleanGuildName(s: unknown) {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (v.length < 2 || v.length > GUILD_NAME_MAX) return null;
  if (!/^[\p{L}\p{M}\p{N} _-]+$/u.test(v)) return null;
  return v;
}
