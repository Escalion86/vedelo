import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const runRestartSmoke = async ({ baseUrl, phone, password }) => {
  const { chromium } = await import(
    pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
  )
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'artistcrm-browser-restart-')
  )
  let context
  const launch = () =>
    chromium.launchPersistentContext(directory, {
      channel: 'msedge',
      headless: true,
      baseURL: baseUrl,
      viewport: { width: 390, height: 844 },
    })
  const login = async (page) => {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' })
    if (new URL(page.url()).pathname === '/login') {
      await page.locator('input[type="tel"]').fill(phone)
      await page.locator('input[type="password"]').fill(password)
      await page.getByRole('button', { name: 'Войти', exact: true }).click()
    }
    await page.waitForURL('**/cabinet/**')
    await page.getByText('Важное', { exact: true }).first().waitFor()
  }
  const marker = `Offline persistent restart ${randomUUID()}`
  try {
    context = await launch()
    let page = await context.newPage()
    await login(page)
    await context.setOffline(true)
    const before = await page.evaluate(async (firstName) => {
      const response = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firstName }),
      })
      return {
        status: response.status,
        queue: localStorage.getItem('artistcrm:server-sync-queue'),
      }
    }, marker)
    assert.equal(before.status, 202)
    assert.equal(JSON.parse(before.queue).length, 1)
    // Закрываем весь процесс с постоянным профилем, без storageState-инъекции.
    await context.close()
    context = undefined
    context = await launch()
    page = await context.newPage()
    // Страница без кабинета позволяет проверить хранилище до запуска replay.
    await page.goto(`${baseUrl}/privacy`, { waitUntil: 'domcontentloaded' })
    const restored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('artistcrm:server-sync-queue'))
    )
    const original = JSON.parse(before.queue)
    // Фоновый запрос посещения кабинета также может попасть в очередь.
    const clientWrites = restored.filter(item => item.url === '/api/clients')
    assert.equal(clientWrites.length, 1)
    for (const field of [
      'id',
      'url',
      'method',
      'body',
      'headers',
      'createdAt',
    ]) {
      assert.deepEqual(clientWrites[0][field], original[0][field])
    }
    const secondPage = await context.newPage()
    await Promise.all([login(page), login(secondPage)])
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem('artistcrm:server-sync-queue') || '[]')
          .length === 0
    )
    const response = await context.request.get('/api/clients')
    assert.equal(response.status(), 200)
    const clients = (await response.json()).data
    assert.equal(clients.filter((item) => item.firstName === marker).length, 1)
    console.log(
      'Browser restart: очередь пережила закрытие процесса; после входа создан один клиент'
    )
  } finally {
    if (context) await context.close()
    const resolved = path.resolve(directory)
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep))
    assert.ok(path.basename(resolved).startsWith('artistcrm-browser-restart-'))
    await rm(resolved, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    })
  }
}
