const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const puppeteer=require('C:/Users/Escal/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core');
const root=path.resolve(__dirname,'../../../..');
const output='C:/Users/Escal/Downloads/vedelo-video-v4';
async function main(){
  fs.mkdirSync(path.join(output,'qa'),{recursive:true});
  const server=http.createServer((req,res)=>{
    const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
    res.setHeader('Content-Type',{'.html':'text/html; charset=utf-8','.woff2':'font/woff2','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await puppeteer.launch({headless:'shell',executablePath:'C:/Users/Escal/.cache/puppeteer/chrome-headless-shell/win64-148.0.7778.97/chrome-headless-shell-win64/chrome-headless-shell.exe',userDataDir:path.join(output,'qa/title-profile'),args:['--no-first-run']});
  try{
    const page=await browser.newPage();await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
    await page.goto(`http://127.0.0.1:${server.address().port}/docs/marketing/homepage-video-2026-11-05/v4/title.html`,{waitUntil:'networkidle0'});
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    await page.screenshot({path:path.join(output,'vedelo-home-poster.png')});
    console.log('Заставка 1920 × 1080 сохранена.');
  }finally{await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e);process.exit(1)});
