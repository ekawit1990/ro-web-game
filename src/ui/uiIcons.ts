/**
 * Line icons for the HUD buttons (2026-11-15 UI refresh). Drawn as inline SVG so they look the same on
 * every phone: emoji differ between iOS/Android/Windows, and some symbols (𝄞) have no font on Android.
 * Every icon is a 24x24 viewBox using currentColor, so CSS decides the colour.
 */
const svg = (body: string) =>
  `<svg class="uic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const UI_ICONS = {
  /** คู่มืออาชีพ: two beamed notes */
  classes: svg(`<path d="M9 18V6l11-2.5v12"/><path d="M9 9.5l11-2.5"/><ellipse cx="6.3" cy="18" rx="2.9" ry="2.3" fill="currentColor" fill-opacity=".35"/><ellipse cx="17.3" cy="15.5" rx="2.9" ry="2.3" fill="currentColor" fill-opacity=".35"/>`),
  /** คู่มือ: an open book */
  guide: svg(`<path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V5c-4-.5-7 0-9 1.5z" fill="currentColor" fill-opacity=".14"/><path d="M12 6.5v13"/><path d="M6 8.6c1.5 0 2.8.3 3.8.8M6 11.6c1.5 0 2.8.3 3.8.8M14.2 9.4c1-.5 2.3-.8 3.8-.8"/>`),
  /** ออโต้: crossed swords */
  auto: svg(`<path d="M4 4l9.5 9.5M4 4h3.2L16 12.8M4 4v3.2l8.8 8.8"/><path d="M20 4l-9.5 9.5M20 4h-3.2L13.6 7.2M20 4v3.2l-3.2 3.2"/><path d="M8.5 15.5L5 19M15.5 15.5L19 19M7 13.8l3.2 3.2M17 13.8l-3.2 3.2"/><circle cx="4.6" cy="19.4" r="1.2" fill="currentColor"/><circle cx="19.4" cy="19.4" r="1.2" fill="currentColor"/>`),
  /** อันดับ: a trophy */
  rank: svg(`<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor" fill-opacity=".22"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z"/><path d="M12 6.3l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" fill="currentColor" stroke-width="0.8"/>`),
  /** สถานะ: a person in a shield */
  status: svg(`<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z" fill="currentColor" fill-opacity=".14"/><circle cx="12" cy="9.5" r="2.4"/><path d="M8 16.2c.8-2 2.2-3 4-3s3.2 1 4 3"/>`),
  /** สกิล: a four-point sparkle */
  skill: svg(`<path d="M12 2.5l2.2 6.8 6.8 2.2-6.8 2.2L12 20.5l-2.2-6.8L3 11.5l6.8-2.2z" fill="currentColor" fill-opacity=".25"/><path d="M19 3v3M17.5 4.5h3M5 17.5v3M3.5 19h3"/>`),
  /** ไอเท็ม: a bag */
  item: svg(`<path d="M5 8.5h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z" fill="currentColor" fill-opacity=".18"/><path d="M8.5 10V7a3.5 3.5 0 0 1 7 0v3"/><path d="M9.5 14.5h5"/>`),
  /** ปาร์ตี้: two people */
  party: svg(`<circle cx="9" cy="8" r="3"/><path d="M3.5 19.5c.6-3.3 2.6-5.2 5.5-5.2s4.9 1.9 5.5 5.2"/><circle cx="16.5" cy="9" r="2.4"/><path d="M15.4 14.3c.4-.1.7-.1 1.1-.1 2.4 0 4 1.6 4.5 4.3"/>`),
  /** กิลด์: a banner on a pole */
  guild: svg(`<path d="M5 21V3"/><path d="M5 4h13l-2.5 4 2.5 4H5" fill="currentColor" fill-opacity=".22"/><path d="M10.5 6.4l.7 1.4 1.5.2-1.1 1 .3 1.5-1.4-.7-1.4.7.3-1.5-1.1-1 1.5-.2z" fill="currentColor" stroke-width="0.7"/>`),
  /** แผนที่: a folded map with a pin */
  map: svg(`<path d="M3 6.5l5.5-2.5 7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z" fill="currentColor" fill-opacity=".14"/><path d="M8.5 4v13.5M15.5 6.5V20"/><path d="M12 13.8s-2.2-2.2-2.2-3.8a2.2 2.2 0 0 1 4.4 0c0 1.6-2.2 3.8-2.2 3.8z" fill="currentColor" fill-opacity=".5"/>`),
  /** นั่ง: a campfire, the RO resting spot */
  sit: svg(`<path d="M12 3.5c2.6 2.6 4 4.8 4 7a4 4 0 0 1-8 0c0-1.3.6-2.4 1.5-3.4.2 1.3.9 2.1 1.8 2.4-.4-2 .1-3.9.7-6z" fill="currentColor" fill-opacity=".3"/><path d="M4.5 20.5l15-3.5M19.5 20.5l-15-3.5"/>`),
  /** ตั้งค่า: a gear */
  option: svg(`<circle cx="12" cy="12" r="3"/><path d="M12 2.8l1.4 2.4 2.7-.6.6 2.7 2.4 1.4-1.2 2.5 1.2 2.5-2.4 1.4-.6 2.7-2.7-.6L12 21.2l-1.4-2.4-2.7.6-.6-2.7-2.4-1.4L6.1 12.8 4.9 10.3l2.4-1.4.6-2.7 2.7.6z" fill="currentColor" fill-opacity=".14"/>`),
  /** ติดตั้งเกม: a phone with a down arrow */
  install: svg(`<rect x="6.5" y="2.5" width="11" height="19" rx="2.2" fill="currentColor" fill-opacity=".14"/><path d="M12 7.5v7M9 11.8l3 3 3-3M10.5 18.8h3"/>`),
} as const;

export type UiIconKey = keyof typeof UI_ICONS;
