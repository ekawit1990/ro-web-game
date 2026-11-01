import type { SupabaseClient } from '@supabase/supabase-js';
import { Appearance, CLASSES, Character, ClassKey, FACES, HAIR_COLORS, HAIR_STYLES, JOB_CHANGE, START_CLASS } from '../data';
import type { GameStore } from '../services/store';
import { drawLook } from './icons';
import { vrmModelCount } from '../three/vrm';
import { USERNAME_RE, authEmail, normalizeUsername } from '../data/account';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function show(id: string | null) {
  for (const s of ['screen-login', 'screen-chars', 'screen-create', 'hud', 'loading']) $(s).classList.toggle('hidden', s !== id);
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type AuthMode = 'login' | 'signup' | 'forgot' | 'reset' | 'claim';

/** ws://host -> http://host, wss://host -> https://host (account endpoints live on the game server). */
export const httpBase = (wsUrl: string) => wsUrl.replace(/^ws/, 'http').replace(/\/+$/, '');

async function api(base: string, path: string, body: unknown, token?: string): Promise<Record<string, unknown>> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000); // free server may take ~1 min to wake up
  try {
    const r = await fetch(`${base}${path}`, {
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

/** Resolves once the player is signed in. Accounts use a username + password; see src/data/account.ts. */
export function loginScreen(sb: SupabaseClient, apiBase: string): Promise<void> {
  show('screen-login');
  const msg = $('login-msg');
  const ok = $('login-ok');
  const val = (id: string) => $<HTMLInputElement>(id).value;

  const go = (mode: AuthMode) => {
    document.querySelectorAll<HTMLFormElement>('#screen-login .auth-mode').forEach((f) => f.classList.toggle('hidden', f.dataset.mode !== mode));
    msg.textContent = '';
    ok.textContent = '';
    document.querySelector<HTMLInputElement>(`#screen-login [data-mode="${mode}"] input`)?.focus();
  };
  go('login');

  return new Promise((resolve) => {
    // run a form action with the buttons locked and errors shown under the card
    const run = (form: HTMLFormElement, fn: () => Promise<void>, wait = '') => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btns = form.querySelectorAll('button');
        btns.forEach((x) => (x.disabled = true));
        msg.textContent = '';
        ok.textContent = wait;
        try {
          await fn();
        } catch (err) {
          ok.textContent = '';
          msg.textContent = (err as Error).message;
        } finally {
          btns.forEach((x) => (x.disabled = false));
        }
      };
    };

    document.querySelectorAll<HTMLElement>('#screen-login [data-go]').forEach((el) => {
      el.onclick = (e) => {
        e.preventDefault();
        const mode = el.dataset.go as AuthMode;
        if (mode === 'forgot') $<HTMLInputElement>('fg-user').value = normalizeUsername(val('login-user')).includes('@') ? '' : val('login-user');
        if (mode === 'reset') $<HTMLInputElement>('rs-user').value = val('fg-user');
        go(mode);
      };
    });

    const signIn = async (login: string, password: string) => {
      const legacy = login.includes('@'); // accounts made before usernames sign in with their email
      const { error } = await sb.auth.signInWithPassword({ email: legacy ? login.trim() : authEmail(login), password });
      if (error) {
        if (error.message === 'Invalid login credentials') throw new Error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        if (/not confirmed/i.test(error.message)) throw new Error('อีเมลนี้ยังไม่ได้ยืนยัน กรุณากดลิงก์ยืนยันในอีเมลก่อน');
        throw new Error(error.message);
      }
      if (legacy) {
        // no username yet? offer to pick one now (needs the new setup.sql; skip quietly if it isn't there)
        const { data, error: e2 } = await sb.from('accounts').select('username').maybeSingle();
        if (!e2 && !data) {
          go('claim');
          return;
        }
      }
      resolve();
    };

    run($<HTMLFormElement>('login-form'), () => signIn(val('login-user'), val('login-password')));

    run(
      $<HTMLFormElement>('signup-form'),
      async () => {
        const username = normalizeUsername(val('su-user'));
        if (!USERNAME_RE.test(username)) throw new Error('ชื่อผู้ใช้ต้องยาว 4–16 ตัว ใช้ได้เฉพาะ a-z, 0-9 และ _');
        if (val('su-password') !== val('su-password2')) throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
        await api(apiBase, '/auth/register', { username, password: val('su-password'), email: val('su-email') });
        await signIn(username, val('su-password'));
      },
      'กำลังสมัคร... (ถ้าเซิร์ฟเวอร์เพิ่งตื่นอาจใช้เวลาเกือบ 1 นาที)',
    );

    run(
      $<HTMLFormElement>('forgot-form'),
      async () => {
        await api(apiBase, '/auth/forgot', { username: normalizeUsername(val('fg-user')), email: val('fg-email') });
        $<HTMLInputElement>('rs-user').value = val('fg-user');
        go('reset');
        ok.textContent = 'ถ้าชื่อผู้ใช้และอีเมลตรงกัน ระบบได้ส่งรหัส 6 หลักไปที่อีเมลแล้ว (ดูในกล่องจดหมายขยะด้วย)';
      },
      'กำลังส่งอีเมล...',
    );

    run($<HTMLFormElement>('reset-form'), async () => {
      if (val('rs-password') !== val('rs-password2')) throw new Error('รหัสผ่านทั้งสองช่องไม่ตรงกัน');
      const username = normalizeUsername(val('rs-user'));
      await api(apiBase, '/auth/reset', { username, code: val('rs-code'), password: val('rs-password') });
      $<HTMLInputElement>('login-user').value = username;
      $<HTMLInputElement>('login-password').value = '';
      go('login');
      ok.textContent = 'เปลี่ยนรหัสผ่านแล้ว เข้าสู่ระบบด้วยรหัสผ่านใหม่ได้เลย';
    });

    run(
      $<HTMLFormElement>('claim-form'),
      async () => {
        const username = normalizeUsername(val('cl-user'));
        if (!USERNAME_RE.test(username)) throw new Error('ชื่อผู้ใช้ต้องยาว 4–16 ตัว ใช้ได้เฉพาะ a-z, 0-9 และ _');
        const token = (await sb.auth.getSession()).data.session?.access_token;
        await api(apiBase, '/auth/claim', { username }, token);
        await sb.auth.refreshSession();
        alert(`ตั้งชื่อผู้ใช้ "${username}" แล้ว ครั้งหน้าเข้าสู่ระบบด้วยชื่อนี้และรหัสผ่านเดิม`);
        resolve();
      },
      'กำลังบันทึก...',
    );
    $('cl-skip').onclick = () => resolve();
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

/**
 * Character creator: players only pick their hair and face (plus gender). Everyone starts as a Teen in the
 * same armour; the class 2 job comes later from the job-change teacher. Resolves true if a character was made.
 */
function createScreen(store: GameStore): Promise<boolean> {
  show('screen-create');
  const look: Appearance & { cls: ClassKey } = { gender: 'm', hair: 0, hair_color: 0, face: 0, cls: START_CLASS };
  let dir: 'f' | 'b' = 'f';
  const cv = $<HTMLCanvasElement>('create-preview');
  const msg = $('create-msg');
  msg.textContent = '';
  $<HTMLInputElement>('create-name').value = '';

  // with VRoid models installed, the "hair style" control picks the model instead (and hair colour may not apply)
  let styles = HAIR_STYLES;
  let models = false;
  const countStyles = () =>
    vrmModelCount(look.gender).then(({ count, tintHair }) => {
      models = count > 0;
      styles = models ? count : HAIR_STYLES;
      look.hair %= styles;
      $('lbl-hair').textContent = models ? 'ทรงผม+หน้า' : 'ทรงผม';
      $('row-color').classList.toggle('hidden', models && !tintHair);
      $('val-hair').textContent = `${look.hair + 1} / ${styles}`;
    });
  const draw = () => {
    drawLook(cv, look, dir);
    $('val-hair').textContent = `${look.hair + 1} / ${styles}`;
    $('val-face').textContent = `${look.face + 1} / ${FACES}`;
    document.querySelectorAll('[data-gender]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.gender === look.gender));
    document.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', Number((b as HTMLElement).dataset.color) === look.hair_color));
  };
  const c = CLASSES[START_CLASS];
  $('cls-desc').innerHTML = `<b style="color:${c.color}">${c.name}</b> (มีดสั้น) ทุกคนเริ่มที่อาชีพนี้ในชุดเกราะเดียวกัน<br>`
    + `ถึง Base Lv ${JOB_CHANGE.level} ไปหาครูแนะแนวอาชีพในเมือง เพื่อเป็น นักร้อง กีตาร์ เบส กลอง หรือคีย์บอร์ด`;

  $('hair-colors').innerHTML = HAIR_COLORS.map((h, i) => `<button type="button" data-color="${i}" style="background:${h}"></button>`).join('');

  const wrap = (v: number, n: number) => (v + n) % n;
  const bind = (sel: string, fn: (el: HTMLElement) => void) =>
    document.querySelectorAll<HTMLElement>(sel).forEach((el) => (el.onclick = () => {
      fn(el);
      draw();
    }));
  bind('[data-gender]', (el) => {
    look.gender = el.dataset.gender as 'm' | 'f';
    countStyles().then(draw);
  });
  bind('[data-color]', (el) => (look.hair_color = Number(el.dataset.color)));
  bind('#hair-prev', () => (look.hair = wrap(look.hair - 1, styles)));
  bind('#hair-next', () => (look.hair = wrap(look.hair + 1, styles)));
  bind('#face-prev', () => (look.face = wrap(look.face - 1, FACES)));
  bind('#face-next', () => (look.face = wrap(look.face + 1, FACES)));
  bind('#btn-turn', () => (dir = dir === 'f' ? 'b' : 'f'));
  bind('#btn-random', () => {
    look.gender = Math.random() < 0.5 ? 'm' : 'f';
    countStyles().then(() => {
      look.hair = Math.floor(Math.random() * styles);
      draw();
    });
    look.hair_color = Math.floor(Math.random() * HAIR_COLORS.length);
    look.face = Math.floor(Math.random() * FACES);
  });
  draw();
  countStyles();

  return new Promise((resolve) => {
    $<HTMLFormElement>('create-form').onsubmit = async (e) => {
      e.preventDefault();
      msg.textContent = '';
      try {
        const { cls: _cls, ...appearance } = look;
        await store.createCharacter($<HTMLInputElement>('create-name').value, appearance);
        resolve(true);
      } catch (err) {
        msg.textContent = (err as Error).message;
      }
    };
    $('btn-create-cancel').onclick = () => resolve(false);
  });
}
