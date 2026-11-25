const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('./periodPickerHarness.cjs')

const contents = `
  import React, {useEffect, useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {Provider, createStore} from 'jotai';
  import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
  import {modalsFuncAtom} from '@state/atoms';
  import clientViewFunc from './layouts/modals/modalsFunc/clientViewFunc';
  import clientEventsFunc from './layouts/modals/modalsFunc/clientEventsFunc';
  import clientTransactionsFunc from './layouts/modals/modalsFunc/clientTransactionsFunc';
  import {useEventActions} from './helpers/useEventsQuery';
  import {useUpdateTransactionMutation} from './helpers/useTransactionsQuery';
  const View = clientViewFunc('client').Children;
  const Works = clientEventsFunc('client', {plural:'заказы'}).Children;
  const Transactions = clientTransactionsFunc('client').Children;
  const store = createStore();
  const query = new QueryClient({defaultOptions:{queries:{retry:false}}});
  function App(){
    const [modal, setModal] = useState(null);
    const update = useUpdateTransactionMutation();
    const events = useEventActions();
    useEffect(()=>{
      store.set(modalsFuncAtom, {client:{events:()=>setModal('works'), transactions:()=>setModal('transactions')}});
    },[]);
    return <main style={{padding:12}}><h1>Карточка клиента</h1><View setTopLeftComponent={()=>{}}/>
      <button type="button" onClick={()=>update.mutate({transactionId:'planned',payload:{paymentMethod:'cash'}})}>Учесть оплату</button>
      <button type="button" onClick={()=>events.set({_id:'other',otherContacts:[]})}>Убрать дополнительный контакт</button>
      {modal && <section style={{height:500}} aria-label="Детализация клиента">
        {modal==='works'?<Works/>:<Transactions/>}
      </section>}
    </main>;
  }
  createRoot(document.getElementById('root')).render(<Provider store={store}><QueryClientProvider client={query}><App/></QueryClientProvider></Provider>);
`

const mocks = {
  '@components/CardButtons': 'export default () => null',
  '@components/ClientReviewsList': 'export default () => null',
  '@components/ContactsIconsButtons': 'export default () => null',
  '@components/DocumentsEditor': 'export default () => null',
  '@state/atoms': "import {atom} from 'jotai'; export const modalsFuncAtom=atom({})",
  '@helpers/useWorkItemTerminology': "export default () => ({plural:'заказы',pluralCapitalized:'Заказы',pluralGenitive:'заказов',accusative:'заказ'})",
  '@helpers/useEventCreateMenu': 'export default () => ({items:[], draftModals:null, createDisabled:true})',
  '@helpers/tariffAccess': 'export const getUserTariffAccess = () => ({allowDocuments:true})',
  '@helpers/metrikaGoals': 'export const reachGoal = () => {}; export const reachGoalOnce = () => {}',
  '@layouts/cards/EventCard': `export default ({event,showClient,transactions}) =>
    <article data-other-client={showClient}>{event.eventType} · {transactions.filter(t=>t.eventId===event._id).length} оплат</article>`,
  '@layouts/cards/TransactionCard': `export default ({transaction, relatedByEvent}) =>
    <article>{transaction.comment}{relatedByEvent ? ' · По связанной работе' : ''}</article>`,
}

test('client card counts actual money, shows additional contacts and recovers related data after an error', { timeout: 120000 }, async () => {
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  process.env.PLAYWRIGHT_MODULE ||= path.resolve('node_modules/playwright')
  if (process.platform === 'win32') {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  }
  const harness = await startHarness(contents, mocks)
  try {
    for (const [width, dark] of [[390, false], [390, true], [1365, false], [1365, true]]) {
      const page = await harness.browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      const client = { _id: 'client', firstName: 'Тестовый клиент' }
      const upcoming = new Date(Date.now() + 86400000).toISOString()
      const events = [
        { _id: 'other', clientId: 'another', otherContacts: [{ clientId: 'client' }], status: 'active', eventDate: upcoming, eventType: 'Работа с допконтактом' },
        { _id: 'main', clientId: 'client', status: 'active', eventDate: upcoming, eventType: 'Работа основного клиента' },
      ]
      const planned = { _id: 'planned', clientId: 'client', type: 'income', paymentMethod: 'obligation', amount: 500, comment: 'Обещанная оплата' }
      const transactions = [
        { _id: 'income', clientId: 'client', type: 'income', paymentMethod: 'cash', amount: 300 },
        { _id: 'expense', clientId: 'client', type: 'expense', paymentMethod: 'cash', amount: 100 },
        { _id: 'linked', clientId: 'another', eventId: 'other', type: 'income', paymentMethod: 'cash', amount: 800, comment: 'Оплата связанной работы' },
        planned,
      ]
      let relationRequests = 0
      let waitingForUpdatedRelations
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url())
        let data = client
        if (url.pathname === '/api/clients') data = [client]
        if (url.pathname.endsWith('/relations')) {
          relationRequests += 1
          if (relationRequests === 1) return route.fulfill({ status: 503, json: { error: 'Сбой фикстуры' } })
          if (waitingForUpdatedRelations) await waitingForUpdatedRelations
          const relatedEvents = events.filter((event) => event.clientId === 'client' || event.otherContacts?.length)
          data = { events: relatedEvents, transactions: transactions.filter((item) => item.clientId === 'client' || relatedEvents.some((event) => event._id === item.eventId)) }
        }
        if (url.pathname.endsWith('/transactions/planned')) {
          planned.paymentMethod = route.request().postDataJSON().paymentMethod
          data = planned
        }
        if (url.pathname.endsWith('/events/other')) {
          events[0].otherContacts = route.request().postDataJSON().otherContacts
          data = events[0]
        }
        await route.fulfill({ json: { success: true, data } })
      })
      let releaseRelations
      try {
        await page.goto(harness.origin)
        await page.evaluate((value) => document.body.classList.toggle('theme-dark', value), dark)
        await page.getByText('Не удалось загрузить работы и транзакции').waitFor()
        assert.match(await page.locator('.client-view-kpi-income').innerText(), /—/)
        await page.getByRole('button', { name: 'Повторить' }).click()
        await page.getByText('Обязательства к получению или оплате · 500 ₽').waitFor()
        await page.getByText('Работа с допконтактом · 1 оплат').waitFor()
        assert.match(await page.locator('.client-view-kpi-income').innerText(), /300 ₽/)
        assert.match(await page.locator('.client-view-kpi-expense').innerText(), /100 ₽/)
        await page.getByRole('button', { name: 'Посмотреть все' }).click()
        const detail = page.getByRole('region', { name: 'Детализация клиента' })
        await detail.getByText('Работа с допконтактом · 1 оплат').waitFor()
        await detail.getByText('Работа основного клиента · 0 оплат').waitFor()
        await page.getByRole('button', { name: 'Показать', exact: true }).click()
        await detail.getByText('Оплата связанной работы · По связанной работе').waitFor()
        await page.getByRole('button', { name: 'Учесть оплату' }).click()
        await page.locator('.client-view-kpi-income').getByText('800 ₽').waitFor()
        assert.equal(await page.getByText('Обязательства к получению или оплате', { exact: false }).count(), 0)
        waitingForUpdatedRelations = new Promise((resolve) => { releaseRelations = resolve })
        await page.getByRole('button', { name: 'Убрать дополнительный контакт' }).click()
        await page.getByText('Работа с допконтактом · 1 оплат').waitFor({ state: 'hidden' })
        await detail.getByText('Оплата связанной работы · По связанной работе').waitFor({ state: 'hidden' })
        releaseRelations()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
        assert.deepEqual(errors, [])
      } finally {
        releaseRelations?.()
        await page.close()
      }
    }
  } finally {
    await harness.close()
  }
})
