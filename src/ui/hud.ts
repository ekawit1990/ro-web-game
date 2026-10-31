import {
  CLASSES, CLASS_KEYS, ClassKey, EQUIP_TYPES, ITEMS, InvItem, JOB_CHANGE, MAX_JOB_LEVEL, MAX_LEVEL, SHOP, SKILLS, START_CLASS,
  STAT_KEYS, STORAGE_SLOTS, StatKey, WEAPON_SHOP, expToNext, jobExpToNext, jobTown, skillSp, skillsOf, statCost,
} from '../data';
import { THEMES, WARP_TOWNS, getMap, type GameMap, type Npc } from '../game/maps';
import type { Session } from '../game/session';
import type { World3D, WorldHooks } from '../three/World3D';
import { audioPrefs, setAudioPrefs, sfx } from '../audio/sound';
import { drawLook, itemIcon } from './icons';
import { escapeHtml } from './screens';

type WinId = 'info' | 'equip' | 'inv' | 'skill' | 'shop' | 'trade' | 'option' | 'npc' | 'storage';
type Slot = { t: 's' | 'i'; id: string } | null;
type InvTab = 'item' | 'equip' | 'etc';
type ChatTab = 'all' | 'chat' | 'sys';

interface TradeView {
  with: string;
  mine: { items: { inv: string; qty: number }[]; zeny: number };
  theirs: { items: { item: string; qty: number }[]; zeny: number };
  lockedMine: boolean; lockedTheirs: boolean; confirmedMine: boolean; confirmedTheirs: boolean;
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
const SLOT_LABEL: Record<string, string> = { head: 'หมวก', weapon: 'อาวุธ', armor: 'ชุด', accessory: 'เครื่องประดับ' };
const DEFAULT_POS: Record<WinId, [number, number]> = {
  info: [8, 8], equip: [250, 60], inv: [-330, 170], skill: [560, 60], shop: [300, 80], trade: [320, 120],
  option: [-260, 170], npc: [-1, -1], storage: [300, 80],
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
  private shopKind: 'shop' | 'weapons' = 'shop';
  private shopTab: 'buy' | 'sell' = 'buy';
  private storageTab: 'put' | 'take' = 'put';
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
    this.closeTrade();
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
    const pos = this.loadPos()[id] ?? DEFAULT_POS[id];
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
      return `<div class="eq-slot" data-unequip="${row?.id ?? ''}" title="${row ? 'ดับเบิลคลิกเพื่อถอด' : ''}">
        ${it ? `<img src="${itemIcon(row!.item_id)}"/>` : '<span class="ph"></span>'}
        <div><small>${SLOT_LABEL[type]}</small><b>${it ? escapeHtml(it.name) : '-'}</b></div></div>`;
    };
    const rows = STAT_KEYS.map((k) => {
      const cost = statCost(c[k]);
      const can = c.stat_points >= cost && c[k] < 99;
      const plus = d.bonus?.[k] ? ` <em class="st-bonus">+${d.bonus[k]}</em>` : '';
      return `<div class="st-row" title="${STAT_HELP[k]}"><label>${STAT_LABEL[k]}</label><b>${c[k]}${plus}</b>
        <button class="up" data-stat="${k}" ${can ? '' : 'disabled'}>▲</button><small>${cost}</small></div>`;
    }).join('');
    const right: [string, string | number][] = [
      ['Atk', d.atk], ['Matk', d.matk], ['Hit', d.hit], ['Critical', d.crit], ['Def', d.def], ['Mdef', d.mdef], ['Flee', d.flee],
      ['Aspd', d.aspd],
    ];
    b.innerHTML = `
      <div class="eq-grid">
        <div class="eq-col">${slot('head')}${slot('armor')}</div>
        <canvas id="eq-preview" width="96" height="134"></canvas>
        <div class="eq-col">${slot('weapon')}${slot('accessory')}</div>
      </div>
      <div class="st-grid">
        <div>${rows}</div>
        <div class="st-right">${right.map(([k, v]) => `<div><label>${k}</label><b>${v}</b></div>`).join('')}
          <div class="sp-pts"><label>Status Point</label><b>${c.stat_points}</b></div></div>
      </div>`;
    drawLook(b.querySelector('#eq-preview')!, { ...c, cls: c.cls }, 'f', this.s.equippedOf('head')?.item_id);
    b.querySelectorAll<HTMLButtonElement>('[data-stat]').forEach((btn) =>
      btn.addEventListener('click', () => this.run(() => this.s.allocate(btn.dataset.stat as StatKey))),
    );
    b.querySelectorAll<HTMLElement>('[data-unequip]').forEach((el) => {
      if (!el.dataset.unequip) return;
      const off = () => this.run(() => this.s.setEquipped(el.dataset.unequip!, false));
      el.addEventListener('dblclick', () => !lastTouch && off());
      onTouchTap(el, () => {}, off);
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
        <img src="${itemIcon(r.item_id)}"/>${r.qty > 1 ? `<i>${r.qty}</i>` : ''}${r.equipped ? '<em>E</em>' : ''}</div>`)
      .join('');
    const empty = Math.max(0, 24 - rows.length);
    b.innerHTML = `
      <div class="tabs">${(['item', 'equip', 'etc'] as InvTab[])
        .map((t) => `<button data-tab="${t}" class="${t === this.invTab ? 'on' : ''}">${{ item: 'ใช้ได้', equip: 'สวมใส่', etc: 'อื่นๆ' }[t]}</button>`)
        .join('')}</div>
      <div class="grid">${cells}${'<div class="cell"></div>'.repeat(empty)}</div>
      <div class="inv-foot">${this.trade ? '<span class="hint">ดับเบิลคลิกไอเท็มเพื่อใส่ในหน้าต่างแลกเปลี่ยน</span>' : '<span class="hint">ดับเบิลคลิก = ใช้/สวมใส่ · ลากไปช่องปุ่มลัดได้</span>'}
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
      const pickable = ITEMS[row.item_id]?.type === 'consumable' && !this.trade;
      onTouchTap(el, () => pickable && this.pick({ t: 'i', id: row.item_id }), () => {
        this.pick(null);
        this.activateItem(row);
      });
    });
  }

  private activateItem(row: InvItem) {
    const it = ITEMS[row.item_id];
    if (this.trade) return this.addToTrade(row);
    if (it.type === 'consumable') return this.s.use(row.id);
    if ((EQUIP_TYPES as string[]).includes(it.type)) this.run(() => this.s.setEquipped(row.id, !row.equipped));
  }

  private itemTip(id: string, row?: InvItem) {
    const it = ITEMS[id];
    if (!it) return '';
    const parts: string[] = [];
    if (it.atk) parts.push(`Atk +${it.atk}`);
    if (it.matk) parts.push(`Matk +${it.matk}`);
    if (it.def) parts.push(`Def +${it.def}`);
    if (it.aspd) parts.push(`Aspd +${it.aspd}%`);
    if (it.heal) parts.push(`ฟื้น HP ${it.heal}`);
    if (it.sp) parts.push(`ฟื้น SP ${it.sp}`);
    const classes = it.classes ? `<div class="muted">ใช้ได้: ${it.classes.map((c) => CLASSES[c].name).join(', ')}</div>` : '';
    return `<b>${escapeHtml(it.name)}</b>${row && row.qty > 1 ? ` x${row.qty}` : ''}<div>${parts.join(' · ')}</div>${classes}
      <div class="muted">น้ำหนัก ${it.weight / 10} · ราคา ${it.price}z</div>`;
  }

  // ------------------------------------------------------------ skills

  private openSkills() {
    this.win('skill', 'Skill Tree', 'skill');
    this.lastSig.skill = '';
    this.renderSkills();
  }

  private renderSkills() {
    const b = this.body('skill');
    if (!b || !this.isOpen('skill')) return;
    const c = this.s.char;
    const sig = JSON.stringify([c.skills, c.skill_points, c.cls]);
    if (this.lastSig.skill === sig) return;
    this.lastSig.skill = sig;
    // Teen skills stay on the list after the job change (usable, no longer trainable)
    const list = c.cls === START_CLASS ? skillsOf(c.cls) : [...skillsOf(c.cls), ...skillsOf(START_CLASS).filter(([id]) => c.skills?.[id])];
    const rows = list.map(([id, sk]) => {
      const lv = c.skills?.[id] ?? 0;
      const passive = sk.type === 'passive';
      return `<div class="sk-row ${lv ? '' : 'locked'}">
        <div class="sk-icon" data-skill="${id}" draggable="${!passive && lv > 0}" title="${passive ? 'สกิลติดตัว' : 'ลากไปช่องปุ่มลัด / ดับเบิลคลิกเพื่อใช้'}">${sk.icon}</div>
        <div class="sk-info"><b>${escapeHtml(sk.name)}</b><small>${passive ? 'ติดตัว' : `Sp : ${skillSp(sk, Math.max(1, lv))}`}</small></div>
        <div class="sk-lv">Lv : ${lv} / ${sk.maxLevel}</div>
        <button class="up" data-learn="${id}" ${c.skill_points > 0 && lv < sk.maxLevel && sk.cls === c.cls ? '' : 'disabled'}>Lv Up</button>
      </div>`;
    });
    b.innerHTML = `<div class="sk-list">${rows.join('')}</div>
      <div class="sk-foot"><span>Skill Point : <b>${c.skill_points}</b></span><span class="hint">ได้ 1 แต้มทุก Job Lv</span></div>`;
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
    return `<b>${sk.icon} ${escapeHtml(sk.name)}</b> (Lv ${lv}/${sk.maxLevel})<div>${escapeHtml(sk.desc)}</div>
      ${sk.cooldown ? `<div class="muted">คูลดาวน์ ${(sk.cooldown / 1000).toFixed(1)} วิ</div>` : ''}`;
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
        <canvas id="mini-cv" width="140" height="140"></canvas>
      </div>`);
  }

  private drawMiniBase() {
    const m = this.map;
    const cv = document.createElement('canvas');
    cv.width = 140;
    cv.height = 140;
    const c = cv.getContext('2d')!;
    const s = 140 / Math.max(m.w, m.h);
    const colors = THEMES[m.theme].ground;
    for (let y = 0; y < m.h; y++) {
      for (let x = 0; x < m.w; x++) {
        c.fillStyle = colors[m.ground[y][x]] ?? '#555';
        c.fillRect(x * s, y * s, s + 0.5, s + 0.5);
      }
    }
    for (const o of m.objects) {
      if (o.kind === 'building' || o.kind === 'palace') {
        c.fillStyle = o.kind === 'palace' ? '#3f7fb8' : o.style === 'desert' ? '#a8865a' : '#7b4a36';
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
    this.miniBase = cv;
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
        <form id="chat-form"><input id="chat-input" placeholder="Enter เพื่อพิมพ์ · /sit = นั่ง" maxlength="120" autocomplete="off"/></form>
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

  reward(msg: { monster: string; exp: number; jobExp: number; zeny: number; drops: string[]; leveledUp: boolean; jobLeveledUp: boolean }) {
    this.line('good', `ได้รับ Base EXP ${msg.exp} · Job EXP ${msg.jobExp} · ${msg.zeny} Zeny`);
    for (const d of msg.drops) this.line('good', `ได้รับไอเท็ม <b>${escapeHtml(ITEMS[d]?.name ?? d)}</b>`);
    if (msg.leveledUp) this.toast(`Base Level Up! ได้ Status Point แล้ว (กด Alt+Q)`, 'good');
    if (msg.jobLeveledUp) this.toast(`Job Level Up! ได้ Skill Point แล้ว (กด Alt+S)`, 'good');
    setTimeout(() => sfx(msg.drops.length ? 'item' : 'coin'), 180);
  }

  // ------------------------------------------------------------ npc + shop

  talk(n: Npc) {
    if (n.id === 'jobs') return this.talkJobs(n);
    if (n.id === 'warper') return this.talkBurapa(n);
    const text: Record<Npc['id'], string> = {
      shop: 'ยินดีต้อนรับจ้า~ มีน้ำดื่ม ยาฟื้นเสียง และเสื้อผ้าเท่ ๆ ให้เลือกเพียบ',
      weapons: 'เครื่องดนตรีดี ๆ ทั้งนั้น! เลือกให้เหมาะกับอาชีพของเจ้านะ',
      healer: 'เหนื่อยไหมจ๊ะ? ให้ครูช่วยพักเสียงให้ไหม (ฟื้น HP/SP เต็มฟรี)',
      jobs: '',
      warper: '',
      guide: 'ยินดีต้อนรับสู่เมืองเมโลเดีย! เดินออกประตูทิศตะวันออกไปทุ่งเมโลดี้เพื่อล่ามอนสเตอร์\n'
        + '• คลิกพื้นเพื่อเดิน คลิกมอนสเตอร์เพื่อตี\n• Alt+Q สถานะ, Alt+E ไอเท็ม, Alt+S สกิล\n• F1-F9 หรือ 1-9 ใช้ปุ่มลัด\n'
        + '• คลิกผู้เล่นอื่นเพื่อแลกเปลี่ยนไอเท็มหรือเงิน\n'
        + '• บูรพาข้างน้ำพุกลางเมือง: วาร์ปไปเมืองทะเลทรายตะโพน (เมืองมือกลอง) และฝากของในคลังกลางที่ทุกตัวละครใน ID ใช้ร่วมกัน',
    };
    const w = this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    const action = n.id === 'shop' || n.id === 'weapons' ? 'เปิดร้าน' : n.id === 'healer' ? 'รักษา' : '';
    b.innerHTML = `<div class="npc-text">${escapeHtml(text[n.id]).replace(/\n/g, '<br>')}</div>
      <div class="npc-btns">${action ? `<button class="ok">${action}</button>` : ''}<button class="close">ปิด</button></div>`;
    b.querySelector('.close')!.addEventListener('click', () => this.closeWin('npc'));
    b.querySelector('.ok')?.addEventListener('click', () => {
      this.closeWin('npc');
      if (n.id === 'healer') this.actions.send('heal');
      else this.openShop(n.id as 'shop' | 'weapons', n.name);
    });
    void w;
  }

  /** บูรพา: paid warps to the other towns, and the storage every character of the account shares. */
  private talkBurapa(n: Npc) {
    this.win('npc', escapeHtml(n.name), 'npc');
    const b = this.body('npc')!;
    const zeny = this.s.char.zeny;
    const towns = WARP_TOWNS.filter((t) => t.map !== this.map.id);
    const warps = towns.map((t) => `<button class="ok" data-warp="${t.map}" ${zeny < t.cost ? 'disabled' : ''}>วาร์ปไป${escapeHtml(getMap(t.map).name)} (${t.cost.toLocaleString()} z)</button>`).join('');
    b.innerHTML = `<div class="npc-text">ข้าคือบูรพา ผู้ดูแลการเดินทางและคลังกลางของทุกเมือง<br>
      • วาร์ปไปเมืองอื่นได้ทันที เสียค่าเดินทางเป็น Zeny (ตอนนี้มี ${zeny.toLocaleString()} z)<br>
      • คลังกลาง: ฝากของไว้ ตัวละครทุกตัวใน ID เดียวกันเปิดใช้ร่วมกันได้จากบูรพาทุกเมือง</div>
      <div class="npc-btns job-btns">${warps}<button class="ok" data-storage>เปิดคลังกลาง</button><button class="close">ปิด</button></div>`;
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
    const row = (key: string, id: string, item: string, qty: number, btn: string) => {
      const it = ITEMS[item];
      return `<div class="shop-row" ${key}="${id}" data-item="${item}"><img src="${itemIcon(item)}"/>
        <span>${escapeHtml(it?.name ?? item)} x${qty}</span><b></b>
        <input type="number" min="1" max="${qty}" value="${qty}"/><button class="${key === 'data-put' ? 'buy' : 'sell'}">${btn}</button></div>`;
    };
    const rows = this.storageTab === 'put'
      ? this.s.inv.filter((r) => !r.equipped).map((r) => row('data-put', r.id, r.item_id, r.qty, 'ฝาก'))
      : this.s.storage.map((r) => row('data-take', r.id, r.item_id, r.qty, 'ถอน'));
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
      this.tooltip(el.querySelector('img')!, () => this.itemTip(el.dataset.item!));
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
      text = `ผ่านบททดสอบแล้ว! เลือกเส้นทางดนตรีของเธอได้เลย (เลือกแล้วเปลี่ยนไม่ได้นะ)${away}`;
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
        this.toast(`เปลี่ยนอาชีพเป็น${CLASSES[job as ClassKey].name}แล้ว! ได้อาวุธใหม่ติดตัว`, 'good');
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
    const sig = JSON.stringify([this.shopKind, this.shopTab, this.s.inv, this.s.char.zeny]);
    if (this.lastSig.shop === sig) return;
    this.lastSig.shop = sig;
    const list = this.shopKind === 'shop' ? SHOP : WEAPON_SHOP;
    const rows = this.shopTab === 'buy'
      ? list.map((id) => {
        const it = ITEMS[id];
        const wrong = it.classes && !it.classes.includes(this.s.char.cls);
        return `<div class="shop-row ${wrong ? 'dim' : ''}" data-item="${id}"><img src="${itemIcon(id)}"/>
          <span>${escapeHtml(it.name)}</span><b>${it.price.toLocaleString()} z</b>
          <input type="number" min="1" max="99" value="1"/><button class="buy" ${this.s.char.zeny < it.price ? 'disabled' : ''}>ซื้อ</button></div>`;
      })
      : this.s.inv.filter((r) => !r.equipped).map((r) => {
        const it = ITEMS[r.item_id];
        return `<div class="shop-row" data-sell="${r.id}" data-item="${r.item_id}"><img src="${itemIcon(r.item_id)}"/>
          <span>${escapeHtml(it.name)} x${r.qty}</span><b>${Math.floor(it.price / 2).toLocaleString()} z</b>
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
      this.tooltip(row.querySelector('img')!, () => this.itemTip(row.dataset.item!));
      row.querySelector('.buy')?.addEventListener('click', () =>
        this.run(async () => {
          await this.s.buy(row.dataset.item!, qty());
          this.line('good', `ซื้อ ${escapeHtml(ITEMS[row.dataset.item!].name)} x${qty()}`);
        }));
      row.querySelector('.sell')?.addEventListener('click', () => this.run(() => this.s.sell(row.dataset.sell!, qty())));
    });
  }

  // ------------------------------------------------------------ trading

  playerMenu(sessionId: string, name: string, x: number, y: number) {
    this.root.querySelector('.ctx')?.remove();
    const m = document.createElement('div');
    m.className = 'ctx';
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    m.innerHTML = `<b>${escapeHtml(name)}</b><button data-a="trade">ขอแลกเปลี่ยน</button><button data-a="close">ยกเลิก</button>`;
    this.root.appendChild(m);
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
    const grid = (items: { id: string; qty: number; inv?: string }[]) =>
      items.map((i) => `<div class="cell" ${i.inv ? `data-remove="${i.inv}"` : ''} data-item="${i.id}"><img src="${itemIcon(i.id)}"/>${i.qty > 1 ? `<i>${i.qty}</i>` : ''}</div>`).join('')
      + '<div class="cell"></div>'.repeat(Math.max(0, 5 - items.length));
    const mine = t.mine.items.map((o) => ({ id: this.s.inv.find((r) => r.id === o.inv)?.item_id ?? '', qty: o.qty, inv: o.inv }));
    const theirs = t.theirs.items.map((o) => ({ id: o.item, qty: o.qty }));
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
    b.querySelectorAll<HTMLElement>('[data-item]').forEach((el) => el.dataset.item && this.tooltip(el, () => this.itemTip(el.dataset.item!)));
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

  death(dead: boolean) {
    this.root.querySelector('.death')?.remove();
    if (!dead) return;
    const d = document.createElement('div');
    d.className = 'rw death';
    d.innerHTML = `<div class="rw-title"><span>หมดสติ</span></div><div class="rw-body">
      <p>คุณหมดสติแล้ว… เสีย Base EXP 5% และจะกลับไปฟื้นที่เมือง</p>
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
      t.style.left = `${Math.min(window.innerWidth - 230, e.clientX + 14)}px`;
      t.style.top = `${Math.min(window.innerHeight - 120, e.clientY + 14)}px`;
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
    this.renderStorage();
    this.autoSlotSkills();
    this.renderHotbar();
  }

  private frame() {
    this.drawMinimap();
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
      html += `<div class="buff" title="${escapeHtml(SKILLS[id]?.name ?? id)}${blocks ? ` · กันได้อีก ${blocks} ครั้ง` : ''}">${SKILLS[id]?.icon ?? '✨'}${blocks ? `<b>${blocks}</b>` : ''}<i>${left}</i></div>`;
    }
    if (box.innerHTML !== html) box.innerHTML = html;
  }
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
