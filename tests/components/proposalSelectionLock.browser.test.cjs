const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')

const measureNoticeContrast = (el) => {
        const rgba = (value) => value.match(/[\d.]+/g).map(Number)
        const background = (node) => {
          if (!node) return [255, 255, 255]
          const [r, g, b, a = 1] = rgba(getComputedStyle(node).backgroundColor)
          const parent = a < 1 ? background(node.parentElement) : []
          return [r, g, b].map((c, i) => c * a + (parent[i] || 0) * (1 - a))
        }
        const luminance = (rgb) => rgb.slice(0, 3).map((v) => {
          v /= 255
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0)
        const style = getComputedStyle(el)
        const fg = luminance(rgba(style.color)), bg = luminance(background(el))
        return { ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05), color: style.color, background: style.backgroundColor }
      }

// Настоящие Client/View/Notice и CSS. Только HTTP API заменён синтетической
// границей; серверное правило и гонки отдельно проверяются реальными routes.
test('public КП: смена до apply, старая вкладка после apply, reload и preview; 390/1365 light/dark', { timeout: 240000 }, async () => {
  assert.ok(process.env.ESBUILD_MODULE && process.env.PLAYWRIGHT_MODULE && process.env.QA_ARTIFACT_DIR)
  const artifacts = process.env.QA_ARTIFACT_DIR
  await fs.mkdir(artifacts, { recursive: true })
  const esbuild = require(process.env.ESBUILD_MODULE)
  const bundle = await esbuild.build({
    entryPoints: ['tests/components/proposalSelectionLock.fixture.jsx'],
    bundle: true, write: false, outdir: path.join(artifacts, 'bundle'),
    platform: 'browser', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' },
    plugins: [{ name: 'aliases', setup(build) {
      build.onResolve({ filter: /^@(components|helpers)\// }, (args) => ({
        path: path.resolve(args.path.slice(1) + (path.extname(args.path) ? '' : '.js')),
      }))
    } }],
  })
  const js = bundle.outputFiles.find((file) => file.path.endsWith('.js')).text
  const css = (await require('postcss')([require('@tailwindcss/postcss')()]).process(await fs.readFile('app/globals.css', 'utf8'), { from: path.resolve('app/globals.css') })).css + bundle.outputFiles.find((file) => file.path.endsWith('.css')).text
  const base = {
    title: 'Тестовое предложение', status: 'published', version: 1, validUntil: '2030-10-20',
    blocks: [{ type: 'packages', title: 'Варианты', enabled: true }],
    packages: [
      { id: 'basic', title: 'Основной', total: 3500, lines: [] },
      { id: 'extended', title: 'Полный', total: 4000, lines: [] },
    ],
    selectedPackageId: 'basic', selectionLocked: false,
  }
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>КП: проверка блокировки</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>window.previewProposal=${JSON.stringify({ ...base, appliedAt: '2026-10-01', appliedPackageId: 'basic' })}</script><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/bundle.js' ? 'application/javascript' : 'text/html')
    res.end(req.url === '/bundle.js' ? js : html)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
  let browser
  const evidence = []
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true })
    for (const width of [390, 1365]) for (const theme of ['light', 'dark']) for (const appTheme of ['light', 'dark']) {
      let current = { ...base, appearance: { theme } }, posts = 0
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      const errors = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      await page.route('**/api/public/proposals/test/synthetic', async (route) => {
        if (route.request().method() === 'POST') {
          posts++
          if (current.selectionLocked) {
            // Ожидаемый 409 не является непойманной ошибкой приложения.
            return route.fulfill({ status: 409, json: { error: { code: 'selection_locked', message: 'Выбор закрыт' } } })
          }
          current = { ...current, selectedPackageId: route.request().postDataJSON().packageId }
        }
        return route.fulfill({ json: { success: true, data: current } })
      })
      await page.goto(`${origin}/?theme=${theme}&appTheme=${appTheme}`)
      const buttons = page.locator('.proposal-page-view button')
      await buttons.nth(1).click()
      await assert.doesNotReject(() => page.getByRole('button', { name: 'Вы выбрали этот вариант' }).waitFor())
      assert.equal(current.selectedPackageId, 'extended')
      await buttons.nth(0).click()
      await page.waitForFunction(() => document.querySelectorAll('.proposal-page-view button')[0]?.textContent === 'Вы выбрали этот вариант')
      assert.equal(current.selectedPackageId, 'basic')
      current = { ...current, selectionLocked: true, applicationPending: true, appliedPackageId: '' }
      await buttons.nth(1).click()
      await page.getByRole('button', { name: 'Ожидает сверки' }).waitFor()
      assert.match(await page.getByRole('status').textContent(), /ожидает.*сверки/s)
      assert.doesNotMatch(await page.locator('body').textContent(), /уже утверждён|Вариант утверждён/)
      for (const button of await buttons.all()) assert.equal(await button.isDisabled(), true)
      await page.reload()
      await page.getByRole('button', { name: 'Ожидает сверки' }).waitFor()
      const pendingNoticeContrast = await page.getByRole('status').evaluate(measureNoticeContrast)
      assert.ok(pendingNoticeContrast.ratio >= 4.5)
      const pendingGeometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, heights: [...document.querySelectorAll('.proposal-page-view button')].map((el) => el.getBoundingClientRect().height) }))
      assert.ok(pendingGeometry.width <= width)
      assert.ok(pendingGeometry.heights.every((h) => h >= 40))
      await fs.writeFile(path.join(artifacts, `pending-${width}-${theme}-${appTheme}.html`), await page.content())
      await page.screenshot({ path: path.join(artifacts, `pending-${width}-${theme}-${appTheme}.png`), fullPage: true })
      await page.goto(`${origin}/?theme=${theme}&appTheme=${appTheme}&preview=1&pending=1`)
      await page.getByRole('button', { name: 'Ожидает сверки' }).waitFor()
      assert.doesNotMatch(await page.locator('body').textContent(), /уже утверждён|Вариант утверждён/)
      current = { ...current, applicationPending: false, appliedPackageId: 'basic' }
      await page.goto(`${origin}/?theme=${theme}&appTheme=${appTheme}`)
      await page.getByRole('button', { name: 'Вариант утверждён' }).waitFor()
      assert.equal(posts, 3)
      for (const button of await buttons.all()) assert.equal(await button.isDisabled(), true)
      assert.match(await page.getByRole('status').textContent(), /утверждён.*новая версия/s)
      await buttons.nth(1).evaluate((button) => button.click())
      assert.equal(posts, 3)
      await page.reload()
      await page.getByRole('button', { name: 'Вариант утверждён' }).waitFor()
      for (const button of await buttons.all()) assert.equal(await button.isDisabled(), true)
      const geometry = await page.evaluate(() => ({
        viewport: innerWidth, width: document.documentElement.scrollWidth,
        heights: [...document.querySelectorAll('.proposal-page-view button')].map((el) => el.getBoundingClientRect().height),
      }))
      assert.ok(geometry.width <= width)
      assert.ok(geometry.heights.every((height) => height >= 40))
      const noticeContrast = await page.getByRole('status').evaluate(measureNoticeContrast)
      assert.ok(noticeContrast.ratio >= 4.5, `Контраст утверждения ${theme}/${appTheme}: ${noticeContrast.ratio}`)
      await page.screenshot({ path: path.join(artifacts, `locked-${width}-${theme}-${appTheme}.png`), fullPage: true })
      const snapshot = await page.evaluate(() => {
        const clone = document.documentElement.cloneNode(true)
        clone.querySelectorAll('script').forEach((node) => node.remove())
        return '<!doctype html>' + clone.outerHTML
      })
      await fs.writeFile(path.join(artifacts, `locked-${width}-${theme}-${appTheme}.html`), snapshot)
      await page.goto(`${origin}/?theme=${theme}&appTheme=${appTheme}&preview=1`)
      await page.getByRole('button', { name: 'Вариант утверждён' }).waitFor()
      for (const button of await buttons.all()) assert.equal(await button.isDisabled(), true)
      const unexpected = errors.filter((error) => !error.includes('409 (Conflict)'))
      assert.deepEqual(unexpected, [])
      evidence.push({ width, theme, appTheme, posts, geometry, noticeContrast, pendingGeometry, pendingNoticeContrast, errors: unexpected })
      await page.close()
    }
    await fs.writeFile(path.join(artifacts, 'evidence.json'), JSON.stringify(evidence, null, 2))
  } finally {
    await browser?.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
