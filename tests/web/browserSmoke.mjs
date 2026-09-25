import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { runOfflineSmoke } from './offlineSmoke.mjs'
import { runAttachmentSmoke } from './attachmentSmoke.mjs'

// Не требует Playwright в production dependencies. Передаётся путь к уже
// установленному модулю; отсутствие модуля явно отмечается runner как skip.
export const runBrowserSmoke = async ({ baseUrl, phone, password }) => {
  const { chromium } = await import(
    pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
  )
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  try {
    for (const viewport of [
      { width: 1365, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport, baseURL: baseUrl })
      try {
        const page = await context.newPage()
        const errors = []
        const consoleMessages = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => {
          if (['error', 'warning'].includes(message.type())) {
            consoleMessages.push(message.text())
          }
        })
        await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
        assert.match(await page.title(), /Вход в Ведело/)
        await page.locator('input[type="tel"]').fill(phone)
        await page.locator('input[type="password"]').fill(password)
        await page.getByRole('button', { name: 'Войти', exact: true }).click()
        await page.waitForURL('**/cabinet/**', { timeout: 20000 })
        await page.waitForLoadState('domcontentloaded')
        await page
          .getByText('Важное', { exact: true })
          .first()
          .waitFor({ state: 'visible' })
        assert.match(await page.title(), /Кабинет Ведело/)
        await runAttachmentSmoke({ page, context, viewport })
        await runOfflineSmoke({ page, context, viewport })
        const content = await page.locator('body').innerText()
        assert.ok(content.length > 100, 'Кабинет должен содержать интерфейс')
        assert.doesNotMatch(
          content,
          /Application error|Unhandled Runtime Error/
        )
        assert.deepEqual(
          errors,
          [],
          `Ошибки браузера при ширине ${viewport.width}`
        )
        console.log(
          `Browser smoke ${viewport.width}×${viewport.height}: вход и гидратация кабинета прошли; ${content.slice(0, 160).replaceAll('\n', ' ')}`
        )
        console.log(
          `Browser console ${viewport.width}: ${JSON.stringify([...new Set(consoleMessages)].slice(0, 10))}`
        )
      } finally {
        await context.close()
      }
    }
  } finally {
    await browser.close()
  }
}
