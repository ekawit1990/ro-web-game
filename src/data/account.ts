// Shared by the web client and the game server.

/** Usernames: 4–16 characters, English letters, digits and _ (stored lower case). */
export const USERNAME_RE = /^[a-z0-9_]{4,16}$/;

export const normalizeUsername = (u: string) => u.trim().toLowerCase();

/**
 * Supabase Auth needs a unique email per account, but players may reuse one
 * real email for many accounts. So each account gets a made-up address built
 * from its username; ".invalid" is reserved and can never receive mail.
 * The real email is kept in public.accounts for password recovery only.
 */
export const authEmail = (username: string) => `${normalizeUsername(username)}@player.musicland.invalid`;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
