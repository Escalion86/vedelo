const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')
const { startHarness } = require('./periodPickerHarness.cjs')

const entry = `
  import { createRoot } from 'react-dom/client';
  import { createStore, Provider } from 'jotai';
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  import IntegrationsContent from './layouts/content/IntegrationsContent';
  import loggedUserAtom from '@state/atoms/loggedUserAtom';
  import siteSettingsAtom from '@state/atoms/siteSettingsAtom';
  const store = createStore();
  store.set(loggedUserAtom, window.qaUser);
  store.set(siteSettingsAtom, { custom: { aiAnalysisProvider: 'artistcrm', aiTranscriptionProvider: 'artistcrm' } });
  createRoot(document.getElementById('root')).render(
    <Provider store={store}><QueryClientProvider client={new QueryClient()}>
      <IntegrationsContent />
    </QueryClientProvider></Provider>
  );
`

const mocks = {
  '@state/atoms': "import { atom } from 'jotai'; export const modalsFuncAtom = atom({});",
  '@helpers/tariffAccess': 'export const getUserTariffAccess = () => ({ allowAi: true });',
  '@helpers/useSnackbar': `
    const snackbar = { success: (message) => window.qaNotices.push(message), error: () => {} };
    export default () => snackbar;
  `,
}

const cloudProvider = { aiAnalysisProvider: 'artistcrm', aiTranscriptionProvider: 'artistcrm' }
const openProvider = async (page, origin) => {
  await page.goto(origin)
  await page.getByRole('button', { name: /^ИИ-провайдер/ }).click()
  return page.getByRole('combobox', { name: 'Провайдер ИИ', exact: true })
}

test('Fu02 выбирается только dev-владельцем и сохраняет отдельный провайдер распознавания', { timeout: 120000 }, async () => {
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  process.env.PLAYWRIGHT_MODULE ||= path.resolve('node_modules/playwright')
  if (process.platform === 'win32') {
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||= 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  }
  const harness = await startHarness(entry, mocks)
  try {
    for (const [width, dark] of [[390, true], [1365, false]]) {
      const page = await harness.browser.newPage({ viewport: { width, height: 850 } })
      const errors = []
      const updates = []
      let serverSettings = { ...cloudProvider }
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.addInitScript((darkMode) => {
          window.qaUser = { _id: 'owner', tenantId: 'owner', role: 'dev' }
          window.qaNotices = []
          document.addEventListener('DOMContentLoaded', () => {
            document.body.classList.toggle('theme-dark', darkMode)
          })
        }, dark)
        await page.route('**/api/ai/usage', (route) => route.fulfill({
          json: { data: { platformConfigured: true, available: true } },
        }))
        await page.route('**/api/ai/settings', async (route) => {
          if (route.request().method() === 'PATCH') {
            const patch = route.request().postDataJSON()
            updates.push(patch)
            serverSettings = { ...serverSettings, ...patch }
          }
          await route.fulfill({ json: { data: serverSettings } })
        })

        const provider = await openProvider(page, harness.origin)
        await provider.selectOption({ label: 'ИИ Ведело Fu02 (разработчик)' })
        const save = page.getByRole('button', { name: 'Сохранить настройки', exact: true })
        await save.waitFor()
        assert.equal(await page.getByText('Распознавать аудио локально', { exact: true }).count(), 0)
        assert.equal(await page.getByRole('textbox', { name: 'Локальная модель' }).count(), 0)
        assert.equal(await page.getByRole('button', { name: 'Проверить подключение', exact: true }).count(), 0)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)

        const endpoint = 'http://127.0.0.1:18011/v1/audio/transcriptions'
        await page.getByRole('textbox', { name: 'URL распознавания аудио' }).fill(endpoint)
        const timeout = page.getByRole('textbox', { name: 'Таймаут, мс' })
        await timeout.fill('999')
        await save.click()
        await page.getByText('Укажите целое число от 1000 до 120000 мс').waitFor()
        assert.deepEqual(updates, [])
        await timeout.fill('30000')
        await save.click()
        await page.waitForFunction(() => window.qaNotices.includes('Настройки ИИ Ведело Fu02 сохранены'))
        assert.deepEqual(updates[0], {
          aiTranscriptionProvider: 'fu02',
          localAiEnabled: true,
          localAiTranscriptionUrl: endpoint,
          localAiTimeoutMs: 30000,
        })
        const restoredProvider = await openProvider(page, harness.origin)
        await page.getByText(/^Голосовой ввод распознаёт Fu02/).waitFor()
        assert.equal(await restoredProvider.inputValue(), 'fu02')
        await restoredProvider.selectOption({ label: 'ИИ Ведело' })
        await page.waitForFunction(() => window.qaNotices.includes('Выбран провайдер ИИ Ведело'))
        assert.equal(updates[1].aiAnalysisProvider, 'artistcrm')
        assert.equal(updates[1].aiTranscriptionProvider, 'artistcrm')
        await restoredProvider.selectOption({ label: 'Локальный (тест)' })
        await page.getByRole('checkbox', { name: 'Распознавать аудио локально' }).waitFor()
        serverSettings = { ...serverSettings, aiTranscriptionProvider: 'local' }
        const legacyProvider = await openProvider(page, harness.origin)
        const localTranscription = page.getByRole('checkbox', { name: 'Распознавать аудио локально' })
        await localTranscription.waitFor()
        assert.equal(await legacyProvider.inputValue(), 'local')
        assert.equal(await localTranscription.isChecked(), true)
        await page.getByRole('button', { name: 'Сохранить настройки', exact: true }).click()
        await page.waitForFunction(() => window.qaNotices.includes('Настройки локального ИИ сохранены'))
        assert.equal(updates[2].aiAnalysisProvider, undefined)
        assert.equal(updates[2].aiTranscriptionProvider, 'local')
        assert.deepEqual(errors, [])
      } finally {
        await page.close()
      }
    }

    for (const role of ['user', 'dev']) {
      const page = await harness.browser.newPage()
      let requests = 0
      try {
        await page.addInitScript((accountRole) => {
          window.qaUser = { _id: 'member', tenantId: 'owner', role: accountRole }
        }, role)
        await page.route('**/api/ai/usage', (route) => route.fulfill({ json: { data: {} } }))
        await page.route('**/api/ai/settings', (route) => {
          requests++
          return route.fulfill({ json: { data: { ...cloudProvider, aiTranscriptionProvider: 'fu02' } } })
        })
        const provider = await openProvider(page, harness.origin)
        assert.equal(await provider.inputValue(), 'artistcrm')
        assert.equal(await provider.locator('option[value="fu02"]').count(), 0)
        assert.equal(requests, 0)
      } finally {
        await page.close()
      }
    }
  } finally {
    await harness.close()
  }
})
