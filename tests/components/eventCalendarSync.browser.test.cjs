const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('./periodPickerHarness.cjs')

const entry = `
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import AppQueryProvider from './components/AppQueryProvider';
import EventCard from './layouts/cards/EventCard';
document.title = 'Синхронизация заказов';
function App() {
  const [events, setEvents] = useState(['a', 'b', 'below'].map(id => ({
    _id: id, status: 'active', eventType: 'Заказ ' + id, syncVersion: 1,
    calendarImportChecked: true, calendarSyncStatus: 'pending',
    calendarSyncUpdatedAt: '2026-11-17T11:00:00Z',
  })));
  window.editFirst = () => setEvents(items => [
    {...items[0], eventType: 'Заказ изменён', syncVersion: 2, calendarSyncUpdatedAt: '2026-11-17T11:00:02Z'},
    ...items.slice(1),
  ]);
  return <main className="cabinet-canvas" style={{margin:'auto',maxWidth:700}}>
    {events.map(event => <section key={event._id} data-event-id={event._id} style={{marginTop:event._id==='below'?1400:0}}>
      <EventCard eventId={event._id} event={event} transactions={[]}/>
    </section>)}
  </main>;
}
createRoot(document.getElementById('root')).render(<AppQueryProvider><App/></AppQueryProvider>);
`

const empty = 'export default ()=>null'
const mocks = {
  jotai: 'export const useAtomValue=value=>value',
  '@state/atoms': 'export const modalsFuncAtom={event:{view(){window.cardOpened=true}}}',
  '@state/atoms/siteSettingsAtom': 'export default {}',
  '@state/atoms/servicesAtom': 'export default []',
  '@state/atoms/loadingAtom': 'export default ()=>false',
  '@state/atoms/errorAtom': 'export default ()=>false',
  '@state/atoms/loggedUserAtom': 'export default null',
  '@state/atoms/tariffsAtom': 'export default []',
  '@state/selectors/windowDimensionsTailwindSelector': 'export default "phoneV"',
  '@helpers/useEventsQuery': 'export const useEventQuery=()=>({})',
  '@helpers/useClientsQuery': 'export const useClientsQuery=()=>({data:[]})',
  '@helpers/useTransactionsQuery': 'export const useTransactionsQuery=()=>({data:[]})',
  '@helpers/switchImpersonation': 'export default async()=>{}',
  '@helpers/useSnackbar': 'export default ()=>({error(message){window.snackbar=message}})',
  '@components/ContactsIconsButtons': empty,
  '@components/EventProposalStatus': empty,
  '@components/EventClientReviewStatus': empty,
  'next/image': empty,
}

const pendingLabel = 'Синхронизация с Google Календарём…'
const status = (_id, syncVersion, calendarSyncStatus, time, calendarSyncError = '') => ({
  _id, syncVersion, calendarSyncStatus, calendarSyncError,
  calendarSyncUpdatedAt: `2026-11-17T11:00:${time}Z`,
})

test('Calendar status on real cards batches visible orders, preserves a newer edit and retries one order', { timeout: 120000 }, async () => {
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  process.env.PLAYWRIGHT_MODULE ||= path.resolve('node_modules/playwright')
  if (process.platform === 'win32') {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  }
  const harness = await startHarness(entry, mocks)
  try {
    for (const [width, dark, reducedMotion] of [[390, false, 'no-preference'], [1365, true, 'reduce']]) {
      const errorCode = dark ? 'calendar_sync_connection_required' : 'calendar_sync_failed'
      const failedLabel = dark
        ? 'Переподключите Google Календарь в разделе «Интеграции»'
        : 'Синхронизация с календарем не выполнена'
      const page = await harness.browser.newPage({ viewport: { width, height: 900 }, reducedMotion })
      page.setDefaultTimeout(8000)
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text())
      })
      const reads = []
      const retries = []
      let releaseFirstRead
      const firstRead = new Promise((resolve) => { releaseFirstRead = resolve })
      const card = (id) => page.locator(`[data-event-id="${id}"]`)
      try {
        await page.route('**/api/events/calendar-sync?*', async (route) => {
          reads.push(new URL(route.request().url()).searchParams.get('ids').split(',').sort())
          if (reads.length === 1) {
            await firstRead
            await route.fulfill({ json: { success: true, data: [
              status('a', 1, '', '01'),
              status('b', 1, 'failed', '01', errorCode),
            ] } })
            return
          }
          await route.fulfill({ json: { success: true, data: [
            status('a', 2, retries.length ? '' : 'pending', '04'),
            status('b', 1, '', '04'),
          ] } })
        })
        await page.route('**/api/events/*/calendar-sync', async (route) => {
          retries.push([route.request().method(), new URL(route.request().url()).pathname])
          await route.fulfill({ json: { success: true, data: status('b', 1, 'pending', '03') } })
        })
        await page.goto(harness.origin)
        await page.evaluate((dark) => document.body.classList.toggle('theme-dark', dark), dark)
        assert.equal(await page.title(), 'Синхронизация заказов')
        const pending = card('a').getByLabel(pendingLabel, { exact: true })
        await pending.waitFor()
        await card('b').getByLabel(pendingLabel).waitFor()
        assert.equal(await pending.getAttribute('title'), pendingLabel)
        assert.equal(await page.getByText(pendingLabel).count(), 0)
        const arrow = await pending.locator('.motion-safe\\:animate-spin').evaluate((node) => ({
          animation: getComputedStyle(node).animationName,
          width: getComputedStyle(node.querySelector('svg')).width,
        }))
        assert.equal(arrow.animation, reducedMotion === 'reduce' ? 'none' : 'spin')
        assert.equal(arrow.width, '8px')
        if (process.env.QA_SCREENSHOT_DIR) {
          await mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
          await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, `calendar-sync-${width}.png`) })
        }
        await page.evaluate(() => window.editFirst())
        await card('a').getByText('Заказ изменён').waitFor()
        releaseFirstRead()
        await card('b').getByLabel(failedLabel).waitFor()
        assert.deepEqual(reads[0], ['a', 'b'])
        assert.equal(await pending.isVisible(), true)
        await card('b').getByRole('button', { name: 'Открыть меню действий', exact: true }).click()
        await page.getByRole('menuitem', { name: 'Повторить синхронизацию' }).press('Enter')
        await card('b').getByLabel(pendingLabel).waitFor()
        await pending.waitFor({ state: 'detached' })
        await card('b').getByLabel(pendingLabel).waitFor({ state: 'detached' })
        assert.deepEqual(retries, [['POST', '/api/events/b/calendar-sync']])
        assert.equal(await page.evaluate(() => window.cardOpened), undefined)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        assert.deepEqual(errors, [])
      } finally {
        releaseFirstRead()
        await page.close()
      }
    }
  } finally {
    await harness.close()
  }
})
