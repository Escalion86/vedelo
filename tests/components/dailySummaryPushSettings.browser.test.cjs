const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('./periodPickerHarness.cjs')

const entry = `
  import { createRoot } from 'react-dom/client';
  import { createStore, Provider } from 'jotai';
  import PushNotificationsSettings from './components/PushNotificationsSettings';
  import siteSettingsAtom from './state/atoms/siteSettingsAtom';
  document.title = 'Настройки уведомлений';
  const store = createStore();
  store.set(siteSettingsAtom, window.initialSiteSettings);
  createRoot(document.getElementById('root')).render(
    <Provider store={store}><PushNotificationsSettings /></Provider>
  );
`

const mocks = {
  '@helpers/pushClient': `
    export const isPushSupported = () => false;
    export const getPushRegistration = async () => null;
    export const getPushRegistrationWithDetails = async () => null;
    export const syncPushSubscription = async () => {};
  `,
  '@helpers/useSnackbar': `
    const append = (tone) => (message) => window.toasts.push({ tone, message });
    const snackbar = { success: append('success'), error: append('error') };
    export default () => snackbar;
  `,
}

test('daily summary uses a partial account patch, retains time and confirms only a successful save', { timeout: 120000 }, async () => {
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  process.env.PLAYWRIGHT_MODULE ||= path.resolve('node_modules/playwright')
  if (process.platform === 'win32') {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  }

  const harness = await startHarness(entry, mocks)
  try {
    for (const [width, dark] of [[390, false], [390, true], [1365, false], [1365, true]]) {
      const page = await harness.browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        const initial = { custom: { publicLeadPushEnabled: !dark, additionalEventsPushTime: '12:15' } }
        let saved = { ...initial.custom, otherPreference: 'saved elsewhere' }
        const updates = []
        let rejectNext = false
        await page.addInitScript(({ initial, dark }) => {
          window.initialSiteSettings = initial
          window.toasts = []
          document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.toggle('theme-dark', dark)
          })
        }, { initial, dark })
        await page.route('**/api/push/**', (route) => route.fulfill({
          json: { success: true, data: route.request().url().includes('/logs') ? [] : {} },
        }))
        await page.route('**/api/site', async (route) => {
          assert.equal(route.request().method(), 'POST')
          const patch = route.request().postDataJSON().custom
          updates.push(patch)
          if (rejectNext) {
            rejectNext = false
            await route.fulfill({ status: 409, json: { success: false } })
            return
          }
          saved = { ...saved, ...patch }
          await route.fulfill({ json: { success: true, data: { custom: saved } } })
        })

        await page.goto(harness.origin)
        const summary = page.getByRole('region', { name: 'Ежедневная сводка' })
        const time = summary.getByRole('combobox', { name: 'Время ежедневной сводки' })
        const disable = summary.getByRole('button', { name: 'Отключить сводку' })
        const enable = summary.getByRole('button', { name: 'Включить сводку' })
        await summary.getByText('Включена', { exact: true }).waitFor()
        assert.equal(await page.title(), 'Настройки уведомлений')
        assert.equal(await time.inputValue(), '12:15')
        const layout = await summary.evaluate((node) => ({
          theme: document.body.classList.contains('theme-dark'),
          horizontalOverflow: node.scrollWidth > node.clientWidth,
          buttonHeight: node.querySelector('button.ui-btn').offsetHeight,
        }))
        assert.deepEqual([layout.theme, layout.horizontalOverflow], [dark, false])
        assert.ok(layout.buttonHeight >= 40)
        assert.equal(await summary.getByText('Для доставки сводки включите уведомления аккаунта.').isVisible(), dark)

        await disable.focus()
        await disable.press('Enter')
        await enable.waitFor()
        assert.equal(await time.inputValue(), '12:15')
        assert.deepEqual(updates, [{ additionalEventsPushEnabled: false }])

        await time.selectOption('08:30')
        await page.waitForFunction(() => window.toasts.some(
          ({ tone, message }) => tone === 'success' && message === 'Время напоминаний: 08:30'
        ))
        assert.equal(await time.inputValue(), '08:30')

        rejectNext = true
        await enable.click()
        await page.waitForFunction(() => window.toasts.some(({ tone }) => tone === 'error'))
        assert.equal(await enable.isEnabled(), true)
        assert.equal(await time.inputValue(), '08:30')
        assert.equal(await page.evaluate(() => window.toasts.some(
          ({ message }) => message === 'Ежедневная сводка включена'
        )), false)

        await enable.click()
        await disable.waitFor()
        assert.equal(await time.inputValue(), '08:30')
        assert.deepEqual(updates, [
          { additionalEventsPushEnabled: false },
          { additionalEventsPushTime: '08:30' },
          { additionalEventsPushEnabled: true },
          { additionalEventsPushEnabled: true },
        ])
        assert.deepEqual(saved, {
          publicLeadPushEnabled: !dark,
          otherPreference: 'saved elsewhere',
          additionalEventsPushEnabled: true,
          additionalEventsPushTime: '08:30',
        })
        assert.deepEqual(errors, [])
      } finally {
        await page.close()
      }
    }
  } finally {
    await harness.close()
  }
})
