import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appearance, Character, ClassKey, InvItem, StatKey, StorageItem } from '../data';
import type { GameStore, RefineResult } from './store';

export const CHAR_COLUMNS =
  'id,name,cls,level,exp,job_level,job_exp,zeny,stat_points,skill_points,skills,job_quest,str,agi,vit,int,dex,luk,gender,hair,hair_color,face,hp,sp,map,pos_x,pos_y';

/** The save point (บูรพา) needs the newer setup.sql / add-save-point.sql; without it, load the rest. */
const SAVE_COLUMNS = ',save_map,save_x,save_y';

/** refine + cards need the newer setup.sql; until it is re-run, fall back to the old columns. */
export const INV_COLUMNS = 'id,item_id,qty,equipped,refine,cards';
const OLD_INV_COLUMNS = 'id,item_id,qty,equipped';

/** A character's bag, from a database with or without the refine/cards columns. */
export async function selectInventory(sb: SupabaseClient, charId: string): Promise<InvItem[]> {
  const res = await sb.from('inventory').select(INV_COLUMNS).eq('character_id', charId);
  if (!res.error) return res.data as InvItem[];
  return check(await sb.from('inventory').select(OLD_INV_COLUMNS).eq('character_id', charId)) as InvItem[];
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

function clean(c: Record<string, unknown>): Character {
  const { user_id, last_kill_at, created_at, ...rest } = c;
  return rest as unknown as Character;
}

export class SupabaseStore implements GameStore {
  readonly online = true;
  constructor(private sb: SupabaseClient) {}

  async userLabel() {
    const { data } = await this.sb.auth.getUser();
    const u = data.user;
    if (!u) return 'ผู้เล่น';
    return (u.user_metadata?.username as string | undefined) ?? u.email ?? 'ผู้เล่น';
  }

  async listCharacters() {
    const res = await this.sb.from('characters').select(CHAR_COLUMNS + SAVE_COLUMNS).order('created_at');
    if (!res.error) return res.data as unknown as Character[];
    return check(await this.sb.from('characters').select(CHAR_COLUMNS).order('created_at')) as unknown as Character[];
  }

  async createCharacter(name: string, look: Appearance) {
    return clean(
      check(
        await this.sb.rpc('create_character', {
          p_name: name, p_gender: look.gender, p_hair: look.hair, p_hair_color: look.hair_color, p_face: look.face,
        }),
      ),
    );
  }

  async deleteCharacter(id: string) {
    check(await this.sb.from('characters').delete().eq('id', id));
  }

  async getCharacter(id: string) {
    const res = await this.sb.from('characters').select(CHAR_COLUMNS + SAVE_COLUMNS).eq('id', id).single();
    if (!res.error) return res.data as unknown as Character;
    return check(await this.sb.from('characters').select(CHAR_COLUMNS).eq('id', id).single()) as unknown as Character;
  }

  async loadInventory(charId: string) {
    return selectInventory(this.sb, charId);
  }

  async allocateStat(charId: string, stat: StatKey) {
    return clean(check(await this.sb.rpc('allocate_stat', { p_char: charId, p_stat: stat })));
  }

  async learnSkill(charId: string, skill: string) {
    return clean(check(await this.sb.rpc('learn_skill', { p_char: charId, p_skill: skill })));
  }

  async startJobQuest(charId: string) {
    return clean(check(await this.sb.rpc('start_job_quest', { p_char: charId })));
  }

  async changeJob(charId: string, cls: ClassKey) {
    return clean(check(await this.sb.rpc('change_job', { p_char: charId, p_cls: cls })));
  }

  async buyItem(charId: string, itemId: string, qty: number) {
    return clean(check(await this.sb.rpc('buy_item', { p_char: charId, p_item: itemId, p_qty: qty })));
  }

  async sellItem(charId: string, invId: string, qty: number) {
    return clean(check(await this.sb.rpc('sell_item', { p_char: charId, p_inv: invId, p_qty: qty })));
  }

  async setEquipped(charId: string, invId: string, equipped: boolean) {
    check(await this.sb.rpc('set_equipped', { p_char: charId, p_inv: invId, p_equipped: equipped }));
  }

  async loadStorage() {
    const res = await this.sb.from('account_storage').select('id,item_id,qty,refine,cards').order('item_id');
    if (!res.error) return res.data as StorageItem[];
    return check(await this.sb.from('account_storage').select('id,item_id,qty').order('item_id')) as StorageItem[];
  }

  async insertCard(charId: string, cardInv: string, equipInv: string) {
    check(await this.sb.rpc('insert_card', { p_char: charId, p_card: cardInv, p_equip: equipInv }));
  }

  async refineItem(charId: string, invId: string) {
    const r = check(await this.sb.rpc('refine_item', { p_char: charId, p_inv: invId })) as RefineResult;
    return { ...r, character: clean(r.character as never) };
  }

  async resetStats(charId: string) {
    return clean(check(await this.sb.rpc('reset_stats', { p_char: charId })));
  }

  async resetSkills(charId: string) {
    return clean(check(await this.sb.rpc('reset_skills', { p_char: charId })));
  }

  async removeCards(charId: string, invId: string) {
    return clean(check(await this.sb.rpc('remove_cards', { p_char: charId, p_inv: invId })));
  }

  async storagePut(charId: string, invId: string, qty: number) {
    check(await this.sb.rpc('storage_put', { p_char: charId, p_inv: invId, p_qty: qty }));
  }

  async setSavePoint(charId: string, map: string, x: number, y: number) {
    return clean(check(await this.sb.rpc('set_save_point', { p_char: charId, p_map: map, p_x: x, p_y: y })));
  }

  async storageTake(charId: string, rowId: string, qty: number) {
    check(await this.sb.rpc('storage_take', { p_char: charId, p_row: rowId, p_qty: qty }));
  }

  async signOut() {
    await this.sb.auth.signOut();
  }
}
