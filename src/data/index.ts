import raw from './gamedata.json';

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk';
export const STAT_KEYS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
export type Stats = Record<StatKey, number>;

export type ClassKey = 'singer' | 'guitarist' | 'drummer' | 'bassist' | 'keyboardist';
export const CLASS_KEYS: ClassKey[] = ['singer', 'guitarist', 'drummer', 'bassist', 'keyboardist'];

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

export type ItemType = 'consumable' | 'loot' | 'weapon' | 'armor' | 'head' | 'accessory';
export const EQUIP_TYPES: ItemType[] = ['weapon', 'armor', 'head', 'accessory'];

export interface ItemDef {
  name: string;
  type: ItemType;
  price: number;
  weight: number;
  color: string;
  heal?: number;
  sp?: number;
  atk?: number;
  matk?: number;
  def?: number;
  aspd?: number;
  classes?: ClassKey[];
}

export interface MonsterDef {
  name: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  exp: number;
  jobExp: number;
  zeny: [number, number];
  speed: number;
  aggressive: boolean;
  color: string;
  size: number;
  boss?: boolean;
  /** Which body to draw (another monster's id); defaults to the monster's own id. */
  shape?: string;
  /** Rigged model in public/models/monsters/ that replaces the drawn body once loaded. */
  model?: string;
  drops: [string, number][];
}

export interface SpawnDef {
  map: string;
  monster: string;
  count: number;
  area: [number, number, number, number];
  respawnSec?: number;
}

export type SkillType = 'single' | 'aoe' | 'aoe_self' | 'heal' | 'heal_target' | 'buff' | 'passive';

export interface SkillDef {
  cls: ClassKey;
  name: string;
  icon: string;
  desc: string;
  type: SkillType;
  magic?: boolean;
  maxLevel: number;
  sp?: [number, number];
  range?: number;
  radius?: number;
  cooldown?: number;
  power?: [number, number];
  hits?: number;
  heal?: [number, number];
  provoke?: boolean;
  buff?: { aspdPct?: number; def?: number; durationSec: number };
  passive?: { maxHpPct?: number; maxSpPct?: number; atkPct?: number; matkPct?: number; hit?: number };
}

export const CLASSES = raw.classes as Record<ClassKey, ClassDef>;
export const ITEMS = raw.items as Record<string, ItemDef>;
export const MONSTERS = raw.monsters as unknown as Record<string, MonsterDef>;
export const SPAWNS = raw.spawns as SpawnDef[];
export const SHOP = raw.shop as string[];
export const WEAPON_SHOP = raw.weaponShop as string[];
export const SKILLS = raw.skills as unknown as Record<string, SkillDef>;
export const MAX_LEVEL = raw.levels.maxLevel;
export const MAX_JOB_LEVEL = raw.levels.maxJobLevel;

export const skillsOf = (cls: ClassKey) => Object.entries(SKILLS).filter(([, s]) => s.cls === cls);
export const skillSp = (s: SkillDef, lv: number) => (s.sp ? s.sp[0] + s.sp[1] * (lv - 1) : 0);
export const skillPower = (s: SkillDef, lv: number) => (s.power ? s.power[0] + s.power[1] * (lv - 1) : 0);
export const skillHeal = (s: SkillDef, lv: number) => (s.heal ? s.heal[0] + s.heal[1] * (lv - 1) : 0);

/** EXP needed to go from `level` to `level + 1`. Must match exp_to_next() in SQL. */
export function expToNext(level: number): number {
  return Math.floor(15 * Math.pow(level, 1.9)) + 10;
}

/** Job EXP needed for the next job level. Must match job_exp_to_next() in SQL. */
export function jobExpToNext(level: number): number {
  return Math.floor(12 * Math.pow(level, 1.8)) + 8;
}

/** Status points needed to raise a stat from `current` (RO formula). Must match stat_cost() in SQL. */
export function statCost(current: number): number {
  return Math.floor((current - 1) / 10) + 2;
}

/** Status points gained when reaching `level` (RO formula). */
export function statPointsAt(level: number): number {
  return Math.floor(level / 5) + 3;
}

export type Gender = 'm' | 'f';
export const HAIR_STYLES = 6;
export const HAIR_COLORS = ['#3b2410', '#1f1f1f', '#d9a13b', '#c0392b', '#ec5fa8', '#5b8def', '#2fb3a8', '#e8e8e8'];
export const FACES = 4;

export interface Appearance {
  gender: Gender;
  hair: number;
  hair_color: number;
  face: number;
}

export interface Character extends Stats, Appearance {
  id: string;
  name: string;
  cls: ClassKey;
  level: number;
  exp: number;
  job_level: number;
  job_exp: number;
  zeny: number;
  stat_points: number;
  skill_points: number;
  skills: Record<string, number>;
  hp: number;
  sp: number;
  map: string;
  pos_x: number;
  pos_y: number;
}

export interface InvItem {
  id: string;
  item_id: string;
  qty: number;
  equipped: boolean;
}

export interface Buffs {
  aspdPct?: number;
  def?: number;
}

export interface Derived {
  maxHp: number;
  maxSp: number;
  atk: number;
  matk: number;
  def: number;
  mdef: number;
  hit: number;
  flee: number;
  crit: number;
  aspd: number;
  attackDelay: number;
  moveSpeed: number;
  weight: number;
  maxWeight: number;
}

export function derive(c: Character, inv: InvItem[], buffs: Buffs = {}): Derived {
  const cls = CLASSES[c.cls];
  const equipped = inv.filter((i) => i.equipped).map((i) => ITEMS[i.item_id]).filter(Boolean);
  const sum = (k: 'atk' | 'matk' | 'def' | 'aspd') => equipped.reduce((s, i) => s + (i[k] ?? 0), 0);

  const p = { maxHpPct: 0, maxSpPct: 0, atkPct: 0, matkPct: 0, hit: 0 };
  for (const [id, lv] of Object.entries(c.skills ?? {})) {
    const pass = SKILLS[id]?.passive;
    if (!pass || !lv) continue;
    for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] += (pass[k] ?? 0) * lv;
  }

  const mainStat = cls.attackType === 'ranged' ? c.dex : c.str;
  const atk = sum('atk') + mainStat * 2 + Math.floor(c.level / 2) + Math.floor(c.luk / 3);
  const matk = sum('matk') + c.int * 3 + Math.floor(c.level / 2);
  const aspdPct = sum('aspd') + (buffs.aspdPct ?? 0);
  const attackDelay = Math.max(300, Math.round((1300 - c.agi * 18 - c.dex * 3) * (1 - aspdPct / 100)));
  return {
    maxHp: Math.floor((40 + c.vit * 8 + c.level * 12) * cls.hpMod * (1 + p.maxHpPct / 100)),
    maxSp: Math.floor((10 + c.int * 4 + c.level * 2) * cls.spMod * (1 + p.maxSpPct / 100)),
    atk: Math.floor(atk * (1 + p.atkPct / 100)),
    matk: Math.floor(matk * (1 + p.matkPct / 100)),
    def: sum('def') + Math.floor(c.vit / 2) + (buffs.def ?? 0),
    mdef: Math.floor(c.int / 2) + Math.floor(c.vit / 5),
    hit: c.level + c.dex + p.hit,
    flee: c.level + c.agi,
    crit: Math.floor(1 + c.luk * 0.3 + c.dex * 0.1),
    aspd: Math.min(190, Math.floor(200 - attackDelay / 20)),
    attackDelay,
    moveSpeed: 150 + Math.min(60, c.agi * 2),
    weight: inv.reduce((s, i) => s + (ITEMS[i.item_id]?.weight ?? 0) * i.qty, 0),
    maxWeight: 2000 + c.str * 30,
  };
}

/** Chance (0..1) that an attack with `hit` lands on a target of `level`/`flee`. */
export function hitChance(hit: number, flee: number): number {
  return Math.max(0.3, Math.min(0.98, 0.9 + (hit - flee) / 100));
}
export const monsterFlee = (m: MonsterDef) => m.level * 2 + 8;
export const monsterHit = (m: MonsterDef) => m.level * 2 + 25;

export const MAGIC_SP_COST = 3;
