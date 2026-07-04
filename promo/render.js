/* Renders promo.html to frames (or preview stills).
   Usage:
     node render.js preview 0.5 3 5 8.7 ...   -> preview/t<t>.png
     node render.js frames [fps]              -> frames/f%05d.jpg
*/
const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const HTML = 'file:///' + path.resolve(__dirname, 'promo.html').replace(/\\/g, '/');

(async () => {
  const mode = process.argv[2] || 'preview';
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(HTML, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);

  if (mode === 'preview') {
    const times = process.argv.slice(3).map(Number);
    fs.mkdirSync(path.join(__dirname, 'preview'), { recursive: true });
    for (const t of times) {
      await page.evaluate(tt => window.seek(tt), t);
      await new Promise(r => setTimeout(r, 60));
      const f = path.join(__dirname, 'preview', 't' + String(t).replace('.', '_') + '.png');
      await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1280, height: 720 } });
      console.log('wrote', f);
    }
  } else {
    const fps = Number(process.argv[3]) || 30;
    const dur = await page.evaluate(() => window.DURATION);
    const total = Math.round(dur * fps);
    const dir = path.join(__dirname, 'frames');
    fs.mkdirSync(dir, { recursive: true });
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate(tt => window.seek(tt), i / fps);
      await page.screenshot({
        path: path.join(dir, 'f' + String(i).padStart(5, '0') + '.jpg'),
        type: 'jpeg', quality: 95,
        clip: { x: 0, y: 0, width: 1280, height: 720 },
      });
      if (i % 150 === 0) console.log(`frame ${i}/${total} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    }
    console.log('done', total, 'frames in', ((Date.now() - t0) / 1000).toFixed(0), 's');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
