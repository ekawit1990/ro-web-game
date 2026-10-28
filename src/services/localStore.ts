import {
  Appearance, CLASSES, Character, ClassKey, EQUIP_TYPES, ITEMS, InvItem, MAX_JOB_LEVEL, MAX_LEVEL, MONSTERS, SHOP,
  SKILLS, StatKey, WEAPON_SHOP, expToNext, jobExpToNext, statCost, statPointsAt,
} from '../data';
import type { GameStore, KillResult, TradeOffer } from './store';

const KEY = 'music-land-save-v2';
export const TOWN_SPAWN = { map: 'town', x: 22.5, y: 26.5 };

interface SaveFile {
  characters: Character[];
  inventory: Record<string, InvItem[]>;
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

  async createCharacter(name: string, cls: ClassKey, look: Appearance) {
    name = name.trim();
    if (name.length < 2 || name.length > 16) throw new Error('ชื่อต้องยาว 2-16 ตัวอักษร');
    if (this.data.characters.length >= 3) throw new Error('สร้างได้สูงสุด 3 ตัวละคร');
    if (this.data.characters.some((c) => c.name === name)) throw new Error('ชื่อนี้ถูกใช้แล้ว');
    const def = CLASSES[cls];
    const c: Character = {
      id: uid(), name, cls, level: 1, exp: 0, job_level: 1, job_exp: 0, zeny: 100, stat_points: 0, skill_points: 0,
      skills: {}, ...def.baseStats, ...look, hp: -1, sp: -1, map: TOWN_SPAWN.map, pos_x: TOWN_SPAWN.x, pos_y: TOWN_SPAWN.y,
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
    const c = this.char(charId);
    const m = MONSTERS[monster];
    if (!m) throw new Error('unknown monster');
    const zeny = randInt(m.zeny[0], m.zeny[1]);
    const drops = m.drops.filter(([, chance]) => Math.random() < chance).map(([id]) => id);
    drops.forEach((d) => this.addItem(charId, d, 1));
    c.zeny += zeny;
    const startLevel = c.level;
    const startJob = c.job_level;
    if (c.level < MAX_LEVEL) c.exp += m.exp;
    while (c.level < MAX_LEVEL && c.exp >= expToNext(c.level)) {
      c.exp -= expToNext(c.level);
      c.level++;
      c.stat_points += statPointsAt(c.level);
    }
    if (c.level >= MAX_LEVEL) c.exp = 0;
    if (c.job_level < MAX_JOB_LEVEL) c.job_exp += m.jobExp;
    while (c.job_level < MAX_JOB_LEVEL && c.job_exp >= jobExpToNext(c.job_level)) {
      c.job_exp -= jobExpToNext(c.job_level);
      c.job_level++;
      c.skill_points++;
    }
    if (c.job_level >= MAX_JOB_LEVEL) c.job_exp = 0;
    this.persist();
    return {
      character: await this.getCharacter(charId), drops, zeny, exp: m.exp, jobExp: m.jobExp,
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
    if (!s || s.cls !== c.cls) throw new Error('อาชีพนี้เรียนสกิลนี้ไม่ได้');
    const cur = c.skills[skill] ?? 0;
    if (cur >= s.maxLevel) throw new Error('สกิลเต็มแล้ว');
    if (c.skill_points < 1) throw new Error('แต้มสกิลไม่พอ');
    c.skills = { ...c.skills, [skill]: cur + 1 };
    c.skill_points--;
    this.persist();
    return this.getCharacter(charId);
  }

  async buyItem(charId: string, itemId: string, qty: number) {
    const c = this.char(charId);
    const item = ITEMS[itemId];
    const inShop = SHOP.includes(itemId) || WEAPON_SHOP.includes(itemId);
    if (!item || !inShop || qty < 1 || qty > 99) throw new Error('ซื้อไม่ได้');
    const cost = item.price * qty;
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
    c.zeny += Math.floor(ITEMS[row.item_id].price / 2) * qty;
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
    if (equipped && item.classes && !item.classes.includes(c.cls)) throw new Error('อาชีพนี้ใช้ไม่ได้');
    if (equipped) inv.forEach((i) => { if (i.equipped && ITEMS[i.item_id].type === item.type) i.equipped = false; });
    row.equipped = equipped;
    this.persist();
  }

  async saveState(charId: string, s: { hp: number; sp: number; map: string; pos_x: number; pos_y: number }) {
    Object.assign(this.char(charId), s);
    this.persist();
  }

  async onDeath(charId: string) {
    const c = this.char(charId);
    c.exp = Math.max(0, c.exp - Math.floor(expToNext(c.level) * 0.05));
    c.map = TOWN_SPAWN.map;
    c.pos_x = TOWN_SPAWN.x;
    c.pos_y = TOWN_SPAWN.y;
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
