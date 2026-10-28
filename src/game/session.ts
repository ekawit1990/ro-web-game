import { Character, Derived, ITEMS, InvItem, StatKey, derive } from '../data';
import type { LocalStore } from '../services/localStore';
import type { GameStore } from '../services/store';

type Listener = () => void;

/** Connection to the game server for the current map. */
export interface ServerLink {
  send(type: string, msg?: unknown): void;
  /** Set when the game server runs without Supabase: it needs our copy after menu changes. */
  devStore?: LocalStore;
}

/**
 * The playing character. Progress (level, stats, items) comes from the store and the server's
 * 'sync' messages; live HP/SP comes from the server's room state.
 */
export class Session {
  derived: Derived;
  hp: number;
  sp: number;
  /** Active buffs: skill id -> end time (ms, performance.now()). */
  buffs = new Map<string, number>();
  link?: ServerLink;
  private listeners: Listener[] = [];

  constructor(public store: GameStore, public char: Character, public inv: InvItem[]) {
    this.derived = derive(char, inv);
    this.hp = char.hp > 0 ? Math.min(char.hp, this.derived.maxHp) : this.derived.maxHp;
    this.sp = char.sp >= 0 ? Math.min(char.sp, this.derived.maxSp) : this.derived.maxSp;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  emit() {
    this.listeners.forEach((fn) => fn());
  }

  private recompute() {
    this.derived = derive(this.char, this.inv);
  }

  /** HP/SP changed on the server. */
  setVitals(hp: number, sp: number) {
    if (hp === this.hp && sp === this.sp) return;
    this.hp = hp;
    this.sp = sp;
    this.emit();
  }

  /** The server's numbers include buffs, so they win over our own derive(). */
  applyDerived(d: Derived) {
    this.derived = d;
    this.emit();
  }

  /** The game server sent the latest character (after a kill, potion, trade or death). */
  applySync(c: Character, inv: InvItem[]) {
    this.char = { ...c };
    this.inv = inv;
    this.link?.devStore?.importCharacter(c, inv);
    this.emit();
  }

  /** Tell the game server that stats/skills/equipment/inventory changed through the menus. */
  private notifyServer() {
    if (!this.link) return;
    this.link.send('refresh', this.link.devStore ? { charId: this.char.id, dev: { char: this.char, inv: this.inv } } : {});
  }

  private async after(c: Character, reloadInv: boolean) {
    this.char = { ...c, hp: this.char.hp, sp: this.char.sp, map: this.char.map, pos_x: this.char.pos_x, pos_y: this.char.pos_y };
    if (reloadInv) this.inv = await this.store.loadInventory(this.char.id);
    this.recompute();
    this.emit();
    this.notifyServer();
  }

  async allocate(stat: StatKey) {
    await this.after(await this.store.allocateStat(this.char.id, stat), false);
  }

  async learn(skill: string) {
    await this.after(await this.store.learnSkill(this.char.id, skill), false);
  }

  async buy(itemId: string, qty: number) {
    await this.after(await this.store.buyItem(this.char.id, itemId, qty), true);
  }

  async sell(invId: string, qty: number) {
    await this.after(await this.store.sellItem(this.char.id, invId, qty), true);
  }

  async setEquipped(invId: string, equipped: boolean) {
    await this.store.setEquipped(this.char.id, invId, equipped);
    await this.after(this.char, true);
  }

  /** The server applies the heal and answers with 'sync'. */
  use(invId: string) {
    this.link?.send('useItem', { invId });
  }

  /** First inventory row holding this item (for hotkeys, which remember item ids). */
  findItem(itemId: string): InvItem | undefined {
    return this.inv.find((i) => i.item_id === itemId);
  }

  countItem(itemId: string): number {
    return this.inv.filter((i) => i.item_id === itemId).reduce((s, i) => s + i.qty, 0);
  }

  equippedOf(type: string): InvItem | undefined {
    return this.inv.find((i) => i.equipped && ITEMS[i.item_id]?.type === type);
  }
}
