import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import http from 'node:http'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'

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
    let app, db, browser, cloud
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
      // Mock облака: принимает multipart-загрузку фото страницы отзывов и
      // возвращает безопасную ссылку cloud.escalion.ru своего tenant-каталога.
      cloud = http.createServer((req, res) => {
        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })
        req.on('end', () => {
          const match = body.match(
            /vedelo\/[a-f0-9]{24}\/review-page\/logo\/[a-f0-9-]{36}/
          )
          if (!match) {
            res.writeHead(500, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: 'bad upload' }))
            return
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(
            JSON.stringify({
              success: true,
              data: {
                url: `https://cloud.escalion.ru/uploads/${match[0]}/logo.webp`,
              },
            })
          )
        })
      })
      await new Promise((resolve) => cloud.listen(0, '127.0.0.1', resolve))
      const cloudApiUrl = `http://127.0.0.1:${cloud.address().port}`
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
            ESCALIONCLOUD_API_URL: cloudApiUrl,
            ESCALIONCLOUD_PASSWORD: 'client-reviews-cloud-password',
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
      const makeSession = () => {
        const sessionCookies = new Map()
        const sessionRequest = async (url, options = {}) => {
          const response = await fetch(baseUrl + url, {
            ...options,
            redirect: 'manual',
            headers: {
              cookie: [...sessionCookies]
                .map(([key, value]) => `${key}=${value}`)
                .join('; '),
              ...options.headers,
            },
          })
          for (const cookie of response.headers.getSetCookie()) {
            const [pair] = cookie.split(';'),
              split = pair.indexOf('=')
            sessionCookies.set(pair.slice(0, split), pair.slice(split + 1))
          }
          return response
        }
        const login = async (phone, userPassword) => {
          const { csrfToken } = await (
            await sessionRequest('/api/auth/csrf')
          ).json()
          await sessionRequest('/api/auth/callback/credentials', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              phone,
              password: userPassword,
              csrfToken,
              json: 'true',
            }),
          })
          return (await (await sessionRequest('/api/auth/session')).json())
            ?.user?._id
        }
        return { cookies: sessionCookies, request: sessionRequest, login }
      }
      const session = makeSession()
      const { cookies, request } = session
      assert.ok(await session.login('79000000892', password), output)
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
      const pageHtml = async (url) => (await fetch(baseUrl + url)).text()
      const metaContent = (html, key, attr = 'property') => {
        const tag = html.match(
          new RegExp(`<meta[^>]*${attr}="${key}"[^>]*>`, 'i')
        )
        if (!tag) return ''
        const content = tag[0].match(/content="([^"]*)"/)
        return content ? content[1] : ''
      }
      const saveReviewPage = (payload) =>
        request('/api/site/review-page', json(payload))
      const getReviewPage = async () =>
        (await (await request('/api/site/review-page')).json()).data
      const APPEARANCE = {
        publicName: 'Студия «Полёт»',
        specialization: 'декоратор праздников',
        greeting: 'Спасибо, что выбрали нас!',
        accent: 'violet',
        cover: 'deep',
      }
      const pngLogo = () =>
        sharp({
          create: {
            width: 16,
            height: 16,
            channels: 4,
            background: { r: 180, g: 120, b: 40, alpha: 1 },
          },
        })
          .png()
          .toBuffer()
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
          const publicData = (await response.json()).data
          assert.deepEqual(Object.keys(publicData).sort(), [
            'appearance',
            'eventDate',
            'performerName',
            'submitted',
          ])
          assert.equal(publicData.appearance, null)
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
      await t.test(
        'Страница отзывов: умолчания, tenant isolation и нейтральный публичный слой',
        async () => {
          assert.equal(
            (await fetch(baseUrl + '/api/site/review-page')).status,
            401
          )
          assert.equal(
            (
              await fetch(
                baseUrl + '/api/site/review-page',
                json({ publicName: 'Чужой' })
              )
            ).status,
            401
          )
          const defaults = await getReviewPage()
          assert.deepEqual(defaults.reviewPage, {
            publicName: '',
            specialization: '',
            greeting: '',
            accent: 'sand',
            cover: 'plain',
            logoUrl: '',
          })
          assert.equal(defaults.allowClientReviews, true)
          assert.equal(defaults.origin, baseUrl)
          const neutralReview = (await (await create(await event())).json())
            .data
          const neutralHtml = await pageHtml(`/review/${neutralReview._id}`)
          assert.match(neutralHtml, /<title>Отзыв о работе — Ведело<\/title>/)
          assert.equal(
            metaContent(neutralHtml, 'og:title'),
            'Отзыв о работе — Ведело'
          )
          assert.equal(
            metaContent(neutralHtml, 'og:image'),
            `${baseUrl}/opengraph-image`
          )
          assert.equal(
            metaContent(neutralHtml, 'twitter:card', 'name'),
            'summary_large_image'
          )
          assert.equal(neutralHtml.includes('Студия'), false)
          const otherUserId = oid()
          await db.collection('users').insertOne({
            _id: otherUserId,
            tenantId: otherUserId,
            phone: '79000000893',
            firstName: 'Другой исполнитель',
            password: await bcrypt.hash(password, 4),
            tariffId,
            role: 'user',
            archive: false,
          })
          const otherSession = makeSession()
          assert.ok(await otherSession.login('79000000893', password))
          const otherDefaults = (
            await (await otherSession.request('/api/site/review-page')).json()
          ).data
          assert.equal(otherDefaults.reviewPage.publicName, '')
          assert.equal(
            (
              await otherSession.request(
                '/api/site/review-page',
                json(APPEARANCE)
              )
            ).status,
            200
          )
          assert.equal((await getReviewPage()).reviewPage.publicName, '')
          const afterForeignSave = await pageHtml(
            `/review/${neutralReview._id}`
          )
          assert.equal(afterForeignSave.includes(APPEARANCE.publicName), false)
          assert.equal(
            metaContent(afterForeignSave, 'og:title'),
            'Отзыв о работе — Ведело'
          )
        }
      )
      await t.test(
        'Настройки страницы отзывов: валидация, сохранение, повторное чтение и тариф',
        async () => {
          const status = async (payload) => (await saveReviewPage(payload)).status
          assert.equal(await status({ publicName: 'x'.repeat(81) }), 400)
          assert.equal(await status({ specialization: 'x'.repeat(121) }), 400)
          assert.equal(await status({ greeting: 'x'.repeat(301) }), 400)
          assert.equal(await status({ publicName: 5 }), 400)
          assert.equal(await status({ accent: 'gold' }), 400)
          assert.equal(await status({ cover: 'stars' }), 400)
          assert.equal(
            await status({ logoUrl: 'https://evil.example.com/logo.webp' }),
            400
          )
          assert.equal(
            await status({
              logoUrl:
                'https://cloud.escalion.ru/uploads/vedelo/abcdefabcdefabcdefabcdef/review-page/logo/11111111-2222-3333-4444-555555555555/logo.webp',
            }),
            400
          )
          const savedResponse = await saveReviewPage(APPEARANCE)
          assert.equal(savedResponse.status, 200)
          const savedData = (await savedResponse.json()).data
          assert.deepEqual(savedData.reviewPage, {
            ...APPEARANCE,
            logoUrl: '',
          })
          assert.equal(savedData.allowClientReviews, true)
          assert.deepEqual((await getReviewPage()).reviewPage, {
            ...APPEARANCE,
            logoUrl: '',
          })
          const settingsRow = await db
            .collection('sitesettings')
            .findOne({ tenantId })
          assert.equal(settingsRow.custom.firstRunWizardCompleted, true)
          assert.equal(settingsRow.reviewPage.accent, 'violet')
          await db
            .collection('tariffs')
            .updateOne(
              { _id: tariffId },
              { $unset: { allowClientReviews: '' } }
            )
          assert.equal(
            (await saveReviewPage({ publicName: 'Другое' })).status,
            403
          )
          assert.equal(
            (await getReviewPage()).reviewPage.publicName,
            APPEARANCE.publicName
          )
          await db
            .collection('tariffs')
            .updateOne({ _id: tariffId }, { $set: { allowClientReviews: true } })
          assert.equal((await saveReviewPage({})).status, 200)
          assert.equal((await getReviewPage()).reviewPage.publicName, '')
          assert.equal((await saveReviewPage(APPEARANCE)).status, 200)
        }
      )
      await t.test(
        'Метаданные без секрета: персонализация og/twitter, invalid/revoked и отсутствие утечек',
        async () => {
          const secretClientId = oid()
          await db.collection('clients').insertOne({
            _id: secretClientId,
            tenantId,
            firstName: 'Клиент-Секрет-Zz',
          })
          const eventId = await event({
            clientId: secretClientId,
            eventType: 'ТИП-РАБОТЫ-Zz',
            eventDate: new Date('2024-05-17T12:00:00.000Z'),
            contractSum: 987654321,
          })
          const review = (await (await create(eventId)).json()).data
          const token = new URL(review.url).hash.slice(1)
          assert.equal(
            (
              await publicRequest(review, {
                rating: 5,
                comment: 'КОММЕНТАРИЙ-СЕКРЕТ-Zz',
              })
            ).status,
            200
          )
          const html = await pageHtml(`/review/${review._id}`)
          assert.match(
            html,
            /<title>Отзыв о работе · Студия «Полёт»<\/title>/
          )
          assert.equal(
            metaContent(html, 'og:title'),
            'Отзыв о работе · Студия «Полёт»'
          )
          assert.equal(
            metaContent(html, 'og:description'),
            APPEARANCE.greeting
          )
          assert.equal(
            metaContent(html, 'og:url'),
            `${baseUrl}/review/${review._id}`
          )
          assert.equal(
            metaContent(html, 'og:image'),
            `${baseUrl}/opengraph-image`
          )
          assert.equal(
            metaContent(html, 'twitter:card', 'name'),
            'summary_large_image'
          )
          assert.equal(
            metaContent(html, 'twitter:title', 'name'),
            'Отзыв о работе · Студия «Полёт»'
          )
          assert.match(html, /<meta name="robots" content="noindex, nofollow"/)
          for (const secret of [
            'Клиент-Секрет-Zz',
            'КОММЕНТАРИЙ-СЕКРЕТ-Zz',
            'ТИП-РАБОТЫ-Zz',
            '987654321',
            'Тестовый исполнитель',
            '2024-05-17',
            '17.05.2024',
            token,
          ])
            assert.equal(html.includes(secret), false, secret)
          const invalidHtml = await pageHtml(
            '/review/000000000000000000000000'
          )
          assert.equal(
            metaContent(invalidHtml, 'og:title'),
            'Отзыв о работе — Ведело'
          )
          assert.equal(invalidHtml.includes('Студия'), false)
          const revoked = (await (await create(await event())).json()).data
          assert.equal((await patch(revoked._id, { action: 'revoke' })).status, 200)
          const revokedHtml = await pageHtml(`/review/${revoked._id}`)
          assert.equal(
            metaContent(revokedHtml, 'og:title'),
            'Отзыв о работе — Ведело'
          )
          assert.equal(revokedHtml.includes('Студия'), false)
          assert.equal((await publicRequest(revoked)).status, 410)
          const expired = (await (await create(await event())).json()).data
          await db
            .collection('clientreviews')
            .updateOne(
              { _id: new mongoose.Types.ObjectId(expired._id) },
              { $set: { expiresAt: new Date(0) } }
            )
          const expiredHtml = await pageHtml(`/review/${expired._id}`)
          assert.equal(
            metaContent(expiredHtml, 'og:title'),
            'Отзыв о работе — Ведело'
          )
          assert.equal((await publicRequest(expired)).status, 410)
        }
      )
      await t.test(
        'Фото страницы отзывов: безопасная загрузка через облако и ссылки',
        async () => {
          const upload = (file) => {
            const body = new FormData()
            body.append('file', file)
            return request('/api/site/review-page/logo', {
              method: 'POST',
              body,
            })
          }
          const smallPng = await pngLogo()
          assert.equal(
            (
              await upload(
                new File([smallPng], 'logo.png', { type: 'text/plain' })
              )
            ).status,
            400
          )
          assert.equal(
            (
              await upload(
                new File([Buffer.alloc(5 * 1024 * 1024 + 1)], 'big.png', {
                  type: 'image/png',
                })
              )
            ).status,
            413
          )
          const uploaded = (
            await (
              await upload(new File([smallPng], 'logo.png', { type: 'image/png' }))
            ).json()
          ).data
          assert.match(
            uploaded.url,
            new RegExp(
              `^https://cloud\\.escalion\\.ru/uploads/vedelo/${tenantId}/review-page/logo/[a-f0-9-]{36}/logo\\.webp$`
            )
          )
          assert.equal(
            (
              await saveReviewPage({ ...APPEARANCE, logoUrl: uploaded.url })
            ).status,
            200
          )
          const review = (await (await create(await event())).json()).data
          const html = await pageHtml(`/review/${review._id}`)
          assert.equal(metaContent(html, 'og:image'), uploaded.url)
          const publicData = (await (await publicRequest(review)).json()).data
          assert.equal(publicData.appearance.logoUrl, uploaded.url)
        }
      )
      await t.test(
        'Секретный GET и отправка: оформление в ответе, capability и благодарность',
        async () => {
          const review = (await (await create(await event())).json()).data
          const token = new URL(review.url).hash.slice(1)
          const status = (await publicRequest(review)).status
          assert.equal(status, 200)
          const data = (await (await publicRequest(review)).json()).data
          assert.deepEqual(Object.keys(data.appearance).sort(), [
            'accent',
            'cover',
            'greeting',
            'logoUrl',
            'publicName',
            'specialization',
          ])
          assert.equal(data.appearance.publicName, APPEARANCE.publicName)
          for (const authorization of [
            'Bearer',
            `Bearer ${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}`,
            '',
          ]) {
            const response = await fetch(
              `${baseUrl}/api/public/client-reviews/${review._id}`,
              { headers: { authorization } }
            )
            assert.equal(response.status, 404)
            assert.equal((await response.text()).includes('Студия'), false)
          }
          assert.equal(
            (
              await publicRequest(review, {
                rating: 5,
                comment: 'Всё отлично',
              })
            ).status,
            200
          )
          assert.equal(
            (
              await publicRequest(review, {
                rating: 1,
                comment: 'Повторная запись',
              })
            ).status,
            200
          )
          const after = (await (await publicRequest(review)).json()).data
          assert.equal(after.submitted, true)
          assert.equal(after.appearance.publicName, APPEARANCE.publicName)
          assert.equal(after.appearance.logoUrl !== '', true)
          const row = await db
            .collection('clientreviews')
            .findOne({ _id: new mongoose.Types.ObjectId(review._id) })
          assert.equal(row.rating, 5)
          assert.equal(row.comment, 'Всё отлично')
          const html = await pageHtml(`/review/${review._id}`)
          assert.equal(html.includes(token), false)
        }
      )

      if (!process.env.CLIENT_REVIEWS_BROWSER) return
      // Playwright не в зависимостях проекта: путь к модулю можно задать
      // через CLIENT_REVIEWS_PLAYWRIGHT (например, из локального набора
      // инструментов), иначе используется обычное разрешение 'playwright'.
      const { chromium } = await import(
        process.env.CLIENT_REVIEWS_PLAYWRIGHT || 'playwright'
      )
      browser = await chromium.launch({
        channel: process.env.CLIENT_REVIEWS_BROWSER_CHANNEL || 'msedge',
        headless: true,
      })
      const screenshots =
        process.env.QA_SCREENSHOT_DIR ||
        path.join(os.tmpdir(), 'vedelo-reviews-qa')
      await mkdir(screenshots, { recursive: true })
      const logoWebp = await sharp(await pngLogo()).webp().toBuffer()
      // Снимок отрендеренной страницы для оффлайн-гейтов ux-ui: абсолютные
      // ссылки на статику переписываются в file://, логотип — в data URI.
      const exportHtml = async (page, file) => {
        const html = (await page.content())
          .split('/_next/')
          .join(`file://${process.cwd()}/.next/`)
          .replace(
            /https:\/\/cloud\.escalion\.ru\/[^"']*logo\.webp/g,
            `data:image/webp;base64,${logoWebp.toString('base64')}`
          )
        await writeFile(file, html)
      }
      await t.test(
        'UI: настройки страницы отзывов — живой предпросмотр и сохранение',
        async () => {
          const context = await browser.newContext({
            baseURL: baseUrl,
            viewport: { width: 390, height: 900 },
          })
          try {
            await context.route('https://cloud.escalion.ru/**', (route) =>
              route.fulfill({
                status: 200,
                contentType: 'image/webp',
                body: logoWebp,
              })
            )
            await context.addCookies(
              [...cookies].map(([name, value]) => ({
                name,
                value,
                url: baseUrl,
              }))
            )
            const page = await context.newPage(),
              errors = []
            page.on('pageerror', (error) => errors.push(error.message))
            page.on('console', (message) => {
              if (message.type() === 'error') errors.push(message.text())
            })
            await page.goto('/cabinet/review-page')
            await page
              .getByRole('heading', { name: 'Страница отзыва', exact: true })
              .waitFor()
            const nameField = page.getByRole('textbox', {
              name: 'Публичное имя',
            })
            assert.equal(await nameField.inputValue(), APPEARANCE.publicName)
            const preview = page.locator(
              '[aria-label="Предпросмотр страницы отзыва"]'
            )
            await preview
              .getByRole('heading', { name: APPEARANCE.publicName })
              .waitFor()
            await preview
              .getByText(APPEARANCE.greeting, { exact: true })
              .waitFor()
            await nameField.fill('Мастерская «Тест-UI»')
            await preview
              .getByRole('heading', { name: 'Мастерская «Тест-UI»' })
              .waitFor()
            assert.match(
              await page
                .locator('section', {
                  hasText: 'Карточка ссылки в мессенджере',
                })
                .last()
                .innerText(),
              /Мастерская «Тест-UI»/
            )
            {
              const saved = page.waitForResponse(
                (response) =>
                  response.url().endsWith('/api/site/review-page') &&
                  response.request().method() === 'POST'
              )
              await page
                .getByRole('button', { name: 'Сохранить', exact: true })
                .click()
              assert.equal((await saved).status(), 200)
            }
            await page
              .getByText('Оформление страницы отзывов сохранено', {
                exact: true,
              })
              .waitFor()
            await page.reload()
            await page
              .getByRole('heading', { name: 'Страница отзыва', exact: true })
              .waitFor()
            assert.equal(
              await page
                .getByRole('textbox', { name: 'Публичное имя' })
                .inputValue(),
              'Мастерская «Тест-UI»'
            )
            await page.screenshot({
              path: path.join(
                screenshots,
                'review-page-settings-390-light.png'
              ),
            })
            await exportHtml(
              page,
              path.join(screenshots, 'review-page-settings-390.html')
            )
            await page
              .getByRole('button', { name: 'Тёмная', exact: true })
              .click()
            await page.screenshot({
              path: path.join(screenshots, 'review-page-settings-390-dark.png'),
            })
            await page
              .getByRole('textbox', { name: 'Публичное имя' })
              .fill('')
            await page
              .getByText('Пока публичное имя не заполнено')
              .waitFor()
            await page.screenshot({
              path: path.join(
                screenshots,
                'review-page-settings-390-neutral.png'
              ),
            })
            assert.doesNotMatch(
              await page.locator('body').innerText(),
              /Application error|Unhandled Runtime Error/
            )
            assert.deepEqual(errors, [])
          } finally {
            await context.close()
          }
          // Возвращаем согласованное оформление для проверки реальной ссылки.
          const current = await getReviewPage()
          assert.equal(
            (
              await saveReviewPage({
                ...APPEARANCE,
                logoUrl: current.reviewPage.logoUrl,
              })
            ).status,
            200
          )
        }
      )
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
                await context.route('https://cloud.escalion.ru/**', (route) =>
                  route.fulfill({
                    status: 200,
                    contentType: 'image/webp',
                    body: logoWebp,
                  })
                )
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
                // Персонализация из настроек видна клиенту на реальной ссылке.
                await page
                  .getByRole('heading', { name: APPEARANCE.publicName })
                  .waitFor()
                await page
                  .getByText(APPEARANCE.greeting, { exact: true })
                  .waitFor()
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
                await exportHtml(
                  page,
                  path.join(screenshots, `review-${width}-${theme}.html`)
                )
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
          // Роль хранится в JWT: изменение БД не обновляет старую сессию.
          // Администратор обязан войти заново перед проверкой редактора тарифа.
          assert.ok(await session.login('79000000892', password))
          const adminSession = await (await request('/api/auth/session')).json()
          assert.equal(adminSession.user.role, 'dev')
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
      if (cloud) await new Promise((resolve) => cloud.close(resolve))
      assert.ok(
        path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep)
      )
      await rm(folder, { recursive: true, force: true })
    }
  }
)
