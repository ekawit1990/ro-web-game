/** Phones get lighter settings: iOS Safari reloads the page when it runs out of (GPU) memory. */
export const PHONE = matchMedia('(pointer: coarse)').matches || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
