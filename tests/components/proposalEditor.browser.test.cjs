const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const sharp = require('sharp')
const {
  normalizeProposalBlocks,
  normalizeProposalPackages,
} = require('../../helpers/proposalContent.js')

const artifactDir = process.env.QA_ARTIFACT_DIR
const tenant = 'a'.repeat(24)
const proposalId = 'b'.repeat(24)
const logoUrl = `https://cloud.escalion.ru/uploads/vedelo/${tenant}/proposals/${proposalId}/logos/a123-456/logo.webp`
const proposal = {
  _id: proposalId,
  eventId: 'event',
  version: 1,
  title: 'Проверка предложения',
  status: 'draft',
  validUntil: '2030-10-20',
  messageText: 'Предложение для {{client.firstName}}',
  appearance: { theme: 'dark', logoUrl },
  blocksSnapshot: normalizeProposalBlocks(),
  mediaSnapshot: [],
  packages: normalizeProposalPackages([
    {
      id: 'one',
      title: 'Основная программа',
      description: '',
      total: 4500,
      manualTotal: true,
      recommended: true,
      lines: [
        {
          title: 'Название единственной услуги',
          description: 'Описание одной услуги',
          price: 5000,
        },
      ],
    },
    {
      id: 'two',
      title: 'Полная программа',
      description: '',
      total: 12000,
      manualTotal: false,
      recommended: false,
      lines: [
        { title: 'Первая услуга', description: 'Первое описание', price: 5000 },
        { title: 'Вторая услуга', description: '', price: 7000 },
      ],
    },
  ]),
  clientSnapshot: { firstName: 'Анна' },
  artistSnapshot: { fullName: 'Иван', phone: '+7 900 000 00 00' },
  eventSnapshot: {},
}
const template = {
  _id: 'template',
  name: 'Шаблон',
  blocks: normalizeProposalBlocks(),
  defaults: { packages: proposal.packages },
  messageTemplate: 'Предложение',
  media: [],
}

// Тот же esbuild + реальный CSS/компоненты подход, что у newsEditor/fieldHelp.
test(
  'настоящие КП/шаблон/общий рендер/кэш: 390 и 1365, светлая и тёмная темы',
  { timeout: 600000 },
  async () => {
    assert.ok(
      process.env.ESBUILD_MODULE &&
        process.env.PLAYWRIGHT_MODULE &&
        artifactDir,
      'Браузер и каталог артефактов обязательны'
    )
    const { buildFixture, fingerprint } = require('./proposalEditorHarness.cjs')
    const fixture = process.env.QA_FIXTURE_BUNDLE
      ? JSON.parse(await fs.readFile(process.env.QA_FIXTURE_BUNDLE, 'utf8'))
      : await buildFixture(artifactDir)
    assert.equal(await fingerprint(fixture.inputs), fixture.fingerprint, 'Браузерный bundle соответствует текущим исходникам')
    const { js, css } = fixture
    const { chromium } = require(process.env.PLAYWRIGHT_MODULE)
    const alphaPng = await sharp({
      create: {
        width: 40,
        height: 30,
        channels: 4,
        background: { r: 20, g: 80, b: 160, alpha: 0 },
      },
    })
      .png()
      .toBuffer()
    const inlineVideo = await fs.readFile(
      'tests/android-proposals/fixtures.stageH/regular.mp4'
    )
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Проверка КП</title><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script>window.fixtureProposal=${JSON.stringify(proposal)};window.fixtureTemplate=${JSON.stringify(template)};</script><script src="/bundle.js"></script></body></html>`
    const server = http.createServer((req, res) => {
      if (req.url === '/styles.css') {
        res.setHeader('Content-Type', 'text/css')
        res.end(css)
      } else if (req.url === '/bundle.js') {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(js)
      } else {
        res.setHeader('Content-Type', 'text/html')
        res.end(html)
      }
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    const browser = await chromium
      .launch({
        headless: true,
        executablePath: process.env.CHROMIUM_PATH || undefined,
        args: ['--no-sandbox'],
      })
      .catch(async (error) => {
        await new Promise((resolve) => server.close(resolve))
        throw error
      })
    await fs.mkdir(path.join(artifactDir, 'html'), { recursive: true })
    const evidence = []
    try {
      for (const width of [390, 1365])
        for (const dark of [false, true]) {
          for (const kind of ['proposal', 'template']) {
            const page = await browser.newPage({
              viewport: { width, height: 900 },
            })
            console.log('Проверка', kind, width, dark ? 'dark' : 'light')
            const errors = []
            page.on('pageerror', (error) => errors.push(error.message))
            page.on('console', (message) => {
              if (message.type() === 'error') errors.push(message.text())
            })
            let saved,
              stored = structuredClone(proposal)
            await page.route('https://cloud.escalion.ru/**', (route) =>
              route.fulfill({
                contentType: route.request().url().endsWith('.mp4')
                  ? 'video/mp4'
                  : 'image/png',
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: route.request().url().endsWith('.mp4')
                  ? inlineVideo
                  : alphaPng,
              })
            )
            await page.route('**/api/**', async (route) => {
              const req = route.request(),
                url = new URL(req.url()).pathname
              if (
                req.method() === 'PATCH' &&
                url.startsWith('/api/proposals/')
              ) {
                saved = req.postDataJSON()
                stored = {
                  ...stored,
                  ...saved,
                  blocksSnapshot: normalizeProposalBlocks(saved.blocks),
                  mediaSnapshot: saved.media,
                }
                return route.fulfill({ json: { success: true, data: stored } })
              }
              if (
                ['PATCH', 'POST'].includes(req.method()) &&
                url.startsWith('/api/proposal-templates/')
              ) {
                saved = req.postDataJSON()
                return route.fulfill({
                  json: { success: true, data: { ...saved, _id: 'template' } },
                })
              }
              return route.fulfill({
                json: {
                  success: true,
                  data:
                    url === '/api/services'
                      ? []
                      : url === '/api/proposals/statuses'
                        ? {}
                        : [],
                },
              })
            })
            await page.goto(`${origin}/?kind=${kind}`)
            await page.evaluate(
              (dark) => document.body.classList.toggle('theme-dark', dark),
              dark
            )
            const editors = page.locator(
              '.proposal-content-editor [contenteditable="true"]'
            )
            await editors
              .nth(2)
              .waitFor({ timeout: 15000 })
              .catch((error) => {
                assert.deepEqual(errors, [])
                throw error
              })
            assert.equal(await page.title(), 'Проверка КП')
            assert.deepEqual(
              await page
                .locator('.proposal-content-editor > section > h3')
                .allTextContents(),
              ['Шапка', 'Варианты и цены', 'Условия и контакты']
            )
            const first = editors.nth(0),
              intro = editors.nth(1),
              closing = editors.nth(2)
            await first.fill('Новая шапка')
            await first.press('ControlOrMeta+a')
            const section = page.getByRole('region', {
              name: 'Шапка',
              exact: true,
            })
            await section
              .getByLabel('Семейство шрифта', { exact: true })
              .selectOption('Georgia')
            await section
              .getByLabel('Размер шрифта', { exact: true })
              .selectOption('24px')
            await section
              .getByLabel('Цвет текста', { exact: true })
              .fill('#123abc')
            await section
              .getByLabel('Выравнивание текста', { exact: true })
              .selectOption('center')
            await intro.fill('Вступление перед вариантами')
            await closing.fill('Общие условия и контакты')
            const introSection = page.getByRole('region', {
              name: 'Варианты и цены',
              exact: true,
            })
            await introSection
              .locator('input[type="file"]')
              .setInputFiles({
                name: 'inline.png',
                mimeType: 'image/png',
                buffer: alphaPng,
              })
            await introSection.locator('.ProseMirror img').waitFor()
            await introSection
              .locator('input[type="file"]')
              .setInputFiles({
                name: 'inline.mp4',
                mimeType: 'video/mp4',
                buffer: inlineVideo,
              })
            await introSection.locator('.ProseMirror video').waitFor()
            await introSection
              .getByLabel('Вставить переменную', { exact: true })
              .selectOption('client.firstName')
            assert.equal(
              await introSection
                .locator('[data-proposal-variable="client.firstName"]')
                .count(),
              1
            )

            const titleInput = page
              .getByRole('textbox', { name: 'Название варианта', exact: true })
              .first()
            const remove = page
              .getByRole('button', { name: 'Удалить вариант', exact: true })
              .first()
            const recommend = page
              .getByRole('checkbox', { name: 'Рекомендуем', exact: true })
              .first()
            const inputBox = await titleInput.boundingBox(),
              removeBox = await remove.boundingBox(),
              recommendBox = await recommend.boundingBox()
            assert.ok(
              removeBox.x >= inputBox.x + inputBox.width - 1,
              'Корзина справа от названия'
            )
            assert.ok(
              recommendBox.y >= inputBox.y + inputBox.height,
              'Рекомендация под названием'
            )
            const help = page
              .getByRole('button', {
                name: 'Подсказка: Список услуг варианта',
                exact: true,
              })
              .first()
            await help.click()
            await page.getByRole('tooltip').waitFor()
            assert.match(
              await page.getByRole('tooltip').innerText(),
              /Если в варианте одна услуга/
            )
            await help.press('Escape')
            await page.getByRole('tooltip').waitFor({ state: 'hidden' })
            await help.press('Enter')
            await page.getByRole('tooltip').waitFor()
            await help.press('Escape')
            await page.getByRole('tooltip').waitFor({ state: 'hidden' })
            assert.equal(saved, undefined, 'Подсказка не сохраняет форму')
            await page
              .getByRole('button', {
                name: 'Предпросмотр для клиента',
                exact: true,
              })
              .click()
            const preview = page.locator('main.proposal-page-view')
            await preview.getByText('Новая шапка', { exact: true }).waitFor()
            await preview
              .getByText('Вступление перед вариантами', { exact: true })
              .waitFor()
            assert.equal(
              await preview
                .getByText('Название единственной услуги', { exact: true })
                .count(),
              0
            )
            assert.equal(
              await preview
                .getByText('Описание одной услуги', { exact: true })
                .count(),
              1
            )
            assert.equal(
              await preview.getByText('Первая услуга', { exact: true }).count(),
              1
            )
            assert.equal(
              await preview.getByText('Вторая услуга', { exact: true }).count(),
              1
            )
            await preview
              .getByText('Общие условия и контакты', { exact: true })
              .waitFor()
            const formatted = preview.getByText('Новая шапка', { exact: true })
            const computed = await formatted.evaluate((element) => ({
              color: getComputedStyle(element).color,
              font: getComputedStyle(element).fontFamily,
              size: getComputedStyle(element).fontSize,
              align: getComputedStyle(element.parentElement).textAlign,
            }))
            assert.deepEqual(computed, {
              color: 'rgb(18, 58, 188)',
              font: 'Georgia',
              size: '24px',
              align: 'center',
            })
            if (kind === 'proposal') {
              const logo = preview.getByAltText('Логотип', { exact: true })
              assert.equal(
                await logo.evaluate(
                  (element) => getComputedStyle(element).backgroundColor
                ),
                'rgba(0, 0, 0, 0)'
              )
              await page.locator('.proposal-appearance summary').click()
              assert.equal(
                await page
                  .getByAltText('Логотип предложения')
                  .evaluate(
                    (element) => getComputedStyle(element).backgroundColor
                  ),
                'rgba(0, 0, 0, 0)'
              )
            }
            assert.equal(
              await page.evaluate(
                () => document.documentElement.scrollWidth <= innerWidth
              ),
              true
            )
            const suffix = `${kind}-${width}-${dark ? 'dark' : 'light'}`
            await page.screenshot({
              path: path.join(artifactDir, 'screenshots', `${suffix}.png`),
              fullPage: true,
            })
            // Сохранённый HTML именно отрендеренного UI с настоящим CSS, без запуска JS заново.
            await titleInput.scrollIntoViewIfNeeded()
            await page.screenshot({ path: path.join(artifactDir, 'screenshots', `${suffix}-packages.png`) })
            await preview.scrollIntoViewIfNeeded()
            await page.screenshot({ path: path.join(artifactDir, 'screenshots', `${suffix}-preview.png`) })
            const renderedHtml = await page.content()
            await fs.writeFile(
              path.join(artifactDir, 'html', `${suffix}.html`),
              renderedHtml
                .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(
                  '<link rel="stylesheet" href="/styles.css">',
                  `<style>${css}</style>`
                )
            )
            const saveResponse = page.waitForResponse(
              (response) =>
                response.request().method() === 'PATCH' &&
                response
                  .url()
                  .includes(
                    kind === 'proposal'
                      ? '/api/proposals/'
                      : '/api/proposal-templates/'
                  )
            )
            await page
              .getByRole('button', { name: 'Сохранить', exact: true })
              .click()
            await saveResponse
            await page.waitForFunction(() =>
              document.body.innerText.includes('Проверка редактора КП')
            )
            assert.ok(saved, 'Запрос сохранения выполнен')
            const savedBlocks = saved.blocks
            for (const value of [
              'inline.png',
              'inline.mp4',
              'client.firstName',
            ])
              assert.ok(
                savedBlocks
                  .find((block) => block.type === 'packagesIntro')
                  .contentHtml.includes(value),
                value
              )
            assert.match(
              savedBlocks.find((block) => block.type === 'header').contentHtml,
              /font-family: Georgia/
            )
            assert.match(
              savedBlocks.find((block) => block.type === 'packagesIntro')
                .contentHtml,
              /Вступление перед вариантами/
            )
            assert.deepEqual(
              kind === 'proposal' ? saved.packages : saved.defaults.packages,
              proposal.packages,
              'Редактор не удаляет единственную услугу из payload'
            )
            if (kind === 'proposal') {
              await page
                .getByRole('button', { name: 'Сохранить', exact: true })
                .waitFor({ state: 'hidden' })
              assert.equal(
                await page
                  .getByRole('button', { name: 'Сохранить', exact: true })
                  .count(),
                0
              )
              assert.equal((await first.innerText()).trim(), 'Новая шапка')
            }
            assert.deepEqual(errors, [])
            evidence.push({ suffix, computed, errors })
            await page.close()
          }
          const page = await browser.newPage({
            viewport: { width, height: 900 },
          })
          await page.route('https://cloud.escalion.ru/**', (route) =>
            route.fulfill({
              contentType: route.request().url().endsWith('.mp4')
                ? 'video/mp4'
                : 'image/png',
              headers: { 'Access-Control-Allow-Origin': '*' },
              body: route.request().url().endsWith('.mp4')
                ? inlineVideo
                : alphaPng,
            })
          )
          await page.goto(`${origin}/?kind=public`)
          await page.evaluate(
            (dark) => document.body.classList.toggle('theme-dark', dark),
            dark
          )
          const logo = page.getByAltText('Логотип', { exact: true })
          await logo.waitFor()
          assert.equal(
            await logo.evaluate(
              (element) => getComputedStyle(element).backgroundColor
            ),
            'rgba(0, 0, 0, 0)'
          )
          const alpha = await logo.evaluate(async (element) => {
            await element.decode()
            const canvas = document.createElement('canvas')
            canvas.width = 40
            canvas.height = 30
            const ctx = canvas.getContext('2d')
            const image = new Image()
            image.crossOrigin = 'anonymous'
            image.src = element.src
            await image.decode()
            ctx.drawImage(image, 0, 0)
            return ctx.getImageData(0, 0, 1, 1).data[3]
          })
          assert.equal(alpha, 0)
          assert.equal(
            await page
              .getByText('Название единственной услуги', { exact: true })
              .count(),
            0
          )
          assert.equal(
            await page
              .getByText('Описание одной услуги', { exact: true })
              .count(),
            1
          )
          assert.equal(
            await page.getByText('Первая услуга', { exact: true }).count(),
            1
          )
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth
            ),
            true
          )
          await page.screenshot({
            path: path.join(
              artifactDir,
              'screenshots',
              `public-${width}-${dark ? 'dark' : 'light'}.png`
            ),
            fullPage: true,
          })
          await page.close()
        }
      // Сводка из общего кэша: реальные observers и настоящие мутации списка.
      const page = await browser.newPage({
        viewport: { width: 390, height: 900 },
      })
      let release,
        fail = false,
        rows = [],
        gets = 0
      let gate = new Promise((resolve) => {
        release = resolve
      })
      await page.route('**/api/**', async (route) => {
        const url = new URL(route.request().url()).pathname
        if (url === '/api/events/event/proposals') {
          gets++
          await gate
          return route
            .fulfill({
              status: fail ? 500 : 200,
              json: fail
                ? { error: { message: 'Не удалось загрузить предложения' } }
                : { success: true, data: rows },
            })
            .catch(() => {})
        }
        return route.fulfill({
          json: {
            success: true,
            data: url === '/api/proposals/statuses' ? {} : [],
          },
        })
      })
      await page.goto(`${origin}/?kind=list`)
      const summary = page.locator('summary [aria-live="polite"]')
      const waitSummary = (expected) =>
        page.waitForFunction(
          (expected) =>
            document.querySelector('summary [aria-live="polite"]')
              ?.textContent === expected,
          expected
        )
      await waitSummary('Загружаем предложения…')
      release()
      await waitSummary('Предложений пока нет')
      const initialGets = gets
      await page.evaluate(async () => {
        await window.cacheEventProposal(window.queryClient, 'event', {
          _id: 'draft',
          status: 'draft',
        })
      })
      await waitSummary('Черновиков: 1')
      await page.evaluate(async () => {
        await window.cacheEventProposal(window.queryClient, 'event', {
          _id: 'draft',
          status: 'published',
        })
      })
      await waitSummary('Опубликовано: 1')
      await page.evaluate(async () => {
        await window.cacheEventProposal(window.queryClient, 'event', {
          _id: 'new',
          status: 'draft',
        })
      })
      await waitSummary('Черновиков: 1 · Опубликовано: 1')
      assert.equal(gets, initialGets, 'Изменение кэша не создаёт GET списка')
      gate = new Promise((resolve) => {
        release = resolve
      })
      rows = [{ _id: 'draft', status: 'published' }]
      await page.evaluate(() => {
        void window.queryClient.refetchQueries({
          queryKey: window.queryKeys.eventProposals('event'),
        })
      })
      await waitSummary('Черновиков: 1 · Опубликовано: 1 · Обновляем…')
      release()
      await waitSummary('Опубликовано: 1')
      gate = Promise.resolve()
      fail = true
      await page.evaluate(() => {
        void window.queryClient.refetchQueries({
          queryKey: window.queryKeys.eventProposals('event'),
        })
      })
      await waitSummary('Опубликовано: 1 · Не удалось обновить')
      fail = false
      rows = []
      await page.evaluate(() => {
        void window.queryClient.refetchQueries({
          queryKey: window.queryKeys.eventProposals('event'),
        })
      })
      await waitSummary('Предложений пока нет')
      await page.screenshot({
        path: path.join(artifactDir, 'screenshots', 'summary-cache.png'),
      })
      await page.close()
      const errorPage = await browser.newPage()
      await errorPage.route('**/api/**', (route) =>
        route.fulfill({
          status: route.request().url().includes('/events/') ? 500 : 200,
          json: {
            data: [],
            error: { message: 'Не удалось загрузить предложения' },
          },
        })
      )
      await errorPage.goto(`${origin}/?kind=list`)
      await errorPage.waitForFunction(
        () =>
          document.querySelector('summary [aria-live="polite"]')
            ?.textContent === 'Не удалось загрузить предложения'
      )
      await errorPage.close()
      await fs.writeFile(
        path.join(artifactDir, 'browser-evidence.json'),
        JSON.stringify(evidence, null, 2)
      )
    } finally {
      await browser.close()
      await new Promise((resolve) => server.close(resolve))
    }
  }
)
