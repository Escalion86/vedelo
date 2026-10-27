const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

test('AI editor: menu, preview, clarification, retry, mobile and dark theme', { timeout: 120000 }, async () => {
  const esbuild = require('../../mobile/node_modules/esbuild')
  const { chromium } = require('playwright')
  const mocks = {
    '@state/atoms': 'import {atom} from "jotai"; export const modalsFuncAtom=atom({});export {default as modalsAtom} from "./state/atoms/modalsAtom";',
    '@state/atoms/loggedUserAtom': 'import {atom} from "jotai"; export default atom({_id:"user",role:"dev"});',
    '@state/atoms/tariffsAtom': 'import {atom} from "jotai"; export default atom([]);',
    '@state/selectors/windowDimensionsTailwindSelector': 'import {atom} from "jotai"; export default atom(window.innerWidth<600?"phoneV":"desktop");',
    '@state/selectors/additionalEventsOverdueCountAtom': 'import {atom} from "jotai"; export const additionalEventsOverdueCountAtom=atom(0);',
    '@helpers/useSupportTickets': 'export const useSupportSummaryQuery=()=>({data:{data:{unreadCount:0}}});',
    '@helpers/tariffAccess': 'export const getUserTariffAccess=()=>({allowAi:true});',
    '@helpers/constants': 'export * from "./helpers/constants.js";',
    '@helpers/useSnackbar': 'const s={warning:(message)=>{window.aiNotice=message},error:(message)=>{window.aiNotice=message},success(){},info(){}};export default ()=>s;',
    '@helpers/useEventsQuery': 'const empty={data:[]};export const useEventQuery=(id)=>({data:id?window.fixtureEvent:null,isPending:false});export const useEventsQuery=()=>({data:empty});',
    '@helpers/useClientsQuery': 'const clients=[{_id:"client",firstName:"Анна",phone:79992222222}];export const useClientsQuery=()=>({data:clients});export const useClientQuery=(id)=>({data:clients.find(c=>c._id===id)});',
    '@helpers/useTransactionsQuery': 'const items=[];export const useTransactionsQuery=()=>({data:items});export const useDeleteTransactionMutation=()=>({mutateAsync:async()=>{}});',
    'next/navigation': 'const router={refresh(){},prefetch(){},push(){}};export const useRouter=()=>router;export const usePathname=()=>"/cabinet/eventsUpcoming";',
    '@components/Tooltip': 'export default function Tooltip({children,title}){return <span title={title}>{children}</span>}',
  }
  const bundled = await esbuild.build({
    stdin: {
      contents: `
        import React from 'react'; import {createRoot} from 'react-dom/client';
        import {Provider,createStore} from 'jotai';
        import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
        import MobileBottomNav from './components/MobileBottomNav';
        import AiEditAssistant from './components/AiEditAssistant';
        import CreateEventFab from './components/CreateEventFab';
        import eventFunc from './layouts/modals/modalsFunc/eventFunc';
        import itemsFuncAtom from './state/atoms/itemsFuncAtom';
        import useEventCreateMenu from './helpers/useEventCreateMenu';
        function DesktopCreate(){const {items,draftModals}=useEventCreateMenu();return <><CreateEventFab items={items}/>{draftModals}</>}
        import ModalsPortal from './layouts/modals/ModalsPortal';
        import modalsAtom from './state/atoms/modalsAtom';
        import siteSettingsAtom from './state/atoms/siteSettingsAtom';
        import {modalsFuncAtom} from '@state/atoms';
        const store=createStore();
        window.fixtureEvent={_id:'event',clientId:'client',status:'active',eventDate:'2026-12-20T10:00:00Z',dateEnd:'2026-12-20T11:00:00Z',contractSum:30000,eventType:'Свадьба',description:'Исходное описание',servicesIds:[],additionalEvents:[],address:{}};
        const openEditor=(id,options)=>{store.set(siteSettingsAtom,current=>({...current,custom:{...current.custom,eventFormVariant:window.formVariant||'compact'}}));store.set(modalsAtom,current=>[...current,{id:crypto.randomUUID(),props:eventFunc(id,false,null,options)}]);};
        store.set(itemsFuncAtom,{event:{set:async(payload)=>{const res=await fetch('/api/events/'+payload._id,{method:'PUT',body:JSON.stringify(payload),headers:{'Content-Type':'application/json'}});return (await res.json()).data}}});
        store.set(siteSettingsAtom,{custom:{primaryEntityTerminology:new URLSearchParams(location.search).get('terms')||'orders'}});
        window.openAi=(id=null,mode='text',options={})=>store.set(modalsAtom,[{id:crypto.randomUUID(),props:{
          title:options.unified?'Создать / редактировать заказ':'Редактировать заказ с ИИ',Children:AiEditAssistant,frameless:mode==='voice',childrenProps:{eventId:id,mode,...options,standaloneVoice:mode==='voice'},
          onlyCloseButtonShow:true,crossActsAsDecline:false,closeButtonName:'Закрыть'}}]);
        store.set(modalsFuncAtom,{event:{create(status,options){window.createdDraft={status,...options};if(window.renderCreatedDraft)openEditor(null,options)},edit(id,options){window.editedDraft={id,options};openEditor(id,options)},aiEdit:window.openAi},add(props){store.set(modalsAtom,current=>[...current,{id:crypto.randomUUID(),props}])},confirm:({onConfirm})=>onConfirm()});
        const client=new QueryClient();
        createRoot(document.getElementById('root')).render(<Provider store={store}><QueryClientProvider client={client}>
          <main style={{padding:24}}><h1>Заказы</h1><button onClick={()=>window.openAi('event')}>Изменить с ИИ</button></main>
          <MobileBottomNav/><DesktopCreate/><ModalsPortal/>
        </QueryClientProvider></Provider>);
      `, resolveDir: process.cwd(), loader: 'jsx',
    },
    bundle: true, write: false, outfile: path.join(require('node:os').tmpdir(), 'vedelo-ai-review.js'), format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{
      name: 'test-boundaries',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) => {
          if (Object.hasOwn(mocks, args.path)) return { path: args.path, namespace: 'mock' }
          if (/^@(state|layouts|components|helpers)\//.test(args.path))
            return { path: path.resolve(args.path.slice(1) + (path.extname(args.path) ? '' : '.js')) }
        })
        build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: process.cwd() }))
      },
    }],
  })
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(
    await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') }
  )).css + (bundled.outputFiles.find(file=>file.path.endsWith('.css'))?.text || '')
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>AI editor QA</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} #root{height:100dvh;display:grid;grid-template-rows:1fr auto;grid-template-areas:"main" "bottomnav"}main{grid-area:main}</style></head><body><div id="root"></div><script>${bundled.outputFiles.find(file=>file.path.endsWith('.js')).text.replaceAll('</script','<\\/script')}</script></body></html>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const browser = await chromium.launch({ headless: true, channel: 'msedge' }).catch((error) => {
    server.close()
    throw error
  })
  const errors = []
  try {
    for (const width of [390, 1365]) for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } })
      await page.addInitScript(() => {
        window.clipboardReads = 0
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => {
          window.clipboardReads++
          if (window.clipboardDenied) throw new DOMException('Denied', 'NotAllowedError')
          return '8 (999) 222-22-22'
        } } })
        window.AudioContext = undefined
        window.webkitAudioContext = undefined
        window.voiceTracksStopped = 0
        window.voiceRecordingsStarted = 0
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => {
          const stream = { getTracks: () => [{ stop() { window.voiceTracksStopped++ } }] }
          if (window.deferMicrophone) return new Promise(resolve=>{window.resolveMicrophone=()=>resolve(stream)})
          return stream
        } } })
        window.MediaRecorder = class {
          static isTypeSupported() { return true }
          constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm' }
          start() { this.state = 'recording'; window.voiceRecordingsStarted++ }
          stop() {
            this.state = 'inactive'
            this.ondataavailable?.({ data: new Blob(['test-audio'], { type: 'audio/webm' }) })
            this.onstop?.()
          }
        }
      })
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        // The first apply deliberately returns 502 to exercise recovery.
        if (message.type() === 'error' && !message.text().includes('502 (Bad Gateway)')) errors.push(message.text())
      })
      let applyCalls = 0
      let multipleCandidates = false
      let transcriptCalls = 0, prepareCalls = 0, deferTranscript = false, releaseTranscript, transcriptReadyResolve
      const plan = {
        planId: 'plan', eventId: 'event', clientName: 'Анна', eventTitle: 'Свадьба', eventDate: '2026-10-25T10:00:00Z',
        eventPatch: {contractSum:40000},
        completed: [], steps: [
          { entity: 'event', operation: 'update', changes: [{ field: 'contractSum', label: 'Стоимость', before: 30000, after: 40000 }] },
          { entity: 'transaction', operation: 'create', changes: [{ field: 'amount', label: 'Сумма', before: null, after: 10000 }] },
        ],
      }
      await page.route('**/api/events/ai-edit', async (route) => {
        prepareCalls++
        const body = route.request().postDataJSON()
        let payload
        if (body.mode === 'auto' && body.text.startsWith('Создай')) {
          if (body.text.includes('буфер')) assert.equal(body.clipboardPhone, '79992222222', JSON.stringify(body))
          payload = { fields: { clientId: 'client', description: 'Новая заявка' }, client: { _id: 'client', phone: 79992222222 }, aiFilledFields: ['clientId'] }
        } else if (body.mode === 'apply') {
          applyCalls++
          if (applyCalls === 1 || applyCalls === 3) return route.fulfill({ status: 502, json: { error: 'Ответ потерян' } })
          payload = { ...plan, completed: [0, 1], done: true }
        } else if (!body.eventId) payload = { candidates: [{ id: 'event', title: 'Свадьба', client: 'Анна', date: '2026-10-25T10:00:00Z' }, ...(multipleCandidates ? [{id:'other-event',title:'День рождения',client:'Борис',date:'2026-10-26T10:00:00Z'}] : [])], question: 'Выберите запись' }
        else payload = plan
        await route.fulfill({ json: payload })
      })
      let voiceText = 'Перенеси заказ на завтра'
      let manualWrites=0
      const manualPayloads=[]
      await page.route('**/api/events/event',async(route)=>{
        if(route.request().method()==='PUT'){manualWrites++;manualPayloads.push(route.request().postDataJSON())}
        await route.fulfill({json:{success:true,data:{_id:'event',clientId:'client',status:'active',eventDate:'2026-12-20T10:00:00Z',dateEnd:'2026-12-20T11:00:00Z',contractSum:manualWrites?45000:applyCalls>2?40000:30000,address:{},additionalEvents:[],servicesIds:[]}}})
      })
      await page.route('**/api/events/voice-transcript', async (route) => {
        transcriptCalls++
        if (deferTranscript) await new Promise(resolve=>{releaseTranscript=resolve;transcriptReadyResolve?.()})
        await route.fulfill({ json: { transcript: voiceText } }).catch(error=>{
          if (!route.request().failure()) throw error
        })
      })
      await page.goto(`http://127.0.0.1:${server.address().port}/cabinet/eventsUpcoming`)
      await page.waitForTimeout(500)
      assert.deepEqual(errors, [], `Page failed: ${(await page.locator('body').innerText()).slice(0, 300)}`)
      if (dark) await page.evaluate(() => document.body.classList.add('theme-dark'))
      assert.equal(await page.title(), 'AI editor QA')
      await page.getByRole('button', { name: /Добавить заявку/ }).click()
      await page.getByRole('button', {name:'Из фотографии ИИ',exact:true}).waitFor()
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth), false)
      assert.equal(await page.getByRole('button',{name:'Форма',exact:true}).locator('.ai-badge').count(),0)
      await page.getByRole('button', {name:'Создать/Ред. свободным текстом ИИ',exact:true}).first().click()
      const analyze=page.getByRole('button',{name:'Разобрать запрос ИИ',exact:true})
      await analyze.waitFor()
      assert.equal(await analyze.isDisabled(),true)
      assert.equal(await page.evaluate(()=>window.clipboardReads),0)
      await page.getByRole('textbox').fill('Создай заявку, телефон клиента возьми из буфера обмена')
      await analyze.click()
      await page.getByText('Телефон вставлен.', {exact:false}).waitFor()
      assert.equal(await page.getByRole('textbox',{name:'Телефон клиента из буфера',exact:true}).inputValue(),'79992222222')
      assert.equal(await page.evaluate(()=>window.createdDraft),undefined)
      if(process.env.QA_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,`ai-text-${width}-${dark?'dark':'light'}.png`)})
      await analyze.click()
      await page.waitForFunction(()=>window.createdDraft?.initialClient?.phone===79992222222)
      assert.equal(await page.evaluate(()=>window.clipboardReads),1)
      await page.getByRole('button',{name:/Добавить заявку/}).click()
      await page.getByRole('button',{name:'Создать/Ред. свободным текстом ИИ',exact:true}).click()
      await page.evaluate(()=>{window.clipboardDenied=true})
      await page.getByRole('textbox').fill('Создай заявку, номер из буфера')
      await analyze.click()
      await page.getByRole('alert').filter({hasText:'Браузер не разрешил'}).waitFor()
      await page.getByRole('textbox',{name:'Телефон клиента из буфера',exact:true}).fill('+7 999 222-22-22')
      await analyze.click()
      await analyze.waitFor({state:'detached'})
      await page.evaluate(()=>{window.clipboardDenied=false})
      const recognize=page.getByRole('button',{name:'Распознать и заполнить ИИ',exact:true})
      await page.getByRole('button', {name:/Добавить заявку/}).click()
      await page.getByRole('button',{name:'Из фотографии ИИ',exact:true}).click()
      await recognize.waitFor()
      assert.equal(await page.getByRole('button',{name:'Выбрать изображение',exact:true}).locator('.ai-badge').count(),0)
      await page.getByRole('button',{name:'Отмена',exact:true}).click()
      if (width === 390) {
        await page.getByRole('button', { name: /Добавить заявку/ }).click()
        await page.getByText('Создать / редактировать заказ', { exact: true }).waitFor()
        assert.equal(await page.getByRole('button', { name: 'Создать/Ред. голосом ИИ', exact: true }).count(), 1)
        await page.waitForTimeout(350)
        assert.ok((await page.getByText('Создать / редактировать заказ', { exact: true }).boundingBox()).y >= 0)
        if (process.env.QA_SCREENSHOT_DIR) {
          await fs.mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
          await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, `ai-menu-${dark ? 'dark' : 'light'}.png`) })
        }
        await page.getByRole('button', { name: 'Создать/Ред. свободным текстом ИИ', exact: true }).last().click()
      } else await page.getByRole('button', { name: 'Изменить с ИИ', exact: true }).click()
      await page.getByRole('textbox', { name: width === 390 ? 'Что нужно создать или изменить?' : 'Что нужно изменить?' }).fill('Стоимость 40000, получила 10000 наличными сегодня')
      await page.getByRole('button', { name: width === 390 ? 'Разобрать запрос ИИ' : 'Подготовить изменения ИИ', exact: true }).click()
      if (width === 390) await page.getByRole('button', { name: /Анна · Свадьба/ }).click()
      await page.getByRole('button', { name: 'Применить изменения', exact: true }).waitFor()
      assert.equal(applyCalls, 0)
      assert.equal(await page.getByRole('button',{name:'Применить изменения',exact:true}).locator('.ai-badge').count(),0)
      await page.getByRole('button', { name: 'Уточнить запрос', exact: true }).click()
      await page.getByRole('textbox', { name: width === 390 ? 'Что нужно создать или изменить?' : 'Что нужно изменить?' }).fill('Стоимость 40000, получила 10000 наличными вчера')
      await page.getByRole('button', { name: width === 390 ? 'Разобрать запрос ИИ' : 'Подготовить изменения ИИ', exact: true }).click()
      if (width === 390) await page.getByRole('button', { name: /Анна · Свадьба/ }).click()
      await page.getByText(/Станет: 40\s000 ₽/).waitFor()
      if (process.env.QA_SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, `ai-preview-${width}-${dark ? 'dark' : 'light'}.png`) })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      assert.equal(overflow, false)
      await page.getByRole('button', { name: 'Применить изменения', exact: true }).click()
      await page.getByRole('button', { name: 'Повторить / сверить', exact: true }).waitFor()
      assert.equal(await page.getByRole('textbox').isDisabled(), true)
      await page.getByRole('button', { name: 'Повторить / сверить', exact: true }).click()
      await page.getByText('Изменения сохранены', { exact: true }).waitFor()
      assert.equal(applyCalls, 2)
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
      await page.getByRole('textbox', { name: width === 390 ? 'Что нужно создать или изменить?' : 'Что нужно изменить?' }).waitFor({ state: 'detached' })

      // Отмена во время записи отбрасывает Blob и не вызывает распознавание/ИИ.
      const beforeTranscript = transcriptCalls, beforePrepare = prepareCalls
      await page.evaluate(()=>window.openAi('event','voice'))
      await page.getByText('Говорите',{exact:true}).waitFor()
      const cancelVoice = page.getByRole('button',{name:'Отмена',exact:true})
      const cancelBox = await cancelVoice.boundingBox()
      assert.ok(cancelBox.y > 700 && cancelBox.y + cancelBox.height <= 850)
      if (process.env.QA_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,`ai-voice-cancel-${width}-${dark?'dark':'light'}.png`)})
      await cancelVoice.click()
      await page.getByText('Говорите',{exact:true}).waitFor({state:'detached'})
      assert.equal(transcriptCalls,beforeTranscript)
      assert.equal(prepareCalls,beforePrepare)
      assert.ok(await page.evaluate(()=>window.voiceTracksStopped>0))

      // Поздно полученный stream сразу закрывается, запись не запускается.
      const started = await page.evaluate(()=>window.voiceRecordingsStarted)
      const stopped = await page.evaluate(()=>window.voiceTracksStopped)
      await page.evaluate(()=>{window.deferMicrophone=true;window.openAi('event','voice')})
      await page.getByText('Включаю микрофон',{exact:true}).waitFor()
      await page.waitForFunction(()=>Boolean(window.resolveMicrophone))
      await cancelVoice.click()
      await page.getByText('Включаю микрофон',{exact:true}).waitFor({state:'detached'})
      await page.evaluate(()=>{window.resolveMicrophone();window.deferMicrophone=false})
      await page.waitForFunction(stopped=>window.voiceTracksStopped>stopped,stopped)
      assert.equal(await page.evaluate(()=>window.voiceRecordingsStarted),started)
      assert.equal(transcriptCalls,beforeTranscript)

      // Отмена после отправки не даёт позднему ответу открыть план/создать заявку.
      deferTranscript=true
      const transcriptReady = new Promise(resolve=>{transcriptReadyResolve=resolve})
      await page.evaluate(()=>window.openAi('event','voice'))
      await page.getByText('Говорите',{exact:true}).waitFor()
      await page.getByRole('button',{name:'Завершить запись'}).click()
      await page.getByText('Обрабатываю',{exact:true}).waitFor()
      await transcriptReady
      await cancelVoice.click()
      await page.getByText('Обрабатываю',{exact:true}).waitFor({state:'detached'})
      deferTranscript=false
      releaseTranscript()
      await page.waitForTimeout(250)
      assert.equal(prepareCalls,beforePrepare)
      assert.equal(await page.getByText('Проверьте изменения',{exact:true}).count(),0)

      if (width === 390) {
        await page.getByRole('button', { name: /Добавить заявку/ }).click()
        await page.getByRole('button', { name: 'Создать/Ред. голосом ИИ', exact: true }).last().click()
      } else await page.evaluate(() => window.openAi('event', 'voice'))
      await page.getByText('Говорите', { exact: true }).waitFor()
      assert.equal(await page.getByRole('textbox').count(), 0)
      await page.getByText('Создать / редактировать заказ', {exact:true}).waitFor({state:'detached'})
      assert.equal(await page.getByRole('button', {name:'Разобрать запрос ИИ',exact:true}).count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Закрыть голосовой ввод' }).locator('..').locator('.ai-badge').count(), 0)
      if (process.env.QA_SCREENSHOT_DIR) await page.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,`ai-voice-only-${width}-${dark?'dark':'light'}.png`)})
      await page.getByRole('button', { name: 'Завершить запись' }).click()
      await page.getByText('ИИ подготовил изменения.',{exact:false}).waitFor()
      assert.equal(await page.getByText('Уточнение голосового запроса',{exact:true}).count(),0)
      assert.equal(await page.getByRole('button',{name:'Создать/Ред. голосом ИИ',exact:true}).count(),0)
      assert.equal(await page.getByRole('button',{name:/Добавить заявку/}).getAttribute('aria-expanded'),'false')
      assert.equal(await page.evaluate(()=>window.editedDraft.options.initialEvent.contractSum),40000)
      assert.deepEqual(await page.evaluate(()=>window.editedDraft.options.aiFilledFields),['contractSum'])
      assert.equal(applyCalls, 2, 'voice prepares the request but never applies edits automatically')
      assert.equal(manualWrites,0)
      if(process.env.QA_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,`ai-event-editor-${width}-${dark?'dark':'light'}.png`)})
      await page.locator('svg[data-icon="xmark"]:visible').first().click()
      await page.getByText('ИИ подготовил изменения.',{exact:false}).waitFor({state:'detached'})
      assert.equal(applyCalls,2,'closing the regular event form discards the plan')
      multipleCandidates=true
      await page.evaluate(()=>window.openAi(null,'voice',{unified:true}))
      await page.getByText('Говорите',{exact:true}).waitFor()
      await page.getByRole('button',{name:'Завершить запись',exact:true}).click()
      await page.getByText('Выберите заказ',{exact:true}).waitFor()
      assert.equal(await page.getByRole('textbox').count(),0)
      await page.getByRole('button',{name:/Анна · Свадьба/}).click()
      await page.getByText('ИИ подготовил изменения.',{exact:false}).waitFor()
      multipleCandidates=false
      await page.locator('svg[data-icon="xmark"]:visible').first().click()
      await page.getByText('ИИ подготовил изменения.',{exact:false}).waitFor({state:'detached'})
      assert.equal(applyCalls,2)
      if(width===1365)await page.evaluate(()=>{window.formVariant='classic'})
      await page.evaluate(()=>window.openAi('event','voice'))
      await page.getByText('Говорите',{exact:true}).waitFor()
      await page.getByRole('button',{name:'Завершить запись',exact:true}).click()
      await page.getByText('ИИ подготовил изменения.',{exact:false}).waitFor()
      if(width===1365)await page.getByRole('tab',{name:'Финансы и Документы',exact:true}).click()
      else await page.locator('summary').filter({hasText:'Финансы'}).click()
      const sumInput=page.getByPlaceholder('Договорная сумма',{exact:true})
      await sumInput.fill('45000')
      await page.getByRole('button',{name:'Применить',exact:true}).click()
      await page.getByRole('alert').filter({hasText:'Ответ потерян'}).waitFor()
      assert.equal(await sumInput.isDisabled(),true)
      assert.equal(manualWrites,0)
      await page.getByRole('button',{name:'Повторить / сверить',exact:true}).click()
      await page.getByText('ИИ подготовил изменения.',{exact:false}).waitFor({state:'detached'})
      assert.equal(applyCalls,4)
      assert.deepEqual(manualPayloads,[{_id:'event',contractSum:45000}])
      await page.evaluate(()=>{window.formVariant='compact'})
      voiceText = 'Создай заявку, возьми телефон клиента из буфера обмена'
      await page.evaluate(()=>{window.createdDraft=null})
      await page.getByRole('button', {name:/Добавить заявку/}).click()
      await page.getByRole('button', {name:'Создать/Ред. голосом ИИ',exact:true}).click()
      await page.getByText('Говорите',{exact:true}).waitFor()
      await page.getByRole('button', {name:'Завершить запись'}).click()
      await page.waitForFunction(()=>window.createdDraft?.initialEvent?.clientId==='client')
      assert.equal(await page.getByText('Уточнение голосового запроса',{exact:true}).count(),0)
      assert.equal(await page.getByRole('button',{name:'Создать/Ред. голосом ИИ',exact:true}).count(),0)
      voiceText = 'Создай новую заявку'
      await page.evaluate(()=>{window.createdDraft=null;window.renderCreatedDraft=true})
      await page.getByRole('button', {name:/Добавить заявку/}).click()
      await page.getByRole('button', {name:'Создать/Ред. голосом ИИ',exact:true}).click()
      await page.getByText('Говорите',{exact:true}).waitFor()
      assert.equal(await page.getByRole('textbox').count(),0)
      await page.getByRole('button', {name:'Завершить запись'}).click()
      await page.waitForFunction(()=>window.createdDraft?.initialEvent?.clientId==='client')
      await page.getByText('Поля с фиолетовой подсветкой заполнены ИИ.',{exact:false}).waitFor()
      assert.equal(await page.getByText('Уточнение голосового запроса',{exact:true}).count(),0)
      assert.equal(await page.getByRole('button',{name:'Создать/Ред. голосом ИИ',exact:true}).count(),0)

      await page.close()
    }
    const shortPage = await browser.newPage({ viewport: { width: 390, height: 568 } })
    await shortPage.goto(`http://127.0.0.1:${server.address().port}/cabinet/eventsUpcoming?terms=events`)
    await shortPage.getByRole('button', { name: /Добавить заявку/ }).click()
    await shortPage.getByText('Создать / редактировать мероприятие', { exact: true }).waitFor()
    await shortPage.getByRole('button', { name: 'Создать/Ред. свободным текстом ИИ', exact: true }).last().scrollIntoViewIfNeeded()
    assert.equal(await shortPage.getByRole('button', { name: 'Создать/Ред. голосом ИИ', exact: true }).count(), 1)
    await shortPage.close()
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
