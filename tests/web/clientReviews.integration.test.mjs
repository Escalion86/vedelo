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
  'Отзывы клиентов: тариф, tenant isolation, публичная ссылка и Web/PWA',
  { timeout: 300000 },
  async (t) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'vedelo-reviews-'))
    const mongoPort = await freePort(),
      appPort = await freePort()
    const baseUrl = `http://127.0.0.1:${appPort}`
    const mongoUri = `mongodb://127.0.0.1:${mongoPort}/client_reviews`
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
      const oid = () => new mongoose.Types.ObjectId()
      const tenantId = oid(),
        foreignTenant = oid(),
        tariffId = oid(),
        clientId = oid()
      const password = 'Client-reviews-test-123'
      await db
        .collection('tariffs')
        .insertOne({
          _id: tariffId,
          title: 'QA',
          eventsPerMonth: 100,
          allowClientReviews: true,
        })
      await db
        .collection('users')
        .insertOne({
          _id: tenantId,
          tenantId,
          phone: '79000000892',
          firstName: 'Тестовый исполнитель',
          password: await bcrypt.hash(password, 4),
          tariffId,
          role: 'user',
          archive: false,
        })
      await db
        .collection('clients')
        .insertOne({ _id: clientId, tenantId, firstName: 'Тестовый клиент' })
      await db
        .collection('sitesettings')
        .insertOne({
          tenantId,
          custom: {
            firstRunWizardCompleted: true,
            primaryEntityTerminology: 'orders',
          },
        })
      const event = async (changes = {}) => {
        const row = {
          _id: oid(),
          tenantId,
          clientId,
          status: 'closed',
          eventType: 'Тестовая работа',
          eventDate: new Date(Date.now() - 86400000),
          ...changes,
        }
        await db.collection('events').insertOne(row)
        return String(row._id)
      }
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
            MONGODB_DBNAME: 'client_reviews',
            NEXTAUTH_URL: baseUrl,
            DOMAIN: baseUrl,
            NEXTAUTH_SECRET: 'client-reviews-test-secret',
          },
        }
      )
      let output = ''
      app.stdout.on('data', (chunk) => {
        output = (output + chunk).slice(-2000)
      })
      app.stderr.on('data', (chunk) => {
        output = (output + chunk).slice(-2000)
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
          const [pair] = cookie.split(';'),
            split = pair.indexOf('=')
          cookies.set(pair.slice(0, split), pair.slice(split + 1))
        }
        return response
      }
      const csrf = await (await request('/api/auth/csrf')).json()
      await request('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          phone: '79000000892',
          password,
          csrfToken: csrf.csrfToken,
          json: 'true',
        }),
      })
      assert.ok(
        (await (await request('/api/auth/session')).json()).user?._id,
        output
      )
      const json = (body, method = 'POST') => ({
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const create = async (eventId, extra = {}) =>
        request('/api/client-reviews', json({ eventId, ...extra }))
      const patch = (id, body) =>
        request(`/api/client-reviews/${id}`, json(body, 'PATCH'))
      const publicRequest = (review, body) =>
        fetch(`${baseUrl}/api/public/client-reviews/${review._id}`, {
          ...(body ? json(body) : {}),
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${new URL(review.url).hash.slice(1)}`,
          },
        })
      let saved
      await t.test(
        'Авторизация, чужие сущности и запрет подмены tenant',
        async () => {
          assert.equal(
            (await fetch(baseUrl + '/api/client-reviews')).status,
            401
          )
          const other = await event({ tenantId: foreignTenant })
          assert.equal(
            (await create(other, { tenantId: foreignTenant })).status,
            404
          )
          const own = await event()
          saved = (
            await (
              await create(own, { tenantId: foreignTenant, rating: 5 })
            ).json()
          ).data
          assert.ok(saved.url)
          const row = await db
            .collection('clientreviews')
            .findOne({ eventId: new mongoose.Types.ObjectId(own) })
          assert.equal(String(row.tenantId), String(tenantId))
          assert.equal(row.rating, undefined)
          assert.equal(
            (await patch(String(oid()), { action: 'read' })).status,
            404
          )
          const foreignReview = {
            ...row,
            _id: oid(),
            eventId: new mongoose.Types.ObjectId(other),
            tenantId: foreignTenant,
          }
          await db.collection('clientreviews').insertOne(foreignReview)
          assert.equal(
            (await patch(String(foreignReview._id), { action: 'link' })).status,
            404
          )
          const list = (
            await (
              await request(`/api/client-reviews?tenantId=${foreignTenant}`)
            ).json()
          ).data
          assert.equal(list.items.length, 1)
          assert.equal(JSON.stringify(list).includes('tokenHash'), false)
          assert.equal(JSON.stringify(list).includes('nonce'), false)
          assert.equal(
            (await create(await event({ status: 'draft' }))).status,
            409
          )
          assert.equal(
            (await create(await event({ status: 'canceled' }))).status,
            409
          )
          assert.equal(
            (
              await create(
                await event({
                  status: 'active',
                  eventDate: new Date(Date.now() + 86400000),
                }),
                { confirmedCompleted: true }
              )
            ).status,
            409
          )
          const active = await event({ status: 'active', contractSum: 1000 })
          assert.equal((await create(active)).status, 409)
          assert.equal(
            (await create(active, { confirmedCompleted: true })).status,
            200
          )
        }
      )
      await t.test(
        'Отключение тарифа блокирует новые ссылки, сохраняет чтение и приём ответа',
        async () => {
          await db
            .collection('tariffs')
            .updateOne(
              { _id: tariffId },
              { $unset: { allowClientReviews: '' } }
            )
          assert.equal((await create(await event())).status, 403)
          assert.equal((await patch(saved._id, { action: 'link' })).status, 403)
          assert.equal((await request('/api/client-reviews')).status, 200)
          const response = await publicRequest(saved)
          assert.equal(response.status, 200)
          assert.match(response.headers.get('cache-control'), /no-store/)
          assert.deepEqual(Object.keys((await response.json()).data).sort(), [
            'eventDate',
            'performerName',
            'submitted',
          ])
          assert.equal((await publicRequest(saved, { rating: 0 })).status, 400)
          assert.equal(
            (
              await publicRequest(saved, {
                rating: 5,
                comment: 'x'.repeat(2001),
              })
            ).status,
            400
          )
          const answers = await Promise.all([
            publicRequest(saved, { rating: 4, comment: 'Спасибо!' }),
            publicRequest(saved, { rating: 4, comment: 'Спасибо!' }),
          ])
          assert.deepEqual(
            answers.map((r) => r.status),
            [200, 200]
          )
          assert.equal(
            (await publicRequest(saved, { rating: 1, comment: 'Перезапись' }))
              .status,
            200
          )
          const row = await db
            .collection('clientreviews')
            .findOne({ _id: new mongoose.Types.ObjectId(saved._id) })
          assert.equal(row.rating, 4)
          assert.equal(row.comment, 'Спасибо!')
          assert.equal((await patch(saved._id, { action: 'read' })).status, 200)
          assert.equal(
            (await patch(saved._id, { action: 'note', note: 'Связаться' }))
              .status,
            200
          )
          assert.equal(
            (
              await publicRequest({
                ...saved,
                url: saved.url.replace(/.$/, (char) => char === 'z' ? 'y' : 'z'),
              })
            ).status,
            404
          )
          await db
            .collection('tariffs')
            .updateOne(
              { _id: tariffId },
              { $set: { allowClientReviews: true } }
            )
        }
      )
      await t.test(
        'Дедупликация создания, срок, отзыв доступа, ротация, удалённые связи',
        async () => {
          const eventId = await event()
          const created = await Promise.all([create(eventId), create(eventId)])
          const rows = await Promise.all(
            created.map((response) => response.json())
          )
          assert.equal(rows[0].data._id, rows[1].data._id)
          const review = rows[0].data
          assert.equal(
            (await patch(review._id, { action: 'sent' })).status,
            200
          )
          assert.equal(
            (await patch(review._id, { action: 'revoke' })).status,
            200
          )
          assert.equal((await publicRequest(review)).status, 410)
          const renewed = (
            await (await patch(review._id, { action: 'renew' })).json()
          ).data
          assert.notEqual(renewed.url, review.url)
          assert.equal((await publicRequest(review)).status, 404)
          assert.equal((await publicRequest(renewed)).status, 200)
          await db
            .collection('clientreviews')
            .updateOne(
              { _id: new mongoose.Types.ObjectId(review._id) },
              { $set: { expiresAt: new Date(0) } }
            )
          assert.equal((await publicRequest(renewed)).status, 410)
          const fresh = (
            await (await patch(review._id, { action: 'renew' })).json()
          ).data
          await db
            .collection('events')
            .deleteOne({ _id: new mongoose.Types.ObjectId(eventId), tenantId })
          assert.equal((await publicRequest(fresh)).status, 410)
        }
      )

      if (!process.env.CLIENT_REVIEWS_BROWSER) return
      const { chromium } = await import('playwright')
      browser = await chromium.launch({ channel: 'msedge', headless: true })
      const screenshots =
        process.env.QA_SCREENSHOT_DIR ||
        path.join(os.tmpdir(), 'vedelo-reviews-qa')
      await mkdir(screenshots, { recursive: true })
      for (const width of [1365, 390])
        for (const theme of ['light', 'dark'])
          await t.test(
            `UI ${width}px ${theme}: ссылка → оценка → кабинет`,
            async () => {
              const review = (await (await create(await event())).json()).data
              const context = await browser.newContext({
                baseURL: baseUrl,
                viewport: { width, height: 900 },
              })
              try {
                await context.addInitScript((value) => {
                  localStorage.setItem('theme', value)
                  document.addEventListener('DOMContentLoaded', () =>
                    document.body.classList.toggle(
                      'theme-dark',
                      value === 'dark'
                    )
                  )
                }, theme)
                const page = await context.newPage(),
                  errors = []
                page.on('pageerror', (error) => errors.push(error.message))
                page.on('console', (message) => {
                  if (message.type() === 'error') errors.push(message.text())
                })
                await page.goto(review.url)
                await page
                  .getByText('Тестовый исполнитель', { exact: true })
                  .waitFor()
                assert.match(await page.title(), /Отзыв о работе/)
                assert.equal(
                  await page
                    .getByRole('button', { name: 'Отправить отзыв' })
                    .isDisabled(),
                  true
                )
                await page.getByRole('radio', { name: '5 из 5' }).check()
                await page
                  .getByRole('textbox', { name: 'Комментарий' })
                  .fill('Очень понравилось!')
                assert.equal(
                  await page
                    .locator('body')
                    .evaluate((body) => body.scrollWidth <= innerWidth),
                  true
                )
                await page.screenshot({
                  path: path.join(screenshots, `review-${width}-${theme}.png`),
                })
                await page
                  .getByRole('button', { name: 'Отправить отзыв' })
                  .click()
                await page.getByText('Спасибо за отзыв!').waitFor()
                await page.reload()
                await page.getByText('Спасибо за отзыв!').waitFor()
                await context.addCookies(
                  [...cookies].map(([name, value]) => ({
                    name,
                    value,
                    url: baseUrl,
                  }))
                )
                await page.goto('/cabinet/client-reviews')
                await page.getByLabel('Оценка', { exact: true }).waitFor()
                await page
                  .getByLabel('Оценка', { exact: true })
                  .selectOption('5')
                await page
                  .getByText('Очень понравилось!', { exact: true })
                  .first()
                  .waitFor()
                await page
                  .getByRole('button', { name: 'Отметить прочитанным' })
                  .first()
                  .click()
                await page
                  .getByText('Прочитан', { exact: true })
                  .first()
                  .waitFor()
                await page.screenshot({
                  path: path.join(screenshots, `cabinet-${width}-${theme}.png`),
                })
                await page
                  .getByRole('button', { name: 'Открыть работу' })
                  .first()
                  .click()
                await page
                  .getByRole('heading', { name: 'Отзыв клиента', exact: true })
                  .waitFor()
                const pendingEvent = await event({ status: 'active' })
                await page.goto(`/event/${pendingEvent}`)
                await page
                  .getByRole('heading', { name: 'Отзыв клиента', exact: true })
                  .waitFor()
                assert.equal(
                  await page
                    .getByRole('button', {
                      name: 'Запросить отзыв',
                      exact: true,
                    })
                    .isDisabled(),
                  true
                )
                await page
                  .getByRole('checkbox', { name: 'Работа выполнена' })
                  .check()
                await page
                  .getByRole('button', { name: 'Запросить отзыв', exact: true })
                  .click()
                const message = page.getByRole('textbox', {
                  name: 'Сообщение клиенту',
                })
                await message.waitFor()
                assert.match(await message.inputValue(), /\/review\/[a-f0-9]+#/)
                await page
                  .getByRole('button', {
                    name: 'Я отправил сообщение',
                    exact: true,
                  })
                  .click()
                await page
                  .getByText('Отправка отмечена', { exact: true })
                  .waitFor()
                assert.ok(
                  (
                    await db
                      .collection('clientreviews')
                      .findOne({
                        tenantId,
                        eventId: new mongoose.Types.ObjectId(pendingEvent),
                      })
                  ).sentAt
                )
                assert.doesNotMatch(
                  await page.locator('body').innerText(),
                  /Application error|Unhandled Runtime Error/
                )
                assert.deepEqual(errors, [])
              } finally {
                await context.close()
              }
            }
          )
      await t.test(
        'UI: администратор включает и выключает отзывы в тарифе',
        async () => {
          await db
            .collection('users')
            .updateOne({ _id: tenantId }, { $set: { role: 'dev' } })
          const context = await browser.newContext({
            baseURL: baseUrl,
            viewport: { width: 390, height: 900 },
          })
          try {
            await context.addCookies(
              [...cookies].map(([name, value]) => ({
                name,
                value,
                url: baseUrl,
              }))
            )
            const page = await context.newPage()
            await page.goto('/cabinet/tariffs')
            await page.getByText('QA', { exact: true }).click()
            await page
              .getByText('Редактирование тарифа', { exact: true })
              .waitFor()
            await page
              .getByRole('checkbox', { name: 'Отзывы клиентов', exact: true })
              .click()
            {
              const saved = page.waitForResponse((response) => response.url().endsWith('/api/tariffs/' + tariffId) && response.request().method() === 'PUT')
              await page.getByRole('button', { name: 'Применить', exact: true }).click()
              assert.equal((await saved).status(), 200)
            }
            await page
              .getByText('Редактирование тарифа', { exact: true })
              .waitFor({ state: 'hidden' })
            await page.reload()
            assert.equal(
              (await db.collection('tariffs').findOne({ _id: tariffId }))
                .allowClientReviews,
              false
            )
            await page.getByText('QA', { exact: true }).click()
            await page
              .getByRole('checkbox', { name: 'Отзывы клиентов', exact: true })
              .click()
            {
              const saved = page.waitForResponse((response) => response.url().endsWith('/api/tariffs/' + tariffId) && response.request().method() === 'PUT')
              await page.getByRole('button', { name: 'Применить', exact: true }).click()
              assert.equal((await saved).status(), 200)
            }
            await page
              .getByText('Редактирование тарифа', { exact: true })
              .waitFor({ state: 'hidden' })
            await page.reload()
            assert.equal(
              (await db.collection('tariffs').findOne({ _id: tariffId }))
                .allowClientReviews,
              true
            )
            await page.getByText('QA', { exact: true }).click()
            const reviewOption = page.getByRole('checkbox', { name: 'Отзывы клиентов', exact: true })
            await reviewOption.waitFor()
            assert.equal(await reviewOption.getAttribute('aria-checked'), 'true')
            await reviewOption.scrollIntoViewIfNeeded()
            await page.screenshot({
              path: path.join(screenshots, 'tariff-390.png'),
            })
          } finally {
            await context.close()
          }
        }
      )
      console.log(`Снимки QA: ${screenshots}`)
    } finally {
      await browser?.close()
      await stop(app)
      await db?.close()
      await stop(mongo)
      assert.ok(
        path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep)
      )
      await rm(folder, { recursive: true, force: true })
    }
  }
)
