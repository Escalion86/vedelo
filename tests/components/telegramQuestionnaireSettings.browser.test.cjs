const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const test = require('node:test')

const esbuildModule = process.env.ESBUILD_MODULE
const playwrightModule = process.env.PLAYWRIGHT_MODULE
const canRun = Boolean(esbuildModule && playwrightModule)
const endpoint = '/api/integrations/telegram/questionnaire'
const starter = {
  revision: 0,
  enabled: false,
  useTelegramGreeting: false,
  welcomeText: '',
  questions: {
    service: { text: 'Какая услуга нужна?', options: [] },
    date: { text: 'Когда планируется мероприятие?' },
    city: { text: 'В каком городе?', options: [] },
    details: { text: 'Есть ли пожелания?' },
  },
  media: [{ type: 'photo', url: 'https://example.test/old.png' }],
}

test('Настройки автоответчика Telegram на узком экране и desktop', {
  timeout: 120_000,
  skip: !canRun && 'Задайте ESBUILD_MODULE и PLAYWRIGHT_MODULE',
}, async () => {
  const { chromium } = require(playwrightModule)
  const { build } = require(esbuildModule)
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'jsx',
      contents: `
        import { createRoot } from 'react-dom/client';
        import { SnackbarProvider } from 'notistack';
        import TelegramQuestionnaireSettings from './components/TelegramQuestionnaireSettings';
        createRoot(document.getElementById('root')).render(
          <SnackbarProvider><main className="cabinet-canvas mx-auto max-w-4xl p-4">
            <h1>Интеграции</h1>
            <TelegramQuestionnaireSettings connected />
          </main></SnackbarProvider>,
        );
      `,
    },
    bundle: true,
    write: false,
    jsx: 'automatic',
    loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'vedelo-aliases',
      setup(builder) {
        builder.onResolve({ filter: /^@(components|helpers)\// }, ({ path: name }) => ({
          path: path.resolve(name.slice(1) + (path.extname(name) ? '' : '.js')),
        }))
      },
    }],
  })
  const cssPath = path.resolve('app/globals.css')
  const css = (await require('postcss')([require('@tailwindcss/postcss')()])
    .process(await fs.readFile(cssPath, 'utf8'), { from: cssPath })).css
  const html = `<!doctype html><html lang="ru"><head><title>Интеграции</title><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script>${result.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body></html>`
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(html)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH })
    const url = `http://127.0.0.1:${server.address().port}/integrations`
    for (const { width, dark } of [{ width: 390, dark: true }, { width: 1365, dark: false }]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } })
      page.setDefaultTimeout(12_000)
      const errors = []
      const uploads = []
      const patches = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('409')) errors.push(message.text())
      })

      let questionnaire = structuredClone(starter)
      const attachment = { id: 'uploaded-1', type: 'photo', name: 'обложка.png' }
      await page.route(`**${endpoint}**`, async (route) => {
        const request = route.request()
        if (request.method() === 'POST') {
          uploads.push(request.postData())
          questionnaire = { ...questionnaire, revision: 1, media: [...questionnaire.media, attachment] }
          return route.fulfill({ json: { questionnaire, attachment } })
        }
        if (request.method() === 'PATCH') {
          patches.push(request.postDataJSON())
          if (patches.length === 1) {
            return route.fulfill({ status: 409, json: { error: { message: 'Сохранение временно недоступно' } } })
          }
          questionnaire = { ...patches.at(-1), revision: 2 }
        }
        return route.fulfill({ json: { questionnaire } })
      })

      await page.goto(url)
      await page.evaluate((enabled) => document.body.classList.toggle('theme-dark', enabled), dark)
      assert.equal(await page.title(), 'Интеграции')
      const enabled = page.getByRole('checkbox', { name: 'Включить автоответчик' })
      const telegramGreeting = page.getByRole('checkbox', { name: 'Приветствие уже настроено в Telegram' })
      const greeting = page.getByRole('textbox', { name: 'Текст приветствия бота' })
      const serviceText = page.getByRole('textbox', { name: 'Услуга — текст вопроса' })
      await enabled.focus()
      await enabled.press('Space')
      assert.equal(await enabled.isChecked(), true)
      await greeting.fill('Здравствуйте!')
      await telegramGreeting.check()
      await greeting.waitFor({ state: 'detached' })
      await page.getByText(/добавит отдельное сообщение/).waitFor()
      await serviceText.fill('Какой формат услуги выберете?')
      await page.getByRole('textbox', { name: 'Услуга — варианты ответов' }).fill('Ведущий\nФотограф')
      await page.getByRole('button', { name: 'Убрать из отправки фото 1' }).click()

      const openedChooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Загрузить фото' }).click()
      const chooser = await openedChooser
      await chooser.setFiles({ name: 'обложка.png', mimeType: 'image/png', buffer: Buffer.from('файл для подменённого API') })
      await page.getByText('обложка.png').waitFor()
      assert.equal(await serviceText.inputValue(), 'Какой формат услуги выберете?')
      assert.match(uploads[0], /name="revision"\r\n\r\n0/)
      assert.match(uploads[0], /name="type"\r\n\r\nphoto/)

      await page.getByRole('button', { name: 'Добавить по ссылке' }).click()
      const link = page.getByRole('textbox', { name: 'Прямая HTTPS-ссылка на файл' })
      const addLink = page.getByRole('button', { name: 'Добавить ссылку' })
      await page.getByRole('combobox', { name: 'Тип файла' }).selectOption('video')
      await link.fill('http://example.test/video.mp4')
      await addLink.click()
      await page.getByText('Укажите прямую HTTPS-ссылку на файл.').waitFor()
      const video = { type: 'video', url: 'https://example.test/video.mp4' }
      await link.fill(video.url)
      await addLink.click()
      await page.getByText(video.url).waitFor()

      const save = page.getByRole('button', { name: 'Сохранить автоответчик' })
      await save.click()
      await page.getByText('Сохранение временно недоступно').waitFor()
      assert.equal(await enabled.isChecked(), true)
      assert.equal(await telegramGreeting.isChecked(), true)
      assert.equal(await serviceText.inputValue(), 'Какой формат услуги выберете?')
      await save.click()
      await page.getByText('Настройки автоответчика сохранены').waitFor()
      assert.equal(patches.length, 2)
      assert.equal(patches[1].revision, 1)
      assert.equal(patches[1].welcomeText, 'Здравствуйте!')
      assert.equal(patches[1].useTelegramGreeting, true)
      assert.deepEqual(patches[1].questions.service.options, ['Ведущий', 'Фотограф'])
      assert.deepEqual(patches[1].media, [attachment, video])
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert.deepEqual(errors, [])
      if (process.env.QA_SCREENSHOT_DIR) {
        await fs.mkdir(process.env.QA_SCREENSHOT_DIR, { recursive: true })
        await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, `telegram-questionnaire-${width}.png`), fullPage: true })
      }
      console.log(`Проверено ${width}px, ${dark ? 'тёмная' : 'светлая'} тема`)
      await page.close()
    }
  } finally {
    await browser?.close()
    await new Promise((resolve) => server.close(resolve))
  }
})
