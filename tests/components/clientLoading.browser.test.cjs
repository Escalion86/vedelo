const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs/promises')
const path = require('node:path')
const { buildClientLoadingHarness } = require('./clientLoadingHarness.cjs')
let browser, server, url
const client = { _id: 'client', firstName: 'Анна', secondName: 'Иванова' }
before(async () => {
  const html = await buildClientLoadingHarness()
  server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(html)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${server.address().port}`
  browser = await require(process.env.PLAYWRIGHT_MODULE).chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  })
})
after(async () => {
  await browser?.close()
  if (server) await new Promise((resolve) => server.close(resolve))
})
async function setup(
  t,
  { clients = null, width = 390, dark = false, route } = {}
) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // HTTP 503 намеренно создаётся в тестах; это браузерная сетевая диагностика, не ошибка приложения.
  page.on('console', (m) => {
    if (
      m.type() === 'error' &&
      !m.text().startsWith('Failed to load resource:')
    )
      errors.push(m.text())
  })
  await page.addInitScript(
    (fixture) => {
      window.fixture = fixture
    },
    { clients }
  )
  await page.route(
    '**/api/clients',
    route || ((r) => r.fulfill({ json: { success: true, data: [client] } }))
  )
  t.after(async () => {
    assert.deepEqual(errors, [])
    await page.close()
  })
  await page.goto(url)
  if (dark) await page.evaluate(() => document.body.classList.add('theme-dark'))
  await page.waitForFunction(() => !!window.q)
  return page
}
async function verifyContrast(page, locator) {
  const result = await locator.evaluate((el) => {
    const rgba = (s) => s.match(/[\d.]+/g).map(Number)
    const stack = []
    for (let node = el; node; node = node.parentElement) {
      const c = rgba(getComputedStyle(node).backgroundColor)
      if ((c[3] ?? 1) > 0) stack.push(c)
      if ((c[3] ?? 1) === 1) break
    }
    let bg = [255, 255, 255]
    for (const [r, g, b, a = 1] of stack.reverse())
      bg = [
        r * a + bg[0] * (1 - a),
        g * a + bg[1] * (1 - a),
        b * a + bg[2] * (1 - a),
      ]
    const color = rgba(getComputedStyle(el).color).slice(0, 3)
    const l = (c) =>
      c
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
    const a = l(color),
      b = l(bg)
    return {
      text: el.textContent,
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
    }
  })
  assert.ok(result.ratio >= 4.5, JSON.stringify(result))
  console.log(`Контраст «${result.text}»: ${result.ratio.toFixed(2)}:1`)
}
const card = (page) => page.locator('[data-event="event-0"]')
async function unchanged(page) {
  assert.equal(
    await page.evaluate(
      () => window.card === document.querySelector('.event-card-shell')
    ),
    true
  )
}
async function settledError(page) {
  await page.waitForFunction(
    () => window.q.getQueryState(['clients', {}])?.status === 'error'
  )
}
async function retry(page) {
  await page.evaluate(() => {
    window.q.invalidateQueries({ queryKey: ['clients'] })
  })
}

test(
  'задержанный список: только клиентская часть ждёт; два клиента используют один GET; обновление без remount',
  { timeout: 20000 },
  async (t) => {
    let release,
      calls = 0
    const page = await setup(t, {
      route: async (r) => {
        calls++
        await new Promise((resolve) => (release = resolve))
        await r.fulfill({ json: { success: true, data: [client] } })
      },
    })
    await card(page).getByRole('status').waitFor({ timeout: 2000 })
    assert.equal(await card(page).getByLabel('Клиент не указан').count(), 0)
    assert.equal(
      (await card(page).getByText('15,000 ₽').count()) +
        (await card(page).getByText('15 000 ₽').count()),
      1
    )
    assert.equal(
      await page
        .locator('[data-event="event-2"]')
        .getByLabel('Клиент не указан')
        .count(),
      1
    )
    assert.equal(calls, 1)
    release()
    await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
    assert.equal(await card(page).getByRole('status').count(), 0)
    await page
      .locator('[data-event="event-3"]')
      .getByText('Клиент не найден', { exact: true })
      .waitFor()
    assert.equal(
      await page
        .locator('[data-event="event-3"]')
        .getByLabel('Клиент не указан')
        .count(),
      0
    )
    await unchanged(page)
  }
)

test(
  'ограниченный автоматический retry GET завершается успехом без reload',
  { timeout: 20000 },
  async (t) => {
    let calls = 0
    const page = await setup(t, {
      route: (r) =>
        ++calls === 1
          ? r.fulfill({ status: 503, json: { error: 'internal secret' } })
          : r.fulfill({ json: { data: [client] } }),
    })
    await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
    assert.equal(calls, 2)
    await unchanged(page)
  }
)

test(
  'ошибка не становится пустым состоянием или вечным скелетоном; ручной повтор доступен клавиатурой',
  { timeout: 20000 },
  async (t) => {
    let calls = 0,
      fail = true
    const page = await setup(t, {
      route: (r) => {
        calls++
        return r.fulfill(
          fail
            ? { status: 503, json: { error: 'internal secret' } }
            : { json: { data: [client] } }
        )
      },
    })
    await settledError(page)
    await card(page)
      .getByText('Не удалось загрузить клиента', { exact: true })
      .waitFor({ timeout: 2000 })
    assert.equal(calls, 2)
    assert.equal(await card(page).getByRole('status').count(), 0)
    assert.equal(await card(page).getByLabel('Клиент не указан').count(), 0)
    assert.equal(await page.getByText('internal secret').count(), 0)
    const button = card(page).getByRole('button', {
      name: 'Повторить загрузку клиентов',
    })
    await button.focus()
    fail = false
    await page.keyboard.press('Enter')
    await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
    assert.equal(calls, 3)
    assert.equal(await page.evaluate(() => window.cardOpened), undefined)
    await unchanged(page)
  }
)

test(
  'HTTP 200 с повреждённым payload — ошибка, не успешный пустой список',
  { timeout: 20000 },
  async (t) => {
    const page = await setup(t, {
      route: (r) => r.fulfill({ json: { success: true, data: null } }),
    })
    await settledError(page)
    await card(page)
      .getByText('Не удалось загрузить клиента', { exact: true })
      .waitFor()
    assert.equal(await card(page).getByText('Клиент не найден').count(), 0)
  }
)

test(
  'пауза offline и online восстанавливают общий запрос без remount',
  { timeout: 20000 },
  async (t) => {
    let calls = 0
    const page = await setup(t, {
      route: (r) => {
        calls++
        return r.fulfill({ json: { data: [client] } })
      },
    })
    await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'))
      window.q.resetQueries({ queryKey: ['clients'] })
    })
    await card(page).getByRole('status').waitFor()
    assert.equal(await card(page).getByLabel('Клиент не указан').count(), 0)
    assert.equal(calls, 1)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
    assert.equal(calls, 2)
    await unchanged(page)
  }
)

test(
  'ошибка → восстановление сети вызывает refetch без reload',
  { timeout: 20000 },
  async (t) => {
    let calls = 0,
      fail = true
    const page = await setup(t, {
      route: (r) => {
        calls++
        return r.fulfill(
          fail
            ? { status: 503, json: { error: 'secret' } }
            : { json: { data: [client] } }
        )
      },
    })
    await settledError(page)
    await page.evaluate(() => window.dispatchEvent(new Event('offline')))
    fail = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
    assert.equal(calls, 3)
    await unchanged(page)
  }
)

test(
  'свежий cached клиент остаётся при фоновой ошибке и unavailable SSR hydration',
  { timeout: 20000 },
  async (t) => {
    const page = await setup(t, {
      clients: [client],
      route: (r) => r.fulfill({ status: 503, json: { error: 'secret' } }),
    })
    await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
    await retry(page)
    await settledError(page)
    assert.equal(
      await card(page).getByText('Анна Иванова', { exact: true }).count(),
      1
    )
    await page.evaluate(() => window.rehydrate(null))
    await page.waitForTimeout(100)
    assert.equal(
      await card(page).getByText('Анна Иванова', { exact: true }).count(),
      1
    )
    await unchanged(page)
  }
)

test(
  'успешный SSR [] действительно полный пустой список; без лишнего GET',
  { timeout: 20000 },
  async (t) => {
    let calls = 0
    const page = await setup(t, {
      clients: [],
      route: (r) => {
        calls++
        return r.fulfill({ json: { data: [] } })
      },
    })
    await card(page)
      .getByText('Клиент не найден', { exact: true })
      .waitFor({ timeout: 2000 })
    assert.equal(calls, 0)
    assert.equal(
      await page
        .locator('[data-event="event-2"]')
        .getByLabel('Клиент не указан')
        .count(),
      1
    )
  }
)

test(
  'мутации клиентов не получают автоматический retry GET',
  { timeout: 20000 },
  async (t) => {
    let posts = 0,
      puts = 0
    const page = await setup(t, {
      clients: [client],
      route: (r) => {
        if (r.request().method() === 'POST') {
          posts++
          return r.fulfill({ status: 503, json: { error: 'secret' } })
        }
        return r.fulfill({ json: { data: [client] } })
      },
    })
    await page.route('**/api/clients/client', (r) => {
      puts++
      return r.fulfill({ status: 503, json: { error: 'secret' } })
    })
    await page.evaluate(async () => {
      try {
        await window.actions.set({ firstName: 'Тест' })
      } catch {}
      try {
        await window.actions.set({ _id: 'client', firstName: 'Тест' })
      } catch {}
    })
    await page.waitForTimeout(1200)
    assert.equal(posts, 1)
    assert.equal(puts, 1)
    assert.equal(
      await page.evaluate(() => window.q.getDefaultOptions().mutations.retry),
      0
    )
  }
)

test(
  '390/1365 px, обе темы: loading/error/retry/success, контраст, доступность и overflow',
  { timeout: 90000 },
  async (t) => {
    for (const width of [390, 1365])
      for (const dark of [false, true]) {
        let fail = true,
          release
        const page = await setup(t, {
          width,
          dark,
          route: async (r) => {
            await new Promise((resolve) => (release = resolve))
            await r.fulfill(
              fail
                ? { status: 503, json: { error: 'secret' } }
                : { json: { data: [client] } }
            )
          },
        })
        await card(page).getByRole('status').waitFor({ timeout: 2000 })
        await verifyContrast(page, card(page).getByRole('status'))
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          ),
          false
        )
        release()
        await page.waitForTimeout(1200)
        release()
        await settledError(page)
        const button = card(page).getByRole('button', {
          name: 'Повторить загрузку клиентов',
        })
        await button.waitFor()
        await verifyContrast(
          page,
          card(page).getByRole('alert').locator('span')
        )
        await verifyContrast(page, button)
        await page.addScriptTag({
          path: require.resolve('axe-core/axe.min.js', {
            paths: [
              process.env.AXE_MODULE ||
                path.dirname(process.env.ESBUILD_MODULE),
            ],
          }),
        })
        const violations = await page.evaluate(
          async () =>
            (
              await window.axe.run(document, {
                runOnly: {
                  type: 'tag',
                  values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
                },
              })
            ).violations
        )
        assert.deepEqual(
          violations.map((v) => v.id),
          []
        )
        const rect = await button.boundingBox()
        assert.ok(rect.width >= 40 && rect.height >= 40)
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          ),
          false
        )
        assert.equal(
          await card(page).evaluate((el) => el.scrollWidth > el.clientWidth),
          false
        )
        assert.equal(
          await button.evaluate(
            (el) =>
              el.getBoundingClientRect().bottom <=
              el.closest('.event-card-shell').getBoundingClientRect().bottom
          ),
          true,
          'Повтор должен помещаться в фиксированную карточку'
        )
        if (process.env.QA_SCREENSHOT_DIR) {
          await fs.mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
          const html = await page.evaluate(() => {
            const clone = document.documentElement.cloneNode(true)
            clone.querySelectorAll('script').forEach((el) => el.remove())
            ;[...document.querySelectorAll('style')].forEach((el, i) => {
              clone.querySelectorAll('style')[i].textContent = [
                ...el.sheet.cssRules,
              ]
                .map((r) => r.cssText)
                .join('\n')
            })
            return '<!doctype html>' + clone.outerHTML
          })
          await fs.writeFile(
            path.join(
              process.env.QA_SCREENSHOT_DIR,
              `client-error-${width}-${dark ? 'dark' : 'light'}.html`
            ),
            html
          )
          await page.screenshot({
            path: path.join(
              process.env.QA_SCREENSHOT_DIR,
              `client-error-${width}-${dark ? 'dark' : 'light'}.png`
            ),
            fullPage: true,
          })
        }
        await button.focus()
        fail = false
        await page.keyboard.press('Space')
        await page.waitForTimeout(50)
        release()
        await card(page).getByText('Анна Иванова', { exact: true }).waitFor()
        await unchanged(page)
        if (process.env.QA_SCREENSHOT_DIR) {
          await fs.mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
          await page.screenshot({
            path: path.join(
              process.env.QA_SCREENSHOT_DIR,
              `client-success-${width}-${dark ? 'dark' : 'light'}.png`
            ),
            fullPage: true,
          })
        }
        console.log(`Проверено: ${width}px/${dark ? 'dark' : 'light'}`)
      }
  }
)
