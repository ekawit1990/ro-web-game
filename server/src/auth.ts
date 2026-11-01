// Account endpoints (username + password sign-up, password recovery by email).
// They need the service role key, so they live on the game server, not in the browser.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import { EMAIL_RE, USERNAME_RE, authEmail, normalizeUsername } from '../../src/data/account.ts';

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

const CODE_TTL_MIN = 15;
const MAX_CODE_TRIES = 5;

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
function checkEmail(e: string) {
  if (!EMAIL_RE.test(e) || e.length > 254) throw new Fail(400, 'รูปแบบอีเมลไม่ถูกต้อง');
}

const hashCode = (userId: string, code: string) => createHash('sha256').update(`${userId}:${code}`).digest('hex');

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

function mailer() {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === 'production') return null;
    // local testing: print the mail instead of sending it
    return async (to: string, subject: string, text: string) => console.log(`[mail to ${to}] ${subject}\n${text}`);
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'Music Land <no-reply@localhost>';
  return (to: string, subject: string, text: string) => transport.sendMail({ from, to, subject, text });
}

export function setupAuthRoutes(app: App, url: string | undefined, serviceKey: string | undefined) {
  const sb: SupabaseClient | null =
    url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const mail = mailer();
  console.log(`Music Land server: account email = ${mail ? 'SMTP ' + process.env.SMTP_HOST : 'not set (forgot password disabled)'}`);

  const signupLimit = limiter(10, 60 * 60_000);
  const forgotLimit = limiter(10, 60 * 60_000);
  const resetLimit = limiter(30, 60 * 60_000);

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
    const { data, error } = await db.from('accounts').select('user_id,recovery_email').eq('username', username).maybeSingle();
    if (error) throw error;
    return data as { user_id: string; recovery_email: string } | null;
  };

  // 1) sign up: username + password + recovery email
  route('/auth/register', async (b, req, db) => {
    const username = normalizeUsername(str(b.username));
    const password = str(b.password);
    const email = str(b.email).trim();
    checkUsername(username);
    checkPassword(password);
    checkEmail(email);
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
    const ins = await db.from('accounts').insert({ user_id: data.user.id, username, recovery_email: email });
    if (ins.error) {
      await db.auth.admin.deleteUser(data.user.id);
      if (ins.error.code === '23505') throw new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');
      throw ins.error;
    }
    return { ok: true };
  });

  // 2) forgot password: username + the email given at sign-up -> a 6-digit code by email
  route('/auth/forgot', async (b, req, db) => {
    const username = normalizeUsername(str(b.username));
    const email = str(b.email).trim();
    checkUsername(username);
    checkEmail(email);
    forgotLimit(clientIp(req));
    if (!mail) throw new Fail(503, 'ระบบส่งอีเมลยังไม่เปิดใช้ กรุณาติดต่อผู้ดูแลเกม');

    const acc = await findAccount(db, username);
    // same answer whether or not they match, so this can't be used to look up other people's emails
    if (!acc || acc.recovery_email.toLowerCase() !== email.toLowerCase()) return { ok: true };

    const prev = await db.from('password_resets').select('sent_at').eq('user_id', acc.user_id).maybeSingle();
    if (prev.data && Date.now() - new Date(prev.data.sent_at).getTime() < 60_000)
      throw new Fail(429, 'เพิ่งส่งรหัสไปแล้ว กรุณารอ 1 นาทีแล้วลองใหม่');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const up = await db.from('password_resets').upsert({
      user_id: acc.user_id,
      code_hash: hashCode(acc.user_id, code),
      expires_at: new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString(),
      attempts: 0,
      sent_at: new Date().toISOString(),
    });
    if (up.error) throw up.error;
    await mail(
      acc.recovery_email,
      `Music Land: รหัสตั้งรหัสผ่านใหม่ ${code}`,
      `สวัสดี ${username}\n\nรหัสสำหรับตั้งรหัสผ่านใหม่ของคุณคือ: ${code}\n` +
        `รหัสนี้ใช้ได้ ${CODE_TTL_MIN} นาที\n\nถ้าคุณไม่ได้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้ตามปกติ\n\n♪ Music Land`,
    );
    return { ok: true };
  });

  // 3) reset: username + code + new password
  route('/auth/reset', async (b, req, db) => {
    const username = normalizeUsername(str(b.username));
    const code = str(b.code).trim();
    const password = str(b.password);
    checkUsername(username);
    checkPassword(password);
    resetLimit(clientIp(req));
    const bad = new Fail(400, 'รหัสยืนยันไม่ถูกต้องหรือหมดอายุ');
    if (!/^\d{6}$/.test(code)) throw bad;

    const acc = await findAccount(db, username);
    if (!acc) throw bad;
    const { data: row } = await db.from('password_resets').select('*').eq('user_id', acc.user_id).maybeSingle();
    if (!row || new Date(row.expires_at).getTime() < Date.now() || row.attempts >= MAX_CODE_TRIES) throw bad;

    const want = Buffer.from(row.code_hash, 'hex');
    const got = Buffer.from(hashCode(acc.user_id, code), 'hex');
    if (!timingSafeEqual(want, got)) {
      await db.from('password_resets').update({ attempts: row.attempts + 1 }).eq('user_id', acc.user_id);
      throw bad;
    }
    const { error } = await db.auth.admin.updateUserById(acc.user_id, { password });
    if (error) throw error;
    await db.from('password_resets').delete().eq('user_id', acc.user_id);
    return { ok: true };
  });

  // 4) older accounts (signed up with a real email) pick a username once
  route('/auth/claim', async (b, req, db) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    const { data: u, error: ue } = await db.auth.getUser(token);
    if (ue || !u.user) throw new Fail(401, 'กรุณาเข้าสู่ระบบใหม่');
    const username = normalizeUsername(str(b.username));
    checkUsername(username);
    signupLimit(clientIp(req));

    const mine = await db.from('accounts').select('username').eq('user_id', u.user.id).maybeSingle();
    if (mine.data) throw new Fail(409, `บัญชีนี้มีชื่อผู้ใช้แล้ว (${mine.data.username})`);
    if (await findAccount(db, username)) throw new Fail(409, 'ชื่อผู้ใช้นี้มีคนใช้แล้ว');
    const realEmail = u.user.email ?? '';

    const ins = await db.from('accounts').insert({ user_id: u.user.id, username, recovery_email: realEmail });
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
