import {
  CLASSES, CLASS_KEYS, CardBonus, ELEMENTS, ELEMENT_KEYS, ENDOW_SEC, MONSTERS, elementLabel, elementMult, monsterElement, SPAWNS, ClassKey, EQUIP_TYPES, ITEMS, InvItem, JOB_CHANGE, MAX_JOB_LEVEL, MAX_LEVEL, REFINE, SERVICE_FEE, SHOP, SKILLS,
  START_CLASS, STAT_KEYS, STORAGE_SLOTS, StatKey, WEAPON_SHOP, canRefine, cardFits, expToNext, itemLabel, jobExpToNext, jobTown, outfitOf,
  refineBonus, refineChance, refineFee, refineMaterial, refineSafe, skillSp, skillsOf, statCost, statRefund,
  VEND_MAX_PRICE, VEND_SKILL, npcBuyPrice, npcSellPrice, vendSlots, castTime, totalStats,
} from '../data';
import { THEMES, WARP_TOWNS, getMap, type GameMap, type Npc } from '../game/maps';
import { ARENA_MAP, CASTLE_MAP, GUILD_COST, GUILD_MAX, PVP_DAMAGE, WAR_PRIZE, durationText, warScheduleText, type GuildView, type PvpInfo, type PvpScore } from '../game/pvp';
import type { Session } from '../game/session';
import type { World3D, WorldHooks } from '../three/World3D';
import { potionPct, setAutoPotionPct, setAutoSpPotionPct, spPotionPct } from '../game/autoPrefs';
import { audioPrefs, setAudioPrefs, sfx } from '../audio/sound';
import { drawLook, itemIcon } from './icons';
import { escapeHtml } from './screens';

/** One row of อันดับผู้กล้า (server/src/MapRoom.ts onRanking). */
interface RankRow { id: string; name: string; cls: string; level: number; job: number; guild: string; online: boolean }
import { monsterPortrait } from '../three/portrait';

type WinId = 'info' | 'equip' | 'inv' | 'skill' | 'shop' | 'trade' | 'option' | 'npc' | 'storage' | 'party' | 'item' | 'refine' | 'uncard' | 'worldmap' | 'guide' | 'guild' | 'rank'
  | 'vend' | 'vshop';
/** A player shop as the server sends it (shopMine / shopList). */
type ShopView = { sid: string; open: boolean; name?: string; title?: string; text?: string; items?: { inv: string; item: string; qty: number; price: number; refine: number; cards: string[] }[] };
/** A bag row, or what we know of someone else's (trade): the + level and cards travel with it. */
type ItemRow = Pick<InvItem, 'refine' | 'cards'> & { qty?: number; equipped?: boolean };
type Slot = { t: 's' | 'i'; id: string } | null;
type InvTab = 'item' | 'equip' | 'etc';
type ChatTab = 'all' | 'chat' | 'sys';

interface TradeView {
  with: string;
  mine: { items: { inv: string; qty: number }[]; zeny: number };
  theirs: { items: { item: string; qty: number; refine?: number; cards?: string[] }[]; zeny: number };
  lockedMine: boolean; lockedTheirs: boolean; confirmedMine: boolean; confirmedTheirs: boolean;
}

/** The game server's party window data (see server/src/party.ts). */
export interface PartyView {
  id: string;
  name: string;
  leader: string;
  me: string;
  max: number;
  members: { id: string; name: string; cls: string; level: number; online: boolean; map: string; sid: string; hp: number; maxHp: number; dead: boolean }[];
}

export interface HudActions {
  scene(): World3D | undefined;
  send(type: string, msg?: unknown): void;
  exit(): void;
}

const STAT_LABEL: Record<StatKey, string> = { str: 'Str', agi: 'Agi', vit: 'Vit', int: 'Int', dex: 'Dex', luk: 'Luk' };
const STAT_HELP: Record<StatKey, string> = {
  str: 'พลังโจมตีประชิด, น้ำหนักที่แบกได้', agi: 'ความเร็วโจมตี/เดิน, หลบหลีก (Flee)', vit: 'HP, พลังป้องกัน, ฟื้น HP',
  int: 'พลังเวทย์ (Matk), SP', dex: 'ความแม่นยำ (Hit), โจมตีไกล', luk: 'คริติคอล, โจมตีเล็กน้อย',
};
const SLOT_LABEL: Record<string, string> = {
  head: 'หมวก', weapon: 'อาวุธ', armor: 'ชุด', accessory: 'เครื่องประดับ', shoes: 'รองเท้า', earring: 'หูฟัง',
};
const TYPE_LABEL: Record<string, string> = {
  ...SLOT_LABEL, consumable: 'ของใช้', loot: 'ของสะสม / วัตถุดิบ', card: 'การ์ดมอนสเตอร์',
};
const CARD_SLOT_LABEL: Record<string, string> = { weapon: 'อาวุธ', armor: 'ชุด', head: 'หมวก / หูฟัง', shoes: 'รองเท้า', accessory: 'เครื่องประดับ' };

type GuideTab = 'mon' | 'equip' | 'card';
const GUIDE_TABS: Record<GuideTab, string> = { mon: '👾 มอนสเตอร์', equip: '🛡️ อุปกรณ์', card: '🃏 การ์ด' };
const GUIDE_FILTERS: Record<GuideTab, [string, string][]> = {
  mon: [['', 'ทั้งหมด'], ['1-20', 'Lv 1-20'], ['21-40', '21-40'], ['41-60', '41-60'], ['61-80', '61-80'], ['81-99', '81-99'], ['boss', '★ บอส/MVP'], ['aggr', '⚔ ดุ']],
  equip: [['', 'ทั้งหมด'], ['weapon', 'อาวุธ'], ['armor', 'ชุด'], ['head', 'หมวก'], ['shoes', 'รองเท้า'], ['accessory', 'เครื่องประดับ'], ['earring', 'ต่างหู']],
  card: [['', 'ทั้งหมด'], ['weapon', 'อาวุธ'], ['armor', 'ชุด'], ['head', 'หมวก/หูฟัง'], ['shoes', 'รองเท้า'], ['accessory', 'เครื่องประดับ']],
};
/** The monster a card comes from (each monster has its own card). */
const dropperOf = (cardId: string) => Object.values(MONSTERS).find((m) => m.drops.some(([d]) => d === cardId));
const mapNames = new Map<string, string>();
const mapName = (id: string) => {
  if (!mapNames.has(id)) mapNames.set(id, getMap(id).name);
  return mapNames.get(id)!;
};
/** 0.004 -> "0.4%", 0.25 -> "25%" */
const pct = (r: number) => `${+(r * 100).toFixed(r < 0.01 ? 2 : r < 0.1 ? 1 : 0)}%`;
const BONUS_LABEL: Record<keyof CardBonus, string> = {
  str: 'Str', agi: 'Agi', vit: 'Vit', int: 'Int', dex: 'Dex', luk: 'Luk', atk: 'Atk', matk: 'Matk', def: 'Def', mdef: 'Mdef',
  hit: 'Hit', flee: 'Flee', crit: 'Critical', aspd: 'Aspd', maxHp: 'MaxHP', maxSp: 'MaxSP', maxHpPct: 'MaxHP', maxSpPct: 'MaxSP',
  atkPct: 'Atk', matkPct: 'Matk', pvpAtkPct: 'ตีผู้เล่น', pvpDefPct: 'ลดดาเมจจากผู้เล่น',
};
const PCT_BONUS = new Set(['aspd', 'maxHpPct', 'maxSpPct', 'atkPct', 'matkPct', 'pvpAtkPct', 'pvpDefPct']);
/** "Agi +1 · Aspd +3%" */
export const bonusText = (b: CardBonus) =>
  (Object.entries(b) as [keyof CardBonus, number][]).map(([k, v]) => `${BONUS_LABEL[k]} +${v}${PCT_BONUS.has(k) ? '%' : ''}`).join(' · ');
const DEFAULT_POS: Record<WinId, [number, number]> = {
  info: [8, 8], equip: [250, 60], inv: [-330, 170], skill: [560, 60], shop: [300, 80], trade: [320, 120],
  option: [-260, 170], npc: [-1, -1], storage: [300, 80], party: [8, 250], item: [-1, 70], refine: [300, 80], uncard: [300, 80], worldmap: [-1, 40], guide: [-1, 30], guild: [8, 250], rank: [-1, 40],
  vend: [-1, 60], vshop: [-1, 70],
};

/** The RO-style windows over the game: Basic Info, Equipment+Status, Inventory, Skill Tree, hotkeys, minimap, chat. */
export class Hud implements WorldHooks {
  private root: HTMLElement;
  private wins = new Map<WinId, HTMLElement>();
  private ac = new AbortController();
  private invTab: InvTab = 'item';
  private chatTab: ChatTab = 'all';
  private hotkeys: Slot[];
  private trade: TradeView | null = null;
  private partyView: PartyView | null = null;
  private guildView: GuildView | null = null;
  private pvpInfo: PvpInfo = { on: false };
  private pvpScores: PvpScore[] = [];
  private shopKind: 'shop' | 'weapons' = 'shop';
  /** เปิดแผงขายของ: my open shop (null = none), the shop being set up, and the other player's shop I'm looking at */
  private myShop: ShopView | null = null;
  private vendTitle = '';
  private vendDraft = new Map<string, { on: boolean; qty: number; price: number }>();
  private vshop: ShopView | null = null;
  private shopTab: 'buy' | 'sell' = 'buy';
  private storageTab: 'put' | 'take' = 'put';
  /** The item window: which bag row (or shop/storage item) it shows, and whether it's picking equipment for a card. */
  private itemView: { inv?: string; item: string; row?: ItemRow; cardMode?: boolean } | null = null;
  /** Card insert / risky refine wait for a second click on the same button. */
  private armed = '';
  private map!: GameMap;
  private miniBase?: HTMLCanvasElement;
  private raf = 0;
  private lastSig: Record<string, string> = {};
  private buffEnds = new Map<string, number>();
  private buffBlocks = new Map<string, number>();
  private cooldownEnds = new Map<string, number>();
  /** Touch screens can't drag: tap a skill/item, then tap the hotkey slot to put it there. */
  private picked: Slot = null;
  private errors = 0; // 'bad' toasts so far (the server's error replies land here)

  constructor(private s: Session, private actions: HudActions) {
    this.root = document.getElementById('hud')!;
    this.root.innerHTML = '';
    this.root.classList.remove('hidden');
    this.hotkeys = this.loadHotkeys();

    this.buildInfo();
    this.buildHotbar();
    this.buildMinimap();
    this.buildChat();
    this.root.insertAdjacentHTML('beforeend', `
      <div id="buffs" class="buffs"></div>
      <div id="targeting" class="targeting hidden"></div>
      <div id="toasts"></div>
      <div id="tooltip" class="tooltip hidden"></div>`);
    s.onChange(() => this.refresh());
    this.bindKeys();
    this.refresh();
    const loop = () => {
      this.frame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.ac.abort();
    cancelAnimationFrame(this.raf);
    this.root.innerHTML = '';
  }

  setMap(map: GameMap) {
    this.map = map;
    this.miniBase = undefined;
    this.closeWin('shop');
    this.closeWin('npc');
    this.closeWin('storage');
    this.closeWin('refine');
    this.closeWin('uncard');
    this.closeWin('worldmap');
    this.renderPvpBar();
    this.closeTrade();
    // shops belong to a map: mine closed when I left, and the one I was looking at is out of reach
    this.myShop = null;
    this.vshop = null;
    this.closeWin('vshop');
    this.lastSig.vend = '';
    // a new map starts with /auto off
    this.root.querySelector('#auto-btn')?.classList.remove('on');
    this.root.querySelector('#auto-badge')?.remove();
    const name = this.root.querySelector('#mini-name');
    if (name) name.textContent = map.name;
  }

  // ------------------------------------------------------------ window frame

  private win(id: WinId, title: string, cls = ''): HTMLElement {
    let w = this.wins.get(id);
    if (w) {
      w.querySelector('.rw-title span')!.innerHTML = title;
      w.classList.remove('hidden');
      this.bringFront(w);
      return w;
    }
    w = document.createElement('div');
    w.className = `rw ${cls}`;
    w.dataset.win = id;
    w.innerHTML = `<div class="rw-title"><span>${title}</span><button class="rw-x" title="ปิด">×</button></div><div class="rw-body"></div>`;
    this.root.appendChild(w);
    this.wins.set(id, w);
    // short (phone landscape) screens: the party window goes top, next to Basic Info, so it isn't cut off
    const short = id === 'party' && window.innerHeight < 520;
    const pos = this.loadPos()[id] ?? (short ? [215, 6] as [number, number] : DEFAULT_POS[id]);
    const place = () => {
      let [x, y] = pos;
      if (x < 0 && x !== -1) x = window.innerWidth + x;
      if (x === -1) x = (window.innerWidth - w!.offsetWidth) / 2;
      if (y === -1) y = window.innerHeight * 0.55;
      w!.style.left = `${Math.max(0, Math.min(window.innerWidth - 80, x))}px`;
      w!.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, y))}px`;
    };
    requestAnimationFrame(place);
    place();
    w.querySelector('.rw-x')!.addEventListener('click', () => {
      if (id === 'trade') return this.actions.send('tradeCancel');
      this.closeWin(id);
    });
    this.draggable(w, w.querySelector('.rw-title') as HTMLElement, id);
    w.addEventListener('pointerdown', () => this.bringFront(w!));
    this.bringFront(w);
    return w;
  }

  private body(id: WinId) {
    return this.wins.get(id)?.querySelector('.rw-body') as HTMLElement | null;
  }

  private isOpen(id: WinId) {
    const w = this.wins.get(id);
    return !!w && !w.classList.contains('hidden');
  }

  private closeWin(id: WinId) {
    this.wins.get(id)?.classList.add('hidden');
  }

  private toggle(id: WinId) {
    if (this.isOpen(id)) return this.closeWin(id);
    if (id === 'equip') this.openEquip();
    if (id === 'inv') this.openInv();
    if (id === 'skill') this.openSkills();
    if (id === 'option') this.openOption();
    if (id === 'party') this.openParty();
    if (id === 'guild') this.openGuild();
  }

  private z = 20;
  private bringFront(w: HTMLElement) {
    w.style.zIndex = String(++this.z);
  }

  private draggable(w: HTMLElement, handle: HTMLElement, id: string) {
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const sx = e.clientX - w.offsetLeft;
      const sy = e.clientY - w.offsetTop;
      handle.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        w.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, ev.clientX - sx))}px`;
        w.style.top = `${Math.max(0, Math.min(window.innerHeight - 24, ev.clientY - sy))}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        const all = this.loadPos();
        all[id] = [w.offsetLeft, w.offsetTop];
        try {
          localStorage.setItem('ml-win-pos', JSON.stringify(all));
        } catch { /* storage may be blocked */ }
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    }, { signal: this.ac.signal });
  }

  private loadPos(): Record<string, [number, number]> {
    try {
      return JSON.parse(localStorage.getItem('ml-win-pos') ?? '{}');
    } catch {
      return {};
    }
  }

  // ------------------------------------------------------------ basic info

  private buildInfo() {
    const w = this.win('info', 'Basic Info', 'info');
    const x = w.querySelector('.rw-x') as HTMLButtonElement;
    x.textContent = '⊖';
    x.title = 'ย่อหน้าต่าง';
    x.replaceWith(x.cloneNode(true));
    w.querySelector('.rw-x')!.addEventListener('click', () => this.setInfoMini(!w.classList.contains('mini')));
    this.body('info')!.innerHTML = `
      <div class="bi-mini">
        <div id="bi-m1"></div>
        <div id="bi-m2"></div>
        <button class="bi-expand" title="ขยายหน้าต่าง">︾</button>
      </div>
      <div class="bi-full">
      <div class="bi-name"><b id="bi-name"></b><span id="bi-class"></span></div>
      <div class="bi-row"><label>HP</label><div class="gauge hp"><i id="bi-hp"></i></div><span id="bi-hpt"></span></div>
      <div class="bi-row"><label>SP</label><div class="gauge sp"><i id="bi-sp"></i></div><span id="bi-spt"></span></div>
      <div class="bi-row"><label>Base Lv. <b id="bi-lv"></b></label><div class="gauge exp"><i id="bi-exp"></i></div><span id="bi-expt"></span></div>
      <div class="bi-row"><label>Job Lv. <b id="bi-jlv"></b></label><div class="gauge exp"><i id="bi-jexp"></i></div><span id="bi-jexpt"></span></div>
      <div class="bi-foot"><span>Weight : <b id="bi-w"></b></span><span>Zeny : <b id="bi-z"></b></span></div>
      <div class="bi-menu">
        <button data-open="equip" title="Alt+Q">สถานะ<i id="bi-pts" class="dot hidden"></i></button>
        <button data-open="skill" title="Alt+S">สกิล<i id="bi-spts" class="dot hidden"></i></button>
        <button data-open="inv" title="Alt+E">ไอเท็ม</button>
        <button data-open="party" title="Alt+Z">ปาร์ตี้</button>
        <button data-open="guild" title="Alt+G">กิลด์</button>
        <button data-open="map" title="Tab">แผนที่</button>
        <button data-open="sit" title="Insert">นั่ง</button>
        <button data-open="option" title="Esc">ตั้งค่า</button>
      </div>
      </div>`;
    w.querySelector('.bi-expand')!.addEventListener('click', () => this.setInfoMini(false));
    let mini = false;
    try {
      mini = localStorage.getItem('ml-info-mini') === '1';
    } catch { /* storage may be blocked */ }
    this.setInfoMini(mini);
    w.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.open!;
        if (k === 'map') this.root.querySelector('#minimap')!.classList.toggle('hidden');
        else if (k === 'sit') this.actions.scene()?.toggleSit();
        else if (k === 'auto') this.toggleAuto();
        else this.toggle(k as WinId);
      }),
    );
  }

  private setInfoMini(mini: boolean) {
    const w = this.wins.get('info');
    if (!w) return;
    w.classList.toggle('mini', mini);
    w.querySelector('.rw-title span')!.textContent = mini ? this.s.char.name : 'Basic Info';
    try {
      localStorage.setItem('ml-info-mini', mini ? '1' : '0');
    } catch { /* storage may be blocked */ }
  }

  private refreshInfo() {
    const { char: c, derived: d } = this.s;
    const set = (id: string, v: string) => {
      const el = this.root.querySelector(`#${id}`);
      if (el && el.textContent !== v) el.textContent = v;
    };
    const set2 = (el: Element, v: string) => el.textContent !== v && (el.textContent = v);
    const bar = (id: string, f: number) => ((this.root.querySelector(`#${id}`) as HTMLElement).style.width = `${Math.max(0, Math.min(100, f * 100))}%`);
    set('bi-name', c.name);
    set('bi-class', CLASSES[c.cls].name);
    bar('bi-hp', this.s.hp / d.maxHp);
    bar('bi-sp', this.s.sp / Math.max(1, d.maxSp));
    set('bi-hpt', `${this.s.hp} / ${d.maxHp}`);
    set('bi-spt', `${this.s.sp} / ${d.maxSp}`);
    const ef = c.level >= MAX_LEVEL ? 1 : c.exp / expToNext(c.level);
    const jf = c.job_level >= MAX_JOB_LEVEL ? 1 : c.job_exp / jobExpToNext(c.job_level);
    set('bi-lv', String(c.level));
    set('bi-jlv', String(c.job_level));
    bar('bi-exp', ef);
    bar('bi-jexp', jf);
    set('bi-expt', `${(ef * 100).toFixed(1)}%`);
    set('bi-jexpt', `${(jf * 100).toFixed(1)}%`);
    set('bi-m1', `Lv. ${c.level} / ${CLASSES[c.cls].name} / Lv.${c.job_level} / Exp. ${(ef * 100).toFixed(1)} %`);
    const wi = this.wins.get('info');
    if (wi?.classList.contains('mini')) set2(wi.querySelector('.rw-title span')!, c.name);
    set('bi-m2', `HP. ${this.s.hp} / ${d.maxHp} | SP. ${this.s.sp} / ${d.maxSp}`);
    const heavy = d.weight >= d.maxWeight * 0.9;
    set('bi-w', `${Math.floor(d.weight / 10)} / ${Math.floor(d.maxWeight / 10)}`);
    this.root.querySelector('#bi-w')!.classList.toggle('bad', heavy);
    set('bi-z', c.zeny.toLocaleString());
    this.root.querySelector('#bi-pts')!.classList.toggle('hidden', c.stat_points <= 0);
    this.root.querySelector('#bi-spts')!.classList.toggle('hidden', c.skill_points <= 0);
  }

  // ------------------------------------------------------------ equipment + status

  private openEquip() {
    const w = this.win('equip', 'Equipment / Status', 'equip');
    void w;
    this.lastSig.equip = '';
    this.renderEquip();
  }

  private renderEquip() {
    const b = this.body('equip');
    if (!b || !this.isOpen('equip')) return;
    const { char: c, derived: d } = this.s;
    const sig = JSON.stringify([c.str, c.agi, c.vit, c.int, c.dex, c.luk, c.stat_points, d, this.s.inv.filter((i) => i.equipped)]);
    if (this.lastSig.equip === sig) return;
    this.lastSig.equip = sig;
    const slot = (type: string) => {
      const row = this.s.equippedOf(type);
      const it = row ? ITEMS[row.item_id] : null;
      return `<div class="eq-slot" data-unequip="${row?.id ?? ''}">
        ${it ? `<img src="${itemIcon(row!.item_id)}"/>` : '<span class="ph"></span>'}
        <div><small>${SLOT_LABEL[type]}</small><b>${it ? escapeHtml(itemLabel(row!.item_id, row)) : '-'}</b></div></div>`;
    };
    const rows = STAT_KEYS.map((k) => {
      const cost = statCost(c[k]);
      const can = c.stat_points >= cost && c[k] < 99;
      // base value and the green equipment/card bonus in their own columns, so "+12" never wraps over the next row
      const plus = d.bonus?.[k] ? `+${d.bonus[k]}` : '';
      return `<div class="st-row" title="${STAT_HELP[k]}"><label>${STAT_LABEL[k]}</label><b>${c[k]}</b><em class="st-bonus">${plus}</em>
        <button class="up" data-stat="${k}" ${can ? '' : 'disabled'}>▲</button><small>${cost}</small></div>`;
    }).join('');
    const right: [string, string | number][] = [
      ['Atk', d.atk], ['Matk', d.matk], ['Hit', d.hit], ['Critical', d.crit], ['Def', d.def], ['Mdef', d.mdef], ['Flee', d.flee],
      ['Aspd', d.aspd], ['ธาตุโจมตี', elementLabel(d.atkElement)], ['ธาตุตัว', elementLabel(d.defElement)],
    ];
    b.innerHTML = `
      <div class="eq-grid">
        <div class="eq-col">${slot('head')}${slot('armor')}${slot('shoes')}</div>
        <canvas id="eq-preview" width="96" height="134"></canvas>
        <div class="eq-col">${slot('earring')}${slot('weapon')}${slot('accessory')}</div>
      </div>
      <div class="st-grid">
        <div>${rows}</div>
        <div class="st-right">${right.map(([k, v]) => `<div><label>${k}</label><b>${v}</b></div>`).join('')}
          <div class="sp-pts"><label>Status Point</label><b>${c.stat_points}</b></div></div>
      </div>`;
    drawLook(b.querySelector('#eq-preview')!, { ...c, cls: c.cls, outfit: outfitOf(this.s.equippedOf('armor')?.item_id) }, 'f', this.s.equippedOf('head')?.item_id, true, !!this.s.equippedOf('weapon'), this.s.equippedOf('earring')?.item_id);
    b.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach((btn) =>
      btn.addEventListener('click', () => this.run(() => this.s.allocate(btn.dataset.stat as StatKey))),
    );
    b.querySelectorAll<HTMLElement>('[data-unequip]').forEach((el) => {
      if (!el.dataset.unequip) return;
      const row = this.s.inv.find((i) => i.id === el.dataset.unequip);
      if (!row) return;
      const off = () => this.run(() => this.s.setEquipped(row.id, false));
      el.addEventListener('dblclick', () => !lastTouch && off());
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openItem(row.item_id, row.id);
      });
      this.tooltip(el, () => this.itemTip(row.item_id, row) + '<div class="muted">ดับเบิลคลิก = ถอด · คลิกขวา = รายละเอียด</div>');
      onTouchTap(el, () => this.openItem(row.item_id, row.id), off);
    });
  }

  // ------------------------------------------------------------ inventory

  private openInv() {
    this.win('inv', 'Inventory', 'inv');
    this.lastSig.inv = '';
    this.renderInv();
  }

  private tabOf(type: string): InvTab {
    if (type === 'consumable') return 'item';
    if ((EQUIP_TYPES as string[]).includes(type)) return 'equip';
    return 'etc';
  }

  private renderInv() {
    const b = this.body('inv');
    if (!b || !this.isOpen('inv')) return;
    const sig = JSON.stringify([this.invTab, this.s.inv, this.s.derived.weight, !!this.trade, this.s.char.zeny]);
    if (this.lastSig.inv === sig) return;
    this.lastSig.inv = sig;
    const rows = this.s.inv.filter((i) => this.tabOf(ITEMS[i.item_id]?.type) === this.invTab);
    const cells = rows
      .map((r) => `<div class="cell ${r.equipped ? 'on' : ''}" data-inv="${r.id}" draggable="true">
        <img src="${itemIcon(r.item_id)}"/>${r.qty > 1 ? `<i>${r.qty}</i>` : ''}${r.equipped ? '<em>E</em>' : ''}${r.refine ? `<u>+${r.refine}</u>` : ''}</div>`)
      .join('');
    const empty = Math.max(0, 24 - rows.length);
    b.innerHTML = `
      <div class="tabs">${(['item', 'equip', 'etc'] as InvTab[])
        .map((t) => `<button data-tab="${t}" class="${t === this.invTab ? 'on' : ''}">${{ item: 'ใช้ได้', equip: 'สวมใส่', etc: 'อื่นๆ' }[t]}</button>`)
        .join('')}</div>
      <div class="grid">${cells}${'<div class="cell"></div>'.repeat(empty)}</div>
      <div class="inv-foot">${this.trade ? '<span class="hint">ดับเบิลคลิกไอเท็มเพื่อใส่ในหน้าต่างแลกเปลี่ยน</span>' : `<span class="hint">${lastTouch ? 'แตะ = ดูรายละเอียด · แตะสองครั้ง = ใช้/สวมใส่' : 'ดับเบิลคลิก = ใช้/สวมใส่ · คลิกขวา = รายละเอียด'}</span>`}
        <span>${Math.floor(this.s.derived.weight / 10)} / ${Math.floor(this.s.derived.maxWeight / 10)}</span></div>`;
    b.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((t) =>
      t.addEventListener('click', () => {
        this.invTab = t.dataset.tab as InvTab;
        this.renderInv();
      }),
    );
    b.querySelectorAll<HTMLElement>('[data-inv]').forEach((el) => {
      const row = this.s.inv.find((i) => i.id === el.dataset.inv)!;
      el.addEventListener('dblclick', () => !lastTouch && this.activateItem(row));
      this.tooltip(el, () => this.itemTip(row.item_id, row));
      el.addEventListener('dragstart', (e) => e.dataTransfer!.setData('text/plain', `i:${row.item_id}`));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.openItem(row.item_id, row.id);
      });
      const pickable = ITEMS[row.item_id]?.type === 'consumable' && !this.trade;
      onTouchTap(el, () => (pickable ? this.pick({ t: 'i', id: row.item_id }) : !this.trade && this.openItem(row.item_id, row.id)), () => {
        this.pick(null);
        this.activateItem(row);
      });
    });
  }

  private activateItem(row: InvItem) {
    const it = ITEMS[row.item_id];
    if (this.trade) return this.addToTrade(row);
    if (it.type === 'consumable') return this.s.use(row.id);
    if (it.type === 'card') return this.openItem(row.item_id, row.id, true);
    if ((EQUIP_TYPES as string[]).includes(it.type)) this.run(() => this.s.setEquipped(row.id, !row.equipped));
  }

  /** Everything about an item, RO-style: + level, card slots, stats with the refine bonus, cards, description. */
  private itemTip(id: string, row?: ItemRow, full = false) {
    const it = ITEMS[id];
    if (!it) return '';
    const refine = row?.refine ?? 0;
    const rb = refineBonus(it, refine);
    const stat = (label: string, base: number | undefined, extra = 0, unit = '') =>
      base || extra ? `<span>${label} <b>${(base ?? 0) + extra}${unit}</b>${extra ? ` <em class="up">(+${extra})</em>` : ''}</span>` : '';
    const stats = [
      stat('Atk', it.atk, rb.atk), stat('Matk', it.matk, rb.matk), stat('Def', it.def, rb.def), stat('Aspd', it.aspd, 0, '%'),
      stat('Flee', it.flee), stat('Critical', it.crit),
      it.heal ? `<span>ฟื้น HP <b>${it.heal}</b></span>` : '', it.sp ? `<span>ฟื้น SP <b>${it.sp}</b></span>` : '',
    ].filter(Boolean).join('');
    const lines: string[] = [];
    const sub = [TYPE_LABEL[it.type] ?? it.type];
    if (it.classes) sub.push(`ใช้ได้: ${it.classes.map((c) => CLASSES[c].name).join(', ')}`);
    else if ((EQUIP_TYPES as string[]).includes(it.type)) sub.push('ทุกอาชีพ');
    if (it.gender) sub.push(it.gender === 'f' ? 'หญิงเท่านั้น' : 'ชายเท่านั้น');
    if (stats) lines.push(`<div class="it-stats">${stats}</div>`);
    if (it.element && it.type === 'weapon') lines.push(`<div class="it-bonus">โจมตีเป็นธาตุ ${elementLabel(it.element)}</div>`);
    if (it.element && it.type === 'armor') lines.push(`<div class="it-bonus">สวมแล้วตัวเป็นธาตุ ${elementLabel(it.element)}</div>`);
    if (it.endow) lines.push(`<div class="it-bonus">ใช้แล้วอาวุธเป็นธาตุ ${elementLabel(it.endow)} ${ENDOW_SEC / 60} นาที</div>`);
    if (it.card?.element) lines.push(`<div class="it-bonus">เสียบในชุด: ตัวเป็นธาตุ ${elementLabel(it.card.element)}</div>`);
    if (it.bonus) lines.push(`<div class="it-bonus">${bonusText(it.bonus)}</div>`);
    if (it.vrm) {
      const from = Object.values(MONSTERS).filter((m) => m.drops.some(([d]) => d === id)).map((m) => `${m.name}${m.mvp ? ' (MVP)' : m.boss ? ' (มินิบอส)' : ''}`);
      const what = it.type === 'armor' ? '👗 ใส่แล้วเปลี่ยนเสื้อผ้าทั้งชุด (หน้าและผมยังเป็นของเรา)' : '🎩 ใส่แล้วเห็นบนหัวตัวละคร';
      lines.push(`<div class="muted">${what} · ไม่มีขายในร้าน${from.length ? ` · ดร็อปจาก ${escapeHtml(from.join(', '))}` : ''}</div>`);
    }
    if (it.slots) {
      const cards = row?.cards ?? [];
      const slots = Array.from({ length: it.slots }, (_, i) => {
        const c = cards[i] ? ITEMS[cards[i]] : null;
        return c
          ? `<div class="it-card on"><img src="${itemIcon(cards[i])}"/><span><b>${escapeHtml(c.name)}</b><small>${bonusText(c.card?.bonus ?? {})}</small></span></div>`
          : '<div class="it-card"><span class="ph"></span><span class="muted">ช่องว่าง</span></div>';
      });
      lines.push(`<div class="it-sec">ช่องการ์ด ${cards.length} / ${it.slots}</div>${slots.join('')}`);
    }
    if (it.card) {
      // card art: the monster that drops it, rendered from its own model (item window only)
      const mon = full ? Object.keys(MONSTERS).find((k) => MONSTERS[k].drops.some(([d]) => d === id)) : undefined;
      if (mon) {
        const m = MONSTERS[mon];
        lines.push(`<div class="card-art ${m.boss ? 'boss' : ''}"><div class="card-pic" data-portrait="${mon}"><span class="spin"></span></div>
          <div class="card-name">${escapeHtml(m.name)}</div><div class="card-sub">Lv ${m.level}${m.mvp ? ' · MVP' : m.boss ? ' · มินิบอส' : ''}${m.element && m.element[0] !== 'neutral' ? ` · ${elementLabel(m.element[0])}` : ''}</div></div>`);
      }
      lines.push(`<div class="it-sec">เสียบใน: ${CARD_SLOT_LABEL[it.card.slot]}</div><div class="it-bonus">${bonusText(it.card.bonus)}</div>`);
    }
    if (canRefine(it)) {
      lines.push(`<div class="muted">ตีบวกได้ถึง +${REFINE.max} (ปลอดภัยถึง +${refineSafe(it)}) · +1 = ${it.type === 'weapon' ? `Atk +${REFINE.weaponAtk}${it.matk ? ` Matk +${REFINE.weaponAtk}` : ''}` : `Def +${REFINE.armorDef}`}</div>`);
    }
    if (it.desc) lines.push(`<div class="it-desc">${escapeHtml(it.desc)}</div>`);
    const qty = row?.qty && row.qty > 1 ? ` x${row.qty}` : '';
    return `<div class="it-tip ${full ? 'full' : ''}">
      <div class="it-head"><img src="${itemIcon(id)}"/><div><b class="${refine ? 'refined' : ''}">${escapeHtml(itemLabel(id, row))}${qty}</b>
        <small>${sub.join(' · ')}</small></div></div>
      ${lines.join('')}
      <div class="muted it-foot">น้ำหนัก ${it.weight / 10} · ขายได้ ${Math.floor(it.price / 2).toLocaleString()} z${row?.equipped ? ' · <b>สวมอยู่</b>' : ''}</div></div>`;
  }

  /** The item window (right click / tap): full details plus what you can do with it. Cards pick their equipment here. */
  private openItem(item: string, inv?: string, cardMode = false) {
    const row = inv ? this.s.inv.find((i) => i.id === inv) : undefined;
    this.itemView = { item, inv, row, cardMode: cardMode && ITEMS[item]?.type === 'card' };
    this.armed = '';
    this.win('item', 'รายละเอียดไอเท็ม', 'item');
    this.lastSig.item = '';
    this.renderItem();
  }

  private renderItem() {
    const b = this.body('item');
    const v = this.itemView;
    if (!b || !v || !this.isOpen('item')) return;
    const row = v.inv ? this.s.inv.find((i) => i.id === v.inv) : undefined;
    if (v.inv && !row) return this.closeWin('item'); // used up, sold, broken…
    const sig = JSON.stringify([v, row, this.armed, this.s.inv.filter((i) => ITEMS[i.item_id]?.slots).map((i) => [i.id, i.cards, i.equipped])]);
    if (this.lastSig.item === sig) return;
    this.lastSig.item = sig;
    const it = ITEMS[v.item];
    const btns: string[] = [];
    let extra = '';
    if (row && it.type === 'consumable') btns.push('<button class="ok" data-act="use">ใช้</button>');
    if (row && (EQUIP_TYPES as string[]).includes(it.type)) {
      btns.push(`<button class="ok" data-act="equip">${row.equipped ? 'ถอด' : 'สวมใส่'}</button>`);
    }
    if (row && it.type === 'card') {
      if (!v.cardMode) btns.push('<button class="ok" data-act="card">เสียบการ์ด</button>');
      else {
        const fits = this.s.inv.filter((r) => cardFits(it, ITEMS[r.item_id]) && (r.cards?.length ?? 0) < (ITEMS[r.item_id].slots ?? 0));
        extra = `<div class="it-sec">เลือกอุปกรณ์ที่จะเสียบ (ถอดคืนได้ที่ช่างถอดการ์ด ${SERVICE_FEE.removeCards.toLocaleString()} z)</div>
          <div class="it-pick">${fits.map((r) => `<button data-into="${r.id}" class="${this.armed === r.id ? 'armed' : ''}">
            <img src="${itemIcon(r.item_id)}"/><span>${escapeHtml(itemLabel(r.item_id, r))}${r.equipped ? ' <em>(สวมอยู่)</em>' : ''}
            <small>${this.armed === r.id ? 'กดอีกครั้งเพื่อยืนยัน' : `ช่องว่าง ${(ITEMS[r.item_id].slots ?? 0) - (r.cards?.length ?? 0)}`}</small></span></button>`).join('')
            || `<p class="hint">ไม่มี${CARD_SLOT_LABEL[it.card!.slot]}ที่มีช่องการ์ดว่างในกระเป๋า</p>`}</div>`;
      }
    }
    b.innerHTML = `${this.itemTip(v.item, row ?? v.row, true)}${extra}
      <div class="npc-btns">${btns.join('')}<button class="close">ปิด</button></div>`;
    hydratePortraits(b);
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('item'));
    b.querySelector('[data-act="use"]')?.addEventListener('click', () => row && this.s.use(row.id));
    b.querySelector('[data-act="equip"]')?.addEventListener('click', () => row && this.run(() => this.s.setEquipped(row.id, !row.equipped)));
    b.querySelector('[data-act="card"]')?.addEventListener('click', () => {
      v.cardMode = true;
      this.renderItem();
    });
    b.querySelectorAll<HTMLButtonElement>('[data-into]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const target = btn.dataset.into!;
        if (this.armed !== target) {
          this.armed = target;
          return this.renderItem();
        }
        this.armed = '';
        const into = this.s.inv.find((r) => r.id === target);
        void this.run(async () => {
          await this.s.insertCard(row!.id, target);
          sfx('levelup');
          this.toast(`เสียบ${it.name}ใส่ ${into ? itemLabel(into.item_id, into) : ''} แล้ว`, 'good');
          this.closeWin('item');
        });
      }));
  }

  // ------------------------------------------------------------ skills

  private openSkills() {
    this.win('skill', 'Skill Tree', 'skill');
    this.lastSig.skill = '';
    this.renderSkills();
  }

  /** The skill whose details are expanded in the Skill Tree (tap the name). */
  private skOpen = '';

  private renderSkills() {
    const b = this.body('skill');
    if (!b || !this.isOpen('skill')) return;
    const c = this.s.char;
    const sig = JSON.stringify([c.skills, c.skill_points, c.cls, this.skOpen]);
    if (this.lastSig.skill === sig) return;
    this.lastSig.skill = sig;
    // the job change refunds Teen skills, so only your class's own skills are listed
    const list = skillsOf(c.cls);
    const rows = list.map(([id, sk]) => {
      const lv = c.skills?.[id] ?? 0;
      const passive = sk.type === 'passive';
      return `<div class="sk-row ${lv ? '' : 'locked'}">
        <div class="sk-icon" data-skill="${id}" draggable="${!passive && lv > 0}" title="${passive ? 'สกิลติดตัว' : 'ลากไปช่องปุ่มลัด / ดับเบิลคลิกเพื่อใช้'}">${sk.icon}</div>
        <div class="sk-info" data-skinfo="${id}"><b>${escapeHtml(sk.name)} <span class="sk-more">${this.skOpen === id ? '▴' : 'ⓘ'}</span></b><small>${passive ? 'ติดตัว' : sk.type === 'vend' ? 'ทุกอาชีพ' : `Sp : ${skillSp(sk, Math.max(1, lv))}`}</small></div>
        <div class="sk-lv">Lv : ${lv} / ${sk.maxLevel}</div>
        <button class="up" data-learn="${id}" ${c.skill_points > 0 && lv < sk.maxLevel && (sk.cls === c.cls || sk.cls === 'all') ? '' : 'disabled'}>Lv Up</button>
      </div>${this.skOpen === id ? `<div class="sk-detail">${this.skillTip(id)}</div>` : ''}`;
    });
    const keep = b.querySelector('.sk-list')?.scrollTop ?? 0;
    b.innerHTML = `<div class="sk-list">${rows.join('')}</div>
      <div class="sk-foot"><span>Skill Point : <b>${c.skill_points}</b></span><span class="hint">${lastTouch ? 'แตะชื่อสกิล = ดูรายละเอียด' : 'ได้ 1 แต้มทุก Job Lv'}</span></div>`;
    b.querySelector('.sk-list')!.scrollTop = keep;
    // tapping a skill's name opens its description under the row (phones have no hover tooltip)
    b.querySelectorAll<HTMLElement>('[data-skinfo]').forEach((el) =>
      el.addEventListener('click', () => {
        const id = el.dataset.skinfo!;
        this.skOpen = this.skOpen === id ? '' : id;
        this.renderSkills();
        b.querySelector('.sk-detail')?.scrollIntoView({ block: 'nearest' });
      }),
    );
    b.querySelectorAll<HTMLButtonElement>('[data-learn]').forEach((btn) =>
      btn.addEventListener('click', () => this.run(() => this.s.learn(btn.dataset.learn!))),
    );
    b.querySelectorAll<HTMLElement>('[data-skill]').forEach((el) => {
      const id = el.dataset.skill!;
      this.tooltip(el, () => this.skillTip(id));
      el.addEventListener('dragstart', (e) => e.dataTransfer!.setData('text/plain', `s:${id}`));
      el.addEventListener('dblclick', () => !lastTouch && this.actions.scene()?.useSkill(id));
      const usable = SKILLS[id].type !== 'passive' && (this.s.char.skills?.[id] ?? 0) > 0;
      if (usable) onTouchTap(el, () => this.pick({ t: 's', id }), () => {
        this.pick(null);
        this.actions.scene()?.useSkill(id);
      });
    });
  }

  private skillTip(id: string) {
    const sk = SKILLS[id];
    const lv = this.s.char.skills?.[id] ?? 0;
    const el = sk.power ? `<div class="muted">ธาตุ: ${sk.element ? elementLabel(sk.element) : 'ตามอาวุธ'}</div>` : '';
    const dex = totalStats(this.s.char, this.s.derived).dex;
    const cast = sk.castMs
      ? `<div class="muted">เวลาร่าย ${(castTime(sk, dex) / 1000).toFixed(1)} วิ (ปกติ ${(sk.castMs / 1000).toFixed(1)} วิ, DEX ${dex} ลดไป ${Math.round((1 - castTime(sk, dex) / sk.castMs) * 100)}%)</div>`
      : '';
    return `<b>${sk.icon} ${escapeHtml(sk.name)}</b> (Lv ${lv}/${sk.maxLevel})<div>${escapeHtml(sk.desc)}</div>${el}${cast}
      ${sk.cooldown ? `<div class="muted">คูลดาวน์ ${sk.cooldown >= 60000 ? `${+(sk.cooldown / 60000).toFixed(1)} นาที` : `${(sk.cooldown / 1000).toFixed(1)} วิ`}</div>` : ''}`;
  }

  // ------------------------------------------------------------ hotkeys

  private loadHotkeys(): Slot[] {
    try {
      const saved = JSON.parse(localStorage.getItem(`ml-hotkeys-${this.s.char.id}`) ?? 'null');
      if (Array.isArray(saved) && saved.length === 9) return saved;
    } catch { /* ignore */ }
    const slots: Slot[] = Array(9).fill(null);
    const potion = this.s.inv.find((i) => ITEMS[i.item_id]?.type === 'consumable');
    if (potion) slots[8] = { t: 'i', id: potion.item_id };
    return slots;
  }

  private saveHotkeys() {
    try {
      localStorage.setItem(`ml-hotkeys-${this.s.char.id}`, JSON.stringify(this.hotkeys));
    } catch { /* ignore */ }
  }

  private buildHotbar() {
    this.root.insertAdjacentHTML('beforeend', '<div id="hotbar" class="hotbar"></div>');
    const bar = this.root.querySelector('#hotbar') as HTMLElement;
    bar.addEventListener('dragover', (e) => e.preventDefault(), { signal: this.ac.signal });
    bar.addEventListener('drop', (e) => {
      e.preventDefault();
      const el = (e.target as HTMLElement).closest('[data-hk]') as HTMLElement | null;
      const data = e.dataTransfer!.getData('text/plain');
      if (!el || !data) return;
      const [t, id] = data.split(':');
      const i = Number(el.dataset.hk);
      if (t === 'h') {
        // moving between slots
        const from = Number(id);
        [this.hotkeys[i], this.hotkeys[from]] = [this.hotkeys[from], this.hotkeys[i]];
      } else if (t === 'i' && ITEMS[id]?.type !== 'consumable') return;
      else this.hotkeys[i] = { t: t as 's' | 'i', id };
      this.saveHotkeys();
      this.lastSig.hot = '';
      this.renderHotbar();
    }, { signal: this.ac.signal });
  }

  private renderHotbar() {
    const bar = this.root.querySelector('#hotbar') as HTMLElement;
    const sig = JSON.stringify([this.hotkeys, this.s.inv, this.s.char.skills]);
    if (this.lastSig.hot === sig) return;
    this.lastSig.hot = sig;
    // skills you no longer have (Teen skills after the job change) come off the bar
    const lost = this.hotkeys.some((h) => h?.t === 's' && !this.s.char.skills?.[h.id]);
    if (lost) {
      this.hotkeys = this.hotkeys.map((h) => (h?.t === 's' && !this.s.char.skills?.[h.id] ? null : h));
      this.saveHotkeys();
    }
    bar.innerHTML = this.hotkeys
      .map((h, i) => {
        let inner = '';
        if (h?.t === 's' && SKILLS[h.id]) inner = `<span class="em">${SKILLS[h.id].icon}</span>`;
        if (h?.t === 'i' && ITEMS[h.id]) {
          const n = this.s.countItem(h.id);
          inner = `<img src="${itemIcon(h.id)}" class="${n ? '' : 'gone'}"/><i>${n}</i>`;
        }
        return `<div class="hk" data-hk="${i}" draggable="${!!h}"><b>F${i + 1}</b>${inner}<div class="cd"></div></div>`;
      })
      .join('');
    bar.querySelectorAll<HTMLElement>('[data-hk]').forEach((el) => {
      const i = Number(el.dataset.hk);
      let held = false;
      el.addEventListener('click', () => {
        if (held) return void (held = false);
        if (this.picked) return this.place(i);
        this.useHotkey(i);
      });
      const clear = () => {
        this.hotkeys[i] = null;
        this.saveHotkeys();
        this.renderHotbar();
      };
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        clear();
      });
      // iOS has no right click: hold a slot to empty it
      el.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' || !this.hotkeys[i]) return;
        const t = setTimeout(() => {
          held = true;
          clear();
          this.toast(`ล้างช่อง F${i + 1} แล้ว`);
        }, 600);
        const stop = () => clearTimeout(t);
        el.addEventListener('pointerup', stop, { once: true });
        el.addEventListener('pointercancel', stop, { once: true });
        el.addEventListener('pointerleave', stop, { once: true });
      });
      el.addEventListener('dragstart', (e) => e.dataTransfer!.setData('text/plain', `h:${i}`));
      const h = this.hotkeys[i];
      if (h) this.tooltip(el, () => (h.t === 's' ? this.skillTip(h.id) : this.itemTip(h.id)) + '<div class="muted">คลิกขวา (มือถือ: กดค้าง) เพื่อลบ</div>');
    });
  }

  private pick(slot: Slot) {
    this.picked = slot;
    this.root.querySelector('#hotbar')!.classList.toggle('picking', !!slot);
    if (!slot) return;
    const name = slot.t === 's' ? SKILLS[slot.id]?.name : ITEMS[slot.id]?.name;
    this.toast(`แตะช่อง F1-F9 เพื่อวาง ${name ?? ''} (แตะสองครั้ง = ใช้)`);
  }

  private place(i: number) {
    const slot = this.picked;
    this.picked = null;
    this.root.querySelector('#hotbar')!.classList.remove('picking');
    if (!slot) return;
    const was = this.hotkeys.findIndex((h) => h?.t === slot.t && h.id === slot.id);
    if (was >= 0) this.hotkeys[was] = null; // one slot per skill/item: placing it again moves it
    this.hotkeys[i] = slot;
    this.saveHotkeys();
    this.renderHotbar();
  }

  /** A skill the character has just learned goes into the first empty slot (once: a slot the player clears stays clear). */
  private autoSlotSkills() {
    const key = `ml-hk-seen-${this.s.char.id}`;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch { /* ignore */ }
    const fresh = Object.entries(this.s.char.skills ?? {})
      .filter(([id, lv]) => lv > 0 && SKILLS[id] && SKILLS[id].type !== 'passive' && !seen.includes(id))
      .map(([id]) => id);
    if (!fresh.length) return;
    for (const id of fresh) {
      seen.push(id);
      if (this.hotkeys.some((h) => h?.t === 's' && h.id === id)) continue;
      const free = this.hotkeys.findIndex((h, i) => !h && i < 8); // F9 is the potion's
      if (free >= 0) this.hotkeys[free] = { t: 's', id };
    }
    this.saveHotkeys();
    try {
      localStorage.setItem(key, JSON.stringify(seen));
    } catch { /* ignore */ }
  }

  private useHotkey(i: number) {
    const h = this.hotkeys[i];
    if (!h) return;
    if (h.t === 's') {
      const end = this.cooldownEnds.get(h.id) ?? 0;
      if (performance.now() < end) return;
      this.actions.scene()?.useSkill(h.id);
    } else {
      const row = this.s.findItem(h.id);
      if (row) this.s.use(row.id);
      else this.toast(`ไม่มี ${ITEMS[h.id]?.name ?? h.id}`, 'bad');
    }
  }

  /** The server confirmed a cast: show the cooldown on its hotkey. */
  skillCast(id: string) {
    const cd = SKILLS[id]?.cooldown ?? 0;
    if (cd) this.cooldownEnds.set(id, performance.now() + cd);
  }

  // ------------------------------------------------------------ minimap

  private buildMinimap() {
    this.root.insertAdjacentHTML('beforeend', `
      <div id="minimap" class="minimap">
        <div class="mini-head"><span id="mini-name"></span><span id="mini-pos"></span></div>
        <canvas id="mini-cv" width="140" height="140" title="คลิกเพื่อเปิดแผนที่ใหญ่"></canvas>
        <button id="mini-online" class="mini-online" title="ผู้เล่นออนไลน์ทุกแผนที่ (แตะเพื่อดูอันดับผู้กล้า)"><i></i>ออนไลน์ <b>–</b> คน</button>
      </div>`);
    this.root.querySelector('#mini-online')!.addEventListener('click', () => this.toggleRank());
    this.root.querySelector('#mini-cv')!.addEventListener('click', () => this.toggleWorldMap());
    this.root.insertAdjacentHTML('beforeend', `<button id="guide-btn" class="guide-btn" title="คู่มือ: มอนสเตอร์ อุปกรณ์ การ์ด (Alt+G)"><i>📖</i><span>คู่มือ</span></button>`);
    this.root.querySelector('#guide-btn')!.addEventListener('click', () => this.toggleGuide());
    // /auto sits under the guide button (moved out of Basic Info, 2026-11-13)
    this.root.insertAdjacentHTML('beforeend', `<button id="auto-btn" class="guide-btn auto-btn" title="/auto · ตีและใช้สกิลอัตโนมัติ"><i>⚔️</i><span>ออโต้</span></button>`);
    this.root.querySelector('#auto-btn')!.addEventListener('click', () => this.toggleAuto());
    // อันดับผู้กล้า under the auto button (2026-11-13)
    this.root.insertAdjacentHTML('beforeend', `<button id="rank-btn" class="guide-btn rank-btn" title="อันดับผู้กล้า: เลเวลสูงสุดไล่ลงมา (Alt+R)"><i>🏆</i><span>อันดับ</span></button>`);
    this.root.querySelector('#rank-btn')!.addEventListener('click', () => this.toggleRank());
  }

  // ------------------------------------------------------------ online count + อันดับผู้กล้า

  /** Everyone online across all maps (the server sends it on join and whenever it changes). */
  online(n: number) {
    const b = this.root.querySelector('#mini-online b');
    if (b) b.textContent = String(n);
  }

  private rankRows: RankRow[] = [];
  private rankMe = '';
  private rankAsked = 0;

  private toggleRank() {
    if (this.isOpen('rank')) return this.closeWin('rank');
    this.win('rank', '🏆 อันดับผู้กล้า', 'rank');
    this.renderRank(true);
    this.askRank();
  }

  private askRank() {
    const at = Date.now();
    this.rankAsked = at;
    this.actions.send('ranking');
    setTimeout(() => {
      if (this.rankAsked === at && this.isOpen('rank') && !this.ac.signal.aborted) {
        this.rankAsked = 0;
        this.renderRank(false, 'เซิร์ฟเวอร์ไม่ตอบ (เซิร์ฟเวอร์อาจยังเป็นเวอร์ชันเก่า: ต้อง Deploy server ใหม่บน Render)');
      }
    }, 8000);
  }

  ranking(m: { rows?: RankRow[]; me?: string; online?: number; error?: string }) {
    this.rankAsked = 0;
    if (m.error) return this.renderRank(false, m.error);
    this.rankRows = m.rows ?? [];
    this.rankMe = m.me ?? '';
    if (typeof m.online === 'number') this.online(m.online);
    this.renderRank(false);
  }

  private renderRank(loading: boolean, error = '') {
    const b = this.body('rank');
    if (!b) return;
    const medal = ['🥇', '🥈', '🥉'];
    const rows = this.rankRows;
    const mine = rows.findIndex((r) => r.id === this.rankMe);
    const list = rows.length
      ? rows.map((r, i) => `<tr class="${r.id === this.rankMe ? 'me' : ''}${i < 3 ? ` top top${i + 1}` : ''}">
          <td class="rk-n">${medal[i] ?? i + 1}</td>
          <td class="rk-name"><span class="rk-dot ${r.online ? 'on' : ''}" title="${r.online ? 'ออนไลน์อยู่' : 'ออฟไลน์'}"></span>${escapeHtml(r.name)}${r.guild ? ` <small>[${escapeHtml(r.guild)}]</small>` : ''}</td>
          <td class="rk-cls">${escapeHtml(CLASSES[r.cls as keyof typeof CLASSES]?.name ?? r.cls)}</td>
          <td class="rk-lv">${r.level}</td><td class="rk-job">${r.job}</td></tr>`).join('')
      : '';
    b.innerHTML = `<div class="rk-wrap">
        <div class="rk-head">${mine >= 0 ? `อันดับของคุณ: <b>${mine + 1}</b>` : rows.length ? 'คุณยังไม่ติด 100 อันดับแรก' : ''}
          <button class="rk-refresh" title="โหลดใหม่">⟳</button></div>
        <div class="rk-scroll">${list
          ? `<table class="rk-table"><thead><tr><th>#</th><th>ชื่อ</th><th>อาชีพ</th><th>Base</th><th>Job</th></tr></thead><tbody>${list}</tbody></table>`
          : `<div class="rk-empty">${error ? `⚠ ${escapeHtml(error)}` : loading ? 'กำลังโหลดอันดับ…' : 'ยังไม่มีข้อมูล'}</div>`}</div>
        ${error && list ? `<div class="rk-err">⚠ ${escapeHtml(error)}</div>` : ''}
        <div class="rk-foot">เรียงตาม Base Lv → EXP → Job Lv · 100 อันดับแรก · <span class="rk-dot on"></span> ออนไลน์</div>
      </div>`;
    b.querySelector('.rk-refresh')!.addEventListener('click', () => {
      this.renderRank(true);
      this.askRank();
    });
    b.querySelector('tr.me')?.scrollIntoView({ block: 'nearest' });
  }

  private drawMiniBase() {
    this.miniBase = this.drawMapBase(140);
  }

  /** The map's ground, buildings, trees, walls, portals and NPCs at `size` px. */
  private drawMapBase(size: number) {
    const m = this.map;
    const cv = document.createElement('canvas');
    cv.width = size;
    cv.height = size;
    const c = cv.getContext('2d')!;
    const s = size / Math.max(m.w, m.h);
    const colors = THEMES[m.theme].ground;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        c.fillStyle = colors[m.ground[y][x]] ?? '#555';
        c.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      }
    }
    for (const o of m.objects) {
      if (o.kind === 'building' || o.kind === 'palace') {
        c.fillStyle = o.kind === 'palace' ? '#3f7fb8' : o.style === 'desert' ? '#a8865a' : o.style === 'magic' ? '#6a4a9a' : '#7b4a36';
        c.fillRect(o.x * s, o.y * s, o.w * s, o.h * s);
      } else if (o.kind === 'tree') {
        c.fillStyle = '#2f5d2a';
        c.fillRect(o.x * s, o.y * s, s, s);
      } else if (o.kind === 'wall' || o.kind === 'tower' || o.kind === 'castle') {
        c.fillStyle = o.kind === 'castle' ? '#5b6b8c' : '#8a8478';
        const [w, h] = o.kind === 'tower' ? [o.s, o.s] : [o.w, o.h];
        if (o.kind === 'castle') {
          const wing = o.w / 2 - o.door / 2; // the north avenue runs between the wings
          c.fillRect(o.x * s, o.y * s, wing * s, h * s);
          c.fillRect((o.x + o.w - wing) * s, o.y * s, wing * s, h * s);
        } else c.fillRect(o.x * s, o.y * s, w * s, h * s);
      } else if (o.kind === 'stall') {
        c.fillStyle = '#d9c28a';
        c.fillRect(o.x * s, o.y * s, 2 * s, 2 * s);
      } else if (o.kind === 'ruinwall' || o.kind === 'cathedral') {
        c.fillStyle = o.kind === 'cathedral' ? '#9a90a8' : '#7d7a72';
        c.fillRect(o.x * s, o.y * s, o.w * s, o.h * s);
      } else if (o.kind === 'ruintower') {
        c.fillStyle = '#6e6a62';
        c.fillRect(o.x * s, o.y * s, o.s * s, o.s * s);
      } else if (o.kind === 'volcano') {
        c.fillStyle = '#3a2420';
        c.beginPath();
        c.arc(o.x * s, o.y * s, o.r * s, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#ff6a1a';
        c.beginPath();
        c.arc(o.x * s, o.y * s, o.r * s * 0.2, 0, Math.PI * 2);
        c.fill();
      } else if (o.kind === 'crystal' || o.kind === 'grave' || o.kind === 'pillar') {
        c.fillStyle = o.kind === 'crystal' ? '#7fe8ff' : '#a8a49a';
        c.fillRect(o.x * s, o.y * s, s, s);
      }
    }
    for (const p of m.portals) {
      c.fillStyle = '#ff3b3b';
      c.beginPath();
      c.arc((p.x + 0.5) * s, (p.y + 0.5) * s, 3.5, 0, Math.PI * 2);
      c.fill();
    }
    for (const n of m.npcs) {
      c.fillStyle = '#ffd54a';
      c.fillRect((n.x + 0.5) * s - 2, (n.y + 0.5) * s - 2, 4, 4);
    }
    return cv;
  }

  // ------------------------------------------------------------ guide (encyclopedia)

  /** The guide: every monster, piece of equipment and card in the game, browsable (button left of the minimap). */
  private guide = { tab: 'mon' as GuideTab, q: '', filter: '', pick: { mon: '', equip: '', card: '' } as Record<GuideTab, string>, detail: false };

  private guideResize = false;
  private toggleGuide() {
    if (!this.guideResize) {
      this.guideResize = true;
      window.addEventListener('resize', () => requestAnimationFrame(this.fitGuide), { signal: this.ac.signal });
    }
    if (this.isOpen('guide')) return this.closeWin('guide');
    this.openGuide();
  }

  private openGuide(tab?: GuideTab, pick?: string) {
    const g = this.guide;
    if (tab && tab !== g.tab) {
      g.tab = tab;
      g.q = '';
      g.filter = '';
    }
    if (pick) {
      g.pick[g.tab] = pick;
      g.detail = true;
    }
    this.win('guide', '📖 คู่มือ Music Land', 'guide');
    this.renderGuide();
    this.fitGuide();
    requestAnimationFrame(this.fitGuide); // after win() places it
  }

  /** Big window: keep it whole on screen (phones, rotating, a smaller browser window). */
  private fitGuide = () => {
    const w = this.wins.get('guide');
    if (!w || !this.isOpen('guide')) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const x = w.offsetLeft;
    const y = w.offsetTop;
    if (x + w.offsetWidth > vw - 4 || x < 0) w.style.left = `${Math.max(4, (vw - w.offsetWidth) / 2)}px`;
    if (y + w.offsetHeight > vh - 4 || y < 0) w.style.top = `${Math.max(2, vh - w.offsetHeight - 4)}px`;
  };

  /** The window's frame: tabs, search and filters. The list and the details below re-render on their own. */
  private renderGuide() {
    const b = this.body('guide');
    if (!b) return;
    const g = this.guide;
    const filters = GUIDE_FILTERS[g.tab];
    b.innerHTML = `<div class="gd-wrap ${g.detail ? 'show-detail' : ''}">
        <div class="gd-tabs">${(Object.keys(GUIDE_TABS) as GuideTab[]).map((t) =>
          `<button data-gtab="${t}" class="${g.tab === t ? 'on' : ''}">${GUIDE_TABS[t]}</button>`).join('')}</div>
        <div class="gd-main">
          <div class="gd-side">
            <input class="gd-q" type="search" placeholder="🔍 ค้นหาชื่อ…" value="${escapeHtml(g.q)}" enterkeyhint="search"/>
            <div class="gd-filters">${filters.map(([k, label]) => `<button data-gf="${k}" class="${g.filter === k ? 'on' : ''}">${label}</button>`).join('')}</div>
            <div class="gd-list"></div>
          </div>
          <div class="gd-detail"></div>
        </div>
      </div>`;
    b.querySelectorAll<HTMLButtonElement>('[data-gtab]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const t = btn.dataset.gtab as GuideTab;
        if (t === g.tab) {
          g.detail = false;
        } else {
          g.tab = t;
          g.q = '';
          g.filter = '';
          g.detail = false;
        }
        this.renderGuide();
      }));
    b.querySelectorAll<HTMLButtonElement>('[data-gf]').forEach((btn) =>
      btn.addEventListener('click', () => {
        g.filter = btn.dataset.gf!;
        b.querySelectorAll('[data-gf]').forEach((x) => x.classList.toggle('on', x === btn));
        this.renderGuideList();
      }));
    const q = b.querySelector('.gd-q') as HTMLInputElement;
    q.addEventListener('input', () => {
      g.q = q.value;
      this.renderGuideList();
    });
    this.renderGuideList();
    this.renderGuideDetail();
  }

  /** What's in the current tab after the search and the filter, in a sensible order. */
  private guideEntries(): string[] {
    const g = this.guide;
    const q = g.q.trim().toLowerCase();
    const hit = (name: string) => !q || name.toLowerCase().includes(q);
    if (g.tab === 'mon') {
      return Object.keys(MONSTERS)
        .filter((k) => hit(MONSTERS[k].name) && !MONSTERS[k].structure)
        .filter((k) => {
          const m = MONSTERS[k];
          if (g.filter === 'boss') return !!m.boss;
          if (g.filter === 'aggr') return m.aggressive;
          if (g.filter) {
            const [lo, hi] = g.filter.split('-').map(Number);
            return m.level >= lo && m.level <= hi;
          }
          return true;
        })
        .sort((a, b) => MONSTERS[a].level - MONSTERS[b].level || MONSTERS[a].name.localeCompare(MONSTERS[b].name, 'th'));
    }
    if (g.tab === 'equip') {
      const order = EQUIP_TYPES as string[];
      return Object.keys(ITEMS)
        .filter((k) => order.includes(ITEMS[k].type) && (!g.filter || ITEMS[k].type === g.filter) && hit(ITEMS[k].name))
        .sort((a, b) => {
          const x = ITEMS[a];
          const y = ITEMS[b];
          return order.indexOf(x.type) - order.indexOf(y.type) || (x.atk ?? x.def ?? 0) - (y.atk ?? y.def ?? 0) || x.price - y.price;
        });
    }
    return Object.keys(ITEMS)
      .filter((k) => ITEMS[k].card && (!g.filter || ITEMS[k].card!.slot === g.filter) && hit(ITEMS[k].name))
      .sort((a, b) => (dropperOf(a)?.level ?? 0) - (dropperOf(b)?.level ?? 0));
  }

  private renderGuideList() {
    const box = this.body('guide')?.querySelector('.gd-list') as HTMLElement | null;
    if (!box) return;
    const g = this.guide;
    const ids = this.guideEntries();
    const pick = g.pick[g.tab];
    box.innerHTML = ids.map((id) => {
      if (g.tab === 'mon') {
        const m = MONSTERS[id];
        const [el, lv] = monsterElement(m);
        return `<div class="gd-row ${pick === id ? 'on' : ''}" data-gid="${id}"><i class="gd-dot" style="background:${m.color}"></i>
          <span><b>${m.mvp ? '👑 ' : m.boss ? '★ ' : ''}${escapeHtml(m.name)}</b><small>Lv.${m.level} · <em class="el-tag" style="background:${ELEMENTS[el].color}">${elementLabel(el, lv)}</em>${m.aggressive ? ' · ⚔' : ''}</small></span></div>`;
      }
      const it = ITEMS[id];
      const sub = it.card ? `${CARD_SLOT_LABEL[it.card.slot]} · ${bonusText(it.card.bonus)}` : `${TYPE_LABEL[it.type] ?? it.type}${it.atk ? ` · Atk ${it.atk}` : ''}${it.matk ? ` · Matk ${it.matk}` : ''}${it.def ? ` · Def ${it.def}` : ''}${it.slots ? ` · [${it.slots}]` : ''}`;
      return `<div class="gd-row ${pick === id ? 'on' : ''}" data-gid="${id}"><img src="${itemIcon(id)}" alt=""/>
        <span><b>${escapeHtml(it.name)}</b><small>${escapeHtml(sub)}</small></span></div>`;
    }).join('') || '<p class="hint gd-empty">ไม่พบรายการที่ค้นหา</p>';
    const count = this.body('guide')?.querySelector('.gd-q') as HTMLInputElement | null;
    if (count) count.placeholder = `🔍 ค้นหาชื่อ… (${ids.length} รายการ)`;
    box.querySelectorAll<HTMLElement>('[data-gid]').forEach((row) =>
      row.addEventListener('click', () => {
        g.pick[g.tab] = row.dataset.gid!;
        g.detail = true;
        box.querySelectorAll('.gd-row.on').forEach((x) => x.classList.remove('on'));
        row.classList.add('on');
        this.body('guide')?.querySelector('.gd-wrap')?.classList.add('show-detail');
        this.renderGuideDetail();
      }));
  }

  private renderGuideDetail() {
    const box = this.body('guide')?.querySelector('.gd-detail') as HTMLElement | null;
    if (!box) return;
    const g = this.guide;
    const id = g.pick[g.tab];
    const back = '<button class="gd-back">‹ กลับไปรายการ</button>';
    if (!id || (g.tab === 'mon' ? !MONSTERS[id] : !ITEMS[id])) {
      box.innerHTML = `<p class="hint gd-empty">${g.tab === 'mon' ? 'เลือกมอนสเตอร์ทางซ้ายเพื่อดูค่าพลัง ที่อยู่ และของที่ดร็อป' : 'เลือกรายการทางซ้ายเพื่อดูรายละเอียด และมอนสเตอร์ที่ดร็อป'}</p>`;
      return;
    }
    box.innerHTML = back + (g.tab === 'mon' ? this.guideMonster(id) : this.guideItem(id));
    box.scrollTop = 0;
    hydratePortraits(box);
    box.querySelector('.gd-back')!.addEventListener('click', () => {
      g.detail = false;
      this.body('guide')?.querySelector('.gd-wrap')?.classList.remove('show-detail');
    });
    // jump between a monster and what it drops (and back)
    box.querySelectorAll<HTMLElement>('[data-gmon]').forEach((el) => el.addEventListener('click', () => this.openGuide('mon', el.dataset.gmon)));
    box.querySelectorAll<HTMLElement>('[data-gitem]').forEach((el) =>
      el.addEventListener('click', () => {
        const it = ITEMS[el.dataset.gitem!];
        if (it?.card) this.openGuide('card', el.dataset.gitem);
        else if (it && (EQUIP_TYPES as string[]).includes(it.type)) this.openGuide('equip', el.dataset.gitem);
        else this.openItem(el.dataset.gitem!);
      }));
  }

  private guideMonster(id: string) {
    const m = MONSTERS[id];
    const [el, elv] = monsterElement(m);
    const myLv = this.s.char.level;
    const diff = m.level - myLv;
    const where = new Map<string, number>();
    for (const s of SPAWNS) if (s.monster === id) where.set(s.map, (where.get(s.map) ?? 0) + s.count);
    const maps = [...where].map(([map, n]) => `<div class="gd-where">📍 ${escapeHtml(mapName(map))} <small>· ${n} ตัว</small></div>`).join('');
    const drops = m.drops.filter(([d]) => ITEMS[d]).map(([d, r]) => {
      const it = ITEMS[d];
      return `<div class="gd-drop ${it.card ? 'card' : ''}" data-gitem="${d}"><img src="${itemIcon(d)}" alt=""/><span>${escapeHtml(it.name)}<small>${TYPE_LABEL[it.type] ?? it.type}</small></span><b>${pct(r)}</b></div>`;
    }).join('');
    // what each element does against it
    const weak = ELEMENT_KEYS.filter((a) => a !== 'neutral' || el !== 'neutral').map((a) => [a, elementMult(a, el, elv)] as const);
    const good = weak.filter(([, x]) => x > 1).sort((a, b) => b[1] - a[1]).map(([a, x]) => `${elementLabel(a)} ${Math.round(x * 100)}%`);
    const bad = weak.filter(([, x]) => x < 1).sort((a, b) => a[1] - b[1]).map(([a, x]) => `${elementLabel(a)} ${Math.round(x * 100)}%`);
    return `<div class="gd-mon">
      <div class="card-art ${m.boss ? 'boss' : ''}"><div class="card-pic" data-portrait="${id}"><span class="spin"></span></div>
        <div class="card-name">${escapeHtml(m.name)}</div><div class="card-sub">Lv ${m.level}${m.mvp ? ' · MVP' : m.boss ? ' · มินิบอส' : ''}</div></div>
      <div class="gd-info">
        <div class="gd-title"><b>${m.mvp ? '👑 ' : m.boss ? '★ ' : ''}${escapeHtml(m.name)}</b>
          ${diff >= 8 ? '<em class="wm-hard">อันตราย</em>' : diff <= -10 ? '<em class="wm-easy">ง่าย</em>' : ''}</div>
        <div class="gd-stats">
          <span>Lv <b>${m.level}</b></span><span>HP <b>${m.hp.toLocaleString()}</b></span>
          <span>Atk <b>${m.atk}</b></span><span>Def <b>${m.def}</b></span>
          <span>Base EXP <b>${m.exp.toLocaleString()}</b></span><span>Job EXP <b>${m.jobExp.toLocaleString()}</b></span>
          <span>Zeny <b>${m.zeny[0]}–${m.zeny[1]}</b></span><span>ธาตุ <b><em class="el-tag" style="background:${ELEMENTS[el].color}">${elementLabel(el, elv)}</em></b></span>
        </div>
        <div class="muted">${m.aggressive ? '⚔ ดุ เข้ามาตีก่อน' : '😌 ไม่ตีก่อน'}${m.mvp ? ' · บอส MVP ใช้สกิลได้ คนตีแรงสุดได้ MVP' : m.boss ? ' · มินิบอส ดร็อปการ์ดง่ายกว่า' : ''}</div>
        ${good.length ? `<div class="gd-el good">ตีแรงขึ้นด้วย: ${good.join(', ')}</div>` : ''}
        ${bad.length ? `<div class="gd-el bad">ตีเบาลงด้วย: ${bad.join(', ')}</div>` : ''}
      </div>
      <div class="it-sec">พบได้ที่</div>${maps || '<div class="muted">ไม่เกิดในแผนที่ทั่วไป</div>'}
      <div class="it-sec">ของที่ดร็อป <small class="muted">· แตะเพื่อดูรายละเอียด</small></div>
      <div class="gd-drops">${drops || '<div class="muted">ไม่มี</div>'}</div>
    </div>`;
  }

  private guideItem(id: string) {
    const it = ITEMS[id];
    const from = Object.entries(MONSTERS)
      .flatMap(([k, m]) => m.drops.filter(([d]) => d === id).map(([, r]) => [k, r] as const))
      .sort((a, b) => b[1] - a[1]);
    const srcs = from.map(([k, r]) => {
      const m = MONSTERS[k];
      return `<div class="gd-drop" data-gmon="${k}"><i class="gd-dot" style="background:${m.color}"></i><span>${m.mvp ? '👑 ' : m.boss ? '★ ' : ''}${escapeHtml(m.name)}<small>Lv.${m.level}</small></span><b>${pct(r)}</b></div>`;
    }).join('');
    const shop = SHOP.includes(id) ? 'ร้านของใช้' : WEAPON_SHOP.includes(id) ? 'ร้านเครื่องดนตรี' : '';
    return `${this.itemTip(id, undefined, true)}
      <div class="it-sec">หาได้จาก</div>
      ${shop ? `<div class="gd-where">🛒 มีขายที่${shop} ราคา ${it.price.toLocaleString()} z</div>` : ''}
      <div class="gd-drops">${srcs || (shop ? '' : '<div class="muted">ยังไม่มีมอนสเตอร์ดร็อป</div>')}</div>`;
  }

  // ------------------------------------------------------------ big map

  private bigBase?: HTMLCanvasElement;
  /** monster id highlighted on the big map (tapped in the list) */
  private mapPick = '';

  private toggleWorldMap() {
    if (this.isOpen('worldmap')) return this.closeWin('worldmap');
    this.win('worldmap', `แผนที่ · ${escapeHtml(this.map.name)}`, 'worldmap');
    this.bigBase = undefined;
    this.mapPick = '';
    this.renderWorldMap();
  }

  /** Spawns on this map grouped by monster: how many, where, and what they're like. */
  private mapMonsters() {
    const by = new Map<string, { id: string; count: number; areas: [number, number, number, number][] }>();
    for (const s of SPAWNS) {
      if (s.map !== this.map.id || !MONSTERS[s.monster]) continue;
      const e = by.get(s.monster) ?? { id: s.monster, count: 0, areas: [] };
      e.count += s.count;
      e.areas.push(s.area);
      by.set(s.monster, e);
    }
    return [...by.values()].sort((a, b) => MONSTERS[a.id].level - MONSTERS[b.id].level);
  }

  private renderWorldMap() {
    const b = this.body('worldmap');
    if (!b) return;
    const list = this.mapMonsters();
    const myLv = this.s.char.level;
    const rows = list.map((e) => {
      const d = MONSTERS[e.id];
      const diff = d.level - myLv;
      const tag = diff >= 8 ? '<em class="wm-hard">อันตราย</em>' : diff <= -10 ? '<em class="wm-easy">ง่าย</em>' : '';
      const quest = this.s.char.job_quest >= 0 && d.level >= JOB_CHANGE.monsterLevel ? '<em class="wm-quest">นับเควส</em>' : '';
      const [mel, mlv] = monsterElement(d);
      return `<div class="wm-row ${this.mapPick === e.id ? 'on' : ''}" data-mon="${e.id}">
        <i style="background:${d.color}"></i>
        <span><b>${d.mvp ? '👑 ' : d.boss ? '★ ' : ''}${escapeHtml(d.name)}</b> <small>Lv.${d.level}</small>
          <em class="el-tag" style="background:${ELEMENTS[mel].color}">${elementLabel(mel, mlv)}</em>${tag}${quest}
          <small class="wm-sub">${d.aggressive ? '⚔ ดุ (เข้ามาตีก่อน)' : 'ไม่ตีก่อน'} · HP ${d.hp.toLocaleString()} · EXP ${d.exp}/${d.jobExp} · ${e.count} ตัว</small></span></div>`;
    }).join('');
    const portals = this.map.portals.map((p) => `<div class="wm-portal"><i></i>${escapeHtml(p.label)}</div>`).join('');
    b.innerHTML = `<div class="wm-wrap">
        <canvas id="wm-cv" width="320" height="320"></canvas>
        <div class="wm-side">
          <div class="wm-tip">แตะ/คลิกบนแผนที่ เพื่อเดินไปจุดนั้น</div>
          <div class="wm-sec">${this.map.safe ? 'เมือง (ไม่มีมอนสเตอร์)' : `มอนสเตอร์ในแผนที่นี้ (${list.length} ชนิด) · แตะเพื่อดูจุดเกิด`}</div>
          <div class="wm-list">${rows || '<p class="hint">ปลอดภัย ไม่มีมอนสเตอร์</p>'}</div>
          ${portals ? `<div class="wm-sec">ทางออก</div>${portals}` : ''}
          <div class="wm-legend"><span><i class="me"></i>คุณ</span><span><i class="pl"></i>ผู้เล่นอื่น</span><span><i class="np"></i>NPC</span><span><i class="pt"></i>ทางออก</span></div>
        </div>
      </div>`;
    const cv = b.querySelector<HTMLCanvasElement>('#wm-cv')!;
    cv.addEventListener('click', (e) => {
      const scene = this.actions.scene();
      if (!scene) return;
      const r = cv.getBoundingClientRect();
      const per = Math.max(this.map.w, this.map.h);
      const x = ((e.clientX - r.left) / r.width) * per;
      const y = ((e.clientY - r.top) / r.height) * per;
      if (x < 0 || y < 0 || x >= this.map.w || y >= this.map.h) return;
      if (!scene.walkToMapSpot(x, y)) this.toast('ไปจุดนั้นไม่ได้', 'bad');
    });
    b.querySelectorAll<HTMLElement>('[data-mon]').forEach((el) =>
      el.addEventListener('click', () => {
        this.mapPick = this.mapPick === el.dataset.mon ? '' : el.dataset.mon!;
        this.renderWorldMap();
      }));
    b.querySelectorAll<HTMLElement>('[data-mon]').forEach((el) => this.tooltip(el, () => {
      const d = MONSTERS[el.dataset.mon!];
      const drops = d.drops.filter(([id]) => ITEMS[id]).map(([id, r]) => `${escapeHtml(ITEMS[id].name)} ${(r * 100).toFixed(r < 0.01 ? 1 : 0)}%`).join(', ');
      return `<b>${escapeHtml(d.name)}</b> Lv.${d.level}<div class="muted">Atk ${d.atk} · Def ${d.def}</div><div>ดรอป: ${drops}</div>`;
    }));
    this.drawWorldMap();
  }

  /** Redrawn every frame while open: spawn areas, live monsters, players, you. */
  private drawWorldMap() {
    const scene = this.actions.scene();
    const cv = this.root.querySelector('#wm-cv') as HTMLCanvasElement | null;
    if (!scene || !cv || !this.isOpen('worldmap')) return;
    const size = cv.width;
    this.bigBase ??= this.drawMapBase(size);
    const c = cv.getContext('2d')!;
    const s = size / Math.max(this.map.w, this.map.h);
    c.drawImage(this.bigBase, 0, 0);
    for (const e of this.mapMonsters()) {
      const d = MONSTERS[e.id];
      const on = this.mapPick === e.id;
      if (this.mapPick && !on) continue;
      for (const [x0, y0, x1, y1] of e.areas) {
        c.fillStyle = d.color + (on ? '66' : '33');
        c.strokeStyle = d.color;
        c.lineWidth = on ? 2 : 1;
        c.fillRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
        c.strokeRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
        c.font = 'bold 10px sans-serif';
        c.textAlign = 'center';
        c.fillStyle = '#fff';
        c.strokeStyle = 'rgba(0,0,0,0.75)';
        c.lineWidth = 3;
        // all areas at once get crowded: just the level; a picked monster gets its name too
        const label = on ? `${d.name} Lv.${d.level}` : `Lv.${d.level}`;
        const lx = ((x0 + x1) / 2) * s;
        const ly = ((y0 + y1) / 2) * s + 3;
        c.strokeText(label, lx, ly);
        c.fillText(label, lx, ly);
      }
    }
    const dots = scene.minimapDots();
    for (const m of dots.monsters) {
      if (this.mapPick && m.key !== this.mapPick) continue;
      c.fillStyle = MONSTERS[m.key]?.color ?? '#f44';
      c.beginPath();
      c.arc(m.x * s, m.y * s, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#ff7bd5';
    for (const o of dots.others) c.fillRect(o.x * s - 3, o.y * s - 3, 6, 6);
    // where you're walking to (picked on this map, or anywhere): a dotted line and a red pin
    const goal = scene.walkGoal();
    if (goal) {
      c.save();
      c.strokeStyle = 'rgba(255,255,255,0.85)';
      c.lineWidth = 2;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.moveTo(dots.me.x * s, dots.me.y * s);
      c.lineTo(goal.x * s, goal.y * s);
      c.stroke();
      c.restore();
      const gx = goal.x * s, gy = goal.y * s;
      c.fillStyle = '#ff3b3b';
      c.strokeStyle = '#000';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(gx, gy);
      c.arc(gx, gy - 11, 6, Math.PI * 0.8, Math.PI * 2.2);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(gx, gy - 11, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#000';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(dots.me.x * s, dots.me.y * s, 5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
  }

  private drawMinimap() {
    const scene = this.actions.scene();
    const cv = this.root.querySelector('#mini-cv') as HTMLCanvasElement | null;
    if (!scene || !cv || !this.map || cv.offsetParent === null) return;
    if (!this.miniBase) this.drawMiniBase();
    const c = cv.getContext('2d')!;
    const s = 140 / Math.max(this.map.w, this.map.h);
    c.drawImage(this.miniBase!, 0, 0);
    const dots = scene.minimapDots();
    c.fillStyle = '#ff7bd5';
    for (const o of dots.others) c.fillRect(o.x * s - 2, o.y * s - 2, 4, 4);
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#000';
    c.beginPath();
    c.arc(dots.me.x * s, dots.me.y * s, 3.5, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    const pos = this.root.querySelector('#mini-pos')!;
    const t = `${Math.floor(dots.me.x)}, ${Math.floor(dots.me.y)}`;
    if (pos.textContent !== t) pos.textContent = t;
  }

  // ------------------------------------------------------------ chat

  private buildChat() {
    this.root.insertAdjacentHTML('beforeend', `
      <div class="chatbox">
        <div class="chat-tabs">
          <button data-ct="all" class="on">ทั้งหมด</button><button data-ct="chat">แชท</button><button data-ct="sys">ระบบ</button>
          <span class="chat-sp"></span>
          <button class="chat-fold" title="ย่อ/ขยายแชท">▾</button>
          <div class="chat-grip" title="ลากเพื่อยืด/หดหน้าต่างแชท">⇱</div>
        </div>
        <div id="chat-log" class="chat-log"></div>
        <form id="chat-form"><input id="chat-input" placeholder="Enter เพื่อพิมพ์ · /p = แชทปาร์ตี้ · /sit = นั่ง · /auto = ออโต้" maxlength="120" autocomplete="off"/></form>
      </div>`);
    this.chatResize();
    const input = this.root.querySelector('#chat-input') as HTMLInputElement;
    this.root.querySelector('#chat-form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      input.value = '';
      input.blur();
      if (!text) return;
      if (text === '/sit') return this.actions.scene()?.toggleSit();
      if (text === '/auto') return this.toggleAuto();
      this.actions.send('chat', { text });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-ct]').forEach((b) =>
      b.addEventListener('click', () => {
        this.chatTab = b.dataset.ct as ChatTab;
        this.root.querySelectorAll('[data-ct]').forEach((x) => x.classList.toggle('on', x === b));
        this.root.querySelector('#chat-log')!.setAttribute('data-tab', this.chatTab);
      }),
    );
  }

  /** Chat window size: drag the corner grip (box is anchored bottom-left), or fold the log away. */
  private chatResize() {
    const box = this.root.querySelector('.chatbox') as HTMLElement;
    const log = this.root.querySelector('#chat-log') as HTMLElement;
    const grip = box.querySelector('.chat-grip') as HTMLElement;
    const fold = box.querySelector('.chat-fold') as HTMLButtonElement;
    let size = { w: 0, h: 0, fold: false };
    try {
      size = { ...size, ...JSON.parse(localStorage.getItem('ml-chat-size') ?? '{}') };
    } catch { /* storage may be blocked */ }
    const save = () => {
      try {
        localStorage.setItem('ml-chat-size', JSON.stringify(size));
      } catch { /* storage may be blocked */ }
    };
    const apply = () => {
      if (size.w) box.style.width = `${Math.min(size.w, window.innerWidth - 16)}px`;
      if (size.h) log.style.height = `${Math.min(size.h, window.innerHeight * 0.7)}px`;
      box.classList.toggle('folded', size.fold);
      fold.textContent = size.fold ? '▴' : '▾';
    };
    apply();
    fold.addEventListener('click', () => {
      size.fold = !size.fold;
      apply();
      save();
    });
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, w0 = box.offsetWidth, h0 = log.offsetHeight;
      grip.setPointerCapture(e.pointerId);
      if (size.fold) {
        size.fold = false;
        apply();
      }
      const move = (ev: PointerEvent) => {
        size.w = Math.max(240, Math.min(window.innerWidth - 16, w0 + ev.clientX - sx));
        size.h = Math.max(50, Math.min(window.innerHeight * 0.7, h0 - (ev.clientY - sy)));
        apply();
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        save();
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    }, { signal: this.ac.signal });
  }

  private line(kind: 'chat' | 'sys' | 'good' | 'bad', html: string) {
    const log = this.root.querySelector('#chat-log');
    if (!log) return;
    const div = document.createElement('div');
    div.className = `ln ${kind}`;
    div.innerHTML = html;
    log.appendChild(div);
    while (log.children.length > 120) log.firstChild!.remove();
    log.scrollTop = log.scrollHeight;
  }

  chat(name: string, text: string) {
    this.line('chat', `<b>${escapeHtml(name)}</b> : ${escapeHtml(text)}`);
  }

  guildChat(name: string, text: string) {
    this.line('chat', `<span class="gc">[กิลด์] <b>${escapeHtml(name)}</b> : ${escapeHtml(text)}</span>`);
  }

  partyChat(name: string, text: string) {
    this.line('chat', `<span class="pt">[ปาร์ตี้] <b>${escapeHtml(name)}</b> : ${escapeHtml(text)}</span>`);
  }

  system(text: string) {
    this.line('sys', escapeHtml(text));
  }

  toast(text: string, kind?: 'good' | 'bad') {
    if (kind === 'bad') this.errors++;
    if (kind === 'bad') this.line('bad', escapeHtml(text));
    const box = this.root.querySelector('#toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = `toast ${kind ?? ''}`;
    t.textContent = text;
    box.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  reward(msg: { monster: string; exp: number; jobExp: number; zeny: number; drops: string[]; leveledUp: boolean; jobLeveledUp: boolean; shared?: number }) {
    const split = (msg.shared ?? 1) > 1 ? ` <span class="pt">(แบ่งปาร์ตี้ ${msg.shared} คน)</span>` : '';
    this.line('good', `ได้รับ Base EXP ${msg.exp} · Job EXP ${msg.jobExp} · ${msg.zeny} Zeny${split}`);
    for (const d of msg.drops) this.line('good', `ได้รับไอเท็ม <b>${escapeHtml(ITEMS[d]?.name ?? d)}</b>`);
    if (msg.leveledUp) this.toast(`Base Level Up! ได้ Status Point แล้ว (กด Alt+Q)`, 'good');
    if (msg.jobLeveledUp) this.toast(`Job Level Up! ได้ Skill Point แล้ว (กด Alt+S)`, 'good');
    setTimeout(() => sfx(msg.drops.length ? 'item' : 'coin'), 180);
  }

  // ------------------------------------------------------------ npc + shop

  talk(n: Npc) {
    if (n.id === 'guild') return this.talkGuild(n);
    if (n.id === 'pvp') return this.talkArena(n);
    if (n.id === 'gvg') return this.talkCastle(n);
    if (n.id === 'jobs') return this.talkJobs(n);
    if (n.id === 'warper') return this.talkBurapa(n);
    if (n.id === 'refiner') return this.talkRefiner(n);
    if (n.id === 'reset') return this.talkReset(n);
    if (n.id === 'uncard') return this.talkUncard(n);
    const text: Record<Npc['id'], string> = {
      shop: 'ยินดีต้อนรับจ้า~ มีน้ำดื่ม ยาฟื้นเสียง และเสื้อผ้าเท่ ๆ ให้เลือกเพียบ',
      weapons: 'เครื่องดนตรีดี ๆ ทั้งนั้น! เลือกให้เหมาะกับอาชีพของเจ้านะ',
      healer: 'เหนื่อยไหมจ๊ะ? ให้ครูช่วยพักเสียงให้ไหม (ฟื้น HP/SP เต็ม และบัพทุกสกิลในเกมระดับสูงสุดให้ นาน 5 นาที ฟรี)',
      jobs: '',
      warper: '',
      refiner: '',
      reset: '',
      uncard: '',
      guild: '',
      pvp: '',
      gvg: '',
      guide: 'ยินดีต้อนรับสู่เมืองเมโลเดีย! เดินออกประตูทิศตะวันออกไปทุ่งเมโลดี้เพื่อล่ามอนสเตอร์\n'
        + '• คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อตี\n• Alt+Q สถานะ, Alt+E ไอเท็ม, Alt+S สกิล\n• F1-F9 หรือ 1-9 ใช้ปุ่มลัด\n'
        + '• คลิกผู้เล่นอื่นเพื่อแลกเปลี่ยนไอเท็มหรือเงิน\n'
        + '• ช่างจูน ตีบวก ใกล้ไกด์: ตีบวกอาวุธ/ชุดให้แรงขึ้น · การ์ดมอนสเตอร์เสียบในอุปกรณ์ที่มีช่อง [1] [2]\n'
        + '• ช่างถอดการ์ด ข้างช่างจูน: ถอดการ์ดออกจากอุปกรณ์คืนเข้ากระเป๋า · ครูเริ่มใหม่ ฝั่งขวา: รีเซ็ตสเตตัส/สกิล\n'
        + '• คลิกขวาที่ไอเท็ม (มือถือ: แตะ) เพื่อดูรายละเอียด\n'
        + '• บูรพาข้างน้ำพุกลางเมืองและข้างทางออกทุกแผนที่: วาร์ปไปเมืองอื่น ฝากของในคลังกลางที่ทุกตัวละครใน ID ใช้ร่วมกัน และบันทึกจุดเกิด\n'
        + '• เปิดแผนที่ใหญ่แล้วแตะ/คลิกบนแผนที่ ตัวละครจะเดินไปจุดนั้นเอง\n'
        + '• นายทะเบียนกิลด์: สร้างกิลด์ · ผู้คุมลานประลอง: ไปตีกับผู้เล่น (PVP) · ทหารประกาศสงครามกิลด์: ไปปราสาทแห่งเสียง (กิลวอร์)',
    };
    const w = this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    const action = n.id === 'shop' || n.id === 'weapons' ? 'เปิดร้าน' : n.id === 'healer' ? 'รักษา' : '';
    b.innerHTML = `<div class="npc-text">${escapeHtml(text[n.id]).replace(/\n/g, '<br>')}</div>
      <div class="npc-btns">${action ? `<button class="ok">${action}</button>` : ''}${n.id === 'guide' ? '<button class="buy" data-chart>ตารางธาตุ</button>' : ''}<button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelector('[data-chart]')?.addEventListener('click', () => this.elementChart(n));
    b.querySelector('.ok')?.addEventListener('click', () => {
      this.closeWin('npc');
      if (n.id === 'healer') this.actions.send('heal');
      else this.openShop(n.id as 'shop' | 'weapons', n.name);
    });
    void w;
  }

  /** The guide's element chart: how much damage each attack element does to each defence element (level 1). */
  private elementChart(n: Npc) {
    this.win('npc', `${escapeHtml(n.name)} · ตารางธาตุ`, 'npc');
    const b = this.body('npc')!;
    const head = ELEMENT_KEYS.map((e) => `<th title="${ELEMENTS[e].name}">${ELEMENTS[e].icon}</th>`).join('');
    const rows = ELEMENT_KEYS.map((a) => `<tr><th title="${ELEMENTS[a].name}">${ELEMENTS[a].icon}</th>${ELEMENT_KEYS.map((dEl) => {
      const v = Math.round(elementMult(a, dEl, 1) * 100);
      return `<td class="${v > 100 ? 'hi' : v < 100 ? 'lo' : ''}">${v}</td>`;
    }).join('')}</tr>`).join('');
    const legend = ELEMENT_KEYS.map((e) => `${ELEMENTS[e].icon} ${ELEMENTS[e].name}`).join(' · ');
    b.innerHTML = `<div class="npc-text">ทุกการโจมตีมีธาตุ (อาวุธ สกิล หรือของที่ทาบนอาวุธ) และมอนสเตอร์ทุกตัวมีธาตุพร้อมเลเวล 1-4<br>
      แถว = ธาตุที่เราโจมตี · คอลัมน์ = ธาตุของเป้า (เลเวล 1) · ตัวเลข = % ดาเมจ<br>
      ธาตุเลเวลสูงขึ้น ตัวเลขจะห่างจาก 100 มากขึ้นอีกเลเวลละ 30%</div>
      <div class="el-chart"><table><tr><th></th>${head}</tr>${rows}</table></div>
      <div class="muted" style="font-size:11px;margin:4px 0">${legend}</div>
      <div class="npc-text">• ร้านของใช้ขายของเปลี่ยนธาตุอาวุธ (ไฟ น้ำ ดิน ลม ศักดิ์สิทธิ์) ใช้ได้ 10 นาที<br>
      • การ์ดมอนสเตอร์บางใบเสียบในชุดแล้วตัวเราเป็นธาตุนั้น โดนธาตุเดียวกันเบาลงมาก</div>
      <div class="npc-btns"><button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
  }

  /** บูรพา: paid warps to the other towns, and the storage every character of the account shares. */
  private talkBurapa(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    const zeny = this.s.char.zeny;
    const towns = WARP_TOWNS.filter((t) => t.map !== this.map.id);
    const warps = towns.map((t) => `<button class="ok" data-warp="${t.map}" ${zeny < t.cost ? 'disabled' : ''}>วาร์ปไป${escapeHtml(getMap(t.map).name)} (${t.cost.toLocaleString()} z)</button>`).join('');
    const c = this.s.char;
    const saved = c.save_map ? `${escapeHtml(getMap(c.save_map).name)} (${Math.floor(c.save_x ?? 0)}, ${Math.floor(c.save_y ?? 0)})` : `${escapeHtml(getMap('town').name)} (ค่าเริ่มต้น)`;
    b.innerHTML = `<div class="npc-text">ข้าคือบูรพา ผู้ดูแลการเดินทางและคลังกลาง อยู่กลางเมืองและข้างทางออกทุกแผนที่<br>
      • วาร์ปไปเมืองอื่นได้ทันที เสียค่าเดินทางเป็น Zeny (ตอนนี้มี ${zeny.toLocaleString()} z)<br>
      • คลังกลาง: ฝากของไว้ ตัวละครทุกตัวใน ID เดียวกันเปิดใช้ร่วมกันได้จากบูรพาทุกที่<br>
      • บันทึกจุดเกิด: หมดสติแล้วกดฟื้น จะกลับมาเกิดตรงนี้ (ฟรี)<br>
      <span class="muted">จุดเกิดตอนนี้: ${saved}</span></div>
      <div class="npc-btns job-btns">${warps}<button class="ok" data-save>บันทึกจุดเกิดที่นี่</button><button class="ok" data-storage>เปิดคลังกลาง</button><button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelectorAll<HTMLButtonElement>('[data-warp]').forEach((btn) =>
      btn.addEventListener('click', () => {
        this.closeWin('npc');
        this.actions.send('npcWarp', { to: btn.dataset.warp });
        // a server from before บูรพา existed ignores the message: say so instead of doing nothing
        const from = this.map;
        const errs = this.errors;
        setTimeout(() => {
          if (this.map === from && this.errors === errs && !this.ac.signal.aborted) {
            this.toast('เซิร์ฟเวอร์ไม่ตอบการวาร์ป (เซิร์ฟเวอร์อาจยังเป็นเวอร์ชันเก่า: กด Manual Deploy บน Render)', 'bad');
          }
        }, 8000);
      }));
    b.querySelector('[data-storage]')!.addEventListener('click', () => {
      this.closeWin('npc');
      this.openStorage();
    });
    b.querySelector<HTMLButtonElement>('[data-save]')!.addEventListener('click', async (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const me = this.actions.scene()?.minimapDots().me;
      if (!me) return;
      btn.disabled = true;
      try {
        await this.s.setSavePoint(this.map.id, Math.round(me.x * 10) / 10, Math.round(me.y * 10) / 10);
        sfx('item');
        this.toast(`บันทึกจุดเกิดที่${this.map.name}แล้ว`, 'good');
        this.line('sys', `บันทึกจุดเกิดแล้ว: ${escapeHtml(this.map.name)} (${Math.floor(me.x)}, ${Math.floor(me.y)}) หมดสติแล้วกดฟื้นจะกลับมาที่นี่`);
        this.talkBurapa(n);
      } catch (err) {
        const m = (err as Error).message;
        // the database from before save points has no set_save_point(): say what to do
        this.toast(/set_save_point|function|schema cache/i.test(m) ? 'ฐานข้อมูลยังไม่มีระบบจุดเกิด (ต้องรัน add-save-point.sql ใน Supabase)' : m, 'bad');
        btn.disabled = false;
      }
    });
  }

  /** Refiner: +1…+10 for weapons and armour (RO's refining), and how monster cards work. */
  private talkRefiner(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    b.innerHTML = `<div class="npc-text">ข้ารับจูนเครื่องดนตรีและเสื้อผ้าให้แกร่งขึ้น! (ตีบวก +1 ถึง +${REFINE.max})<br>
      • +1 ถึง +${REFINE.lowMax}: อาวุธใช้ <b>${ITEMS.tuning_ore.name}</b> ชุด หมวก หูฟัง รองเท้า ใช้ <b>${ITEMS.velvet_patch.name}</b> (ดร็อปจากมอนสเตอร์ Lv 10-30)<br>
      • +${REFINE.lowMax + 1} ขึ้นไป: อาวุธใช้ <b>${ITEMS.pure_tuning_ore.name}</b> อุปกรณ์อื่นใช้ <b>${ITEMS.gold_velvet.name}</b> (ดร็อปจากมอนสเตอร์ Lv 40-99)<br>
      • ใช้ครั้งละ 1 ชิ้น + ค่าแรง วัสดุไม่มีขายในร้าน ต้องล่าจากมอนสเตอร์ (โอกาส 5%)<br>
      • อาวุธปลอดภัยถึง +${refineSafe(ITEMS.dagger)} อุปกรณ์อื่นถึง +${refineSafe(ITEMS.band_tshirt)} เกินจากนั้นถ้าพลาด <b>ไอเท็มจะแตกหาย</b> (การ์ดที่เสียบไว้หายด้วย)<br>
      • การ์ดมอนสเตอร์: ดับเบิลคลิกการ์ดในกระเป๋า (มือถือ: แตะการ์ด) แล้วเลือกอุปกรณ์ที่มีช่องการ์ดว่าง</div>
      <div class="npc-btns"><button class="ok" data-refine>ตีบวกอุปกรณ์</button><button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelector('[data-refine]')!.addEventListener('click', () => {
      this.closeWin('npc');
      this.armed = '';
      this.win('refine', `ตีบวก · ${escapeHtml(n.name)}`, 'shop refine');
      this.lastSig.refine = '';
      this.renderRefine();
    });
  }

  private renderRefine() {
    const b = this.body('refine');
    if (!b || !this.isOpen('refine')) return;
    const sig = JSON.stringify([this.s.inv, this.s.char.zeny, this.armed]);
    if (this.lastSig.refine === sig) return;
    this.lastSig.refine = sig;
    const rows = this.s.inv.filter((r) => canRefine(ITEMS[r.item_id])).sort((a, c) => Number(c.equipped) - Number(a.equipped));
    const mats = (['tuning_ore', 'velvet_patch', 'pure_tuning_ore', 'gold_velvet'] as const)
      .map((m) => `<span class="rf-mat"><img src="${itemIcon(m)}"/>${ITEMS[m].name} <b>${this.s.countItem(m)}</b></span>`).join('');
    const list = rows.map((r) => {
      const it = ITEMS[r.item_id];
      const cur = r.refine ?? 0;
      if (cur >= REFINE.max) {
        return `<div class="shop-row" data-item="${r.item_id}" data-row="${r.id}"><img src="${itemIcon(r.item_id)}"/><span>${escapeHtml(itemLabel(r.item_id, r))}</span><b>สูงสุดแล้ว</b></div>`;
      }
      const chance = refineChance(it, cur + 1);
      const mat = refineMaterial(it, cur + 1);
      const has = this.s.countItem(mat) > 0;
      const fee = refineFee(cur + 1);
      const ok = has && this.s.char.zeny >= fee;
      const armed = this.armed === r.id;
      return `<div class="shop-row" data-item="${r.item_id}" data-row="${r.id}"><img src="${itemIcon(r.item_id)}"/>
        <span>${escapeHtml(itemLabel(r.item_id, r))}${r.equipped ? ' <em class="muted">(สวมอยู่)</em>' : ''}
          <small class="rf-info">+${cur} → +${cur + 1} · โอกาส <b class="${chance < 100 ? 'risk' : 'safe'}">${chance}%</b> · ${fee.toLocaleString()} z · ${ITEMS[mat].name} 1</small></span>
        <button class="${armed ? 'sell armed' : 'buy'}" data-go="${r.id}" ${ok ? '' : 'disabled'}>${armed ? 'ยืนยัน! เสี่ยงแตก' : 'ตีบวก'}</button></div>`;
    }).join('');
    b.innerHTML = `<div class="rf-mats">${mats}</div>
      <div class="shop-list">${list || '<p class="hint">ไม่มีอุปกรณ์ที่ตีบวกได้ (เครื่องประดับตีบวกไม่ได้)</p>'}</div>
      <div class="inv-foot"><span>Zeny <b>${this.s.char.zeny.toLocaleString()}</b></span><span class="hint">เกินระดับปลอดภัย ถ้าพลาดไอเท็มแตก</span></div>`;
    b.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
      const row = this.s.inv.find((r) => r.id === el.dataset.row);
      if (row) this.tooltip(el.querySelector('img')!, () => this.itemTip(row.item_id, row));
    });
    b.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const row = this.s.inv.find((r) => r.id === btn.dataset.go);
        if (!row) return;
        const it = ITEMS[row.item_id];
        const cur = row.refine ?? 0;
        if (refineChance(it, cur + 1) < 100 && this.armed !== row.id) {
          this.armed = row.id;
          return this.renderRefine();
        }
        this.armed = '';
        void this.run(async () => {
          const r = await this.s.refine(row.id);
          if (r.ok) {
            sfx('levelup');
            this.toast(`ตีบวกสำเร็จ! ${itemLabel(row.item_id, { refine: r.refine })}`, 'good');
            this.line('good', `ตีบวกสำเร็จ: ${escapeHtml(itemLabel(row.item_id, { refine: r.refine }))}`);
          } else {
            sfx('death');
            this.toast(`ตีบวกล้มเหลว… ${itemLabel(row.item_id, row)} แตกหายไปแล้ว`, 'bad');
            this.line('bad', `ตีบวกล้มเหลว: ${escapeHtml(itemLabel(row.item_id, row))} แตกหายไป`);
          }
        });
      }));
  }

  /** Reset NPC: Status back to 1 / Skills back to Lv 0, points refunded, SERVICE_FEE zeny each. Press twice to confirm. */
  private talkReset(n: Npc, armed = '') {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    const c = this.s.char;
    const statBack = STAT_KEYS.reduce((sum, k) => sum + statRefund(c[k]), 0);
    const skillBack = Object.values(c.skills ?? {}).reduce((sum, lv) => sum + Math.max(0, lv), 0);
    const btn = (key: 'stats' | 'skills', label: string, fee: number, can: boolean) => {
      const on = armed === key;
      return `<button class="ok ${on ? 'armed' : ''}" data-reset="${key}" ${can && c.zeny >= fee ? '' : 'disabled'}>${on ? `ยืนยัน! จ่าย ${fee.toLocaleString()} z` : `${label} (${fee.toLocaleString()} z)`}</button>`;
    };
    b.innerHTML = `<div class="npc-text">อยากเริ่มแจกแต้มใหม่หรือ? ข้าช่วยได้ แต่มีค่าบริการนะ<br>
      • <b>รีเซ็ต Status</b>: STR AGI VIT INT DEX LUK กลับเป็น 1 ทั้งหมด ได้แต้มคืน <b>${statBack}</b> แต้ม (รวมเป็น ${c.stat_points + statBack})<br>
      • <b>รีเซ็ต Skill</b>: สกิลที่เรียนไว้กลับเป็น Lv 0 ทั้งหมด ได้แต้มสกิลคืน <b>${skillBack}</b> แต้ม (รวมเป็น ${c.skill_points + skillBack}) ปุ่มลัดสกิลจะถูกล้าง<br>
      • ตอนนี้มี ${c.zeny.toLocaleString()} z</div>
      <div class="npc-btns job-btns">${btn('stats', 'รีเซ็ต Status', SERVICE_FEE.resetStats, statBack > 0)}${btn('skills', 'รีเซ็ต Skill', SERVICE_FEE.resetSkills, skillBack > 0)}<button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach((el) =>
      el.addEventListener('click', () => {
        const key = el.dataset.reset!;
        if (armed !== key) return this.talkReset(n, key);
        void this.run(async () => {
          if (key === 'stats') await this.s.resetStats();
          else await this.s.resetSkills();
          sfx('levelup');
          const what = key === 'stats' ? `Status กลับเป็น 1 ได้แต้มคืน ${statBack} แต้ม (Alt+Q)` : `Skill กลับเป็น Lv 0 ได้แต้มคืน ${skillBack} แต้ม (Alt+S)`;
          this.toast(`รีเซ็ตแล้ว! ${what}`, 'good');
          this.line('good', `รีเซ็ตแล้ว: ${escapeHtml(what)} · จ่าย ${(key === 'stats' ? SERVICE_FEE.resetStats : SERVICE_FEE.resetSkills).toLocaleString()} z`);
        }).then(() => { if (this.isOpen('npc')) this.talkReset(n); });
      }));
  }

  /** Card remover: every card in one piece of equipment goes back to the bag for SERVICE_FEE.removeCards zeny. */
  private talkUncard(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    b.innerHTML = `<div class="npc-text">เสียบการ์ดผิดชิ้นหรือ? ข้าแกะออกให้ได้ ไม่มีวันพัง<br>
      • ถอด<b>การ์ดทุกใบ</b>ในอุปกรณ์ชิ้นที่เลือก คืนเข้ากระเป๋า อุปกรณ์และค่าตีบวกยังอยู่ครบ<br>
      • ค่าบริการ <b>${SERVICE_FEE.removeCards.toLocaleString()} z</b> ต่อชิ้น</div>
      <div class="npc-btns"><button class="ok" data-uncard>เลือกอุปกรณ์</button><button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelector('[data-uncard]')!.addEventListener('click', () => {
      this.closeWin('npc');
      this.armed = '';
      this.win('uncard', `ถอดการ์ด · ${escapeHtml(n.name)}`, 'shop refine');
      this.lastSig.uncard = '';
      this.renderUncard();
    });
  }

  private renderUncard() {
    const b = this.body('uncard');
    if (!b || !this.isOpen('uncard')) return;
    const sig = JSON.stringify([this.s.inv, this.s.char.zeny, this.armed]);
    if (this.lastSig.uncard === sig) return;
    this.lastSig.uncard = sig;
    const fee = SERVICE_FEE.removeCards;
    const rows = this.s.inv.filter((r) => (r.cards?.length ?? 0) > 0).sort((a, c) => Number(c.equipped) - Number(a.equipped));
    const list = rows.map((r) => {
      const armed = this.armed === r.id;
      const names = (r.cards ?? []).map((id) => ITEMS[id]?.name ?? id).join(', ');
      return `<div class="shop-row" data-item="${r.item_id}" data-row="${r.id}"><img src="${itemIcon(r.item_id)}"/>
        <span>${escapeHtml(itemLabel(r.item_id, r))}${r.equipped ? ' <em class="muted">(สวมอยู่)</em>' : ''}
          <small class="rf-info">${escapeHtml(names)}</small></span>
        <button class="${armed ? 'sell armed' : 'buy'}" data-go="${r.id}" ${this.s.char.zeny >= fee ? '' : 'disabled'}>${armed ? 'ยืนยัน' : 'ถอดการ์ด'}</button></div>`;
    }).join('');
    b.innerHTML = `<div class="shop-list">${list || '<p class="hint">ไม่มีอุปกรณ์ที่เสียบการ์ดไว้ในกระเป๋า</p>'}</div>
      <div class="inv-foot"><span>Zeny <b>${this.s.char.zeny.toLocaleString()}</b></span><span class="hint">ค่าถอด ${fee.toLocaleString()} z ต่อชิ้น · กด 2 ครั้งเพื่อยืนยัน</span></div>`;
    b.querySelectorAll<HTMLElement>('[data-row]').forEach((el) => {
      const row = this.s.inv.find((r) => r.id === el.dataset.row);
      if (row) this.tooltip(el.querySelector('img')!, () => this.itemTip(row.item_id, row));
    });
    b.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const row = this.s.inv.find((r) => r.id === btn.dataset.go);
        if (!row) return;
        if (this.armed !== row.id) {
          this.armed = row.id;
          return this.renderUncard();
        }
        this.armed = '';
        const n = row.cards?.length ?? 0;
        void this.run(async () => {
          await this.s.removeCards(row.id);
          sfx('item');
          this.toast(`ถอดการ์ด ${n} ใบออกจาก ${itemLabel(row.item_id, { refine: row.refine })} แล้ว`, 'good');
          this.line('good', `ถอดการ์ด ${n} ใบคืนเข้ากระเป๋า · จ่าย ${fee.toLocaleString()} z`);
        });
      }));
  }

  private openStorage() {
    this.storageTab = 'put';
    this.win('storage', 'คลังกลาง (ใช้ร่วมทั้ง ID)', 'shop');
    this.lastSig.storage = '';
    const b = this.body('storage');
    if (b) b.innerHTML = '<p class="hint">กำลังเปิดคลัง…</p>';
    void this.run(() => this.s.loadStorage()).then(() => this.renderStorage());
  }

  private renderStorage() {
    const b = this.body('storage');
    if (!b || !this.isOpen('storage')) return;
    const sig = JSON.stringify([this.storageTab, this.s.inv, this.s.storage]);
    if (this.lastSig.storage === sig) return;
    this.lastSig.storage = sig;
    const row = (key: string, id: string, item: string, qty: number, btn: string, r: ItemRow) => {
      return `<div class="shop-row" ${key}="${id}" data-item="${item}"><img src="${itemIcon(item)}"/>
        <span>${escapeHtml(itemLabel(item, r))} x${qty}</span><b></b>
        <input type="number" min="1" max="${qty}" value="${qty}"/><button class="${key === 'data-put' ? 'buy' : 'sell'}">${btn}</button></div>`;
    };
    const rows = this.storageTab === 'put'
      ? this.s.inv.filter((r) => !r.equipped).map((r) => row('data-put', r.id, r.item_id, r.qty, 'ฝาก', r))
      : this.s.storage.map((r) => row('data-take', r.id, r.item_id, r.qty, 'ถอน', r));
    b.innerHTML = `<div class="tabs"><button data-sg="put" class="${this.storageTab === 'put' ? 'on' : ''}">ฝากของ</button>
      <button data-sg="take" class="${this.storageTab === 'take' ? 'on' : ''}">ถอนของ</button></div>
      <div class="shop-list">${rows.join('') || `<p class="hint">${this.storageTab === 'put' ? 'ไม่มีของในกระเป๋าที่ฝากได้ (ของที่สวมอยู่ต้องถอดก่อน)' : 'คลังยังว่างอยู่'}</p>`}</div>
      <div class="inv-foot"><span>ใช้ไป <b>${this.s.storage.length} / ${STORAGE_SLOTS}</b> ช่อง · ตัวละครทุกตัวใน ID นี้ใช้คลังเดียวกัน</span></div>`;
    b.querySelectorAll<HTMLButtonElement>('[data-sg]').forEach((t) =>
      t.addEventListener('click', () => {
        this.storageTab = t.dataset.sg as 'put' | 'take';
        this.renderStorage();
      }));
    b.querySelectorAll<HTMLElement>('.shop-row').forEach((el) => {
      const qty = () => Math.max(1, Math.floor(Number((el.querySelector('input') as HTMLInputElement).value) || 1));
      const src = el.dataset.put ? this.s.inv.find((r) => r.id === el.dataset.put) : this.s.storage.find((r) => r.id === el.dataset.take);
      this.tooltip(el.querySelector('img')!, () => this.itemTip(el.dataset.item!, src));
      el.querySelector('button')!.addEventListener('click', () => this.run(async () => {
        if (el.dataset.put) await this.s.deposit(el.dataset.put, qty());
        else await this.s.withdraw(el.dataset.take!, qty());
        sfx('item');
      }));
    });
  }

  /**
   * Job-change teacher: Base Lv 10 Teen -> quest (30 kills of Lv 10+ monsters) -> pick a class 2.
   * Each town's teacher only hands out its own classes (JOB_TOWN): drummers change in the desert town.
   */
  private talkJobs(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    const c = this.s.char;
    const q = c.job_quest ?? -1;
    const { level, monsterLevel, kills } = JOB_CHANGE;
    const here = CLASS_KEYS.filter((k) => jobTown(k) === this.map.id);
    const elsewhere = CLASS_KEYS.filter((k) => jobTown(k) !== this.map.id);
    const names = (ks: ClassKey[]) => ks.map((k) => CLASSES[k].name).join(' ');
    const away = elsewhere.length
      ? `\nถ้าอยากเป็น${names(elsewhere)} ต้องไปหาครูที่${[...new Set(elsewhere.map((k) => getMap(jobTown(k)).name))].join(' / ')} (ให้บูรพากลางเมืองวาร์ปไปได้)`
      : '';
    let text: string;
    let buttons = '';
    if (c.cls !== START_CLASS) {
      text = `เธอเป็น${CLASSES[c.cls].name}เต็มตัวแล้ว! ฝึกฝนต่อไปนะ วงดนตรีของเมืองเรารอเธออยู่`;
    } else if (c.level < level) {
      text = `ตอนนี้เธอยังเป็นวัยรุ่นอยู่ เก็บเลเวลให้ถึง Base Lv ${level} ก่อน แล้วกลับมาหาครู\n`
        + `ครูที่นี่เปลี่ยนให้เป็น ${names(here)} ได้ (ตอนนี้ Base Lv ${c.level})${away}`;
    } else if (q < 0) {
      text = `ถึง Base Lv ${level} แล้ว เก่งมาก! ก่อนจะเลือกเส้นทางดนตรี ครูขอดูฝีมือหน่อย\n`
        + `ไปกำจัดมอนสเตอร์ Lv ${monsterLevel} ขึ้นไป ${kills} ตัว (เช่น ค้างคาวและนกฮูกในป่า) แล้วกลับมาหาครู`;
      buttons = '<button class="ok" data-job="quest">รับเควส</button>';
    } else if (q < kills) {
      text = `ยังไม่ครบนะ! กำจัดมอนสเตอร์ Lv ${monsterLevel} ขึ้นไปแล้ว ${q} / ${kills} ตัว`;
    } else {
      text = `ผ่านบททดสอบแล้ว! เลือกเส้นทางดนตรีของเธอได้เลย (เลือกแล้วเปลี่ยนไม่ได้นะ)\n`
        + `เมื่อเปลี่ยนอาชีพ สเตตัสทุกอันจะกลับเป็น 1 พร้อมคืนแต้มให้กดใหม่ และสกิลวัยรุ่นจะหายไป แต้มสกิลที่เคยใช้ไปจะคืนมาให้เรียนสกิลอาชีพใหม่${away}`;
      buttons = here.map((k) => `<button class="ok" data-job="${k}" title="${escapeHtml(CLASSES[k].desc)}">${CLASSES[k].name}</button>`).join('');
    }
    b.innerHTML = `<div class="npc-text">${escapeHtml(text).replace(/\n/g, '<br>')}</div>
      <div class="npc-btns job-btns">${buttons}<button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelectorAll<HTMLButtonElement>('[data-job]').forEach((btn) =>
      btn.addEventListener('click', () => this.run(async () => {
        const job = btn.dataset.job!;
        if (job === 'quest') {
          await this.s.startJobQuest();
          this.toast(`รับเควสแล้ว: กำจัดมอนสเตอร์ Lv ${monsterLevel}+ ${kills} ตัว`, 'good');
          return this.talkJobs(n);
        }
        if (!confirm(`เปลี่ยนเป็น${CLASSES[job as ClassKey].name}เลยนะ? เปลี่ยนกลับไม่ได้`)) return;
        await this.s.changeJob(job as ClassKey);
        sfx('levelup');
        this.toast(`เปลี่ยนอาชีพเป็น${CLASSES[job as ClassKey].name}แล้ว! ได้อาวุธใหม่ติดตัว สเตตัสกลับเป็น 1 ให้กดแต้มใหม่`, 'good');
        this.talkJobs(n);
      })),
    );
  }

  private openShop(kind: 'shop' | 'weapons', name: string) {
    this.shopKind = kind;
    this.shopTab = 'buy';
    const w = this.win('shop', escapeHtml(name), 'shop');
    w.querySelector('.rw-title span')!.textContent = name;
    this.lastSig.shop = '';
    this.renderShop();
  }

  private renderShop() {
    const b = this.body('shop');
    if (!b || !this.isOpen('shop')) return;
    const sig = JSON.stringify([this.shopKind, this.shopTab, this.s.inv, this.s.char.zeny, this.s.char.skills]);
    if (this.lastSig.shop === sig) return;
    this.lastSig.shop = sig;
    const list = this.shopKind === 'shop' ? SHOP : WEAPON_SHOP;
    const rows = this.shopTab === 'buy'
      ? list.map((id) => {
        const it = ITEMS[id];
        const wrong = it.classes && !it.classes.includes(this.s.char.cls);
        // ต่อราคาเก่ง: the old price struck through next to the new one
        const price = npcBuyPrice(id, this.s.char.skills);
        const shown = price < it.price ? `<s>${it.price.toLocaleString()}</s> ${price.toLocaleString()} z` : `${price.toLocaleString()} z`;
        return `<div class="shop-row ${wrong ? 'dim' : ''}" data-item="${id}"><img src="${itemIcon(id)}"/>
          <span>${escapeHtml(it.name)}</span><b>${shown}</b>
          <input type="number" min="1" max="99" value="1"/><button class="buy" ${this.s.char.zeny < price ? 'disabled' : ''}>ซื้อ</button></div>`;
      })
      : this.s.inv.filter((r) => !r.equipped).map((r) => {
        const it = ITEMS[r.item_id];
        return `<div class="shop-row" data-sell="${r.id}" data-item="${r.item_id}"><img src="${itemIcon(r.item_id)}"/>
          <span>${escapeHtml(itemLabel(r.item_id, r))} x${r.qty}</span><b>${npcSellPrice(r.item_id, this.s.char.skills).toLocaleString()} z</b>
          <input type="number" min="1" max="${r.qty}" value="${r.qty}"/><button class="sell">ขาย</button></div>`;
      });
    b.innerHTML = `<div class="tabs"><button data-st="buy" class="${this.shopTab === 'buy' ? 'on' : ''}">ซื้อ</button>
      <button data-st="sell" class="${this.shopTab === 'sell' ? 'on' : ''}">ขาย</button></div>
      <div class="shop-list">${rows.join('') || '<p class="hint">ไม่มีของให้ขาย</p>'}</div>
      <div class="inv-foot"><span>Zeny : <b>${this.s.char.zeny.toLocaleString()}</b></span></div>`;
    b.querySelectorAll<HTMLButtonElement>('[data-st]').forEach((t) =>
      t.addEventListener('click', () => {
        this.shopTab = t.dataset.st as 'buy' | 'sell';
        this.renderShop();
      }),
    );
    b.querySelectorAll<HTMLElement>('.shop-row').forEach((row) => {
      const qty = () => Math.max(1, Math.floor(Number((row.querySelector('input') as HTMLInputElement).value) || 1));
      const src = row.dataset.sell ? this.s.inv.find((r) => r.id === row.dataset.sell) : undefined;
      this.tooltip(row.querySelector('img')!, () => this.itemTip(row.dataset.item!, src));
      // mobile: tap the icon for the item window (no hover there)
      row.querySelector('img')!.addEventListener('click', () => lastTouch && this.openItem(row.dataset.item!, src?.id));
      row.querySelector('.buy')?.addEventListener('click', () =>
        this.run(async () => {
          await this.s.buy(row.dataset.item!, qty());
          this.line('good', `ซื้อ ${escapeHtml(ITEMS[row.dataset.item!].name)} x${qty()}`);
        }));
      row.querySelector('.sell')?.addEventListener('click', () => this.run(() => this.s.sell(row.dataset.sell!, qty())));
    });
  }

  // ------------------------------------------------------------ player shops (เปิดแผงขายของ)

  /** The shop skill: set up a shop, or look after the one that's open. */
  openVend() {
    const lv = this.s.char.skills?.[VEND_SKILL] ?? 0;
    if (lv < 1) return this.toast('ต้องเรียนสกิลเปิดแผงขายของก่อน', 'bad');
    this.win('vend', '🏪 เปิดแผงขายของ', 'vend');
    this.lastSig.vend = '';
    this.renderVend();
  }

  viewShop(sid: string) {
    this.actions.send('shopView', { to: sid });
  }

  /** My own shop opened, changed or closed (from the server). */
  shopMine(m: ShopView) {
    const was = !!this.myShop;
    this.myShop = m.open ? m : null;
    if (m.text) this.system(`🏪 ${escapeHtml(m.text)}`);
    if (m.open && !was) {
      this.toast('เปิดร้านแล้ว! นั่งรอลูกค้าได้เลย', 'good');
      this.vendDraft.clear();
    }
    this.lastSig.vend = '';
    this.renderVend();
  }

  shopSold(m: { name: string; qty: number; zeny: number; buyer: string }) {
    this.line('good', `🏪 ${escapeHtml(m.buyer)} ซื้อ ${escapeHtml(m.name)} x${m.qty} ได้เงิน ${m.zeny.toLocaleString()} z`);
    this.toast(`ขาย ${m.name} x${m.qty} ได้ ${m.zeny.toLocaleString()} z`, 'good');
    sfx('coin');
  }

  shopBought(m: { name: string; qty: number; zeny: number; seller: string }) {
    this.line('good', `🛍️ ซื้อ ${escapeHtml(m.name)} x${m.qty} จากร้านของ ${escapeHtml(m.seller)} จ่าย ${m.zeny.toLocaleString()} z`);
    sfx('coin');
  }

  /** Another player's shop: what's for sale (from the server). */
  shopList(m: ShopView) {
    if (!m.open || !m.items?.length) {
      if (this.vshop?.sid === m.sid || !this.isOpen('vshop')) this.toast('ร้านนี้ปิดไปแล้ว', 'bad');
      this.vshop = null;
      return this.closeWin('vshop');
    }
    this.vshop = m;
    this.win('vshop', `🏪 ${escapeHtml(m.title ?? '')}`, 'vend');
    this.renderVShop();
  }

  private renderVShop() {
    const b = this.body('vshop');
    const v = this.vshop;
    if (!b || !v?.items) return;
    const rows = v.items.map((it) => `<div class="vend-row buy" data-inv="${it.inv}" data-item="${it.item}"><img src="${itemIcon(it.item)}"/>
        <span>${escapeHtml(itemLabel(it.item, it))}${it.cards.length ? ` <small>[${it.cards.length} การ์ด]</small>` : ''}<small>เหลือ ${it.qty}</small></span>
        <b>${it.price.toLocaleString()} z</b>
        <input type="number" min="1" max="${it.qty}" value="1" ${it.qty < 2 ? 'disabled' : ''}/>
        <button class="buy" ${this.s.char.zeny < it.price ? 'disabled' : ''}>ซื้อ</button></div>`);
    b.innerHTML = `<div class="vend-head">ร้านของ <b>${escapeHtml(v.name ?? '')}</b></div>
      <div class="shop-list">${rows.join('')}</div>
      <div class="inv-foot"><span>Zeny ของคุณ : <b>${this.s.char.zeny.toLocaleString()}</b></span></div>`;
    b.querySelectorAll<HTMLElement>('.vend-row').forEach((row) => {
      const it = v.items!.find((x) => x.inv === row.dataset.inv)!;
      const img = row.querySelector('img')!;
      this.tooltip(img, () => this.itemTip(it.item, it));
      img.addEventListener('click', () => lastTouch && this.openItem(it.item));
      row.querySelector('.buy')!.addEventListener('click', () => {
        const qty = Math.max(1, Math.min(it.qty, Math.floor(Number((row.querySelector('input') as HTMLInputElement).value) || 1)));
        const total = it.price * qty;
        if (total > this.s.char.zeny) return this.toast('เงินไม่พอ', 'bad');
        if (!confirm(`ซื้อ ${itemLabel(it.item, it)} x${qty}\nรวม ${total.toLocaleString()} z ?`)) return;
        this.actions.send('shopBuy', { to: v.sid, inv: it.inv, qty });
      });
    });
  }

  private renderVend() {
    const b = this.body('vend');
    if (!b || !this.isOpen('vend')) return;
    const lv = this.s.char.skills?.[VEND_SKILL] ?? 0;
    const max = vendSlots(lv);
    const shop = this.myShop;
    const sig = JSON.stringify([shop, this.s.inv, lv]);
    if (this.lastSig.vend === sig) return;
    this.lastSig.vend = sig;
    if (shop?.items) {
      // the shop is open: what's left, and a button to close it
      const rows = shop.items.map((it) => `<div class="vend-row mine" data-item="${it.item}"><img src="${itemIcon(it.item)}"/>
          <span>${escapeHtml(itemLabel(it.item, it))}</span><small>x${it.qty}</small><b>${it.price.toLocaleString()} z</b></div>`);
      b.innerHTML = `<div class="vend-head">ร้าน <b>${escapeHtml(shop.title ?? '')}</b> กำลังเปิดอยู่</div>
        <div class="shop-list">${rows.join('')}</div>
        <p class="hint">ของที่ขายได้จะหายจากกระเป๋า เงินเข้าทันที · เดิน โจมตี ใช้สกิล หรือกดนั่งอีกครั้ง = ปิดร้าน</p>
        <div class="npc-btns"><button id="vend-close" class="close">ปิดร้าน</button></div>`;
      b.querySelectorAll<HTMLElement>('.vend-row img').forEach((img) => {
        const it = shop.items!.find((x) => x.item === (img.parentElement as HTMLElement).dataset.item)!;
        this.tooltip(img, () => this.itemTip(it.item, it));
      });
      b.querySelector('#vend-close')!.addEventListener('click', () => this.actions.send('shopClose'));
      return;
    }
    // setting up: tick what to sell, how many, and the price of one
    const bag = this.s.inv.filter((r) => !r.equipped);
    for (const id of [...this.vendDraft.keys()]) if (!bag.some((r) => r.id === id)) this.vendDraft.delete(id);
    const draft = (r: InvItem) => this.vendDraft.get(r.id) ?? { on: false, qty: r.qty, price: ITEMS[r.item_id]?.price ?? 1 };
    const picked = () => [...this.vendDraft.values()].filter((d) => d.on).length;
    const rows = bag.map((r) => {
      const d = draft(r);
      return `<div class="vend-row set ${d.on ? 'on' : ''}" data-inv="${r.id}" data-item="${r.item_id}">
        <input type="checkbox" class="pick" ${d.on ? 'checked' : ''}/><img src="${itemIcon(r.item_id)}"/>
        <span>${escapeHtml(itemLabel(r.item_id, r))}<small>มี ${r.qty}</small></span>
        <input type="number" class="qty" min="1" max="${r.qty}" value="${Math.min(d.qty, r.qty)}" ${r.qty < 2 ? 'disabled' : ''} title="จำนวนที่ขาย"/>
        <input type="number" class="price" min="1" max="${VEND_MAX_PRICE}" value="${d.price}" title="ราคาต่อชิ้น (z)"/></div>`;
    });
    b.innerHTML = `<label class="vend-title">ชื่อร้าน <input id="vend-name" maxlength="30" placeholder="ร้านของ ${escapeHtml(this.s.char.name)}" value="${escapeHtml(this.vendTitle)}"/></label>
      <div class="vend-cols"><span></span><span>ไอเท็ม</span><span>จำนวน</span><span>ราคา/ชิ้น</span></div>
      <div class="shop-list">${rows.join('') || '<p class="hint">ไม่มีของในกระเป๋าที่ขายได้ (ของที่ใส่อยู่ต้องถอดก่อน)</p>'}</div>
      <div class="inv-foot"><span>เลือกแล้ว <b id="vend-count">${picked()}</b> / ${max} ชนิด (สกิล Lv ${lv})</span></div>
      <p class="hint">เปิดได้เฉพาะในเมือง · ระหว่างเปิดร้านตัวละครจะนั่งอยู่กับที่</p>
      <div class="npc-btns"><button id="vend-open" class="ok">เปิดร้าน</button><button id="vend-cancel" class="close">ยกเลิก</button></div>`;
    b.querySelector<HTMLInputElement>('#vend-name')!.addEventListener('input', (e) => (this.vendTitle = (e.target as HTMLInputElement).value));
    b.querySelectorAll<HTMLElement>('.vend-row').forEach((row) => {
      const r = bag.find((x) => x.id === row.dataset.inv)!;
      const save = () => {
        const d = {
          on: (row.querySelector('.pick') as HTMLInputElement).checked,
          qty: Math.max(1, Math.min(r.qty, Math.floor(Number((row.querySelector('.qty') as HTMLInputElement).value) || 1))),
          price: Math.max(1, Math.min(VEND_MAX_PRICE, Math.floor(Number((row.querySelector('.price') as HTMLInputElement).value) || 1))),
        };
        if (d.on && !this.vendDraft.get(r.id)?.on && picked() >= max) {
          (row.querySelector('.pick') as HTMLInputElement).checked = false;
          return this.toast(`สกิล Lv ${lv} วางของได้สูงสุด ${max} ชนิด`, 'bad');
        }
        this.vendDraft.set(r.id, d);
        row.classList.toggle('on', d.on);
        b.querySelector('#vend-count')!.textContent = String(picked());
      };
      row.querySelectorAll('input').forEach((i) => i.addEventListener('change', save));
      // typing a price or amount ticks the row
      row.querySelectorAll<HTMLInputElement>('.qty, .price').forEach((i) => i.addEventListener('input', () => {
        const pick = row.querySelector('.pick') as HTMLInputElement;
        if (!pick.checked && picked() < max) pick.checked = true;
        save();
      }));
      const img = row.querySelector('img')!;
      this.tooltip(img, () => this.itemTip(r.item_id, r));
    });
    b.querySelector('#vend-open')!.addEventListener('click', () => {
      const items = [...this.vendDraft.entries()].filter(([, d]) => d.on).map(([inv, d]) => ({ inv, qty: d.qty, price: d.price }));
      if (!items.length) return this.toast('ติ๊กเลือกของที่จะขายก่อน', 'bad');
      this.actions.send('shopOpen', { title: this.vendTitle.trim(), items });
    });
    b.querySelector('#vend-cancel')!.addEventListener('click', () => this.closeWin('vend'));
  }

  // ------------------------------------------------------------ trading

  playerMenu(sessionId: string, name: string, x: number, y: number) {
    this.root.querySelector('.ctx')?.remove();
    const m = document.createElement('div');
    m.className = 'ctx';
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    const inParty = this.partyView?.members.some((x) => x.sid === sessionId);
    const canInvite = !inParty && (!this.partyView || this.partyView.leader === this.partyView.me);
    const g = this.guildView;
    const canGuild = !!g && g.leader === g.me && g.members.length < g.max && !g.members.some((x) => x.name === name);
    m.innerHTML = `<b>${escapeHtml(name)}</b><button data-a="trade">ขอแลกเปลี่ยน</button>`
      + `${canInvite ? '<button data-a="party">ชวนเข้าปาร์ตี้</button>' : ''}${canGuild ? '<button data-a="guild">ชวนเข้ากิลด์</button>' : ''}<button data-a="close">ยกเลิก</button>`;
    this.root.appendChild(m);
    m.querySelector('[data-a=guild]')?.addEventListener('click', () => {
      this.actions.send('guildInvite', { to: sessionId });
      m.remove();
    });
    m.querySelector('[data-a=party]')?.addEventListener('click', () => {
      this.actions.send('partyInvite', { to: sessionId });
      m.remove();
    });
    m.querySelector('[data-a=trade]')!.addEventListener('click', () => {
      this.actions.send('tradeRequest', { to: sessionId });
      m.remove();
    });
    m.querySelector('[data-a=close]')!.addEventListener('click', () => m.remove());
    setTimeout(() => window.addEventListener('pointerdown', (e) => {
      if (!m.contains(e.target as Node)) m.remove();
    }, { once: true, signal: this.ac.signal }), 0);
  }

  tradeInvite(msg: { from: string; name: string; level: number }) {
    this.root.querySelector('.invite')?.remove();
    const d = document.createElement('div');
    d.className = 'rw invite';
    d.innerHTML = `<div class="rw-title"><span>คำขอแลกเปลี่ยน</span></div><div class="rw-body">
      <p><b>${escapeHtml(msg.name)}</b> (Lv ${msg.level}) ต้องการแลกเปลี่ยนกับคุณ</p>
      <div class="npc-btns"><button class="ok">ตกลง</button><button class="close">ปฏิเสธ</button></div></div>`;
    this.root.appendChild(d);
    this.bringFront(d);
    const answer = (accept: boolean) => {
      this.actions.send('tradeRespond', { accept });
      d.remove();
    };
    d.querySelector('.ok')!.addEventListener('click', () => answer(true));
    d.querySelector('.close')!.addEventListener('click', () => answer(false));
  }

  tradeState(t: TradeView) {
    this.trade = t;
    this.root.querySelector('.invite')?.remove();
    const w = this.win('trade', 'แลกเปลี่ยน', 'trade');
    void w;
    if (!this.isOpen('inv')) this.openInv();
    this.lastSig.inv = '';
    this.renderInv();
    const b = this.body('trade')!;
    const grid = (items: { id: string; qty: number; inv?: string; row?: ItemRow }[]) =>
      items.map((i, n) => `<div class="cell" ${i.inv ? `data-remove="${i.inv}"` : `data-their="${n}"`} data-item="${i.id}"><img src="${itemIcon(i.id)}"/>${i.qty > 1 ? `<i>${i.qty}</i>` : ''}${i.row?.refine ? `<u>+${i.row.refine}</u>` : ''}</div>`).join('')
      + '<div class="cell"></div>'.repeat(Math.max(0, 5 - items.length));
    const mine = t.mine.items.map((o) => {
      const r = this.s.inv.find((x) => x.id === o.inv);
      return { id: r?.item_id ?? '', qty: o.qty, inv: o.inv, row: r };
    });
    const theirs = t.theirs.items.map((o) => ({ id: o.item, qty: o.qty, row: o as ItemRow }));
    const st = (locked: boolean, ok: boolean) => (ok ? '<em class="ok">ยืนยันแล้ว</em>' : locked ? '<em class="lock">OK</em>' : '<em>กำลังเลือก…</em>');
    b.innerHTML = `
      <div class="tr-side ${t.lockedTheirs ? 'locked' : ''}"><div class="tr-head"><b>${escapeHtml(t.with)}</b>${st(t.lockedTheirs, t.confirmedTheirs)}</div>
        <div class="grid small">${grid(theirs)}</div><div class="tr-zeny">Zeny : <b>${t.theirs.zeny.toLocaleString()}</b></div></div>
      <div class="tr-side mine ${t.lockedMine ? 'locked' : ''}"><div class="tr-head"><b>${escapeHtml(this.s.char.name)}</b>${st(t.lockedMine, t.confirmedMine)}</div>
        <div class="grid small">${grid(mine)}</div>
        <div class="tr-zeny">Zeny : <input id="tr-z" type="number" min="0" max="${this.s.char.zeny}" value="${t.mine.zeny}" ${t.lockedMine ? 'disabled' : ''}/></div></div>
      <div class="npc-btns">
        <button id="tr-lock" ${t.lockedMine ? 'disabled' : ''}>OK</button>
        <button id="tr-go" class="ok" ${t.lockedMine && t.lockedTheirs && !t.confirmedMine ? '' : 'disabled'}>แลกเลย</button>
        <button id="tr-cancel" class="close">ยกเลิก</button>
      </div>
      <p class="hint">ดับเบิลคลิกไอเท็มในกระเป๋าเพื่อเพิ่ม · คลิกไอเท็มของคุณเพื่อเอาออก · กด OK เมื่อพร้อม แล้วกด "แลกเลย"</p>`;
    b.querySelector('#tr-z')!.addEventListener('change', (e) => {
      const z = Math.max(0, Math.min(this.s.char.zeny, Math.floor(Number((e.target as HTMLInputElement).value) || 0)));
      this.sendOffer(t.mine.items, z);
    });
    b.querySelectorAll<HTMLElement>('[data-remove]').forEach((el) =>
      el.addEventListener('click', () => !t.lockedMine && this.sendOffer(t.mine.items.filter((o) => o.inv !== el.dataset.remove), t.mine.zeny)),
    );
    b.querySelectorAll<HTMLElement>('[data-item]').forEach((el) => {
      if (!el.dataset.item) return;
      const r = el.dataset.remove ? this.s.inv.find((x) => x.id === el.dataset.remove) : theirs[Number(el.dataset.their)]?.row;
      this.tooltip(el, () => this.itemTip(el.dataset.item!, r));
    });
    b.querySelector('#tr-lock')!.addEventListener('click', () => this.actions.send('tradeLock'));
    b.querySelector('#tr-go')!.addEventListener('click', () => this.actions.send('tradeConfirm'));
    b.querySelector('#tr-cancel')!.addEventListener('click', () => this.actions.send('tradeCancel'));
  }

  private sendOffer(items: { inv: string; qty: number }[], zeny: number) {
    this.actions.send('tradeOffer', { items, zeny });
  }

  private addToTrade(row: InvItem) {
    const t = this.trade;
    if (!t || t.lockedMine) return;
    if (row.equipped) return this.toast('ถอดไอเท็มก่อนจึงจะแลกได้', 'bad');
    if (t.mine.items.some((o) => o.inv === row.id)) return;
    if (t.mine.items.length >= 10) return this.toast('ใส่ได้สูงสุด 10 ชิ้น', 'bad');
    let qty = row.qty;
    if (row.qty > 1) {
      const a = prompt(`จำนวน ${ITEMS[row.item_id].name} (มี ${row.qty})`, String(row.qty));
      if (a === null) return;
      qty = Math.max(1, Math.min(row.qty, Math.floor(Number(a)) || 1));
    }
    this.sendOffer([...t.mine.items, { inv: row.id, qty }], t.mine.zeny);
  }

  tradeClosed(text: string) {
    this.system(text);
    this.closeTrade();
  }

  tradeDone(ok: boolean, text?: string) {
    if (ok) this.toast('แลกเปลี่ยนสำเร็จ!', 'good');
    else this.toast(`แลกเปลี่ยนไม่สำเร็จ: ${text ?? ''}`, 'bad');
    this.closeTrade();
  }

  private closeTrade() {
    this.trade = null;
    this.root.querySelector('.invite')?.remove();
    this.closeWin('trade');
    this.lastSig.inv = '';
    this.renderInv();
  }

  // ------------------------------------------------------------ party

  /** The server sent our party (null = not in one). */
  party(v: PartyView | null) {
    const was = this.partyView;
    this.partyView = v;
    this.actions.scene()?.setParty(new Set(v?.members.filter((m) => m.sid).map((m) => m.sid) ?? []));
    if (!v && was) this.lastSig.party = '';
    // joining a party (or making one) opens the window once
    if (v && (!was || was.id !== v.id) && !this.isOpen('party')) this.openParty();
    else this.renderParty();
  }

  /** Re-color party members' names in a freshly built map. */
  syncPartyWorld() {
    const v = this.partyView;
    this.actions.scene()?.setParty(new Set(v?.members.filter((m) => m.sid).map((m) => m.sid) ?? []));
  }

  partyInvite(msg: { party: string; from: string }) {
    this.root.querySelector('.pinvite')?.remove();
    const d = document.createElement('div');
    d.className = 'rw pinvite';
    d.innerHTML = `<div class="rw-title"><span>คำชวนเข้าปาร์ตี้</span></div><div class="rw-body">
      <p><b>${escapeHtml(msg.from)}</b> ชวนคุณเข้าปาร์ตี้ <b>"${escapeHtml(msg.party)}"</b></p>
      <p class="hint">ในปาร์ตี้ EXP / Job EXP / Zeny แบ่งเท่ากัน ไอเท็มวนแจกทีละคน</p>
      <div class="npc-btns"><button class="ok">เข้าร่วม</button><button class="close">ปฏิเสธ</button></div></div>`;
    this.root.appendChild(d);
    this.bringFront(d);
    const answer = (accept: boolean) => {
      this.actions.send('partyRespond', { accept });
      d.remove();
    };
    d.querySelector('.ok')!.addEventListener('click', () => answer(true));
    d.querySelector('.close')!.addEventListener('click', () => answer(false));
    setTimeout(() => d.remove(), 30000); // the invite runs out on the server too
  }

  private openParty() {
    this.win('party', 'ปาร์ตี้', 'party');
    this.lastSig.party = '';
    this.renderParty();
  }

  private renderParty() {
    const b = this.body('party');
    if (!b || !this.isOpen('party')) return;
    const v = this.partyView;
    const sig = JSON.stringify(v);
    if (this.lastSig.party === sig) return;
    this.lastSig.party = sig;
    const w = this.wins.get('party')!;
    w.querySelector('.rw-title span')!.textContent = v ? `ปาร์ตี้ : ${v.name} (${v.members.length}/${v.max})` : 'ปาร์ตี้';
    const rule = '<p class="hint">EXP · Job EXP · Zeny แบ่งเท่ากันทุกคนที่อยู่แผนที่เดียวกันและยังไม่หมดสติ · ไอเท็มที่ดรอปวนแจกทีละคน · แชทปาร์ตี้: พิมพ์ <b>/p ข้อความ</b></p>';
    if (!v) {
      b.innerHTML = `<p>คุณยังไม่ได้อยู่ในปาร์ตี้ (สูงสุด 10 คน)</p>
        <div class="pt-form"><input id="pt-name" maxlength="24" placeholder="ชื่อปาร์ตี้ (ไม่ใส่ก็ได้)"/><button class="ok" id="pt-create">สร้างปาร์ตี้</button></div>
        <p class="hint">หรือแตะ/คลิกผู้เล่นคนอื่น แล้วเลือก "ชวนเข้าปาร์ตี้"</p>${rule}`;
      b.querySelector('#pt-create')!.addEventListener('click', () =>
        this.actions.send('partyCreate', { name: (b.querySelector('#pt-name') as HTMLInputElement).value }));
      return;
    }
    const lead = v.leader === v.me;
    const rows = v.members.map((m) => {
      const where = !m.online ? '<em class="off">ออฟไลน์</em>' : m.dead ? '<em class="off">หมดสติ</em>' : escapeHtml(getMap(m.map)?.name ?? m.map);
      const hp = m.online ? Math.max(0, Math.min(100, (m.hp / Math.max(1, m.maxHp)) * 100)) : 0;
      const tools = lead && m.id !== v.me
        ? `<button data-lead="${m.id}" title="มอบหัวหน้า">👑</button><button data-kick="${m.id}" title="เชิญออก">✕</button>` : '';
      return `<div class="pt-row ${m.online ? '' : 'offline'} ${m.id === v.me ? 'me' : ''}">
        <div class="pt-who"><b>${m.id === v.leader ? '👑 ' : ''}${escapeHtml(m.name)}</b>
          <small>${escapeHtml(CLASSES[m.cls as ClassKey]?.name ?? m.cls)} · Lv ${m.level} · ${where}</small>
          <div class="gauge hp"><i style="width:${hp}%"></i></div></div>
        <div class="pt-tools">${tools}</div></div>`;
    }).join('');
    b.innerHTML = `<div class="pt-list">${rows}</div>
      ${lead && v.members.length < v.max ? '<div class="pt-form"><input id="pt-invite" maxlength="30" placeholder="ชื่อตัวละครที่จะชวน"/><button class="ok" id="pt-inv">ชวน</button></div>' : ''}
      <div class="npc-btns"><button class="close" id="pt-leave">ออกจากปาร์ตี้</button></div>${rule}`;
    const inv = b.querySelector<HTMLInputElement>('#pt-invite');
    const invite = () => {
      if (!inv?.value.trim()) return;
      this.actions.send('partyInvite', { name: inv.value.trim() });
      inv.value = '';
    };
    b.querySelector('#pt-inv')?.addEventListener('click', invite);
    inv?.addEventListener('keydown', (e) => e.key === 'Enter' && invite());
    b.querySelector('#pt-leave')!.addEventListener('click', () => {
      if (confirm('ออกจากปาร์ตี้?')) this.actions.send('partyLeave');
    });
    b.querySelectorAll<HTMLButtonElement>('[data-kick]').forEach((el) => el.addEventListener('click', () => {
      const name = v.members.find((m) => m.id === el.dataset.kick)?.name ?? '';
      if (confirm(`เชิญ ${name} ออกจากปาร์ตี้?`)) this.actions.send('partyKick', { id: el.dataset.kick });
    }));
    b.querySelectorAll<HTMLButtonElement>('[data-lead]').forEach((el) => el.addEventListener('click', () => {
      const name = v.members.find((m) => m.id === el.dataset.lead)?.name ?? '';
      if (confirm(`มอบหัวหน้าปาร์ตี้ให้ ${name}?`)) this.actions.send('partyLeader', { id: el.dataset.lead });
    }));
  }

  // ------------------------------------------------------------ guild, PVP and the guild war

  /** The server sent our guild (null = not in one). */
  guild(v: GuildView | null) {
    const was = this.guildView;
    this.guildView = v;
    if (!v && was) this.lastSig.guild = '';
    if (v && (!was || was.id !== v.id) && !this.isOpen('guild')) this.openGuild();
    else this.renderGuild();
  }

  guildInvite(msg: { guild: string; from: string }) {
    this.root.querySelector('.ginvite')?.remove();
    const d = document.createElement('div');
    d.className = 'rw pinvite ginvite';
    d.innerHTML = `<div class="rw-title"><span>คำชวนเข้ากิลด์</span></div><div class="rw-body">
      <p><b>${escapeHtml(msg.from)}</b> ชวนคุณเข้ากิลด์ <b>"${escapeHtml(msg.guild)}"</b></p>
      <p class="hint">สมาชิกกิลด์เดียวกันตีกันไม่ได้ในลานประลองและสงครามกิลด์ · แชทกิลด์ พิมพ์ /g ข้อความ</p>
      <div class="npc-btns"><button class="ok">เข้าร่วม</button><button class="close">ปฏิเสธ</button></div></div>`;
    this.root.appendChild(d);
    this.bringFront(d);
    const answer = (accept: boolean) => {
      this.actions.send('guildRespond', { accept });
      d.remove();
    };
    d.querySelector('.ok')!.addEventListener('click', () => answer(true));
    d.querySelector('.close')!.addEventListener('click', () => answer(false));
    setTimeout(() => d.remove(), 30000);
  }

  private openGuild() {
    this.win('guild', 'กิลด์', 'party');
    this.lastSig.guild = '';
    this.actions.send('guildGet');
    this.renderGuild();
  }

  private renderGuild() {
    const b = this.body('guild');
    if (!b || !this.isOpen('guild')) return;
    const v = this.guildView;
    const sig = JSON.stringify(v);
    if (this.lastSig.guild === sig) return;
    this.lastSig.guild = sig;
    const w = this.wins.get('guild')!;
    w.querySelector('.rw-title span')!.textContent = v ? `กิลด์ : ${v.name} (${v.members.length}/${v.max})` : 'กิลด์';
    const rule = '<p class="hint">แชทกิลด์: พิมพ์ <b>/g ข้อความ</b> · สมาชิกกิลด์เดียวกันตีกันไม่ได้ในลานประลองและสงครามกิลด์</p>';
    if (!v) {
      b.innerHTML = `<p>คุณยังไม่มีกิลด์ (สูงสุด ${GUILD_MAX} คน)</p>
        <p class="hint">สร้างกิลด์ได้ที่ <b>นายทะเบียนกิลด์</b> กลางเมืองเมโลเดีย ค่าสร้าง ${GUILD_COST.toLocaleString()} z หรือรอหัวหน้ากิลด์อื่นชวน</p>${rule}`;
      return;
    }
    const lead = v.leader === v.me;
    const rows = v.members.map((m) => {
      const where = !m.online ? '<em class="off">ออฟไลน์</em>' : escapeHtml(getMap(m.map)?.name ?? m.map);
      const tools = lead && m.id !== v.me
        ? `<button data-lead="${m.id}" title="มอบหัวหน้า">👑</button><button data-kick="${m.id}" title="เชิญออก">✕</button>` : '';
      return `<div class="pt-row ${m.online ? '' : 'offline'} ${m.id === v.me ? 'me' : ''}">
        <div class="pt-who"><b>${m.id === v.leader ? '👑 ' : ''}${escapeHtml(m.name)}</b>
          <small>${escapeHtml(CLASSES[m.cls as ClassKey]?.name ?? m.cls)} · Lv ${m.level} · ${where}</small></div>
        <div class="pt-tools">${tools}</div></div>`;
    }).join('');
    b.innerHTML = `${v.castle ? '<p class="gd-castle">🏰 กิลด์ของคุณครองปราสาทแห่งเสียง</p>' : ''}<div class="pt-list">${rows}</div>
      ${lead && v.members.length < v.max ? '<div class="pt-form"><input id="gd-invite" maxlength="30" placeholder="ชื่อตัวละครที่จะชวน"/><button class="ok" id="gd-inv">ชวน</button></div>' : ''}
      <div class="npc-btns"><button class="close" id="gd-leave">${v.members.length <= 1 ? 'ยุบกิลด์' : 'ออกจากกิลด์'}</button></div>${rule}`;
    const inv = b.querySelector<HTMLInputElement>('#gd-invite');
    const invite = () => {
      if (!inv?.value.trim()) return;
      this.actions.send('guildInvite', { name: inv.value.trim() });
      inv.value = '';
    };
    b.querySelector('#gd-inv')?.addEventListener('click', invite);
    inv?.addEventListener('keydown', (e) => e.key === 'Enter' && invite());
    b.querySelector('#gd-leave')!.addEventListener('click', () => {
      if (confirm(v.members.length <= 1 ? `ยุบกิลด์ "${v.name}"? (ค่าสร้างไม่ได้คืน)` : 'ออกจากกิลด์?')) this.actions.send('guildLeave');
    });
    b.querySelectorAll<HTMLButtonElement>('[data-kick]').forEach((el) => el.addEventListener('click', () => {
      const name = v.members.find((m) => m.id === el.dataset.kick)?.name ?? '';
      if (confirm(`เชิญ ${name} ออกจากกิลด์?`)) this.actions.send('guildKick', { id: el.dataset.kick });
    }));
    b.querySelectorAll<HTMLButtonElement>('[data-lead]').forEach((el) => el.addEventListener('click', () => {
      const name = v.members.find((m) => m.id === el.dataset.lead)?.name ?? '';
      if (confirm(`มอบหัวหน้ากิลด์ให้ ${name}?`)) this.actions.send('guildLeader', { id: el.dataset.lead });
    }));
  }

  private talkGuild(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    const g = this.guildView;
    const zeny = this.s.char.zeny;
    b.innerHTML = g
      ? `<div class="npc-text">ท่านเป็นสมาชิกกิลด์ <b>"${escapeHtml(g.name)}"</b> อยู่แล้ว<br>เปิดหน้าต่างกิลด์ (ปุ่ม "กิลด์" หรือ Alt+G) เพื่อดูสมาชิก ชวนคน หรือออกจากกิลด์</div>
        <div class="npc-btns"><button class="ok" data-open>เปิดหน้าต่างกิลด์</button><button class="close">ปิด</button></div>`
      : `<div class="npc-text">ข้ารับจดทะเบียนกิลด์ ค่าธรรมเนียม <b>${GUILD_COST.toLocaleString()} z</b> (ตอนนี้มี ${zeny.toLocaleString()} z)<br>
        • ผู้ก่อตั้งเป็นหัวหน้ากิลด์ ชวนสมาชิกได้สูงสุด ${GUILD_MAX} คน<br>
        • สมาชิกกิลด์เดียวกันตีกันไม่ได้ และร่วมกันยึดปราสาทแห่งเสียงในสงครามกิลด์<br>
        • ชื่อกิลด์ 2-16 ตัวอักษร ห้ามซ้ำกับกิลด์อื่น</div>
        <div class="pt-form"><input id="gd-name" maxlength="16" placeholder="ชื่อกิลด์"/><button class="ok" id="gd-create" ${zeny < GUILD_COST ? 'disabled' : ''}>ก่อตั้งกิลด์</button></div>
        <div class="npc-btns"><button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelector('[data-open]')?.addEventListener('click', () => {
      this.closeWin('npc');
      this.openGuild();
    });
    b.querySelector('#gd-create')?.addEventListener('click', () => {
      const name = (b.querySelector('#gd-name') as HTMLInputElement).value.trim();
      if (!name) return this.toast('ตั้งชื่อกิลด์ก่อน', 'bad');
      if (!confirm(`ก่อตั้งกิลด์ "${name}" ค่าธรรมเนียม ${GUILD_COST.toLocaleString()} z?`)) return;
      this.actions.send('guildCreate', { name });
      this.closeWin('npc');
    });
  }

  private talkArena(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    b.innerHTML = `<div class="npc-text">ลานประลองจังหวะ เปิดให้ประลองฝีมือกับผู้เล่นคนอื่นตลอดเวลา (PVP)<br>
      • คลิก/แตะผู้เล่นที่ชื่อเป็นสีแดงเพื่อโจมตี ใช้สกิลโจมตีกับผู้เล่นได้<br>
      • คนในปาร์ตี้หรือกิลด์เดียวกันตีกันไม่ได้<br>
      • ดาเมจที่ตีผู้เล่นเหลือ ${Math.round(PVP_DAMAGE * 100)}% ของปกติ ปรับเพิ่ม/ลดได้ด้วยอุปกรณ์และการ์ดที่มีค่า "ตีผู้เล่น" / "ลดดาเมจจากผู้เล่น"<br>
      • หมดสติในลานไม่เสีย EXP กดฟื้นแล้วลุกขึ้นในลานทันที · มีตารางคะแนนคนล้มคู่ต่อสู้มากที่สุด</div>
      <div class="npc-btns"><button class="ok" data-go>เข้าลานประลอง (ฟรี)</button><button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelector('[data-go]')!.addEventListener('click', () => {
      this.closeWin('npc');
      this.goWithNpc(ARENA_MAP);
    });
  }

  /** The herald asks the server who holds the castle; this draws the answer. */
  castleInfo(i: { owner: string; warEnds?: number; nextWar: number; schedule: string }) {
    const b = this.body('npc');
    const box = b?.querySelector('#gvg-info');
    if (!box) return;
    const now = Date.now();
    box.innerHTML = `ปราสาทแห่งเสียงตอนนี้: <b>${i.owner ? `กิลด์ "${escapeHtml(i.owner)}"` : 'ยังไม่มีผู้ครอง'}</b><br>`
      + (i.warEnds ? `<b class="war-on">⚔ สงครามกิลด์กำลังดำเนินอยู่!</b> เหลือเวลา ${durationText(i.warEnds - now)}` : `สงครามครั้งถัดไปเริ่มในอีก ${durationText(i.nextWar - now)}`);
  }

  private talkCastle(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    b.innerHTML = `<div class="npc-text"><div id="gvg-info">กำลังถามข่าวจากปราสาท…</div><br>
      สงครามกิลด์จัดที่ปราสาทแห่งเสียง ${escapeHtml(warScheduleText())} (เวลาไทย)<br>
      • ระหว่างสงคราม ในปราสาทตีผู้เล่นต่างกิลด์ได้ · ต้องมีกิลด์ถึงจะตีคริสตัลแห่งเสียงในลานบัลลังก์ได้<br>
      • กิลด์ที่ตีคริสตัลแตก (ทำดาเมจรวมมากที่สุด) ยึดปราสาท แล้วคริสตัลเกิดใหม่ให้กิลด์อื่นแย่งต่อ<br>
      • จบสงคราม กิลด์ที่ครองปราสาท สมาชิกที่ออนไลน์ได้คนละ ${WAR_PRIZE.toLocaleString()} z<br>
      • นอกเวลาสงครามเข้าไปเที่ยวชมได้ แต่ตีกันไม่ได้ · หมดสติในปราสาทไม่เสีย EXP</div>
      <div class="npc-btns"><button class="ok" data-go>ไปปราสาทแห่งเสียง (ฟรี)</button><button class="close">ปิด</button></div>`;
    this.actions.send('castleInfo');
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelector('[data-go]')!.addEventListener('click', () => {
      this.closeWin('npc');
      this.goWithNpc(CASTLE_MAP);
    });
  }

  private goWithNpc(to: string) {
    this.actions.send('npcGo', { to });
    const from = this.map;
    const errs = this.errors;
    setTimeout(() => {
      if (this.map === from && this.errors === errs && !this.ac.signal.aborted) {
        this.toast('เซิร์ฟเวอร์ไม่ตอบ (เซิร์ฟเวอร์อาจยังเป็นเวอร์ชันเก่า: อัปไฟล์ขึ้น GitLab แล้วกด Manual Deploy บน Render)', 'bad');
      }
    }, 8000);
  }

  /** A freshly built map: tell it about PVP (the server's message may have come before the world was ready). */
  syncPvpWorld() {
    this.actions.scene()?.setPvp(this.pvpInfo.on);
    this.renderPvpBar();
  }

  /** The server says whether players can fight here (and, in the castle, the war state). */
  pvp(info: PvpInfo) {
    const was = this.pvpInfo.on;
    this.pvpInfo = info;
    this.actions.scene()?.setPvp(info.on);
    // the castle's message carries the war clock (this can come before setMap() for the new map)
    if (info.on && !was) this.toast(info.nextWar ? '⚔ สงครามกิลด์! ตีผู้เล่นต่างกิลด์ได้ (ชื่อสีแดง)' : '⚔ เขต PVP: ตีผู้เล่นคนอื่นได้ (ชื่อสีแดง)', 'bad');
    this.renderPvpBar();
  }

  pvpScore(rows: PvpScore[]) {
    this.pvpScores = rows;
    this.renderPvpBar();
  }

  /** The bar at the top of the screen on the PVP maps: PVP on/off, the castle's holder and war clock, the arena scoreboard. */
  private pvpTimer = 0;
  private renderPvpBar() {
    let bar = this.root.querySelector<HTMLElement>('#pvp-bar');
    const show = this.map && (this.map.id === ARENA_MAP || this.map.id === CASTLE_MAP);
    if (!show) {
      bar?.remove();
      clearInterval(this.pvpTimer);
      this.pvpTimer = 0;
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'pvp-bar';
      bar.addEventListener('click', () => bar!.classList.toggle('open'));
      this.root.appendChild(bar);
    }
    if (!this.pvpTimer) this.pvpTimer = window.setInterval(() => this.renderPvpBar(), 15000);
    const i = this.pvpInfo;
    const now = Date.now();
    let head = i.on ? '<b class="war-on">⚔ PVP เปิด</b>' : '<b>🕊 ตีกันไม่ได้ตอนนี้</b>';
    if (this.map.id === CASTLE_MAP) {
      head += ` · 🏰 ${i.owner ? escapeHtml(i.owner) : 'ยังไม่มีผู้ครอง'}`;
      head += i.warEnds ? ` · เหลือ ${durationText(i.warEnds - now)}` : i.nextWar ? ` · สงครามถัดไปอีก ${durationText(i.nextWar - now)}` : '';
    }
    const rows = this.map.id === ARENA_MAP && this.pvpScores.length
      ? `<table>${this.pvpScores.map((r, n) => `<tr><td>${n + 1}</td><td>${escapeHtml(r.name)}${r.guild ? ` <small>[${escapeHtml(r.guild)}]</small>` : ''}</td><td>⚔${r.kills}</td><td>☠${r.deaths}</td></tr>`).join('')}</table>`
      : this.map.id === ARENA_MAP ? '<small>ยังไม่มีใครล้มใคร</small>' : '';
    bar.innerHTML = `<div>${head}</div>${rows ? `<div class="pvp-score">${rows}</div>` : ''}`;
  }

  // ------------------------------------------------------------ misc windows

  private openOption() {
    this.win('option', 'ตั้งค่า', 'option');
    const b = this.body('option')!;
    b.innerHTML = `
      <div class="keys">
        <div><kbd>Alt+Q</kbd> สถานะ/อุปกรณ์</div><div><kbd>Alt+E</kbd> ไอเท็ม</div><div><kbd>Alt+S</kbd> สกิล</div>
        <div><kbd>F1-F9</kbd> / <kbd>1-9</kbd> ปุ่มลัด</div><div><kbd>Insert</kbd> นั่งพัก (ฟื้นไวขึ้น)</div>
        <div><kbd>Tab</kbd> แผนที่ย่อ</div><div><kbd>Enter</kbd> แชท</div><div>คลิกขวา = ยกเลิกการเล็งสกิล</div>
      </div>
      <div class="sound-opts">
        <label>เพลง <input type="range" id="opt-music" min="0" max="100"></label>
        <label>เสียงเอฟเฟกต์ <input type="range" id="opt-sfx" min="0" max="100"></label>
        <label class="chk"><input type="checkbox" id="opt-mute"> ปิดเสียงทั้งหมด</label>
      </div>
      <div class="npc-btns"><button class="close" id="opt-exit">กลับไปเลือกตัวละคร</button></div>`;
    b.querySelector('#opt-exit')!.addEventListener('click', () => this.actions.exit());
    const p = audioPrefs();
    const music = b.querySelector<HTMLInputElement>('#opt-music')!;
    const fx = b.querySelector<HTMLInputElement>('#opt-sfx')!;
    const mute = b.querySelector<HTMLInputElement>('#opt-mute')!;
    music.value = String(Math.round(p.music * 100));
    fx.value = String(Math.round(p.sfx * 100));
    mute.checked = p.muted;
    music.oninput = () => setAudioPrefs({ music: Number(music.value) / 100 });
    fx.oninput = () => setAudioPrefs({ sfx: Number(fx.value) / 100 });
    fx.onchange = () => sfx('hit'); // let them hear the new level
    mute.onchange = () => setAudioPrefs({ muted: mute.checked });
  }

  private toggleAuto() {
    const w = this.actions.scene();
    if (!w) return;
    if (!w.isAuto() && this.map.safe) return this.toast('ในเมืองไม่มีมอนสเตอร์ ออกไปที่ทุ่งก่อนแล้วค่อยเปิดออโต้', 'bad');
    w.setAuto(!w.isAuto());
  }

  /** /auto on/off: light up the button and say so (clicking the ground or dying also turns it off). */
  autoChanged(on: boolean) {
    this.root.querySelector('#auto-btn')?.classList.toggle('on', on);
    this.root.querySelector('#auto-badge')?.remove();
    if (on) {
      const pct = potionPct();
      const spPct = spPotionPct();
      const STEPS = [0, 10, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90];
      const options = (cur: number) => (STEPS.includes(cur) ? '' : `<option value="${cur}" selected>ต่ำกว่า ${cur}%</option>`)
        + STEPS.map((v) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${v ? `ต่ำกว่า ${v}%` : 'ไม่ใช้ยา'}</option>`).join('');
      this.root.insertAdjacentHTML('beforeend', `<div id="auto-badge" class="auto-badge">
        <span class="ab-t">AUTO · ตีและใช้สกิลอัตโนมัติ</span>
        <label class="ab-pot" title="ดื่มยาฟื้น HP อัตโนมัติ (ซ้ำได้ทุก 1 วินาที)">ยา HP <select id="ab-pot">${options(pct)}</select></label>
        <label class="ab-pot" title="ดื่มยาฟื้น SP อัตโนมัติ (ซ้ำได้ทุก 1 วินาที)">ยา SP <select id="ab-sp">${options(spPct)}</select></label>
        <button id="ab-stop" title="หยุดออโต้">หยุด</button></div>`);
      const sel = this.root.querySelector<HTMLSelectElement>('#ab-pot')!;
      sel.addEventListener('change', () => {
        setAutoPotionPct(Number(sel.value));
        const v = Number(sel.value);
        this.line('sys', v ? `ออโต้จะดื่มยา HP เมื่อ HP ต่ำกว่า ${v}% (ซ้ำได้ทุก 1 วินาที)` : 'ออโต้จะไม่ดื่มยา HP');
      });
      const spSel = this.root.querySelector<HTMLSelectElement>('#ab-sp')!;
      spSel.addEventListener('change', () => {
        setAutoSpPotionPct(Number(spSel.value));
        const v = Number(spSel.value);
        const has = this.s.inv.some((i) => ITEMS[i.item_id]?.type === 'consumable' && ITEMS[i.item_id].sp);
        this.line('sys', v ? `ออโต้จะดื่มยา SP เมื่อ SP ต่ำกว่า ${v}% (ซ้ำได้ทุก 1 วินาที)${has ? '' : ' · ตอนนี้ในกระเป๋ายังไม่มียาฟื้น SP'}` : 'ออโต้จะไม่ดื่มยา SP');
      });
      this.root.querySelector('#ab-stop')!.addEventListener('click', () => this.actions.scene()?.setAuto(false));
      const say = (v: number, what: string) => (v ? `ดื่มยา ${what} เมื่อ ${what} ต่ำกว่า ${v}%` : `ไม่ดื่มยา ${what}`);
      this.line('sys', `เปิดออโต้: ตีมอนสเตอร์ใกล้ ๆ ใช้สกิลเอง ${say(pct, 'HP')} · ${say(spPct, 'SP')} (เปลี่ยนได้ที่แถบ AUTO ด้านบน) · พิมพ์ /auto อีกครั้ง หรือคลิกพื้นเพื่อหยุด`);
    } else this.line('sys', 'ปิดออโต้แล้ว');
  }

  death(dead: boolean) {
    this.root.querySelector('.death')?.remove();
    if (!dead) return;
    const d = document.createElement('div');
    d.className = 'rw death';
    d.innerHTML = `<div class="rw-title"><span>หมดสติ</span></div><div class="rw-body">
      <p>คุณหมดสติแล้ว… เสีย Base EXP 5% และจะกลับไปฟื้นที่จุดเกิดที่บันทึกไว้กับบูรพา (ยังไม่บันทึก = กลางเมือง)</p>
      <div class="npc-btns"><button class="ok">กลับไปจุดเซฟ</button></div></div>`;
    this.root.appendChild(d);
    this.bringFront(d);
    const ok = d.querySelector<HTMLButtonElement>('.ok')!;
    ok.addEventListener('click', () => {
      ok.disabled = true;
      this.actions.send('respawn');
      // if the server never answers, let the player try again instead of being stuck
      setTimeout(() => {
        if (!d.isConnected) return;
        ok.disabled = false;
        ok.textContent = 'ลองอีกครั้ง';
      }, 8000);
    });
  }

  targeting(name: string | null) {
    const el = this.root.querySelector('#targeting')!;
    el.classList.toggle('hidden', !name);
    if (name) el.textContent = `เลือกเป้าหมายสำหรับ "${name}" · ${lastTouch ? 'แตะพื้นเพื่อยกเลิก' : 'คลิกขวาเพื่อยกเลิก'}`;
  }

  /** A buff started or changed (seconds 0 = it ended early, e.g. a shield broke). `blocks` = shield hits left. */
  buff(skill: string, seconds: number, blocks?: number) {
    if (seconds <= 0) this.buffEnds.delete(skill);
    else this.buffEnds.set(skill, performance.now() + seconds * 1000);
    if (blocks) this.buffBlocks.set(skill, blocks);
    else this.buffBlocks.delete(skill);
  }

  private tooltip(el: HTMLElement, html: () => string) {
    const tip = () => this.root.querySelector('#tooltip') as HTMLElement;
    el.addEventListener('pointerenter', (e) => {
      const t = tip();
      t.innerHTML = html();
      t.classList.remove('hidden');
      t.style.left = `${Math.max(0, Math.min(window.innerWidth - t.offsetWidth - 4, e.clientX + 14))}px`;
      t.style.top = `${Math.max(0, Math.min(window.innerHeight - t.offsetHeight - 4, e.clientY + 14))}px`;
    });
    el.addEventListener('pointerleave', () => tip().classList.add('hidden'));
    el.addEventListener('pointerdown', () => tip().classList.add('hidden'));
  }

  private async run(fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (e) {
      this.toast((e as Error).message, 'bad');
    }
  }

  // ------------------------------------------------------------ keyboard + per-frame

  private bindKeys() {
    const input = this.root.querySelector('#chat-input') as HTMLInputElement;
    window.addEventListener('keydown', (e) => {
      const typing = document.activeElement instanceof HTMLInputElement;
      if (document.activeElement === input) {
        if (e.key === 'Escape') input.blur();
        return;
      }
      if (typing) return;
      if (e.key === 'Enter') {
        input.focus();
        e.preventDefault();
        return;
      }
      const k = e.key.toLowerCase();
      if (e.altKey && k === 'q') this.toggle('equip');
      else if (e.altKey && k === 'e') this.toggle('inv');
      else if (e.altKey && k === 's') this.toggle('skill');
      else if (e.altKey && k === 'a') this.toggle('equip');
      else if (e.altKey && k === 'z') this.toggle('party');
      else if (e.altKey && k === 'g') this.toggle('guild');
      else if (e.altKey && k === 'g') this.toggleGuide();
      else if (e.altKey && k === 'r') this.toggleRank();
      else if (k === 'tab') this.root.querySelector('#minimap')!.classList.toggle('hidden');
      else if (k === 'insert') this.actions.scene()?.toggleSit();
      else if (k === 'escape') {
        const scene = this.actions.scene();
        if (scene?.isTargeting()) scene.cancelTargeting();
        else {
          const open = [...this.wins.entries()].filter(([id, w]) => id !== 'info' && !w.classList.contains('hidden'));
          if (open.length) {
            const [id] = open.sort((a, b) => Number(b[1].style.zIndex) - Number(a[1].style.zIndex))[0];
            if (id === 'trade') this.actions.send('tradeCancel');
            else this.closeWin(id);
          } else this.toggle('option');
        }
      } else if (/^f[1-9]$/.test(k)) this.useHotkey(Number(k.slice(1)) - 1);
      else if (/^[1-9]$/.test(k) && !e.altKey && !e.ctrlKey) this.useHotkey(Number(k) - 1);
      else return;
      e.preventDefault();
    }, { signal: this.ac.signal });
  }

  private refresh() {
    this.refreshInfo();
    this.renderEquip();
    this.renderInv();
    this.renderSkills();
    this.renderShop();
    this.renderVend();
    this.renderStorage();
    this.renderItem();
    this.renderRefine();
    this.renderUncard();
    this.autoSlotSkills();
    this.renderHotbar();
  }

  private frame() {
    this.drawMinimap();
    this.drawWorldMap();
    const now = performance.now();
    // hotkey cooldown overlays
    this.root.querySelectorAll<HTMLElement>('#hotbar [data-hk]').forEach((el) => {
      const h = this.hotkeys[Number(el.dataset.hk)];
      const cd = el.querySelector('.cd') as HTMLElement;
      if (h?.t !== 's') return void (cd.style.height = '0');
      const end = this.cooldownEnds.get(h.id) ?? 0;
      const total = SKILLS[h.id]?.cooldown ?? 1;
      cd.style.height = `${Math.max(0, (end - now) / total) * 100}%`;
    });
    // buff icons
    const box = this.root.querySelector('#buffs')!;
    let html = '';
    for (const [id, end] of this.buffEnds) {
      const left = Math.ceil((end - now) / 1000);
      if (left <= 0) {
        this.buffEnds.delete(id);
        continue;
      }
      const blocks = this.buffBlocks.get(id);
      // an element converter on the weapon: 'item:<id>'
      const conv = id.startsWith('item:') ? ITEMS[id.slice(5)] : undefined;
      const name = conv ? `${conv.name} · อาวุธธาตุ${ELEMENTS[conv.endow ?? 'neutral'].name}` : SKILLS[id]?.name ?? id;
      const icon = conv ? ELEMENTS[conv.endow ?? 'neutral'].icon : SKILLS[id]?.icon ?? '✨';
      const time = left >= 60 ? `${Math.ceil(left / 60)}น` : left;
      html += `<div class="buff" title="${escapeHtml(name)}${blocks ? ` · กันได้อีก ${blocks} ครั้ง` : ''}">${icon}${blocks ? `<b>${blocks}</b>` : ''}<i>${time}</i></div>`;
    }
    if (box.innerHTML !== html) box.innerHTML = html;
  }
}

/** Card art placeholders (data-portrait="<monster>") get the monster rendered from its model. */
function hydratePortraits(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-portrait]').forEach((pic) => {
    void monsterPortrait(pic.dataset.portrait!).then((url) => {
      if (pic.isConnected) pic.innerHTML = url ? `<img src="${url}" alt=""/>` : '<span class="muted">?</span>';
    });
  });
}

// whether the last press was a finger (some phones also send dblclick after two taps: don't act twice)
let lastTouch = false;
window.addEventListener('pointerdown', (e) => (lastTouch = e.pointerType === 'touch'), true);

/** Touch only: a tap, or two taps in a row (not every phone sends dblclick). Mouse users keep drag and double-click. */
function onTouchTap(el: HTMLElement, tap: () => void, doubleTap: () => void) {
  let last = 0;
  el.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const now = performance.now();
    if (now - last < 350) {
      last = 0;
      doubleTap();
    } else {
      last = now;
      tap();
    }
  });
}
