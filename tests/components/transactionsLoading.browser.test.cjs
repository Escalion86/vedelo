const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

const esbuildModule = process.env.ESBUILD_MODULE
const playwrightModule = process.env.PLAYWRIGHT_MODULE
const browserEnabled = Boolean(esbuildModule && playwrightModule)
const url = 'http://vedelo.test/transactions'
let browser, html

const mocks = {
  'next/image': 'export default ()=>null;',
  '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({transaction:{add(){},edit(...args){window.openTransactionEditor(...args)}}});`,
  '@components/ClientPicker': 'export default ()=>null;',
  '@components/EventPicker': 'export default ()=>null;',
  '@components/DateTimePicker': 'export default ()=>null;',
  '@state/storeHelpers': 'export const setAtomValue=()=>{};',
  '@helpers/useClientsQuery': 'const data=[];export const useClientsQuery=()=>({data});',
  '@helpers/useEventsQuery': 'const data={data:[]};export const useEventsQuery=()=>({data});',
  '@helpers/useEntityQueries': 'const data=[];export const useServiceGroupsQuery=()=>({data});',
}

const entry = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { useAtomValue } from 'jotai';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import TransactionsContent from './layouts/content/TransactionsContent';
  import transactionFunc from './layouts/modals/modalsFunc/transactionFunc';
  import hydrate from './helpers/useCabinetStateHydration';
  import isSiteLoadingAtom from './state/atoms/isSiteLoadingAtom';
  import { queryKeys } from './helpers/queryKeys';
  const defaults={page:'transactions',clients:[],events:[],transactions:[],transactionsComplete:false,services:[],siteSettings:{},tariffs:[],users:[],news:[]};
  const queryClient=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:30000}}});
  window.readLedger=()=>queryClient.invalidateQueries({queryKey:queryKeys.transactionsList});
  window.readCaches=()=>({legacy:queryClient.getQueryData(queryKeys.transactionsAll),list:queryClient.getQueryData(queryKeys.transactionsList)});
  window.readState=()=>queryClient.getQueryState(queryKeys.transactionsList);
  const saveCount=count=>window.transactionCount=count;
  const noop=()=>{};
  function App(){
    const [props,setProps]=useState(()=>({...defaults,...window.transactionProps}));
    const [editor,setEditor]=useState(null);
    const loading=useAtomValue(isSiteLoadingAtom);
    hydrate(props);
    window.hydrateAgain=patch=>setProps({...defaults,...patch});
    window.openTransactionEditor=(eventId,transactionId,options)=>setEditor(transactionFunc({eventId,transactionId,...options}));
    return loading?null:<main className="cabinet-canvas" style={{height:'100dvh'}}>
      {editor?<section aria-label={editor.title}><editor.Children closeModal={noop} setOnConfirmFunc={noop} setOnShowOnCloseConfirmDialog={noop} setDisableConfirm={noop}/></section>:<TransactionsContent onHeaderCountChange={saveCount}/>}
    </main>;
  }
  createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);
`

before(async () => {
  if (!browserEnabled) return
  const bundle = await require(esbuildModule).build({
    stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: entry },
    bundle: true,
    write: false,
    outdir: 'in-memory-qa',
    platform: 'browser',
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{
      name: 'fixture-seams',
      setup(build) {
        build.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(mocks, args.path)
            ? { path: args.path, namespace: 'mock' }
            : undefined
        )
        build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
          contents: mocks[args.path], resolveDir: process.cwd(), loader: 'jsx',
        }))
        build.onResolve({ filter: /^@(helpers|components|layouts|state)\// }, (args) => ({
          path: path.resolve(args.path.slice(1) + (path.extname(args.path) ? '' : '.js')),
        }))
      },
    }],
  })
  const css = (
    await require('postcss')([require('@tailwindcss/postcss')()]).process(
      await fs.readFile('app/globals.css', 'utf8'),
      { from: path.resolve('app/globals.css') }
    )
  ).css + bundle.outputFiles.find((file) => file.path.endsWith('.css')).text
  const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text
  html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${js.replaceAll('</script', '<\\/script')}</script></body></html>`
  browser = await require(playwrightModule).chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--disable-breakpad', '--disable-crash-reporter'],
  })
})

after(async () => {
  await browser?.close()
})

const transaction = (id, day, comment) => ({
  _id: id,
  date: `2026-10-${day}T12:00:00+07:00`,
  type: 'income',
  paymentMethod: 'cash',
  amount: 100,
  comment,
})
const response = (data) => ({ json: { success: true, data } })
const failed = { status: 503, json: { error: 'Сбой тестового чтения' } }
const waitCount = (page, expected) =>
  page.waitForFunction((count) => window.transactionCount === count, expected)

async function openPage(t, { width, dark, props, reply }) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, timezoneId: 'Asia/Krasnoyarsk' })
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  t.after(async () => {
    await page.close()
    assert.deepEqual(errors, [])
  })
  await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'))
  await page.addInitScript((data) => {
    window.transactionProps = data.props
    document.addEventListener('DOMContentLoaded', () => {
      document.body.classList.toggle('theme-dark', data.dark)
    })
  }, { props, dark })
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }))
  await page.route('**/api/transactions', reply)
  await page.goto(url)
  return page
}

test('финансы Web/PWA различают загрузку, ошибку, повтор и подтверждённую пустоту', { skip: !browserEnabled }, async (t) => {
  for (const width of [390, 1365]) {
    for (const dark of [false, true]) {
      await t.test(`${width}px, ${dark ? 'тёмная' : 'светлая'} тема`, async (t) => {
        let finishFirstRead
        const firstRead = new Promise((resolve) => { finishFirstRead = resolve })
        let requests = 0
        const page = await openPage(t, {
          width, dark,
          props: { transactions: [transaction('partial', '09', 'Частичная оплата')] },
          reply: async (route) => {
            requests++
            await route.fulfill(requests === 1 ? await firstRead : response(requests === 2 ? null : []))
          },
        })
        const loading = page.getByText('Загружаем транзакции…')
        const empty = page.getByText('Пока нет ни одной транзакции')
        await loading.waitFor()
        await waitCount(page, null)
        assert.equal(await empty.count(), 0)
        assert.equal(await page.getByText('Частичная оплата').count(), 0)

        finishFirstRead(failed)
        await page.getByRole('alert').getByText('Не удалось загрузить транзакции').waitFor()
        const retry = page.getByRole('button', { name: 'Повторить', exact: true })
        await retry.press('Enter')
        await page.waitForFunction(() => window.readState().errorUpdateCount === 2)
        await retry.waitFor()
        assert.equal(requests, 2)
        assert.equal(await empty.count(), 0)
        await waitCount(page, null)

        await retry.click()
        await empty.waitFor()
        await waitCount(page, 0)
        assert.equal(requests, 3)
        assert.equal(await retry.count(), 0)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      })
    }
  }
})

test('финансы сохраняют полный кэш при частичном SSR и ошибке обновления, фильтр использует обновлённые строки', { skip: !browserEnabled }, async (t) => {
  const today = transaction('today', '09', 'Оплата сегодня')
  const tomorrow = transaction('tomorrow', '10', 'Оплата завтра')
  const newTomorrow = transaction('new-tomorrow', '10', 'Новая оплата завтра')
  let requests = 0
  const page = await openPage(t, {
    width: 390,
    props: { transactions: [], transactionsComplete: true },
    reply: async (route) => {
      requests++
      await route.fulfill(requests === 1 ? failed : response([today, newTomorrow]))
    },
  })
  await page.getByText('Пока нет ни одной транзакции').waitFor()
  await waitCount(page, 0)
  assert.equal(requests, 0)

  await page.evaluate((items) => window.hydrateAgain({ transactions: items, transactionsComplete: true }), [today, tomorrow])
  await page.getByText('Оплата сегодня', { exact: true }).waitFor()
  await waitCount(page, 2)
  await page.evaluate((items) => window.hydrateAgain({ page: 'attention', transactions: items }), [today])
  await page.waitForFunction(() => window.readCaches().legacy.length === 1)
  assert.equal(await page.getByText('Оплата завтра', { exact: true }).isVisible(), true)
  await page.evaluate(() => window.hydrateAgain({ transactions: [], transactionsComplete: false }))
  await page.waitForFunction(() => window.readCaches().legacy.length === 0)
  await waitCount(page, 2)

  await page.evaluate(() => window.readLedger())
  await page.getByText('Не удалось обновить транзакции. Показаны сохранённые данные.').waitFor()
  await waitCount(page, 2)
  await page.getByRole('button', { name: /^Период:/ }).click()
  await page.getByRole('button', { name: /^Завтра:/ }).click()
  await waitCount(page, 1)
  assert.equal(await page.getByText('Оплата завтра', { exact: true }).isVisible(), true)
  assert.equal(await page.getByText('Оплата сегодня', { exact: true }).count(), 0)

  await page.getByRole('button', { name: 'Повторить', exact: true }).click()
  await page.getByText('Новая оплата завтра', { exact: true }).waitFor()
  await waitCount(page, 1)
  assert.equal(await page.getByText('Оплата завтра', { exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Сбросить период' }).click()
  await waitCount(page, 2)
  assert.equal(await page.getByText('Оплата сегодня', { exact: true }).isVisible(), true)
  assert.equal(requests, 2)

  assert.deepEqual(await page.evaluate(() => window.readCaches().legacy), [])
  await page.getByText('Новая оплата завтра', { exact: true }).click()
  const editor = page.getByRole('region', { name: 'Редактирование транзакции' })
  await editor.waitFor()
  assert.equal(await editor.getByPlaceholder('Комментарий').inputValue(), newTomorrow.comment)
  assert.equal(await editor.getByPlaceholder('Сумма').inputValue(), String(newTomorrow.amount))
})
