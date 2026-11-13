import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Character, InvItem } from '../../src/data/index.ts';
import { LocalStore } from '../../src/services/localStore.ts';
import type { KillResult, RewardShare, TradeOffer } from '../../src/services/store.ts';
import { CHAR_COLUMNS, selectInventory } from '../../src/services/supabaseStore.ts';

export interface Loaded {
  userId: string;
  char: Character;
  inv: InvItem[];
}

/** Everything the game server needs to persist. Supabase in production, memory for local testing. */
export interface ServerDb {
  readonly name: string;
  /** Checks who the player is and that they own the character. */
  load(options: JoinOptions): Promise<Loaded>;
  reload(userId: string, charId: string, options?: JoinOptions): Promise<Omit<Loaded, 'userId'>>;
  reportKill(userId: string, charId: string, monster: string): Promise<KillResult>;
  /** Gives one party member their share of a kill (the server already rolled and split it). */
  grantReward(userId: string, charId: string, r: RewardShare): Promise<KillResult>;
  useItem(userId: string, charId: string, invId: string): Promise<string>;
  onDeath(userId: string, charId: string): Promise<Character>;
  saveState(userId: string, charId: string, s: SavedState): Promise<void>;
  /** Takes `cost` zeny and moves the character to `s` in one go (บูรพา's warp). Throws if they can't pay. */
  payWarp(userId: string, charId: string, cost: number, s: SavedState): Promise<Character>;
  trade(a: TradeSide, b: TradeSide): Promise<void>;
  /** Buys from a bot shop (ป้ามะลิ's list at 90%): takes the zeny and adds the items in one go. */
  botShopBuy(userId: string, charId: string, item: string, qty: number): Promise<Character>;

  // guilds (supabase/add-guild-war.sql)
  guildsLoad(): Promise<{ guilds: GuildRow[]; castles: { castle: string; guild: string | null }[] }>;
  /** Takes `cost` zeny and makes the guild with this character as its leader; returns the new guild's id. */
  guildCreate(userId: string, charId: string, name: string, cost: number): Promise<string>;
  guildJoin(guildId: string, charId: string): Promise<void>;
  guildLeave(charId: string): Promise<void>;
  guildLeader(guildId: string, charId: string): Promise<void>;
  guildDelete(guildId: string): Promise<void>;
  castleSet(castle: string, guildId: string | null): Promise<void>;
  /** อันดับผู้กล้า: the highest characters, Base Lv first, then EXP, then Job Lv. */
  ranking(limit: number): Promise<RankRow[]>;
}

export interface RankRow {
  id: string;
  name: string;
  cls: string;
  level: number;
  job_level: number;
  exp: number;
}

const byRank = (a: RankRow, b: RankRow) => b.level - a.level || b.exp - a.exp || b.job_level - a.job_level || a.name.localeCompare(b.name);

export interface GuildRow {
  id: string;
  name: string;
  leader: string | null;
  members: { char: string; name: string; cls: string; level: number }[];
}

export interface SavedState {
  hp: number;
  sp: number;
  map: string;
  x: number;
  y: number;
}

export interface TradeSide {
  userId: string;
  charId: string;
  offer: TradeOffer;
}

export interface JoinOptions {
  token?: string;
  charId: string;
  /** dev mode only: the client's own copy of the character */
  dev?: { char: Character; inv: InvItem[] };
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

export class SupabaseDb implements ServerDb {
  readonly name = 'supabase';
  private sb: SupabaseClient;

  constructor(url: string, serviceKey: string) {
    this.sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async load(o: JoinOptions): Promise<Loaded> {
    if (!o.token) throw new Error('missing token');
    const { data, error } = await this.sb.auth.getUser(o.token);
    if (error || !data.user) throw new Error('invalid session');
    return { userId: data.user.id, ...(await this.reload(data.user.id, o.charId)) };
  }

  async reload(userId: string, charId: string) {
    // two independent queries: run them side by side (one round trip instead of two)
    const [c, i] = await Promise.all([
      this.sb.from('characters').select(CHAR_COLUMNS).eq('id', charId).eq('user_id', userId).single(),
      selectInventory(this.sb, charId),
    ]);
    return { char: check(c) as unknown as Character, inv: i };
  }

  async reportKill(userId: string, charId: string, monster: string) {
    return check(await this.sb.rpc('report_kill', { p_user: userId, p_char: charId, p_monster: monster })) as KillResult;
  }

  async grantReward(userId: string, charId: string, r: RewardShare) {
    return check(await this.sb.rpc('grant_reward', {
      p_user: userId, p_char: charId, p_exp: r.exp, p_job_exp: r.jobExp, p_zeny: r.zeny, p_items: r.items, p_quest: r.quest,
    })) as KillResult;
  }

  async useItem(userId: string, charId: string, invId: string) {
    return check(await this.sb.rpc('use_item', { p_user: userId, p_char: charId, p_inv: invId })) as string;
  }

  async onDeath(userId: string, charId: string) {
    return check(await this.sb.rpc('on_death', { p_user: userId, p_char: charId })) as Character;
  }

  async saveState(userId: string, charId: string, s: SavedState) {
    check(
      await this.sb.rpc('save_state', {
        p_user: userId, p_char: charId, p_hp: Math.round(s.hp), p_sp: Math.round(s.sp), p_map: s.map, p_x: s.x, p_y: s.y,
      }),
    );
  }

  async payWarp(userId: string, charId: string, cost: number, s: SavedState) {
    const c = check(
      await this.sb.rpc('pay_warp', {
        p_user: userId, p_char: charId, p_cost: cost, p_hp: Math.round(s.hp), p_sp: Math.round(s.sp), p_map: s.map, p_x: s.x, p_y: s.y,
      }),
    ) as Record<string, unknown>;
    const { user_id, last_kill_at, created_at, ...rest } = c;
    return rest as unknown as Character;
  }

  async botShopBuy(userId: string, charId: string, item: string, qty: number) {
    const c = check(await this.sb.rpc('bot_shop_buy', { p_user: userId, p_char: charId, p_item: item, p_qty: qty })) as Record<string, unknown>;
    const { user_id, last_kill_at, created_at, ...rest } = c;
    return rest as unknown as Character;
  }

  async trade(a: TradeSide, b: TradeSide) {
    check(
      await this.sb.rpc('trade_execute', {
        p_user_a: a.userId, p_char_a: a.charId, p_items_a: a.offer.items, p_zeny_a: a.offer.zeny,
        p_user_b: b.userId, p_char_b: b.charId, p_items_b: b.offer.items, p_zeny_b: b.offer.zeny,
      }),
    );
  }

  ranking(limit: number) {
    return supabaseRanking(this.sb, limit);
  }

  async guildsLoad() {
    const [g, m, c] = await Promise.all([
      this.sb.from('guilds').select('id, name, leader'),
      this.sb.from('guild_members').select('char_id, guild_id, joined_at, characters(name, cls, level)').order('joined_at'),
      this.sb.from('guild_castles').select('castle, guild_id'),
    ]);
    const rows = new Map<string, GuildRow>();
    for (const r of check(g) as { id: string; name: string; leader: string | null }[]) rows.set(r.id, { ...r, members: [] });
    for (const r of check(m) as unknown as { char_id: string; guild_id: string; characters: { name: string; cls: string; level: number } | null }[]) {
      const ch = r.characters;
      if (ch) rows.get(r.guild_id)?.members.push({ char: r.char_id, name: ch.name, cls: ch.cls, level: ch.level });
    }
    return {
      guilds: [...rows.values()],
      castles: (check(c) as { castle: string; guild_id: string | null }[]).map((x) => ({ castle: x.castle, guild: x.guild_id })),
    };
  }

  async guildCreate(userId: string, charId: string, name: string, cost: number) {
    return check(await this.sb.rpc('guild_create', { p_user: userId, p_char: charId, p_name: name, p_cost: cost })) as string;
  }

  async guildJoin(guildId: string, charId: string) {
    const r = await this.sb.from('guild_members').insert({ guild_id: guildId, char_id: charId });
    if (r.error) throw new Error(/duplicate/i.test(r.error.message) ? 'อยู่ในกิลด์อื่นแล้ว' : r.error.message);
  }

  async guildLeave(charId: string) {
    check(await this.sb.from('guild_members').delete().eq('char_id', charId));
  }

  async guildLeader(guildId: string, charId: string) {
    check(await this.sb.from('guilds').update({ leader: charId }).eq('id', guildId));
  }

  async guildDelete(guildId: string) {
    check(await this.sb.from('guilds').delete().eq('id', guildId));
  }

  async castleSet(castle: string, guildId: string | null) {
    check(await this.sb.from('guild_castles').upsert({ castle, guild_id: guildId, since: new Date().toISOString() }));
  }
}

/**
 * Local testing without Supabase: trusts the character the browser sends (offline mode saves),
 * keeps it in memory, and sends changes back so the browser can save them.
 * Never use this for a public server.
 */
async function supabaseRanking(sb: SupabaseClient, limit: number): Promise<RankRow[]> {
  const res = await sb.from('characters').select('id, name, cls, level, job_level, exp')
    .order('level', { ascending: false }).order('exp', { ascending: false }).order('job_level', { ascending: false })
    .limit(limit);
  return (check(res) as RankRow[]).sort(byRank);
}

export class DevDb implements ServerDb {
  readonly name = 'dev (memory, trusts clients)';
  private store = new LocalStore(false);

  async load(o: JoinOptions): Promise<Loaded> {
    if (!o.dev) throw new Error('dev server expects a dev character');
    this.store.importCharacter(o.dev.char, o.dev.inv);
    return { userId: 'dev', ...(await this.reload('dev', o.charId)) };
  }

  async reload(_userId: string, charId: string, o?: JoinOptions) {
    if (o?.dev) this.store.importCharacter(o.dev.char, o.dev.inv);
    return { char: await this.store.getCharacter(charId), inv: await this.store.loadInventory(charId) };
  }

  reportKill(_u: string, charId: string, monster: string) {
    return this.store.reportKill(charId, monster);
  }

  grantReward(_u: string, charId: string, r: RewardShare) {
    return this.store.grantReward(charId, r);
  }

  useItem(_u: string, charId: string, invId: string) {
    return this.store.useItem(charId, invId);
  }

  onDeath(_u: string, charId: string) {
    return this.store.onDeath(charId);
  }

  saveState(_u: string, charId: string, s: SavedState) {
    return this.store.saveState(charId, { hp: s.hp, sp: s.sp, map: s.map, pos_x: s.x, pos_y: s.y });
  }

  payWarp(_u: string, charId: string, cost: number, s: SavedState) {
    return this.store.payWarp(charId, cost, { hp: s.hp, sp: s.sp, map: s.map, pos_x: s.x, pos_y: s.y });
  }

  trade(a: TradeSide, b: TradeSide) {
    return this.store.trade(a.charId, a.offer, b.charId, b.offer);
  }

  botShopBuy(_userId: string, charId: string, item: string, qty: number) {
    return this.store.botShopBuy(charId, item, qty);
  }

  // guilds: memory only (gone when the dev server stops)
  private guilds = new Map<string, { id: string; name: string; leader: string | null; members: string[] }>();
  private castles = new Map<string, string | null>();
  private gseq = 0;

  async ranking(limit: number) {
    const all = (await this.store.listCharacters()) as RankRow[];
    return all.map(({ id, name, cls, level, job_level, exp }) => ({ id, name, cls, level, job_level, exp })).sort(byRank).slice(0, limit);
  }

  async guildsLoad() {
    const guilds: GuildRow[] = [];
    for (const g of this.guilds.values()) {
      const members = [];
      for (const id of g.members) {
        const c = await this.store.getCharacter(id).catch(() => null);
        if (c) members.push({ char: id, name: c.name, cls: c.cls, level: c.level });
      }
      guilds.push({ id: g.id, name: g.name, leader: g.leader, members });
    }
    return { guilds, castles: [...this.castles].map(([castle, guild]) => ({ castle, guild })) };
  }

  async guildCreate(_u: string, charId: string, name: string, cost: number) {
    const c = await this.store.getCharacter(charId);
    if (c.zeny < cost) throw new Error(`Zeny ไม่พอ (ค่าสร้างกิลด์ ${cost.toLocaleString()} z)`);
    if ([...this.guilds.values()].some((g) => g.name.toLowerCase() === name.toLowerCase())) throw new Error('ชื่อกิลด์นี้มีคนใช้แล้ว');
    await this.store.grantReward(charId, { exp: 0, jobExp: 0, zeny: -cost, items: [], quest: false });
    const id = `g${++this.gseq}`;
    this.guilds.set(id, { id, name, leader: charId, members: [charId] });
    return id;
  }

  async guildJoin(guildId: string, charId: string) {
    this.guilds.get(guildId)?.members.push(charId);
  }

  async guildLeave(charId: string) {
    for (const g of this.guilds.values()) g.members = g.members.filter((m) => m !== charId);
  }

  async guildLeader(guildId: string, charId: string) {
    const g = this.guilds.get(guildId);
    if (g) g.leader = charId;
  }

  async guildDelete(guildId: string) {
    this.guilds.delete(guildId);
    for (const [k, v] of this.castles) if (v === guildId) this.castles.set(k, null);
  }

  async castleSet(castle: string, guildId: string | null) {
    this.castles.set(castle, guildId);
  }
}
