import {
  CLASSES, Character, ClassKey, ITEMS, InvItem, MAX_LEVEL, MONSTERS, SHOP, STAT_POINTS_PER_LEVEL, StatKey, expToNext,
} from '../data';
import type { GameStore, KillResult } from './store';

const KEY = 'ro-web-game-save-v1';
export const TOWN_SPAWN = { x: 5.5, y: 5.5 };

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

const isEquipment = (itemId: string) => ['weapon', 'armor'].includes(ITEMS[itemId]?.type);

/**
 * Offline mode: same rules as the Supabase RPC functions, but saved in localStorage.
 * Lets the game be played and tested without any backend.
 */
export class LocalStore implements GameStore {
  readonly online = false;
  private data: SaveFile;

  constructor() {
    let parsed: SaveFile | null = null;
    try {
      parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    } catch {
      parsed = null;
    }
    this.data = parsed ?? { characters: [], inventory: {} };
  }

  private persist() {
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
    return 'ผู้เล่นออฟไลน์';
  }

  async listCharacters() {
    return this.data.characters.map((c) => ({ ...c }));
  }

  async createCharacter(name: string, cls: ClassKey) {
    name = name.trim();
    if (name.length < 2 || name.length > 16) throw new Error('ชื่อต้องยาว 2-16 ตัวอักษร');
    if (this.data.characters.length >= 3) throw new Error('สร้างได้สูงสุด 3 ตัวละคร');
    if (this.data.characters.some((c) => c.name === name)) throw new Error('ชื่อนี้ถูกใช้แล้ว');
    const def = CLASSES[cls];
    const c: Character = {
      id: uid(), name, cls, level: 1, exp: 0, zeny: 100, stat_points: 0,
      ...def.baseStats, hp: -1, sp: -1, pos_x: TOWN_SPAWN.x, pos_y: TOWN_SPAWN.y,
    };
    this.data.characters.push(c);
    this.addItem(c.id, def.startWeapon, 1);
    this.inv(c.id)[0].equipped = true;
    this.addItem(c.id, 'red_potion', 5);
    this.persist();
    return { ...c };
  }

  async deleteCharacter(id: string) {
    this.data.characters = this.data.characters.filter((c) => c.id !== id);
    delete this.data.inventory[id];
    this.persist();
  }

  async getCharacter(id: string) {
    return { ...this.char(id) };
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
    if (c.level < MAX_LEVEL) c.exp += m.exp;
    while (c.level < MAX_LEVEL && c.exp >= expToNext(c.level)) {
      c.exp -= expToNext(c.level);
      c.level++;
      c.stat_points += STAT_POINTS_PER_LEVEL;
    }
    if (c.level >= MAX_LEVEL) c.exp = 0;
    this.persist();
    return { character: { ...c }, drops, zeny, exp: m.exp, leveledUp: c.level > startLevel };
  }

  async allocateStat(charId: string, stat: StatKey) {
    const c = this.char(charId);
    if (c.stat_points < 1) throw new Error('แต้มสเตตัสไม่พอ');
    if (c[stat] >= 99) throw new Error('สเตตัสเต็มแล้ว');
    c[stat]++;
    c.stat_points--;
    this.persist();
    return { ...c };
  }

  async buyItem(charId: string, itemId: string, qty: number) {
    const c = this.char(charId);
    const item = ITEMS[itemId];
    if (!item || !SHOP.includes(itemId) || qty < 1 || qty > 99) throw new Error('ซื้อไม่ได้');
    const cost = item.price * qty;
    if (c.zeny < cost) throw new Error('เงินไม่พอ');
    c.zeny -= cost;
    this.addItem(charId, itemId, qty);
    this.persist();
    return { ...c };
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
    return { ...c };
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

  async saveState(charId: string, s: { hp: number; sp: number; pos_x: number; pos_y: number }) {
    Object.assign(this.char(charId), s);
    this.persist();
  }

  async onDeath(charId: string) {
    const c = this.char(charId);
    c.exp = Math.max(0, c.exp - Math.floor(expToNext(c.level) * 0.05));
    c.pos_x = TOWN_SPAWN.x;
    c.pos_y = TOWN_SPAWN.y;
    this.persist();
    return { ...c };
  }

  async signOut() {}
}
