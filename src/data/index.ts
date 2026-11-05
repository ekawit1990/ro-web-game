import raw from './gamedata.json';

export type StatKey = 'str' | 'agi' | 'vit' | 'int' | 'dex' | 'luk';
export const STAT_KEYS: StatKey[] = ['str', 'agi', 'vit', 'int', 'dex', 'luk'];
export type Stats = Record<StatKey, number>;

export type ClassKey = 'teen' | 'singer' | 'guitarist' | 'drummer' | 'bassist' | 'keyboardist';
/** Every new character starts as a Teen (class 1). */
export const START_CLASS: ClassKey = 'teen';
/** Class 2 jobs a Teen can change into at the job-change NPC. */
export const CLASS_KEYS: ClassKey[] = ['singer', 'guitarist', 'drummer', 'bassist', 'keyboardist'];

/** Job change: Base Lv needed, then this many kills of monsters at or above this level. Must match change_job() in SQL. */
export const JOB_CHANGE = { level: 10, monsterLevel: 10, kills: 30 };
/**
 * Which town's job-change NPC hands out each class 2 (map id). Drummers change in the desert town,
 * everyone else in Melodia. Must match change_job() in SQL.
 */
export const JOB_TOWN: Partial<Record<ClassKey, string>> = { drummer: 'desert' };
export const jobTown = (cls: ClassKey) => JOB_TOWN[cls] ?? 'town';

/** บูรพา's account-wide storage: most rows (one per stack, one per piece of equipment). Must match storage_put() in SQL. */
export const STORAGE_SLOTS = 300;

/** A row in the account-wide storage, shared by every character of the same ID. */
export interface StorageItem {
  id: string;
  item_id: string;
  qty: number;
  refine?: number;
  cards?: string[];
}

export interface ClassDef {
  name: string;
  desc: string;
  color: string;
  hpMod: number;
  spMod: number;
  range: number;
  attackType: 'melee' | 'ranged' | 'magic';
  projectile: 'note' | 'wave' | 'chord' | 'mic' | null;
  /** Colour of the class's skill effects (drummer purple, bassist green, guitarist red, singer yellow). */
  fxColor?: string;
  /** Attacks this much % faster than the stats alone give (the drummer's quick two-stick hits). */
  aspdPct?: number;
  startWeapon: string;
  baseStats: Stats;
}

export type ItemType = 'consumable' | 'loot' | 'card' | 'weapon' | 'armor' | 'head' | 'accessory' | 'shoes' | 'earring';
/** One of each can be worn. Must match the type lists in SQL (item_defs check, _add_item, set_equipped, storage, trade). */
export const EQUIP_TYPES: ItemType[] = ['weapon', 'armor', 'head', 'accessory', 'shoes', 'earring'];

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
  flee?: number;
  crit?: number;
  classes?: ClassKey[];
  /** Shown in the item window. */
  desc?: string;
  /** Card slots on a piece of equipment (RO's [1], [2]). */
  slots?: number;
  /** Monster cards: which equipment they go into and what they give. */
  card?: { slot: CardSlot; bonus: CardBonus };
  /** Outfits (armor): the VRoid model (public/models/<vrm>) the character turns into while wearing it. */
  vrm?: string;
  /** Hats from a VRoid model: the hair part (material name) taken off `vrm` and put on the wearer's head. */
  part?: string;
  /** Only this gender can wear it (outfits: the model's body). Must match set_equipped() in SQL. */
  gender?: Gender;
  /** Stats the item itself gives while worn (outfits), added like a card's. */
  bonus?: CardBonus;
}

/** Where a card can go. 'head' cards fit hats and headphones alike. */
export type CardSlot = 'weapon' | 'armor' | 'head' | 'shoes' | 'accessory';
/** What a card adds: flat stats and numbers, or percentages (…Pct, aspd). */
export type CardBonus = Partial<Record<StatKey | 'atk' | 'matk' | 'def' | 'mdef' | 'hit' | 'flee' | 'crit' | 'aspd'
  | 'maxHp' | 'maxSp' | 'maxHpPct' | 'maxSpPct' | 'atkPct' | 'matkPct', number>>;

export const cardFits = (card: ItemDef | undefined, equip: ItemDef | undefined) =>
  !!card?.card && !!equip && (card.card.slot === equip.type || (card.card.slot === 'head' && equip.type === 'earring'));

/** Zeny the reset NPC and the card remover charge. Must match reset_stats / reset_skills / remove_cards in SQL. */
export const SERVICE_FEE = { resetStats: 10000, resetSkills: 10000, removeCards: 10000 };

/**
 * Refining at the refiner NPC (RO-style). Each try costs 1 material and `fee * next level` zeny.
 * Up to the safe level it always works; past it, a failure destroys the item (and its cards).
 * Must match refine_item() in SQL.
 */
export const REFINE = {
  max: 10,
  /** success % for reaching +1 … +10 */
  chance: {
    weapon: [100, 100, 100, 100, 100, 70, 55, 40, 25, 15],
    other: [100, 100, 100, 100, 70, 55, 40, 30, 20, 10],
  },
  fee: 100,
  material: { weapon: 'tuning_ore', other: 'velvet_patch' },
  /** per + : weapons Atk (and Matk if the weapon has Matk), the rest Def */
  weaponAtk: 3,
  armorDef: 1,
} as const;
/** Accessories can't be refined, like in RO. */
export const canRefine = (it: ItemDef | undefined) => !!it && ['weapon', 'armor', 'head', 'shoes', 'earring'].includes(it.type);
const refineKind = (it: ItemDef) => (it.type === 'weapon' ? 'weapon' : 'other');
export const refineChance = (it: ItemDef, toLevel: number) => REFINE.chance[refineKind(it)][toLevel - 1] ?? 0;
export const refineSafe = (it: ItemDef) => REFINE.chance[refineKind(it)].filter((c) => c === 100).length;
export const refineMaterial = (it: ItemDef) => REFINE.material[refineKind(it)];
export const refineFee = (toLevel: number) => REFINE.fee * toLevel;
/** Atk/Matk/Def an item gets from its + level. */
export function refineBonus(it: ItemDef, refine: number) {
  if (!refine) return { atk: 0, matk: 0, def: 0 };
  if (it.type === 'weapon') return { atk: REFINE.weaponAtk * refine, matk: it.matk ? REFINE.weaponAtk * refine : 0, def: 0 };
  return { atk: 0, matk: 0, def: REFINE.armorDef * refine };
}
/** "+7 กีตาร์ไฟฟ้า [2]" */
export function itemLabel(itemId: string, row?: { refine?: number }): string {
  const it = ITEMS[itemId];
  if (!it) return itemId;
  const plus = row?.refine ? `+${row.refine} ` : '';
  return `${plus}${it.name}${it.slots ? ` [${it.slots}]` : ''}`;
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

/** heal_target and buff_target pick yourself or one other player; buff_party buffs you and your party on the map. */
export type SkillType = 'single' | 'aoe' | 'aoe_self' | 'line' | 'heal' | 'heal_target' | 'buff' | 'buff_target' | 'buff_party' | 'passive';
export const targetsPlayer = (s: SkillDef) => s.type === 'heal_target' || s.type === 'buff_target';
/** Skills aimed at a monster (a 'line' skill only uses it for the direction). */
export const targetsMonster = (s: SkillDef) => s.type === 'single' || s.type === 'aoe' || s.type === 'line';

/** What a skill's damage grows with besides ATK: a stat, or HIT. */
export type ScaleStat = StatKey | 'hit';

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
  /**
   * aspdPct/def are per skill level. stats and blocks are [at Lv 1, extra per level]:
   * stats raise STR/AGI/... while the buff lasts; blocks = physical hits the buff stops before it breaks.
   */
  buff?: {
    aspdPct?: number; def?: number; stats?: Partial<Record<StatKey, [number, number]>>; blocks?: [number, number]; durationSec: number;
    /** per level: % HIT, % Flee, % of damage reflected at the monster, % faster HP regen, % of party members' damage taken over */
    hitPct?: number; fleePct?: number; reflectPct?: number; regenPct?: number; guardPct?: number;
    /** invisible to players and to monsters that aren't bosses, until you attack */
    stealth?: boolean;
  };
  /** per skill level */
  passive?: {
    maxHpPct?: number; maxSpPct?: number; atkPct?: number; matkPct?: number; hit?: number;
    stats?: Partial<Record<StatKey, number>>; flee?: number; def?: number; mdef?: number; regenPct?: number;
  };
  /** Damage also grows with these: x (1 + stat / 50) each (HIT: / 100). */
  stats?: ScaleStat[];
  /** Tiles the monster is knocked back. */
  knockback?: number;
  /** Damage x mult while you have this buff on (e.g. จังหวะส่ง from hiding). */
  bonusIf?: { buff: string; mult: number };
  /** 'line': a wave that travels `length` tiles towards the target, `width` wide, at `speed` tiles/second. */
  length?: number;
  width?: number;
  speed?: number;
  /** drawn as an X (คลื่นเสียงทำลาย) instead of a beam */
  shape?: 'x';
  /** Cast time: standing still this long before it goes off (moving cancels). */
  castMs?: number;
  /** Palm muting: pulls monsters in the radius next to you and lowers their Def by defDownPct for debuffSec [Lv 1, per level] seconds. */
  pull?: boolean;
  defDownPct?: number;
  debuffSec?: [number, number];
  /**
   * Damage that grows with the situation (power is then % ATK per unit):
   * 'distance' = dash up to the target, x tiles dashed (min 1); 'crowd' = x monsters around you (max CROWD_MAX).
   */
  scale?: 'distance' | 'crowd';
  /** Baked pixelfx sheet (public/fx/<fx>.png) played when the skill lands. */
  fx?: string;
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

/** The outfit a character is wearing, from the equipped armor: its item id when it is a VRoid outfit, else ''. */
export const outfitOf = (armorId: string | undefined) => (armorId && ITEMS[armorId]?.vrm && ITEMS[armorId].type === 'armor' ? armorId : '');
/** A hat taken from a VRoid model (drawn by grafting it onto the character's model), or ''. */
export const vrmHatOf = (headId: string | undefined) => (headId && ITEMS[headId]?.part ? headId : '');
/** Can this character put the item on? (class and gender limits; set_equipped() in SQL checks the same) */
export function wearBlock(it: ItemDef | undefined, c: { cls: ClassKey; gender: Gender }): string {
  if (!it) return 'ไม่พบไอเท็ม';
  if (it.classes && !it.classes.includes(c.cls)) return 'อาชีพนี้ใช้ไม่ได้';
  if (it.gender && it.gender !== c.gender) return it.gender === 'f' ? 'ชุดนี้สำหรับตัวละครหญิง' : 'ชุดนี้สำหรับตัวละครชาย';
  return '';
}

/** หมุนตัวแทง counts at most this many monsters around you. */
export const CROWD_MAX = 8;

export const skillsOf = (cls: ClassKey) => Object.entries(SKILLS).filter(([, s]) => s.cls === cls);
/** Only your own class's skills: the job change refunds Teen skills (see change_job in SQL). */
export const canUseSkill = (s: SkillDef, cls: ClassKey) => s.cls === cls;
/** Skills that put a buff on someone (/auto keeps these up). */
export const isBuffSkill = (s: SkillDef) => !!s.buff && (s.type === 'buff' || s.type === 'buff_target' || s.type === 'buff_party') && !s.buff.stealth;
/**
 * The buffs ครูเพลงใจดี hands out at max level: every buff skill except hiding, taking a party's damage and
 * reflecting damage, which only make sense for the class that owns them.
 */
export const isHealerBuff = (s: SkillDef) => isBuffSkill(s) && !s.buff!.guardPct && !s.buff!.reflectPct;
/** SP a skill costs at level lv (whole SP, at least 1: Teen skills use fractional rates). */
export const skillSp = (s: SkillDef, lv: number) => (s.sp ? Math.max(1, Math.round(s.sp[0] + s.sp[1] * (lv - 1))) : 0);
export const skillPower = (s: SkillDef, lv: number) => (s.power ? s.power[0] + s.power[1] * (lv - 1) : 0);
export const skillHeal = (s: SkillDef, lv: number) => (s.heal ? s.heal[0] + s.heal[1] * (lv - 1) : 0);
const perLevel = (v: [number, number] | undefined, lv: number) => (v ? v[0] + v[1] * (lv - 1) : 0);
/** Stat bonuses a buff skill gives at `lv`. */
export function buffStats(s: SkillDef, lv: number): Partial<Stats> {
  const out: Partial<Stats> = {};
  for (const [k, v] of Object.entries(s.buff?.stats ?? {}) as [StatKey, [number, number]][]) out[k] = perLevel(v, lv);
  return out;
}
/** Physical hits a shield buff stops at `lv`. */
export const buffBlocks = (s: SkillDef, lv: number) => perLevel(s.buff?.blocks, lv);
/** Seconds a debuff (Palm muting's lower Def) lasts at `lv`. */
export const debuffSec = (s: SkillDef, lv: number) => perLevel(s.debuffSec, lv);
/**
 * How much a skill's damage grows with the stats it lists: x (1 + stat / 50) each, HIT x (1 + HIT / 100).
 * `stats` are the character's stats with buffs and cards (Derived.bonus added).
 */
export function skillStatMult(s: SkillDef, stats: Stats, hit: number): number {
  let k = 1;
  for (const st of s.stats ?? []) k *= st === 'hit' ? 1 + hit / 100 : 1 + stats[st] / 50;
  return k;
}
/** A character's stats with the bonuses from buffs, cards and passive skills. */
export function totalStats(c: Stats, d: Derived): Stats {
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = c[k] + (d.bonus?.[k] ?? 0);
  return out;
}

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

/** Status points a stat at `value` is worth when reset to 1 (the job change). Must match _stat_refund() in SQL. */
export function statRefund(value: number): number {
  let n = 0;
  for (let v = 1; v < value; v++) n += statCost(v);
  return n;
}

/** Status points gained when reaching `level` (RO formula). */
export function statPointsAt(level: number): number {
  return Math.floor(level / 5) + 3;
}

export type Gender = 'm' | 'f';
export const HAIR_STYLES = 6;
export const HAIR_COLORS = ['#3b2410', '#1f1f1f', '#d9a13b', '#c0392b', '#ec5fa8', '#5b8def', '#2fb3a8', '#e8e8e8'];
export const FACES = 4;
/** Monster kills counted towards the job-change quest (-1 = quest not taken). */
export const questCounts = (m: MonsterDef) => m.level >= JOB_CHANGE.monsterLevel;

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
  /** Job-change quest progress: -1 = not taken, else monsters killed so far. */
  job_quest: number;
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
  /** + level from the refiner (equipment only; missing = 0). */
  refine?: number;
  /** Card item ids inserted into this piece of equipment. */
  cards?: string[];
}

export interface Buffs {
  aspdPct?: number;
  def?: number;
  hitPct?: number;
  fleePct?: number;
  /** Extra STR/AGI/... from buffs (shown as +N in the status window). */
  stats?: Partial<Stats>;
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
  /** Stat bonuses from buffs, already counted in the numbers above. */
  bonus?: Partial<Stats>;
}

export function derive(base: Character, inv: InvItem[], buffs: Buffs = {}): Derived {
  const c = { ...base };
  const worn = inv.filter((i) => i.equipped && ITEMS[i.item_id]);
  // cards in worn equipment
  const card: Required<CardBonus> = {
    str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0, atk: 0, matk: 0, def: 0, mdef: 0, hit: 0, flee: 0, crit: 0, aspd: 0,
    maxHp: 0, maxSp: 0, maxHpPct: 0, maxSpPct: 0, atkPct: 0, matkPct: 0,
  };
  for (const row of worn) {
    for (const [k, v] of Object.entries(ITEMS[row.item_id].bonus ?? {}) as [keyof CardBonus, number][]) card[k] += v;
    for (const id of row.cards ?? []) {
      for (const [k, v] of Object.entries(ITEMS[id]?.card?.bonus ?? {}) as [keyof CardBonus, number][]) card[k] += v;
    }
  }
  // passive skills (per level)
  const p = { maxHpPct: 0, maxSpPct: 0, atkPct: 0, matkPct: 0, hit: 0, flee: 0, def: 0, mdef: 0 };
  const pStats: Partial<Stats> = {};
  for (const [id, lv] of Object.entries(c.skills ?? {})) {
    const pass = SKILLS[id]?.passive;
    if (!pass || !lv) continue;
    for (const k of Object.keys(p) as (keyof typeof p)[]) p[k] += (pass[k] ?? 0) * lv;
    for (const [k, v] of Object.entries(pass.stats ?? {}) as [StatKey, number][]) pStats[k] = (pStats[k] ?? 0) + v * lv;
  }
  const bonus: Partial<Stats> = {};
  for (const k of STAT_KEYS) {
    const extra = (buffs.stats?.[k] ?? 0) + card[k] + (pStats[k] ?? 0);
    c[k] += extra;
    if (extra) bonus[k] = extra;
  }
  const cls = CLASSES[c.cls];
  const sum = (k: 'atk' | 'matk' | 'def' | 'aspd' | 'flee' | 'crit') =>
    worn.reduce((s, row) => {
      const it = ITEMS[row.item_id];
      const r = k === 'atk' || k === 'matk' || k === 'def' ? refineBonus(it, row.refine ?? 0)[k] : 0;
      return s + (it[k] ?? 0) + r;
    }, 0);


  const mainStat = cls.attackType === 'ranged' ? c.dex : c.str;
  const atk = sum('atk') + card.atk + mainStat * 2 + Math.floor(c.level / 2) + Math.floor(c.luk / 3);
  const matk = sum('matk') + card.matk + c.int * 3 + Math.floor(c.level / 2);
  const aspdPct = sum('aspd') + card.aspd + (buffs.aspdPct ?? 0) + (cls.aspdPct ?? 0);
  const attackDelay = Math.max(300, Math.round((1300 - c.agi * 18 - c.dex * 3) * (1 - aspdPct / 100)));
  return {
    maxHp: Math.floor(((40 + c.vit * 8 + c.level * 12) * cls.hpMod + card.maxHp) * (1 + (p.maxHpPct + card.maxHpPct) / 100)),
    maxSp: Math.floor(((10 + c.int * 4 + c.level * 2) * cls.spMod + card.maxSp) * (1 + (p.maxSpPct + card.maxSpPct) / 100)),
    atk: Math.floor(atk * (1 + (p.atkPct + card.atkPct) / 100)),
    matk: Math.floor(matk * (1 + (p.matkPct + card.matkPct) / 100)),
    def: sum('def') + card.def + Math.floor(c.vit / 2) + (buffs.def ?? 0) + p.def,
    mdef: Math.floor(c.int / 2) + Math.floor(c.vit / 5) + card.mdef + p.mdef,
    hit: Math.floor((c.level + c.dex + p.hit + card.hit) * (1 + (buffs.hitPct ?? 0) / 100)),
    flee: Math.floor((c.level + c.agi + sum('flee') + card.flee + p.flee) * (1 + (buffs.fleePct ?? 0) / 100)),
    crit: Math.floor(1 + c.luk * 0.3 + c.dex * 0.1) + sum('crit') + card.crit,
    aspd: Math.min(190, Math.floor(200 - attackDelay / 20)),
    attackDelay,
    moveSpeed: 150 + Math.min(60, c.agi * 2),
    weight: inv.reduce((s, i) => s + (ITEMS[i.item_id]?.weight ?? 0) * i.qty, 0),
    maxWeight: 2000 + c.str * 30,
    bonus,
  };
}

/** Chance (0..1) that an attack with `hit` lands on a target of `level`/`flee`. */
export function hitChance(hit: number, flee: number): number {
  return Math.max(0.3, Math.min(0.98, 0.9 + (hit - flee) / 100));
}
export const monsterFlee = (m: MonsterDef) => m.level * 2 + 8;
export const monsterHit = (m: MonsterDef) => m.level * 2 + 25;

export const MAGIC_SP_COST = 3;
