const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

test(
  'attention: deposit, task postponement and expanded lists, 390/1365 light/dark',
  { timeout: 120000 },
  async () => {
    const esbuild = require('../../mobile/node_modules/esbuild')
    const { chromium } = require('playwright')
    const mocks = {
      '@state/atoms':
        'import {atom} from "jotai"; export const modalsFuncAtom=atom({});',
      '@helpers/CRUD': 'export const getData=async()=>({meta:{totalCount:0}});',
      '@helpers/useMessengerSummary':
        'export const useMessengerSummaryQuery=()=>({data:{unreadItems:[]}});',
      '@helpers/useEventsQuery': `import {useQuery} from '@tanstack/react-query';
      export const useEventsQuery=({scope})=>useQuery({queryKey:['events',{scope}],queryFn:async()=>({data:scope==='drafts'&&window.event.status!=='draft'?[]:[window.event]}),initialData:{data:[window.event]}});
      export const useEventQuery=(id,event)=>({data:event});`,
      '@helpers/useTransactionsQuery': `import {useQuery} from '@tanstack/react-query'; export const useTransactionsQuery=()=>useQuery({queryKey:['transactions',{}],queryFn:async()=>window.transactions,initialData:[]});`,
      '@helpers/useClientsQuery':
        'export const useClientsQuery=()=>({data:window.clients});',
      '@components/PastRequests': 'export default ()=>null;',
      '@components/EventProposalStatus': 'export default ()=>null;',
      '@components/EventClientReviewStatus': 'export default ()=>null;',
      '@components/CardButtons': 'export default ()=>null;',
      '@components/ContactsIconsButtons': 'export default ()=>null;',
      '@components/Tooltip': 'export default ({children})=>children;',
      'next/navigation':
        'const router={refresh(){},push(){}};export const useRouter=()=>router;',
      'next/image': 'export default ()=>null;',
    }
    const bundle = await esbuild.build({
      stdin: {
        contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {Provider,createStore} from 'jotai';import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
      import {UpcomingEventsOverview} from './layouts/modals/modalsFunc/upcomingEventsOverviewFunc';
      import EventCard from './layouts/cards/EventCard';
      import ModalsPortal from './layouts/modals/ModalsPortal';
      import modalsAtom from './state/atoms/modalsAtom';import itemsFuncAtom from './state/atoms/itemsFuncAtom';
      import siteSettingsAtom from './state/atoms/siteSettingsAtom';import {modalsFuncAtom} from '@state/atoms';
      const due=new Date();due.setDate(due.getDate()-1);due.setHours(12,0,0,0);
      const date=new Date();date.setMonth(date.getMonth()+2);
      window.event={_id:'event',status:'draft',eventType:'Корпоратив',waitDeposit:true,depositDueAt:due.toISOString(),depositExpectedAmount:15000,eventDate:date.toISOString(),address:{town:'Красноярск'}};
      window.clients=[];window.transactions=[];window.opened=0;window.postponed=0;
      const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});window.client=client;
      const store=createStore();store.set(siteSettingsAtom,{custom:{primaryEntityTerminology:'orders'}});
      store.set(modalsFuncAtom,{event:{view(){window.opened++}},confirm:({onConfirm})=>onConfirm(),add(props){store.set(modalsAtom,[{id:'deposit',props}])}});
      store.set(itemsFuncAtom,{event:{async set(patch){window.postponed++;window.event={...window.event,...patch};client.setQueriesData({queryKey:['events']},()=>({data:[window.event]}))}}});
      function Badge(){const {data}=useQuery({queryKey:['events',{scope:'upcoming'}]});const {data:transactions=[]}=useQuery({queryKey:['transactions',{}]});return <section id="event-card"><EventCard eventId="event" event={data?.data[0]||window.event} transactions={transactions}/></section>}
      createRoot(document.getElementById('root')).render(<Provider store={store}><QueryClientProvider client={client}>
        <main className="cabinet-canvas" style={{padding:16,maxWidth:960,margin:'auto'}}><h1>Важное</h1><Badge/><UpcomingEventsOverview/></main><ModalsPortal/>
      </QueryClientProvider></Provider>);
    `,
        loader: 'jsx',
        resolveDir: process.cwd(),
      },
      bundle: true,
      write: false,
      outdir: 'memory-only',
      format: 'iife',
      jsx: 'automatic',
      loader: { '.js': 'jsx', '.css': 'empty' },
      define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
      plugins: [
        {
          name: 'boundaries',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (Object.hasOwn(mocks, args.path))
                return { path: args.path, namespace: 'mock' }
              if (/^@(state|layouts|components|helpers)\//.test(args.path))
                return {
                  path: path.resolve(
                    args.path.slice(1) + (path.extname(args.path) ? '' : '.js')
                  ),
                }
            })
            build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
              contents: mocks[args.path],
              loader: 'jsx',
              resolveDir: process.cwd(),
            }))
          },
        },
      ],
    })
    const css = (
      await require('postcss')([require('@tailwindcss/postcss')()]).process(
        await fs.readFile('app/globals.css', 'utf8'),
        { from: path.resolve('app/globals.css') }
      )
    ).css
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(
        `<!doctype html><html><head><title>Важное — проверка задатка</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}${bundle.outputFiles.find((file) => file.path.endsWith('.css'))?.text || ''}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
      )
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    let browser
    try {
      const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      browser = await chromium.launch(executablePath ? { executablePath } : { channel: 'msedge' })
      for (const width of [390, 1365])
        for (const dark of [false, true]) {
          const page = await browser.newPage({
            viewport: { width, height: 900 },
          })
          const errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (msg) => {
            if (msg.type() === 'error' && !msg.text().includes('503'))
              errors.push(msg.text())
          })
          let attempts = 0
          await page.route('**/api/events/event/deposit', async (route) => {
            const body = route.request().postDataJSON()
            attempts++
            assert.deepEqual(body, { amount: 12000, paymentMethod: 'cash' })
            if (attempts === 1)
              return route.fulfill({
                status: 503,
                json: {
                  error: 'Не удалось сохранить. Повторите подтверждение',
                },
              })
            const result = await page.evaluate((body) => {
              window.event = { ...window.event, status: 'active' }
              const data = {
                _id: 'payment',
                eventId: 'event',
                type: 'income',
                category: 'deposit',
                ...body,
              }
              window.transactions = [data]
              return { success: true, data, event: window.event }
            }, body)
            await route.fulfill({ json: result })
          })
          await page.goto(
            `http://127.0.0.1:${server.address().port}/cabinet/attention`
          )
          if (dark)
            await page.evaluate(() => document.body.classList.add('theme-dark'))
          await page
            .getByRole('button', { name: 'Задаток получен', exact: true })
            .waitFor()
          assert.equal(await page.title(), 'Важное — проверка задатка')
          assert.match(page.url(), /cabinet\/attention/)
          const request = page.locator('#attention-no-next-step')
          await request.getByRole('button', { name: 'Открыть заявку' }).waitFor()
          const backgrounds = await page.evaluate(() => {
            const background = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor
            return {
              canvas: background('.cabinet-canvas'),
              today: background('#attention-seg-today'),
              tomorrow: background('#attention-seg-tomorrow'),
              requests: background('#attention-no-next-step'),
              requestCard: background('#attention-no-next-step .attention-layer-card'),
            }
          })
          assert.equal(backgrounds.today, backgrounds.tomorrow)
          assert.equal(backgrounds.today, backgrounds.requests)
          assert.equal(new Set([backgrounds.canvas, backgrounds.requests, backgrounds.requestCard]).size, 3)
          assert.notEqual(backgrounds.requests, 'rgba(0, 0, 0, 0)')
          assert.notEqual(backgrounds.requestCard, 'rgba(0, 0, 0, 0)')
          const accents = await page.evaluate(() =>
            ['overdue', 'today', 'tomorrow'].map((segment) =>
              getComputedStyle(document.getElementById(`attention-seg-${segment}`)).borderLeftColor
            )
          )
          assert.deepEqual(accents, ['rgb(220, 38, 38)', 'rgb(217, 119, 6)', 'rgb(37, 99, 235)'])
          assert.equal(
            await page
              .locator('#event-card')
              .getByText('Просрочен задаток', { exact: true })
              .count(),
            1
          )
          await page
            .locator('#attention-seg-overdue')
            .getByRole('button', { name: /Просрочен задаток/ })
            .click()
          await page.waitForFunction(() => window.opened === 1)
          await page
            .getByRole('button', { name: 'Перенести на завтра', exact: true })
            .click()
          await page
            .locator('#attention-seg-tomorrow')
            .getByRole('button', { name: 'Задаток получен', exact: true })
            .waitFor()
          assert.equal(
            await page
              .locator('#event-card')
              .getByText('Жду задаток', { exact: true })
              .count(),
            1
          )
          assert.equal(await page.evaluate(() => window.postponed), 1)
          if (process.env.QA_SCREENSHOT_DIR)
            await page.screenshot({
              path: path.join(
                process.env.QA_SCREENSHOT_DIR,
                `deposit-attention-${width}-${dark ? 'dark' : 'light'}.png`
              ),
              fullPage: true,
            })
          await page
            .getByRole('button', { name: 'Задаток получен', exact: true })
            .click()
          await page.getByText(/После подтверждения заказ перейдёт/).waitFor()
          const input = page.locator('input').filter({ visible: true }).first()
          assert.match(await input.inputValue(), /15.?000/)
          await input.fill('12000')
          await page.getByRole('combobox').selectOption('cash')
          assert.equal(
            await page
              .getByRole('option', { name: 'Обязательство', exact: true })
              .count(),
            0
          )
          await page.waitForTimeout(600)
          if (process.env.QA_SCREENSHOT_DIR)
            await page.screenshot({
              path: path.join(
                process.env.QA_SCREENSHOT_DIR,
                `deposit-form-${width}-${dark ? 'dark' : 'light'}.png`
              ),
            })
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth
            ),
            false
          )
          await page
            .getByRole('button', { name: 'Подтвердить', exact: true })
            .click()
          await page
            .getByRole('alert')
            .getByText('Не удалось сохранить. Повторите подтверждение')
            .waitFor()
          assert.match(await input.inputValue(), /12.?000/)
          await page
            .getByRole('button', { name: 'Подтвердить', exact: true })
            .click()
          await page
            .getByRole('button', { name: 'Подтвердить', exact: true })
            .waitFor({ state: 'detached' })
          await page
            .getByRole('button', { name: 'Задаток получен', exact: true })
            .waitFor({ state: 'detached' })
          assert.equal(
            await page
              .locator('#event-card')
              .getByText('Жду задаток', { exact: true })
              .count(),
            0
          )
          assert.equal(attempts, 2)
          // Проверяем перенос настоящей задачи из UpcomingEventsOverview:
          // меняется её дата, остальные задачи и поля сохраняются.
          await page.evaluate(() => {
            const taskDate = new Date()
            taskDate.setDate(taskDate.getDate() - 1)
            taskDate.setHours(18, 45, 0, 0)
            const later = new Date()
            later.setMonth(later.getMonth() + 2)
            window.event = {
              ...window.event,
              additionalEvents: [
                { title: 'Позвонить клиенту', date: taskDate.toISOString(), done: false },
                { title: 'Другая задача', date: later.toISOString(), done: false },
              ],
            }
            window.otherTask = window.event.additionalEvents[1]
            window.client.setQueriesData({ queryKey: ['events'] }, () => ({ data: [window.event] }))
          })
          const taskActions = page.getByRole('group', { name: 'Перенести задачу', exact: true })
          await taskActions.getByRole('button', { name: 'Завтра', exact: true }).click()
          await page.waitForFunction(() => window.postponed === 2)
          assert.deepEqual(await page.evaluate(() => {
            const date = new Date(window.event.additionalEvents[0].date)
            const tomorrow = new Date()
            tomorrow.setDate(tomorrow.getDate() + 1)
            return [date.toDateString() === tomorrow.toDateString(), date.getHours(), date.getMinutes()]
          }), [true, 18, 45])
          await taskActions.getByRole('button', { name: 'Выбрать дату' }).click()
          const calendar = page.getByRole('group', { name: 'Календарь переноса задачи' })
          await calendar.waitFor()
          await page.getByRole('button', { name: 'Следующий месяц' }).click()
          const chosen = calendar.locator('button[data-date]').nth(16)
          const chosenDate = await chosen.getAttribute('data-date')
          await chosen.click()
          await page.getByRole('button', { name: 'Перенести', exact: true }).click()
          await calendar.waitFor({ state: 'detached' })
          assert.deepEqual(await page.evaluate(() => {
            const date = new Date(window.event.additionalEvents[0].date)
            return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
          }), [...chosenDate.split('-').map(Number), 18, 45])
          assert.equal(await page.evaluate(() => window.event.additionalEvents[0].title), 'Позвонить клиенту')
          assert.deepEqual(await page.evaluate(() => window.event.additionalEvents[1]), await page.evaluate(() => window.otherTask))

          await page.evaluate(() => {
            const dateAt = (dayOffset, minute) => {
              const date = new Date()
              date.setDate(date.getDate() + dayOffset)
              date.setHours(12, minute, 0, 0)
              return date.toISOString()
            }
            const tasks = (label, dayOffset) =>
              Array.from({ length: 13 }, (_, index) => ({
                title: `${label} ${index + 1}`,
                date: dateAt(dayOffset, index),
              })).reverse()
            const doneAt = new Date().toISOString()
            window.event = {
              ...window.event,
              additionalEvents: [
                ...tasks('Просроченная задача', -1),
                ...tasks('Завтрашняя задача', 1),
                { title: 'Выполненная задача', date: dateAt(-1, 0), done: true, doneAt },
              ],
            }
            window.clients = [{
              _id: 'fixture-client',
              firstName: 'Клиент',
              significantDates: Array.from({ length: 13 }, (_, index) => ({
                title: `Значимая дата ${index + 1}`,
                date: dateAt(index + 1, 0),
              })),
            }]
            const upcoming = Array.from({ length: 13 }, (_, index) => ({
              _id: `fixture-event-${index + 1}`,
              status: 'active',
              eventDate: dateAt(1, index),
            }))
            window.client.setQueriesData(
              { queryKey: ['events'] },
              () => ({ data: [window.event, ...upcoming] })
            )
          })

          const overdue = page.locator('#attention-seg-overdue')
          const tomorrow = page.locator('#attention-seg-tomorrow')
          const today = page.locator('#attention-seg-today')
          const showOverdue = overdue.getByRole('button', { name: 'Показать ещё (2) · Просрочено' })
          const showTomorrow = tomorrow.getByRole('button', { name: 'Показать ещё (1) · Завтра' })
          await showOverdue.waitFor()
          await showTomorrow.waitFor()
          assert.equal(await overdue.locator('.status-chip').textContent(), '13')
          assert.equal(await overdue.locator('.additional-event-list-card').count(), 12)
          assert.equal(await today.getByText('На сегодня задач нет').count(), 1)
          assert.equal(await today.getByRole('button', { name: /Показать ещё/ }).count(), 0)
          assert.equal(await overdue.getByText('Просроченная задача 13', { exact: true }).count(), 0)

          const controlledId = await showOverdue.getAttribute('aria-controls')
          const extraRows = overdue.locator(`[id="${controlledId}"]`)
          assert.equal(await showOverdue.getAttribute('aria-expanded'), 'false')
          assert.equal(await extraRows.isHidden(), true)
          assert.ok((await showOverdue.boundingBox()).height >= 40)
          await showOverdue.focus()
          await page.keyboard.press('Enter')
          const collapseOverdue = overdue.getByRole('button', { name: 'Свернуть · Просрочено' })
          assert.equal(await collapseOverdue.getAttribute('aria-expanded'), 'true')
          assert.equal(await collapseOverdue.evaluate((button) => button === document.activeElement), true)
          assert.equal(await extraRows.isVisible(), true)
          assert.equal(await overdue.locator('.status-chip').textContent(), '13')
          assert.equal(await overdue.locator('.additional-event-list-card').count(), 14)
          assert.equal(await overdue.getByText('Просроченная задача 13', { exact: true }).count(), 1)
          assert.equal(await overdue.getByText(/Выполненная задача/).count(), 1)
          assert.equal(await tomorrow.locator('.additional-event-list-card').count(), 12)

          await page.keyboard.press('Tab')
          assert.match(await page.evaluate(() => document.activeElement.textContent), /Просроченная задача 13/)
          await showTomorrow.click()
          assert.equal(await tomorrow.getByText('Завтрашняя задача 13', { exact: true }).count(), 1)
          await collapseOverdue.focus()
          await page.keyboard.press('Space')
          assert.equal(await overdue.getByText('Просроченная задача 13', { exact: true }).count(), 0)
          assert.equal(await tomorrow.getByText('Завтрашняя задача 13', { exact: true }).count(), 1)

          for (const [id, selector] of [
            ['attention-events', '.ui-surface-card'],
            ['attention-client-events', '.attention-layer-card'],
          ]) {
            const section = page.locator(`#${id}`)
            assert.equal(await section.locator(selector).count(), 12)
            await section.getByRole('button', { name: /Показать ещё \(1\)/ }).click()
            assert.equal(await section.locator(selector).count(), 13)
          }
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width)
          assert.deepEqual(errors, [])
          await page.close()
        }
    } finally {
      await browser?.close()
      await new Promise((resolve) => server.close(resolve))
    }
  }
)
