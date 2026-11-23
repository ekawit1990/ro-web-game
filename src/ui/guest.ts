// "เริ่มเล่นทันที": play without signing up. The game server makes a real account with a random login
// (server/src/auth.ts /auth/guest) that this browser keeps; at Base Lv 10 the player is asked to bind a
// username + password + phone to it (/auth/link). Same user id, so characters and items stay.
import type { SupabaseClient } from '@supabase/supabase-js';
import { GUEST_BIND_LEVEL, USERNAME_RE, authEmail, normalizePhone, normalizeUsername } from '../data/account';
import { supabase } from '../services/supabase';

const KEY = 'ml_guest_login';
let apiBase = '';

/** Where the account endpoints live (the game server); set once from main.ts. */
export function setGuestApi(base: string) {
  apiBase = base;
}

export interface GuestLogin {
  login: string;
  password: string;
}

export function savedGuest(): GuestLogin | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.login === 'string' && typeof v.password === 'string' ? v : null;
  } catch {
    return null;
  }
}

function saveGuest(g: GuestLogin | null) {
  try {
    if (g) localStorage.setItem(KEY, JSON.stringify(g));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: the session itself still keeps them signed in for now */
  }
}

/** The signed-in account is a guest that hasn't picked a username yet. */
export async function isGuest(sb: SupabaseClient | null = supabase) {
  if (!sb) return false;
  const { data } = await sb.auth.getSession();
  return data.session?.user.user_metadata?.guest === true;
}

export async function api(path: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000); // free server may take ~1 min to wake up
  try {
    const r = await fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${r.status})`);
    return j;
  } catch (e) {
    if (e instanceof TypeError || (e as Error).name === 'AbortError') throw new Error('เชื่อมต่อเซิร์ฟเวอร์เกมไม่ได้ ลองใหม่อีกครั้ง');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Sign in as this browser's guest, making one first if there isn't one (or it was cleaned up). */
export async function playAsGuest(sb: SupabaseClient) {
  const old = savedGuest();
  if (old) {
    const { error } = await sb.auth.signInWithPassword({ email: old.login, password: old.password });
    if (!error) return;
    if (error.message !== 'Invalid login credentials') throw new Error(error.message);
    saveGuest(null); // removed by the clean-up (unused for a long time): start a fresh one
  }
  const r = await api('/auth/guest', {});
  const g = { login: String(r.login), password: String(r.password) };
  saveGuest(g);
  const { error } = await sb.auth.signInWithPassword({ email: g.login, password: g.password });
  if (error) throw new Error(error.message);
}

/**
 * The "ผูกบัญชี" window. `forced` (reached Lv 10) changes the wording; the player can still close it and is asked
 * again on the next game entry. Resolves true once the account is bound.
 */
export function bindDialog(level?: number): Promise<boolean> {
  const sb = supabase;
  if (!sb) return Promise.resolve(false);
  document.querySelector('.bind-ov')?.remove();
  const reached = level !== undefined && level >= GUEST_BIND_LEVEL;
  const ov = document.createElement('div');
  ov.className = 'bind-ov';
  ov.innerHTML = `<form class="card bind-card" autocomplete="on">
    <h2>${reached ? `🎉 ถึง Lv ${GUEST_BIND_LEVEL} แล้ว!` : '💾 ผูกบัญชี'}</h2>
    <p class="auth-hint">${reached
      ? 'ตอนนี้เล่นอยู่ด้วยบัญชีชั่วคราวที่เก็บไว้ในเบราว์เซอร์นี้เท่านั้น ตั้งชื่อผู้ใช้กับรหัสผ่านไว้ ตัวละครและของทุกชิ้นจะอยู่ครบ เข้าจากเครื่องไหนก็ได้'
      : 'ตั้งชื่อผู้ใช้กับรหัสผ่าน แล้วตัวละครและของทั้งหมดจะย้ายมาอยู่บัญชีนี้ เข้าจากเครื่องไหนก็ได้'}</p>
    <input name="u" type="text" placeholder="ชื่อผู้ใช้ (a-z, 0-9, _ 4–16 ตัว)" autocomplete="username" autocapitalize="none" spellcheck="false" pattern="[A-Za-z0-9_]{4,16}" maxlength="16" required />
    <input name="p" type="password" placeholder="รหัสผ่าน (6 ตัวขึ้นไป)" autocomplete="new-password" minlength="6" maxlength="72" required />
    <input name="p2" type="password" placeholder="ยืนยันรหัสผ่าน" autocomplete="new-password" minlength="6" maxlength="72" required />
    <input name="t" type="tel" placeholder="เบอร์โทรศัพท์ (ไว้กู้รหัสผ่าน)" autocomplete="tel" inputmode="tel" maxlength="16" required />
    <p class="msg bind-msg"></p>
    <div class="row">
      <button type="submit">ผูกบัญชี</button>
      <button type="button" class="ghost bind-later">ไว้ทีหลัง</button>
    </div>
    ${reached ? '<p class="auth-hint">⚠ ถ้าล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่องก่อนผูกบัญชี ตัวละครนี้จะเข้าไม่ได้อีก</p>' : ''}
  </form>`;
  const form = ov.querySelector('form')!;
  const msg = ov.querySelector<HTMLElement>('.bind-msg')!;
  const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
  // keys typed here must not walk the character or fire skills
  for (const t of ['keydown', 'keyup', 'pointerdown', 'wheel'] as const) ov.addEventListener(t, (e) => e.stopPropagation());
  document.body.appendChild(ov);

  return new Promise((resolve) => {
    const close = (ok: boolean) => {
      ov.remove();
      resolve(ok);
    };
    ov.querySelector<HTMLButtonElement>('.bind-later')!.onclick = () => close(false);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btns = form.querySelectorAll('button');
      btns.forEach((b) => (b.disabled = true));
      msg.classList.remove('ok');
      msg.textContent = 'กำลังบันทึก... (ถ้าเซิร์ฟเวอร์เพิ่งตื่นอาจใช้เวลาเกือบ 1 นาที)';
      try {
        const username = normalizeUsername(val('u'));
        if (!USERNAME_RE.test(username)) throw new Error('ชื่อผู้ใช้ต้องยาว 4–16 ตัว ใช้ได้เฉพาะ a-z, 0-9 และ _');
        if (val('p') !== val('p2')) throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        if (!normalizePhone(val('t'))) throw new Error('เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)');
        const token = (await sb.auth.getSession()).data.session?.access_token;
        await api('/auth/link', { username, password: val('p'), phone: val('t') }, token);
        // fresh session with the new login (the old token still says guest)
        const { error } = await sb.auth.signInWithPassword({ email: authEmail(username), password: val('p') });
        if (error) await sb.auth.refreshSession().catch(() => undefined);
        saveGuest(null);
        form.innerHTML = `<h2>✅ ผูกบัญชีแล้ว</h2>
          <p class="auth-hint">ครั้งหน้าเข้าสู่ระบบด้วยชื่อผู้ใช้ <b></b> และรหัสผ่านที่เพิ่งตั้ง</p>
          <div class="row"><button type="button" class="bind-done">เล่นต่อ</button></div>`;
        form.querySelector('b')!.textContent = username;
        form.querySelector<HTMLButtonElement>('.bind-done')!.onclick = () => close(true);
      } catch (err) {
        msg.textContent = (err as Error).message;
        btns.forEach((b) => (b.disabled = false));
      }
    };
    form.querySelector('input')?.focus();
  });
}
