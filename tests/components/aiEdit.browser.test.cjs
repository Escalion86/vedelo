const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

test('AI editor: menu, preview, clarification, retry, mobile and dark theme', { timeout: 120000 }, async () => {
  const esbuild = require('../../mobile/node_modules/esbuild')
  const { chromium } = require('playwright')
  const mocks = {
    '@state/atoms': 'import {atom} from "jotai"; export const modalsFuncAtom=atom({});',
    '@state/atoms/loggedUserAtom': 'import {atom} from "jotai"; export default atom({_id:"user",role:"dev"});',
    '@state/atoms/tariffsAtom': 'import {atom} from "jotai"; export default atom([]);',
    '@state/selectors/windowDimensionsTailwindSelector': 'import {atom} from "jotai"; export default atom(window.innerWidth<600?"phoneV":"desktop");',
    '@state/selectors/additionalEventsOverdueCountAtom': 'import {atom} from "jotai"; export const additionalEventsOverdueCountAtom=atom(0);',
    '@helpers/useSupportTickets': 'export const useSupportSummaryQuery=()=>({data:{data:{unreadCount:0}}});',
    '@helpers/tariffAccess': 'export const getUserTariffAccess=()=>({allowAi:true});',
    '@helpers/constants': 'export const pages=[]; export const pagesGroups=[];',
    'next/navigation': 'const router={refresh(){},prefetch(){},push(){}};export const useRouter=()=>router;export const usePathname=()=>"/cabinet/eventsUpcoming";',
    '@components/Tooltip': 'export default function Tooltip({children}){return children}',
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
        import useEventCreateMenu from './helpers/useEventCreateMenu';
        function DesktopCreate(){const {items,draftModals}=useEventCreateMenu();return <><CreateEventFab items={items}/>{draftModals}</>}
        import ModalsPortal from './layouts/modals/ModalsPortal';
        import modalsAtom from './state/atoms/modalsAtom';
        import siteSettingsAtom from './state/atoms/siteSettingsAtom';
        import {modalsFuncAtom} from '@state/atoms';
        const store=createStore();
        store.set(siteSettingsAtom,{custom:{primaryEntityTerminology:new URLSearchParams(location.search).get('terms')||'orders'}});
        window.openAi=(id=null,mode='text',options={})=>store.set(modalsAtom,[{id:crypto.randomUUID(),props:{
          title:options.unified?'Создать / редактировать заказ':'Редактировать заказ с ИИ',Children:AiEditAssistant,frameless:mode==='voice',childrenProps:{eventId:id,mode,...options,standaloneVoice:mode==='voice'},
          onlyCloseButtonShow:true,crossActsAsDecline:false,closeButtonName:'Закрыть'}}]);
        store.set(modalsFuncAtom,{event:{create(status,options){window.createdDraft={status,...options}},aiEdit:window.openAi},confirm:({onConfirm})=>onConfirm()});
        const client=new QueryClient();
        createRoot(document.getElementById('root')).render(<Provider store={store}><QueryClientProvider client={client}>
          <main style={{padding:24}}><h1>Заказы</h1><button onClick={()=>window.openAi('event')}>Изменить с ИИ</button></main>
          <MobileBottomNav/><DesktopCreate/><ModalsPortal/>
        </QueryClientProvider></Provider>);
      `, resolveDir: process.cwd(), loader: 'jsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx' },
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
  )).css
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><html><head><meta charset="utf-8"><title>AI editor QA</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} #root{height:100dvh;display:grid;grid-template-rows:1fr auto;grid-template-areas:"main" "bottomnav"}main{grid-area:main}</style></head><body><div id="root"></div><script>${bundled.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></body></html>`)
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
        Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } })
        window.MediaRecorder = class {
          static isTypeSupported() { return true }
          constructor() { this.state = 'inactive'; this.mimeType = 'audio/webm' }
          start() { this.state = 'recording' }
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
      const plan = {
        planId: 'plan', eventId: 'event', clientName: 'Анна', eventTitle: 'Свадьба', eventDate: '2026-10-25T10:00:00Z',
        completed: [], steps: [
          { entity: 'event', operation: 'update', changes: [{ field: 'contractSum', label: 'Стоимость', before: 30000, after: 40000 }] },
          { entity: 'transaction', operation: 'create', changes: [{ field: 'amount', label: 'Сумма', before: null, after: 10000 }] },
        ],
      }
      await page.route('**/api/events/ai-edit', async (route) => {
        const body = route.request().postDataJSON()
        let payload
        if (body.mode === 'auto' && body.text.startsWith('Создай')) {
          if (body.text.includes('буфер')) assert.equal(body.clipboardPhone, '79992222222', JSON.stringify(body))
          payload = { fields: { clientId: 'client', description: 'Новая заявка' }, client: { _id: 'client', phone: 79992222222 }, aiFilledFields: ['clientId'] }
        } else if (body.mode === 'apply') {
          applyCalls++
          if (applyCalls === 1) return route.fulfill({ status: 502, json: { error: 'Ответ потерян' } })
          payload = { ...plan, completed: [0, 1], done: true }
        } else if (!body.eventId) payload = { candidates: [{ id: 'event', title: 'Свадьба', client: 'Анна', date: '2026-10-25T10:00:00Z' }], question: 'Выберите запись' }
        else payload = plan
        await route.fulfill({ json: payload })
      })
      let voiceText = 'Перенеси заказ на завтра'
      await page.route('**/api/events/voice-transcript', (route) => route.fulfill({ json: { transcript: voiceText } }))
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
      if (width === 390) await page.getByRole('button', {name:/Анна · Свадьба/}).waitFor()
      else await page.getByRole('button', {name:'Применить изменения',exact:true}).waitFor()
      assert.equal(applyCalls, 2, 'voice prepares the request but never applies edits automatically')
      await page.getByRole('button', {name:'Закрыть',exact:true}).click()
      voiceText = 'Создай заявку, возьми телефон клиента из буфера обмена'
      await page.getByRole('button', {name:/Добавить заявку/}).click()
      await page.getByRole('button', {name:'Создать/Ред. голосом ИИ',exact:true}).click()
      await page.getByText('Говорите',{exact:true}).waitFor()
      await page.getByRole('button', {name:'Завершить запись'}).click()
      await page.evaluate(()=>{window.createdDraft=null})
      await page.getByText('Телефон вставлен.',{exact:false}).waitFor()
      await analyze.click()
      await page.waitForFunction(()=>window.createdDraft?.initialEvent?.clientId==='client')

      await analyze.waitFor({state:'detached'})
      voiceText = 'Создай новую заявку'
      await page.evaluate(()=>{window.createdDraft=null})
      await page.getByRole('button', {name:/Добавить заявку/}).click()
      await page.getByRole('button', {name:'Создать/Ред. голосом ИИ',exact:true}).click()
      await page.getByText('Говорите',{exact:true}).waitFor()
      assert.equal(await page.getByRole('textbox').count(),0)
      await page.getByRole('button', {name:'Завершить запись'}).click()
      await page.waitForFunction(()=>window.createdDraft?.initialEvent?.clientId==='client')
      assert.equal(await page.getByRole('textbox').count(),0)

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
