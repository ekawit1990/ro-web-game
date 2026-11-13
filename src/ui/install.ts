/**
 * "Install the game" (PWA): registers the service worker and drives the 📲 buttons on the login
 * and character screens.
 * - Android Chrome/Edge/Samsung: the browser's own install prompt (beforeinstallprompt).
 * - iPhone/iPad: Apple has no prompt, so we show how to do Share → Add to Home Screen.
 * - In-app browsers (LINE, Facebook, Messenger, Instagram, TikTok) can't install: tell them to open Safari/Chrome.
 * The buttons stay hidden once the game runs as an installed app.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const ua = navigator.userAgent;
const IOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const ANDROID = /Android/i.test(ua);
const IN_APP = /\bLine\/|FBAN|FBAV|FB_IAB|Instagram|Messenger|TikTok|musical_ly|KAKAOTALK/i.test(ua);
const IOS_NOT_SAFARI = IOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);

let deferred: InstallPromptEvent | null = null;

export function isInstalled() {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function buttons() {
  return document.querySelectorAll<HTMLButtonElement>('.install-btn');
}

function refresh() {
  const show = !isInstalled() && (deferred !== null || IOS || ANDROID);
  buttons().forEach((b) => b.classList.toggle('hidden', !show));
}

function guide(html: string) {
  document.getElementById('install-guide')?.remove();
  const box = document.createElement('div');
  box.id = 'install-guide';
  box.innerHTML = `<div class="ig-card"><h3>📲 ติดตั้ง Music Land</h3>${html}
    <button type="button" class="ig-close">เข้าใจแล้ว</button></div>`;
  box.addEventListener('click', (e) => {
    if (e.target === box || (e.target as HTMLElement).classList.contains('ig-close')) box.remove();
  });
  document.body.appendChild(box);
}

const RELOGIN = '<p class="ig-note">เปิดเกมจากไอคอนครั้งแรกต้องเข้าสู่ระบบใหม่ 1 ครั้ง (ตัวละครไม่หาย)</p>';

async function onClick() {
  if (deferred) {
    const ev = deferred;
    deferred = null;
    await ev.prompt();
    await ev.userChoice.catch(() => undefined);
    refresh();
    return;
  }
  if (IN_APP) {
    guide(`<p>แอปแชท (LINE / Facebook ฯลฯ) ติดตั้งเกมไม่ได้</p>
      <ol><li>กดปุ่ม <b>⋯</b> หรือ <b>⋮</b> มุมจอ</li>
      <li>เลือก <b>เปิดใน${IOS ? ' Safari' : 'เบราว์เซอร์ / Chrome'}</b></li>
      <li>แล้วกดปุ่ม 📲 ติดตั้งเกม อีกครั้ง</li></ol>`);
  } else if (IOS) {
    guide(`<ol>
      <li>กดปุ่ม <b>แชร์</b> <span class="ig-share" aria-hidden="true">⬆︎</span> ${IOS_NOT_SAFARI ? 'ที่แถบที่อยู่ด้านบน' : 'ที่แถบด้านล่างของ Safari'}</li>
      <li>เลื่อนลงหา <b>“เพิ่มไปยังหน้าจอโฮม”</b> (Add to Home Screen)</li>
      <li>กด <b>เพิ่ม</b> มุมขวาบน</li>
      <li>เปิดเกมจากไอคอน ♪ Music Land บนหน้าจอโฮม จะเต็มจอเหมือนแอป</li></ol>${RELOGIN}`);
  } else {
    guide(`<ol><li>กดเมนู <b>⋮</b> มุมขวาบนของ Chrome</li>
      <li>เลือก <b>“ติดตั้งแอป”</b> หรือ <b>“เพิ่มลงในหน้าจอหลัก”</b></li>
      <li>กด <b>ติดตั้ง</b> แล้วเปิดเกมจากไอคอน ♪ Music Land</li></ol>${RELOGIN}`);
  }
}

export function initInstall() {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button
    deferred = e as InstallPromptEvent;
    refresh();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    document.getElementById('install-guide')?.remove();
    refresh();
  });
  buttons().forEach((b) => b.addEventListener('click', () => void onClick()));
  refresh();

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => undefined);
    });
  }
}
