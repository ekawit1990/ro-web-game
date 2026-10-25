import type { Character, ClassKey, InvItem, StatKey } from '../data';

export interface KillResult {
  character: Character;
  drops: string[];
  zeny: number;
  exp: number;
  leveledUp: boolean;
}

/** Everything that changes progress goes through here, so the online version can validate it server side. */
export interface GameStore {
  readonly online: boolean;
  userLabel(): Promise<string>;
  listCharacters(): Promise<Character[]>;
  createCharacter(name: string, cls: ClassKey): Promise<Character>;
  deleteCharacter(id: string): Promise<void>;
  getCharacter(id: string): Promise<Character>;
  loadInventory(charId: string): Promise<InvItem[]>;
  reportKill(charId: string, monster: string): Promise<KillResult>;
  allocateStat(charId: string, stat: StatKey): Promise<Character>;
  buyItem(charId: string, itemId: string, qty: number): Promise<Character>;
  sellItem(charId: string, invId: string, qty: number): Promise<Character>;
  /** Consumes one item; the caller applies the heal. */
  useItem(charId: string, invId: string): Promise<string>;
  setEquipped(charId: string, invId: string, equipped: boolean): Promise<void>;
  saveState(charId: string, s: { hp: number; sp: number; pos_x: number; pos_y: number }): Promise<void>;
  onDeath(charId: string): Promise<Character>;
  signOut(): Promise<void>;
}
