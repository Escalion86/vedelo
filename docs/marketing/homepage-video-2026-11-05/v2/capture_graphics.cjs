const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('C:/Users/Escal/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core');
const root = path.resolve(__dirname, '../../../..');
async function main() {
  fs.mkdirSync(path.join(__dirname, 'assets'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'qa'), { recursive: true });
  const server = http.createServer((req, res) => {
    const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', {'.html':'text/html; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml','.jpg':'image/jpeg'}[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ headless:'shell', executablePath:'C:/Users/Escal/.cache/puppeteer/chrome-headless-shell/win64-148.0.7778.97/chrome-headless-shell-win64/chrome-headless-shell.exe', userDataDir:path.join(__dirname,'qa/browser-profile'),args:['--no-first-run'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({width:1600,height:1200,deviceScaleFactor:1});
    for (const name of ['expert','origin','notebook','details','remember','professions','adapt','credit']) {
      await page.goto(`http://127.0.0.1:${server.address().port}/docs/marketing/homepage-video-2026-11-05/v2/graphics.html?asset=${name}`, {waitUntil:'networkidle0'});
      await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.images].map(i=>i.decode()));});
      await (await page.$('#'+name)).screenshot({path:path.join(__dirname,'assets',name+'.png'),omitBackground:true});
      console.log('Captured '+name);
    }
  } finally { await browser.close(); await new Promise(r=>server.close(r)); }
}
main().catch(e=>{console.error(e);process.exit(1)});
