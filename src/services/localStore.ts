import {
  Appearance, CLASSES, CLASS_KEYS, Character, ClassKey, EQUIP_TYPES, ITEMS, InvItem, JOB_CHANGE, MAX_JOB_LEVEL, MAX_LEVEL,
  MONSTERS, REFINE, SHOP, SKILLS, START_CLASS, STORAGE_SLOTS, StatKey, StorageItem, WEAPON_SHOP, canRefine, cardFits, expToNext, wearBlock,
  jobExpToNext, questCounts, refineChance, refineFee, refineMaterial, statCost, statPointsAt,
  SERVICE_FEE, STAT_KEYS, statRefund, npcBuyPrice, npcSellPrice,
} from '../data';
import type { GameStore, KillResult, RefineResult, RewardShare, TradeOffer } from './store';

const KEY = 'music-land-save-v2';
export const TOWN_SPAWN = { map: 'town', x: 48.5, y: 55.5 };

interface SaveFile {
  characters: Character[];
  inventory: Record<string, InvItem[]>;
  /** บูรพา's storage: one per account, i.e. per browser here. */
  storage?: StorageItem[];
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

const isEquipment = (itemId: string) => EQUIP_TYPES.includes(ITEMS[itemId]?.type);

/**
 * Same rules as the Supabase functions (supabase/migrations/0001_init.sql), kept in browser storage.
 * Used for local testing without Supabase: by the browser for menus, and by the dev game server.
 */
export class LocalStore implements GameStore {
  readonly online = false;
  private data: SaveFile;

  constructor(private persistent = true) {
    let parsed: SaveFile | null = null;
    try {
      if (persistent) parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      parsed = null;
    }
    this.data = parsed ?? { characters: [], inventory: {} };
  }

  private persist() {
    if (!this.persistent) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be unavailable (private mode); progress lives for this tab only */
    }
  }

  private char(id: string): Character {
    const c = this.data.characters.find((x) => x.id === id);
    if (!c) throw new Error('ไม่พบตัวละคร');
    return c;
  }

  private inv(id: string): InvItem[] {
    return (this.data.inventory[id] ??= []);
  }

  private addItem(charId: string, itemId: string, qty: number) {
    const inv = this.inv(charId);
    if (isEquipment(itemId)) {
      for (let i = 0; i < qty; i++) inv.push({ id: uid(), item_id: itemId, qty: 1, equipped: false });
      return;
    }
    const row = inv.find((i) => i.item_id === itemId);
    if (row) row.qty += qty;
    else inv.push({ id: uid(), item_id: itemId, qty, equipped: false });
  }

  async userLabel() {
    return 'ผู้เล่นทดสอบ';
  }

  async listCharacters() {
    return this.data.characters.map((c) => ({ ...c }));
  }

  async createCharacter(name: string, look: Appearance) {
    name = name.trim();
    if (name.length < 2 || name.length > 16) throw new Error('ชื่อต้องยาว 2-16 ตัวอักษร');
    if (this.data.characters.length >= 3) throw new Error('สร้างได้สูงสุด 3 ตัวละคร');
    if (this.data.characters.some((c) => c.name === name)) throw new Error('ชื่อนี้ถูกใช้แล้ว');
    const cls = START_CLASS;
    const def = CLASSES[cls];
    const c: Character = {
      id: uid(), name, cls, level: 1, exp: 0, job_level: 1, job_exp: 0, zeny: 100, stat_points: 0, skill_points: 0,
      skills: {}, job_quest: -1, ...def.baseStats, ...look, hp: -1, sp: -1, map: TOWN_SPAWN.map, pos_x: TOWN_SPAWN.x, pos_y: TOWN_SPAWN.y,
    };
    this.data.characters.push(c);
    this.addItem(c.id, def.startWeapon, 1);
    this.inv(c.id)[0].equipped = true;
    this.addItem(c.id, 'water', 5);
    this.persist();
    return { ...c };
  }

  async deleteCharacter(id: string) {
    this.data.characters = this.data.characters.filter((c) => c.id !== id);
    delete this.data.inventory[id];
    this.persist();
  }

  async getCharacter(id: string) {
    return { ...this.char(id), skills: { ...this.char(id).skills } };
  }

  async loadInventory(charId: string) {
    return this.inv(charId).map((i) => ({ ...i }));
  }

  async reportKill(charId: string, monster: string): Promise<KillResult> {
    const m = MONSTERS[monster];
    if (!m) throw new Error('unknown monster');
    this.char(charId);
    return this.grantReward(charId, {
      exp: m.exp, jobExp: m.jobExp, zeny: randInt(m.zeny[0], m.zeny[1]),
      items: m.drops.filter(([, chance]) => Math.random() < chance).map(([id]) => id), quest: questCounts(m),
    });
  }

  /** Same as grant_reward() in SQL: one character's share of a kill (a whole kill when playing solo). */
  async grantReward(charId: string, r: RewardShare): Promise<KillResult> {
    const c = this.char(charId);
    r.items.forEach((d) => this.addItem(charId, d, 1));
    c.zeny += r.zeny;
    const startLevel = c.level;
    const startJob = c.job_level;
    if (c.level < MAX_LEVEL) c.exp += r.exp;
    while (c.level < MAX_LEVEL && c.exp >= expToNext(c.level)) {
      c.exp -= expToNext(c.level);
      c.level++;
      c.stat_points += statPointsAt(c.level);
    }
    if (c.level >= MAX_LEVEL) c.exp = 0;
    if (c.job_level < MAX_JOB_LEVEL) c.job_exp += r.jobExp;
    while (c.job_level < MAX_JOB_LEVEL && c.job_exp >= jobExpToNext(c.job_level)) {
      c.job_exp -= jobExpToNext(c.job_level);
      c.job_level++;
      c.skill_points++;
    }
    if (c.job_level >= MAX_JOB_LEVEL) c.job_exp = 0;
    if (r.quest && (c.job_quest ?? -1) >= 0 && c.job_quest < JOB_CHANGE.kills) c.job_quest++;
    this.persist();
    return {
      character: await this.getCharacter(charId), drops: [...r.items], zeny: r.zeny, exp: r.exp, jobExp: r.jobExp,
      leveledUp: c.level > startLevel, jobLeveledUp: c.job_level > startJob,
    };
  }

  async allocateStat(charId: string, stat: StatKey) {
    const c = this.char(charId);
    if (c[stat] >= 99) throw new Error('สเตตัสเต็มแล้ว');
    const cost = statCost(c[stat]);
    if (c.stat_points < cost) throw new Error(`แต้มสเตตัสไม่พอ (ต้องใช้ ${cost})`);
    c[stat]++;
    c.stat_points -= cost;
    this.persist();
    return this.getCharacter(charId);
  }

  async learnSkill(charId: string, skill: string) {
    const c = this.char(charId);
    const s = SKILLS[skill];
    if (!s || (s.cls !== c.cls && s.cls !== 'all')) throw new Error('อาชีพนี้เรียนสกิลนี้ไม่ได้');
    const cur = c.skills[skill] ?? 0;
    if (cur >= s.maxLevel) throw new Error('สกิลเต็มแล้ว');
    if (c.skill_points < 1) throw new Error('แต้มสกิลไม่พอ');
    c.skills = { ...c.skills, [skill]: cur + 1 };
    c.skill_points--;
    this.persist();
    return this.getCharacter(charId);
  }

  async startJobQuest(charId: string) {
    const c = this.char(charId);
    if (c.cls !== START_CLASS) throw new Error('เปลี่ยนอาชีพไปแล้ว');
    if (c.level < JOB_CHANGE.level) throw new Error(`ต้องมี Base Lv ${JOB_CHANGE.level} ก่อน`);
    if ((c.job_quest ?? -1) < 0) c.job_quest = 0;
    this.persist();
    return this.getCharacter(charId);
  }

  async changeJob(charId: string, cls: ClassKey) {
    const c = this.char(charId);
    if (c.cls !== START_CLASS) throw new Error('เปลี่ยนอาชีพไปแล้ว');
    if (!CLASS_KEYS.includes(cls)) throw new Error('ไม่มีอาชีพนี้');
    if (c.level < JOB_CHANGE.level || (c.job_quest ?? -1) < JOB_CHANGE.kills) throw new Error('ยังทำเควสไม่สำเร็จ');
    // which town hands out which class (JOB_TOWN) is checked by the NPC and by change_job() in SQL;
    // the browser's copy of `map` can lag behind in dev mode, so it isn't checked here
    // fresh start (same as change_job in SQL): stats back to 1 with points refunded, Teen skills refunded
    let statBack = 0;
    for (const k of STAT_KEYS) statBack += statRefund(c[k]);
    let skillBack = 0;
    const skills: Record<string, number> = {};
    for (const [id, lv] of Object.entries(c.skills ?? {})) {
      if (SKILLS[id]?.cls === START_CLASS) skillBack += Math.max(0, lv);
      else skills[id] = lv;
    }
    Object.assign(c, {
      cls, job_level: 1, job_exp: 0, job_quest: -1, skills,
      stat_points: c.stat_points + statBack, skill_points: c.skill_points + skillBack,
      str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1,
    });
    // the old weapon only fits a Teen: put it in the bag and hand over the new class's first instrument
    const inv = this.inv(charId);
    inv.forEach((i) => { if (i.equipped && ITEMS[i.item_id].type === 'weapon') i.equipped = false; });
    inv.push({ id: uid(), item_id: CLASSES[cls].startWeapon, qty: 1, equipped: true });
    this.persist();
    return this.getCharacter(charId);
  }

  async buyItem(charId: string, itemId: string, qty: number) {
    const c = this.char(charId);
    const item = ITEMS[itemId];
    const inShop = SHOP.includes(itemId) || WEAPON_SHOP.includes(itemId);
    if (!item || !inShop || qty < 1 || qty > 99) throw new Error('ซื้อไม่ได้');
    const cost = npcBuyPrice(itemId, c.skills) * qty;
    if (c.zeny < cost) throw new Error('เงินไม่พอ');
    c.zeny -= cost;
    this.addItem(charId, itemId, qty);
    this.persist();
    return this.getCharacter(charId);
  }

  async sellItem(charId: string, invId: string, qty: number) {
    const c = this.char(charId);
    const inv = this.inv(charId);
    const row = inv.find((i) => i.id === invId);
    if (!row || row.equipped || qty < 1 || qty > row.qty) throw new Error('ขายไม่ได้');
    row.qty -= qty;
    if (row.qty === 0) inv.splice(inv.indexOf(row), 1);
    c.zeny += npcSellPrice(row.item_id, c.skills) * qty;
    this.persist();
    return this.getCharacter(charId);
  }

  async useItem(charId: string, invId: string) {
    const inv = this.inv(charId);
    const row = inv.find((i) => i.id === invId);
    if (!row || ITEMS[row.item_id].type !== 'consumable') throw new Error('ใช้ไม่ได้');
    row.qty--;
    if (row.qty === 0) inv.splice(inv.indexOf(row), 1);
    this.persist();
    return row.item_id;
  }

  async setEquipped(charId: string, invId: string, equipped: boolean) {
    const c = this.char(charId);
    const inv = this.inv(charId);
    const row = inv.find((i) => i.id === invId);
    if (!row) throw new Error('ไม่พบไอเท็ม');
    const item = ITEMS[row.item_id];
    if (!isEquipment(row.item_id)) throw new Error('สวมใส่ไม่ได้');
    const block = equipped ? wearBlock(item, c) : '';
    if (block) throw new Error(block);
    if (equipped) inv.forEach((i) => { if (i.equipped && ITEMS[i.item_id].type === item.type) i.equipped = false; });
    row.equipped = equipped;
    this.persist();
  }

  async loadStorage() {
    return (this.data.storage ?? []).map((r) => ({ ...r }));
  }

  /** Same rules as storage_put() in SQL. */
  async storagePut(charId: string, invId: string, qty: number) {
    this.char(charId);
    const inv = this.inv(charId);
    const row = inv.find((i) => i.id === invId);
    if (!row || row.equipped || qty < 1 || qty > row.qty) throw new Error('ฝากไม่ได้');
    const st = (this.data.storage ??= []);
    const stack = isEquipment(row.item_id) ? undefined : st.find((r) => r.item_id === row.item_id);
    if (!stack && st.length >= STORAGE_SLOTS) throw new Error(`คลังเต็ม (${STORAGE_SLOTS} ช่อง)`);
    row.qty -= qty;
    if (row.qty === 0) inv.splice(inv.indexOf(row), 1);
    if (stack) stack.qty += qty;
    else st.push({ id: uid(), item_id: row.item_id, qty, refine: row.refine ?? 0, cards: [...(row.cards ?? [])] });
    this.persist();
  }

  /** Same rules as storage_take() in SQL. */
  async storageTake(charId: string, rowId: string, qty: number) {
    this.char(charId);
    const st = (this.data.storage ??= []);
    const row = st.find((r) => r.id === rowId);
    if (!row || qty < 1 || qty > row.qty) throw new Error('ถอนไม่ได้');
    row.qty -= qty;
    if (row.qty === 0) st.splice(st.indexOf(row), 1);
    if (isEquipment(row.item_id)) {
      // equipment keeps its + level and cards
      for (let i = 0; i < qty; i++) {
        this.inv(charId).push({ id: uid(), item_id: row.item_id, qty: 1, equipped: false, refine: row.refine ?? 0, cards: [...(row.cards ?? [])] });
      }
    } else this.addItem(charId, row.item_id, qty);
    this.persist();
  }

  /** Same rules as insert_card() in SQL. */
  async insertCard(charId: string, cardInv: string, equipInv: string) {
    this.char(charId);
    const inv = this.inv(charId);
    const card = inv.find((i) => i.id === cardInv);
    const eq = inv.find((i) => i.id === equipInv);
    if (!card || !eq) throw new Error('ไม่พบไอเท็ม');
    if (ITEMS[card.item_id]?.type !== 'card') throw new Error('ไอเท็มนี้ไม่ใช่การ์ด');
    if (!cardFits(ITEMS[card.item_id], ITEMS[eq.item_id])) throw new Error('การ์ดใบนี้เสียบในไอเท็มนี้ไม่ได้');
    if ((eq.cards?.length ?? 0) >= (ITEMS[eq.item_id].slots ?? 0)) throw new Error('ไม่มีช่องการ์ดว่าง');
    card.qty--;
    if (card.qty === 0) inv.splice(inv.indexOf(card), 1);
    eq.cards = [...(eq.cards ?? []), card.item_id];
    this.persist();
  }

  /** Same rules as refine_item() in SQL. */
  async refineItem(charId: string, invId: string): Promise<RefineResult> {
    const c = this.char(charId);
    const inv = this.inv(charId);
    const row = inv.find((i) => i.id === invId);
    if (!row) throw new Error('ไม่พบไอเท็ม');
    const it = ITEMS[row.item_id];
    if (!canRefine(it)) throw new Error('ไอเท็มนี้ตีบวกไม่ได้');
    const cur = row.refine ?? 0;
    if (cur >= REFINE.max) throw new Error(`ตีบวกสูงสุดแล้ว (+${REFINE.max})`);
    const fee = refineFee(cur + 1);
    if (c.zeny < fee) throw new Error(`Zeny ไม่พอ (ค่าตีบวก ${fee} z)`);
    const mat = inv.find((i) => i.item_id === refineMaterial(it, cur + 1));
    if (!mat) throw new Error(`ไม่มี${ITEMS[refineMaterial(it, cur + 1)].name}`);
    mat.qty--;
    if (mat.qty === 0) inv.splice(inv.indexOf(mat), 1);
    c.zeny -= fee;
    const ok = Math.random() * 100 < refineChance(it, cur + 1);
    if (ok) row.refine = cur + 1;
    else inv.splice(inv.indexOf(row), 1);
    this.persist();
    return { ok, refine: ok ? cur + 1 : cur, character: await this.getCharacter(charId) };
  }

  /** Same rules as reset_stats() in SQL. */
  async resetStats(charId: string) {
    const c = this.char(charId);
    if (STAT_KEYS.every((k) => c[k] === 1)) throw new Error('สเตตัสเป็น 1 ทั้งหมดอยู่แล้ว');
    const fee = SERVICE_FEE.resetStats;
    if (c.zeny < fee) throw new Error(`Zeny ไม่พอ (ค่ารีเซ็ต ${fee} z)`);
    let back = 0;
    for (const k of STAT_KEYS) { back += statRefund(c[k]); c[k] = 1; }
    c.stat_points += back;
    c.zeny -= fee;
    this.persist();
    return this.getCharacter(charId);
  }

  /** Same rules as reset_skills() in SQL. */
  async resetSkills(charId: string) {
    const c = this.char(charId);
    const back = Object.values(c.skills ?? {}).reduce((s, lv) => s + Math.max(0, lv), 0);
    if (back === 0) throw new Error('ยังไม่ได้เรียนสกิลเลย');
    const fee = SERVICE_FEE.resetSkills;
    if (c.zeny < fee) throw new Error(`Zeny ไม่พอ (ค่ารีเซ็ต ${fee} z)`);
    c.skill_points += back;
    c.skills = {};
    c.zeny -= fee;
    this.persist();
    return this.getCharacter(charId);
  }

  /** Same rules as remove_cards() in SQL. */
  async removeCards(charId: string, invId: string) {
    const c = this.char(charId);
    const row = this.inv(charId).find((i) => i.id === invId);
    if (!row) throw new Error('ไม่พบไอเท็ม');
    const cards = row.cards ?? [];
    if (!cards.length) throw new Error('ไอเท็มนี้ไม่มีการ์ด');
    const fee = SERVICE_FEE.removeCards;
    if (c.zeny < fee) throw new Error(`Zeny ไม่พอ (ค่าถอดการ์ด ${fee} z)`);
    c.zeny -= fee;
    row.cards = [];
    for (const card of cards) this.addItem(charId, card, 1);
    this.persist();
    return this.getCharacter(charId);
  }

  /** บูรพา's warp: pay and move, same as pay_warp() in SQL. */
  async payWarp(charId: string, cost: number, s: { hp: number; sp: number; map: string; pos_x: number; pos_y: number }) {
    const c = this.char(charId);
    if (c.zeny < cost) throw new Error(`Zeny ไม่พอ (ค่าวาร์ป ${cost.toLocaleString()} z)`);
    c.zeny -= cost;
    Object.assign(c, s);
    this.persist();
    return this.getCharacter(charId);
  }

  async saveState(charId: string, s: { hp: number; sp: number; map: string; pos_x: number; pos_y: number }) {
    Object.assign(this.char(charId), s);
    this.persist();
  }

  /** set_save_point() in SQL (minus the current-map check: this copy's `map` isn't kept up to date while playing). */
  async setSavePoint(charId: string, map: string, x: number, y: number) {
    const c = this.char(charId);
    Object.assign(c, { save_map: map, save_x: Math.min(Math.max(x, 0), 200), save_y: Math.min(Math.max(y, 0), 200) });
    this.persist();
    return this.getCharacter(charId);
  }

  async onDeath(charId: string) {
    const c = this.char(charId);
    c.exp = Math.max(0, c.exp - Math.floor(expToNext(c.level) * 0.05));
    c.map = c.save_map ?? TOWN_SPAWN.map;
    c.pos_x = c.save_map ? c.save_x ?? TOWN_SPAWN.x : TOWN_SPAWN.x;
    c.pos_y = c.save_map ? c.save_y ?? TOWN_SPAWN.y : TOWN_SPAWN.y;
    this.persist();
    return this.getCharacter(charId);
  }

  /** Atomic swap, same checks as trade_execute() in SQL. */
  async trade(charA: string, offerA: TradeOffer, charB: string, offerB: TradeOffer) {
    const a = this.char(charA);
    const b = this.char(charB);
    if (charA === charB) throw new Error('แลกกับตัวเองไม่ได้');
    if (offerA.zeny < 0 || offerB.zeny < 0 || a.zeny < offerA.zeny || b.zeny < offerB.zeny) throw new Error('เงินไม่พอ');
    const check = (charId: string, offer: TradeOffer) => {
      for (const o of offer.items) {
        const row = this.inv(charId).find((i) => i.id === o.inv);
        if (!row || row.equipped || o.qty < 1 || o.qty > row.qty) throw new Error('ไอเท็มที่แลกไม่ถูกต้อง');
      }
    };
    check(charA, offerA);
    check(charB, offerB);
    const move = (from: string, to: string, offer: TradeOffer) => {
      for (const o of offer.items) {
        const inv = this.inv(from);
        const row = inv.find((i) => i.id === o.inv)!;
        if (isEquipment(row.item_id)) {
          inv.splice(inv.indexOf(row), 1);
          this.inv(to).push({ ...row, equipped: false });
        } else {
          row.qty -= o.qty;
          if (row.qty === 0) inv.splice(inv.indexOf(row), 1);
          this.addItem(to, row.item_id, o.qty);
        }
      }
    };
    move(charA, charB, offerA);
    move(charB, charA, offerB);
    a.zeny += offerB.zeny - offerA.zeny;
    b.zeny += offerA.zeny - offerB.zeny;
    this.persist();
  }

  async signOut() {}

  /** Replace a character with the copy the dev game server sends back. */
  importCharacter(c: Character, inv: InvItem[]) {
    const i = this.data.characters.findIndex((x) => x.id === c.id);
    if (i >= 0) this.data.characters[i] = { ...c };
    else this.data.characters.push({ ...c });
    this.data.inventory[c.id] = inv.map((x) => ({ ...x }));
    this.persist();
  }
}
