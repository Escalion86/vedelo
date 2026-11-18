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
  schemaVersion: 2,
  revision: 0,
  mode: 'off',
  useTelegramGreeting: false,
  welcomeText: '',
  blocks: [
    { id: 'kind', type: 'eventType', text: 'Какая услуга нужна?', required: true, options: [{ id: 'host', label: 'Ведущий' }, { id: 'photo', label: 'Фотограф' }] },
    { id: 'info', type: 'message', text: 'Посмотрите примеры работ', required: false, options: [], condition: { blockId: 'kind', optionId: 'host', operator: 'notEquals' }, mediaIds: ['photo:https://example.test/old.png'] },
  ],
  media: [{ type: 'photo', url: 'https://example.test/old.png' }],
  testChatIds: [],
}
const chats = [
  { id: 'chat-a', name: 'Виктор Петров', username: 'vp', phone: '79999999901' },
  { id: 'chat-b', name: 'Вера Быкова', username: 'vb', phone: '79999999902' },
]

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
        import AppSnackbarProvider from './components/AppSnackbarProvider';
        import TelegramQuestionnaireSettings from './components/TelegramQuestionnaireSettings';
        createRoot(document.getElementById('root')).render(
          <AppSnackbarProvider><main className="cabinet-canvas mx-auto max-w-4xl p-4">
            <h1>Интеграции</h1>
            <TelegramQuestionnaireSettings connected />
          </main></AppSnackbarProvider>,
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
      const starts = []
      const runs = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('409')) errors.push(message.text())
      })

      let questionnaire = structuredClone(starter)
      const attachment = { id: 'uploaded-1', type: 'photo', name: 'обложка.png' }
      await page.route(`**${endpoint}**`, async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        if (url.pathname.endsWith('/test')) {
          if (request.method() === 'POST') {
            const data = request.postDataJSON()
            starts.push(data)
            const run = { ...data, runId: `run-${starts.length}`, status: 'waiting' }
            runs.push(run)
            return route.fulfill({ json: { run } })
          }
          const search = url.searchParams.get('q').toLowerCase()
          const found = chats.filter((chat) => `${chat.name} ${chat.phone}`.toLowerCase().includes(search))
          return route.fulfill({ json: { chats: found, runs, services: [{ id: 'event-host', name: 'Ведение мероприятия' }] } })
        }
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
      const dismissToast = async (message) => {
        await page.getByText(message).waitFor()
        await page.getByRole('button', { name: 'Закрыть уведомление' }).last().click()
      }
      const mode = page.getByRole('combobox', { name: 'Режим автоответчика' })
      const telegramGreeting = page.getByRole('checkbox', { name: 'Приветствие уже настроено в Telegram' })
      const greeting = page.getByRole('textbox', { name: 'Текст приветствия бота' })
      const serviceText = page.getByRole('textbox', { name: 'Тип заказа — текст вопроса' })
      await mode.selectOption('test')
      await greeting.fill('Здравствуйте!')
      await telegramGreeting.focus()
      await telegramGreeting.press('Space')
      await greeting.waitFor({ state: 'detached' })
      await page.getByText(/добавит отдельное сообщение/).waitFor()
      await page.getByRole('button', { name: /^Тип заказа/ }).click()
      await serviceText.fill('Какой формат услуги выберете?')

      const addBlock = async (type) => {
        await page.getByRole('combobox', { name: 'Новый блок' }).selectOption(type)
        await page.getByRole('button', { name: 'Добавить блок' }).click()
      }
      await addBlock('question')
      await serviceText.waitFor({ state: 'detached' })
      await page.getByRole('textbox', { name: 'Подпись в комментарии' }).fill('Формат программы')
      await page.getByRole('textbox', { name: 'Свой вопрос — текст вопроса' }).fill('Какую программу хотите?')
      await page.getByRole('combobox', { name: 'Вопрос для условия' }).selectOption('kind')
      const raise = page.getByRole('button', { name: 'Поднять блок «Формат программы»' })
      await raise.click()
      assert.equal(await raise.isDisabled(), true)

      await addBlock('services')
      await page.getByRole('combobox', { name: 'Услуга из каталога' }).selectOption('event-host')
      await page.getByRole('button', { name: 'Добавить услугу' }).click()
      await addBlock('ai')
      await page.getByRole('textbox', { name: 'Темы для уточнения' }).fill('Продолжительность и формат программы')
      await page.getByRole('button', { name: 'Удалить блок «Уточнение с ИИ»' }).click()
      await page.getByRole('button', { name: 'Убрать блок' }).click()

      await page.getByRole('button', { name: 'Убрать из отправки фото 1' }).click()

      const openedChooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: 'Загрузить фото' }).click()
      const chooser = await openedChooser
      await chooser.setFiles({ name: 'обложка.png', mimeType: 'image/png', buffer: Buffer.from('файл для подменённого API') })
      await page.getByText('обложка.png').waitFor()
      await dismissToast('Файл загружен')
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

      await page.getByRole('button', { name: /^Сообщение или медиа/ }).click()
      await page.getByRole('checkbox', { name: 'обложка.png' }).check()
      await page.getByRole('checkbox', { name: video.url }).check()
      await page.getByRole('button', { name: 'Предпросмотр', exact: true }).click()
      const preview = page.getByRole('region', { name: 'Предпросмотр сценария' })
      const previewAnswer = preview.getByRole('combobox', { name: 'Тип заказа — ответ клиента' })
      await previewAnswer.selectOption('host')
      await preview.getByText('Какую программу хотите?').waitFor()
      assert.equal(await preview.getByText('Посмотрите примеры работ').count(), 0)
      await previewAnswer.selectOption('photo')
      await preview.getByText('Посмотрите примеры работ').waitFor()
      await preview.getByText(`Видео · ${video.url}`).waitFor()
      assert.equal(await preview.getByText('Какую программу хотите?').count(), 0)
      await previewAnswer.selectOption('!other')
      await preview.getByText('Посмотрите примеры работ').waitFor()
      await page.getByRole('button', { name: 'Закрыть предпросмотр' }).click()

      const search = page.getByRole('textbox', { name: 'Поиск по имени или телефону' })
      await search.fill('Петров')
      await page.getByRole('checkbox', { name: /Виктор Петров/ }).check()
      await search.fill('79999999902')
      await page.getByRole('checkbox', { name: /Вера Быкова/ }).check()
      const start = page.getByRole('button', { name: 'Запустить тест — Виктор Петров' })
      assert.equal(await start.isDisabled(), true)

      const save = page.getByRole('button', { name: 'Сохранить сценарий' })
      await save.click()
      await dismissToast('Сохранение временно недоступно')
      assert.equal(await mode.inputValue(), 'test')
      assert.equal(await telegramGreeting.isChecked(), true)
      await save.click()
      await dismissToast('Настройки автоответчика сохранены')
      assert.equal(patches.length, 2)
      assert.equal(patches[1].revision, 1)
      assert.equal(patches[1].welcomeText, 'Здравствуйте!')
      assert.equal(patches[1].useTelegramGreeting, true)
      assert.equal(patches[1].blocks[0].text, 'Какой формат услуги выберете?')
      assert.equal(patches[1].blocks[1].label, 'Формат программы')
      assert.deepEqual(patches[1].blocks[1].condition, { blockId: 'kind', operator: 'equals', optionId: 'host' })
      assert.deepEqual(patches[1].blocks[2].mediaIds, [attachment.id, `video:${video.url}`])
      assert.equal(patches[1].blocks[3].options[0].serviceId, 'event-host')
      assert.deepEqual(patches[1].media, [attachment, video])
      assert.deepEqual(patches[1].testChatIds, ['chat-a', 'chat-b'])

      await page.getByRole('checkbox', { name: 'Сохранить черновик в CRM по итогам теста' }).check()
      await start.click()
      await page.getByText('Ждём сообщение «Начать тест»').waitFor()
      await dismissToast('Тест готов.')
      assert.deepEqual(starts, [{ chatId: 'chat-a', createDraft: true }])
      runs[0].status = 'completed'
      runs[0].result = { eventType: 'Ведущий', description: 'Формат программы: Вечерний', draftId: 'preview-id' }
      await page.getByRole('button', { name: 'Обновить результаты' }).click()
      await page.getByRole('button', { name: 'Результат', exact: true }).click()
      await page.getByText('Формат программы: Вечерний').waitFor()
      assert.equal(await page.getByRole('link', { name: 'Открыть тестовую заявку' }).getAttribute('href'), '/cabinet/eventsUpcoming?openEvent=preview-id')
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
