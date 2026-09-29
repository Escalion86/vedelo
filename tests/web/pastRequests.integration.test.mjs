import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
const waitForPort = async (port, child) => {
  for (let i = 0; i < 160; i++) {
    assert.equal(child.exitCode, null, 'Процесс должен работать')
    if (
      await new Promise((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port })
        socket.on('connect', () => {
          socket.destroy()
          resolve(true)
        })
        socket.on('error', () => resolve(false))
      })
    )
      return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Сервер не запустился')
}
const stop = async (child) => {
  if (!child || child.exitCode !== null) return
  const stopped = once(child, 'exit')
  child.kill()
  await stopped
}

test(
  'прошедшие заявки: tenant API и действия Web/PWA',
  { timeout: 240_000 },
  async (t) => {
    const folder = await mkdtemp(
      path.join(os.tmpdir(), 'vedelo-past-requests-')
    )
    const mongoPort = await freePort()
    const appPort = await freePort()
    const baseUrl = `http://127.0.0.1:${appPort}`
    const mongoUri = `mongodb://127.0.0.1:${mongoPort}/past_requests`
    const mongo = spawn(
      process.env.MONGOD_BINARY || 'mongod',
      [
        '--port',
        String(mongoPort),
        '--bind_ip',
        '127.0.0.1',
        '--dbpath',
        folder,
      ],
      { windowsHide: true, stdio: 'ignore' }
    )
    let app, db, browser
    try {
      await waitForPort(mongoPort, mongo)
      db = await mongoose.createConnection(mongoUri).asPromise()
      const tenantId = new mongoose.Types.ObjectId()
      const foreignTenant = new mongoose.Types.ObjectId()
      const tariffId = new mongoose.Types.ObjectId()
      const clientId = new mongoose.Types.ObjectId()
      const password = 'Past-requests-test-123'
      await db.collection('tariffs').insertOne({
        _id: tariffId,
        title: 'QA',
        eventsPerMonth: 100,
        allowPastRequests: true,
        allowDocuments: true,
        allowStatistics: true,
      })
      await db.collection('users').insertOne({
        _id: tenantId,
        tenantId,
        phone: '79000000891',
        password: await bcrypt.hash(password, 4),
        tariffId,
        role: 'user',
        archive: false,
      })
      await db
        .collection('clients')
        .insertOne({ _id: clientId, tenantId, firstName: 'Тестовый клиент' })
      await db.collection('sitesettings').insertOne({
        tenantId,
        custom: {
          firstRunWizardCompleted: true,
          primaryEntityTerminology: 'orders',
        },
      })
      const ago = (days) => new Date(Date.now() - days * 86_400_000)
      const fixtures = [
        {
          eventType: 'QA оплачена',
          status: 'draft',
          eventDate: ago(1),
          contractSum: 100,
        },
        { eventType: 'QA без задач', status: 'draft', eventDate: ago(2) },
        {
          eventType: 'QA с контактом',
          status: 'draft',
          eventDate: ago(3),
          additionalEvents: [
            {
              title: 'Контакт по прошедшей заявке',
              date: ago(-1),
              done: false,
            },
          ],
        },
        {
          eventType: 'QA без оплаты',
          status: 'draft',
          eventDate: ago(4),
          contractSum: 500,
        },
        { eventType: 'QA будущая', status: 'draft', eventDate: ago(-3) },
        { eventType: 'QA без даты', status: 'draft' },
        {
          eventType: 'QA продолжается',
          status: 'draft',
          eventDate: ago(2),
          dateEnd: ago(-1),
        },
        { eventType: 'QA подтверждена', status: 'active', eventDate: ago(5) },
        { eventType: 'QA закрыта', status: 'closed', eventDate: ago(6) },
        { eventType: 'QA отменена', status: 'canceled', eventDate: ago(7) },
        {
          eventType: 'QA чужая',
          status: 'draft',
          eventDate: ago(1),
          tenantId: foreignTenant,
        },
      ].map((row) => ({
        _id: new mongoose.Types.ObjectId(),
        tenantId,
        clientId,
        contractSum: 0,
        calendarImportChecked: true,
        additionalEvents: [],
        createdAt: ago(10),
        ...row,
      }))
      const find = (name) => fixtures.find((row) => row.eventType === name)
      const reset = async () => {
        await db
          .collection('events')
          .deleteMany({ tenantId: { $in: [tenantId, foreignTenant] } })
        await db
          .collection('events')
          .insertMany(fixtures.map((row) => ({ ...row })))
      }
      await reset()
      await db.collection('transactions').insertOne({
        tenantId,
        eventId: find('QA оплачена')._id,
        clientId,
        type: 'income',
        amount: 100,
        paymentMethod: 'cash',
        date: ago(1),
      })
      app = spawn(
        process.execPath,
        [
          'node_modules/next/dist/bin/next',
          'start',
          '-H',
          '127.0.0.1',
          '-p',
          String(appPort),
        ],
        {
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NODE_ENV: 'production',
            MONGODB_URI: mongoUri,
            MONGODB_DBNAME: 'past_requests',
            NEXTAUTH_URL: baseUrl,
            NEXTAUTH_SECRET: 'past-requests-test-secret',
          },
        }
      )
      // Вывод сервера не содержит production-данных: используется только временная БД.
      let output = ''
      app.stdout.on('data', (chunk) => {
        output = (output + chunk).slice(-3000)
      })
      app.stderr.on('data', (chunk) => {
        output = (output + chunk).slice(-3000)
      })
      await waitForPort(appPort, app)
      const cookies = new Map()
      const request = async (url, options = {}) => {
        const response = await fetch(baseUrl + url, {
          ...options,
          redirect: 'manual',
          headers: {
            cookie: [...cookies]
              .map(([key, value]) => `${key}=${value}`)
              .join('; '),
            ...options.headers,
          },
        })
        for (const cookie of response.headers.getSetCookie()) {
          const [pair] = cookie.split(';')
          const split = pair.indexOf('=')
          cookies.set(pair.slice(0, split), pair.slice(split + 1))
        }
        return response
      }
      const csrf = await (await request('/api/auth/csrf')).json()
      await request('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          phone: '79000000891',
          password,
          csrfToken: csrf.csrfToken,
          json: 'true',
        }),
      })
      assert.ok(
        (await (await request('/api/auth/session')).json()).user?._id,
        output
      )
      const change = (id, body) =>
        request(`/api/events/${id}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      await t.test(
        'API: фильтры, счётчик, граница окончания, чужой tenant и авторизация',
        async () => {
          assert.equal((await request(`/api/tariffs/${tariffId}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ allowPastRequests: true }),
          })).status, 403)
          const query =
            '/api/events?scope=past&statusRequest=true&statusFinished=false&statusClosed=false&statusCanceled=false&transferredMode=all'
          const response = await request(query + `&tenantId=${foreignTenant}`)
          assert.equal(response.status, 200)
          const payload = await response.json()
          assert.equal(payload.data.length, 4)
          assert.ok(
            payload.data.every(
              (row) =>
                row.status === 'draft' && row.tenantId === String(tenantId)
            )
          )
          assert.equal(
            (await (await request(query + '&countOnly=1')).json()).meta
              .totalCount,
            4
          )
          const firstPage = await (await request(query + '&limit=2')).json()
          assert.equal(firstPage.meta.hasMore, true)
          const secondPage = await (
            await request(
              query +
                '&limit=2&before=' +
                encodeURIComponent(firstPage.meta.nextBefore)
            )
          ).json()
          assert.equal(secondPage.meta.hasMore, false)
          assert.equal(
            new Set(
              [...firstPage.data, ...secondPage.data].map((row) => row._id)
            ).size,
            4
          )
          const decision = await (
            await request(
              query.replace('statusFinished=false', 'statusFinished=true')
            )
          ).json()
          assert.equal(decision.data.length, 5)
          const legacyClose = await (
            await request(
              '/api/events?scope=past&statusFinished=true&statusClosed=false&statusCanceled=false'
            )
          ).json()
          assert.equal(legacyClose.data.length, 1)
          assert.equal((await fetch(baseUrl + query)).status, 401)
          assert.equal(
            (await change(find('QA чужая')._id, { status: 'closed' })).status,
            404
          )
          assert.equal(
            (await change(find('QA без оплаты')._id, { status: 'closed' }))
              .status,
            409
          )
          assert.equal(
            (await change(find('QA оплачена')._id, { status: 'closed' }))
              .status,
            200
          )
          await reset()
        }
      )

      if (!process.env.PAST_REQUESTS_BROWSER) return
      const { chromium } = await import('playwright')
      browser = await chromium.launch({ channel: 'msedge', headless: true })
      const screenshots =
        process.env.QA_SCREENSHOT_DIR ||
        path.join(os.tmpdir(), 'vedelo-past-requests-qa')
      await mkdir(screenshots, { recursive: true })
      for (const width of [1365, 390])
        for (const theme of ['light', 'dark']) {
          await t.test(
            `UI ${width}px ${theme}: фильтры и решения`,
            async () => {
              await reset()
              const context = await browser.newContext({
                baseURL: baseUrl,
                viewport: { width, height: 900 },
              })
              try {
                await context.addCookies(
                  [...cookies].map(([name, value]) => ({
                    name,
                    value,
                    url: baseUrl,
                  }))
                )
                await context.addInitScript(
                  (value) => localStorage.setItem('theme', value),
                  theme
                )
                const page = await context.newPage()
                page.setDefaultTimeout(12_000)
                const errors = []
                page.on('pageerror', (error) => errors.push(error.message))
                page.on('console', (message) => {
                  if (message.type() === 'error') errors.push(message.text())
                })
                await db.collection('tariffs').updateOne({ _id: tariffId }, { $set: { allowPastRequests: false } })
                await page.goto('/cabinet/attention')
                await page.locator('#attention-no-next-step').getByText('QA без задач', { exact: true }).waitFor()
                assert.equal(await page.locator('#attention-past-requests').count(), 0)
                await db.collection('tariffs').updateOne({ _id: tariffId }, { $set: { allowPastRequests: true } })
                await page.reload()

                const section = page.locator('#attention-past-requests')
                await section
                  .getByText('QA с контактом', { exact: true })
                  .waitFor()
                assert.match(await page.title(), /Кабинет Ведело/)
                assert.equal(
                  await section
                    .getByRole('button', { name: 'Закрыть', exact: true })
                    .count(),
                  4
                )
                assert.equal(
                  await page
                    .locator('#attention-no-next-step')
                    .getByText('QA без задач', { exact: true })
                    .count(),
                  0
                )
                await page
                  .locator('#attention-no-next-step')
                  .getByText('QA без даты', { exact: true })
                  .waitFor()
                assert.equal(
                  await page
                    .locator('body')
                    .evaluate((body) => body.scrollWidth <= innerWidth),
                  true
                )
                await section.scrollIntoViewIfNeeded()
                await page.screenshot({
                  path: path.join(
                    screenshots,
                    `attention-${width}-${theme}.png`
                  ),
                })
                const card = (title) =>
                  section
                    .locator('div.rounded-lg')
                    .filter({ has: page.getByText(title, { exact: true }) })
                await card('QA без оплаты')
                  .getByRole('button', { name: 'Закрыть', exact: true })
                  .click()
                const apply = page.getByRole('button', {
                  name: 'Применить',
                  exact: true,
                })
                await page
                  .getByText(/сумма поступлений меньше договорной/)
                  .waitFor()
                assert.equal(await apply.isDisabled(), true)
                await page
                  .getByRole('button', { name: 'Отмена', exact: true })
                  .last()
                  .click()
                await card('QA оплачена')
                  .getByRole('button', { name: 'Закрыть', exact: true })
                  .click()
                await apply.waitFor()
                await apply.click()
                await card('QA оплачена').waitFor({ state: 'hidden' })
                assert.equal(
                  (
                    await db
                      .collection('events')
                      .findOne({ _id: find('QA оплачена')._id })
                  ).status,
                  'closed'
                )
                await card('QA без задач')
                  .getByRole('button', { name: 'Отменить', exact: true })
                  .click()
                await page
                  .getByText('Причина отмены', { exact: true })
                  .waitFor()
                assert.equal(await apply.isDisabled(), true)
                await page
                  .locator('input[list="cancel-reasons"]')
                  .fill('Работа не состоялась')
                await apply.click()
                await card('QA без задач').waitFor({ state: 'hidden' })
                assert.equal(
                  (
                    await db
                      .collection('events')
                      .findOne({ _id: find('QA без задач')._id })
                  ).status,
                  'canceled'
                )
                await card('QA с контактом')
                  .getByRole('button', { name: 'Перенести дату', exact: true })
                  .click()
                await page.getByText('Дата начала', { exact: true }).waitFor()
                // Изменяем год начала: редактор сдвигает конец на тот же интервал.
                const year = page
                  .getByRole('spinbutton', { name: /Год/ })
                  .first()
                await year.fill(String(new Date().getFullYear() + 1))
                await year.press('Tab')
                await page
                  .getByRole('button', { name: 'Применить', exact: true })
                  .click()
                await card('QA с контактом').waitFor({ state: 'hidden' })
                const moved = await db
                  .collection('events')
                  .findOne({ _id: find('QA с контактом')._id })
                assert.equal(moved.status, 'draft')
                assert.ok(new Date(moved.eventDate) > new Date())
                await page
                  .getByText('Редактирование заказа', { exact: true })
                  .waitFor({ state: 'hidden' })
                await page.waitForLoadState('networkidle')
                await page.goto('/cabinet/eventsPast')
                await page
                  .getByRole('button', { name: 'Требуют решения', exact: true })
                  .waitFor()
                await page.getByText(/^QA без оплаты •/).waitFor()
                await page
                  .getByText('Дата прошла — уточните результат', {
                    exact: true,
                  })
                  .waitFor()
                await page
                  .getByRole('button', { name: /^Фильтры заказов/ })
                  .click()
                await page
                  .getByRole('button', { name: 'Заявки', exact: true })
                  .click()
                await page
                  .getByText(/^QA без оплаты •/)
                  .waitFor({ state: 'hidden' })
                await page
                  .getByRole('button', { name: 'Заявки', exact: true })
                  .click()
                await page.getByText(/^QA без оплаты •/).waitFor()
                await page
                  .getByRole('button', { name: /^Фильтры заказов/ })
                  .click()
                await page
                  .getByRole('button', { name: 'Требуют решения', exact: true })
                  .click()
                assert.equal(await page.getByText(/^QA закрыта •/).count(), 0)
                await page
                  .getByRole('button', { name: 'Отмененные', exact: true })
                  .click()
                await page.getByText(/^QA без задач •/).waitFor()
                assert.equal(
                  await page.getByText(/^QA без оплаты •/).count(),
                  0
                )
                await page
                  .getByRole('button', { name: 'Требуют решения', exact: true })
                  .click()
                await page.getByText(/^QA без оплаты •/).waitFor()
                assert.equal(
                  await page
                    .getByRole('button', {
                      name: 'Требуют решения',
                      exact: true,
                    })
                    .getAttribute('aria-pressed'),
                  'true'
                )
                const requestCard = page.locator(
                  '.event-card-shell--past-request'
                )
                const clientLine = requestCard.getByText('Тестовый клиент', {
                  exact: true,
                })
                const cardBox = await requestCard.boundingBox()
                const clientBox = await clientLine.boundingBox()
                assert.ok(
                  clientBox &&
                    clientBox.y + clientBox.height <=
                      cardBox.y + cardBox.height,
                  'Имя клиента не обрезано карточкой'
                )
                await page.screenshot({
                  animations: 'disabled',
                  path: path.join(screenshots, `past-${width}-${theme}.png`),
                })
                assert.doesNotMatch(
                  await page.locator('body').innerText(),
                  /Application error|Unhandled Runtime Error/
                )
                assert.deepEqual(errors, [])
                console.log(
                  `QA ${baseUrl}: ${width}px ${theme}, screenshots ${screenshots}`
                )
              } catch (error) {
                console.error(error.message)
                const pages = context.pages()
                if (pages[0])
                  console.error(
                    (await pages[0].locator('body').innerText()).slice(-5000)
                  )
                throw error
              } finally {
                await context.close()
              }
            }
          )
        }
    } finally {
      await browser?.close()
      await stop(app)
      await db?.close()
      await stop(mongo)
      // mkdtemp создал только наш каталог внутри системного temp.
      assert.ok(
        path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep)
      )
      await rm(folder, { recursive: true, force: true })
    }
  }
)
