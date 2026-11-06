const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('C:/Users/Escal/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '../../..');
const output = path.join(__dirname, 'assets');
fs.mkdirSync(output, { recursive: true });
async function main() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    const type = { '.html': 'text/html; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    res.setHeader('Content-Type', type); res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await puppeteer.launch({ headless: 'shell', executablePath: 'C:/Users/Escal/.cache/puppeteer/chrome-headless-shell/win64-148.0.7778.97/chrome-headless-shell-win64/chrome-headless-shell.exe', userDataDir: path.join(__dirname, 'qa/graphics-chrome-profile'), args: ['--no-first-run'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: 1 });
    for (const name of ['lower', 'free', 'cta', 'poster', 'ai']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/docs/marketing/homepage-video-2026-11-05/graphics.html?asset=${name}`, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      await (await page.$('#' + name)).screenshot({ path: path.join(output, name + '.png'), omitBackground: true });
      console.log('Captured ' + name);
    }
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(err => { console.error(err.message); process.exit(1); });
