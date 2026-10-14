const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const root = path.resolve(__dirname, '../..')
const playwright = require('/home/aleksei/projects/ux-ui-agent-skills/node_modules/playwright')
let esbuild
let browser, buildDocument
async function chromePath() {
  for (const dir of (await fs.readdir('/home/aleksei/.cache/ms-playwright'))
    .sort()
    .reverse()) {
    if (!dir.startsWith('chromium-')) continue
    for (const suffix of [
      'chrome-linux-arm64/chrome',
      'chrome-linux64/chrome',
      'chrome-linux/chrome',
    ]) {
      const p = `/home/aleksei/.cache/ms-playwright/${dir}/${suffix}`
      try {
        await fs.access(p)
        return p
      } catch {}
    }
  }
  throw Error('Chromium отсутствует')
}
test.before(async () => {
  const source = `${root}/mobile/src/features/proposals/localDocument.ts`
  try {
    await fs.access(source)
  } catch {
    return
  }
  esbuild = require(`${root}/mobile/node_modules/esbuild`)
  const result = await esbuild.build({
    entryPoints: [source],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(
    require,
    mod,
    mod.exports
  )
  buildDocument = mod.exports.buildLocalDocument
  browser = await playwright.chromium.launch({
    executablePath: await chromePath(),
    headless: true,
    args: ['--no-sandbox'],
  })
})
test.after(async () => {
  await browser?.close()
})
for (const width of [360, 390, 420])
  for (const mode of ['light', 'dark'])
    test(`visual richtext roundtrip ${width}/${mode}: edits preserve safe image/video; hostile scripts blocked`, async () => {
      assert.equal(
        typeof buildDocument,
        'function',
        'Безопасный локальный visual editor отсутствует'
      )
      const page = await browser.newPage({ viewport: { width, height: 580 } })
      await page.route('**/*', (route) => route.abort())
      await page.setContent('<html></html>')
      await page.evaluate(() => {
        window.messages = []
        window.ReactNativeWebView = {
          postMessage: (message) => window.messages.push(JSON.parse(message)),
        }
      })
      const html =
        '<p>До <strong>выделения</strong></p><img src="https://cloud.escalion.ru/uploads/test.png" alt="Фото"><video src="https://cloud.escalion.ru/uploads/test.mp4" controls playsinline></video><p>После</p><script>window.attacked=1</script><img src="data:image/png;base64,AAAA" onerror="window.attacked=2"><video src="javascript:alert(1)"></video><a href="javascript:alert(1)">Ссылка</a>'
      await page.setContent(
        buildDocument({ mode: 'editor', value: html, theme: mode })
      )
      await page.waitForSelector('[contenteditable="true"]')
      assert.equal(await page.evaluate(() => window.attacked), undefined)
      assert.equal(await page.locator('img').count(), 1)
      assert.equal(await page.locator('video').count(), 1)
      await page.locator('[contenteditable="true"]').press('End')
      await page.keyboard.type(' Новое')
      const result = await page.evaluate(
        () => window.messages.filter((m) => m.type === 'change').at(-1)?.html
      )
      assert.match(result, /Новое/)
      assert.match(result, /test\.png/)
      assert.match(result, /test\.mp4/)
      assert.doesNotMatch(result, /onerror|javascript:|data:image|<script/i)
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        ),
        true
      )
      await page.screenshot({
        path: `/home/aleksei/reports/vedelo/2026-10-11/update/C/richtext-${width}-${mode}.png`,
      })
      await page.close()
    })
test('local preview renders actual ProposalPageView without selection writes', async () => {
  assert.equal(
    typeof buildDocument,
    'function',
    'Локальный публичный renderer отсутствует'
  )
  const page = await browser.newPage({ viewport: { width: 390, height: 580 } })
  await page.route('**/*', (route) => route.abort())
  await page.setContent(
    buildDocument({
      mode: 'preview',
      data: {
        title: 'Клиентский заголовок',
        appearance: { theme: 'blue' },
        blocks: [
          { type: 'packages', title: 'Варианты' },
          {
            type: 'intro',
            title: 'Здравствуйте',
            contentHtml: '<p>Привет</p>',
          },
        ],
        packages: [
          {
            id: 'main',
            title: 'Реальный вариант',
            description: 'Описание',
            lines: [
              { title: 'Своя позиция', description: 'Снимок', price: 123 },
            ],
            total: 123,
            recommended: true,
          },
        ],
        media: [],
        client: { firstName: 'Анна' },
        artist: { fullName: 'Исполнитель' },
        selectedPackageId: 'main',
        expired: false,
      },
    })
  )
  await page.getByText('Реальный вариант', { exact: true }).waitFor()
  assert.equal(await page.locator('main.proposal-page-view').count(), 1)
  assert.equal(
    await page
      .getByRole('button', { name: 'Вы выбрали этот вариант' })
      .isDisabled(),
    true
  )
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    ),
    true
  )
  await page.screenshot({
    path: '/home/aleksei/reports/vedelo/2026-10-11/update/C/public-preview.png',
  })
  await page.close()
})
test('local editor read-only command prevents edits while a native operation runs', async () => {
  const page = await browser.newPage()
  await page.setContent(
    buildDocument({ mode: 'editor', value: '<p>Сохранить</p>', key: 'guard' })
  )
  await page.waitForSelector('[contenteditable="true"]')
  await page.evaluate(() =>
    window.vedeloEditor({ type: 'setEditable', editable: false })
  )
  assert.equal(
    await page.locator('[role="textbox"]').getAttribute('contenteditable'),
    'false'
  )
  assert.equal(
    await page
      .getByRole('button', { name: 'Жирный', exact: true })
      .isDisabled(),
    true
  )
  await page.evaluate(() =>
    window.vedeloEditor({ type: 'setEditable', editable: true })
  )
  assert.equal(
    await page.locator('[role="textbox"]').getAttribute('contenteditable'),
    'true'
  )
  await page.close()
})
test('visual bold/italic toolbar persists canonical strong/em tags through the original sanitizer', async () => {
  const p = await browser.newPage()
  await p.setContent('<html></html>')
  await p.evaluate(() => {
    window.messages = []
    window.ReactNativeWebView = {
      postMessage: (raw) => window.messages.push(JSON.parse(raw)),
    }
  })
  await p.setContent(
    buildDocument({ mode: 'editor', value: '<p>Форматировать</p>' })
  )
  await p.waitForSelector('[contenteditable="true"]')
  await p.evaluate(() => {
    const editor = document.querySelector('[contenteditable]')
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor.querySelector('p'))
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })
  await p.getByRole('button', { name: 'Жирный', exact: true }).click()
  assert.match(
    await p.evaluate(
      () => window.messages.filter((m) => m.type === 'change').at(-1).html
    ),
    /<strong>Форматировать<\/strong>/
  )
  await p.getByRole('button', { name: 'Курсив', exact: true }).click()
  assert.match(
    await p.evaluate(
      () => window.messages.filter((m) => m.type === 'change').at(-1).html
    ),
    /<em>/
  )
  await p.close()
})
