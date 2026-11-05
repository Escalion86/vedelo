const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')

test('продление убирает истечение из Важного и бейджа; шаблоны доступны мышью и клавиатурой в обеих темах', { timeout: 180000 }, async () => {
  // Browser plugin отсутствует; настоящий UI/CSS проверяется через Playwright.
  process.env.ESBUILD_MODULE ||= path.resolve('mobile/node_modules/esbuild')
  const artifacts = process.env.QA_SCREENSHOT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'vedelo-proposal-expiry-'))
  await fs.mkdir(artifacts, { recursive: true })
  const { js, css } = await require('./proposalEditorHarness.cjs').buildFixture(artifacts)
  const initial = {
    _id: 'proposal', eventId: 'event', title: 'Детский праздник', version: 1,
    status: 'expired', validUntil: '2020-01-01', publicUrl: 'https://example.test/proposal/same-link',
    packages: [{ id: 'main', title: 'Программа', total: 1000, lines: [], manualTotal: true }],
    blocksSnapshot: [{ id: 'header', type: 'header', contentHtml: '<p>Предложение</p>', enabled: true }],
    mediaSnapshot: [], clientSnapshot: { firstName: 'Анна' }, artistSnapshot: {}, eventSnapshot: {},
    messageText: 'Предложение {{proposal.url}}',
  }
  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script>window.fixtureProposal=${JSON.stringify(initial)}</script><script src="/bundle.js"></script></body></html>`
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript; charset=utf-8' : req.url === '/styles.css' ? 'text/css; charset=utf-8' : 'text/html; charset=utf-8')
    res.end(req.url === '/bundle.js' ? js : req.url === '/styles.css' ? css : html)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const browser = await require('playwright').chromium.launch({ headless: true, channel: 'msedge' }).catch(error => { server.close(); throw error })
  try {
    for (const width of [390, 1365]) for (const dark of [false, true]) {
      const page = await browser.newPage({ viewport: { width, height: 950 } })
      const errors = [], writes = []
      page.on('pageerror', error => errors.push(error.message))
      page.on('console', msg => {
        if (msg.type() === 'error' && !/Failed to load resource:.*status of 500/.test(msg.text())) errors.push(msg.text())
      })
      let proposal = structuredClone(initial)
      let failExpiry = false
      const templates = [{ _id: 'first', name: 'Детское', status: 'active' }, { _id: 'second', name: 'Свадебное торжество с длинным названием программы и индивидуальными пожеланиями клиента', status: 'active' }]
      await page.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url())
        let data = []
        if (url.pathname === '/api/proposals/expired') {
          if (failExpiry) return route.fulfill({ status: 500, json: { success: false, error: { message: 'Ошибка' } } })
          data = proposal.status === 'expired' ? [{ ...proposal, eventType: 'Детский праздник', eventDate: '2030-01-01' }] : []
        } else if (url.pathname === '/api/proposals/statuses') data = { event: proposal.status === 'expired' ? 'expired' : 'published' }
        else if (url.pathname === '/api/proposal-templates') data = templates
        else if (url.pathname === '/api/events/event/proposals') {
          if (req.method() === 'POST') {
            writes.push(req.postDataJSON())
            data = { ...proposal, _id: 'created', status: 'draft' }
          } else data = [proposal]
        } else if (url.pathname === '/api/proposals/proposal') {
          if (req.method() === 'PATCH') {
            writes.push(req.postDataJSON())
            // Server renewal/public-link/tenant behaviour is tested by the real route suite.
            proposal = { ...proposal, ...req.postDataJSON(), status: 'published' }
          }
          data = proposal
        }
        await route.fulfill({ json: { success: true, data } })
      })
      const origin = `http://127.0.0.1:${server.address().port}`
      await page.goto(`${origin}/?kind=expiry`)
      await page.locator('body').evaluate((body, dark) => body.classList.toggle('theme-dark', dark), dark)
      const section = page.locator('#attention-expired-proposals')
      await section.getByText('Детский праздник', { exact: true }).first().waitFor()
      await section.getByRole('button', { name: 'Открыть мероприятие', exact: true }).click()
      assert.equal(await page.evaluate(() => window.openedEventId), 'event')
      assert.ok(await page.getByText('Срок КП истёк', { exact: true }).count() >= 2)
      await page.screenshot({ path: path.join(artifacts, `expiry-${width}-${dark}.png`), fullPage: true, animations: 'disabled' })
      await page.getByRole('button', { name: 'Редактировать предложение', exact: true }).click()
      await page.locator('input[type="date"]').fill('2031-12-31')
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await section.waitFor({ state: 'detached' })
      await page.getByText('Срок КП истёк', { exact: true }).first().waitFor({ state: 'detached' })
      assert.equal(proposal.validUntil, '2031-12-31')
      assert.equal(proposal.publicUrl, initial.publicUrl)
      await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
      assert.equal(await page.locator('html').evaluate(node => node.scrollWidth > innerWidth), false)

      // Ошибка и повтор запроса не скрывают проблему как пустой список.
      failExpiry = true
      await page.evaluate(() => window.queryClient.refetchQueries({ queryKey: window.queryKeys.expiredProposals }))
      await section.getByText('Не удалось проверить сроки предложений.', { exact: true }).waitFor()
      failExpiry = false
      await section.getByRole('button', { name: 'Повторить' }).click()
      await section.waitFor({ state: 'detached' })

      await page.goto(`${origin}/?kind=list`)
      await page.locator('body').evaluate((body, dark) => body.classList.toggle('theme-dark', dark), dark)
      await page.locator('summary').filter({ hasText: 'Коммерческие предложения' }).click()
      await page.getByRole('button', { name: 'Создать предложение', exact: true }).click()
      const group = page.getByRole('group', { name: 'Шаблон предложения', exact: true })
      await group.getByRole('radio', { name: 'Детское', exact: true }).waitFor()
      assert.equal(await group.locator('select').count(), 0)
      assert.equal(await group.getByRole('radio', { name: 'Детское', exact: true }).isChecked(), true)
      await group.getByRole('radio', { name: templates[1].name, exact: true }).check()
      assert.equal(await group.getByRole('radio', { name: templates[1].name, exact: true }).isChecked(), true)
      await page.screenshot({ path: path.join(artifacts, `templates-${width}-${dark}.png`), fullPage: true, animations: 'disabled' })
      const selectedStyle = await group.locator('input:checked').evaluate(input => ({
        accent: getComputedStyle(input).accentColor,
        border: getComputedStyle(input.closest('label')).borderColor,
      }))
      assert.equal(selectedStyle.accent, selectedStyle.border)
      assert.notEqual(selectedStyle.accent, 'auto')
      await page.keyboard.press('ArrowDown')
      assert.equal(await group.getByRole('radio', { name: 'Без шаблона', exact: true }).isChecked(), true)
      await page.keyboard.press('ArrowUp')
      assert.equal(await group.getByRole('radio', { name: templates[1].name, exact: true }).isChecked(), true)
      await page.getByRole('button', { name: 'Создать', exact: true }).click()
      assert.equal(writes.at(-1).templateId, 'second')
      assert.equal(await page.locator('html').evaluate(node => node.scrollWidth > innerWidth), false)
      assert.deepEqual(errors, [])
      await page.close()
    }
  } finally {
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})
