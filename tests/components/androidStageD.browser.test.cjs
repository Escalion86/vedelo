const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');const scratch=process.env.STAGE_M_SCRATCH;
if(!scratch||!process.env.STAGE_D_OUT)throw Error('STAGE_M_SCRATCH и STAGE_D_OUT обязательны для уникальных артефактов');
// Установленные зависимости D используются только для чтения.
const deps='/home/aleksei/.hermes/cache/scratch/vedelo-android-D-20261011/browser-deps/node_modules';const dependencies={ESBUILD_MODULE:path.join(deps,'esbuild'),RN_WEB_MODULE:require.resolve(path.join(deps,'react-native-web')),PLAYWRIGHT_MODULE:path.join(deps,'playwright')};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
function fixturePlugin(loadedHashes) {
  // Явные адаптеры платформы и данных; изменённые UI-компоненты настоящие.
  const mocks = {
    'AuthProvider': `const refreshUser=async()=>{},completeSignIn=async()=>{};export const useAuth=()=>({user:window.qa.user,refreshUser,completeSignIn});`,
    'client': `export const api=Object.fromEntries(['get','put','post','patch','delete'].map(method=>[method,(path,body)=>window.qaApi(method,path,body)]));`,
    'env': `export const env={apiBaseUrl:'https://synthetic.invalid/api',appScheme:'vedelo'};`,
    'exportCsv': `export const shareStatisticsCsv=async()=>{};`,
    'tokenStore': `export const getAuthSession=async()=>({user:window.qa.user});export const getAccessToken=async()=>null;`,
    'api-support': `export const getSupportUnreadCount=async()=>({data:{unreadCount:0}});`,
    // Метаданные устройства для настоящего uploadOnce; native-модули в браузере недоступны.
    'expo-application': `export const nativeApplicationVersion='test';export const getAndroidId=()=> 'synthetic-device';`,
    'expo-device': `export const modelName='Synthetic browser device';`,
    'expo-web-browser': `export const openBrowserAsync=async()=>{};export const openAuthSessionAsync=async()=>({type:'cancel'});`,
    '@react-native-community/netinfo': `export default {fetch:async()=>({isConnected:true})};`,
    'next/link': `export default ({shallow,children,...p})=><a {...p}>{children}</a>;`,
    'UserMenu': `export default ()=>null;`,
    '@state/selectors/unreadNewsSelector': `import {atom} from 'jotai';export default atom([]);`,
    '@helpers/useEntityQueries': `export const useUsersQuery=()=>({data:[]});`,
    '@helpers/useHistoriesQuery': `export const useHistoriesQuery=filters=>({data:{pages:[{data:window.qa.history}]},isPending:false,isError:false,hasNextPage:false});`,
    '@components/HistoryFeed': `export default ()=>null;`,

    'expo-router': `import React from 'react'; export const router={push:p=>window.qa.routes.push(p)}; export const useLocalSearchParams=()=>({});const navigation={dispatch:()=>{},addListener:()=>()=>{}};export const useNavigation=()=>navigation;export const useFocusEffect=fn=>React.useEffect(fn,[fn]);`,
    'expo-secure-store': `export const getItemAsync=()=>{throw Error('Чтение защищённого хранилища запрещено')}; export const setItemAsync=getItemAsync;`,
    'expo-clipboard': `export const setStringAsync=async x=>{window.qa.clipboard.push(x);return true};`,
    'react-native-safe-area-context': `import {View} from 'react-native'; export const SafeAreaView=View; export const useSafeAreaInsets=()=>({top:24,left:0,right:0,bottom:16});`,
    '@react-navigation/native': `import React from 'react'; export const NavigationContext=React.createContext(null);export const usePreventRemove=()=>{};`,
    '@tanstack/react-query': `import React from 'react'; export const QueryClientContext=React.createContext(null); let queryData; const client={getQueryData:()=>queryData,setQueryData:(_,value)=>{queryData=typeof value==='function'?value(queryData):value},invalidateQueries:async p=>window.qa.invalidations.push(p)}; export const useMutation=()=>({mutateAsync:async()=>{throw Error('Запись через веб-мутацию запрещена')}});export const useQueryClient=()=>client; export const useQuery=()=>({data:{pendingCount:0,issueCount:0,outbox:{failed:0,conflict:0}},isError:false,refetch:async()=>{}});`,
    'useCachedEntities': `export const useCachedEntities=type=>({data:window.qaData[type]||[],isPending:false,isError:false,refetch:async()=>{}});`,
    'useSyncRunState': `export const useSyncRunState=()=>({status:'success'});`,
    'useWorkItemTerminology': `import {resolveMobileWorkItemTerminology} from '${root}/mobile/src/shared/domain/workItemTerminology'; export const MOBILE_SETTINGS_QUERY_KEY=['mobile-site-settings'];export const useWorkItemTerminology=()=>resolveMobileWorkItemTerminology({custom:{primaryEntityTerminology:'orders'}});`,
    'EventsScope': `export const useEventsScope=()=>({selectScope:(...args)=>window.qa.scopes.push(args)});`,
    'syncState': `export const getSyncQueueCounts=async()=>({pendingCount:0,issueCount:0});`,
    'outbox': `export const getOutboxSummary=async()=>({failed:0,conflict:0});`,
    'syncEngine': `export const runSync=async()=>{throw Error('Боевой запуск синхронизации запрещён')};`,
    'cache': `export const getCachedEntity=async(_,id)=>window.qaData.events.find(e=>e._id===id);export const listCachedEntities=async()=>[];export const upsertEntities=async()=>{};export const removeCachedEntity=async()=>{};`,
    'mutations': `export const saveLocalEntity=async payload=>{window.qa.mutations.push(payload); const event=window.qaData.events.find(e=>e._id===payload.entityId);Object.assign(event,payload.values);window.qaRerender();};`,
    'phoneContactConfirmation': `export const confirmPhoneContact=()=>{throw Error('Запись контактов запрещена')};`,
    '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({custom:()=>{throw Error('Запись контактов запрещена')}});`,
    '@state/atoms/itemsFuncAtom': `import {atom} from 'jotai';export default atom({client:{set:()=>{throw Error('Боевые записи запрещены')}}});`,
    '@state/atoms/loggedUserAtom': `import {atom} from 'jotai';export default atom({_id:'qa'});`,
    '@state/atoms/siteSettingsAtom': `import {atom} from 'jotai';export default atom({custom:{novofonEnabled:false}});`,
    '@state/atoms/tariffsAtom': `import {atom} from 'jotai';export default atom([]);`,
    '@helpers/tariffAccess': `export const getUserTariffAccess=()=>({allowTelephony:false});`,
    '@helpers/useSnackbar': `export default ()=>({success:x=>window.qa.alerts.push(x),warning:x=>window.qa.alerts.push(x)});`,
    '@components/ClientChatButton': `export default ()=>null; // showChat=false; вне проверяемой поверхности`,
    // Настоящие иконки Expo используют браузерный загрузчик шрифтов.
    'expo-font': `const pending=new Map();export const isLoaded=name=>document.fonts.check('20px "'+name+'"')&&[...document.fonts].some(f=>f.family===name&&f.status==='loaded');export const loadAsync=async fonts=>{for(const [name,url] of Object.entries(fonts)){if(!pending.has(name)){const face=new FontFace(name,'url('+url+')');document.fonts.add(face);pending.set(name,face.load())}await pending.get(name)}};`,
  }
  const nativeSeams = new Set(['AuthProvider','client','env','exportCsv','tokenStore','useCachedEntities', 'useSyncRunState', 'useWorkItemTerminology', 'EventsScope', 'syncState', 'outbox', 'syncEngine', 'cache', 'mutations', 'phoneContactConfirmation'])
  return { name: 'explicit-visual-fixtures', setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      let key = args.path; if(path.basename(key)==='UserMenu') key='UserMenu'
      if (args.importer.includes('/mobile/')) {
        const base = path.basename(args.path).replace(/\.(ts|tsx)$/, '')
        if (nativeSeams.has(base)) key = base; if(base==='api' && args.importer.includes('/navigation/'))key='api-support'
      }
      if (mocks[key]) return { path: key, namespace: 'qa-fixture' }
      if (key === '@expo/vector-icons') return { path: 'expo-icons', namespace: 'qa-fixture' }
      if (key === 'react-native') return { path: 'native-platform', namespace: 'qa-fixture' }
      // Один React для RN Web, mobile, Jotai и FontAwesome.
      if (/^react(?:\/|$)|^react-dom(?:\/|$)/.test(key)) return { path: require.resolve(key, { paths: [root] }) }
      if (/^@(components|helpers|layouts|state)\//.test(key)) return { path: path.join(root, key.slice(1)+(path.extname(key)?'':'.js')) }
    })
    build.onLoad({ filter: /.*/, namespace: 'qa-fixture' }, args => ({
      contents: args.path === 'native-platform' ? `export * from '${dependencies.RN_WEB_MODULE}';import {TextInput} from '${dependencies.RN_WEB_MODULE}';TextInput.State.currentlyFocusedInput=()=>['INPUT','TEXTAREA'].includes(document.activeElement?.tagName)?document.activeElement:null;export const findNodeHandle=()=>null;` : args.path === 'expo-icons'
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
// Снимок содержит динамические RN Web стили и шрифты для file:// проверок.
async function snapshot(page, file) {
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true)
    clone.querySelectorAll('script').forEach(el => el.remove())
    const original = [...document.querySelectorAll('style')]
    clone.querySelectorAll('style').forEach((el, i) => { el.textContent = [...(original[i].sheet?.cssRules || [])].map(rule => rule.cssText).join('\n') })
    // Вложенные native Pressable в RN Web превращаются во вложенные button.
    // HTML-парсер перемещает их дочерние узлы; сохраняем живую геометрию
    // и доступную роль с помощью div для внешних кнопок.
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
      // Модальное окно перехватывает ввод на живой странице RN Web.
      // Для статических проверок явно сохраняем неактивное состояние фона.
      clone.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="link"],[tabindex]').forEach(el => {
        if (exportedDialog.contains(el)) return
        el.setAttribute('data-qa-inactive-background', 'true')
        el.setAttribute('aria-hidden', 'true')
        el.removeAttribute('tabindex')
        el.removeAttribute('href')
        if (['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) el.setAttribute('disabled', '')
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
      return Object.fromEntries(['color','backgroundColor','borderTopColor','borderTopWidth','borderLeftColor','borderLeftWidth','borderRadius','fontFamily','fontSize','fontWeight','lineHeight','paddingLeft','paddingTop','borderBottomColor','borderBottomWidth','textDecorationLine','overflow','textOverflow','display'].map(k => [k,s[k]]))
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
    // Потомки горизонтального ScrollView могут выходить за окно по замыслу.
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

test('Этап Г: реальные RN Web компоненты, две темы, ширины и действия', {timeout:1800000}, async()=>{
 const output=process.env.STAGE_D_OUT;await fs.mkdir(output,{recursive:true})
 const baseline=process.env.D_CAPTURE_BASELINE==='1';
 const sourceHashes={'tests/components/androidStageD.browser.test.cjs':hash(await fs.readFile(__filename))};const esbuild=require(dependencies.ESBUILD_MODULE),{chromium}=require(dependencies.PLAYWRIGHT_MODULE)
 const bundle=await esbuild.build({entryPoints:[path.join(__dirname,'androidStageD.fixture.jsx')],absWorkingDir:root,bundle:true,minify:true,write:false,platform:'browser',jsx:'automatic',loader:{'.js':'jsx','.ttf':'dataurl','.module.css':'local-css'},outdir:path.join(output,'bundle'),define:{'process.env.NODE_ENV':'"production"','process.env':'{}','__DEV__':'false'},plugins:[fixturePlugin(sourceHashes)]})
 const rawCss=await fs.readFile(path.join(root,'app/globals.css'),'utf8');sourceHashes['app/globals.css']=hash(rawCss);sourceHashes['components/PeriodPicker.module.css']=hash(await fs.readFile(path.join(root,'components/PeriodPicker.module.css')));
 const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(rawCss,{from:path.join(root,'app/globals.css')})).css
 const font=(await fs.readFile(path.join(root,'fonts/InterTight-VariableFont_wght.ttf'))).toString('base64')
 const icon=(await fs.readFile(path.join(root,'mobile/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf'))).toString('base64')
 const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}html,body{margin:0}#root{min-height:100dvh}@font-face{font-family:InterTight;src:url(data:font/ttf;base64,${font});font-weight:100 900}@font-face{font-family:'Inter Tight';src:url(data:font/ttf;base64,${font});font-weight:100 900}@font-face{font-family:material-community;src:url(data:font/ttf;base64,${icon})}</style><style>${bundle.outputFiles.filter(f=>f.path.endsWith('.css')).map(f=>f.text).join('')}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js')).text.replaceAll('</script','<\\/script')}</script></body></html>`
 const server=http.createServer(async(req,res)=>{if(req.url.split('?')[0]==='/brand/vedelo-mark.svg'){res.setHeader('Content-Type','image/svg+xml');res.end(await fs.readFile(path.join(root,'public/brand/vedelo-mark.svg')));return}if(req.url==='/favicon.ico'){res.statusCode=204;res.end();return}res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`
 let executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
 if(!executablePath){for(const dir of (await fs.readdir('/home/aleksei/.cache/ms-playwright')).sort().reverse()){for(const platform of ['chrome-linux-arm64','chrome-linux','chrome-linux64']){const file=path.join('/home/aleksei/.cache/ms-playwright',dir,platform,'chrome');try{await fs.access(file);executablePath=file;break}catch{}}if(executablePath)break}}
 await fs.writeFile(path.join(output,'manifest.json'),JSON.stringify({dependencies,executablePath,cssSha256:hash(css),fontSha256:hash(Buffer.from(font,'base64')),iconSha256:hash(Buffer.from(icon,'base64')),sourceHashes,timezone:'Asia/Krasnoyarsk',fixture:'tests/components/androidStageD.fixture.jsx',nativeMainFont:'Arial',webBodyFont:'Inter Tight'},null,2));
 const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});const results=[],errors=[],warnings=[],failures=[]
 const check=(ok,text)=>{if(!ok)failures.push(text)}
 const capture=async(page,name)=>{await snapshot(page,path.join(output,name+'.html'));await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});const data=await measurements(page);results.push({name,...data});check(data.documentWidth<=data.width,`${name}: переполнение окна`);return data}
 try{
  for(const width of [360,390,420])for(const theme of ['light','dark'])for(const surface of (process.env.D_VERIFY_BILLING==='1'?['billing']:process.env.D_VERIFY_SETTINGS_PERIOD==='1'?['settings','period']:process.env.D_BASELINE_SUPPLEMENT==='1'?['web-history']:['header','menu','history','statistics','billing','integrations','referrals','settings','attention','period','web-history','tariff-pair'])){
   const name=`${width}-${theme}-${surface}`;const page=await browser.newPage({viewport:{width,height:surface==='history'||surface==='period'?480:800},timezoneId:'Asia/Krasnoyarsk'})
   page.on('pageerror',e=>errors.push({name,text:e.message}));page.on('console',m=>{if(m.type()==='error')errors.push({name,text:m.text()});if(m.type()==='warning')warnings.push({name,text:m.text()})})
   await page.route('https://qr.escalion.ru/**',async route=>{const request=route.request();const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'};if(request.method()==='OPTIONS'){await route.fulfill({status:204,headers});return}const body=request.postDataJSON();check(!request.headers().authorization,`${name}: QR без bearer`);check(body.data.url===`https://synthetic.invalid/register?ref=${'a'.repeat(24)}`,`${name}: QR точный URL`);const png=await require(path.join(deps,'qrcode')).toBuffer(body.data.url,{width:300,margin:2,errorCorrectionLevel:'H'});await route.fulfill({contentType:'image/png',headers,body:png})})
   await page.goto(`${origin}?theme=${theme}&surface=${surface}`);await page.waitForFunction(()=>window.qaReady);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(120)
   if(process.env.D_BROWSER_RED==='1'){await capture(page,name+'-red');if(surface==='header')assert.equal(await page.getByText('История действий',{exact:true}).first().evaluate(el=>getComputedStyle(el).fontSize),'16px','Роль заголовка должна совпадать с вебом')}
   if(baseline){
    if(surface==='history'){await page.getByText('Изменение 1',{exact:true}).waitFor();await page.getByText('Фильтры',{exact:true}).click();await capture(page,name+'-expanded');await page.getByText('Фильтры',{exact:true}).click()}
    if(surface==='period'){await page.getByTestId('stage-period-trigger').click();await page.getByRole('button',{name:'Выбрать даты',exact:true}).click();await page.getByRole('button',{name:'Ввести даты вручную',exact:true}).click();await capture(page,name+'-manual');await page.getByRole('button',{name:'Отмена',exact:true}).click()}
    if(surface==='integrations'){await page.getByTestId('integrations-list').waitFor();await page.getByRole('button',{name:'Настроить ИИ-провайдер',exact:true}).click();await page.getByTestId('integration-form-ai').waitFor();await page.getByText('Расходы ИИ Ведело',{exact:true}).waitFor();await capture(page,name+'-ai')}
   }
   if(!baseline){
   if(surface==='header'){

    const native=await page.getByTestId('page-header').first().boundingBox(),web=await page.locator('.cabinet-header').boundingBox();const action=await page.getByTestId('stage-header-action').getByTestId('page-header').boundingBox();check(native.height===64&&web.height===64&&action.height===64,`${name}: общая шапка 64`)
    const headerStyle=el=>{const c=getComputedStyle(el);return {background:c.backgroundColor,border:c.borderBottomColor,padding:c.paddingLeft}}
    const n=await page.getByTestId('page-header').first().evaluate(headerStyle),w=await page.locator('.cabinet-header').evaluate(headerStyle);check(JSON.stringify(n)===JSON.stringify(w),`${name}: реальные стили шапки ${JSON.stringify({n,w})}`)
    const textStyle=el=>{const c=getComputedStyle(el);const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');context.fillStyle=c.color;context.fillRect(0,0,1,1);return {color:[...context.getImageData(0,0,1,1).data],size:c.fontSize,weight:c.fontWeight,height:c.lineHeight}}
    const nt=await page.getByTestId('page-header').first().getByText('История действий',{exact:true}).evaluate(textStyle),wt=await page.locator('.cabinet-header .truncate').first().evaluate(textStyle);check(JSON.stringify(nt)===JSON.stringify(wt),`${name}: реальные роли текста ${JSON.stringify({nt,wt})}`)

   }
   if(surface==='menu'){
    const labels=await page.getByRole('button').evaluateAll(els=>els.map(el=>el.getAttribute('aria-label')||el.textContent));check(labels.join('|').includes('Статистика|Транзакции|Звонки|Отзывы|История действий|Поддержка|Настройки'),`${name}: порядок меню`)
    await page.getByRole('button',{name:'Отзывы',exact:true}).click();await page.getByRole('button',{name:'Настройка страницы отзывов',exact:true}).click();check((await page.evaluate(()=>window.qa.routes.at(-1)))==='/more/review-page',`${name}: точный маршрут`)
    await page.getByRole('button',{name:'Настройки',exact:true}).click();check(await page.getByRole('button',{name:'Настройка страницы отзывов',exact:true}).isVisible(),`${name}: независимое раскрытие групп`)
   }
   if(surface==='history'){
    await page.getByText('Изменение 1',{exact:true}).waitFor();await page.getByRole('button',{name:'Показать ещё',exact:true}).click();await page.getByText('Изменение 20',{exact:true}).waitFor()
    const count=await page.evaluate(()=>window.qa.requests.length);await page.getByText('Фильтры',{exact:true}).click();const box=await page.getByTestId('history-filter-scroll').boundingBox();check(box.height<=240,`${name}: внутренние фильтры до половины короткого экрана`)
    await capture(page,name+'-expanded');await page.getByText('Фильтры',{exact:true}).click();check(await page.getByText('Изменение 20',{exact:true}).isVisible(),`${name}: пагинация при сворачивании`);check((await page.evaluate(()=>window.qa.requests.length))===count,`${name}: раскрытие без запроса`)
    await page.getByLabel('Поиск',{exact:true}).fill('Анна');await page.getByTestId('history-filter-summary').getByText(/Анна/).waitFor();await page.getByTestId('history-reset').click();check((await page.getByLabel('Поиск',{exact:true}).inputValue())==='',`${name}: сброс снаружи`)
   }
   if(surface==='statistics'){
    await page.getByTestId('statistics-net').waitFor();const parity=await page.evaluate(()=>window.qaChartParity());assert.deepEqual(parity.native,parity.web,'Месячные формулы совпадают с настоящим веб helper');await page.getByText('Прибыль по месяцам',{exact:true}).waitFor();check(await page.getByTestId('statistics-monthly-chart').isVisible(),`${name}: настоящий график`);await page.getByTestId('statistics-monthly-chart').getByRole('button',{name:/текущая прибыль/}).first().click();await page.getByTestId('statistics-month-details').waitFor()
    await page.getByRole('button',{name:'Подсказка: Прибыль по месяцам',exact:true}).click();await page.getByTestId('field-help-panel').waitFor();await capture(page,name+'-help-grouping');await page.getByRole('button',{name:'Закрыть подсказку'}).click()
    await page.getByRole('button',{name:'Подсказка: Ожидаемая прибыль',exact:true}).click();await capture(page,name+'-help-expected');await page.getByRole('button',{name:'Закрыть подсказку'}).click()
   }
   if(surface==='billing'){
    await page.getByTestId('tariff-features-профи').waitFor();check(await page.getByTestId('tariff-features-профи').getByRole('button').count()===12,`${name}: 12 подсказок`);check((await page.getByTestId('ai-estimate-профи').textContent()).includes('4 ч 10 мин'),`${name}: оценка 300 ₽`)
    await page.getByTestId('tariff-features-профи').getByRole('button',{name:/Подсказка: ИИ-возможности/}).click();await capture(page,name+'-help');await page.getByRole('button',{name:'Закрыть подсказку'}).click()
   }
   if(surface==='integrations'){
    await page.getByTestId('integrations-list').waitFor();await page.getByRole('button',{name:'Настроить ИИ-провайдер',exact:true}).click();await page.getByTestId('ai-usage-panel').waitFor();const form=await page.getByTestId('integration-inline-ai').boundingBox(),next=await page.getByRole('button',{name:'Настроить Входящие заявки API',exact:true}).boundingBox();check(form.y+form.height<=next.y+.5,`${name}: форма до следующей строки`)
    await capture(page,name+'-ai');for(const [provider,title] of [['google-calendar','Google Calendar'],['avito','Avito'],['vk','VK'],['telephony','Novofon'],['public-leads','Входящие заявки API'],['telegram','Telegram Business']]){await page.getByRole('button',{name:`Настроить ${title}`,exact:true}).click();if(provider!=='telegram')await page.getByTestId(`integration-form-${provider}`).waitFor();await page.waitForTimeout(100);await capture(page,name+'-'+provider)}
   }
   if(surface==='referrals'){
    await page.getByTestId('referral-qr-image').waitFor();await page.waitForFunction(()=>document.querySelector('[data-testid="referral-qr-image"] img')?.complete || document.querySelector('img[data-testid="referral-qr-image"]')?.complete)
    const link=await page.getByTestId('referral-link').textContent();await page.getByRole('button',{name:'Скопировать ссылку',exact:true}).click();await page.getByRole('button',{name:'Поделиться ссылкой',exact:true}).click();check(await page.evaluate(link=>window.qa.clipboard[0]===link&&window.qa.shares[0]?.message===link,link),`${name}: совпадение URL`)
    const decoded=await page.evaluate(async()=>{const el=document.querySelector('[data-testid="referral-qr-image"] img')||document.querySelector('img[data-testid="referral-qr-image"]');const img=new Image();img.src=el.src;await img.decode();const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);return {data:Array.from(pixels.data),width:c.width,height:c.height}});const qr=require(path.join(deps,'jsqr'))(new Uint8ClampedArray(decoded.data),decoded.width,decoded.height);check(qr?.data===link,`${name}: фактическое декодирование QR`)
   }
   if(surface==='settings'){
    await page.getByRole('radio',{name:'Заказы',exact:true}).waitFor();await page.getByRole('radio',{name:'Заказы',exact:true}).click();await page.evaluate(()=>window.qa.failSave=true);await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await page.getByText(/Не удалось подтвердить сохранение/).waitFor();check((await page.getByRole('radio',{name:'Заказы',exact:true}).getAttribute('aria-checked'))==='true',`${name}: ошибка сохраняет ввод`)
    await page.evaluate(()=>window.qa.failSave=false);await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();await page.getByText('Изменения подтверждены сервером',{exact:true}).waitFor();check(await page.evaluate(()=>window.qa.requests.filter(r=>r.path.includes('/settings/terminology')).at(-1).method==='get'),`${name}: подтверждённое перечитывание`)
   }
   if(surface==='attention'){
    await page.getByTestId('attention-summary').waitFor();const row=await page.getByTestId('attention-summary').evaluate(el=>({height:el.clientHeight,scroll:el.scrollWidth>el.clientWidth}));check(row.scroll&&row.height<=48,`${name}: горизонтальная сводка одной строкой`)
   }
   if(surface==='tariff-pair'){
    const choice=page.getByTestId('tariff-features-профи');await choice.waitFor();await choice.getByRole('button',{name:/Подсказка: ИИ-возможности/}).click();const nativeText=await page.getByTestId('field-help-panel').textContent();await page.getByRole('button',{name:'Закрыть подсказку'}).click();await page.getByTestId('web-tariff-label').getByRole('button').click();const tooltip=page.getByRole('tooltip');await tooltip.waitFor();check(nativeText.includes(await tooltip.textContent()),`${name}: реальная тарифная веб-пара`);await capture(page,name+'-web-help');await page.getByTestId('web-tariff-label').getByRole('button').click()
   }
   if(surface==='period'){
    await page.getByTestId('stage-period-trigger').click();await page.getByRole('button',{name:'Выбрать даты',exact:true}).click();await page.getByRole('button',{name:'Ввести даты вручную',exact:true}).click();await page.getByLabel('С даты',{exact:true}).fill('31.02.2026');check(await page.getByRole('button',{name:'Применить',exact:true}).isDisabled(),`${name}: невозможная дата не применяется`);await page.getByLabel('С даты',{exact:true}).fill('01.10.2026');await page.getByLabel('По дату',{exact:true}).fill('09.10.2026');const bounds=await page.getByTestId('stage-period').boundingBox();check(bounds.y>=24&&bounds.y+bounds.height<=480-16+.5,`${name}: системные отступы 24/16`);const nativePanel=await page.getByTestId('stage-period').evaluate(el=>({width:el.getBoundingClientRect().width,bg:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderTopLeftRadius}));await capture(page,name+'-manual');await page.getByRole('button',{name:'Применить',exact:true}).click();check((await page.getByTestId('stage-period-trigger').getAttribute('aria-label'))==='Период: 1 октября 2026 г. — 9 октября 2026 г.',`${name}: обе даты применены`);await page.getByTestId('web-period').locator('button[aria-haspopup=dialog]').click();const dialog=page.getByRole('dialog');await dialog.waitFor();const webPanel=await dialog.evaluate(el=>({width:el.getBoundingClientRect().width,bg:getComputedStyle(el).backgroundColor,radius:getComputedStyle(el).borderTopLeftRadius}));check(nativePanel.width===webPanel.width && nativePanel.bg===webPanel.bg && nativePanel.radius===webPanel.radius,`${name}: реальная геометрия и тема пары периода ${JSON.stringify({nativePanel,webPanel})}`);await capture(page,name+'-web');await page.keyboard.press('Escape')
   }
   }
   const measure=await capture(page,name)
   if(!baseline){
   check(measure.escaped.length===0,`${name}: элементы вышли за границы вне горизонтальной прокрутки ${JSON.stringify(measure.escaped)}`)
   for(const control of measure.controls){if(control.rect.width>0&&control.rect.height>0&&!['web-history','tariff-pair'].includes(surface)&&control.name!==''){check(control.rect.width>=39.5&&control.rect.height>=39.5,`${name}: native target ${control.name} ${control.rect.width}×${control.rect.height}`)}}
   const mainText=measure.texts.filter(t=>t.text&&!/material-community/.test(t.style.fontFamily));check(mainText.every(t=>t.style.fontFamily.includes('Inter')),`${name}: роли InterTight`)
   }
   await page.close()
  }
 }finally{await browser.close();await new Promise(r=>server.close(r));const changedDuringRun=[];for(const [file,before]of Object.entries(sourceHashes))if(hash(await fs.readFile(path.join(root,file)))!==before)changedDuringRun.push(file);check(changedDuringRun.length===0,'Исходники изменились во время прогона');await fs.writeFile(path.join(output,'measurements.json'),JSON.stringify({sourceHashes,changedDuringRun,results,errors,warnings,failures},null,2))}
 if(!baseline){assert.deepEqual(errors,[],'Ошибки консоли');assert.deepEqual(failures,[],'UX/геометрия');}console.log(`Измерено ${results.length} состояний; артефакты ${output}`)
})
