import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'

// HTTP-проверка установки первого пароля и смены пароля для Web/PWA и mobile v1
// на временной MongoDB. Запуск: node --test tests/web/changePassword.integration.test.mjs
// (нужна готовая production-сборка `npm run build`; без mongod тест пропускается,
// MONGOD_BINARY задаёт совместимый бинарь/обёртку).

const mongodBinary = process.env.MONGOD_BINARY || 'mongod'
const mongodAvailable =
  spawnSync(mongodBinary, ['--version'], {
    stdio: 'ignore',
    windowsHide: true,
  }).status === 0

const freePort = () =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })

const waitForPort = async (port, child) => {
  for (let i = 0; i < 240; i++) {
    assert.equal(child.exitCode, null, 'Процесс должен работать')
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.on('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', () => resolve(false))
    })
    if (connected) return
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

// Вход как браузер: csrf + credentials, cookie jar в замыкании.
const loginCookies = async (baseUrl, phone, password) => {
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
      phone,
      password,
      csrfToken: csrf.csrfToken,
      json: 'true',
    }),
  })
  const session = await (await request('/api/auth/session')).json()
  return { request, session }
}

const jsonRequest = (request, url, body, method = 'POST') =>
  request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

test(
  'установка первого пароля и смена пароля: web + mobile v1',
  { timeout: 240_000, skip: mongodAvailable ? false : 'mongod недоступен' },
  async (t) => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'vedelo-password-'))
    const mongoPort = await freePort()
    const appPort = await freePort()
    const baseUrl = `http://127.0.0.1:${appPort}`
    const dbName = 'vedelo_password_test'
    const mongoUri = `mongodb://127.0.0.1:${mongoPort}/${dbName}`
    const mongo = spawn(
      mongodBinary,
      ['--port', String(mongoPort), '--bind_ip', '127.0.0.1', '--dbpath', folder],
      { windowsHide: true, stdio: 'ignore' }
    )
    let app
    let db
    try {
      await waitForPort(mongoPort, mongo)
      db = await mongoose.createConnection(mongoUri).asPromise()

      const tariffId = new mongoose.Types.ObjectId()
      const userA = new mongoose.Types.ObjectId()
      const userB = new mongoose.Types.ObjectId()
      const userVk = new mongoose.Types.ObjectId()
      const passA = 'A-pass-123456'
      const passB = 'B-pass-123456'
      const passVk = 'Vk-pass-123456'
      await db.collection('tariffs').insertOne({
        _id: tariffId,
        title: 'QA',
        eventsPerMonth: 100,
      })
      const insertUser = (id, phone, password, extra = {}) =>
        db.collection('users').insertOne({
          _id: id,
          tenantId: id,
          phone,
          password,
          tariffId,
          role: 'user',
          archive: false,
          ...extra,
        })
      await insertUser(userA, '79000000901', await bcrypt.hash(passA, 4))
      await insertUser(userB, '79000000902', await bcrypt.hash(passB, 4))
      // VK-подобный аккаунт: входим со старым паролем, затем обнуляем его.
      await insertUser(userVk, '79000000903', await bcrypt.hash(passVk, 4), {
        registrationType: 'vk',
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
            MONGODB_DBNAME: dbName,
            NEXTAUTH_URL: baseUrl,
            NEXTAUTH_SECRET: 'change-password-test-secret',
          },
        }
      )
      let output = ''
      app.stdout.on('data', (chunk) => {
        output = (output + chunk).slice(-3000)
      })
      app.stderr.on('data', (chunk) => {
        output = (output + chunk).slice(-3000)
      })
      await waitForPort(appPort, app)

      const readUser = (id) => db.collection('users').findOne({ _id: id })
      const passwordMatches = async (id, candidate) => {
        const user = await readUser(id)
        return bcrypt.compare(candidate, String(user?.password || ''))
      }
      const wipePassword = (id) =>
        db.collection('users').updateOne({ _id: id }, { $set: { password: '' } })
      const mobileLogin = (phone, password) =>
        fetch(baseUrl + '/api/mobile/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            phone,
            password,
            deviceId: 'qa-device',
            deviceName: 'QA',
            platform: 'android',
          }),
        }).then(async (response) => ({
          status: response.status,
          body: await response.json(),
        }))
      const mobileRequest = (token, url, options = {}) =>
        fetch(baseUrl + url, {
          ...options,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            ...(options.headers || {}),
          },
        })

      await t.test('web: без авторизации статус и смена пароля запрещены', async () => {
        assert.equal(
          (await fetch(baseUrl + '/api/auth/change-password')).status,
          401
        )
        assert.equal(
          (
            await fetch(baseUrl + '/api/auth/change-password', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ newPassword: 'nobody-pass-123' }),
            })
          ).status,
          401
        )
      })

      await t.test(
        'web: статус — boolean без пароля и хеша, первая установка из сессии VK',
        async () => {
          const { request: requestVk } = await loginCookies(
            baseUrl,
            '79000000903',
            passVk
          )
          await wipePassword(userVk)

          const statusVk = await requestVk('/api/auth/change-password')
          assert.equal(statusVk.status, 200)
          const statusVkRaw = await statusVk.text()
          assert.deepEqual(JSON.parse(statusVkRaw), {
            success: true,
            hasPassword: false,
          })

          const set = await jsonRequest(
            requestVk,
            '/api/auth/change-password',
            {
              newPassword: 'Vk-first-pass-123',
            }
          )
          assert.equal(set.status, 200)
          const setRaw = await set.text()
          assert.deepEqual(JSON.parse(setRaw), { success: true, mode: 'set' })
          assert.equal(setRaw.includes('$2'), false)
          assert.equal(await passwordMatches(userVk, 'Vk-first-pass-123'), true)

          const statusAfter = await (
            await requestVk('/api/auth/change-password')
          ).json()
          assert.deepEqual(statusAfter, { success: true, hasPassword: true })

          // Повторная смена после первой установки: пустой текущий отказ.
          const withoutCurrent = await jsonRequest(
            requestVk,
            '/api/auth/change-password',
            { newPassword: 'Vk-second-pass-123' }
          )
          assert.equal(withoutCurrent.status, 400)
          assert.equal(
            (await withoutCurrent.json()).error,
            'Введите текущий пароль'
          )
          assert.equal(
            await passwordMatches(userVk, 'Vk-first-pass-123'),
            true
          )
        }
      )

      const { request: requestA, session: sessionA } = await loginCookies(
        baseUrl,
        '79000000901',
        passA
      )
      assert.ok(sessionA.user?._id, 'web-сессия пользователя A создана')

      await t.test(
        'web: статус для установленного пароля, пустой/неверный/короткий ввод',
        async () => {
          const status = await requestA('/api/auth/change-password')
          assert.equal(status.status, 200)
          const raw = await status.text()
          const body = JSON.parse(raw)
          assert.deepEqual(body, { success: true, hasPassword: true })
          const stored = String((await readUser(userA))?.password || '')
          assert.equal(raw.includes(stored), false)
          assert.equal(raw.includes('$2'), false)

          const wrong = await jsonRequest(requestA, '/api/auth/change-password', {
            currentPassword: 'wrong-pass-123',
            newPassword: 'next-pass-123',
          })
          assert.equal(wrong.status, 400)
          assert.equal(
            (await wrong.json()).error,
            'Текущий пароль указан неверно'
          )
          const empty = await jsonRequest(requestA, '/api/auth/change-password', {
            currentPassword: '',
            newPassword: 'next-pass-123',
          })
          assert.equal(empty.status, 400)
          assert.equal((await empty.json()).error, 'Введите текущий пароль')
          const short = await jsonRequest(requestA, '/api/auth/change-password', {
            currentPassword: passA,
            newPassword: 'short',
          })
          assert.equal(short.status, 400)
          assert.equal(
            (await short.json()).error,
            'Новый пароль должен быть не менее 8 символов'
          )
          assert.equal(await passwordMatches(userA, passA), true)
        }
      )

      await t.test(
        'web: чужой userId/tenant в payload игнорируется, меняется только своя запись',
        async () => {
          const beforeB = String((await readUser(userB))?.password || '')
          const response = await jsonRequest(
            requestA,
            '/api/auth/change-password',
            {
              currentPassword: passA,
              newPassword: 'A-new-pass-123',
              userId: String(userB),
              tenantId: String(userB),
            }
          )
          assert.equal(response.status, 200)
          assert.deepEqual(await response.json(), {
            success: true,
            mode: 'change',
          })
          assert.equal(await passwordMatches(userA, 'A-new-pass-123'), true)
          assert.equal(
            String((await readUser(userB))?.password || ''),
            beforeB,
            'пароль чужого tenant не изменён'
          )
          const relogin = await loginCookies(
            baseUrl,
            '79000000901',
            'A-new-pass-123'
          )
          assert.ok(relogin.session.user?._id, 'вход с новым паролем работает')
          const oldLogin = await loginCookies(baseUrl, '79000000901', passA)
          assert.equal(oldLogin.session.user?._id, undefined)
        }
      )

      await t.test('web: гонка установки и смены — побеждает ровно один запрос', async () => {
        const { request: requestVk } = await loginCookies(
          baseUrl,
          '79000000903',
          'Vk-first-pass-123'
        )
        await wipePassword(userVk)
        const installRace = await Promise.all(
          ['Conc-first-111', 'Conc-second-222'].map((newPassword) =>
            jsonRequest(requestVk, '/api/auth/change-password', { newPassword })
          )
        )
        assert.deepEqual(
          installRace.map((response) => response.status).sort(),
          [200, 409]
        )
        const installWinners = await Promise.all(
          ['Conc-first-111', 'Conc-second-222'].map((candidate) =>
            passwordMatches(userVk, candidate)
          )
        )
        assert.equal(installWinners.filter(Boolean).length, 1)

        const old = 'Race-old-123'
        await db
          .collection('users')
          .updateOne(
            { _id: userVk },
            { $set: { password: await bcrypt.hash(old, 4) } }
          )
        const changeRace = await Promise.all(
          ['Race-new-111', 'Race-new-222'].map((newPassword) =>
            jsonRequest(requestVk, '/api/auth/change-password', {
              currentPassword: old,
              newPassword,
            })
          )
        )
        assert.deepEqual(
          changeRace.map((response) => response.status).sort(),
          [200, 409]
        )
        const changeWinners = await Promise.all(
          ['Race-new-111', 'Race-new-222'].map((candidate) =>
            passwordMatches(userVk, candidate)
          )
        )
        assert.equal(changeWinners.filter(Boolean).length, 1)
      })

      await t.test(
        'mobile v1: статус, первый пароль, отзыв сессий, ошибки и гонка',
        async () => {
          await db
            .collection('users')
            .updateOne(
              { _id: userVk },
              { $set: { password: await bcrypt.hash('Mob-pass-123456', 4) } }
            )
          const mobile = await mobileLogin('79000000903', 'Mob-pass-123456')
          assert.equal(mobile.status, 200)
          // Смена пароля отзывает все прежние mobile-сессии, поэтому после
          // каждого успешного запроса продолжаем с новым accessToken.
          let token = mobile.body.data.accessToken
          assert.ok(token, 'mobile-сессия выдана')
          const firstSession = await db
            .collection('mobilesessions')
            .findOne({ userId: userVk, revokedAt: null })
          assert.ok(firstSession, 'активная mobile-сессия записана')

          // VK-аккаунт: вход состоялся, пароль ещё не задан.
          await wipePassword(userVk)
          const status = await mobileRequest(
            token,
            '/api/mobile/v1/auth/change-password'
          )
          assert.equal(status.status, 200)
          const statusBody = await status.json()
          assert.equal(statusBody.success, true)
          assert.deepEqual(statusBody.data, { hasPassword: false })

          const set = await mobileRequest(
            token,
            '/api/mobile/v1/auth/change-password',
            {
              method: 'POST',
              body: JSON.stringify({ newPassword: 'Mob-first-pass-123' }),
            }
          )
          const setRaw = await set.text()
          assert.equal(set.status, 200)
          const setBody = JSON.parse(setRaw)
          assert.equal(setBody.success, true)
          assert.ok(setBody.data.accessToken, 'выдана новая mobile-сессия')
          token = setBody.data.accessToken
          assert.equal(setRaw.includes('password'), false, 'DTO без поля password')
          assert.equal(setRaw.includes('$2'), false, 'DTO без bcrypt-хеша')
          assert.equal(await passwordMatches(userVk, 'Mob-first-pass-123'), true)
          const revoked = await db
            .collection('mobilesessions')
            .findOne({ _id: firstSession._id })
          assert.ok(
            revoked?.revokedAt,
            'прежняя mobile-сессия отозвана после смены пароля'
          )

          const empty = await mobileRequest(
            token,
            '/api/mobile/v1/auth/change-password',
            {
              method: 'POST',
              body: JSON.stringify({ newPassword: 'Mob-second-pass-123' }),
            }
          )
          assert.equal(empty.status, 400)
          const emptyBody = await empty.json()
          assert.equal(emptyBody.error.code, 'CURRENT_PASSWORD_REQUIRED')
          assert.equal(emptyBody.error.message, 'Введите текущий пароль')

          const wrong = await mobileRequest(
            token,
            '/api/mobile/v1/auth/change-password',
            {
              method: 'POST',
              body: JSON.stringify({
                currentPassword: 'wrong-pass',
                newPassword: 'Mob-second-pass-123',
              }),
            }
          )
          assert.equal(wrong.status, 400)
          assert.equal(
            (await wrong.json()).error.message,
            'Текущий пароль указан неверно'
          )

          // Установленный APK не присылает repeatPassword — сервер не требует его.
          const change = await mobileRequest(
            token,
            '/api/mobile/v1/auth/change-password',
            {
              method: 'POST',
              body: JSON.stringify({
                currentPassword: 'Mob-first-pass-123',
                newPassword: 'Mob-second-pass-123',
              }),
            }
          )
          assert.equal(change.status, 200)
          const changeBody = await change.json()
          token = changeBody.data.accessToken
          assert.equal(await passwordMatches(userVk, 'Mob-second-pass-123'), true)

          const noAuth = await fetch(
            baseUrl + '/api/mobile/v1/auth/change-password'
          )
          assert.equal(noAuth.status, 401)

          await wipePassword(userVk)
          const race = await Promise.all(
            ['Mob-conc-111', 'Mob-conc-222'].map((newPassword) =>
              mobileRequest(token, '/api/mobile/v1/auth/change-password', {
                method: 'POST',
                body: JSON.stringify({ newPassword }),
              })
            )
          )
          assert.deepEqual(
            race.map((response) => response.status).sort(),
            [200, 409]
          )
          const winners = await Promise.all(
            ['Mob-conc-111', 'Mob-conc-222'].map((candidate) =>
              passwordMatches(userVk, candidate)
            )
          )
          assert.equal(winners.filter(Boolean).length, 1)
        }
      )
    } finally {
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
