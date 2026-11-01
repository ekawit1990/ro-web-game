// Account endpoints (username + password sign-up, password recovery by phone number).
// They need the service role key, so they live on the game server, not in the browser.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { USERNAME_RE, authEmail, normalizePhone, normalizeUsername } from '../../src/data/account.ts';

type Req = IncomingMessage & { body?: unknown; ip?: string };
type Res = ServerResponse & { status?: unknown };
interface App {
  use(fn: (req: Req, res: Res, next: () => void) => void): void;
  post(path: string, fn: (req: Req, res: Res) => void): void;
}

class Fail extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

/** wrong phone numbers allowed per account per hour, so nobody can guess one */
const MAX_PHONE_FAILS = 5;
const FAIL_WINDOW_MS = 60 * 60_000;

function send(res: Res, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Fail(413, 'ข้อมูลใหญ่เกินไป');
  }
  try {
    const v = JSON.parse(raw || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new Fail(400, 'ข้อมูลไม่ถูกต้อง');
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function checkUsername(u: string) {
  if (!USERNAME_RE.test(u)) throw new Fail(400, 'ชื่อผู้ใช้ต้องยาว 4–16 ตัว ใช้ได้เฉพาะ a-z, 0-9 และ _');
}
function checkPassword(p: string) {
  if (p.length < 6 || p.length > 72) throw new Fail(400, 'รหัสผ่านต้องยาว 6–72 ตัว');
}
function checkPhone(raw: string) {
  const p = normalizePhone(raw);
  if (!p) throw new Fail(400, 'เบอร์โทรศัพท์ไม่ถูกต้อง (เช่น 0812345678)');
  return p;
}

/** Very small per-IP limiter so nobody can hammer sign-up or guess reset codes. */
function limiter(max: number, windowMs: number) {
  const hits = new Map<string, { n: number; until: number }>();
  return (ip: string) => {
    const now = Date.now();
    const h = hits.get(ip);
    if (!h || h.until < now) {
      hits.set(ip, { n: 1, until: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
      return;
    }
    if (++h.n > max) throw new Fail(429, 'ลองบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
  };
}

function clientIp(req: Req) {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || '?';
}

export function setupAuthRoutes(app: App, url: string | undefined, serviceKey: string | undefined) {
  const sb: SupabaseClient | null =
    url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const signupLimit = limiter(10, 60 * 60_000);
  const forgotLimit = limiter(30, 60 * 60_000);

  // CORS: the web client is on another domain (Cloudflare Pages). No cookies are used.
  app.use((req, res, next) => {
    if (!req.url?.startsWith('/auth/')) return next();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  });

  const route = (path: string, fn: (body: Record<string, unknown>, req: Req, db: SupabaseClient) => Promise<unknown>) =>
    app.post(path, async (req, res) => {
      try {
        if (!sb) throw new Fail(503, 'เซิร์ฟเวอร์ยังไม่ได้เชื่อมฐานข้อมูล');
        send(res, 200, (await fn(await readJson(req), req, sb)) ?? { ok: true });
      } catch (e) {
        const code = e instanceof Fail ? e.code : 500;
        if (code === 500) console.error(`${path}:`, e);
        send(res, code, { error: code === 500 ? 'เซิร์ฟเวอร์ขัดข้อง ลองใหม่อีกครั้ง' : (e as Error).message });
      }
    });

  const findAccount = async (db: SupabaseClient, username: string) => {
    const { data, error } = await db.from('accounts').select('user_id,recovery_phone').eq('username', username).maybeSingle();
    if (error) throw error;
    return data as { user_id: string; recovery_phone: string } | null;
  };

  // 1) sign up: username + password + recovery phone number
  route('/auth/register', async (b, req, db) => {
    const username = normalizeUsername(str(b.username));
    const password = str(b.password);
    checkUsername(username);
    checkPassword(password);
    const phone = checkPhone(str(b.phone));
    signupLimit(clientIp(req));
    if (await findAccount(db, username)) throw new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');

    const { data, error } = await db.auth.admin.createUser({
      email: authEmail(username),
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error || !data.user) {
      if (/already|registered|exists/i.test(error?.message ?? '')) throw new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');
      throw error ?? new Error('createUser failed');
    }
    const ins = await db.from('accounts').insert({ user_id: data.user.id, username, recovery_phone: phone });
    if (ins.error) {
      await db.auth.admin.deleteUser(data.user.id);
      if (ins.error.code === '23505') throw new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');
      throw ins.error;
    }
    return { ok: true };
  });

  /** username + the phone given at sign-up; counts wrong numbers per account */
  const verifyPhone = async (db: SupabaseClient, b: Record<string, unknown>) => {
    const username = normalizeUsername(str(b.username));
    checkUsername(username);
    const phone = checkPhone(str(b.phone));
    const wrong = new Fail(400, 'ชื่อผู้ใช้หรือเบอร์โทรศัพท์ไม่ถูกต้อง');
    const acc = await findAccount(db, username);
    if (!acc) throw wrong;

    const { data: att } = await db.from('reset_attempts').select('fails,window_start').eq('user_id', acc.user_id).maybeSingle();
    const fresh = !att || Date.now() - new Date(att.window_start).getTime() > FAIL_WINDOW_MS;
    const fails = fresh ? 0 : att.fails;
    if (fails >= MAX_PHONE_FAILS) throw new Fail(429, 'ใส่เบอร์ผิดหลายครั้งเกินไป กรุณารอ 1 ชั่วโมงแล้วลองใหม่');

    if (normalizePhone(acc.recovery_phone) !== phone) {
      await db.from('reset_attempts').upsert({
        user_id: acc.user_id,
        fails: fails + 1,
        window_start: fresh ? new Date().toISOString() : att!.window_start,
      });
      throw wrong;
    }
    return acc;
  };

  // 2) forgot password, step 1: check username + phone (the browser then asks for a new password)
  route('/auth/verify-phone', async (b, req, db) => {
    forgotLimit(clientIp(req));
    await verifyPhone(db, b);
    return { ok: true };
  });

  // 3) forgot password, step 2: username + phone again + the new password
  route('/auth/reset', async (b, req, db) => {
    forgotLimit(clientIp(req));
    const password = str(b.password);
    checkPassword(password);
    const acc = await verifyPhone(db, b);
    const { error } = await db.auth.admin.updateUserById(acc.user_id, { password });
    if (error) throw error;
    await db.from('reset_attempts').delete().eq('user_id', acc.user_id);
    return { ok: true };
  });

  // 4) older accounts (signed up with a real email) pick a username once
  route('/auth/claim', async (b, req, db) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: ue } = await db.auth.getUser(token);
    if (ue || !u.user) throw new Fail(401, 'กรุณาเข้าสู่ระบบใหม่');
    const username = normalizeUsername(str(b.username));
    checkUsername(username);
    const phone = checkPhone(str(b.phone));
    signupLimit(clientIp(req));

    const mine = await db.from('accounts').select('username').eq('user_id', u.user.id).maybeSingle();
    if (mine.data) throw new Fail(409, `บัญชีนี้มีชื่อผู้ใช้แล้ว (${mine.data.username})`);
    if (await findAccount(db, username)) throw new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');

    const ins = await db.from('accounts').insert({ user_id: u.user.id, username, recovery_phone: phone });
    if (ins.error) throw ins.error.code === '23505' ? new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว') : ins.error;
    const { error } = await db.auth.admin.updateUserById(u.user.id, {
      email: authEmail(username),
      email_confirm: true,
      user_metadata: { ...u.user.user_metadata, username },
    });
    if (error) {
      await db.from('accounts').delete().eq('user_id', u.user.id);
      if (/already|registered|exists/i.test(error.message)) throw new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');
      throw error;
    }
    return { ok: true, username };
  });

}
