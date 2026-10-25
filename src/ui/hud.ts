import { CLASSES, ITEMS, SHOP, STAT_KEYS, StatKey, expToNext } from '../data';
import type { Session } from '../game/session';
import { $, escapeHtml } from './screens';

const STAT_HELP: Record<StatKey, string> = {
  str: 'พลังโจมตีระยะประชิด',
  agi: 'ความเร็วโจมตี/เดิน',
  vit: 'HP และพลังป้องกัน',
  int: 'พลังเวทย์และ SP',
  dex: 'พลังธนูและคริติคอล',
};

type PanelKind = 'inventory' | 'stats' | 'shop' | null;

/** DOM overlay: status box, menu, panels, chat and toasts. */
export class Hud {
  private panel: PanelKind = null;
  private panelKey = '';
  private ac = new AbortController();

  constructor(
    private s: Session,
    private actions: { chat(text: string): void; exit(): void; respawn(): Promise<void> },
  ) {
    const sig = { signal: this.ac.signal };
    s.onChange(() => this.refresh());

    document.querySelectorAll<HTMLButtonElement>('[data-panel]').forEach((b) =>
      b.addEventListener('click', () => this.toggle(b.dataset.panel as PanelKind), sig),
    );
    $('panel-close').addEventListener('click', () => this.toggle(null), sig);
    $('btn-potion').addEventListener('click', () => this.quickPotion(), sig);
    $('btn-exit').addEventListener('click', () => this.actions.exit(), sig);
    $('btn-respawn').addEventListener('click', async () => {
      $<HTMLButtonElement>('btn-respawn').disabled = true;
      try {
        await this.actions.respawn();
        $('death').classList.add('hidden');
      } finally {
        $<HTMLButtonElement>('btn-respawn').disabled = false;
      }
    }, sig);

    const input = $<HTMLInputElement>('chat-input');
    $('chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (text) this.actions.chat(text);
      input.value = '';
      input.blur();
    }, sig);

    window.addEventListener('keydown', (e) => {
      if (document.activeElement === input) {
        if (e.key === 'Escape') input.blur();
        return;
      }
      if (e.key === 'Enter') {
        input.focus();
        e.preventDefault();
      } else if (e.key === 'i' || e.key === 'I') this.toggle('inventory');
      else if (e.key === 's' || e.key === 'S') this.toggle('stats');
      else if (e.key === 'q' || e.key === 'Q') this.quickPotion();
      else if (e.key === 'Escape') this.toggle(null);
    }, sig);

    $('chat-log').innerHTML = '';
    $('death').classList.add('hidden');
    this.toggle(null);
    this.refresh();
  }

  destroy() {
    this.ac.abort();
    this.toggle(null);
  }

  // ------------------------------------------------------------ status

  refresh() {
    const { char: c, derived: d } = this.s;
    $('hud-name').textContent = c.name;
    $('hud-class').textContent = CLASSES[c.cls].name;
    $('hud-level').textContent = String(c.level);
    const bar = (id: string, cur: number, max: number, label: string) => {
      $(`hud-${id}-fill`).style.width = `${Math.max(0, Math.min(100, (cur / max) * 100))}%`;
      $(`hud-${id}`).textContent = label;
    };
    bar('hp', this.s.hp, d.maxHp, `HP ${Math.ceil(this.s.hp)} / ${d.maxHp}`);
    bar('sp', this.s.sp, d.maxSp, `SP ${Math.floor(this.s.sp)} / ${d.maxSp}`);
    const need = expToNext(c.level);
    bar('exp', c.exp, need, `EXP ${((c.exp / need) * 100).toFixed(1)}%`);
    $('hud-zeny').textContent = c.zeny.toLocaleString();
    const pts = $('hud-points');
    pts.textContent = String(c.stat_points);
    pts.classList.toggle('hidden', c.stat_points < 1);
    $('hud-potions').textContent = String(this.s.potionCount());
    // HP/SP tick every couple of seconds; only rebuild the open panel when its contents changed
    if (this.panel && this.panelSig() !== this.panelKey) this.renderPanel();
  }

  // ------------------------------------------------------------ panels

  toggle(kind: PanelKind) {
    this.panel = this.panel === kind ? null : kind;
    $('panel').classList.toggle('hidden', !this.panel);
    if (this.panel) this.renderPanel();
  }

  openShop() {
    this.panel = null;
    this.toggle('shop');
  }

  private panelSig() {
    const c = this.s.char;
    return JSON.stringify([c.level, c.zeny, c.stat_points, STAT_KEYS.map((k) => c[k]), this.s.inv]);
  }

  private renderPanel() {
    this.panelKey = this.panelSig();
    const body = $('panel-body');
    if (this.panel === 'inventory') {
      $('panel-title').textContent = '🎒 กระเป๋า';
      body.innerHTML = this.s.inv.length
        ? this.s.inv
            .slice()
            .sort((a, b) => Number(b.equipped) - Number(a.equipped))
            .map((i) => {
              const it = ITEMS[i.item_id];
              const info = it.type === 'weapon' ? `ATK ${it.atk}${it.matk ? ` MATK ${it.matk}` : ''}`
                : it.type === 'armor' ? `DEF ${it.def}`
                : it.heal ? `ฟื้น HP ${it.heal}` : it.sp ? `ฟื้น SP ${it.sp}` : 'ของสะสม ขายได้';
              const canUse = it.classes ? it.classes.includes(this.s.char.cls) : true;
              const btn = it.type === 'consumable' ? `<button class="small" data-use="${i.id}">ใช้</button>`
                : it.type === 'loot' ? ''
                : i.equipped ? `<button class="small ghost" data-unequip="${i.id}">ถอด</button>`
                : `<button class="small" data-equip="${i.id}" ${canUse ? '' : 'disabled title="อาชีพนี้ใช้ไม่ได้"'}>ใส่</button>`;
              return `<div class="item-row"><span class="icon" style="background:${it.color}"></span>
                <span class="name">${it.name} ${i.qty > 1 ? `×${i.qty}` : ''} ${i.equipped ? '<span class="eq">[ใส่อยู่]</span>' : ''}
                <small>${info}</small></span>${btn}</div>`;
            })
            .join('')
        : '<p class="panel-note">กระเป๋าว่าง</p>';
      this.bind(body, 'use', (id) => this.s.use(id));
      this.bind(body, 'equip', (id) => this.s.setEquipped(id, true));
      this.bind(body, 'unequip', (id) => this.s.setEquipped(id, false));
    } else if (this.panel === 'stats') {
      const c = this.s.char;
      const d = this.s.derived;
      $('panel-title').textContent = `📊 สเตตัส (เหลือ ${c.stat_points} แต้ม)`;
      body.innerHTML =
        STAT_KEYS.map(
          (k) => `<div class="stat-row"><span class="k">${k}</span><span class="v">${c[k]}</span>
            <small>${STAT_HELP[k]}</small>
            <button class="small" data-stat="${k}" ${c.stat_points < 1 || c[k] >= 99 ? 'disabled' : ''}>+</button></div>`,
        ).join('') +
        `<div class="derived">
          <span>ATK <b>${d.atk}</b></span><span>MATK <b>${d.matk}</b></span>
          <span>DEF <b>${d.def}</b></span><span>ตีทุก <b>${(d.attackDelay / 1000).toFixed(2)}s</b></span>
          <span>Max HP <b>${d.maxHp}</b></span><span>Max SP <b>${d.maxSp}</b></span>
        </div>
        <p class="panel-note">ได้ ${5} แต้มทุกครั้งที่เลเวลอัป</p>`;
      this.bind(body, 'stat', (k) => this.s.allocate(k as StatKey));
    } else if (this.panel === 'shop') {
      $('panel-title').textContent = `🏪 ร้านป้ามะลิ (มี ${this.s.char.zeny.toLocaleString()} z)`;
      const sellable = this.s.inv.filter((i) => !i.equipped);
      body.innerHTML =
        '<p class="panel-note">ซื้อ</p>' +
        SHOP.map((id) => {
          const it = ITEMS[id];
          const info = it.type === 'weapon' ? `ATK ${it.atk}${it.matk ? ` MATK ${it.matk}` : ''} · ${it.classes?.map((k) => CLASSES[k].name).join(', ')}`
            : it.type === 'armor' ? `DEF ${it.def}` : it.heal ? `ฟื้น HP ${it.heal}` : `ฟื้น SP ${it.sp}`;
          return `<div class="item-row"><span class="icon" style="background:${it.color}"></span>
            <span class="name">${it.name}<small>${info}</small></span>
            <span>${it.price} z</span>
            <button class="small" data-buy="${id}" ${this.s.char.zeny < it.price ? 'disabled' : ''}>ซื้อ</button></div>`;
        }).join('') +
        '<p class="panel-note">ขาย (ได้ครึ่งราคา)</p>' +
        (sellable.length
          ? sellable
              .map((i) => {
                const it = ITEMS[i.item_id];
                return `<div class="item-row"><span class="icon" style="background:${it.color}"></span>
                  <span class="name">${it.name} ${i.qty > 1 ? `×${i.qty}` : ''}</span>
                  <span>${Math.floor(it.price / 2)} z</span>
                  <button class="small ghost" data-sell="${i.id}">ขาย 1</button>
                  ${i.qty > 1 ? `<button class="small ghost" data-sellall="${i.id}">ทั้งหมด</button>` : ''}</div>`;
              })
              .join('')
          : '<p class="panel-note">ไม่มีของให้ขาย</p>');
      this.bind(body, 'buy', (id) => this.s.buy(id, 1));
      this.bind(body, 'sell', (id) => this.s.sell(id, 1));
      this.bind(body, 'sellall', (id) => this.s.sell(id, this.s.inv.find((i) => i.id === id)!.qty));
    }
  }

  private bind(root: HTMLElement, attr: string, fn: (v: string) => Promise<unknown>) {
    root.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        try {
          await fn(b.dataset[attr]!);
        } catch (e) {
          this.toast((e as Error).message, 'bad');
          b.disabled = false;
        }
      };
    });
  }

  private async quickPotion() {
    const p = this.s.quickPotion();
    if (!p) return this.toast('ไม่มียาฟื้น HP แล้ว ไปซื้อที่ร้านในเมือง', 'bad');
    if (this.s.hp >= this.s.derived.maxHp) return this.toast('HP เต็มอยู่แล้ว');
    try {
      const it = await this.s.use(p.id);
      this.toast(`ใช้ ${it.name}`);
    } catch (e) {
      this.toast((e as Error).message, 'bad');
    }
  }

  // ------------------------------------------------------------ chat, toasts, death

  chatLine(name: string, text: string) {
    const log = $('chat-log');
    const div = document.createElement('div');
    div.innerHTML = `<b>${escapeHtml(name)}:</b> ${escapeHtml(text)}`;
    log.appendChild(div);
    while (log.children.length > 60) log.firstChild!.remove();
    log.scrollTop = log.scrollHeight;
  }

  system(text: string) {
    const log = $('chat-log');
    const div = document.createElement('div');
    div.className = 'sys';
    div.textContent = text;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  }

  toast(text: string, kind?: 'good' | 'bad') {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind ?? ''}`;
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 5) box.firstChild!.remove();
    setTimeout(() => t.remove(), 2700);
  }

  showDeath() {
    this.toggle(null);
    $('death').classList.remove('hidden');
  }
}
