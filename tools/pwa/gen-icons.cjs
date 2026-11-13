// Renders the PWA icons and iOS splash screens into public/. Run: node tools/pwa/gen-icons.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
const out = (p) => { const f = path.join(root, 'public', p); fs.mkdirSync(path.dirname(f), { recursive: true }); return f; };

// iOS splash sizes (CSS width x height, pixel ratio) for current iPhones/iPads, portrait; landscape is the swap.
const SPLASH = [
  [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [414, 896, 3], [375, 812, 3],
  [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2], [440, 956, 3], [402, 874, 3],
  [820, 1180, 2], [834, 1194, 2], [1024, 1366, 2], [768, 1024, 2],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const icon = async (size, file, radius = 0, pad = 0) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${radius}%;overflow:hidden;padding:${pad}px;box-sizing:border-box;background:#173c60">
      ${svg.replace('<svg ', `<svg width="${size - 2 * pad}" height="${size - 2 * pad}" style="display:block" `)}</div></body></html>`);
    await page.screenshot({ path: out(file), omitBackground: true });
  };
  await icon(192, 'icons/icon-192.png', 22);
  await icon(512, 'icons/icon-512.png', 22);
  await icon(512, 'icons/maskable-512.png', 0, 0);
  await icon(192, 'icons/maskable-192.png', 0, 0);
  await icon(180, 'icons/apple-touch-icon.png', 0);
  await icon(32, 'icons/favicon-32.png', 22);

  const links = [];
  for (const [w, h, r] of SPLASH) {
    for (const land of [false, true]) {
      const W = land ? h : w, H = land ? w : h;
      const file = `splash/splash-${W * r}x${H * r}.jpg`;
      await page.setViewportSize({ width: W, height: H });
      const s = Math.round(Math.min(W, H) * 0.36);
      await page.setContent(`<html><head><style>@import url('https://fonts.googleapis.com/css2?family=Kanit:wght@600&display=block');</style></head>
        <body style="margin:0;width:${W}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:radial-gradient(circle at 50% 42%, #23578a, #173c60 55%, #2a1a48);font-family:Kanit,sans-serif">
        <div style="width:${s}px;height:${s}px;border-radius:22%;overflow:hidden;box-shadow:0 10px 30px #0008">${svg.replace('<svg ', `<svg width="${s}" height="${s}" `)}</div>
        <div style="margin-top:${Math.round(s * 0.14)}px;color:#ffc83d;font-weight:600;font-size:${Math.round(s * 0.24)}px;text-shadow:0 3px 0 #7a4a00">Music Land</div>
        </body></html>`);
      await page.evaluate(() => document.fonts.ready);
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: r });
      const p2 = await ctx.newPage();
      await p2.setContent(await page.content());
      await p2.evaluate(() => document.fonts.ready);
      await p2.screenshot({ path: out(file), type: 'jpeg', quality: 82 });
      await ctx.close();
      links.push(`<link rel="apple-touch-startup-image" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: ${land ? 'landscape' : 'portrait'})" href="/splash/splash-${W * r}x${H * r}.jpg" />`);
    }
  }
  fs.writeFileSync(path.join(__dirname, 'splash-links.html'), links.join('\n    ') + '\n');
  await browser.close();
})();
