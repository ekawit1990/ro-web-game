import type { SupabaseClient } from '@supabase/supabase-js';
import type { Appearance, Character, ClassKey, InvItem, StatKey } from '../data';
import type { GameStore } from './store';

export const CHAR_COLUMNS =
  'id,name,cls,level,exp,job_level,job_exp,zeny,stat_points,skill_points,skills,str,agi,vit,int,dex,luk,gender,hair,hair_color,face,hp,sp,map,pos_x,pos_y';

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
    return data.user?.email ?? 'ผู้เล่น';
  }

  async listCharacters() {
    return check(await this.sb.from('characters').select(CHAR_COLUMNS).order('created_at')) as unknown as Character[];
  }

  async createCharacter(name: string, cls: ClassKey, look: Appearance) {
    return clean(
      check(
        await this.sb.rpc('create_character', {
          p_name: name, p_cls: cls, p_gender: look.gender, p_hair: look.hair, p_hair_color: look.hair_color, p_face: look.face,
        }),
      ),
    );
  }

  async deleteCharacter(id: string) {
    check(await this.sb.from('characters').delete().eq('id', id));
  }

  async getCharacter(id: string) {
    return check(await this.sb.from('characters').select(CHAR_COLUMNS).eq('id', id).single()) as unknown as Character;
  }

  async loadInventory(charId: string) {
    return check(
      await this.sb.from('inventory').select('id,item_id,qty,equipped').eq('character_id', charId),
    ) as InvItem[];
  }

  async allocateStat(charId: string, stat: StatKey) {
    return clean(check(await this.sb.rpc('allocate_stat', { p_char: charId, p_stat: stat })));
  }

  async learnSkill(charId: string, skill: string) {
    return clean(check(await this.sb.rpc('learn_skill', { p_char: charId, p_skill: skill })));
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

  async signOut() {
    await this.sb.auth.signOut();
  }
}
