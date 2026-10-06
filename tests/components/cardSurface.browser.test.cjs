const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { buildCardSurfaceHarness } = require('./cardSurfaceHarness.cjs')

test(
  'real EventCard/CardWrapper: intact edges, surfaces and focus in both themes and viewports',
  {
    skip:
      !process.env.PLAYWRIGHT_MODULE &&
      'Set PLAYWRIGHT_MODULE to an installed Playwright module',
  },
  async () => {
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
    const browser = await chromium.launch({ headless: true })
    try {
      const html = await buildCardSurfaceHarness()
      for (const width of [390, 1365]) {
        for (const dark of [false, true]) {
          const context = await browser.newContext({
            viewport: { width, height: 1100 },
          })
          const page = await context.newPage()
          const errors = []
          page.on('pageerror', (error) => errors.push(error.message))
          page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text())
          })
          await page.setContent(html)
          if (dark)
            await page.evaluate(() => document.body.classList.add('theme-dark'))
          const result = await page.evaluate(() => {
            const rect = (element) => element.getBoundingClientRect().toJSON()
            return {
              canvas: getComputedStyle(
                document.querySelector('.cabinet-canvas')
              ).backgroundColor,
              publicBackground: getComputedStyle(document.body).backgroundColor,
              horizontalOverflow:
                document.documentElement.scrollWidth > innerWidth,
              rows: Array.from(
                document.querySelectorAll('.card-swipe-row')
              ).map((row) => {
                const card = row.querySelector('.ui-surface-card')
                return {
                  row: rect(row),
                  card: rect(card),
                  bottomBorder: getComputedStyle(card).borderBottomWidth,
                  shadow: getComputedStyle(row).boxShadow,
                  cardBackground: getComputedStyle(card).backgroundColor,
                }
              }),
            }
          })
          assert.equal(
            result.canvas,
            dark ? 'rgb(16, 13, 10)' : 'rgb(243, 241, 235)'
          )
          assert.equal(
            result.publicBackground,
            dark ? 'rgb(15, 12, 9)' : 'rgb(255, 254, 250)'
          )
          assert.equal(result.horizontalOverflow, false)
          assert.equal(result.rows.length, 5)
          for (const {
            row,
            card,
            bottomBorder,
            shadow,
            cardBackground,
          } of result.rows) {
            assert.ok(
              card.bottom <= row.bottom + 0.01,
              `${width}/${dark}: bottom edge clipped by ${card.bottom - row.bottom}px`
            )
            assert.ok(card.top >= row.top - 0.01)
            assert.equal(bottomBorder, '1px')
            assert.notEqual(shadow, 'none')
            if (!dark) assert.equal(cardBackground, 'rgb(255, 255, 255)')
          }
          const first = page.locator('.event-card-shell').first()
          await first.focus()
          assert.equal(
            await first.evaluate((node) => node === document.activeElement),
            true
          )
          assert.equal(
            await page
              .getByText('Карточка без свайпа', { exact: true })
              .count(),
            1
          )
          assert.equal(
            await page
              .getByText('Дата прошла — уточните результат', { exact: true })
              .count(),
            1
          )
          assert.deepEqual(errors, [])
          if (process.env.QA_SCREENSHOT_DIR) {
            await fs.mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
            await page.screenshot({
              path: path.join(
                process.env.QA_SCREENSHOT_DIR,
                `cards-${width}-${dark ? 'dark' : 'light'}.png`
              ),
              fullPage: true,
            })
          }
          await context.close()
        }
      }
    } finally {
      await browser.close()
    }
  }
)
