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
  artistSnapshot: { fullName: 'Иван', phone: '+7 900 000 00 00', telegram: 'ivan', vk: 'id123', whatsapp: 79000000000 },
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
    const portraitPng = await sharp({ create: { width: 60, height: 100, channels: 3, background: '#ac7945' } }).png().toBuffer()
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
            await page.route('https://player.vimeo.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Vimeo test player</body></html>' }))
            await page.route('https://cloud.escalion.ru/**', (route) =>
              route.fulfill({
                contentType: route.request().url().endsWith('.mp4')
                  ? 'video/mp4'
                  : 'image/png',
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: route.request().url().endsWith('.mp4')
                  ? inlineVideo
                  : route.request().url().endsWith('gallery.png') ? portraitPng : alphaPng,
              })
            )
            await page.route('**/api/**', async (route) => {
              const req = route.request(),
                url = new URL(req.url()).pathname
              if (req.method() === 'POST' && url.endsWith('/logo')) {
                assert.match(req.headers()['content-type'], /multipart\/form-data; boundary=/)
                return route.fulfill({ json: { success: true, data: { url: logoUrl.replace('/proposals/', '/proposal-templates/') } } })
              }
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
            await closing.fill('Общие условия и контакты +7 900 000 00 00')
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
              Math.abs(removeBox.y + removeBox.height / 2 - inputBox.y - inputBox.height / 2) < 2,
              'Корзина выровнена по центру поля, без учёта подписи'
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
              .getByText('Общие условия и контакты +7 900 000 00 00', { exact: true })
              .waitFor()
            assert.equal(await preview.locator('a[href="tel:+79000000000"]').count(), 1)
            const socials = preview.getByRole('navigation', { name: 'Соцсети и мессенджеры' })
            assert.equal(await socials.getByRole('link').count(), 4)
            assert.equal(await socials.getByRole('link', { name: 'MAX', exact: true }).getAttribute('href'), 'https://max.ru/u/ivan')
            assert.equal(await socials.getByRole('link', { name: 'Telegram', exact: true }).getAttribute('href'), 'https://t.me/ivan')
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
            if (kind === 'template') {
              await page.locator('.proposal-appearance summary').click()
              await page.getByLabel('Файл логотипа', { exact: true }).setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: alphaPng })
              await preview.getByAltText('Логотип', { exact: true }).waitFor()
              assert.equal(await preview.getByAltText('Логотип', { exact: true }).getAttribute('src'), logoUrl.replace('/proposals/', '/proposal-templates/'))
            }
            // Общая галерея: загрузка, Vimeo, одинаковые кнопки и исходные пропорции.
            await page.locator('summary').filter({ hasText: 'Фото и видео (' }).click()
            const uploadButton = page.getByRole('button', { name: 'Загрузить фото или видео', exact: true })
            const linkButton = page.getByRole('button', { name: 'Добавить видео-ссылку', exact: true })
            assert.equal(await uploadButton.getAttribute('class'), await linkButton.getAttribute('class'))
            await page.getByLabel('Фото или видео', { exact: true }).setInputFiles({ name: 'gallery.png', mimeType: 'image/png', buffer: alphaPng })
            await page.locator('summary').filter({ hasText: 'Фото и видео (1/10)' }).waitFor()
            await page.evaluate(value => { window.prompt = () => value }, 'https://vimeo.com/123456789/abc')
            await linkButton.click()
            await page.locator('summary').filter({ hasText: 'Фото и видео (2/10)' }).waitFor()
            const photo = preview.getByAltText('gallery.png', { exact: true })
            await photo.waitFor()
            await photo.evaluate(image => image.decode())
            const geometry = await photo.evaluate(image => ({
              ratio: image.getBoundingClientRect().width / image.getBoundingClientRect().height,
              natural: image.naturalWidth / image.naturalHeight,
              fit: getComputedStyle(image).objectFit,
            }))
            assert.ok(Math.abs(geometry.ratio - geometry.natural) < 0.02)
            assert.equal(geometry.fit, 'contain')
            assert.equal(await preview.locator('a[href="https://vimeo.com/123456789/abc"]').count(), 1)
            const player = preview.locator('iframe[title="Vimeo: Видео"]')
            assert.equal(await player.getAttribute('src'), 'https://player.vimeo.com/video/123456789?h=abc')
            assert.equal(await player.getAttribute('referrerpolicy'), 'strict-origin')
            await player.scrollIntoViewIfNeeded()
            await player.contentFrame().getByText('Vimeo test player').waitFor()
            const playerBox = await player.boundingBox()
            assert.ok(Math.abs(playerBox.width / playerBox.height - 16 / 9) < 0.02)

            await page.evaluate(value => { window.prompt = () => value }, 'https://vimeo.com.evil.test/123')
            await linkButton.click()
            await page.getByText('Укажите корректную http(s)-ссылку на VK Video, Rutube, YouTube или Vimeo').waitFor()
            assert.equal(await page.locator('summary').filter({ hasText: 'Фото и видео (2/10)' }).count(), 1)
            for (let index = 2; index < 10; index++) {
              await page.evaluate(value => { window.prompt = () => value }, `https://vimeo.com/${123456789 + index}`)
            await linkButton.click()
            }
            assert.equal(await uploadButton.isDisabled(), true)
            assert.equal(await linkButton.isDisabled(), true)
            await page.getByRole('button', { name: 'Удалить «Видео»', exact: true }).last().click()
            assert.equal(await uploadButton.isDisabled(), false)
            assert.equal(await linkButton.isDisabled(), false)
            // Оставляем только фото и первую ссылку для компактного снимка.
            for (let index = 9; index > 2; index--) {
              await page.getByRole('button', { name: 'Удалить «Видео»', exact: true }).last().click()
            }
            const upPhoto = page.getByRole('button', { name: 'Переместить вверх «gallery.png»', exact: true })
            const downPhoto = page.getByRole('button', { name: 'Переместить вниз «gallery.png»', exact: true })
            const downVideo = page.getByRole('button', { name: 'Переместить вниз «Видео»', exact: true })
            assert.equal(await upPhoto.isDisabled(), true)
            assert.equal(await downVideo.isDisabled(), true)
            await downPhoto.click()
            assert.equal(await downPhoto.isDisabled(), true)
            assert.equal(await upPhoto.isDisabled(), false)
            const mediaOrder = () => preview.locator('a[href="https://vimeo.com/123456789/abc"]').evaluate(link =>
              Array.from(link.parentElement.parentElement.children).map(item => item.tagName))
            assert.deepEqual(await mediaOrder(), ['DIV', 'IMG'])
            await upPhoto.focus()
            await upPhoto.press('Enter')
            assert.deepEqual(await mediaOrder(), ['IMG', 'DIV'])
            await page.getByRole('button', { name: 'Переместить вверх «Видео»', exact: true }).click()
            assert.deepEqual(await mediaOrder(), ['DIV', 'IMG'])
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
            const suffix = `${kind}-${width}-${dark ? 'dark' : 'light'}`
            await photo.scrollIntoViewIfNeeded()
            await page.screenshot({ path: path.join(artifactDir, 'screenshots', `${suffix}-photo.png`) })
            await uploadButton.scrollIntoViewIfNeeded()
            await page.screenshot({ path: path.join(artifactDir, 'screenshots', `${suffix}-media.png`) })

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
            assert.equal(saved.media[0].url, 'https://vimeo.com/123456789/abc')
            assert.equal(saved.media[1].title, 'gallery.png')
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
          // An old offer has no social fields; the API supplies current profile links separately.
          await page.evaluate(() => window.showPublicProposal({ ...window.fixtureProposal,
            artistSnapshot: { fullName: 'Иван', phone: '+7 900 000 00 00' },
            socialContacts: { telegram: 'live_profile', max: 'https://max.ru/u/live' },
          }))
          const currentSocials = page.getByRole('navigation', { name: 'Соцсети и мессенджеры' })
          await currentSocials.waitFor()
          assert.equal(await currentSocials.getByRole('link', { name: 'Telegram', exact: true }).getAttribute('href'), 'https://t.me/live_profile')
          assert.equal(await currentSocials.getByRole('link', { name: 'MAX', exact: true }).getAttribute('href'), 'https://max.ru/u/live')
          await page.evaluate(() => window.showPublicProposal({ ...window.fixtureProposal, socialContacts: {} }))
          await currentSocials.waitFor({ state: 'hidden' })
          const publicErrors = []
          page.on('pageerror', error => publicErrors.push(error.message))
          page.on('console', message => { if (message.type() === 'error') publicErrors.push(message.text()) })
          const providerMedia = [
            { id: 'yt', kind: 'video_link', title: 'YouTube', url: 'https://youtu.be/M7lc1UVf-VE' },
            { id: 'vm', kind: 'video_link', title: 'Vimeo', url: 'https://vimeo.com/123456789/abc' },
            { id: 'rt', kind: 'video_link', title: 'Rutube', url: 'https://rutube.ru/video/' + 'a'.repeat(32) + '/' },
            { id: 'vk', kind: 'video_link', title: 'VK', url: 'https://vkvideo.ru/video-123_456' },
            { id: 'fallback', kind: 'video_link', title: 'Канал', url: 'https://vimeo.com/channels/staffpicks' },
          ]
          for (const host of ['www.youtube.com', 'player.vimeo.com', 'rutube.ru', 'vk.com']) {
            await page.route(`https://${host}/**`, route => route.fulfill({ contentType: 'text/html', body: '<html><body>Provider test player</body></html>' }))
          }
          await page.evaluate(media => window.showPublicProposal({ ...window.fixtureProposal, mediaSnapshot: media }), providerMedia)
          const frames = page.locator('main.proposal-page-view iframe')
          await frames.first().waitFor()
          assert.equal(await frames.count(), 4)
          for (let index = 0; index < 4; index++) {
            const frame = frames.nth(index)
            await frame.scrollIntoViewIfNeeded()
            await frame.contentFrame().getByText('Provider test player').waitFor()
            assert.equal(await frame.getAttribute('referrerpolicy'), 'strict-origin')
            assert.equal(await frame.getAttribute('allowfullscreen'), '')
            const box = await frame.boundingBox()
            assert.ok(Math.abs(box.width / box.height - 16 / 9) < 0.02)
          }
          assert.equal(await page.getByRole('link', { name: 'Открыть видео на сайте', exact: true }).count(), 1)
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
          assert.deepEqual(publicErrors, [])
          await frames.first().scrollIntoViewIfNeeded()
          await page.screenshot({ path: path.join(artifactDir, 'screenshots', `players-${width}-${dark ? 'dark' : 'light'}.png`) })
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
      // Regression: opening an existing published offer must never persist a copy.
      for (const width of [390, 1365]) for (const dark of [false, true]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } })
        const source = { ...structuredClone(proposal), status: 'published' }
        let rows = [source], writes = [], rejectSave = false
        const errors = []
        page.on('pageerror', error => errors.push(error.message))
        await page.route('**/api/**', async route => {
          const req = route.request(), url = new URL(req.url()).pathname
          if (req.method() === 'POST' && url === '/api/events/event/proposals') {
            const body = req.postDataJSON()
            writes.push({ method: 'POST', body })
            if (rejectSave) return route.fulfill({ status: 400, json: { success: false, error: { message: 'Проверка ошибки сохранения' } } })
            const created = { ...source, ...body, _id: 'new-version', status: 'draft', version: 2, blocksSnapshot: body.blocks, mediaSnapshot: body.media }
            rows = [created, source]
            return route.fulfill({ status: 201, json: { success: true, data: created } })
          }
          if (req.method() === 'PATCH') {
            const body = req.postDataJSON()
            writes.push({ method: 'PATCH', url, body })
            rows[0] = { ...rows[0], ...body, blocksSnapshot: body.blocks, mediaSnapshot: body.media }
            return route.fulfill({ json: { success: true, data: rows[0] } })
          }
          const data = url === '/api/events/event/proposals' ? rows : url === `/api/proposals/${proposalId}` ? source : url === '/api/proposals/new-version' ? rows[0] : []
          return route.fulfill({ json: { success: true, data } })
        })
        await page.goto(`${origin}/?kind=list`)
        await page.evaluate(dark => document.body.classList.toggle('theme-dark', dark), dark)
        await page.getByText('Опубликовано: 1', { exact: true }).waitFor()
        await page.locator('summary').filter({ hasText: 'Коммерческие предложения' }).click()
        const edit = () => page.getByRole('button', { name: 'Редактировать в новой версии', exact: true }).click()
        const close = async () => {
          await page.getByRole('button', { name: 'Закрыть', exact: true }).click()
          await page.getByRole('region', { name: 'Редактор КП', exact: true }).waitFor({ state: 'hidden' })
        }
        await edit()
        await page.getByText('Новая версия · не сохранена', { exact: true }).waitFor()
        assert.equal(await page.getByRole('button', { name: 'Сохранить', exact: true }).count(), 0)
        await close()
        assert.equal(writes.length, 0)
        assert.equal(await page.locator('.proposal-list-item').count(), 1)
        // Discard actual local edits as well.
        await edit()
        await page.getByRole('region', { name: 'Редактор КП', exact: true }).locator('input[type="text"]').first().fill('Не сохранять')
        await close()
        assert.equal(writes.length, 0)
        assert.equal(rows.length, 1)
        assert.equal(await page.evaluate(() => window.confirmations), 1)
        await edit()
        await page.getByRole('region', { name: 'Редактор КП', exact: true }).locator('input[type="text"]').first().fill('Новые условия')
        rejectSave = true
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
        await page.getByText('Проверка ошибки сохранения', { exact: true }).waitFor()
        assert.equal(rows.length, 1)
        assert.equal(await page.getByRole('region', { name: 'Редактор КП', exact: true }).locator('input[type="text"]').first().inputValue(), 'Новые условия')
        rejectSave = false
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
        await page.getByText('Черновик версии 2', { exact: true }).waitFor()
        assert.equal(rows.length, 2)
        assert.equal(rows[1].title, proposal.title)
        assert.equal(writes.at(-1).body.sourceProposalId, proposalId)
        await page.getByRole('region', { name: 'Редактор КП', exact: true }).locator('input[type="text"]').first().fill('Уточнённые условия')
        await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
        await page.getByRole('button', { name: 'Сохранить', exact: true }).waitFor({ state: 'hidden' })
        assert.equal(writes.at(-1).method, 'PATCH')
        assert.equal(writes.at(-1).url, '/api/proposals/new-version')
        await close()
        assert.equal(await page.locator('.proposal-list-item').count(), 2)
        await page.getByRole('button', { name: 'Редактировать', exact: true }).click()
        await page.getByText('Черновик версии 2', { exact: true }).waitFor()
        const before = writes.length
        await close()
        assert.equal(writes.length, before)
        assert.deepEqual(errors, [])
        await page.screenshot({ path: path.join(artifactDir, 'screenshots', `no-duplicate-${width}-${dark ? 'dark' : 'light'}.png`) })
        await page.close()
      }
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
