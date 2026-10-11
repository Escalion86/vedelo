/* Real RN components through RN Web; only platform/data seams are fixtures.
 * DS_REQUIRE_BROWSER=1 makes missing dependencies an error. All artifacts live in scratch.
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const crypto = require('node:crypto')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '../..')
const scratch = '/home/aleksei/.hermes/cache/scratch'
const defaults = {
  ESBUILD_MODULE: `${scratch}/vedelo-ui-harness/node_modules/esbuild`,
  RN_WEB_MODULE: `${scratch}/vedelo-ui-harness/node_modules/react-native-web`,
  PLAYWRIGHT_MODULE: '/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright',
}
const dependencies = {}
const missing = []
for (const [key, fallback] of Object.entries(defaults)) {
  try { dependencies[key] = require.resolve(process.env[key] || fallback) }
  catch { missing.push(key) }
}
for (const name of ['postcss', '@tailwindcss/postcss']) {
  try { require.resolve(name, { paths: [root] }) } catch { missing.push(name) }
}
const gateRoot = '/home/aleksei/projects/ux-ui-agent-skills/scripts'
const gateNames = ['verify_target_size', 'verify_responsive', 'verify_overflow']
const hash = data => crypto.createHash('sha256').update(data).digest('hex')
async function chromiumPath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  const cache = '/home/aleksei/.cache/ms-playwright'
  for (const dir of (await fs.readdir(cache)).sort().reverse()) {
    if (!dir.startsWith('chromium-')) continue
    for (const platform of ['chrome-linux-arm64', 'chrome-linux', 'chrome-linux64']) {
      const file = path.join(cache, dir, platform, 'chrome')
      try { await fs.access(file); return file } catch { /* next candidate */ }
    }
  }
  throw new Error('Нет Chromium в ~/.cache/ms-playwright')
}
async function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, DS_REQUIRE_BROWSER: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', x => { output += x })
    child.stderr.on('data', x => { output += x })
    child.on('error', reject)
    child.on('close', code => resolve({ code, output }))
  })
}
function fixturePlugin(loadedHashes) {
  // Explicit platform-only substitutions. No UI component under test is replaced.
  const mocks = {
    'expo-router': `import React from 'react'; export const router={push:p=>window.qa.routes.push(p)}; export const useFocusEffect=fn=>React.useEffect(fn,[fn]);`,
    'expo-secure-store': `export const getItemAsync=()=>{throw Error('Storage must not be read')}; export const setItemAsync=getItemAsync;`,
    'expo-clipboard': `export const setStringAsync=async x=>{window.qa.clipboard.push(x);return true};`,
    'react-native-safe-area-context': `import {View} from 'react-native'; export const SafeAreaView=View; export const useSafeAreaInsets=()=>({top:0,left:0,right:0,bottom:0});`,
    '@react-navigation/native': `import React from 'react'; export const NavigationContext=React.createContext(null);`,
    '@tanstack/react-query': `import React from 'react'; export const QueryClientContext=React.createContext(null); const client={invalidateQueries:async p=>window.qa.invalidations.push(p)}; export const useQueryClient=()=>client; export const useQuery=()=>({data:{pendingCount:0,issueCount:0,outbox:{failed:0,conflict:0}},isError:false,refetch:async()=>{}});`,
    'useCachedEntities': `export const useCachedEntities=type=>({data:window.qaData[type]||[],isPending:false,isError:false,refetch:async()=>{}});`,
    'useSyncRunState': `export const useSyncRunState=()=>({status:'success'});`,
    'useWorkItemTerminology': `import {resolveMobileWorkItemTerminology} from '${root}/mobile/src/shared/domain/workItemTerminology'; export const useWorkItemTerminology=()=>resolveMobileWorkItemTerminology({custom:{primaryEntityTerminology:'orders'}});`,
    'EventsScope': `export const useEventsScope=()=>({selectScope:(...args)=>window.qa.scopes.push(args)});`,
    'syncState': `export const getSyncQueueCounts=async()=>({pendingCount:0,issueCount:0});`,
    'outbox': `export const getOutboxSummary=async()=>({failed:0,conflict:0});`,
    'syncEngine': `export const runSync=async()=>{throw Error('Real sync forbidden')};`,
    'cache': `export const getCachedEntity=async(_,id)=>window.qaData.events.find(e=>e._id===id);`,
    'mutations': `export const saveLocalEntity=async payload=>{window.qa.mutations.push(payload); const event=window.qaData.events.find(e=>e._id===payload.entityId);Object.assign(event,payload.values);window.qaRerender();};`,
    'phoneContactConfirmation': `export const confirmPhoneContact=()=>{throw Error('Contact writes forbidden')};`,
    '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({custom:()=>{throw Error('Contact writes forbidden')}});`,
    '@state/atoms/itemsFuncAtom': `import {atom} from 'jotai';export default atom({client:{set:()=>{throw Error('Real write forbidden')}}});`,
    '@state/atoms/loggedUserAtom': `import {atom} from 'jotai';export default atom({_id:'qa'});`,
    '@state/atoms/siteSettingsAtom': `import {atom} from 'jotai';export default atom({custom:{novofonEnabled:false}});`,
    '@state/atoms/tariffsAtom': `import {atom} from 'jotai';export default atom([]);`,
    '@helpers/tariffAccess': `export const getUserTariffAccess=()=>({allowTelephony:false});`,
    '@helpers/useSnackbar': `export default ()=>({success:x=>window.qa.alerts.push(x),warning:x=>window.qa.alerts.push(x)});`,
    '@components/ClientChatButton': `export default ()=>null; // showChat=false; not part of surface`,
    // Expo's real Icon class + glyphMap + RN vector implementation use the browser font loader.
    'expo-font': `const pending=new Map();export const isLoaded=name=>document.fonts.check('20px "'+name+'"')&&[...document.fonts].some(f=>f.family===name&&f.status==='loaded');export const loadAsync=async fonts=>{for(const [name,url] of Object.entries(fonts)){if(!pending.has(name)){const face=new FontFace(name,'url('+url+')');document.fonts.add(face);pending.set(name,face.load())}await pending.get(name)}};`,
  }
  const nativeSeams = new Set(['useCachedEntities', 'useSyncRunState', 'useWorkItemTerminology', 'EventsScope', 'syncState', 'outbox', 'syncEngine', 'cache', 'mutations', 'phoneContactConfirmation'])
  return { name: 'explicit-visual-fixtures', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      let key = args.path
      if (args.importer.includes('/mobile/src/')) {
        const base = path.basename(args.path).replace(/\.(ts|tsx)$/, '')
        if (nativeSeams.has(base)) key = base
      }
      if (mocks[key]) return { path: key, namespace: 'qa-fixture' }
      if (key === '@expo/vector-icons') return { path: 'expo-icons', namespace: 'qa-fixture' }
      if (key === 'react-native') return { path: dependencies.RN_WEB_MODULE }
      // One React instance for RN Web, mobile, Jotai and FontAwesome.
      if (/^react(?:\/|$)|^react-dom(?:\/|$)/.test(key)) return { path: require.resolve(key, { paths: [root] }) }
      if (/^@(components|helpers|state)\//.test(key)) return { path: path.join(root, `${key.slice(1)}.js`) }
    })
    build.onLoad({ filter: /.*/, namespace: 'qa-fixture' }, args => ({
      contents: args.path === 'expo-icons'
        ? `export {default as MaterialCommunityIcons} from '${root}/mobile/node_modules/@expo/vector-icons/build/MaterialCommunityIcons.js'; export {default as FontAwesome5} from '${root}/mobile/node_modules/@expo/vector-icons/build/FontAwesome5.js';`
        : mocks[args.path], loader: 'jsx', resolveDir: root,
    }))
    build.onLoad({ filter: /\.(js|jsx|ts|tsx|mjs|cjs|json)$/, namespace: 'file' }, async args => {
      if (!args.path.startsWith(`${root}/`) || args.path.includes('/node_modules/')) return
      const contents = await fs.readFile(args.path, 'utf8')
      loadedHashes[path.relative(root,args.path)] = hash(contents)
      const ext = path.extname(args.path)
      return { contents, loader: ext === '.json' ? 'json' : ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'jsx' }
    })
  } }
}
// Snapshot includes dynamically inserted RN Web rules, and embeds font data for file:// gates.
async function snapshot(page, file) {
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true)
    clone.querySelectorAll('script').forEach(el => el.remove())
    const original = [...document.querySelectorAll('style')]
    clone.querySelectorAll('style').forEach((el, i) => { el.textContent = [...(original[i].sheet?.cssRules || [])].map(rule => rule.cssText).join('\n') })
    // RN Web's nested native Pressables become nested HTML buttons. HTML parsing
    // otherwise reparents their children and changes layout in file:// gates.
    // Preserve the live tree, styles and accessible role using a div for outer buttons.
    const liveButtons = [...document.querySelectorAll('button')]
    ;[...clone.querySelectorAll('button')].forEach((button, i) => {
      if (!button.querySelector('button')) return
      const replacement = document.createElement('div')
      for (const attr of button.attributes) replacement.setAttribute(attr.name, attr.value)
      replacement.setAttribute('role', 'button')
      const cs = getComputedStyle(liveButtons[i])
      replacement.style.font = cs.font
      replacement.style.textAlign = cs.textAlign
      replacement.append(...button.childNodes)
      button.replaceWith(replacement)
    })
    const liveDialog = document.querySelector('[role="dialog"]')
    const exportedDialog = clone.querySelector('[role="dialog"]')
    if (liveDialog && exportedDialog) {
      // The modal intercepts input to the background in the live RN Web page.
      // Static gates cannot infer occlusion, so encode that inactive state explicitly.
      clone.querySelectorAll('button,a,[role="button"],[role="link"],[tabindex]').forEach(el => {
        if (exportedDialog.contains(el)) return
        el.setAttribute('data-qa-inactive-background', 'true')
        el.setAttribute('aria-hidden', 'true')
        el.removeAttribute('tabindex')
        el.removeAttribute('href')
        if (el.tagName === 'BUTTON') el.setAttribute('disabled', '')
        else el.removeAttribute('role')
      })
    }
    return '<!doctype html>' + clone.outerHTML
  })
  await fs.writeFile(file, html)
}
async function measurements(page) {
  return page.evaluate(() => {
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
    const styles = el => {
      const s = getComputedStyle(el)
      return Object.fromEntries(['color','backgroundColor','borderTopColor','borderTopWidth','borderLeftColor','borderLeftWidth','borderRadius','fontFamily','fontSize','textDecorationLine','overflow','textOverflow','display'].map(k => [k,s[k]]))
    }
    const name = el => el.getAttribute('aria-label') || el.getAttribute('data-testid') || el.textContent.trim().slice(0,100)
    const activeDialog = document.querySelector('[role="dialog"]')
    const controls = [...document.querySelectorAll('button,[role="button"],[role="link"]')].filter(el => rect(el).width && rect(el).height && (!activeDialog || activeDialog.contains(el)))
    const overlaps = []
    for (let i=0;i<controls.length;i++) for(let j=i+1;j<controls.length;j++) {
      const a=controls[i], b=controls[j]
      if(a.contains(b)||b.contains(a))continue
      const ra=rect(a),rb=rect(b),area=Math.max(0,Math.min(ra.right,rb.right)-Math.max(ra.x,rb.x))*Math.max(0,Math.min(ra.bottom,rb.bottom)-Math.max(ra.y,rb.y))
      if(area>Math.min(ra.width*ra.height,rb.width*rb.height)*.25) overlaps.push({a:name(a),b:name(b),area})
    }
    const outside = controls.filter(el=>rect(el).x < -.5 || rect(el).right > innerWidth+.5).map(el=>({name:name(el),rect:rect(el)}))
    // Descendants of a horizontal ScrollView may be outside the viewport by design.
    const scrollable = el => { for(let p=el.parentElement;p;p=p.parentElement)if(['auto','scroll'].includes(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth)return true;return false }
    const escaped = controls.filter(el=>!scrollable(el)&&(rect(el).x<-.5||rect(el).right>innerWidth+.5)).map(el=>({name:name(el),rect:rect(el)}))
    const texts = [...document.querySelectorAll('[data-qa-surface] *')].filter(el=>[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())).map(el=>({text:el.textContent,rect:rect(el),style:styles(el)}))
    const cardEscapes = []
    for(const card of document.querySelectorAll('[data-testid$="-shell"],[data-testid^="client-shell-"]')) {
      const bounds=rect(card)
      for(const el of card.querySelectorAll('[role="button"],[role="link"]')) {
        const box=rect(el)
        if(box.x<bounds.x-.5||box.right>bounds.right+.5||box.y<bounds.y-.5||box.bottom>bounds.bottom+.5)cardEscapes.push({card:name(card),control:name(el),bounds,rect:box})
      }
    }
    return { width:innerWidth, documentWidth:document.documentElement.scrollWidth, fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})), controls:controls.map(el=>({name:name(el),rect:rect(el),style:styles(el),glyphs:[...el.querySelectorAll('svg,[style*="font-family"],span')].map(g=>({text:g.textContent,style:styles(g)}))})), parts:[...document.querySelectorAll('[data-testid],.contact-quick-button')].map(el=>({name:name(el),rect:rect(el),style:styles(el),text:el.textContent.slice(0,180)})), borders:[...document.querySelectorAll('[data-qa-surface] *')].filter(el=>parseFloat(getComputedStyle(el).borderTopWidth)>0||parseFloat(getComputedStyle(el).borderLeftWidth)>0).map(el=>({name:name(el),rect:rect(el),style:styles(el)})), texts, cardEscapes, outside, escaped, overlaps }
  })
}

test('настоящий визуальный стенд Android/RN Web и PWA: рендер, размеры, клики, vendored gates', { timeout: 1800000, skip: missing.length && process.env.DS_REQUIRE_BROWSER !== '1' ? `Нет зависимостей: ${missing.join(', ')}` : false }, async () => {
  assert.deepEqual(missing, [], `Нет зависимостей: ${missing.join(', ')}`)
  const output = path.resolve(process.env.QA_SCREENSHOT_DIR || `${scratch}/vedelo-visual-browser/run-${Date.now()}`)
  assert.ok(output.startsWith(`${scratch}/`), 'QA_SCREENSHOT_DIR должен находиться только в scratch')
  await fs.mkdir(output, { recursive: true })
  assert.ok((await fs.realpath(output)).startsWith(`${scratch}/`), 'Симлинк не должен выводить артефакты из scratch')
  const executablePath = await chromiumPath()
  const esbuild = require(dependencies.ESBUILD_MODULE)
  const { chromium } = require(dependencies.PLAYWRIGHT_MODULE)
  const sourceHashes = {}
  const bundle = await esbuild.build({ entryPoints: [path.join(__dirname, 'mobileVisualParity.fixture.jsx')], absWorkingDir: root, bundle: true, minify: true, write: false, metafile: true, platform: 'browser', jsx: 'automatic', loader: { '.js':'jsx', '.ttf':'dataurl' }, define: { 'process.env.NODE_ENV':'"production"', 'process.env':'{}', '__DEV__':'false' }, plugins:[fixturePlugin(sourceHashes)] })
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')})).css
  const fontPath = path.join(root,'mobile/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf')
  const font = (await fs.readFile(fontPath)).toString('base64')
  const fontFiles = { 'material-community':'MaterialCommunityIcons.ttf', 'FontAwesome5Free-Regular':'FontAwesome5_Regular.ttf', 'FontAwesome5Free-Light':'FontAwesome5_Regular.ttf', 'FontAwesome5Free-Solid':'FontAwesome5_Solid.ttf', 'FontAwesome5Free-Brand':'FontAwesome5_Brands.ttf' }
  let fontCss = ''
  const fontHashes = {}
  for(const [family,name] of Object.entries(fontFiles)) {
    const bytes = await fs.readFile(path.join(path.dirname(fontPath),name))
    fontHashes[family] = hash(bytes)
    fontCss += `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${bytes.toString('base64')}) format('truetype');font-display:block}`
  }
  const pwaFont = await fs.readFile(path.join(root, 'fonts/InterTight-VariableFont_wght.ttf'))
  fontHashes.InterTight = hash(pwaFont)
  for (const family of ['InterTight', 'Inter Tight']) {
    fontCss += `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${pwaFont.toString('base64')}) format('truetype');font-weight:100 900;font-display:block}`
  }
  const manifest = { timestamp:new Date().toISOString(), output, executablePath, dependencies, react:require('react/package.json').version, rnw:require(path.resolve(path.dirname(dependencies.RN_WEB_MODULE),'../../package.json')).version, fontPath, fontSha256:hash(Buffer.from(font,'base64')), fontHashes, cssSha256:hash(css), sourceHashes, mocks:'Explicit platform/data adapters in mobileVisualParity.browser.test.cjs', fixture:'tests/components/mobileVisualParity.fixture.jsx', fixedTime:'2026-10-08T05:00:00.000Z', timezone:'Asia/Krasnoyarsk' }
  await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2))
  const html = isWeb => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${isWeb ? css : 'html,body{margin:0;padding:0}body{font-family:Arial,sans-serif}'}</style><style>${fontCss}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`
  const server = http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(html(req.url.includes('surface=web')))})
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
  const browser = await chromium.launch({headless:true,executablePath,args:['--no-sandbox']})
  const results = [], failures = [], gates = []
  const check = (value,label) => { if (!value) failures.push(label) }
  try {
    for (const width of [360,390,420]) for(const theme of ['light','dark']) {
      const dir = path.join(output,`width-${width}`)
      await fs.mkdir(dir,{recursive:true})
      for(const surface of ['contacts','cards','attention','empty','web']) {
        const page = await browser.newPage({viewport:{width,height:900},timezoneId:'Asia/Krasnoyarsk'})
        page.setDefaultTimeout(8000)
        page.setDefaultNavigationTimeout(60000)
        const errors=[],network=[]
        page.on('pageerror',e=>errors.push(e.message))
        page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
        await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();network.push(route.request().url());return route.abort()})
        await page.clock.install({time:new Date(manifest.fixedTime)})
        await page.goto(`http://127.0.0.1:${server.address().port}/?surface=${surface}&theme=${theme}`)
        await page.locator('[data-qa-surface]').waitFor().catch(e=>{throw Error(e.message+'; browser errors='+errors.join('; '))})
        await page.evaluate(async()=>{for(const name of ['material-community','FontAwesome5Free-Regular','FontAwesome5Free-Solid','FontAwesome5Free-Brand'])await document.fonts.load('20px "'+name+'"');await document.fonts.ready})
        const stem=`${surface}-${theme}`
        console.log(`Рендер ${width}/${theme}/${surface}, шрифты загружены`)
        const captures=[]
        const capture=async name=>{await page.screenshot({path:path.join(dir,`${name}.png`),fullPage:true});await snapshot(page,path.join(dir,`${name}.html`));const m=await measurements(page);captures.push({name,measurements:m});return m}
        const initial = await capture(stem)
        if(surface==='attention') {
          for(const id of ['overdue','today','tomorrow','past-requests','no-next-step','closing','upcoming','dates']) {
            await page.getByTestId(`attention-section-${id}`).screenshot({path:path.join(dir,`${stem}-section-${id}.png`)})
          }
          await page.getByTestId('attention-scroll').evaluate(el=>{el.scrollTop=0})
        }
        check(initial.fonts.some(f=>f.family==='material-community'&&f.status==='loaded'),`${width}/${theme}/${surface}: шрифт не загружен`)
        check(initial.documentWidth<=width,`${width}/${theme}/${surface}: ширина документа ${initial.documentWidth}`)
        check(initial.escaped.length===0,`${width}/${theme}/${surface}: кнопки вне viewport ${JSON.stringify(initial.escaped)}`)
        check(initial.overlaps.length===0,`${width}/${theme}/${surface}: перекрытие кнопок ${JSON.stringify(initial.overlaps)}`)
        check(initial.cardEscapes.length===0,`${width}/${theme}/${surface}: кнопки вне карточки ${JSON.stringify(initial.cardEscapes)}`)
        const interaction=[]
        const action=async(label,fn)=>{try{await fn();interaction.push({label,passed:true})}catch(e){failures.push(`${width}/${theme}/${surface}: ${label}: ${e.message}`);interaction.push({label,passed:false,error:e.message})}}
        if(surface==='contacts') {
          const trial=page.locator('[data-qa="contacts-trial"]')
          await action('телефон и пробный приоритетный Telegram',async()=>{
            await trial.getByRole('button',{name:'Позвонить',exact:true}).click()
            await trial.getByRole('button',{name:/Telegram.*попробовать.*приоритетный/}).click()
            assert.deepEqual((await page.evaluate(()=>window.qa.links)).slice(-2),['tel:70000000001','tg://resolve?phone=70000000001'])
            assert.equal(await page.evaluate(()=>window.qa.mutations.length),0)
          })
          await action('подтверждённый MAX — правильная ссылка',async()=>{
            await page.locator('[data-qa="contacts-confirmed"]').getByRole('button',{name:/^MAX/}).click()
            assert.equal((await page.evaluate(()=>window.qa.links)).at(-1),'https://max.ru/u/qa-synthetic')
          })
          await action('MAX по телефону копирует номер без мутации',async()=>{
            await page.locator('[data-qa="contacts-maxphone"]').getByRole('button',{name:/^MAX/}).click()
            assert.equal((await page.evaluate(()=>window.qa.clipboard)).at(-1),'+70000000004')
            assert.equal((await page.evaluate(()=>window.qa.links)).at(-1),'max://max.ru/')
          })
        }
        if(surface==='cards') {
          const card=page.getByTestId('event-main')
          await action('контакт не открывает карточку',async()=>{
            await card.getByRole('button',{name:'Позвонить',exact:true}).click();assert.equal(await page.evaluate(()=>window.qa.opens),0)
          })
          await action('все каналы в раскрытии, закрытие меню',async()=>{
            await card.getByRole('button',{name:'Все способы связи'}).click()
            await page.getByRole('heading',{name:'Связаться с клиентом'}).waitFor()
            for(const name of ['WhatsApp','Telegram','MAX','Instagram','ВКонтакте','Электронная почта'])assert.ok(await page.getByRole('button',{name:new RegExp(name)}).count(),name)
            const m=await capture(`${stem}-contacts-sheet`);check(m.overlaps.length===0,`${width}/${theme}: перекрытие в меню контактов`)
            await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click()
            assert.equal(await page.getByRole('heading',{name:'Связаться с клиентом'}).count(),0)
          })
          await action('допконтакты и mock router',async()=>{
            await card.getByRole('button',{name:'Дополнительные контакты: 1'}).click()
            await page.getByRole('heading',{name:'Дополнительные контакты',exact:true}).waitFor()
            await capture(`${stem}-other-sheet`)
            await page.getByRole('button',{name:'Открыть клиента',exact:true}).click()
            assert.equal((await page.evaluate(()=>window.qa.routes)).at(-1),'/clients/other')
            assert.equal(await page.evaluate(()=>window.qa.opens),0)
          })
          await action('меню работы — документы',async()=>{
            await page.getByTestId('event-main-overflow').click()
            await page.getByRole('button',{name:'Документы',exact:true}).click()
            assert.equal((await page.evaluate(()=>window.qa.routes)).at(-1),'/events/future/documents')
          })
          await action('disabled работа не открывается',async()=>{
            await page.getByTestId('event-busy').click({force:true})
            await page.getByTestId('event-busy-overflow').click({force:true})
            assert.equal(await page.evaluate(()=>window.qa.opens),0)
            assert.equal(await page.getByRole('heading',{name:'Действия с работой'}).count(),0)
          })
          await action('контакты клиента не запускают router, меню редактирования',async()=>{
            const c=page.getByTestId('client-card-confirmed'), n=await page.evaluate(()=>window.qa.routes.length)
            await c.getByRole('button',{name:'Позвонить',exact:true}).click()
            assert.equal(await page.evaluate(()=>window.qa.routes.length),n)
            await c.getByRole('button',{name:/Действия с клиентом/}).click()
            await page.getByRole('button',{name:'Редактировать',exact:true}).click()
            assert.equal((await page.evaluate(()=>window.qa.routes)).at(-1),'/clients/edit/confirmed')
          })
        }
        if(surface==='attention') {
          await action('все наполненные разделы и счётчики',async()=>{
            for(const id of ['overdue','today','tomorrow','past-requests','no-next-step','closing','upcoming','dates'])assert.equal(await page.getByTestId(`attention-section-${id}`).count(),1,id)
            for(const id of ['overdue','today','tomorrow'])assert.match(await page.getByTestId(`attention-summary-${id}`).innerText(),/^(?:1 |.*· 1)/)
            const done=page.getByTestId('attention-item-future:task:done')
            assert.match(await done.innerText(),/Выполненная тестовая задача/)
          })
          await action('сводка реально прокручивает к значимым датам',async()=>{
            const before=await page.getByTestId('attention-section-dates').boundingBox()
            await page.getByTestId('attention-summary-dates').click()
            await page.clock.runFor(1000)
            const after=await page.getByTestId('attention-section-dates').boundingBox()
            assert.ok(after.y<before.y,`before=${before.y}, after=${after.y}`)
          })
          await action('меню задачи: выход без мутации',async()=>{
            const task=page.getByTestId('attention-item-future:task:today')
            const menu=task.getByRole('button',{name:/^Открыть меню задачи:/})
            if(await menu.count()) {
              await menu.click()
              await page.getByRole('button',{name:'Редактировать',exact:true}).waitFor()
              await capture(`${stem}-task-sheet`)
              await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click()
              assert.equal(await page.getByRole('button',{name:'Редактировать',exact:true}).count(),0)
            } else {
              await task.getByRole('button',{name:'Изменить',exact:true}).click()
              await task.getByRole('button',{name:'Отмена',exact:true}).click()
            }
            assert.equal(await page.evaluate(()=>window.qa.mutations.length),0)
          })
          await action('выполнение меняет только фикстуру и счётчик',async()=>{
            await page.getByTestId('attention-item-future:task:today').getByRole('button',{name:/^(?:Выполнено$|Выполнить задачу:)/}).click()
            await page.waitForFunction(()=>window.qa.mutations.length===1)
            assert.equal(await page.getByTestId('attention-item-future:task:today').getByRole('button',{name:/^Отменить выполнение/}).count(),1)
            assert.equal(await page.getByTestId('attention-summary-today').count(),0)
          })
        }
        if(surface==='empty') await action('пустой обзор и новая заявка',async()=>{
          assert.ok(await page.getByText('Здесь пока нет работ',{exact:true}).count())
          assert.equal(await page.getByTestId('attention-summary').count(),0)
          await page.getByRole('button',{name:'Новая заявка',exact:true}).click()
          assert.equal((await page.evaluate(()=>window.qa.routes)).at(-1),'/events/edit/new')
        })
        if(surface==='web') await action('настоящий веб CSS и контакты без всплытия',async()=>{
          assert.ok(await page.locator('.contact-quick-button svg').count())
          await page.locator('[data-qa="web-confirmed"]').getByRole('button',{name:/Открыть контакт в MAX/}).click()
          assert.equal((await page.evaluate(()=>window.qa.links)).at(-1),'https://max.ru/u/qa-synthetic')
        })
        const resize=[]
        for(const next of [420,360,390,width]) {
          await page.setViewportSize({width:next,height:900})
          await page.clock.runFor(120)
          const m=await measurements(page);resize.push(m)
          check(m.documentWidth<=next,`${width}/${theme}/${surface}: live resize ${next} → ${m.documentWidth}`)
        }
        check(errors.length===0,`${width}/${theme}/${surface}: console ${errors.join('; ')}`)
        check(network.length===0,`${width}/${theme}/${surface}: external requests ${network.join('; ')}`)
        results.push({width,theme,surface,initial,captures,resize,interaction,errors,externalRequests:network,qa:await page.evaluate(()=>window.qa)})
        await fs.writeFile(path.join(output,'measurements.json'),JSON.stringify(results,null,2))
        console.log(`${width}px ${theme} ${surface}: ${interaction.filter(x=>x.passed).length}/${interaction.length} кликов; doc=${initial.documentWidth}; escaped=${initial.escaped.length}; overlaps=${initial.overlaps.length}; errors=${errors.length}`)
        await page.close()
      }
    }
    // Vendor scripts require channel=chrome. Unmodified copies import a scratch-only
    // Playwright launch adapter that substitutes the existing executable, no gate logic changes.
    const gateDir=path.join(output,'gates')
    const wrapper=path.join(gateDir,'node_modules/playwright')
    await fs.mkdir(wrapper,{recursive:true})
    await fs.writeFile(path.join(wrapper,'package.json'),JSON.stringify({name:'playwright',main:'index.cjs'}))
    await fs.writeFile(path.join(wrapper,'index.cjs'),`const real=require(${JSON.stringify(dependencies.PLAYWRIGHT_MODULE)});exports.chromium=new Proxy(real.chromium,{get(target,key){if(key==='launch')return opts=>{const {channel,...rest}=opts||{};return target.launch({...rest,executablePath:${JSON.stringify(executablePath)},args:['--no-sandbox']})};const value=target[key];return typeof value==='function'?value.bind(target):value}});`)
    for(const name of gateNames) {
      const source=await fs.readFile(path.join(gateRoot,`${name}.mjs`))
      await fs.writeFile(path.join(gateDir,`${name}.mjs`),source)
      for(const width of [360,390,420]) {
        const args=[path.join(gateDir,`${name}.mjs`),path.join(output,`width-${width}`),`--widths=${width}`]
        const result=await run(process.execPath,args,gateDir)
        gates.push({name,width,source:path.join(gateRoot,`${name}.mjs`),sha256:hash(source),command:[process.execPath,...args],...result})
        await fs.writeFile(path.join(gateDir,`${name}-${width}.log`),result.output)
        if(result.code!==0)failures.push(`${name} ${width}px: exit ${result.code}, см. gates/${name}-${width}.log`)
        console.log(`${name} ${width}px: exit ${result.code}`)
      }
    }
  } finally {
    await browser.close();await new Promise(resolve=>server.close(resolve))
    await fs.writeFile(path.join(output,'gates.json'),JSON.stringify(gates,null,2))
    await fs.writeFile(path.join(output,'failures.json'),JSON.stringify(failures,null,2))
    const changedDuringRun=[]
    for(const [file,before] of Object.entries(sourceHashes))if(hash(await fs.readFile(path.resolve(root,file)))!==before)changedDuringRun.push(file)
    await fs.writeFile(path.join(output,'source-changes-during-run.json'),JSON.stringify(changedDuringRun,null,2))
    console.log(`Артефакты: ${output}`)
  }
  assert.deepEqual(failures,[],`Найдены дефекты стенда/компонентов; подробности ${output}/failures.json`)
})
