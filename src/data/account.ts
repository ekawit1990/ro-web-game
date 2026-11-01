// Shared by the web client and the game server.

/** Usernames: 4–16 characters, English letters, digits and _ (stored lower case). */
export const USERNAME_RE = /^[a-z0-9_]{4,16}$/;

export const normalizeUsername = (u: string) => u.trim().toLowerCase();

/**
 * Supabase Auth needs a unique email per account, so each account gets a
 * made-up address built from its username (".invalid" can never receive mail).
 * Players never see it. Their phone number (may be shared by many accounts)
 * is kept in public.accounts for password recovery.
 */
export const authEmail = (username: string) => `${normalizeUsername(username)}@player.musicland.invalid`;

/** Thai phone number -> 0XXXXXXXXX (accepts spaces, dashes and +66). Empty string if it doesn't look like one. */
export function normalizePhone(p: string) {
  let d = p.replace(/\D/g, '');
  if (d.startsWith('66') && d.length === 11) d = '0' + d.slice(2);
  return /^0\d{8,9}$/.test(d) ? d : '';
}
