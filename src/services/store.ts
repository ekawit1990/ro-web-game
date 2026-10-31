import type { Appearance, Character, ClassKey, InvItem, StatKey, StorageItem } from '../data';

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
  /** New characters always start as a Teen. */
  createCharacter(name: string, look: Appearance): Promise<Character>;
  deleteCharacter(id: string): Promise<void>;
  getCharacter(id: string): Promise<Character>;
  loadInventory(charId: string): Promise<InvItem[]>;
  allocateStat(charId: string, stat: StatKey): Promise<Character>;
  learnSkill(charId: string, skill: string): Promise<Character>;
  /** Takes the job-change quest (Teen, Base Lv 10+). */
  startJobQuest(charId: string): Promise<Character>;
  /** Teen -> class 2 once the quest is done; swaps the weapon. */
  changeJob(charId: string, cls: ClassKey): Promise<Character>;
  buyItem(charId: string, itemId: string, qty: number): Promise<Character>;
  sellItem(charId: string, invId: string, qty: number): Promise<Character>;
  setEquipped(charId: string, invId: string, equipped: boolean): Promise<void>;
  /** บูรพา's storage, shared by every character of this account. */
  loadStorage(): Promise<StorageItem[]>;
  /** Bag -> storage (not equipped items). */
  storagePut(charId: string, invId: string, qty: number): Promise<void>;
  /** Storage -> this character's bag. */
  storageTake(charId: string, rowId: string, qty: number): Promise<void>;
  signOut(): Promise<void>;
}
