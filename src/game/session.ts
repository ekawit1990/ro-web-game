import { Character, Derived, ITEMS, InvItem, StatKey, derive } from '../data';
import type { LocalStore } from '../services/localStore';
import type { GameStore, KillResult } from '../services/store';

type Listener = () => void;

/** Online play: combat actions go to the game server instead of the store. */
export interface ServerLink {
  send(type: string, msg?: unknown): void;
  /** Set when the game server runs without Supabase: it needs our copy after menu changes. */
  devStore?: LocalStore;
}

/** The playing character: progress from the store plus live HP/SP. */
export class Session {
  derived: Derived;
  hp: number;
  sp: number;
  private listeners: Listener[] = [];
  link?: ServerLink;

  constructor(public store: GameStore, public char: Character, public inv: InvItem[]) {
    this.derived = derive(char, inv);
    this.hp = char.hp > 0 ? Math.min(char.hp, this.derived.maxHp) : this.derived.maxHp;
    this.sp = char.sp >= 0 ? Math.min(char.sp, this.derived.maxSp) : this.derived.maxSp;
  }

  onChange(fn: Listener) {
    this.listeners.push(fn);
  }

  emit() {
    this.derived = derive(this.char, this.inv);
    this.hp = Math.min(this.hp, this.derived.maxHp);
    this.sp = Math.min(this.sp, this.derived.maxSp);
    this.listeners.forEach((fn) => fn());
  }

  private setChar(c: Character) {
    this.char = { ...c, hp: this.char.hp, sp: this.char.sp, pos_x: this.char.pos_x, pos_y: this.char.pos_y };
  }

  private async reloadInv() {
    this.inv = await this.store.loadInventory(this.char.id);
  }

  /** Tell the game server that stats/equipment/inventory changed through the menus. */
  private notifyServer() {
    if (!this.link) return;
    this.link.send('refresh', this.link.devStore ? { charId: this.char.id, dev: { char: this.char, inv: this.inv } } : {});
  }

  /** The game server sent the latest character (after a kill, potion or death). */
  applySync(c: Character, inv: InvItem[]) {
    this.char = { ...c };
    this.inv = inv;
    this.link?.devStore?.importCharacter(c, inv);
    this.emit();
  }

  async kill(monster: string): Promise<KillResult> {
    const r = await this.store.reportKill(this.char.id, monster);
    this.setChar(r.character);
    if (r.drops.length) await this.reloadInv();
    this.emit();
    if (r.leveledUp) {
      // a level up fully restores, like in RO
      this.hp = this.derived.maxHp;
      this.sp = this.derived.maxSp;
      this.emit();
    }
    return r;
  }

  async allocate(stat: StatKey) {
    this.setChar(await this.store.allocateStat(this.char.id, stat));
    this.emit();
    this.notifyServer();
  }

  async buy(itemId: string, qty: number) {
    this.setChar(await this.store.buyItem(this.char.id, itemId, qty));
    await this.reloadInv();
    this.emit();
    this.notifyServer();
  }

  async sell(invId: string, qty: number) {
    this.setChar(await this.store.sellItem(this.char.id, invId, qty));
    await this.reloadInv();
    this.emit();
    this.notifyServer();
  }

  /** Online the server applies the heal and answers with 'used'; returns null then. */
  async use(invId: string) {
    if (this.link) {
      this.link.send('useItem', { invId });
      return null;
    }
    const itemId = await this.store.useItem(this.char.id, invId);
    const item = ITEMS[itemId];
    this.hp = Math.min(this.derived.maxHp, this.hp + (item.heal ?? 0));
    this.sp = Math.min(this.derived.maxSp, this.sp + (item.sp ?? 0));
    await this.reloadInv();
    this.emit();
    return item;
  }

  async setEquipped(invId: string, equipped: boolean) {
    await this.store.setEquipped(this.char.id, invId, equipped);
    await this.reloadInv();
    this.emit();
    this.notifyServer();
  }

  /** Best healing potion for the quick-use button. */
  quickPotion(): InvItem | undefined {
    return this.inv
      .filter((i) => ITEMS[i.item_id].type === 'consumable' && ITEMS[i.item_id].heal)
      .sort((a, b) => (ITEMS[a.item_id].heal ?? 0) - (ITEMS[b.item_id].heal ?? 0))[0];
  }

  potionCount(): number {
    return this.inv
      .filter((i) => ITEMS[i.item_id].type === 'consumable' && ITEMS[i.item_id].heal)
      .reduce((s, i) => s + i.qty, 0);
  }

  async die() {
    if (this.link) {
      this.link.send('respawn');
      return;
    }
    this.setChar(await this.store.onDeath(this.char.id));
    this.hp = Math.ceil(this.derived.maxHp / 2);
    this.sp = Math.ceil(this.derived.maxSp / 2);
    this.emit();
  }

  async save(x: number, y: number) {
    if (this.link) return; // the server saves online
    this.char.pos_x = x;
    this.char.pos_y = y;
    await this.store.saveState(this.char.id, { hp: this.hp, sp: this.sp, pos_x: x, pos_y: y });
  }
}
