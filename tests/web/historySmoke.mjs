import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import os from 'node:os'
import path from 'node:path'

export const runHistorySmoke = async ({ t, db, tenantA, baseUrl, phone, password }) => {
  const modulePath = process.env.HISTORY_PLAYWRIGHT_MODULE
  await t.test('History UI: creation, legacy semantic action, terminology and update diff', {
    skip: modulePath ? false : 'HISTORY_PLAYWRIGHT_MODULE not set',
  }, async () => {
    const settings = db.collection('sitesettings')
    const previous = await settings.findOne({ tenantId: tenantA })
    const histories = db.collection('histories')
    const rows = await histories.insertMany(['create', 'update'].map((operation) => ({
      tenantId: tenantA, entityType: 'event', entityId: String(tenantA), operation,
      semanticAction: operation === 'create' ? 'task_updated' : '',
      entityLabel: 'Мероприятие: Проверка истории', summary: 'Изменено мероприятие',
      occurredAt: new Date(), actorLabel: 'Тест', source: 'web',
      changes: [{ field: 'description', label: 'Комментарий', oldValue: operation === 'create' ? null : 'Прежний текст', newValue: 'Новый текст' }],
    })))
    const { chromium } = await import(pathToFileURL(modulePath).href)
    const browser = await chromium.launch({ channel: 'msedge', headless: true })
    try {
      for (const mode of ['events', 'orders']) {
        await settings.updateOne({ tenantId: tenantA }, { $set: {
          'custom.firstRunWizardCompleted': true, 'custom.primaryEntityTerminology': mode,
        } }, { upsert: true })
        for (const width of [1365, 390]) {
          const context = await browser.newContext({ viewport: { width, height: 900 } })
          try {
            const page = await context.newPage()
            const errors = []
            page.on('pageerror', error => errors.push(error.message))
            page.on('console', message => {
              if (message.type() === 'error') errors.push(message.text())
            })
            await page.goto(`${baseUrl}/login`)
            await page.locator('input[type="tel"]').fill(phone)
            await page.locator('input[type="password"]').fill(password)
            await page.getByRole('button', { name: 'Войти', exact: true }).click()
            await page.waitForURL('**/cabinet/**')
            for (const theme of ['light', 'dark']) {
              await page.evaluate(value => localStorage.setItem('theme', value), theme)
              await page.goto(`${baseUrl}/cabinet/history`)
              assert.match(await page.title(), /Кабинет Ведело/)
              const title = mode === 'orders' ? 'Создан заказ' : 'Создано мероприятие'
              const creation = page.locator('.history-row').filter({ hasText: title })
              await creation.getByRole('button').first().click()
              assert.match(await creation.innerText(), /Новый текст/)
              assert.doesNotMatch(await creation.innerText(), /Не указано|Прежний текст|→|Изменена задача/)
              const update = page.locator('.history-row').filter({ hasText: 'Изменено мероприятие' })
              await update.getByRole('button').first().click()
              assert.match(await update.innerText(), /Прежний текст/)
              assert.match(await update.innerText(), /Новый текст/)
              assert.equal(await page.locator('body').evaluate(body => body.scrollWidth <= innerWidth), true)
              assert.doesNotMatch(await page.locator('body').innerText(), /Application error|Unhandled Runtime Error/)
              await page.screenshot({ path: path.join(os.tmpdir(), `vedelo-history-${mode}-${width}-${theme}.png`) })
              await creation.getByRole('button').first().click()
              assert.doesNotMatch(await creation.innerText(), /Новый текст/)
            }
            assert.deepEqual(errors, [])
            console.log(`History UI: ${mode}, ${width}px, light/dark passed`)
          } finally { await context.close() }
        }
      }
    } finally {
      await browser.close()
      await histories.deleteMany({ _id: { $in: Object.values(rows.insertedIds) } })
      if (previous) await settings.replaceOne({ tenantId: tenantA }, previous)
      else await settings.deleteOne({ tenantId: tenantA })
    }
  })
}
