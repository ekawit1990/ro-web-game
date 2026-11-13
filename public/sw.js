// Music Land service worker.
// It makes the game installable but deliberately caches NOTHING of the game:
// every file comes straight from the network, so a new upload shows up on the next open.
// Only when the phone is offline does a page load get a small "no internet" screen instead of an error.
const OFFLINE_HTML = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Music Land</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
background:#173c60;color:#fff;font-family:sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{color:#ffc83d;margin:0 0 8px}button{margin-top:18px;font-size:18px;padding:10px 26px;border:0;border-radius:10px;
background:#ffc83d;color:#3a2600;font-weight:bold}</style></head><body>
<h1>♪ Music Land</h1><p>ไม่มีการเชื่อมต่ออินเทอร์เน็ต<br>เกมนี้ต้องออนไลน์ เชื่อมต่อเน็ตแล้วกดลองใหม่</p>
<button onclick="location.reload()">ลองใหม่</button></body></html>`;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) await caches.delete(key); // never keep stale copies
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // everything else: browser handles it as usual
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
