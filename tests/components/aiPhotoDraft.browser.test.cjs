const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const sharp = require('sharp')
const { harness } = require('../fixtures/aiPhotoHarness.cjs')

test('photo: actual nav/shared hook/modal, HTTP mock OCR, both themes and responsive form transfer', { timeout: 600000 }, async () => {
  const esbuild = require(process.env.ESBUILD_MODULE)
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
  const bundle = await esbuild.build({ stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';import {Provider,createStore} from 'jotai';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import Nav from './components/MobileBottomNav';import Fab from './components/CreateEventFab';
    import useMenu from './helpers/useEventCreateMenu';import userAtom from './state/atoms/loggedUserAtom';import tariffsAtom from './state/atoms/tariffsAtom';
    import settingsAtom from './state/atoms/siteSettingsAtom';import dimensionsAtom from './state/atoms/windowDimensionsAtom';import {modalsFuncAtom} from '@state/atoms';
    import Input from './components/Input';import Compact from './components/CompactEventForm';
    const store=createStore();store.set(userAtom,{_id:'user-a',tariffId:'ai',role:'dev'});store.set(tariffsAtom,[{_id:'ai',allowAi:true}]);
    window.configure=(allow,term,role='dev')=>{store.set(userAtom,{_id:'user-a',tariffId:'ai',role});store.set(tariffsAtom,[{_id:'ai',allowAi:allow}]);store.set(settingsAtom,{custom:{primaryEntityTerminology:term}})};
    store.set(dimensionsAtom,{width:innerWidth,height:innerHeight});
    window.created=[];window.openForm=()=>{};
    store.set(modalsFuncAtom,{event:{create:(status,options)=>{window.created.push({status,...options});window.openForm(options)}}});
    function Desktop(){const menu=useMenu();return <>{menu.draftModals}<Fab items={menu.items}/></>}
    function App(){const [draft,setDraft]=React.useState(null);window.openForm=setDraft;return <><main className="cabinet-canvas" style={{padding:16}}>
      {draft?<div data-testid="draft-form"><Compact fields={{description:<Input label="Распознанный запрос" value={draft.initialEvent.description||''} onChange={()=>{}}/>,eventType:<Input label="Тип события" value={draft.initialEvent.eventType||''} onChange={()=>{}}/>}} errors={{}} additionalEvents={[]} otherContacts={[]} documents={[]} services={[]} servicesIds={[]} status="draft" statusLabel="Заявка" isNew onSelectClient={()=>{}}/></div>:<p>Карточки заказов под меню</p>}
      </main><div style={{position:'fixed',bottom:0,width:'100%'}}><Nav/></div><Desktop/></>}
    createRoot(document.getElementById('root')).render(<Provider store={store}><QueryClientProvider client={new QueryClient()}><App/></QueryClientProvider></Provider>);
  ` }, bundle: true, write: false, platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, plugins: [{ name:'contexts', setup(build) {
    const mocks={
      '@state/atoms':'import {atom} from "jotai";export const modalsFuncAtom=atom({});',
      'next/navigation':'export const useRouter=()=>({push(){},prefetch(){}});export const usePathname=()=>"/cabinet/eventsUpcoming";',
      '@helpers/useSupportTickets':'export const useSupportSummaryQuery=()=>({data:null});',
      '@state/selectors/additionalEventsOverdueCountAtom':'import {atom} from "jotai";export const additionalEventsOverdueCountAtom=atom(0);',
      '@components/VoiceDraftOverlay':'export default function Voice(){return null}',
    };
    build.onResolve({filter:/^(@state\/atoms$|next\/navigation$|@helpers\/useSupportTickets$|@state\/selectors\/additionalEventsOverdueCountAtom$|@components\/VoiceDraftOverlay$)/},a=>({path:a.path,namespace:'mock'}));
    build.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],resolveDir:process.cwd(),loader:'jsx'}));
    build.onResolve({filter:/^@(state|layouts|components|helpers)\//},a=>({path:path.resolve(a.path.slice(1)+(path.extname(a.path)?'':'.js'))}));
  }}] })
  const css=(await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('app/globals.css','utf8'),{from:path.resolve('app/globals.css')})).css
  const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`
  let failure=false, paidRequests=0, eventPosts=0
  let failureGate = Promise.resolve()
  let releaseFailure = () => {}
  const api=await harness()
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/api/events/ai-photo-draft'){
      paidRequests++;await new Promise(r=>setTimeout(r,200));const chunks=[];for await(const chunk of req) chunks.push(chunk)
      const request=new Request('http://localhost'+req.url,{method:'POST',headers:req.headers,body:Buffer.concat(chunks)})
      if (failure) await failureGate
      const response=failure?Response.json({error:'Не удалось распознать. Выберите другое фото.'},{status:502}):await api.POST(request)
      res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return
    }
    if(req.url==='/api/events'&&req.method==='POST')eventPosts++
    res.writeHead(200,{'Content-Type':'text/html'});res.end(html)
  })
  await new Promise(r=>server.listen(0,'127.0.0.1',r))
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined})
  const artifacts=process.env.PHOTO_QA_DIR||'/home/aleksei/.hermes/cache/scratch/vedelo-photo-checks/browser'
  await fs.mkdir(artifacts,{recursive:true})
  const metrics=[]
  const capture=async(page,name)=>{
    const snapshot=await page.evaluate(()=>{const clone=document.documentElement.cloneNode(true);clone.querySelectorAll('script').forEach(s=>s.remove());const style=document.createElement('style');style.textContent=Array.from(document.styleSheets).flatMap(s=>{try{return Array.from(s.cssRules).map(r=>r.cssText)}catch{return []}}).join('\n');clone.querySelector('head').append(style);return '<!doctype html>'+clone.outerHTML})
    await fs.writeFile(path.join(artifacts,name+'.html'),snapshot)
    const scoped=await page.evaluate(name=>{
      const target=name.startsWith('menu-') ? document.querySelector('.mobile-bottomnav-create-menu') : document.querySelector('.photo-draft-content')?.closest('.relative.z-10')
      if(!target)return null
      const copy=target.cloneNode(true)
      if(name.startsWith('menu-')) { copy.style.position='relative';copy.style.bottom='auto';copy.style.left='auto';copy.style.transform='none';copy.style.margin='16px auto'; }
      const sheets=Array.from(document.styleSheets).flatMap(sheet=>{try{return Array.from(sheet.cssRules).map(rule=>rule.cssText)}catch{return []}}).join('\n')
      return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+sheets+'</style></head><body class="'+document.body.className+'">'+copy.outerHTML+'</body></html>'
    },name)
    if(scoped)await fs.writeFile(path.join(artifacts,'scope-'+name+'.html'),scoped)

    await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true})
  }
  try{
    for(const width of [390,1365])for(const dark of [false,true])for(const term of ['orders','events']){
      const page=await browser.newPage({viewport:{width,height:740}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}`)
      await page.evaluate(({dark,term})=>{document.body.classList.toggle('theme-dark',dark);window.configure(true,term)},{dark,term})
      const title=term==='orders'?'заказ':'мероприятие'
      await page.getByRole('button',{name:`Добавить заявку или ${title}`,exact:true}).click()
      await page.getByText(`Создать ${title}`,{exact:true}).waitFor()
      await page.getByRole('button',{name:'Из фотографии',exact:true}).waitFor()
      await page.waitForTimeout(250)
      if(width===390){
        const m=await page.locator('.mobile-bottomnav-create-title').evaluate(el=>{const s=getComputedStyle(el);const r=el.getBoundingClientRect();return{bg:s.backgroundColor,color:s.color,border:s.borderWidth,x:r.x,y:r.y,width:r.width,height:r.height}})
        const lum=c=>{const rgb=c.match(/[\d.]+/g).slice(0,3).map(v=>{v=Number(v)/255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722};const a=lum(m.bg),b=lum(m.color);const contrast=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);assert.ok(contrast>=4.5,`Heading contrast ${contrast}`);assert.ok(m.y>=0);metrics.push({viewportWidth:width,dark,term,...m,contrast})
      }
      await capture(page,`menu-${width}-${dark?'dark':'light'}-${term}`)
      await page.getByRole('button',{name:'Из фотографии',exact:true}).click()
      await page.getByText(`Фото заметки для ${term==='orders'?'заказа':'мероприятия'}`,{exact:true}).waitFor()
      const before=paidRequests
      assert.equal(await page.locator('input[capture=environment]').count(),1)
      if(width===390 && !dark && term==='orders') {
        await page.locator('input[type=file]').first().setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')})
        await page.getByRole('alert').waitFor();assert.equal(paidRequests,before)
      }
      await page.locator('input[type=file]').first().setInputFiles({name:'note.png',mimeType:'image/png',buffer:await sharp(Buffer.from('<svg width="640" height="360"><rect width="100%" height="100%" fill="white"/><text x="25" y="60" font-size="28">Клиент Анна. Шоу 15 октября.</text><text x="25" y="110" font-size="28">Гонорар 50000 рублей.</text></svg>')).png().toBuffer()})
      await page.getByAltText('Предпросмотр выбранной заметки').waitFor();assert.equal(paidRequests,before)
      await capture(page,`dialog-${width}-${dark?'dark':'light'}-${term}`)
      failure=true;failureGate=new Promise(resolve=>{releaseFailure=resolve});await page.getByRole('button',{name:'Распознать и заполнить',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Распознаём фото…',exact:true}).isDisabled(),true);releaseFailure();await page.getByRole('alert').waitFor();assert.equal((await page.evaluate(()=>window.created)).length,0)
      await capture(page,`error-${width}-${dark?'dark':'light'}-${term}`)
      failure=false;await page.getByRole('button',{name:'Распознать и заполнить',exact:true}).click()
      await page.getByText('Распознанный текст',{exact:true}).waitFor()
      await capture(page,`result-${width}-${dark?'dark':'light'}-${term}`)
      await page.getByRole('button',{name:'Открыть заполненную форму',exact:true}).click()
      await page.locator('[data-testid=draft-form]').waitFor()
      const created=await page.evaluate(()=>window.created);assert.equal(created.length,1);assert.equal(created[0].initialEvent.contractSum,50000);assert.equal(created[0].initialClient._id,'a');assert.ok(created[0].aiFilledFields.includes('contractSum'))
      assert.equal(eventPosts,0);assert.deepEqual(errors,[])
      await page.evaluate(term=>window.configure(false,term),term)
      await page.getByRole('button',{name:`Добавить заявку или ${title}`,exact:true}).click()
      assert.equal(await page.getByRole('button',{name:'Из фотографии',exact:true}).count(),0)
      for (const role of ['user', 'admin', 'performer']) {
        await page.evaluate(({term,role})=>window.configure(true,term,role),{term,role})
        assert.equal(await page.getByRole('button',{name:'Из фотографии',exact:true}).count(),0)
        assert.equal(await page.getByRole('button',{name:'Голосом',exact:true}).count(),1)
        assert.equal(await page.getByRole('button',{name:'Свободным текстом',exact:true}).count(),1)
      }
      await page.close()
    }
    await fs.writeFile(path.join(artifacts,'metrics.json'),JSON.stringify({metrics,paidRequests,eventPosts},null,2))
    // Short screen: four choices are contained in a scrollable menu.
    const page=await browser.newPage({viewport:{width:390,height:360}});await page.goto(`http://127.0.0.1:${server.address().port}`)
    await page.getByRole('button',{name:/Добавить заявку или/}).click();await page.getByRole('button',{name:'Из фотографии',exact:true}).click();await page.close()
  }finally{releaseFailure();await browser.close();await new Promise(r=>server.close(r))}
})
