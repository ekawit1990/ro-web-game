import type { SupabaseClient } from '@supabase/supabase-js';
import { Appearance, CLASSES, CLASS_KEYS, Character, ClassKey, FACES, HAIR_COLORS, HAIR_STYLES } from '../data';
import type { GameStore } from '../services/store';
import { drawLook } from './icons';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function show(id: string | null) {
  for (const s of ['screen-login', 'screen-chars', 'screen-create', 'hud', 'loading']) $(s).classList.toggle('hidden', s !== id);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Resolves once the player is signed in. */
export function loginScreen(sb: SupabaseClient): Promise<void> {
  show('screen-login');
  const msg = $('login-msg');
  const email = $<HTMLInputElement>('login-email');
  const pass = $<HTMLInputElement>('login-password');
  msg.textContent = '';

  return new Promise((resolve) => {
    const form = $<HTMLFormElement>('login-form');
    const busy = (b: boolean) => form.querySelectorAll('button').forEach((x) => (x.disabled = b));

    form.onsubmit = async (e) => {
      e.preventDefault();
      busy(true);
      msg.textContent = '';
      const { error } = await sb.auth.signInWithPassword({ email: email.value, password: pass.value });
      busy(false);
      if (error) msg.textContent = error.message === 'Invalid login credentials' ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : error.message;
      else resolve();
    };

    $('btn-signup').onclick = async () => {
      if (!form.reportValidity()) return;
      busy(true);
      msg.textContent = '';
      const { data, error } = await sb.auth.signUp({ email: email.value, password: pass.value });
      busy(false);
      if (error) msg.textContent = error.message;
      else if (data.session) resolve();
      else msg.textContent = 'สมัครแล้ว! กรุณายืนยันอีเมลก่อน แล้วกลับมาเข้าสู่ระบบ';
    };
  });
}

/** RO-style character select: 3 slots, each empty slot opens the creator. Resolves null on sign-out. */
export function characterScreen(store: GameStore): Promise<Character | null> {
  show('screen-chars');
  const msg = $('chars-msg');
  const slots = $('char-slots');
  msg.textContent = '';
  store.userLabel().then((u) => ($('chars-user').textContent = store.online ? u : `${u} (เซฟไว้ในเบราว์เซอร์นี้)`));

  return new Promise((resolve) => {
    let chars: Character[] = [];
    let selected = 0;

    const detail = () => {
      const c = chars[selected];
      $('char-detail').innerHTML = c
        ? `<b>${escapeHtml(c.name)}</b><div class="cd-grid">
            <span>อาชีพ</span><b>${CLASSES[c.cls].name}</b><span>Base Lv</span><b>${c.level}</b>
            <span>Job Lv</span><b>${c.job_level}</b><span>Zeny</span><b>${c.zeny.toLocaleString()}</b>
            <span>Str</span><b>${c.str}</b><span>Agi</span><b>${c.agi}</b><span>Vit</span><b>${c.vit}</b>
            <span>Int</span><b>${c.int}</b><span>Dex</span><b>${c.dex}</b><span>Luk</span><b>${c.luk}</b></div>`
        : '<p class="sub">ช่องว่าง: กด "สร้าง" เพื่อสร้างตัวละครใหม่</p>';
      $<HTMLButtonElement>('btn-play').disabled = !c;
      $<HTMLButtonElement>('btn-delete').disabled = !c;
      $('btn-make').classList.toggle('hidden', !!c);
      slots.querySelectorAll('.slot').forEach((s, i) => s.classList.toggle('on', i === selected));
    };

    const render = async () => {
      try {
        chars = await store.listCharacters();
      } catch (e) {
        msg.textContent = (e as Error).message;
      }
      slots.innerHTML = [0, 1, 2]
        .map((i) => {
          const c = chars[i];
          return `<div class="slot ${c ? '' : 'empty'}" data-i="${i}">
            ${c ? `<canvas width="90" height="126"></canvas><b>${escapeHtml(c.name)}</b><small>${CLASSES[c.cls].name} Lv ${c.level}</small>`
              : '<span class="plus">+</span><small>ช่องว่าง</small>'}
          </div>`;
        })
        .join('');
      slots.querySelectorAll<HTMLElement>('.slot').forEach((el) => {
        const i = Number(el.dataset.i);
        const c = chars[i];
        if (c) drawLook(el.querySelector('canvas')!, { ...c, cls: c.cls }, 'f');
        el.onclick = () => {
          selected = i;
          detail();
        };
        el.ondblclick = () => (c ? resolve(c) : make());
      });
      if (selected >= 3) selected = 0;
      detail();
    };

    const make = async () => {
      const created = await createScreen(store);
      show('screen-chars');
      if (created) selected = chars.length;
      render();
    };

    $('btn-play').onclick = () => chars[selected] && resolve(chars[selected]);
    $('btn-make').onclick = make;
    $('btn-delete').onclick = async () => {
      const c = chars[selected];
      if (!c || !confirm(`ลบ ${c.name} ถาวรเลยนะ?`)) return;
      await store.deleteCharacter(c.id);
      render();
    };
    $('btn-signout').classList.toggle('hidden', !store.online);
    $('btn-signout').onclick = async () => {
      await store.signOut();
      resolve(null);
    };
    render();
  });
}

/** Character creator with gender, hair style, hair colour, face and class. Resolves true if a character was made. */
function createScreen(store: GameStore): Promise<boolean> {
  show('screen-create');
  const look: Appearance & { cls: ClassKey } = { gender: 'm', hair: 0, hair_color: 0, face: 0, cls: 'singer' };
  let dir: 'f' | 'b' = 'f';
  const cv = $<HTMLCanvasElement>('create-preview');
  const msg = $('create-msg');
  msg.textContent = '';
  $<HTMLInputElement>('create-name').value = '';

  const draw = () => {
    drawLook(cv, look, dir);
    $('val-hair').textContent = `${look.hair + 1} / ${HAIR_STYLES}`;
    $('val-face').textContent = `${look.face + 1} / ${FACES}`;
    document.querySelectorAll('[data-gender]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.gender === look.gender));
    document.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', Number((b as HTMLElement).dataset.color) === look.hair_color));
    document.querySelectorAll('[data-cls]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.cls === look.cls));
    const c = CLASSES[look.cls];
    $('cls-desc').innerHTML = `<b style="color:${c.color}">${c.name}</b> ${escapeHtml(c.desc)}`;
  };

  $('hair-colors').innerHTML = HAIR_COLORS.map((h, i) => `<button type="button" data-color="${i}" style="background:${h}"></button>`).join('');
  $('cls-pick').innerHTML = CLASS_KEYS.map((k) => `<button type="button" data-cls="${k}"><canvas width="44" height="62"></canvas>${CLASSES[k].name}</button>`).join('');
  document.querySelectorAll<HTMLElement>('[data-cls]').forEach((b) => {
    drawLook(b.querySelector('canvas')!, { ...look, cls: b.dataset.cls as ClassKey }, 'f');
  });

  const wrap = (v: number, n: number) => (v + n) % n;
  const bind = (sel: string, fn: (el: HTMLElement) => void) =>
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => (el.onclick = () => {
      fn(el);
      draw();
    }));
  bind('[data-gender]', (el) => (look.gender = el.dataset.gender as 'm' | 'f'));
  bind('[data-color]', (el) => (look.hair_color = Number(el.dataset.color)));
  bind('[data-cls]', (el) => (look.cls = el.dataset.cls as ClassKey));
  bind('#hair-prev', () => (look.hair = wrap(look.hair - 1, HAIR_STYLES)));
  bind('#hair-next', () => (look.hair = wrap(look.hair + 1, HAIR_STYLES)));
  bind('#face-prev', () => (look.face = wrap(look.face - 1, FACES)));
  bind('#face-next', () => (look.face = wrap(look.face + 1, FACES)));
  bind('#btn-turn', () => (dir = dir === 'f' ? 'b' : 'f'));
  bind('#btn-random', () => {
    look.gender = Math.random() < 0.5 ? 'm' : 'f';
    look.hair = Math.floor(Math.random() * HAIR_STYLES);
    look.hair_color = Math.floor(Math.random() * HAIR_COLORS.length);
    look.face = Math.floor(Math.random() * FACES);
  });
  draw();

  return new Promise((resolve) => {
    $<HTMLFormElement>('create-form').onsubmit = async (e) => {
      e.preventDefault();
      msg.textContent = '';
      try {
        const { cls, ...appearance } = look;
        await store.createCharacter($<HTMLInputElement>('create-name').value, cls, appearance);
        resolve(true);
      } catch (err) {
        msg.textContent = (err as Error).message;
      }
    };
    $('btn-create-cancel').onclick = () => resolve(false);
  });
}
