import type { Appearance, Character, ClassKey, InvItem, StatKey } from '../data';

export interface KillResult {
  character: Character;
  drops: string[];
  zeny: number;
  exp: number;
  jobExp: number;
  leveledUp: boolean;
  jobLeveledUp: boolean;
}

export interface TradeOffer {
  items: { inv: string; qty: number }[];
  zeny: number;
}

/** Menu actions the browser performs itself (Supabase RPCs, or browser storage in dev mode). */
export interface GameStore {
  readonly online: boolean;
  userLabel(): Promise<string>;
  listCharacters(): Promise<Character[]>;
  createCharacter(name: string, cls: ClassKey, look: Appearance): Promise<Character>;
  deleteCharacter(id: string): Promise<void>;
  getCharacter(id: string): Promise<Character>;
  loadInventory(charId: string): Promise<InvItem[]>;
  allocateStat(charId: string, stat: StatKey): Promise<Character>;
  learnSkill(charId: string, skill: string): Promise<Character>;
  buyItem(charId: string, itemId: string, qty: number): Promise<Character>;
  sellItem(charId: string, invId: string, qty: number): Promise<Character>;
  setEquipped(charId: string, invId: string, equipped: boolean): Promise<void>;
  signOut(): Promise<void>;
}
