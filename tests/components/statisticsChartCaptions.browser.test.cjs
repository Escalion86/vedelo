const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const {
  startHarness,
  capture,
  artifactDir,
} = require('./periodPickerHarness.cjs')
let harness
const data = {
  events: [
    {
      _id: 'qa-past',
      status: 'active',
      eventDate: '2026-09-10T15:00:00+07:00',
      contractSum: 30000,
      address: { town: 'Красноярск' },
    },
    {
      _id: 'qa-future',
      status: 'active',
      eventDate: '2026-11-10T15:00:00+07:00',
      contractSum: 40000,
      address: { town: 'Красноярск' },
    },
  ],
  transactions: [
    {
      _id: 'qa-income',
      eventId: 'qa-past',
      type: 'income',
      amount: 15000,
      date: '2026-09-09T15:00:00+07:00',
    },
    {
      _id: 'qa-expense',
      eventId: 'qa-past',
      type: 'expense',
      amount: 5000,
      date: '2026-09-09T15:00:00+07:00',
    },
  ],
  clients: [],
  services: [],
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import StatisticsContent from './layouts/content/StatisticsContent';
createRoot(document.getElementById('root')).render(<main className="cabinet-canvas" style={{padding:12,minHeight:'100vh'}}><StatisticsContent/></main>);`
const mocks = {
  jotai: 'export const useAtomValue=value=>value',
  '@state/atoms/loggedUserAtom':
    "export default {_id:'qa-user',trialEndsAt:'2099-01-01T00:00:00Z'}",
  '@state/atoms/tariffsAtom': 'export default []',
  '@state/atoms/siteSettingsAtom': "export default {defaultTown:'Красноярск'}",
  '@state/atoms': 'export const modalsFuncAtom={custom(){}}',
  '@helpers/useStatisticsQuery': `export const useStatisticsQuery=()=>({data:${JSON.stringify(data)}})`,
  'next/navigation': 'export const useRouter=()=>({push(){}})',
  '@components/ContentHeader':
    'export default ({children})=><header>{children}</header>',
  '@layouts/cards/EventCard': 'export default ()=>null',
  '@layouts/cards/TransactionCard': 'export default ()=>null',
}
test.before(async () => {
  harness = await startHarness(entry, mocks)
})
test.after(async () => {
  await harness?.close()
})
test(
  'Заголовок графика и пояснение прогноза не выглядят как пустые показатели',
  { timeout: 180000 },
  async () => {
    for (const width of [390, 1365])
      for (const dark of [false, true]) {
        const page = await harness.browser.newPage({
          viewport: { width, height: 1100 },
          colorScheme: 'light',
          locale: 'ru-RU',
          timezoneId: 'Asia/Krasnoyarsk',
        })
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.route('**/*', (route) =>
          route.request().url().startsWith(harness.origin)
            ? route.continue()
            : route.abort()
        )
        try {
          await page.clock.install({
            time: new Date('2026-10-09T12:00:00+07:00'),
          })
          await page.goto(harness.origin)
          await page.evaluate(
            (dark) => document.body.classList.toggle('theme-dark', dark),
            dark
          )
          await page.getByText('Год', { exact: true }).waitFor()
          // Проверяем реальный график и прежние значения, а не заглушку с подписью.
          await page.locator('svg:has(text)').waitFor()
          assert.equal(
            await page
              .getByText('Чистая прибыль', { exact: true })
              .locator('..')
              .getByText('10 000 ₽', { exact: true })
              .count(),
            1
          )
          assert.equal(
            await page
              .getByText('Остаток по оплате', { exact: true })
              .locator('..')
              .locator('..')
              .getByText('55 000 ₽', { exact: true })
              .count(),
            1
          )
          assert.equal(
            await page
              .getByRole('heading', { name: 'Прибыль по месяцам', exact: true })
              .count(),
            1
          )
          assert.equal(
            await page
              .getByText('Группировка по месяцам', { exact: true })
              .count(),
            0
          )
          const explanation = page.getByText(
            'Ожидаемая прибыль — текущая прибыль + недооплачено.',
            { exact: true }
          )
          assert.equal(await explanation.count(), 1)
          const legend = explanation.locator('..').locator('..')
          for (const label of [
            'Текущая прибыль',
            'Недооплачено',
            'Текущий месяц (в работе)',
            'Будущие месяцы',
          ]) {
            assert.equal(
              await legend.getByText(label, { exact: true }).count(),
              1
            )
          }
          assert.equal(
            await page.getByText('Ожидаемая прибыль', { exact: true }).count(),
            0
          )
          const groupingHelp = page.getByRole('button', {
            name: 'Подсказка: Прибыль по месяцам',
            exact: true,
          })
          await groupingHelp.click()
          await page.getByRole('tooltip').waitFor()
          assert.match(
            await page.getByRole('tooltip').innerText(),
            /относятся к месяцу его начала/
          )
          await groupingHelp.press('Escape')
          await page.getByRole('tooltip').waitFor({ state: 'hidden' })
          const expectedHelp = legend.getByRole('button', {
            name: 'Подсказка: Ожидаемая прибыль',
            exact: true,
          })
          await expectedHelp.click()
          await page.getByRole('tooltip').waitFor()
          assert.match(
            await page.getByRole('tooltip').innerText(),
            /а не уже заработанные деньги/
          )
          await expectedHelp.press('Escape')
          await page.getByRole('tooltip').waitFor({ state: 'hidden' })
          const geometry = await explanation.evaluate((el) => ({
            width: el.clientWidth,
            content: el.scrollWidth,
            right: el.getBoundingClientRect().right,
            overflow: document.documentElement.scrollWidth > innerWidth,
          }))
          assert.equal(geometry.overflow, false)
          assert.ok(geometry.content <= geometry.width)
          assert.ok(geometry.right <= width)
          assert.deepEqual(errors, [])
          await capture(
            page,
            `statistics-captions-${width}-${dark ? 'dark' : 'light'}`
          )
          // Emotion вставляет стили через CSSOM: переносим их в статический снимок.
          const html = await page.evaluate(() => {
            const clone = document.documentElement.cloneNode(true)
            clone.querySelectorAll('script').forEach((node) => node.remove())
            const styles = Array.from(document.querySelectorAll('style'))
            clone.querySelectorAll('style').forEach((style, index) => {
              if (styles[index].sheet) {
                style.textContent = Array.from(styles[index].sheet.cssRules)
                  .map((rule) => rule.cssText)
                  .join('\n')
              }
            })
            return '<!doctype html>' + clone.outerHTML
          })
          await fs.writeFile(
            path.join(
              artifactDir,
              `statistics-captions-${width}-${dark ? 'dark' : 'light'}.html`
            ),
            html
          )
        } finally {
          await page.close()
        }
      }
  }
)
