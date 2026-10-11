const test = require('node:test')
const assert = require('node:assert/strict')
const {
  startHarness,
  capture,
  enterRange,
} = require('./periodPickerHarness.cjs')
let harness
const mocks = {
  'next/link': `import React from 'react';export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}`,
  'next/dynamic': `import React from 'react';export default loader=>React.lazy(loader)`,
  'next/navigation': `import {useSyncExternalStore} from 'react';const sub=f=>{window.addEventListener('qaNavigation',f);return()=>window.removeEventListener('qaNavigation',f)};export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(sub,()=>location.search));export const usePathname=()=>location.pathname;export const useRouter=()=>({replace(url){window.qaUrls=(window.qaUrls||[]).concat(url);history.replaceState(null,'',url);window.dispatchEvent(new Event('qaNavigation'))},refresh(){}});`,
  '@state/atoms': `import {atom} from 'jotai';export const modalsFuncAtom=atom({event:{view(){}},client:{view(){}},transaction:{edit(){},add(){}},confirm:{}});`,
  '@state/atoms/loggedUserAtom': `import {atom} from 'jotai';export default atom({_id:'dev',role:'dev'})`,
  '@state/atoms/windowDimensionsAtom': `import {atom} from 'jotai';export default atom({width:390,height:844})`,
  '@state/selectors/windowDimensionsTailwindSelector': `import {atom} from 'jotai';export default atom('mobile')`,
  '@state/storeHelpers': `export const setAtomValue=()=>{}`,
  '@helpers/switchImpersonation': `export default ()=>{}`,
  '@helpers/useSnackbar': `export default ()=>({success(){},error(){},warning(){},info(){}})`,
  '@helpers/useEntityQueries': `export const useUsersQuery=()=>({data:[{_id:'user-1',firstName:'Алексей'}]})`,
  '@helpers/useWorkItemTerminology': `export default ()=>({mode:'events',label:'мероприятие',labelCapitalized:'Мероприятие',plural:'мероприятия',pluralAccusative:'мероприятия'})`,
  '@helpers/useHistoriesQuery': `export function useHistoriesQuery(filters){window.qaHistory=(window.qaHistory||[]).concat({...filters});return {data:{pages:[{data:[{id:'h1',entityType:'event',entityId:'e1',entityLabel:'Тестовая работа',summary:'Создана работа',operation:'create',source:'web',actorLabel:'Алексей',occurredAt:'2026-10-08T12:11:00Z',entityExists:true,changes:[]}]}]},isPending:false,isError:false,hasNextPage:false}}`,
  '@helpers/useClientReviews': `export function useClientReviews(filters){window.qaReviews=(window.qaReviews||[]).concat({...filters});return {data:{total:60,allowClientReviews:true,items:[{_id:'r1',status:'submitted',rating:5,createdAt:'2026-10-08T12:00:00Z',note:'',comment:'Тестовый отзыв',clientName:'Тестовый клиент'}]},isPending:false,isError:false}};export const useReviewAction=()=>({mutateAsync:async()=>{},isPending:false});`,
  '@helpers/usePaymentOperationsQuery': `export function usePaymentOperationsQuery(filters){window.qaBilling=(window.qaBilling||[]).concat({...filters});return {data:{data:[],meta:{total:60,pageCount:3,page:filters.page}},isLoading:false,isError:false}}`,
  '@helpers/useTransactionsQuery': `const data=[{_id:'t1',date:'2026-10-09T12:00:00+07:00',type:'income',paymentMethod:'cash',sum:100,comment:'Сегодняшняя транзакция'},{_id:'t2',date:'2026-10-10T12:00:00+07:00',type:'expense',paymentMethod:'obligation',sum:50,comment:'Плановая транзакция'},{_id:'t3',date:'2026-09-01T12:00:00+07:00',type:'income',paymentMethod:'cash',sum:20,comment:'Старая транзакция'}];export const useTransactionsQuery=()=>({data});export const useDeleteTransactionMutation=()=>({mutateAsync:async()=>{}});`,
  '@helpers/useClientsQuery': `const data=[];export const useClientsQuery=()=>({data})`,
  '@helpers/useEventsQuery': `const data={data:[]};export const useEventsQuery=()=>({data})`,
  '@helpers/apiClient': `export async function apiJson(url){window.qaApi=(window.qaApi||[]).concat(url);if(url.startsWith('/api/developer/analytics'))return window.qaAnalyticsFixture;return {data:{items:[],data:[],pages:[],total:0}}}`,
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import Transactions from './layouts/content/TransactionsContent';import History from './layouts/content/HistoryContent';import Reviews from './layouts/content/ClientReviewsContent';import Billing from './layouts/content/BillingOperationsContent';import Analytics from './layouts/content/ServiceAnalyticsContent';import Google from './components/GoogleCalendarImportSettings';import Modal from './layouts/modals/Modal';import PeriodPicker from './components/PeriodPicker';
const search=new URLSearchParams(location.search);document.body.classList.toggle('theme-dark',search.get('scheme')==='dark');window.qaAnalyticsFixture={data:{current:{registrations:60,receipts:0,mature:0,converted:0},previous:{},users:Array.from({length:60},(_,i)=>({id:'user-'+i,name:'Пользователь '+i,newUser:true,registeredAt:'2026-10-08'})),daily:[],excludedOptions:[],distribution:[],sources:[],funnel:{registered:60},expiring:0},meta:{from:'2026-09-10',generatedAt:'2026-10-09T01:00:00Z',previousStart:'2026-08-11',previousEnd:'2026-09-10'}};
const choose=search.get('consumer');function Nested(){return <Modal id="qa-modal" title="Проверка вложенного периода" Children={()=> <div style={{height:160,overflow:'hidden'}}><PeriodPicker value={{from:'2026-10-01',to:'2026-10-09'}} onChange={v=>window.qaNested=v}/></div>} onlyCloseButtonShow onClose={()=>window.qaParentClosed=true}/>}
const Page={transactions:Transactions,history:History,reviews:Reviews,billing:Billing,analytics:Analytics,google:Google,nested:Nested}[choose];const client=new QueryClient({defaultOptions:{queries:{retry:false}}});createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><React.Suspense fallback={<div>Загрузка</div>}><Page loggedUser={{_id:'dev',role:'dev'}} onHeaderCountChange={n=>window.qaTransactionCount=n}/></React.Suspense></QueryClientProvider>);`
test.before(async () => {
  harness = await startHarness(entry, mocks)
})
test.after(async () => {
  await harness?.close()
})
async function openPage(consumer, scheme = 'light', width = 390, height = 844) {
  const page = await harness.browser.newPage({
    viewport: { width, height },
    timezoneId: 'Asia/Krasnoyarsk',
  })
  page.on('pageerror', (e) => {
    page.qaErrors = (page.qaErrors || []).concat(e.message)
  })
  page.setDefaultTimeout(90000)
  page.setDefaultNavigationTimeout(90000)
  await page.clock.setFixedTime(new Date('2026-10-09T01:00:00Z'))
  if (consumer === 'google')
    await page.route('**/api/google-calendar/**', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: route.request().url().includes('import-calendars')
            ? { calendars: [{ id: 'cal', summary: 'Календарь' }] }
            : {
                connected: true,
                calendarId: 'cal',
                calendarSummary: 'Календарь',
                allowCalendarSync: true,
                allowAi: true,
              },
        },
      })
    })
  await page.goto(
    harness.origin + '/?consumer=' + consumer + '&scheme=' + scheme
  )
  await page.addStyleTag({
    content: '*{transition:none!important;animation:none!important}',
  })
  return page
}
const last = (page, key) => page.evaluate((k) => window[k].at(-1), key)
async function noOverflow(page) {
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth
    ),
    false
  )
  assert.deepEqual(page.qaErrors || [], [])
}

test('TransactionsContent: настоящий список/фильтрация, marks проведённых/плановых дней и контекстные пресеты', async () => {
  const page = await openPage('transactions')
  await page.waitForFunction(() => window.qaTransactionCount === 3)
  await page.getByRole('button', { name: /^Период:/ }).click()
  await page.getByRole('button', { name: 'Выбрать даты', exact: true }).click()
  for (const key of ['2026-10-09', '2026-10-10'])
    assert.equal(
      await page.locator(`[data-date="${key}"]`).getAttribute('data-active'),
      'true'
    )
  await page.keyboard.press('Escape')
  await enterRange(page, '09.10.2026', '10.10.2026')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  await page.waitForFunction(() => window.qaTransactionCount === 2)
  await capture(page, 'consumer-transactions-390-light')
  await noOverflow(page)
  await page.getByRole('button', { name: /^Период:/ }).click()
  await page.getByRole('button', { name: /^Завтра:/ }).click()
  await page.waitForFunction(() => window.qaTransactionCount === 1)
  await page.getByRole('button', { name: 'Сбросить период' }).click()
  await page.waitForFunction(() => window.qaTransactionCount === 3)
  await page.setViewportSize({ width: 280, height: 740 })
  await noOverflow(page)
  await capture(page, 'consumer-transactions-280-light')
  await page.close()
})
test('HistoryContent: обе границы единым render, сериализация конца дня, сворачивание и счётчик', async () => {
  const page = await openPage('history')
  await page.getByRole('button', { name: /^Фильтры/ }).click()
  await page.evaluate(() => (window.qaHistory = []))
  await enterRange(page, '01.10.2026', '08.10.2026')
  assert.equal((await last(page, 'qaHistory'))?.dateFrom, undefined)
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.deepEqual(
    await page.evaluate(() =>
      window.qaHistory.map((f) => [f.dateFrom, f.dateTo])
    ),
    [['2026-10-01', '2026-10-08T23:59:59.999']]
  )
  assert.match(
    await page.getByRole('button', { name: /^Фильтры/ }).textContent(),
    /2/
  )
  await page.getByRole('button', { name: /^Фильтры/ }).click()
  assert.equal((await last(page, 'qaHistory')).dateFrom, '2026-10-01')
  await capture(page, 'consumer-history-390-light')
  await noOverflow(page)
  await page.close()
})
test('ClientReviewsContent: настоящие карточки, обе границы атомарно, первая страница и сохранение свёрнутых условий', async () => {
  const page = await openPage('reviews')
  await page.getByRole('button', { name: 'Далее', exact: true }).click()
  assert.equal((await last(page, 'qaReviews')).page, 1)
  await page.getByRole('button', { name: /^Фильтры/ }).click()
  await page.evaluate(() => (window.qaReviews = []))
  await enterRange(page, '01.10.2026', '08.10.2026', 'Период запросов')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.deepEqual(
    await page.evaluate(() =>
      window.qaReviews.map((f) => [f.from, f.to, f.page])
    ),
    [['2026-10-01', '2026-10-08', 0]]
  )
  await page.getByRole('button', { name: /^Фильтры/ }).click()
  assert.equal((await last(page, 'qaReviews')).page, 0)
  await capture(page, 'consumer-reviews-390-light')
  await noOverflow(page)
  await page.close()
})
test('BillingOperationsContent: обе даты атомарно и page=1 из третьей страницы, прочие условия сохранены', async () => {
  const page = await openPage('billing')
  await page.getByRole('button', { name: 'Вперёд', exact: true }).click()
  await page.getByRole('button', { name: 'Вперёд', exact: true }).click()
  assert.equal((await last(page, 'qaBilling')).page, 3)
  await page.evaluate(() => (window.qaBilling = []))
  await enterRange(page, '01.10.2026', '08.10.2026')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.deepEqual(
    await page.evaluate(() =>
      window.qaBilling.map((f) => [f.dateFrom, f.dateTo, f.page])
    ),
    [['2026-10-01', '2026-10-08', 1]]
  )
  assert.equal((await last(page, 'qaBilling')).sort, 'newest')
  await capture(page, 'consumer-billing-390-light')
  await noOverflow(page)
  await page.close()
})
test('ServiceAnalyticsContent: UTC, одно URL/API обновление, 366 дней, reset/default и очистка detail/page', async () => {
  const page = await openPage('analytics')
  await page.waitForFunction(() => window.qaApi?.length)
  await page.getByRole('button', { name: /^Регистрации/ }).click()
  await page.getByRole('button', { name: 'Далее', exact: true }).click()
  assert.ok(
    await page
      .getByRole('button', { name: 'Пользователь 25', exact: true })
      .count()
  )
  await page.evaluate(() => {
    window.qaUrls = []
    window.qaApi = []
  })
  await page.getByRole('button', { name: /^Период \(UTC\):/ }).click()
  assert.equal(
    await page.getByRole('button', { name: /^За всё время:/ }).count(),
    0
  )
  await page.getByRole('button', { name: /^Текущий месяц:/ }).click()
  await page.waitForFunction(() => window.qaApi.length === 1)
  assert.equal(await page.evaluate(() => window.qaUrls.length), 1)
  const url = await page.evaluate(() => window.qaUrls[0])
  assert.match(url, /from=2026-10-01/)
  assert.match(url, /to=2026-10-09/)
  assert.equal(
    await page.getByRole('heading', { name: /Регистрации за период/ }).count(),
    0
  )
  await page.getByRole('button', { name: /^Регистрации/ }).click()
  assert.ok(
    await page
      .getByRole('button', { name: 'Пользователь 0', exact: true })
      .count()
  )
  await page
    .getByRole('button', { name: 'Пользователь 0', exact: true })
    .click()
  await page
    .getByRole('heading', { name: 'История: Пользователь 0', exact: true })
    .waitFor()
  await enterRange(page, '08.10.2025', '09.10.2026', 'Период (UTC)')
  assert.equal(
    await page
      .getByRole('button', { name: 'Применить', exact: true })
      .isDisabled(),
    true
  )
  assert.equal(await page.evaluate(() => window.qaUrls.length), 1)
  await page.getByLabel('Начало периода', { exact: true }).fill('09.10.2025')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  assert.equal(
    await page
      .getByRole('heading', { name: 'История: Пользователь 0', exact: true })
      .count(),
    0
  )
  await page.getByRole('button', { name: 'Сбросить период' }).click()
  const resetUrl = await page.evaluate(() => window.qaUrls.at(-1))
  assert.match(resetUrl, /from=2026-09-10/)
  assert.match(resetUrl, /to=2026-10-09/)
  await capture(page, 'consumer-analytics-390-light')
  await noOverflow(page)
  await page.close()
})
test('GoogleCalendarImportSettings: required initial/reset, локальные ISO, preview selection, loading/importing, re-preview', async () => {
  const page = await openPage('google')
  const scans = [],
    posts = []
  let scanResolve, postResolve, notifyScan, notifyPost
  const scanStarted = new Promise((resolve) => {
    notifyScan = resolve
  })
  const postStarted = new Promise((resolve) => {
    notifyPost = resolve
  })
  const scanData = {
    candidates: [
      {
        id: 'g1',
        title: 'Тестовое событие',
        eventDate: '2026-10-09T12:00:00+07:00',
      },
      { id: 'g2', title: 'Импортировано', alreadyImported: true },
      { id: 'g3', title: 'Отменено', canceled: true },
    ],
    maxEvents: 100,
    quote: { provider: 'personal' },
  }
  await page.route('**/api/google-calendar/**', async (route) => {
    const url = route.request().url()
    await route.fulfill({
      json: {
        success: true,
        data: url.includes('import-calendars')
          ? { calendars: [{ id: 'cal', summary: 'Календарь' }] }
          : {
              connected: true,
              calendarId: 'cal',
              calendarSummary: 'Календарь',
              allowCalendarSync: true,
              allowAi: true,
            },
      },
    })
  })
  await page.route('**/api/events/google-import**', async (route) => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON())
      await new Promise((r) => {
        postResolve = r
        notifyPost()
      })
      await route.fulfill({
        json: {
          success: true,
          data: { results: [{ status: 'created' }], actualCost: 0 },
        },
      })
    } else {
      scans.push(new URL(route.request().url()).searchParams.toString())
      if (scans.length === 1)
        await new Promise((r) => {
          scanResolve = r
          notifyScan()
        })
      await route.fulfill({ json: { success: true, data: scanData } })
    }
  })
  await page.getByRole('button', { name: /^Период импорта:/ }).waitFor()
  const initialTitle = await page
    .getByRole('button', { name: /^Период импорта:/ })
    .getAttribute('title')
  assert.match(initialTitle, /9 апреля 2027/)
  await enterRange(page, '09.10.2026', '', 'Период импорта')
  assert.equal(
    await page
      .getByRole('button', { name: 'Применить', exact: true })
      .isDisabled(),
    true
  )
  await page.keyboard.press('Escape')
  await enterRange(page, '01.10.2026', '08.10.2026', 'Период импорта')
  await page.getByRole('button', { name: 'Применить', exact: true }).click()
  await page
    .getByRole('button', { name: 'Найти мероприятия', exact: true })
    .click()
  await page.waitForFunction(
    () => document.querySelector('[data-period-picker] button').disabled
  )
  assert.equal(
    await page.getByRole('button', { name: 'Сбросить период' }).isDisabled(),
    true
  )
  await scanStarted
  scanResolve()
  await page.getByText('Тестовое событие', { exact: true }).waitFor()
  const params = new URLSearchParams(scans[0])
  assert.equal(params.get('timeMin'), '2026-09-30T17:00:00.000Z')
  assert.equal(params.get('timeMax'), '2026-10-08T16:59:59.999Z')
  assert.equal(await page.locator('input[type="checkbox"]:checked').count(), 1)
  await page
    .getByRole('button', { name: 'Импортировать 1', exact: true })
    .click()
  await page.waitForFunction(
    () => document.querySelector('[data-period-picker] button').disabled
  )
  await postStarted
  postResolve()
  await page.getByText('Импорт завершён', { exact: true }).waitFor()
  assert.equal(scans.length, 2)
  assert.equal(posts[0].timeMin, params.get('timeMin'))
  assert.deepEqual(posts[0].eventIds, ['g1'])
  await page.getByRole('button', { name: 'Сбросить период' }).click()
  assert.equal(
    await page
      .getByRole('button', { name: /^Период импорта:/ })
      .getAttribute('title'),
    initialTitle
  )
  await capture(page, 'consumer-google-390-light')
  await noOverflow(page)
  await page.close()
})
test('Portal поверх настоящего Modal: фокус, Escape, возврат, clipping и scroll lock', async () => {
  const page = await openPage('nested')
  await page.evaluate(() =>
    document.body.style.setProperty('overflow', 'clip', 'important')
  )
  await page.getByRole('button', { name: /^Период:/ }).click()
  await page.getByRole('button', { name: 'Выбрать даты', exact: true }).click()
  assert.equal(
    await page
      .locator('dialog')
      .evaluate((el) => el.parentElement === document.body),
    true
  )
  await page.locator('[data-date="2026-10-09"]').click()
  await capture(page, 'nested-modal-390-light')
  await page.keyboard.press('Escape')
  assert.equal(
    await page
      .getByRole('button', { name: /^Период:/ })
      .evaluate((el) => el === document.activeElement),
    true
  )
  assert.equal(await page.evaluate(() => Boolean(window.qaParentClosed)), false)
  assert.deepEqual(
    await page.evaluate(() => [
      document.body.style.getPropertyValue('overflow'),
      document.body.style.getPropertyPriority('overflow'),
    ]),
    ['clip', 'important']
  )
  assert.equal(
    await page
      .getByText('Проверка вложенного периода', { exact: true })
      .count(),
    1
  )
  await noOverflow(page)
  await page.close()
})
test(
  'Все реальные потребители: обе темы, 280/390/1365 и короткая высота без overflow/console ошибок',
  { timeout: 600000 },
  async () => {
    for (const consumer of [
      'transactions',
      'history',
      'reviews',
      'billing',
      'analytics',
      'google',
    ]) {
      const page = await openPage(consumer)
      await page.locator('#root > *').waitFor()
      if (['history', 'reviews'].includes(consumer))
        await page.getByRole('button', { name: /^Фильтры/ }).click()
      await page.locator('[data-period-picker]').waitFor()
      for (const [width, height] of [
        [280, 740],
        [390, 640],
        [1365, 900],
      ])
        for (const scheme of ['light', 'dark']) {
          await page.setViewportSize({ width, height })
          await page.evaluate(
            (theme) =>
              document.body.classList.toggle('theme-dark', theme === 'dark'),
            scheme
          )
          await noOverflow(page)
          await capture(
            page,
            `consumer-${consumer}-${width}-${height}-${scheme}`
          )
        }
      await page.close()
    }
  }
)
