import raw from './gamedata.json';

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'dex';
export const STAT_KEYS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex'];
export type Stats = Record<StatKey, number>;

export type ClassKey = 'singer' | 'guitarist' | 'drummer' | 'bassist' | 'keyboardist';

export interface ClassDef {
  name: string;
  desc: string;
  color: string;
  hpMod: number;
  spMod: number;
  range: number;
  attackType: 'melee' | 'ranged' | 'magic';
  projectile: 'note' | 'wave' | 'chord' | null;
  startWeapon: string;
  baseStats: Stats;
}

export interface ItemDef {
  name: string;
  type: 'consumable' | 'loot' | 'weapon' | 'armor';
  price: number;
  color: string;
  heal?: number;
  sp?: number;
  atk?: number;
  matk?: number;
  def?: number;
  classes?: ClassKey[];
}

export interface MonsterDef {
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  zeny: [number, number];
  speed: number;
  aggressive: boolean;
  color: string;
  size: number;
  boss?: boolean;
  drops: [string, number][];
}

export interface SpawnDef {
  monster: string;
  count: number;
  area: [number, number, number, number];
  respawnSec?: number;
}

export const CLASSES = raw.classes as Record<ClassKey, ClassDef>;
export const ITEMS = raw.items as Record<string, ItemDef>;
export const MONSTERS = raw.monsters as unknown as Record<string, MonsterDef>;
export const SPAWNS = raw.spawns as SpawnDef[];
export const SHOP = raw.shop as string[];
export const MAX_LEVEL = raw.levels.maxLevel;
export const STAT_POINTS_PER_LEVEL = raw.levels.statPointsPerLevel;

/** EXP needed to go from `level` to `level + 1`. Must match exp_to_next() in SQL. */
export function expToNext(level: number): number {
  return Math.floor(15 * Math.pow(level, 1.9)) + 10;
}

export interface Character extends Stats {
  id: string;
  name: string;
  cls: ClassKey;
  level: number;
  exp: number;
  zeny: number;
  stat_points: number;
  hp: number;
  sp: number;
  pos_x: number;
  pos_y: number;
}

export interface InvItem {
  id: string;
  item_id: string;
  qty: number;
  equipped: boolean;
}

export interface Derived {
  maxHp: number;
  maxSp: number;
  atk: number;
  matk: number;
  def: number;
  attackDelay: number;
  moveSpeed: number;
}

export function derive(c: Character, inv: InvItem[]): Derived {
  const cls = CLASSES[c.cls];
  const equipped = inv.filter((i) => i.equipped).map((i) => ITEMS[i.item_id]).filter(Boolean);
  const weapon = equipped.find((i) => i.type === 'weapon');
  const armorDef = equipped.filter((i) => i.type === 'armor').reduce((s, i) => s + (i.def ?? 0), 0);
  const mainStat = cls.attackType === 'ranged' ? c.dex : c.str;
  return {
    maxHp: Math.floor((40 + c.vit * 8 + c.level * 12) * cls.hpMod),
    maxSp: Math.floor((10 + c.int * 4 + c.level * 2) * cls.spMod),
    atk: (weapon?.atk ?? 0) + mainStat * 2 + Math.floor(c.level / 2),
    matk: (weapon?.matk ?? 0) + c.int * 3 + Math.floor(c.level / 2),
    def: armorDef + Math.floor(c.vit / 2),
    attackDelay: Math.max(350, 1300 - c.agi * 18),
    moveSpeed: 150 + Math.min(60, c.agi * 2),
  };
}

export const MAGIC_SP_COST = 3;
