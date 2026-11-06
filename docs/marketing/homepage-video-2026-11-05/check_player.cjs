const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('C:/Users/Escal/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core');
const root = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
async function main() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    const size = fs.statSync(file).size;
    const type = { '.html': 'text/html; charset=utf-8', '.vtt': 'text/vtt; charset=utf-8', '.mp4': 'video/mp4', '.jpg': 'image/jpeg' }[path.extname(file)] || 'application/octet-stream';
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' }); fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ headless: 'shell', executablePath: 'C:/Users/Escal/.cache/puppeteer/chrome-headless-shell/win64-148.0.7778.97/chrome-headless-shell-win64/chrome-headless-shell.exe', userDataDir: path.join(root, 'qa/player-profile'), args: ['--no-first-run', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`http://127.0.0.1:${server.address().port}/preview.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelector('video').readyState >= 1, { timeout: 20000 });
    const metadata = await page.evaluate(() => { const v = document.querySelector('video'); v.muted = true; v.textTracks[0].mode = 'showing'; return { width: v.videoWidth, height: v.videoHeight, duration: v.duration, error: v.error?.message || null }; });
    await page.waitForFunction(() => document.querySelector('video').textTracks[0].cues?.length > 0);
    await page.evaluate(async () => { const v = document.querySelector('video'); await v.play(); v.pause(); v.currentTime = 58; await new Promise(resolve => v.addEventListener('seeked', resolve, { once: true })); });
    await page.screenshot({ path: path.join(root, 'qa/player-desktop.png') });
    const captions = await page.evaluate(() => { const v = document.querySelector('video'); return { total: v.textTracks[0].cues.length, active: [...v.textTracks[0].activeCues].map(c => c.text), currentTime: v.currentTime }; });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(root, 'qa/player-mobile.png') });
    const mobile = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, videoWidth: document.querySelector('video').getBoundingClientRect().width }));
    const report = { metadata, captions, mobile, pageErrors: errors };
    fs.writeFileSync(path.join(root, 'qa/player-check.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    if (metadata.error || errors.length || mobile.overflow || captions.total !== 34) throw new Error('Player validation failed');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(err => { console.error(err.message); process.exit(1); });
