const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { startHarness } = require('./periodPickerHarness.cjs')

const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import EventsContent from './layouts/content/EventsContent';
createRoot(document.getElementById('root')).render(<EventsContent
  filter={new URLSearchParams(location.search).get('filter') || 'upcoming'}
  onHeaderCountChange={count => document.title = 'Мероприятий: ' + count}
/>);
`
const mocks = {
  '@state/atoms': 'import {atom} from "jotai"; export const modalsFuncAtom=atom({}); export const modalsAtom=atom([]);',
  '@state/selectors/windowDimensionsTailwindSelector': 'import {atom} from "jotai"; export default atom("phoneV");',
  'next/navigation': 'const params=new URLSearchParams(location.search); const router={replace(){}}; export const useSearchParams=()=>params; export const useRouter=()=>router; export const usePathname=()=>location.pathname;',
  '@helpers/useEventsQuery': `
    const past=new URLSearchParams(location.search).get('filter')==='past';
    const data=['active','draft','canceled'].flatMap(status=>[false,true].map(isTransferred=>({
      _id:status+'-'+isTransferred,status,isTransferred,
      eventType:status+'-'+isTransferred,eventDate:past?'2026-10-20T12:00:00':'2026-10-28T12:00:00'
    })));
    export const useEventsQuery=()=>({data:{data}});
    export const useLoadMorePastEventsMutation=()=>({});`,
  '@helpers/useTransactionsQuery': 'export const useTransactionsQuery=()=>({data:[]});',
  '@helpers/useEventCreateMenu': 'export default ()=>({items:[],draftModals:null});',
  '@helpers/useUiDensity': 'export default ()=>({isCompact:false});',
  '@helpers/useWorkItemTerminology': 'export default ()=>({pluralCapitalized:"Мероприятия"});',
  '@components/CreateEventFab': 'export default ()=>null;',
  '@components/ComboBox': 'export default ()=>null;',
  '@layouts/cards/EventCard': 'export default ({event})=><article data-testid={event._id}>{event.eventType}</article>;',
}

test('Переданы: выключение исключает переданные, включение добавляет их к обычным', { timeout: 180000 }, async () => {
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  process.env.PLAYWRIGHT_MODULE ||= path.resolve('node_modules/playwright')
  if (process.platform === 'win32') process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  const harness = await startHarness(entry, mocks)
  try {
    for (const filter of ['upcoming', 'past']) for (const width of [390, 1365]) for (const dark of [false, true]) {
      const page = await harness.browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
      try {
        await page.clock.install({ time: new Date('2026-10-26T12:00:00') })
        await page.goto(`${harness.origin}/?filter=${filter}`)
        await page.evaluate(dark => document.body.classList.toggle('theme-dark', dark), dark)
        const openFilters = () => page.getByRole('button', { name: /^Фильтры / }).click()
        const transferred = page.getByRole('button', { name: 'Переданы', exact: true })
        await page.getByTestId('active-true').waitFor()
        await openFilters()
        assert.match(await transferred.getAttribute('class'), /bg-amber-500/)
        await transferred.click()
        await page.getByTestId('active-true').waitFor({ state: 'detached' })
        await page.getByTestId('active-false').waitFor()
        await page.getByTestId('draft-false').waitFor()
        assert.equal(await page.getByTestId('draft-true').count(), 0)
        assert.equal(await page.title(), 'Мероприятий: 2')
        if (process.env.QA_SCREENSHOT_DIR && filter === 'upcoming' && width === 390 && !dark) {
          await require('node:fs/promises').mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
          await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, 'transferred-filter-off.png'), animations: 'disabled' })
        }
        await page.reload()
        await page.getByTestId('active-false').waitFor()
        assert.equal(await page.getByTestId('active-true').count(), 0)
        await openFilters()
        assert.doesNotMatch(await transferred.getAttribute('class'), /bg-amber-500/)
        await transferred.click()
        await page.getByTestId('active-true').waitFor()
        await page.getByTestId('active-false').waitFor()
        await page.getByTestId('draft-true').waitFor()
        assert.equal(await page.getByTestId('canceled-true').count(), 0)
        assert.equal(await page.title(), 'Мероприятий: 4')
        await transferred.click()
        await page.getByRole('button', { name: 'Сбросить', exact: true }).click()
        await page.getByTestId('active-true').waitFor()
        if (!(await transferred.isVisible())) await openFilters()
        assert.match(await transferred.getAttribute('class'), /bg-amber-500/)
        await transferred.click()
        await openFilters()
        await page.getByRole('button', { name: 'Показать календарь', exact: true }).click()
        await page.getByRole('button', { name: 'active-false', exact: true }).waitFor()
        assert.equal(await page.getByRole('button', { name: 'active-true', exact: true }).count(), 0)
        await openFilters()
        await transferred.click()
        await openFilters()
        await page.getByRole('button', { name: 'active-true', exact: true }).waitFor()
        assert.deepEqual(errors, [])
      } finally { await page.close() }
    }
  } finally { await harness.close() }
})
