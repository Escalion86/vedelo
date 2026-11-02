const fs = require('node:fs')
const path = require('node:path')
const http = require('node:http')
const { createRequire } = require('node:module')
const crypto = require('node:crypto')
const root = path.resolve(__dirname, '../../..')
const req = createRequire(path.join(root, 'package.json'))
const React = req('react')
const { renderToStaticMarkup } = req('react-dom/server')
const puppeteer = require('C:/Users/Escal/AppData/Local/npm-cache/_npx/702923228c2ce1e6/node_modules/puppeteer-core')
const assets = path.join(__dirname, 'composition/assets')
fs.mkdirSync(assets, { recursive: true })
process.chdir(root)
process.env.TZ = 'Asia/Krasnoyarsk'
process.env.ESBUILD_MODULE = path.join(root, 'mobile/node_modules/esbuild')

const RealDate = Date
global.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-10-31T09:00:00+07:00'])) }
  static now() { return new RealDate('2026-10-31T09:00:00+07:00').getTime() }
}

async function main() {
  await req('next/dist/build/swc').loadBindings()
  let harness = fs.readFileSync(path.join(root, 'tests/components/cardSurfaceHarness.cjs'), 'utf8').split('exports.buildCardSurfaceHarness')[0]
  harness = harness.replace("const client = { _id: 'client', firstName: 'Анна', secondName: 'Иванова' }", "const client = { _id: 'client', firstName: 'Анна' }")
  harness = harness.replace("{ defaultTown: 'Красноярск' }", "{ defaultTown: 'Онлайн', custom: { onboardingActivityPreset: 'consulting', primaryEntityTerminology: 'orders' } }")
  harness = harness.replace(/atom === 'services'\s*\? \[\]/, "atom === 'services' ? [{ _id: 'consult', title: 'Индивидуальная консультация' }]")
  const module = { exports: {} }
  new Function('require', 'module', 'exports', harness + '\nmodule.exports = createLoader')(req, module, module.exports)
  const cssChunks = []
  const load = module.exports(cssChunks)
  const EventCard = load('layouts/cards/EventCard.js').default
  const TaskCard = load('layouts/modals/modalsFunc/AdditionalEventCard.js').default
  const event = {
    _id: 'video-example', status: 'draft', clientId: 'client',
    eventType: 'Онлайн', servicesIds: ['consult'], contractSum: 3000,
    eventDate: '2026-11-07T15:00:00+07:00', dateEnd: '2026-11-07T16:00:00+07:00',
    address: { comment: 'Видеозвонок' }, calendarImportChecked: true,
    additionalEvents: [{ title: 'Уточнить задачу Анны', date: '2026-11-01T11:00:00+07:00', done: false }],
  }
  const fragments = {
    order: renderToStaticMarkup(React.createElement(EventCard, { eventId: event._id, event, transactions: [] })),
    task: renderToStaticMarkup(React.createElement(TaskCard, { index: 0, item: { title: 'Уточнить задачу Анны', date: '2026-11-01T11:00:00+07:00', description: 'Обсудить вопросы и подтвердить время', done: false } })),
    paid: renderToStaticMarkup(React.createElement(EventCard, { eventId: event._id, event: { ...event, status: 'active', additionalEvents: [{title: 'Подготовить материалы',date:'2026-11-06T12:00:00+07:00'}] }, transactions: [{_id:'payment',eventId:event._id,type:'income',amount:1000,date:'2026-10-31T10:00:00+07:00',payType:'transfer'}] })),
  }
  global.Date = RealDate
  console.log('Rendered source components')
  const css = (await req('postcss')([req('@tailwindcss/postcss')()]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') })).css + cssChunks.join('\n')
  const html = (name) => `<!doctype html><html lang="ru"><meta charset="utf-8"><style>${css}\n@font-face{font-family:'Inter Tight';src:url('/fonts/InterTight-Regular.woff2')}@font-face{font-family:'Inter Tight';src:url('/fonts/InterTight-SemiBold.woff2');font-weight:600}html,body{margin:0;background:transparent;min-height:0}body{font-family:'Inter Tight',sans-serif}#capture{width:440px;padding:10px;background:transparent}svg.svg-inline--fa{display:inline-block;height:1em;vertical-align:-.125em}</style><div id="capture">${fragments[name]}</div></html>`
  const server = http.createServer((request,response) => {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname.startsWith('/fonts/')) {
      const basename = path.basename(url.pathname)
      const file = path.join(root,'public/fonts',basename)
      if(fs.existsSync(file)){response.setHeader('Content-Type','font/woff2');return response.end(fs.readFileSync(file))}
    }
    const name = url.pathname.slice(1)
    if(fragments[name]){response.setHeader('Content-Type','text/html; charset=utf-8');return response.end(html(name))}
    response.statusCode=404;response.end()
  })
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  const browser = await puppeteer.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',userDataDir:path.join(__dirname,'qa/capture-browser'),args:['--disable-gpu','--no-first-run']})
  try {
    const page = await browser.newPage()
    await page.setViewport({width:460,height:700,deviceScaleFactor:2})
    for (const name of Object.keys(fragments)) {
      await page.goto(`http://127.0.0.1:${server.address().port}/${name}`,{waitUntil:'networkidle0'})
      await page.evaluate(()=>document.fonts.ready)
      await (await page.$('#capture')).screenshot({path:path.join(assets,`${name}.png`),omitBackground:true})
      fs.writeFileSync(path.join(assets,`${name}.html`),html(name))
    }
  } finally { await browser.close(); await new Promise(resolve=>server.close(resolve)) }
  for (const font of ['InterTight-Regular.woff2','InterTight-SemiBold.woff2','InterTight-Bold.woff2','FuturaPT-Bold.woff2']) fs.copyFileSync(path.join(root,'public/fonts',font),path.join(assets,font))
  const sources = ['layouts/cards/EventCard.js','layouts/modals/modalsFunc/AdditionalEventCard.js','app/globals.css']
  fs.writeFileSync(path.join(__dirname,'ui-source.json'),JSON.stringify({data:'fictional',sources:sources.map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')})),captured:Object.keys(fragments)},null,2))
  console.log('Captured actual UI:',Object.keys(fragments).join(', '))
}
main().catch(error=>{console.error(error);process.exit(1)})
