/**
 * Admin edits to the game data (admin.html): rows in public.game_overrides (supabase/add-admin-panel.sql)
 * that replace an item / skill / monster / class from gamedata.json. The game server and the web client both
 * load them on start and put them into ITEMS, SKILLS, MONSTERS and CLASSES *in place*, so every module that
 * already holds one of those objects sees the new numbers. The server reloads them every 30 seconds.
 */
import { CLASSES, ITEMS, MONSTERS, SKILLS } from './index';

export type OverrideKind = 'items' | 'skills' | 'monsters' | 'classes';
export const OVERRIDE_KINDS: OverrideKind[] = ['items', 'skills', 'monsters', 'classes'];

export interface OverrideRow {
  kind: OverrideKind;
  id: string;
  data: Record<string, unknown>;
  updated_at?: string;
}

type Table = Record<string, Record<string, unknown>>;
const TABLES: Record<OverrideKind, Table> = {
  items: ITEMS as unknown as Table,
  skills: SKILLS as unknown as Table,
  monsters: MONSTERS as unknown as Table,
  classes: CLASSES as unknown as Table,
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** gamedata.json as shipped, taken before any override touches it. */
const DEFAULTS: Record<OverrideKind, Table> = {
  items: clone(TABLES.items),
  skills: clone(TABLES.skills),
  monsters: clone(TABLES.monsters),
  classes: clone(TABLES.classes),
};

/** The shipped (gamedata.json) version of a def, or undefined for an item an admin added. */
export const defaultDef = (kind: OverrideKind, id: string) => {
  const d = DEFAULTS[kind][id];
  return d ? clone(d) : undefined;
};
export const defaultIds = (kind: OverrideKind) => Object.keys(DEFAULTS[kind]);

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown) => typeof v === 'string' && v.length > 0;
const ITEM_TYPES = ['consumable', 'loot', 'card', 'weapon', 'armor', 'head', 'accessory', 'shoes', 'earring', 'glasses', 'mount'];

/** Why a def can't go into the game ('' = fine). Also used by the admin page before saving. */
export function checkDef(kind: OverrideKind, id: string, d: unknown): string {
  if (!/^[a-z0-9_]{1,64}$/.test(id)) return 'รหัส (id) ใช้ได้แค่ a-z 0-9 _';
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'ข้อมูลต้องเป็น JSON object';
  const o = d as Record<string, unknown>;
  if (!str(o.name)) return 'ต้องมีชื่อ (name)';
  if (kind === 'items') {
    if (!ITEM_TYPES.includes(o.type as string)) return `ประเภท (type) ต้องเป็น ${ITEM_TYPES.join(', ')}`;
    if (!num(o.price) || (o.price as number) < 0) return 'ราคา (price) ต้องเป็นตัวเลข 0 ขึ้นไป';
    if (!num(o.weight) || (o.weight as number) < 0) return 'น้ำหนัก (weight) ต้องเป็นตัวเลข 0 ขึ้นไป';
    if (o.type === 'card' && !(o.card && typeof o.card === 'object')) return 'การ์ดต้องมี card { slot, bonus }';
  } else if (kind === 'monsters') {
    for (const k of ['level', 'hp', 'atk', 'def', 'exp', 'jobExp', 'speed', 'size']) if (!num(o[k])) return `${k} ต้องเป็นตัวเลข`;
    if ((o.hp as number) < 1) return 'hp ต้องมากกว่า 0';
    const z = o.zeny;
    if (!Array.isArray(z) || z.length !== 2 || !z.every(num)) return 'zeny ต้องเป็น [ต่ำสุด, สูงสุด]';
    if (!Array.isArray(o.drops) || !o.drops.every((r) => Array.isArray(r) && r.length === 2 && str(r[0]) && num(r[1]) && r[1] >= 0 && r[1] <= 1))
      return 'drops ต้องเป็น [["รหัสไอเท็ม", โอกาส 0-1], ...]';
    for (const [it] of o.drops as [string, number][]) if (!ITEMS[it]) return `ไม่มีไอเท็ม ${it} ในเกม`;
  } else if (kind === 'skills') {
    if (!str(o.cls) || !(o.cls as string in CLASSES)) return 'อาชีพ (cls) ไม่ถูกต้อง';
    if (!str(o.type)) return 'ต้องมีชนิดสกิล (type)';
    if (!num(o.maxLevel) || (o.maxLevel as number) < 1) return 'เลเวลสูงสุด (maxLevel) ต้องเป็น 1 ขึ้นไป';
  } else if (kind === 'classes') {
    if (!o.baseStats || typeof o.baseStats !== 'object') return 'ต้องมี baseStats';
    if (!str(o.startWeapon)) return 'ต้องมี startWeapon';
  }
  return '';
}

/** ids each kind had overridden last time, so a row an admin reverted goes back to gamedata.json. */
const applied: Record<OverrideKind, Set<string>> = { items: new Set(), skills: new Set(), monsters: new Set(), classes: new Set() };

function put(table: Table, id: string, data: Record<string, unknown>) {
  const obj = table[id];
  if (!obj) {
    table[id] = clone(data);
    return;
  }
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, clone(data));
}

/**
 * Puts the admin edits into the live game data. Rows that fail checkDef are skipped (logged), so a bad edit can
 * never take the server down. Returns how many rows went in.
 */
export function applyOverrides(rows: OverrideRow[]): number {
  let n = 0;
  for (const kind of OVERRIDE_KINDS) {
    const table = TABLES[kind];
    const now = new Set<string>();
    // items first matters for monsters (drop ids are checked against ITEMS), and OVERRIDE_KINDS starts with items
    for (const r of rows) {
      if (r.kind !== kind) continue;
      const bad = checkDef(kind, r.id, r.data);
      if (bad) {
        console.warn(`game_overrides ${kind}/${r.id} skipped: ${bad}`);
        continue;
      }
      put(table, r.id, r.data);
      now.add(r.id);
      n++;
    }
    for (const id of applied[kind]) {
      if (now.has(id)) continue;
      const d = DEFAULTS[kind][id];
      if (d) put(table, id, d);
      else delete table[id]; // an added item that was removed again
    }
    applied[kind] = now;
  }
  return n;
}

/** Anything with `.from(table).select()` (a SupabaseClient on the web or the server). */
interface Reader {
  from(t: string): { select(cols: string): PromiseLike<{ data: unknown; error: { message: string } | null }> };
}

/** Reads every override row; throws if the table isn't there (SQL not run) so the caller can decide. */
export async function fetchOverrides(sb: Reader): Promise<OverrideRow[]> {
  const { data, error } = await sb.from('game_overrides').select('kind,id,data,updated_at');
  if (error) throw new Error(error.message);
  return (data as OverrideRow[]) ?? [];
}
