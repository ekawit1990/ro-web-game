import type { SupabaseClient } from '@supabase/supabase-js';
import { CLASSES, Character, ClassKey } from '../data';
import type { GameStore } from '../services/store';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function show(id: string | null) {
  for (const s of ['screen-login', 'screen-chars', 'hud', 'loading']) $(s).classList.toggle('hidden', s !== id);
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

/** Resolves with the chosen character, or null if the player signed out. */
export function characterScreen(store: GameStore): Promise<Character | null> {
  show('screen-chars');
  const msg = $('chars-msg');
  const list = $('char-list');
  const pick = $('class-pick');
  msg.textContent = '';
  store.userLabel().then((u) => ($('chars-user').textContent = store.online ? u : `${u} (เซฟไว้ในเบราว์เซอร์นี้)`));

  pick.innerHTML = (Object.entries(CLASSES) as [ClassKey, (typeof CLASSES)[ClassKey]][])
    .map(
      ([k, c], i) => `<label><input type="radio" name="cls" value="${k}" ${i === 0 ? 'checked' : ''}/>
        <span style="color:${c.color}">●</span> ${c.name}
        <small>${c.desc}</small></label>`,
    )
    .join('');

  return new Promise((resolve) => {
    const render = async () => {
      try {
        const chars = await store.listCharacters();
        list.innerHTML = chars.length
          ? chars
              .map(
                (c) => `<div class="char-item">
                  <span class="dot" style="background:${CLASSES[c.cls].color}"></span>
                  <div class="info"><b>${escapeHtml(c.name)}</b><small>${CLASSES[c.cls].name} · Lv ${c.level} · ${c.zeny} z</small></div>
                  <button data-play="${c.id}">เล่น</button>
                  <button class="ghost small" data-del="${c.id}" title="ลบ">🗑</button>
                </div>`,
              )
              .join('')
          : '<p class="sub">ยังไม่มีตัวละคร สร้างตัวแรกด้านล่างเลย</p>';
        $('create-form').classList.toggle('hidden', chars.length >= 3);
        list.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) => {
          b.onclick = () => resolve(chars.find((c) => c.id === b.dataset.play)!);
        });
        list.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => {
          b.onclick = async () => {
            const c = chars.find((x) => x.id === b.dataset.del)!;
            if (!confirm(`ลบ ${c.name} ถาวรเลยนะ?`)) return;
            await store.deleteCharacter(c.id);
            render();
          };
        });
      } catch (e) {
        msg.textContent = (e as Error).message;
      }
    };

    $<HTMLFormElement>('create-form').onsubmit = async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const name = $<HTMLInputElement>('create-name');
      const cls = (pick.querySelector('input:checked') as HTMLInputElement).value as ClassKey;
      try {
        await store.createCharacter(name.value, cls);
        name.value = '';
        render();
      } catch (err) {
        msg.textContent = (err as Error).message;
      }
    };

    $('btn-signout').classList.toggle('hidden', !store.online);
    $('btn-signout').onclick = async () => {
      await store.signOut();
      resolve(null);
    };

    render();
  });
}
