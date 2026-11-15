/**
 * Admin panel (admin.html): edit items, cards, skills, monsters (with drop rates) and classes.
 * Saves go through admin_save_def() in Supabase (supabase/add-admin-panel.sql), which only admins can call;
 * the game server picks the change up within 30 seconds (src/data/overrides.ts).
 */
import './admin.css';
import { createClient } from '@supabase/supabase-js';
import { authEmail } from '../data/account';
import { CLASSES, ELEMENTS, ELEMENT_KEYS, ITEMS, MONSTERS, SKILLS, STAT_KEYS } from '../data/index';
import { applyOverrides, checkDef, defaultDef, defaultIds, fetchOverrides, type OverrideKind, type OverrideRow } from '../data/overrides';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const sb = URL_ && KEY ? createClient(URL_, KEY) : null;

type Obj = Record<string, any>;
type Tab = 'items' | 'cards' | 'skills' | 'monsters' | 'classes' | 'log';
const TAB_KIND: Record<Exclude<Tab, 'log'>, OverrideKind> = { items: 'items', cards: 'items', skills: 'skills', monsters: 'monsters', classes: 'classes' };
const TABLE: Record<OverrideKind, Record<string, Obj>> = { items: ITEMS, skills: SKILLS, monsters: MONSTERS, classes: CLASSES } as never;

const root = document.getElementById('admin')!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Obj = {}, ...kids: (Node | string | null | undefined)[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) (el as any)[k] = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const k of kids) if (k !== null && k !== undefined) el.append(k);
  return el;
};
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fmt = (n: unknown) => (typeof n === 'number' ? n.toLocaleString('th-TH', { maximumFractionDigits: 3 }) : '');

// ------------------------------------------------------------------ labels

const ITEM_TYPES: Record<string, string> = {
  consumable: 'ของใช้', loot: 'วัสดุ/ของดรอป', card: 'การ์ด', weapon: 'อาวุธ', armor: 'ชุด', head: 'หมวก',
  accessory: 'เครื่องประดับ', shoes: 'รองเท้า', earring: 'ต่างหู/หูฟัง',
};
const CARD_SLOTS: Record<string, string> = { weapon: 'อาวุธ', armor: 'ชุด', head: 'หมวก/หูฟัง', shoes: 'รองเท้า', accessory: 'เครื่องประดับ' };
const BONUS_KEYS: Record<string, string> = {
  str: 'STR', agi: 'AGI', vit: 'VIT', int: 'INT', dex: 'DEX', luk: 'LUK', atk: 'ATK', matk: 'MATK', def: 'DEF', mdef: 'MDEF',
  hit: 'HIT', flee: 'Flee', crit: 'คริ', aspd: 'ASPD %', maxHp: 'HP สูงสุด', maxSp: 'SP สูงสุด', maxHpPct: 'HP สูงสุด %',
  maxSpPct: 'SP สูงสุด %', atkPct: 'ATK %', matkPct: 'MATK %', pvpAtkPct: 'ตีผู้เล่น %', pvpDefPct: 'ลดดาเมจจากผู้เล่น %',
};
const SKILL_TYPES: Record<string, string> = {
  single: 'ตีเป้าเดียว', aoe: 'วงรอบเป้า', aoe_self: 'วงรอบตัว', line: 'คลื่นเป็นเส้น', heal: 'ฮีลตัวเอง', heal_target: 'ฮีลคนอื่น',
  buff: 'บัพตัวเอง', buff_target: 'บัพคนอื่น', buff_party: 'บัพปาร์ตี้', revive: 'ชุบชีวิต', passive: 'ติดตัว', wall: 'กำแพง (รถแห่)',
  ward: 'วงป้องกัน (บูท)', vend: 'เปิดร้าน',
};
const className = (c: string) => (c === 'all' ? 'ทุกอาชีพ' : CLASSES[c as keyof typeof CLASSES]?.name ?? c);
const elOpts = () => Object.fromEntries(ELEMENT_KEYS.map((k) => [k, `${ELEMENTS[k].icon} ${ELEMENTS[k].name}`]));
const itemName = (id: string) => (ITEMS[id] ? `${ITEMS[id].name}` : `❓${id}`);

// ------------------------------------------------------------------ state

let rows = new Map<string, OverrideRow>(); // `${kind}/${id}`
let tab: Tab = 'items';
let query = '';
let filter = '';
let tableMissing = false;
const key = (k: OverrideKind, id: string) => `${k}/${id}`;
const edited = (k: OverrideKind, id: string) => rows.has(key(k, id));
const isAdded = (k: OverrideKind, id: string) => k === 'items' && !defaultIds('items').includes(id);

async function loadRows() {
  if (!sb) return;
  try {
    const list = await fetchOverrides(sb);
    rows = new Map(list.map((r) => [key(r.kind, r.id), r]));
    applyOverrides(list);
    tableMissing = false;
  } catch {
    tableMissing = true;
  }
}

// ------------------------------------------------------------------ login

function loginView(msg = '') {
  root.innerHTML = '';
  const m = h('div', { class: 'msg' }, msg);
  const user = h('input', { type: 'text', placeholder: 'ชื่อผู้ใช้', autocomplete: 'username', required: true }) as HTMLInputElement;
  const pass = h('input', { type: 'password', placeholder: 'รหัสผ่าน', autocomplete: 'current-password', required: true }) as HTMLInputElement;
  const btn = h('button', { class: 'btn primary', type: 'submit' }, 'เข้าสู่ระบบ') as HTMLButtonElement;
  const form = h('form', {}, h('h1', {}, '🎛️ Music Land Admin'), h('p', {}, 'ใช้ชื่อผู้ใช้และรหัสผ่านเดียวกับที่ล็อกอินเกม (เฉพาะบัญชีที่เป็นผู้ดูแลระบบ)'), user, pass, btn, m);
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!sb) return;
    btn.disabled = true;
    m.textContent = '';
    const login = user.value.trim();
    const { error } = await sb.auth.signInWithPassword({ email: login.includes('@') ? login : authEmail(login), password: pass.value });
    btn.disabled = false;
    if (error) {
      m.textContent = error.message === 'Invalid login credentials' ? 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' : error.message;
      return;
    }
    void start();
  };
  root.append(h('div', { class: 'login' }, form));
  if (!sb) m.textContent = 'หน้านี้ยังไม่ได้ตั้งค่า Supabase (build ต้องมี VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)';
  user.focus();
}

let who = '';
async function start() {
  if (!sb) return loginView();
  const { data } = await sb.auth.getSession();
  if (!data.session) return loginView();
  who = (data.session.user.email ?? '').replace('@player.musicland.invalid', '');
  const { data: ok, error } = await sb.rpc('is_game_admin');
  if (error) {
    await sb.auth.signOut();
    return loginView(/is_game_admin/.test(error.message) || error.code === 'PGRST202'
      ? 'ฐานข้อมูลยังไม่มีระบบแอดมิน: รัน supabase/add-admin-panel.sql ใน Supabase SQL Editor ก่อน'
      : error.message);
  }
  if (!ok) {
    await sb.auth.signOut();
    return loginView(`บัญชี "${who}" ไม่ใช่ผู้ดูแลระบบ (เพิ่มสิทธิ์ในตาราง game_admins)`);
  }
  await loadRows();
  shell();
}

// ------------------------------------------------------------------ shell + lists

const TABS: [Tab, string][] = [['items', '🎒 ไอเท็ม'], ['cards', '🃏 การ์ด'], ['skills', '✨ สกิล'], ['monsters', '👾 มอนสเตอร์ / ดรอป'], ['classes', '🎸 อาชีพ'], ['log', '🕘 ประวัติ']];
let listEl: HTMLElement;
let navEl: HTMLElement;

function shell() {
  root.innerHTML = '';
  navEl = h('nav', { class: 'tabs' });
  const out = h('button', { class: 'btn small', onclick: async () => { await sb!.auth.signOut(); loginView(); } }, 'ออกจากระบบ');
  root.append(
    h('header', { class: 'top' },
      h('div', { class: 'top-row' }, h('h1', {}, '🎛️ Music Land Admin'), h('span', { class: 'who' }, `👤 ${who}`), out),
      navEl),
    tableMissing
      ? h('div', { class: 'note warn' }, 'อ่านตาราง game_overrides ไม่ได้: รัน supabase/add-admin-panel.sql ใน Supabase ก่อน')
      : h('div', { class: 'note' }, 'กดแถวเพื่อแก้ไข บันทึกแล้วเซิร์ฟเวอร์เกมใช้ค่าใหม่ภายใน 30 วินาที (ผู้เล่นเห็นชื่อ/คำอธิบายใหม่หลังรีเฟรชหน้าเกม)'),
  );
  listEl = h('main', { class: 'list' });
  root.append(listEl);
  renderNav();
  renderList();
}

function renderNav() {
  navEl.innerHTML = '';
  for (const [t, label] of TABS)
    navEl.append(h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; query = ''; filter = ''; renderNav(); renderList(); } }, label));
}

interface Col { head: string; num?: boolean; wrap?: boolean; cell: (id: string, d: Obj) => string }

function tags(k: OverrideKind, id: string) {
  return (isAdded(k, id) ? '<span class="tag new">ใหม่</span>' : edited(k, id) ? '<span class="tag edit">แก้แล้ว</span>' : '');
}
const nameCell = (k: OverrideKind) => (id: string, d: Obj) =>
  `${d.color ? `<span class="sw" style="background:${esc(d.color)}"></span>` : d.icon ? `${esc(d.icon)} ` : ''}${esc(d.name)}${tags(k, id)}<br><span class="id">${esc(id)}</span>`;
const bonusText = (b: Obj | undefined) => (b ? Object.entries(b).map(([k, v]) => `${BONUS_KEYS[k] ?? k} ${Number(v) > 0 ? '+' : ''}${v}`).join(', ') : '');
const pairText = (p: unknown) => (Array.isArray(p) ? `${p[0]} (+${p[1]}/Lv)` : '');
function droppers(itemId: string): [string, number][] {
  const out: [string, number][] = [];
  for (const [mid, m] of Object.entries(MONSTERS)) for (const [it, ch] of m.drops ?? []) if (it === itemId) out.push([mid, ch]);
  return out;
}

const COLS: Record<Exclude<Tab, 'log'>, Col[]> = {
  items: [
    { head: 'ไอเท็ม', cell: nameCell('items') },
    { head: 'ประเภท', cell: (_, d) => esc(ITEM_TYPES[d.type] ?? d.type) },
    { head: 'ราคา', num: true, cell: (_, d) => fmt(d.price) },
    { head: 'น้ำหนัก', num: true, cell: (_, d) => fmt(d.weight) },
    { head: 'ATK/MATK/DEF', cell: (_, d) => [d.atk && `ATK ${d.atk}`, d.matk && `MATK ${d.matk}`, d.def && `DEF ${d.def}`, d.heal && `HP +${d.heal}`, d.sp && `SP +${d.sp}`].filter(Boolean).join(' · ') },
    { head: 'Lv', num: true, cell: (_, d) => fmt(d.reqLevel) },
    { head: 'ช่อง', num: true, cell: (_, d) => fmt(d.slots) },
  ],
  cards: [
    { head: 'การ์ด', cell: nameCell('items') },
    { head: 'ใส่ใน', cell: (_, d) => esc(CARD_SLOTS[d.card?.slot] ?? '') },
    { head: 'ความสามารถ', wrap: true, cell: (_, d) => esc(bonusText(d.card?.bonus)) },
    { head: 'ดรอปจาก', wrap: true, cell: (id) => droppers(id).map(([m, c]) => `${esc(MONSTERS[m].name)} ${fmt(c * 100)}%`).join(', ') },
  ],
  skills: [
    { head: 'สกิล', cell: nameCell('skills') },
    { head: 'อาชีพ', cell: (_, d) => esc(className(d.cls)) },
    { head: 'ชนิด', cell: (_, d) => esc(SKILL_TYPES[d.type] ?? d.type) },
    { head: 'Lv สูงสุด', num: true, cell: (_, d) => fmt(d.maxLevel) },
    { head: 'SP', cell: (_, d) => pairText(d.sp) },
    { head: 'พลัง %', cell: (_, d) => pairText(d.power) },
    { head: 'คูลดาวน์', num: true, cell: (_, d) => (d.cooldown ? `${fmt(d.cooldown / 1000)} วิ` : '') },
  ],
  monsters: [
    { head: 'มอนสเตอร์', cell: (id, d) => nameCell('monsters')(id, d) + (d.mvp ? '<span class="tag boss">MVP</span>' : d.boss ? '<span class="tag boss">บอส</span>' : '') },
    { head: 'Lv', num: true, cell: (_, d) => fmt(d.level) },
    { head: 'HP', num: true, cell: (_, d) => fmt(d.hp) },
    { head: 'ATK', num: true, cell: (_, d) => fmt(d.atk) },
    { head: 'EXP / Job', num: true, cell: (_, d) => `${fmt(d.exp)} / ${fmt(d.jobExp)}` },
    { head: 'Zeny', num: true, cell: (_, d) => (d.zeny ? `${fmt(d.zeny[0])}–${fmt(d.zeny[1])}` : '') },
    { head: 'ธาตุ', cell: (_, d) => (d.element ? `${ELEMENTS[d.element[0] as keyof typeof ELEMENTS]?.icon ?? ''} ${d.element[1]}` : '') },
    { head: 'ดรอป', num: true, cell: (_, d) => fmt((d.drops ?? []).length) },
  ],
  classes: [
    { head: 'อาชีพ', cell: nameCell('classes') },
    { head: 'HP x', num: true, cell: (_, d) => fmt(d.hpMod) },
    { head: 'SP x', num: true, cell: (_, d) => fmt(d.spMod) },
    { head: 'ระยะตี', num: true, cell: (_, d) => fmt(d.range) },
    { head: 'อาวุธเริ่มต้น', cell: (_, d) => esc(itemName(d.startWeapon)) },
  ],
};

function filterOptions(t: Tab): Record<string, string> | null {
  if (t === 'items') return { '': 'ทุกประเภท', edited: '✏️ ที่แก้แล้ว', ...Object.fromEntries(Object.entries(ITEM_TYPES).filter(([k]) => k !== 'card')) };
  if (t === 'cards') return { '': 'ทุกช่อง', edited: '✏️ ที่แก้แล้ว', ...CARD_SLOTS };
  if (t === 'skills') return { '': 'ทุกอาชีพ', edited: '✏️ ที่แก้แล้ว', all: 'ทุกอาชีพ (สกิลรวม)', ...Object.fromEntries(Object.entries(CLASSES).map(([k, c]) => [k, c.name])) };
  if (t === 'monsters') return { '': 'ทั้งหมด', edited: '✏️ ที่แก้แล้ว', boss: 'บอส / MVP', normal: 'มอนธรรมดา' };
  if (t === 'classes') return null;
  return null;
}

function idsFor(t: Exclude<Tab, 'log'>): string[] {
  const k = TAB_KIND[t];
  const table = TABLE[k];
  let ids = Object.keys(table);
  if (t === 'items') ids = ids.filter((id) => table[id].type !== 'card');
  if (t === 'cards') ids = ids.filter((id) => table[id].type === 'card');
  if (filter === 'edited') ids = ids.filter((id) => edited(k, id));
  else if (filter) {
    ids = ids.filter((id) => {
      const d = table[id];
      if (t === 'items') return d.type === filter;
      if (t === 'cards') return d.card?.slot === filter;
      if (t === 'skills') return d.cls === filter;
      if (t === 'monsters') return filter === 'boss' ? !!(d.boss || d.mvp) : !(d.boss || d.mvp);
      return true;
    });
  }
  const q = query.trim().toLowerCase();
  if (q) ids = ids.filter((id) => id.includes(q) || String(table[id].name ?? '').toLowerCase().includes(q) || String(table[id].desc ?? '').toLowerCase().includes(q));
  if (t === 'monsters') ids.sort((a, b) => table[a].level - table[b].level);
  return ids;
}

function renderList() {
  listEl.innerHTML = '';
  if (tab === 'log') return void renderLog();
  const t = tab;
  const k = TAB_KIND[t];
  const search = h('input', { type: 'search', placeholder: 'ค้นหาชื่อ / รหัส / คำอธิบาย', value: query }) as HTMLInputElement;
  const bar = h('div', { class: 'toolbar' }, search);
  const fo = filterOptions(t);
  if (fo) {
    const sel = h('select', {}, ...Object.entries(fo).map(([v, l]) => h('option', { value: v, selected: v === filter }, l))) as HTMLSelectElement;
    sel.onchange = () => { filter = sel.value; draw(); };
    bar.append(sel);
  }
  if (t === 'items' || t === 'cards')
    bar.append(h('button', { class: 'btn primary', onclick: () => openEditor(k, '', t === 'cards' ? newCard() : newItem()) }, t === 'cards' ? '+ การ์ดใหม่' : '+ ไอเท็มใหม่'));
  const count = h('p', { class: 'count' });
  const wrap = h('div', { class: 'table-wrap' });
  listEl.append(bar, count, wrap);
  const cols = COLS[t];
  const draw = () => {
    const ids = idsFor(t);
    count.textContent = `${ids.length.toLocaleString()} รายการ`;
    const table = TABLE[k];
    wrap.innerHTML = `<table><thead><tr>${cols.map((c) => `<th class="${c.num ? 'num' : ''}">${c.head}</th>`).join('')}</tr></thead><tbody>${ids
      .map((id) => `<tr data-id="${esc(id)}">${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.wrap ? 'wrap' : ''}">${c.cell(id, table[id])}</td>`).join('')}</tr>`)
      .join('')}</tbody></table>`;
    wrap.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => (tr.onclick = () => openEditor(k, tr.dataset.id!)));
  };
  let timer = 0;
  search.oninput = () => { clearTimeout(timer); timer = window.setTimeout(() => { query = search.value; draw(); }, 150); };
  draw();
}

const newItem = (): Obj => ({ name: '', type: 'loot', price: 10, weight: 1, color: '#c9c9c9', desc: '' });
const newCard = (): Obj => ({ name: 'การ์ด', type: 'card', price: 20, weight: 1, color: '#e8d27a', desc: '', card: { slot: 'weapon', bonus: { atk: 5 } } });

async function renderLog() {
  listEl.append(h('p', { class: 'count' }, 'กำลังโหลด…'));
  const { data, error } = await sb!.from('game_override_log').select('id,kind,def_id,action,data,at').order('at', { ascending: false }).limit(200);
  listEl.innerHTML = '';
  if (error) return void listEl.append(h('div', { class: 'note warn' }, error.message));
  const list = (data ?? []) as { id: number; kind: OverrideKind; def_id: string; action: string; data: Obj | null; at: string }[];
  const ACT: Record<string, string> = { save: 'บันทึก', revert: 'คืนค่าเดิม', delete: 'ลบ' };
  const KIND: Record<string, string> = { items: 'ไอเท็ม', skills: 'สกิล', monsters: 'มอนสเตอร์', classes: 'อาชีพ' };
  listEl.append(h('p', { class: 'count' }, `${list.length} รายการล่าสุด · กดแถวเพื่อเปิดค่าของครั้งนั้นในตัวแก้ไข (ยังไม่บันทึกจนกว่าจะกดบันทึก)`));
  const wrap = h('div', { class: 'table-wrap' });
  wrap.innerHTML = `<table><thead><tr><th>เวลา</th><th>การทำ</th><th>ชนิด</th><th>รายการ</th></tr></thead><tbody>${list
    .map((r, i) => `<tr data-i="${i}"><td>${esc(new Date(r.at).toLocaleString('th-TH'))}</td><td>${esc(ACT[r.action] ?? r.action)}</td><td>${esc(KIND[r.kind] ?? r.kind)}</td><td>${esc(r.data?.name ?? TABLE[r.kind]?.[r.def_id]?.name ?? '')} <span class="id">${esc(r.def_id)}</span></td></tr>`)
    .join('')}</tbody></table>`;
  wrap.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
    const r = list[Number(tr.dataset.i)];
    tr.onclick = () => { if (r.data && TABLE[r.kind]) openEditor(r.kind, r.def_id, r.data); };
  });
  listEl.append(wrap);
}

// ------------------------------------------------------------------ editor

type FieldKind = 'text' | 'textarea' | 'num' | 'check' | 'color' | 'select' | 'pair' | 'chips' | 'bonus' | 'stats' | 'element' | 'drops';
interface Field {
  path: string;
  label: string;
  kind: FieldKind;
  options?: Record<string, string> | (() => Record<string, string>);
  /** pair: the two box labels */
  parts?: [string, string];
  /** num: keep 0 instead of removing the key when empty */
  required?: boolean;
  wide?: boolean;
  /** two grid columns (a pair of boxes) */
  span2?: boolean;
  step?: string;
  hint?: string;
  when?: (d: Obj) => boolean;
}

const getP = (o: Obj, path: string) => path.split('.').reduce<any>((v, k) => (v == null ? undefined : v[k]), o);
function setP(o: Obj, path: string, val: unknown) {
  const ks = path.split('.');
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) {
    if (cur[ks[i]] == null || typeof cur[ks[i]] !== 'object') cur[ks[i]] = {};
    cur = cur[ks[i]];
  }
  const last = ks[ks.length - 1];
  if (val === undefined) {
    delete cur[last];
    // drop an object we emptied (e.g. buff {} after clearing its last number)
    if (ks.length > 1 && Object.keys(cur).length === 0) setP(o, ks.slice(0, -1).join('.'), undefined);
  } else cur[last] = val;
}

const EQUIP = ['weapon', 'armor', 'head', 'accessory', 'shoes', 'earring'];
const isEquip = (d: Obj) => EQUIP.includes(d.type);
const weaponOpts = () => Object.fromEntries(Object.entries(ITEMS).filter(([, it]) => it.type === 'weapon').map(([id, it]) => [id, `${it.name} (${id})`]));

const FIELDS: Record<OverrideKind, Field[]> = {
  items: [
    { path: 'name', label: 'ชื่อ', kind: 'text', wide: true },
    { path: 'type', label: 'ประเภท', kind: 'select', options: ITEM_TYPES },
    { path: 'price', label: 'ราคา (zeny)', kind: 'num', required: true, hint: 'ขายให้ NPC ได้ครึ่งราคา' },
    { path: 'weight', label: 'น้ำหนัก', kind: 'num', required: true },
    { path: 'color', label: 'สี', kind: 'color' },
    { path: 'heal', label: 'ฟื้น HP', kind: 'num', when: (d) => d.type === 'consumable' },
    { path: 'sp', label: 'ฟื้น SP', kind: 'num', when: (d) => d.type === 'consumable' },
    { path: 'reqLevel', label: 'Base Lv ที่ใส่ได้', kind: 'num', when: isEquip },
    { path: 'slots', label: 'ช่องการ์ด', kind: 'num', when: isEquip },
    { path: 'atk', label: 'ATK', kind: 'num', when: isEquip },
    { path: 'matk', label: 'MATK', kind: 'num', when: isEquip },
    { path: 'def', label: 'DEF', kind: 'num', when: isEquip },
    { path: 'aspd', label: 'ASPD %', kind: 'num', when: isEquip },
    { path: 'flee', label: 'Flee', kind: 'num', when: isEquip },
    { path: 'crit', label: 'คริ', kind: 'num', when: isEquip },
    { path: 'element', label: 'ธาตุอาวุธ', kind: 'select', options: () => ({ '': '— ไม่มี —', ...elOpts() }), when: (d) => d.type === 'weapon' },
    { path: 'gender', label: 'เพศที่ใส่ได้', kind: 'select', options: { '': 'ทุกเพศ', m: 'ชาย', f: 'หญิง' }, when: isEquip },
    { path: 'classes', label: 'อาชีพที่ใช้ได้ (ไม่เลือก = ทุกอาชีพ)', kind: 'chips', wide: true, options: () => Object.fromEntries(Object.entries(CLASSES).map(([k, c]) => [k, c.name])), when: isEquip },
    { path: 'desc', label: 'คำอธิบาย', kind: 'textarea', wide: true },
    { path: 'card.slot', label: 'การ์ดใส่ใน', kind: 'select', options: CARD_SLOTS, when: (d) => d.type === 'card' },
    { path: 'card.element', label: 'เปลี่ยนธาตุ (การ์ดชุด)', kind: 'select', options: () => ({ '': '— ไม่มี —', ...elOpts() }), when: (d) => d.type === 'card' },
    { path: 'card.bonus', label: 'ความสามารถของการ์ด', kind: 'bonus', wide: true, when: (d) => d.type === 'card' },
    { path: 'bonus', label: 'ค่าสถานะที่ไอเท็มให้', kind: 'bonus', wide: true, when: isEquip },
  ],
  skills: [
    { path: 'name', label: 'ชื่อ', kind: 'text' },
    { path: 'icon', label: 'ไอคอน', kind: 'text' },
    { path: 'cls', label: 'อาชีพ', kind: 'select', options: () => ({ all: 'ทุกอาชีพ', ...Object.fromEntries(Object.entries(CLASSES).map(([k, c]) => [k, c.name])) }) },
    { path: 'type', label: 'ชนิด', kind: 'select', options: SKILL_TYPES },
    { path: 'maxLevel', label: 'เลเวลสูงสุด', kind: 'num', required: true },
    { path: 'desc', label: 'คำอธิบาย', kind: 'textarea', wide: true },
    { path: 'sp', label: 'SP ที่ใช้', kind: 'pair', parts: ['Lv 1', '+ ต่อ Lv'], step: '0.1' },
    { path: 'power', label: 'พลังโจมตี % ATK', kind: 'pair', parts: ['Lv 1', '+ ต่อ Lv'] },
    { path: 'heal', label: 'ฮีล', kind: 'pair', parts: ['Lv 1', '+ ต่อ Lv'] },
    { path: 'hits', label: 'จำนวนครั้งที่ตี', kind: 'num' },
    { path: 'range', label: 'ระยะ (ช่อง)', kind: 'num', step: '0.1' },
    { path: 'radius', label: 'รัศมี (ช่อง)', kind: 'num', step: '0.1' },
    { path: 'cooldown', label: 'คูลดาวน์ (ms)', kind: 'num' },
    { path: 'castMs', label: 'เวลาร่าย (ms)', kind: 'num' },
    { path: 'castDex', label: 'DEX ลดเวลาร่าย', kind: 'check' },
    { path: 'knockback', label: 'ผลักถอย (ช่อง)', kind: 'num' },
    { path: 'magic', label: 'สกิลเวทย์ (MATK)', kind: 'check' },
    { path: 'element', label: 'ธาตุสกิล', kind: 'select', options: () => ({ '': 'ตามอาวุธ', ...elOpts() }) },
    { path: 'buff.durationSec', label: 'บัพนาน (วินาที)', kind: 'num', when: (d) => !!d.buff },
    { path: 'buff.aspdPct', label: 'บัพ ASPD % ต่อ Lv', kind: 'num', when: (d) => !!d.buff },
    { path: 'buff.def', label: 'บัพ DEF ต่อ Lv', kind: 'num', when: (d) => !!d.buff },
  ],
  monsters: [
    { path: 'name', label: 'ชื่อ', kind: 'text', wide: true },
    { path: 'level', label: 'เลเวล', kind: 'num', required: true },
    { path: 'hp', label: 'HP', kind: 'num', required: true },
    { path: 'atk', label: 'ATK', kind: 'num', required: true },
    { path: 'def', label: 'DEF', kind: 'num', required: true },
    { path: 'exp', label: 'Base EXP', kind: 'num', required: true },
    { path: 'jobExp', label: 'Job EXP', kind: 'num', required: true },
    { path: 'zeny', label: 'Zeny ที่ได้', kind: 'pair', parts: ['ต่ำสุด', 'สูงสุด'], span2: true },
    { path: 'speed', label: 'ความเร็ว', kind: 'num', required: true },
    { path: 'size', label: 'ขนาด', kind: 'num', required: true, step: '0.05' },
    { path: 'element', label: 'ธาตุ', kind: 'element', span2: true },
    { path: 'color', label: 'สี', kind: 'color' },
    { path: 'aggressive', label: 'ตีผู้เล่นก่อน', kind: 'check' },
    { path: 'boss', label: 'บอส', kind: 'check' },
    { path: 'mvp', label: 'MVP', kind: 'check' },
    { path: 'drops', label: 'ของดรอปและอัตราดรอป', kind: 'drops', wide: true },
  ],
  classes: [
    { path: 'name', label: 'ชื่อ', kind: 'text' },
    { path: 'color', label: 'สี', kind: 'color' },
    { path: 'desc', label: 'คำอธิบาย', kind: 'textarea', wide: true },
    { path: 'hpMod', label: 'ตัวคูณ HP', kind: 'num', required: true, step: '0.05' },
    { path: 'spMod', label: 'ตัวคูณ SP', kind: 'num', required: true, step: '0.05' },
    { path: 'range', label: 'ระยะตี', kind: 'num', required: true, step: '0.1' },
    { path: 'aspdPct', label: 'ASPD เพิ่ม %', kind: 'num' },
    { path: 'startWeapon', label: 'อาวุธเริ่มต้น', kind: 'select', options: weaponOpts, wide: true },
    { path: 'baseStats', label: 'ค่าสถานะเริ่มต้น', kind: 'stats', wide: true },
  ],
};

let editorEl: HTMLElement | null = null;
let shadeEl: HTMLElement | null = null;
let dirty = false;

function closeEditor(force = false) {
  if (!force && dirty && !confirm('ยังไม่ได้บันทึก ปิดเลยไหม?')) return;
  editorEl?.remove();
  shadeEl?.remove();
  editorEl = shadeEl = null;
  dirty = false;
}

/** id '' = a new item (the admin types its id). `start` = values to open with instead of the current ones. */
function openEditor(kind: OverrideKind, id: string, start?: Obj) {
  closeEditor(true);
  const isNew = !id;
  let d: Obj = clone(start ?? TABLE[kind][id] ?? {});
  dirty = !!start && !isNew;
  const def = id ? defaultDef(kind, id) : undefined;

  shadeEl = h('div', { class: 'shade', onclick: () => closeEditor() });
  const title = h('h2', {}, isNew ? (kind === 'items' && d.type === 'card' ? 'การ์ดใหม่' : 'ไอเท็มใหม่') : `${d.icon ? d.icon + ' ' : ''}${d.name}`);
  const body = h('div', { class: 'ed-body' });
  const msg = h('div', { class: 'msg' });
  const idInput = h('input', { type: 'text', placeholder: 'เช่น my_new_item (a-z 0-9 _)' }) as HTMLInputElement;
  const json = h('textarea', { spellcheck: 'false' }) as HTMLTextAreaElement;
  const jsonMsg = h('div', { class: 'msg' });
  const saveBtn = h('button', { class: 'btn primary' }, 'บันทึก') as HTMLButtonElement;

  const touch = () => {
    dirty = true;
    msg.textContent = '';
    msg.className = 'msg';
    if (document.activeElement !== json) json.value = JSON.stringify(d, null, 2);
  };

  const form = h('div');
  const drawForm = () => {
    form.innerHTML = '';
    let grid = h('div', { class: 'grid' });
    for (const f of FIELDS[kind]) {
      if (f.when && !f.when(d)) continue;
      const el = fieldEl(f, d, touch, drawForm);
      if (f.kind === 'bonus' || f.kind === 'drops' || f.kind === 'stats') {
        if (grid.childElementCount) form.append(grid);
        grid = h('div', { class: 'grid' });
        form.append(el);
      } else grid.append(el);
    }
    if (grid.childElementCount) form.append(grid);
    if (kind === 'items' && id) {
      const src = droppers(id);
      form.append(h('h3', { class: 'sec' }, 'มอนที่ดรอปไอเท็มนี้'));
      if (!src.length) form.append(h('p', { class: 'count' }, 'ไม่มีมอนดรอป (แก้ได้ที่แท็บมอนสเตอร์)'));
      else {
        const ul = h('ul', { class: 'sources' });
        for (const [mid, ch] of src)
          ul.append(h('li', {}, h('a', { onclick: () => openEditor('monsters', mid) }, MONSTERS[mid].name), ` Lv ${MONSTERS[mid].level} · ${fmt(ch * 100)}%`));
        form.append(ul);
      }
    }
  };

  if (isNew) body.append(h('div', { class: 'grid' }, h('label', { class: 'field wide' }, h('span', {}, 'รหัสไอเท็ม (id) ตั้งแล้วเปลี่ยนไม่ได้'), idInput)));
  body.append(form);
  json.value = JSON.stringify(d, null, 2);
  json.oninput = () => {
    try {
      const v = JSON.parse(json.value);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('ต้องเป็น object { ... }');
      d = v;
      jsonMsg.textContent = '';
      dirty = true;
    } catch (e) {
      jsonMsg.textContent = `JSON ผิด: ${(e as Error).message}`;
    }
  };
  json.onblur = () => { if (!jsonMsg.textContent) drawForm(); };
  body.append(h('details', { class: 'json' }, h('summary', {}, 'ขั้นสูง: แก้ทุกค่าแบบ JSON (ค่าที่ไม่มีในฟอร์ม)'), json, jsonMsg));
  drawForm();

  const foot = h('div', { class: 'ed-foot' });
  saveBtn.onclick = async () => {
    const theId = isNew ? idInput.value.trim().toLowerCase() : id;
    if (isNew && TABLE[kind][theId]) return void (msg.textContent = `มีรหัส ${theId} อยู่แล้ว`);
    const bad = checkDef(kind, theId, d);
    if (bad) return void (msg.textContent = bad);
    saveBtn.disabled = true;
    msg.className = 'msg';
    msg.textContent = 'กำลังบันทึก…';
    const same = def && JSON.stringify(def) === JSON.stringify(d); // back to the shipped values: drop the override
    const { error } = await sb!.rpc('admin_save_def', { p_kind: kind, p_id: theId, p_data: d, p_revert: !!same });
    saveBtn.disabled = false;
    if (error) return void (msg.textContent = `บันทึกไม่ได้: ${error.message}`);
    await loadRows();
    dirty = false;
    renderList();
    msg.className = 'msg ok';
    msg.textContent = same ? '✓ บันทึกแล้ว (ตรงกับค่าเดิมของเกม)' : '✓ บันทึกแล้ว เซิร์ฟเวอร์ใช้ค่าใหม่ภายใน 30 วินาที';
    if (isNew) openEditor(kind, theId);
  };
  foot.append(saveBtn, h('button', { class: 'btn', onclick: () => closeEditor() }, 'ปิด'), h('span', { class: 'spacer' }));
  if (def && edited(kind, id)) {
    foot.append(h('button', {
      class: 'btn danger',
      onclick: async () => {
        if (!confirm('คืนค่าเดิมของเกม (ทิ้งการแก้ไขทั้งหมดของรายการนี้)?')) return;
        const { error } = await sb!.rpc('admin_save_def', { p_kind: kind, p_id: id, p_data: def, p_revert: true });
        if (error) return void (msg.textContent = error.message);
        await loadRows();
        renderList();
        dirty = false;
        openEditor(kind, id);
      },
    }, '↺ คืนค่าเดิม'));
  }
  if (!isNew && isAdded(kind, id)) {
    foot.append(h('button', {
      class: 'btn danger',
      onclick: async () => {
        const users = Object.values(MONSTERS).filter((m) => m.drops?.some(([it]) => it === id));
        if (users.length) return void (msg.textContent = `ลบไม่ได้: ยังอยู่ในดรอปของ ${users.map((m) => m.name).join(', ')}`);
        if (!confirm(`ลบไอเท็ม ${d.name} ออกจากเกม?`)) return;
        const { error } = await sb!.rpc('admin_delete_item', { p_id: id });
        if (error) return void (msg.textContent = error.message);
        await loadRows();
        renderList();
        closeEditor(true);
      },
    }, '🗑 ลบไอเท็ม'));
  }
  foot.append(msg);

  const tagText = isNew ? '' : isAdded(kind, id) ? ' · ไอเท็มที่เพิ่มเอง' : edited(kind, id) ? ' · แก้แล้ว' : '';
  editorEl = h('aside', { class: 'editor' },
    h('div', { class: 'ed-head' }, title, h('span', { class: 'id' }, `${id}${tagText}`), h('button', { class: 'btn small', onclick: () => closeEditor() }, '✕')),
    body, foot);
  document.body.append(shadeEl, editorEl);
  if (isNew) idInput.focus();
}

function opts(f: Field): Record<string, string> {
  return typeof f.options === 'function' ? f.options() : f.options ?? {};
}

/** One form control. `changed` after a value edit; `redraw` when the edit changes which fields show. */
function fieldEl(f: Field, d: Obj, changed: () => void, redraw: () => void): HTMLElement {
  const v = getP(d, f.path);
  const wrap = h('label', { class: `field${f.wide ? ' wide' : f.span2 ? ' span2' : ''}` }, h('span', {}, f.label));
  const numVal = (s: string) => (s.trim() === '' ? undefined : Number(s));

  switch (f.kind) {
    case 'text': {
      const i = h('input', { type: 'text', value: v ?? '' }) as HTMLInputElement;
      i.oninput = () => { setP(d, f.path, i.value === '' && f.path !== 'name' ? undefined : i.value); changed(); };
      wrap.append(i);
      break;
    }
    case 'textarea': {
      const i = h('textarea', { rows: 3 }) as HTMLTextAreaElement;
      i.value = v ?? '';
      i.oninput = () => { setP(d, f.path, i.value); changed(); };
      wrap.append(i);
      break;
    }
    case 'num': {
      const i = h('input', { type: 'number', value: v ?? '', step: f.step ?? 'any', inputmode: 'decimal' }) as HTMLInputElement;
      i.oninput = () => {
        const n = numVal(i.value);
        if (n !== undefined && !Number.isFinite(n)) return;
        setP(d, f.path, n === undefined ? (f.required ? 0 : undefined) : n);
        changed();
      };
      wrap.append(i);
      break;
    }
    case 'color': {
      const i = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v ?? '') ? v : '#cccccc' }) as HTMLInputElement;
      i.style.height = '38px';
      i.oninput = () => { setP(d, f.path, i.value); changed(); };
      wrap.append(i);
      break;
    }
    case 'check': {
      const i = h('input', { type: 'checkbox', checked: !!v }) as HTMLInputElement;
      i.onchange = () => { setP(d, f.path, i.checked ? true : undefined); changed(); };
      return h('label', { class: 'check' }, i, f.label);
    }
    case 'select': {
      const o = opts(f);
      const s = h('select', {}, ...Object.entries(o).map(([k, l]) => h('option', { value: k, selected: k === (v ?? '') }, l))) as HTMLSelectElement;
      if (v && !(v in o)) s.append(h('option', { value: v, selected: true }, v));
      s.onchange = () => {
        setP(d, f.path, s.value === '' ? undefined : s.value);
        if (f.path === 'type' && s.value === 'card' && !d.card) d.card = { slot: 'weapon', bonus: {} };
        changed();
        if (f.path === 'type') redraw();
      };
      wrap.append(s);
      break;
    }
    case 'pair': {
      const a = Array.isArray(v) ? v : [];
      const ins = [0, 1].map((i) => h('input', { type: 'number', value: a[i] ?? '', placeholder: f.parts?.[i], title: f.parts?.[i], step: f.step ?? 'any' }) as HTMLInputElement);
      const upd = () => {
        const [x, y] = ins.map((i) => numVal(i.value));
        setP(d, f.path, x === undefined && y === undefined ? undefined : [x ?? 0, y ?? 0]);
        changed();
      };
      ins.forEach((i) => (i.oninput = upd));
      wrap.append(h('div', { class: 'pair' }, ...ins));
      if (f.parts) wrap.append(h('small', {}, `${f.parts[0]} / ${f.parts[1]}`));
      break;
    }
    case 'chips': {
      const set = new Set<string>(Array.isArray(v) ? v : []);
      const box = h('div', { class: 'chips' });
      for (const [k, l] of Object.entries(opts(f))) {
        const i = h('input', { type: 'checkbox', checked: set.has(k) }) as HTMLInputElement;
        i.onchange = () => {
          if (i.checked) set.add(k); else set.delete(k);
          setP(d, f.path, set.size ? [...set] : undefined);
          changed();
        };
        box.append(h('label', {}, i, l));
      }
      const w = h('div', { class: `field${f.wide ? ' wide' : ''}` }, h('span', {}, f.label), box);
      return w;
    }
    case 'element': {
      const a = Array.isArray(v) ? v : ['neutral', 1];
      const s = h('select', {}, ...Object.entries(elOpts()).map(([k, l]) => h('option', { value: k, selected: k === a[0] }, l))) as HTMLSelectElement;
      const lv = h('select', {}, ...[1, 2, 3, 4].map((n) => h('option', { value: n, selected: n === a[1] }, `Lv ${n}`))) as HTMLSelectElement;
      const upd = () => { setP(d, f.path, s.value === 'neutral' && lv.value === '1' ? undefined : [s.value, Number(lv.value)]); changed(); };
      s.onchange = lv.onchange = upd;
      wrap.append(h('div', { class: 'pair' }, s, lv));
      break;
    }
    case 'stats': {
      const box = h('div', { class: 'grid' });
      for (const k of STAT_KEYS) {
        const i = h('input', { type: 'number', value: v?.[k] ?? 0 }) as HTMLInputElement;
        i.oninput = () => { setP(d, `${f.path}.${k}`, Number(i.value) || 0); changed(); };
        box.append(h('label', { class: 'field' }, h('span', {}, k.toUpperCase()), i));
      }
      return h('div', {}, h('h3', { class: 'sec' }, f.label), box);
    }
    case 'bonus': {
      const list = h('div', { class: 'rows' });
      const entries: [string, number][] = Object.entries((v ?? {}) as Obj).map(([k, n]) => [k, Number(n)]);
      const commit = () => {
        const o: Obj = {};
        for (const [k, n] of entries) if (k && Number.isFinite(n) && n !== 0) o[k] = n;
        setP(d, f.path, Object.keys(o).length ? o : f.path === 'card.bonus' ? {} : undefined);
        changed();
      };
      const draw = () => {
        list.innerHTML = '';
        entries.forEach((e, idx) => {
          const s = h('select', {}, ...Object.entries(BONUS_KEYS).map(([k, l]) => h('option', { value: k, selected: k === e[0] }, l))) as HTMLSelectElement;
          if (!(e[0] in BONUS_KEYS)) s.append(h('option', { value: e[0], selected: true }, e[0]));
          const n = h('input', { type: 'number', value: e[1], step: 'any' }) as HTMLInputElement;
          s.onchange = () => { e[0] = s.value; commit(); };
          n.oninput = () => { e[1] = Number(n.value); commit(); };
          list.append(h('div', { class: 'row bonus' }, s, n, h('button', { class: 'x', title: 'ลบ', onclick: () => { entries.splice(idx, 1); commit(); draw(); } }, '✕')));
        });
        list.append(h('div', {}, h('button', { class: 'btn small', onclick: () => { entries.push([Object.keys(BONUS_KEYS).find((k) => !entries.some((x) => x[0] === k)) ?? 'atk', 1]); commit(); draw(); } }, '+ เพิ่มค่า')));
      };
      draw();
      return h('div', {}, h('h3', { class: 'sec' }, f.label), list);
    }
    case 'drops': {
      const drops: [string, number][] = Array.isArray(v) ? v.map((r: [string, number]) => [r[0], r[1]]) : [];
      const dl = h('datalist', { id: 'item-list' }, ...Object.entries(ITEMS).map(([id, it]) => h('option', { value: id }, `${it.name} · ${ITEM_TYPES[it.type] ?? it.type}`)));
      const list = h('div', { class: 'rows' });
      const commit = () => { setP(d, f.path, drops.map(([i, c]) => [i, c])); changed(); };
      const draw = () => {
        list.innerHTML = '';
        drops.forEach((r, idx) => {
          const item = h('input', { type: 'text', list: 'item-list', value: r[0], placeholder: 'รหัสไอเท็ม' }) as HTMLInputElement;
          const name = h('small', {}, itemName(r[0]));
          const pct = h('input', { type: 'number', value: +(r[1] * 100).toFixed(4), step: 'any', min: 0, max: 100 }) as HTMLInputElement;
          item.oninput = () => { r[0] = item.value.trim(); name.textContent = itemName(r[0]); commit(); };
          pct.oninput = () => { const n = Number(pct.value); if (Number.isFinite(n)) { r[1] = Math.max(0, Math.min(1, +(n / 100).toFixed(6))); commit(); } };
          list.append(
            h('div', { class: 'row' }, h('div', { class: 'field' }, item, name), h('div', { class: 'pct' }, pct), h('button', { class: 'x', title: 'ลบ', onclick: () => { drops.splice(idx, 1); commit(); draw(); } }, '✕')),
          );
        });
        list.append(h('div', {}, h('button', { class: 'btn small', onclick: () => { drops.push(['', 0.01]); draw(); } }, '+ เพิ่มของดรอป')));
      };
      draw();
      return h('div', {}, h('h3', { class: 'sec' }, `${f.label} (โอกาสเป็น %, เช่น 0.4 = 0.4%)`), dl, list);
    }
  }
  if (f.hint) wrap.append(h('small', {}, f.hint));
  return wrap;
}

window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
void start();
