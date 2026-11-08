/** /auto potion settings, picked on the AUTO bar and kept in this browser (2026-11-08). */
const KEYS = { hp: 'ml-auto-potion', sp: 'ml-auto-potion-sp' } as const;
/** HP: 35% as before the setting existed; SP: off until the player picks one. */
const DEFAULTS = { hp: 35, sp: 0 };
/** and each at most this often (ms) */
export const AUTO_POTION_EVERY = 1000;
type Kind = keyof typeof KEYS;

function stored(k: Kind) {
  try {
    const raw = localStorage.getItem(KEYS[k]);
    const v = Number(raw);
    if (raw !== null && Number.isFinite(v)) return Math.min(95, Math.max(0, v));
  } catch { /* storage may be blocked */ }
  return DEFAULTS[k];
}
const pct = { hp: stored('hp'), sp: stored('sp') };
/** Drink an HP potion when HP is under this % (0 = never). */
export const potionPct = () => pct.hp;
/** Drink an SP potion when SP is under this % (0 = never). */
export const spPotionPct = () => pct.sp;
function set(k: Kind, v: number) {
  pct[k] = Math.min(95, Math.max(0, Math.round(v)));
  try {
    localStorage.setItem(KEYS[k], String(pct[k]));
  } catch { /* storage may be blocked */ }
}
export const setAutoPotionPct = (v: number) => set('hp', v);
export const setAutoSpPotionPct = (v: number) => set('sp', v);
