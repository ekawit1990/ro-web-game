import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Character, InvItem } from '../../src/data/index.ts';
import { LocalStore } from '../../src/services/localStore.ts';
import type { KillResult, TradeOffer } from '../../src/services/store.ts';
import { CHAR_COLUMNS } from '../../src/services/supabaseStore.ts';

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
  useItem(userId: string, charId: string, invId: string): Promise<string>;
  onDeath(userId: string, charId: string): Promise<Character>;
  saveState(userId: string, charId: string, s: SavedState): Promise<void>;
  trade(a: TradeSide, b: TradeSide): Promise<void>;
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
    const char = check(
      await this.sb.from('characters').select(CHAR_COLUMNS).eq('id', charId).eq('user_id', userId).single(),
    ) as unknown as Character;
    const inv = check(
      await this.sb.from('inventory').select('id,item_id,qty,equipped').eq('character_id', charId),
    ) as InvItem[];
    return { char, inv };
  }

  async reportKill(userId: string, charId: string, monster: string) {
    return check(await this.sb.rpc('report_kill', { p_user: userId, p_char: charId, p_monster: monster })) as KillResult;
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

  async trade(a: TradeSide, b: TradeSide) {
    check(
      await this.sb.rpc('trade_execute', {
        p_user_a: a.userId, p_char_a: a.charId, p_items_a: a.offer.items, p_zeny_a: a.offer.zeny,
        p_user_b: b.userId, p_char_b: b.charId, p_items_b: b.offer.items, p_zeny_b: b.offer.zeny,
      }),
    );
  }
}

/**
 * Local testing without Supabase: trusts the character the browser sends (offline mode saves),
 * keeps it in memory, and sends changes back so the browser can save them.
 * Never use this for a public server.
 */
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

  useItem(_u: string, charId: string, invId: string) {
    return this.store.useItem(charId, invId);
  }

  onDeath(_u: string, charId: string) {
    return this.store.onDeath(charId);
  }

  saveState(_u: string, charId: string, s: SavedState) {
    return this.store.saveState(charId, { hp: s.hp, sp: s.sp, map: s.map, pos_x: s.x, pos_y: s.y });
  }

  trade(a: TradeSide, b: TradeSide) {
    return this.store.trade(a.charId, a.offer, b.charId, b.offer);
  }
}
