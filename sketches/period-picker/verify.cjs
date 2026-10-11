const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const {
  chromium,
} = require('/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright')
const output = '/home/aleksei/.hermes/cache/scratch/vedelo-period-demo-qa'
async function capture(page, name) {
  await page.screenshot({
    path: path.join(output, name + '.png'),
    fullPage: true,
  })
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true)
    clone.querySelectorAll('script').forEach((n) => n.remove())
    return '<!doctype html>' + clone.outerHTML
  })
  await fs.writeFile(path.join(output, name + '.html'), html)
}
async function run() {
  await fs.mkdir(output, { recursive: true })
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      '/home/aleksei/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
    args: ['--no-sandbox'],
  })
  let cases = 0
  try {
    for (const width of [280, 390, 1365])
      for (const theme of ['light', 'dark'])
        for (const variant of ['fields']) {
          const page = await browser.newPage({
            viewport: { width, height: 844 },
            locale: 'ru-RU',
          })
          const errors = [],
            apiCalls = []
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('request', (request) => {
            if (new URL(request.url()).pathname.startsWith('/api/'))
              apiCalls.push(request.url())
          })
          try {
            const file =
              variant === 'fields' ? 'period-fields.html' : 'period.html'
            const response = await page.goto(
              `https://vedelo.ru/demo/${file}?theme=${theme}`
            )
            assert.equal(response.status(), 200)
            assert.match(response.headers()['x-robots-tag'], /noindex/)
            await page
              .getByRole('heading', { name: 'Отзывы клиентов', exact: true })
              .waitFor()
            assert.equal(
              await page.locator('#count').textContent(),
              'Показано: 8 из 8'
            )
            assert.equal(
              await page.locator('#compact-ui').isVisible(),
              variant === 'compact'
            )
            assert.equal(
              await page.locator('#fields-ui').isVisible(),
              variant === 'fields'
            )
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth
              ),
              false
            )
            const opener = page.locator(
              variant === 'compact' ? '#open' : '#inline-open'
            )
            await opener.click()
            assert.equal(
              await page.locator('#picker').evaluate((el) => el.open),
              true
            )
            assert.equal(
              await page.locator('.second-calendar').isVisible(),
              width > 600
            )
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth > innerWidth
              ),
              false
            )
            const bounds = await page.locator('#picker').boundingBox()
            assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= width + 1)
            await page
              .getByRole('button', { name: 'Последние 7 дней', exact: true })
              .click()
            assert.equal(
              await page.locator('#count').textContent(),
              'Показано: 8 из 8',
              'Список не меняется до Применить'
            )
            const selected = await page.locator('#date-from').inputValue()
            assert.ok(selected)
            await capture(page, `open-${width}-${theme}-${variant}`)
            await page
              .getByRole('button', { name: 'Применить', exact: true })
              .click()
            assert.equal(
              await page.locator('#count').textContent(),
              'Показано: 3 из 8'
            )
            assert.equal(
              await page.locator('#picker').evaluate((el) => el.open),
              false
            )
            await opener.click()
            await page
              .getByRole('button', { name: 'Сегодня', exact: true })
              .click()
            await page
              .getByRole('button', { name: 'Отмена', exact: true })
              .click()
            assert.equal(
              await page.locator('#count').textContent(),
              'Показано: 3 из 8',
              'Отмена сохраняет прежний период'
            )
            await opener.click()
            assert.equal(
              await page.locator('#date-from').inputValue(),
              selected
            )
            await page.locator('#date-from').fill('20.10.2026')
            await page.locator('#date-to').fill('01.10.2026')
            await page.locator('#date-from').focus()
            assert.equal(await page.locator('#apply').isDisabled(), true)
            assert.match(
              await page.locator('#error').textContent(),
              /раньше начала/
            )
            await page.keyboard.press('Escape')
            assert.equal(
              await page.locator('#picker').evaluate((el) => el.open),
              false
            )
            assert.ok(
              await opener.evaluate((el) => el === document.activeElement),
              'После Escape фокус вернулся к кнопке'
            )
            assert.equal(
              await page.locator('#count').textContent(),
              'Показано: 3 из 8'
            )
            await opener.click()
            await page
              .getByRole('button', { name: 'За всё время', exact: true })
              .click()
            const ym = await page.evaluate(() => {
              const d = new Date()
              return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            })
            await page.locator(`[data-date="${ym}-05"]`).click()
            await page.locator(`[data-date="${ym}-10"]`).click()
            assert.equal(
              await page.locator('#date-from').inputValue(),
              `05.${ym.slice(5)}.${ym.slice(0, 4)}`
            )
            assert.equal(
              await page.locator('#date-to').inputValue(),
              `10.${ym.slice(5)}.${ym.slice(0, 4)}`
            )
            await page
              .getByRole('button', { name: 'Применить', exact: true })
              .click()
            await opener.click()
            await page.locator('#date-from').fill('01.01.2026')
            await page.locator('#date-to').fill('')
            await page.locator('#date-from').focus()
            assert.equal(
              await page.locator('#apply').isDisabled(),
              false,
              'Открытая граница допустима'
            )
            await page
              .getByRole('button', { name: 'Применить', exact: true })
              .click()
            assert.equal(
              await page.locator('#count').textContent(),
              'Показано: 8 из 8'
            )
            await page
              .locator(variant === 'compact' ? '#clear' : '#inline-clear')
              .click()
            assert.equal(
              await page.locator('#count').textContent(),
              'Показано: 8 из 8'
            )
            await capture(page, `closed-${width}-${theme}-${variant}`)
            await page
              .getByRole('button', { name: 'Переключить тему', exact: true })
              .click()
            assert.equal(
              await page.evaluate(() => document.documentElement.dataset.theme),
              theme === 'dark' ? 'light' : 'dark'
            )
            assert.deepEqual(errors, [])
            assert.deepEqual(apiCalls, [])
            cases++
            console.log(`Проверено: ${width}, ${theme}, ${variant}`)
          } finally {
            await page.close()
          }
        }
    console.log(
      `Успешно: ${cases} сочетаний; реальные HTTPS-страницы, выбор/отмена/сброс/ошибки/границы, запросов к API нет`
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
