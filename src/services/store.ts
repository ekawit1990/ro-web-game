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

/** One character's part of a kill: what the game server hands out when a party shares a monster. */
export interface RewardShare {
  exp: number;
  jobExp: number;
  zeny: number;
  items: string[];
  /** counts as a job-change quest kill */
  quest: boolean;
}

/** What the refiner did: ok = the + went up; otherwise the item broke and is gone. */
export interface RefineResult {
  ok: boolean;
  refine: number;
  character: Character;
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
  /** Puts a card from the bag into a free card slot of a piece of equipment (for good). */
  insertCard(charId: string, cardInv: string, equipInv: string): Promise<void>;
  /** One try at the refiner: costs a material and zeny; past the safe level a failure destroys the item. */
  refineItem(charId: string, invId: string): Promise<RefineResult>;
  signOut(): Promise<void>;
}
