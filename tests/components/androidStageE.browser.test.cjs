const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto')
const root=path.resolve(__dirname,'../..'),output=process.env.STAGE_E_OUT,scratch=process.env.STAGE_M_SCRATCH
if(!output||!scratch)throw Error('STAGE_E_OUT и STAGE_M_SCRATCH обязательны для уникальных артефактов')
const esbuild=require(root+'/mobile/node_modules/esbuild'),{chromium}=require('/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright')
const {attachEvidence}=require('../browserEvidenceK.cjs')
let browser,server,origin;const results=[],errors=[],warnings=[],sourceHashes={
 'tests/components/androidStageE.browser.test.cjs':crypto.createHash('sha256').update(require('node:fs').readFileSync(__filename)).digest('hex'),
 'tests/browserEvidenceK.cjs':crypto.createHash('sha256').update(require('node:fs').readFileSync(path.join(root,'tests/browserEvidenceK.cjs'))).digest('hex'),
}
const {captureHistory}=require('../stageN-fixtures/historyLive.cjs')
;['tests/stageN-fixtures/historyLive.cjs','tests/stageN-fixtures/componentStorage.cjs'].forEach(file=>{sourceHashes[file]=crypto.createHash('sha256').update(require('node:fs').readFileSync(path.join(root,file))).digest('hex')})
const mocks={
 'expo-router':`import React from 'react';export const router={push:p=>window.qa.routes.push(p)};export const useLocalSearchParams=()=>({id:window.qa.surface==='client'?'client':'event'});export const useFocusEffect=fn=>React.useEffect(fn,[fn]);`,
 'expo-secure-store':`export const getItemAsync=async()=>null;export const setItemAsync=async()=>{};`,
 'expo-clipboard':`export const setStringAsync=async()=>{};`,
 '@expo/vector-icons':`import React from 'react';import {Text} from 'react-native';export const MaterialCommunityIcons=({size,color,...p})=><Text style={{fontSize:size,color}} {...p}>●</Text>;export const FontAwesome5=MaterialCommunityIcons;`,
 'react-native-safe-area-context':`export {View as SafeAreaView} from 'react-native';export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
 'AuthProvider':`const refreshUser=async()=>{},completeSignIn=async()=>{};export const useAuth=()=>({user:window.qa.user,refreshUser,completeSignIn});`,
 'client':`export const api={get:path=>window.qaApi('GET',path),request:(path,options)=>window.qaApi(options?.method||'GET',path,options?.body)};`,
 'phoneContactConfirmation':`export const confirmPhoneContact=async()=>{};`,
 // Synthetic storage boundary, not production SQL/queue. See readback.stageN.test.ts.
 'cache':`import {publishStorageBoundary} from '${root}/tests/stageN-fixtures/componentStorage.cjs';export const removeCachedEntity=async()=>{};export const listCachedEntities=async kind=>window.qaData[kind]||[];export const getCachedEntity=async(kind,id)=>window.qaData[kind]?.find(e=>e._id===id);export const upsertEntities=async(kind,items)=>{window.qa.writes.push({kind,items});window.qaData[kind]=items};export const publishEntityReadback=(kind,fresh,active,publish)=>publishStorageBoundary(kind,fresh,active,publish,getCachedEntity,upsertEntities);`,
 'useCachedEntities':`import {useQuery} from '@tanstack/react-query';export const useCachedEntities=kind=>useQuery({queryKey:['cached-entities',kind],queryFn:async()=>window.qaData[kind]||[]});`,
 'useSyncRunState':`export const useSyncRunState=()=>({status:'success'});`,
 'syncState':`export const getSyncQueueCounts=async()=>({pendingCount:0,issueCount:0});`,
 'outbox':`export const getOutboxSummary=async()=>({failed:0,conflict:0});`,
 'syncEngine':`export const runSync=async()=>{};`,
 'mutations':`export const saveLocalEntity=async()=>{};`,
 'uploadOnce':`export const uploadOnce=async()=>{throw Error('Uploads excluded from integration fixture')};`,
 'EventsScope':`export const useEventsScope=()=>({selectScope:()=>{}});`,
 'tokenStore':`const listeners=new Set();export const getAuthSession=async()=>({user:window.qa.user});export const getAccessToken=async()=>"synthetic-only";export const getStoredUser=async()=>window.qa.user;export const subscribeAuthSession=fn=>{listeners.add(fn);return()=>listeners.delete(fn)};window.__notifyStageMAuth=user=>{window.qa.user=user;listeners.forEach(fn=>fn(user))};`,
 'env':`export const env={apiBaseUrl:'https://synthetic.invalid/api',appScheme:'vedelo'};`,
 'expo-web-browser':`export const openBrowserAsync=async()=>{};`,
 '@react-native-community/netinfo':`export const useNetInfo=()=>({isConnected:true,isInternetReachable:true});export default {fetch:async()=>({isConnected:true,isInternetReachable:true})};`,
}
// Exact resolved module paths prevent basename 'client' intercepting unrelated libraries.
const seamPaths=Object.fromEntries(Object.entries({AuthProvider:'shared/auth/AuthProvider',client:'shared/api/client',cache:'shared/storage/cache',phoneContactConfirmation:'shared/domain/phoneContactConfirmation',useCachedEntities:'shared/hooks/useCachedEntities',useSyncRunState:'shared/hooks/useSyncRunState',syncState:'shared/sync/syncState',outbox:'shared/storage/outbox',syncEngine:'shared/sync/syncEngine',mutations:'shared/storage/mutations',EventsScope:'features/navigation/EventsScope',tokenStore:'shared/auth/tokenStore',env:'shared/config/env',uploadOnce:'features/profile/uploadOnce'}).map(([key,file])=>[path.join(root,'mobile/src',file),key]))
test.before(async()=>{
 await fs.mkdir(output,{recursive:true})
 const plugin={name:'explicit-platform-fixtures',setup(build){
  build.onResolve({filter:/.*/},args=>{
   let key=args.path;const resolved=path.resolve(args.resolveDir,args.path).replace(/\.(ts|tsx)$/,'');if(args.importer.startsWith(root+'/mobile/')&&!args.importer.includes('/node_modules/')&&seamPaths[resolved])key=seamPaths[resolved]
   if(mocks[key])return {path:key,namespace:'fixture'}
   if(key==='react-native')return {path:require.resolve(root+'/mobile/node_modules/react-native-web')}
   if(/^react(?:\/|$)|^react-dom(?:\/|$)|^@tanstack\/react-query/.test(key))return {path:require.resolve(key,{paths:[root+'/mobile']})}
  })
  build.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:mocks[args.path],loader:'jsx',resolveDir:root+'/mobile'}))
  build.onLoad({filter:/\.(tsx?|jsx?)$/,namespace:'file'},async args=>{
   if(!args.path.startsWith(root+'/')||args.path.includes('/node_modules/'))return
   const contents=await fs.readFile(args.path,'utf8');sourceHashes[path.relative(root,args.path)]=crypto.createHash('sha256').update(contents).digest('hex')
   return {contents,loader:path.extname(args.path)==='.ts'?'ts':path.extname(args.path)==='.tsx'?'tsx':'jsx'}
  })
 }}
 const bundle=await esbuild.build({entryPoints:[path.join(__dirname,'androidStageE.fixture.jsx')],bundle:true,write:false,metafile:true,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','__DEV__':'false'},plugins:[plugin]})
 await fs.writeFile(output+'/source-bindings.json',JSON.stringify({sourceHashes,metafile:bundle.metafile},null,2))
 const font=await fs.readFile(path.join(root,'public/fonts/InterTight-Regular.woff2')).catch(()=>null)
 const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;}#root{width:100%;}@font-face{font-family:InterTight;src:url(data:font/woff2;base64,${font.toString('base64')});font-weight:100 900;}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replace(/<\/script/g,'<\\/script')}</script></body></html>`
 server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html)});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${server.address().port}`
 let executablePath;for(const dir of (await fs.readdir('/home/aleksei/.cache/ms-playwright')).sort().reverse()){for(const suffix of ['chrome-linux-arm64','chrome-linux64','chrome-linux']){const p=path.join('/home/aleksei/.cache/ms-playwright',dir,suffix,'chrome');try{await fs.access(p);executablePath=p;break}catch{}}if(executablePath)break}
 if(!executablePath)throw Error('Chromium отсутствует')
 await fs.mkdir(path.join(scratch,'tmp'),{recursive:true});process.chdir(scratch)
 browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox','--disable-crash-reporter','--disable-breakpad'],env:{...process.env,TMPDIR:path.join(scratch,'tmp'),XDG_CONFIG_HOME:output+'/chrome-config',XDG_CACHE_HOME:output+'/chrome-cache'}})
 attachEvidence(browser,path.join(output,'evidence'),sourceHashes)
})
test.after(async()=>{try{if(browser)await captureHistory(browser,origin,path.join(output,'history-live'),sourceHashes)}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.writeFile(output+'/measurements.json',JSON.stringify({results,errors,warnings,sourceHashes},null,2))}})
for(const width of [360,390,420])for(const theme of ['light','dark'])test(`independent map geometry ${width} ${theme}`,async()=>{
 const page=await browser.newPage({viewport:{width,height:780}});page.on('pageerror',e=>errors.push(String(e)));page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());if(msg.type()==='warning')warnings.push(msg.text())})
 try{
 await page.goto(origin+'/?theme='+theme);const map=page.getByRole('link',{name:/Открыть адрес в 2ГИС/});await map.waitFor()
 const rect=await map.evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el),card=el.closest('[data-testid="geometry-card-shell"]').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,computed:{width:s.width,height:s.height,flexShrink:s.flexShrink},card:{x:card.x,width:card.width,right:card.right},documentWidth:document.documentElement.scrollWidth}})
 results.push({width,theme,rect})
 await map.click();assert.equal(await page.evaluate(()=>window.qa.opens),0,'map must not open card');assert.equal(await page.evaluate(()=>window.qa.links.length),1)
 const native40=await page.locator('button,[role=button],[role=link]').evaluateAll(nodes=>nodes.filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.height}).map(el=>({label:el.getAttribute('aria-label')||el.textContent,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));results[results.length-1].native40=native40;assert.ok(native40.every(r=>r.width>=40&&r.height>=40),JSON.stringify(native40));
 assert.ok(rect.width>=40&&rect.height>=40,`actual map ${rect.width}×${rect.height}; minimum 40×40`)
 assert.ok(rect.x>=rect.card.x && rect.right<=rect.card.right,'map inside card');assert.ok(rect.documentWidth<=width,'no horizontal overflow');assert.equal(errors.length,0,errors.join('\n'))
 }finally{await page.close()}
})
async function bounds(page,selector){return page.locator(selector).evaluate(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,color:s.color,background:s.backgroundColor,font:s.fontFamily}})}
for(const theme of ['light','dark'])test(`status map staggered polling ${theme}`,async()=>{
 const page=await browser.newPage({viewport:{width:390,height:780}})
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());if(msg.type()==='warning')warnings.push(msg.text())})
 const timeline=[],record={kind:'statusPolling',theme,timeline};results.push(record)
 try{
 await page.clock.install({time:new Date('2026-10-11T12:00:00Z')})
 await page.goto(origin+'/?surface=status-polling&theme='+theme)
 await page.getByText('★ 2 из 5',{exact:true}).waitFor()
 const capture=async label=>{
  await page.waitForFunction(()=>window.qa.statusFetchState()==='idle')
  const data=await page.evaluate(()=>({at:Date.now(),requests:window.qa.requests.filter(r=>r.path==='/client-reviews/statuses'),probeTicks:window.qa.probeTicks,runtime:window.qa.queryRuntime,visibility:document.visibilityState,observers:window.qa.statusObserverCount()}))
  timeline.push({label,...data});return data
 }
 const initial=await capture('first response settled')
 assert.equal(initial.runtime.isServer,false,'QueryObserver polling must run in a client runtime');assert.equal(initial.visibility,'visible');assert.equal(initial.requests.length,1);assert.equal(initial.observers,1)
 await page.clock.runFor(10000);await page.evaluate(()=>window.qa.mountStatusCards(2));await page.getByTestId('polling-card-second-shell').waitFor();await capture('second mount at +10s')
 await page.clock.runFor(10000);await page.evaluate(()=>window.qa.mountStatusCards(3));await page.getByTestId('polling-card-third-shell').waitFor();await capture('third mount at +20s')
 for(const label of ['+30s','+40s','+50s','+60s']){await page.clock.runFor(10000);await capture(label)}
 const last=timeline.at(-1)
 assert.equal(last.observers,3,'All three real status hook observers must be mounted')
 assert.ok(last.probeTicks.length>=3,`Real QueryObserver probe must poll at 0/30/60s: ${JSON.stringify(last.probeTicks)}`)
 record.pollingRequestCount=last.requests.length;record.probeCount=last.probeTicks.length
 assert.ok(last.requests.length<=3,`One bulk map must not fan out across staggered cards in 60s; actual timestamps: ${JSON.stringify(last.requests)}`)
 // Existing tenant-scoped invalidation must still refresh every card once.
 await page.evaluate(async()=>{window.qa.statusRating=5;await window.qa.refreshReviews()})
 await page.getByText('★ 5 из 5',{exact:true}).first().waitFor();assert.equal(await page.getByText('★ 5 из 5',{exact:true}).count(),3)
 const invalidated=await capture('one tenant invalidation');assert.equal(invalidated.requests.length,last.requests.length+1)
 // Query focus refreshes a stale bulk query once, independent of observer count.
 await page.evaluate(()=>window.qa.setQueryFocus(false));await page.clock.runFor(31000)
 const beforeFocus=await capture('before stale focus')
 await page.evaluate(()=>{window.qa.statusRating=3;window.qa.setQueryFocus(true)})
 await page.getByText('★ 3 из 5',{exact:true}).first().waitFor();assert.equal(await page.getByText('★ 3 из 5',{exact:true}).count(),3)
 const focused=await capture('one stale focus');assert.equal(focused.requests.length,beforeFocus.requests.length+1)
 assert.equal(errors.length,0,errors.join('\n'))
 }finally{await page.close()}
})
async function snapshot(page,file){
 const html=await page.evaluate(()=>{
  const clone=document.documentElement.cloneNode(true),original=[...document.querySelectorAll('style')]
  clone.querySelectorAll('script').forEach(el=>el.remove())
  clone.querySelectorAll('style').forEach((el,i)=>el.textContent=[...(original[i].sheet?.cssRules||[])].map(r=>r.cssText).join('\n'))
  const buttons=[...document.querySelectorAll('button')];[...clone.querySelectorAll('button')].forEach((el,i)=>{if(!el.querySelector('button'))return;const div=document.createElement('div');for(const a of el.attributes)div.setAttribute(a.name,a.value);div.setAttribute('role','button');div.style.font=getComputedStyle(buttons[i]).font;div.append(...el.childNodes);el.replaceWith(div)})
  return '<!doctype html>'+clone.outerHTML
 });await fs.writeFile(output+'/'+file,html)
}
for(const theme of ['light','dark'])test(`real screen integration ${theme}`,async()=>{
 const page=await browser.newPage({viewport:{width:390,height:780}});page.on('pageerror',e=>errors.push(String(e)));page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());if(msg.type()==='warning')warnings.push(msg.text())})
 try{
 await page.goto(origin+'/?surface=event&theme='+theme)
 await page.getByTestId('proposal-apply-proposal').waitFor();await page.getByText('Связаться со мной',{exact:true}).waitFor()
 await page.getByTestId('proposal-apply-proposal').click();await page.getByText('Выбранный вариант применён',{exact:true}).waitFor()
 const writes=await page.evaluate(()=>window.qa.writes.filter(x=>x.kind==='events'))
 assert.equal(writes.length,1);assert.equal(writes[0].items[0].contractSum,900);assert.equal(writes[0].items[0].description,'Описание сохранённой работы');assert.equal(writes[0].items[0].additionalEvents[0].title,'Связаться')
 const eventBounds=await bounds(page,'[data-testid="event-client-review-section"]')
 await page.getByText('Запланировать контакт',{exact:true}).click();assert.equal((await page.evaluate(()=>window.qa.routes)).at(-1).params.section,'contacts')
 await snapshot(page,`390-${theme}-event.html`)
 await page.goto(origin+'/?surface=client&theme='+theme);await page.getByTestId('review-card-review').waitFor();await page.getByText('Открыть работу',{exact:true}).click();assert.equal((await page.evaluate(()=>window.qa.routes)).at(-1),'/events/event')
 const clientBounds=await bounds(page,'[data-testid="client-reviews-section"]')
 await page.goto(origin+'/?surface=attention&theme='+theme);await page.getByTestId('review-card-review').waitFor();assert.equal(await page.getByTestId('unread-client-reviews').count(),1);await page.getByText('Клиент и контакты',{exact:true}).click();assert.equal((await page.evaluate(()=>window.qa.routes)).at(-1),'/clients/client')
 const attentionBounds=await bounds(page,'[data-testid="unread-client-reviews"]')
 await page.goto(origin+'/?surface=menu&theme='+theme);await page.getByText('Отзывы',{exact:true}).click();await page.getByText('Отзывы клиентов',{exact:true}).click();await page.getByText('Настройка страницы отзывов',{exact:true}).click();await page.getByText('Настройки',{exact:true}).click();await page.getByText('Шаблоны КП',{exact:true}).click()
 assert.deepEqual(await page.evaluate(()=>window.qa.routes),['/more/client-reviews','/more/review-page','/more/proposal-templates'])
 await page.goto(origin+'/?surface=billing&theme='+theme);await page.getByTestId('current-ai-estimate-pro').waitFor();assert.match(await page.getByTestId('current-ai-estimate-pro').innerText(),/17 мин расшифровки звонков/);assert.match(await page.getByTestId('ai-estimate-pro').innerText(),/25 черновиков/)
 results.push({kind:'integration',width:390,theme,eventBounds,clientBounds,attentionBounds,dynamicRates:true,appliedWrites:writes})
 assert.equal(errors.length,0,errors.join('\n'))
 }finally{await page.close()}
})
// Ancestor clipping is measured separately from the unchanged vendor gate.
for(const width of [360,390,420])for(const theme of ['light','dark'])test(`history visible bounds ${width} ${theme}`,async()=>{
 const page=await browser.newPage({viewport:{width,height:480}});page.on('pageerror',e=>errors.push(String(e)));page.on('console',msg=>{if(msg.type()==='error')errors.push('console: '+msg.text());if(msg.type()==='warning')warnings.push(msg.text())})
 try{
 await page.goto(origin+'/?surface=history&theme='+theme);await page.getByText('Изменение 1',{exact:true}).waitFor();await page.getByTestId('history-filter-toggle').click()
 const clip=await page.evaluate(()=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}}
  const visibleRect=el=>{let r=rect(el);for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),a=rect(p);if(/hidden|clip|scroll|auto/.test(s.overflowX)){r.left=Math.max(r.left,a.left);r.right=Math.min(r.right,a.right)}if(/hidden|clip|scroll|auto/.test(s.overflowY)){r.top=Math.max(r.top,a.top);r.bottom=Math.min(r.bottom,a.bottom)}}r.left=Math.max(0,r.left);r.top=Math.max(0,r.top);r.right=Math.min(innerWidth,r.right);r.bottom=Math.min(innerHeight,r.bottom);r.width=Math.max(0,r.right-r.left);r.height=Math.max(0,r.bottom-r.top);return r}
  const filter=document.querySelector('[data-testid="history-filter-scroll"]'),list=document.querySelector('[data-testid="history-list-scroll"]')
  const controls=[...filter.querySelectorAll('button,[role=button],input')].map(el=>({label:el.getAttribute('aria-label')||el.textContent,raw:rect(el),visible:visibleRect(el)}))
  const listVisible=visibleRect(list),overlaps=controls.filter(c=>c.visible.width&&c.visible.height&&Math.min(c.visible.bottom,listVisible.bottom)>Math.max(c.visible.top,listVisible.top)&&Math.min(c.visible.right,listVisible.right)>Math.max(c.visible.left,listVisible.left))
  return {filter:rect(filter),list:rect(list),listVisible,controls,overlaps,horizontalWidth:document.documentElement.scrollWidth}
 })
 results.push({kind:'historyClip',width,theme,height:480,...clip});assert.equal(clip.overlaps.length,0,'no visible filter/list overlap');assert.ok(clip.horizontalWidth<=width)
 await snapshot(page,`${width}-${theme}-history.html`)
 assert.equal(errors.length,0,errors.join('\n'))
 }finally{await page.close()}
})
