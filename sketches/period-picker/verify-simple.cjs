const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const {
  chromium,
} = require('/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright')
const out = '/home/aleksei/.hermes/cache/scratch/vedelo-period-simple-qa'
async function capture(page, name) {
  await page.screenshot({ path: `${out}/${name}.png` })
  await fs.writeFile(
    `${out}/${name}.html`,
    await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true)
      for (const script of clone.querySelectorAll('script')) script.remove()
      return '<!doctype html>' + clone.outerHTML
    })
  )
}
async function checkControl(page, width, theme) {
  const control = await page.locator('#open').evaluate((el) => {
    const css = getComputedStyle(el)
    return {
      radius: css.borderRadius,
      border: css.borderTopWidth,
      height: el.getBoundingClientRect().height,
    }
  })
  assert.equal(control.radius, '4px', 'Скругление как у InputWrapper Ведело')
  assert.equal(control.border, '2px', 'Рамка как у InputWrapper Ведело')
  assert.ok(control.height >= 44)
  assert.equal(
    await page.locator('#clear').getAttribute('aria-label'),
    'Сбросить период'
  )
  if (await page.locator('#clear').isVisible()) {
    const boxes = await Promise.all([
      page.locator('#open').boundingBox(),
      page.locator('#clear').boundingBox(),
    ])
    assert.ok(
      boxes[0].x + boxes[0].width <= boxes[1].x + 1,
      'Сброс не перекрывает значение'
    )
    assert.ok(boxes[1].width >= 44 && boxes[1].height >= 44)
    await capture(page, `selected-${width}-${theme}`)
  }
}
async function run() {
  await fs.mkdir(out, { recursive: true })
  const browser = await chromium.launch({
    executablePath:
      '/home/aleksei/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome',
  })
  let total = 0
  try {
    for (const width of [280, 390, 1365])
      for (const theme of ['light', 'dark']) {
        const page = await browser.newPage({
          viewport: { width, height: width === 390 ? 640 : 844 },
          locale: 'ru-RU',
        })
        const errors = []
        page.on('pageerror', (e) => errors.push(e.message))
        try {
          const response = await page.goto(
            `https://vedelo.ru/demo/period.html?theme=${theme}&revision=simple`
          )
          assert.equal(response.status(), 200)
          await page.locator('#open').click()
          assert.equal(
            await page.locator('#date-from').isVisible(),
            false,
            'Поля не видны при первом открытии'
          )
          assert.equal(
            await page.locator('#calendars').isVisible(),
            false,
            'Календарь не показывается одновременно с готовыми периодами'
          )
          await capture(page, `presets-${width}-${theme}`)
          await page
            .getByRole('button', { name: 'Последние 7 дней', exact: true })
            .click()
          assert.equal(
            await page.locator('#picker').evaluate((el) => el.open),
            false
          )
          assert.equal(
            await page.locator('#count').textContent(),
            'Показано: 3 из 8'
          )
          await checkControl(page, width, theme)
          await page.locator('#open').click()
          await page
            .getByRole('button', { name: 'Выбрать даты', exact: true })
            .click()
          assert.equal(await page.locator('#calendars').isVisible(), true)
          assert.equal(
            await page.locator('#date-from').isVisible(),
            false,
            'Ручной ввод скрыт даже в календаре'
          )
          assert.equal(await page.locator('#presets').isVisible(), false)
          assert.equal(await page.locator('#month').count(), 0)
          assert.equal(await page.locator('#year').count(), 0)
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
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth
            ),
            false
          )
          const footer = await page.locator('.dialog-footer').boundingBox()
          assert.ok(
            footer.y + footer.height <= page.viewportSize().height + 1,
            'Кнопки вмещаются по высоте'
          )
          await capture(page, `calendar-${width}-${theme}`)
          await page.locator('#cancel').click()
          assert.equal(
            await page.locator('#count').textContent(),
            'Показано: 3 из 8'
          )
          await checkControl(page, width, theme)
          await page.locator('#open').click()
          await page
            .getByRole('button', { name: 'Выбрать даты', exact: true })
            .click()
          await page.locator('#manual-toggle').click()
          assert.equal(await page.locator('#date-from').isVisible(), true)
          await page.locator('#date-from').fill('31.02.2026')
          await page.locator('#date-to').focus()
          assert.equal(await page.locator('#apply').isDisabled(), true)
          assert.match(
            await page.locator('#error').textContent(),
            /существующую дату/
          )
          await page.locator('#date-from').fill('20.10.2026')
          await page.locator('#date-to').fill('01.10.2026')
          await page.locator('#date-from').focus()
          assert.equal(await page.locator('#apply').isDisabled(), true)
          await page.locator('#date-from').fill('01.01.2026')
          await page.locator('#date-to').fill('')
          await page.locator('#date-from').focus()
          await page.locator('#apply').click()
          assert.equal(
            await page.locator('#count').textContent(),
            'Показано: 8 из 8'
          )
          await page.locator('#clear').click()
          await checkControl(page, width, theme)
          await page.locator('#open').click()
          await page
            .getByRole('button', { name: 'Выбрать даты', exact: true })
            .click()
          await page.locator('#back-presets').click()
          assert.equal(await page.locator('#presets').isVisible(), true)
          assert.equal(await page.locator('#date-from').isVisible(), false)
          await page.keyboard.press('Escape')
          assert.equal(
            await page.locator('#picker').evaluate((el) => el.open),
            false
          )
          assert.ok(
            await page
              .locator('#open')
              .evaluate((el) => el === document.activeElement)
          )
          assert.deepEqual(errors, [])
          await capture(page, `closed-${width}-${theme}`)
          total++
          console.log(`Проверено: ${width}, ${theme}`)
        } finally {
          await page.close()
        }
      }
    console.log(
      `Успешно: ${total} сочетаний, последовательное раскрытие без лишних полей, применение/отмена/валидация/возврат`
    )
  } finally {
    await browser.close()
  }
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
