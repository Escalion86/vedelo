const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { startHarness } = require('./periodPickerHarness.cjs')

const entry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Provider, createStore} from 'jotai';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import StatisticsContent from './layouts/content/StatisticsContent';
import {useEventActions} from './helpers/useEventsQuery';
import {modalsFuncAtom} from '@state/atoms';
import loggedUserAtom from './state/atoms/loggedUserAtom';
const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
const store=createStore();
store.set(loggedUserAtom,{_id:'qa',trialEndsAt:'2099-01-01'});
function App(){
  const [modal,setModal]=useState(null);
  const actions=useEventActions();
  window.actions=actions;
  store.set(modalsFuncAtom,{custom:props=>setModal(props)});
  const Children=modal?.Children;
  return <><StatisticsContent/>{Children&&<section role="dialog" aria-label={modal.title}>
    <button onClick={()=>setModal(null)}>Закрыть окно</button><Children/>
  </section>}</>;
}
createRoot(document.getElementById('root')).render(<Provider store={store}><QueryClientProvider client={client}><App/></QueryClientProvider></Provider>);
`
const mocks = {
  '@state/atoms': 'import {atom} from "jotai";export const modalsFuncAtom=atom({});',
  'next/navigation': 'export const useRouter=()=>({push(){}})',
  '@components/ContentHeader': 'export default ({children})=><header>{children}</header>',
  '@nivo/bar': `export const Bar=({data,onClick})=><div>{data.map(d=><button key={d.monthKey} onClick={()=>onClick({data:d})}>Месяц {d.monthKey}</button>)}</div>`,
  '@layouts/cards/EventCard': `export default ({event})=><article data-testid={event._id}>
    <span>{event.status}</span><button onClick={()=>window.actions.updateStatus(event._id,'closed')}>Закрыть мероприятие</button>
    <button onClick={()=>window.actions.updateStatus(event._id,'canceled')}>Отменить мероприятие</button>
  </article>`,
  '@layouts/cards/TransactionCard': 'export default ({transaction})=><div>{transaction.amount}</div>',
}

test('statistics: open month and metric lists refresh after event mutations', { timeout: 180000 }, async () => {
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  process.env.PLAYWRIGHT_MODULE ||= path.resolve('node_modules/playwright')
  if (process.platform === 'win32') process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  const harness = await startHarness(entry, mocks)
  try {
    for (const width of [390, 1365]) for (const dark of [false, true]) {
      const page = await harness.browser.newPage({ viewport: { width, height: 1000 } })
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
      let events = [{ _id: 'event', status: 'active', eventDate: '2026-11-10T12:00:00', contractSum: 40000 }]
      let reads = 0
      await page.route('**/api/statistics', route => {
        reads++
        return route.fulfill({json:{data:{events, transactions: [{_id:'tx',eventId:'event',type:'income',amount:10000,date:'2026-11-01'}],clients:[],services:[]}}})
      })
      await page.route('**/api/events/event', route => {
        if (route.request().method() === 'DELETE') events = []
        else events = events.map(e => ({...e,...route.request().postDataJSON()}))
        return route.fulfill({json:{data:events[0]}})
      })
      try {
        await page.clock.install({time:new Date('2026-10-25T12:00:00')})
        await page.goto(harness.origin)
        await page.evaluate(dark => document.body.classList.toggle('theme-dark', dark), dark)
        // No SSR data: the hook must fetch immediately, even with a long staleTime.
        await page.getByRole('button',{name:'Месяц 2026-11',exact:true}).click()
        const dialog = page.getByRole('dialog')
        await dialog.getByTestId('event').getByText('active',{exact:true}).waitFor()
        await dialog.getByRole('button',{name:'Закрыть мероприятие',exact:true}).click()
        await dialog.getByTestId('event').getByText('closed',{exact:true}).waitFor()
        await dialog.getByRole('button',{name:'Отменить мероприятие',exact:true}).click()
        await dialog.getByText('Нет мероприятий за этот месяц',{exact:true}).waitFor()
        assert.equal(await dialog.getByTestId('event').count(),0)
        assert.match(await dialog.getByText('Выручка',{exact:true}).locator('..').innerText(), /0 ₽/)
        assert.ok(reads >= 3)
        await dialog.getByRole('button',{name:'Закрыть окно'}).click()
        await page.evaluate(()=>window.actions.updateStatus('event','active'))
        await page.getByRole('button',{name:'Остаток по оплате: открыть мероприятия'}).click()
        await dialog.getByTestId('event').getByText('active',{exact:true}).waitFor()
        await page.evaluate(()=>window.actions.set({_id:'event',contractSum:10000}))
        await dialog.getByTestId('event').waitFor({state:'detached'})
        await dialog.getByRole('button',{name:'Закрыть окно'}).click()
        await page.getByRole('button',{name:'Получено по предстоящим работам: открыть мероприятия'}).click()
        await dialog.getByTestId('event').waitFor()
        await page.evaluate(()=>window.actions.delete('event'))
        await dialog.getByTestId('event').waitFor({state:'detached'})
        assert.deepEqual(errors,[])
      } finally { await page.close() }
    }
  } finally { await harness.close() }
})
