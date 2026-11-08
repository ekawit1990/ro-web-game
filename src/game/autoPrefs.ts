/** /auto potion setting, picked on the AUTO bar and kept in this browser (2026-11-08). */
const AUTO_POTION_KEY = 'ml-auto-potion';
const AUTO_POTION_DEFAULT = 35;
/** and at most this often (ms) */
export const AUTO_POTION_EVERY = 1000;
function stored() {
  try {
    const v = Number(localStorage.getItem(AUTO_POTION_KEY));
    if (localStorage.getItem(AUTO_POTION_KEY) !== null && Number.isFinite(v)) return Math.min(95, Math.max(0, v));
  } catch { /* storage may be blocked */ }
  return AUTO_POTION_DEFAULT;
}
let pct = stored();
/** The current setting: drink when HP is under this % (0 = never). */
export const potionPct = () => pct;
export function setAutoPotionPct(v: number) {
  pct = Math.min(95, Math.max(0, Math.round(v)));
  try {
    localStorage.setItem(AUTO_POTION_KEY, String(pct));
  } catch { /* storage may be blocked */ }
}
