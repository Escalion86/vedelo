import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { getSyncOperationFingerprint } from '../../server/mobile/syncOperations.js'
import { runWebCoreSmoke } from '../web/coreSmoke.mjs'
import { runIntegrationIsolationSmoke } from '../web/integrationIsolationSmoke.mjs'
import { runBrowserSmoke } from '../web/browserSmoke.mjs'
import { runRestartSmoke } from '../web/restartSmoke.mjs'
import { runPublicLeadSmoke } from '../web/publicLeadSmoke.mjs'
import { runDocumentsHttpSmoke } from '../server/documentsHttpSmoke.mjs'
import { runPaymentProcessingSmoke } from '../server/paymentProcessingSmoke.cjs'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const mongodBinary = process.env.MONGOD_BINARY || 'mongod'
const mongodAvailable =
  spawnSync(mongodBinary, ['--version'], {
    stdio: 'ignore',
    windowsHide: true,
  }).status === 0

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })

const waitForPort = async (port, processRef, name, getOutput = () => '') => {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) {
      throw new Error(`${name} завершился до запуска\n${getOutput()}`)
    }
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
      socket.setTimeout(250, () => {
        socket.destroy()
        resolve(false)
      })
    })
    if (connected) return
    await new Promise((resolve) => setTimeout(resolve, 75))
  }
  throw new Error(`${name} не запустился за 30 секунд\n${getOutput()}`)
}

const terminate = async (processRef) => {
  if (!processRef || processRef.exitCode !== null) return
  const exited = once(processRef, 'exit')
  processRef.kill('SIGTERM')
  await Promise.race([
    exited,
    new Promise((resolve) => {
      const timer = setTimeout(resolve, 5_000)
      timer.unref()
    }),
  ])
  if (processRef.exitCode === null) processRef.kill('SIGKILL')
}

const readJson = async (responseValue) => {
  const response = await responseValue
  const body = await response.json()
  return { response, body }
}

const apiRequest = (baseUrl, pathname, options = {}) =>
  fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'content-type': 'application/json' }),
      ...(options.headers || {}),
    },
  })

const authHeaders = (accessToken) => ({
  authorization: `Bearer ${accessToken}`,
})

test(
  'HTTP integration: mobile auth, tenant isolation и files',
  {
    timeout: process.env.PLAYWRIGHT_MODULE ? 240_000 : 120_000,
    skip: mongodAvailable
      ? false
      : 'mongod не установлен; задайте MONGOD_BINARY для HTTP integration-тестов',
  },
  async (t) => {
    const dbPath = await mkdtemp(
      path.join(os.tmpdir(), 'artistcrm-mobile-http-')
    )
    const mongoPort = await getFreePort()
    const appPort = await getFreePort()
    const cloudPort = await getFreePort()
    const dbName = `artistcrm_mobile_http_${Date.now()}`
    const mongoUri = `mongodb://127.0.0.1:${mongoPort}`
    const baseUrl = `http://127.0.0.1:${appPort}`
    const cloudRequests = []
    const providerRequests = []
    let db
    let appProcess
    let appOutput = ''

    const cloudServer = createServer(async (req, res) => {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const captured = {
        url: req.url || '',
        headers: req.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        bytes: Buffer.concat(chunks),
      }
      if (req.url === '/api') {
        cloudRequests.push(captured)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify([{ url: 'https://files.example.test/document.docx' }])
        )
        return
      }
      if (req.url === '/api/private-files/upload') {
        cloudRequests.push(captured)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            data: {
              name: 'document.docx',
              size: captured.bytes.length,
              contentType:
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              checksum: 'sha256:integration',
              createdAt: '2026-09-14T00:00:00.000Z',
            },
          })
        )
        return
      }
      if (req.url === '/api/private-files/access-url') {
        cloudRequests.push(captured)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          JSON.stringify({
            success: true,
            data: {
              url: 'https://cloud.escalion.ru/api/private-files/content?signed=1',
              expiresAt: '2026-09-14T00:05:00.000Z',
            },
          })
        )
        return
      }
      if (req.url === '/api/private-files' && req.method === 'DELETE') {
        cloudRequests.push(captured)
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ success: true, data: { deleted: true } }))
        return
      }
      providerRequests.push(captured)
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.url === '/avito/token/') {
        res.end(JSON.stringify({ access_token: 'mock-avito-access-token' }))
        return
      }
      if (req.url?.startsWith('/avito/messenger/')) {
        res.end(JSON.stringify({ id: 'mock-avito-message-id' }))
        return
      }
      if (req.url === '/vk/messages.send') {
        res.end(JSON.stringify({ response: 987654 }))
        return
      }
      if (req.url === '/vk/groups.getById') {
        res.end(JSON.stringify({ response: [{ id: 246810 }] }))
        return
      }
      if (req.url === '/sms') {
        res.end(JSON.stringify({ accepted: true }))
        return
      }
      if (
        req.url?.startsWith(
          '/telefonip/api/v1/authcalls/mock-telefonip-token/reverse_auth_phone_get'
        )
      ) {
        const requestedPhone =
          new URL(req.url, 'http://mock.local').searchParams.get('phone') || ''
        const normalizedPhone = requestedPhone.startsWith('8')
          ? `7${requestedPhone.slice(1)}`
          : requestedPhone
        const callId = normalizedPhone.endsWith('0003') ? 3003 : 3002
        res.end(
          JSON.stringify({
            id: callId,
            auth_phone: '78005553535',
          })
        )
        return
      }
      if (
        req.url?.startsWith(
          '/telefonip/api/v1/authcalls/mock-telefonip-token/reverse_auth_phone_check/'
        )
      ) {
        const callId = Number(req.url.split('/').pop())
        res.end(
          JSON.stringify({
            status: 'ok',
            auth_phone: callId === 3003 ? '79000000003' : '79000000002',
          })
        )
        return
      }
      if (req.url?.startsWith('/vk-id/oauth2/auth')) {
        const params = new URLSearchParams(captured.body)
        const existing = params.get('code') === 'vk-existing-code'
        res.end(
          JSON.stringify({
            access_token: existing
              ? 'mock-vk-existing-token'
              : 'mock-vk-new-token',
            id_token: 'mock-vk-id-token',
            user_id: existing ? 'vk-existing-a' : 'vk-new-user',
          })
        )
        return
      }
      if (req.url?.startsWith('/vk-id/oauth2/user_info')) {
        const params = new URLSearchParams(captured.body)
        const existing = params.get('access_token') === 'mock-vk-existing-token'
        res.end(
          JSON.stringify({
            user: {
              user_id: existing ? 'vk-existing-a' : 'vk-new-user',
              phone: existing ? '79000000001' : '79000000004',
              email: existing
                ? 'tenant-a-vk@example.test'
                : 'new-vk@example.test',
              first_name: existing ? 'VK Tenant A' : 'Новый VK',
              last_name: 'Пользователь',
            },
          })
        )
        return
      }
      if (req.url === '/google-token') {
        res.end(
          JSON.stringify({
            access_token: 'mock-google-callback-access',
            refresh_token: 'mock-google-callback-refresh',
            expires_in: 3600,
            scope: 'https://www.googleapis.com/auth/calendar',
            token_type: 'Bearer',
          })
        )
        return
      }
      if (req.url?.startsWith('/calendar/v3/users/me/calendarList')) {
        res.end(
          JSON.stringify({
            items: [
              {
                id: 'primary',
                summary: 'Основной',
                primary: true,
                accessRole: 'owner',
              },
              {
                id: 'team-calendar',
                summary: 'Выступления',
                accessRole: 'writer',
              },
            ],
          })
        )
        return
      }
      res.end(JSON.stringify({ error: 'unknown_mock_route' }))
    })

    const mongod = spawn(
      mongodBinary,
      [
        '--dbpath',
        dbPath,
        '--port',
        String(mongoPort),
        '--bind_ip',
        '127.0.0.1',
        '--noauth',
        '--quiet',
      ],
      { stdio: 'ignore', windowsHide: true }
    )

    try {
      await waitForPort(mongoPort, mongod, 'mongod')
      db = await mongoose
        .createConnection(mongoUri, {
          dbName,
          serverSelectionTimeoutMS: 5_000,
        })
        .asPromise()

      const tenantA = new mongoose.Types.ObjectId()
      const tenantB = new mongoose.Types.ObjectId()
      const tariffId = new mongoose.Types.ObjectId()
      const taskEventA = new mongoose.Types.ObjectId()
      const taskEventB = new mongoose.Types.ObjectId()
      const referralA = new mongoose.Types.ObjectId()
      const referralB = new mongoose.Types.ObjectId()
      const avitoConversationA = new mongoose.Types.ObjectId()
      const avitoConversationB = new mongoose.Types.ObjectId()
      const vkConversationA = new mongoose.Types.ObjectId()
      const vkConversationB = new mongoose.Types.ObjectId()
      const password = 'MobilePassword123!'
      const passwordHash = await bcrypt.hash(password, 4)
      const now = new Date(Date.now() - 60_000)

      await db.collection('users').insertMany([
        {
          _id: tenantA,
          tenantId: tenantA,
          firstName: 'Tenant A',
          phone: '79000000001',
          whatsapp: 79000000011,
          telegram: 'tenant_a',
          vk: 'tenant-a-vk',
          password: passwordHash,
          tariffId,
          role: 'user',
          archive: false,
          registrationType: 'phone',
          googleCalendar: {
            enabled: true,
            calendarName: 'Календарь A',
            refreshToken: 'google-refresh-secret-a',
            accessToken: 'google-access-secret-a',
            tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
          },
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: tenantB,
          tenantId: tenantB,
          firstName: 'Tenant B',
          phone: '79000000002',
          whatsapp: 79000000022,
          telegram: 'tenant_b',
          password: passwordHash,
          tariffId,
          role: 'user',
          archive: false,
          registrationType: 'phone',
          createdAt: now,
          updatedAt: now,
        },
      ])
      await db.collection('tariffs').insertOne({
        _id: tariffId,
        title: 'HTTP integration',
        eventsPerMonth: 100,
        allowCalendarSync: false,
        allowStatistics: true,
        allowDocuments: true,
        allowTelephony: true,
        allowAi: true,
        allowAvitoIntegration: true,
        allowVkIntegration: true,
        allowPublicLeadApi: true,
        createdAt: now,
        updatedAt: now,
      })
      await db.collection('clients').insertMany([
        {
          _id: new mongoose.Types.ObjectId(),
          tenantId: tenantA,
          firstName: 'Клиент tenant A',
          syncVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
        {
          _id: new mongoose.Types.ObjectId(),
          tenantId: tenantB,
          firstName: 'Клиент tenant B',
          syncVersion: 1,
          createdAt: now,
          updatedAt: now,
        },
      ])
      await Promise.all([
        db.collection('users').insertMany([
          {
            _id: referralA,
            tenantId: referralA,
            firstName: 'Реферал tenant A',
            referrerId: tenantA,
            registrationType: 'phone',
            archive: false,
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: referralB,
            tenantId: referralB,
            firstName: 'Реферал tenant B',
            referrerId: tenantB,
            registrationType: 'phone',
            archive: false,
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('events').insertMany([
          {
            _id: taskEventA,
            tenantId: tenantA,
            eventType: 'Задача tenant A',
            description: 'Статистика tenant A',
            status: 'active',
            syncVersion: 1,
            additionalEvents: [
              {
                _id: new mongoose.Types.ObjectId(),
                title: 'Перезвонить tenant A',
                description: 'Только tenant A',
                date: new Date(Date.now() - 24 * 60 * 60 * 1000),
                done: false,
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: taskEventB,
            tenantId: tenantB,
            eventType: 'Задача tenant B',
            description: 'Статистика tenant B',
            status: 'active',
            syncVersion: 1,
            additionalEvents: [
              {
                _id: new mongoose.Types.ObjectId(),
                title: 'Перезвонить tenant B',
                description: 'Только tenant B',
                date: new Date(Date.now() - 24 * 60 * 60 * 1000),
                done: false,
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('transactions').insertMany([
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            amount: 1111,
            type: 'income',
            category: 'other',
            paymentMethod: 'transfer',
            date: now,
            syncVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            amount: 2222,
            type: 'income',
            category: 'other',
            paymentMethod: 'transfer',
            date: now,
            syncVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('services').insertMany([
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            title: 'Услуга tenant A',
            price: 100,
            syncVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            title: 'Услуга tenant B',
            price: 200,
            syncVersion: 1,
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('calls').insertMany([
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            provider: 'novofon',
            providerCallId: 'provider-secret-a',
            phone: '+79000000001',
            status: 'ready',
            transcript: 'Звонок tenant A',
            recordingStorageKey: 'storage-secret-a',
            startedAt: now,
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            provider: 'novofon',
            providerCallId: 'provider-secret-b',
            phone: '+79000000002',
            status: 'ready',
            transcript: 'Звонок tenant B',
            recordingStorageKey: 'storage-secret-b',
            startedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('avitoconversations').insertMany([
          {
            _id: avitoConversationA,
            tenantId: tenantA,
            avitoChatId: 'avito-chat-a',
            avitoUserId: 'avito-user-a',
            clientName: 'Avito клиент A',
            status: 'open',
            lastMessageText: 'Avito входящее A',
            lastMessageAt: now,
            unreadCount: 2,
            raw: { providerSecret: 'avito-conversation-raw-a' },
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: avitoConversationB,
            tenantId: tenantB,
            avitoChatId: 'avito-chat-b',
            avitoUserId: 'avito-user-b',
            clientName: 'Avito клиент B',
            status: 'open',
            lastMessageText: 'Avito входящее B',
            lastMessageAt: now,
            unreadCount: 1,
            raw: { providerSecret: 'avito-conversation-raw-b' },
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('avitomessages').insertMany([
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            conversationId: avitoConversationA,
            avitoChatId: 'avito-chat-a',
            avitoMessageId: 'avito-provider-message-a',
            direction: 'incoming',
            text: 'Avito входящее A',
            sentAt: now,
            status: 'received',
            raw: { secret: 'avito-message-raw-a' },
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            conversationId: avitoConversationB,
            avitoChatId: 'avito-chat-b',
            avitoMessageId: 'avito-provider-message-b',
            direction: 'incoming',
            text: 'Avito входящее B',
            sentAt: now,
            status: 'received',
            raw: { secret: 'avito-message-raw-b' },
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('vkconversations').insertMany([
          {
            _id: vkConversationA,
            tenantId: tenantA,
            vkPeerId: 'vk-peer-a',
            vkUserId: 'vk-user-a',
            vkGroupId: 'vk-group-a',
            clientName: 'VK клиент A',
            status: 'open',
            lastMessageText: 'VK входящее A',
            lastMessageAt: now,
            unreadCount: 3,
            raw: { providerSecret: 'vk-conversation-raw-a' },
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: vkConversationB,
            tenantId: tenantB,
            vkPeerId: 'vk-peer-b',
            vkUserId: 'vk-user-b',
            vkGroupId: 'vk-group-b',
            clientName: 'VK клиент B',
            status: 'open',
            lastMessageText: 'VK входящее B',
            lastMessageAt: now,
            unreadCount: 1,
            raw: { providerSecret: 'vk-conversation-raw-b' },
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('vkmessages').insertMany([
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            conversationId: vkConversationA,
            vkPeerId: 'vk-peer-a',
            vkMessageId: 'vk-provider-message-a',
            vkUserId: 'vk-user-a',
            direction: 'incoming',
            text: 'VK входящее A',
            sentAt: now,
            status: 'received',
            raw: { secret: 'vk-message-raw-a' },
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            conversationId: vkConversationB,
            vkPeerId: 'vk-peer-b',
            vkMessageId: 'vk-provider-message-b',
            vkUserId: 'vk-user-b',
            direction: 'incoming',
            text: 'VK входящее B',
            sentAt: now,
            status: 'received',
            raw: { secret: 'vk-message-raw-b' },
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('sitesettings').insertMany([
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantA,
            syncVersion: 1,
            towns: ['Город A'],
            defaultTown: 'Город A',
            timeZone: 'Asia/Krasnoyarsk',
            custom: {
              eventTypes: ['Тип A'],
              additionalEventsPushEnabled: true,
              additionalEventsPushTime: '10:15',
              publicLeadPushEnabled: true,
              avitoEnabled: true,
              avitoClientId: 'avito-client-a',
              avitoClientSecret: 'avito-secret-a',
              avitoUserId: 'avito-user-a',
              vkGroupEnabled: true,
              vkGroupId: 'vk-group-a',
              vkGroupAccessToken: 'vk-secret-a',
              novofonEnabled: true,
              novofonApiKey: 'novofon-api-secret-a',
              novofonWebhookSecret: 'novofon-webhook-secret-a',
              aitunnelEnabled: true,
              aitunnelKey: 'aitunnel-secret-a',
              aiTranscriptionProvider: 'aitunnel',
              aiAnalysisProvider: 'aitunnel',
              publicLeadEnabled: true,
              publicLeadApiKey: 'lead-secret-a',
              publicLeadApiKeys: [
                {
                  id: 'lead-key-a',
                  name: 'Сайт A',
                  key: 'lead-secret-a',
                  enabled: true,
                },
              ],
              contractArtistStatus: 'individual_entrepreneur',
              contractArtistFullName: 'ИП Артист Tenant A',
              contractArtistName: 'Артист A',
              contractArtistOgrnip: '123456789012345',
              contractArtistInn: '123456789012',
              contractArtistBankName: 'Банк A',
              contractArtistBik: '044525225',
              contractArtistCheckingAccount: '40702810000000000001',
              contractArtistCorrespondentAccount: '30101810000000000225',
              contractArtistLegalAddress: 'Адрес A',
              documentTemplates: [
                {
                  id: 'template-a',
                  name: 'Шаблон tenant A',
                  type: 'contract',
                  fileName: 'tenant-a.docx',
                  templateBase64: Buffer.from('template-a').toString('base64'),
                  createdAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                },
              ],
            },
            createdAt: now,
            updatedAt: now,
          },
          {
            _id: new mongoose.Types.ObjectId(),
            tenantId: tenantB,
            syncVersion: 1,
            towns: ['Город B'],
            defaultTown: 'Город B',
            timeZone: 'Europe/Moscow',
            custom: {
              eventTypes: ['Тип B'],
              additionalEventsPushEnabled: false,
              additionalEventsPushTime: '11:30',
              documentTemplates: [
                {
                  id: 'template-b',
                  name: 'Шаблон tenant B',
                  type: 'act',
                  fileName: 'tenant-b.docx',
                  templateBase64: Buffer.from('template-b').toString('base64'),
                  createdAt: now.toISOString(),
                  updatedAt: now.toISOString(),
                },
              ],
            },
            createdAt: now,
            updatedAt: now,
          },
        ]),
        db.collection('expopushtokens').insertMany([
          {
            tenantId: tenantA,
            pushToken: 'ExponentPushToken[tenant-a]',
            deviceId: 'device-a',
            platform: 'android',
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            tenantId: tenantB,
            pushToken: 'ExponentPushToken[tenant-b-1]',
            deviceId: 'device-b',
            platform: 'android',
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            tenantId: tenantB,
            pushToken: 'ExponentPushToken[tenant-b-2]',
            deviceId: 'device-b-second',
            platform: 'android',
            isActive: true,
            createdAt: now,
            updatedAt: now,
          },
        ]),
      ])
      await Promise.all([
        db
          .collection('mobilesessions')
          .createIndex({ refreshTokenHash: 1 }, { unique: true }),
        db
          .collection('mobilesyncoperations')
          .createIndex({ tenantId: 1, operationId: 1 }, { unique: true }),
        db
          .collection('mobilesynctombstones')
          .createIndex(
            { tenantId: 1, entityType: 1, entityId: 1 },
            { unique: true }
          ),
      ])

      await new Promise((resolve, reject) => {
        cloudServer.once('error', reject)
        cloudServer.listen(cloudPort, '127.0.0.1', resolve)
      })

      appProcess = spawn(
        process.execPath,
        [
          path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
          'start',
          '-H',
          '127.0.0.1',
          '-p',
          String(appPort),
        ],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            MONGODB_URI: mongoUri,
            MONGODB_DBNAME: dbName,
            NEXTAUTH_SECRET: 'mobile-http-integration-secret',
            NEXTAUTH_URL: baseUrl,
            YOOKASSA_WEBHOOK_SECRET: 'isolation-yookassa-secret',
            ESCALIONCLOUD_PASSWORD: 'integration-password',
            ESCALIONCLOUD_API_URL: `http://127.0.0.1:${cloudPort}/api`,
            AVITO_API_BASE_URL: `http://127.0.0.1:${cloudPort}/avito`,
            VK_API_BASE_URL: `http://127.0.0.1:${cloudPort}/vk`,
            TELEFONIP: 'mock-telefonip-token',
            TELEFONIP_API_BASE_URL: `http://127.0.0.1:${cloudPort}/telefonip`,
            PHONE_SMS_SEND_WEBHOOK: `http://127.0.0.1:${cloudPort}/sms`,
            VK_ID_BASE_URL: `http://127.0.0.1:${cloudPort}/vk-id`,
            VK_ID_APP_ID: 'mock-vk-app-id',
            VK_ID_CLIENT_SECRET: 'mock-vk-client-secret',
            VK_ID_REDIRECT_URI: 'vedelo://auth/vk',
            GOOGLE_OAUTH_CLIENT_ID: 'mock-google-client-id',
            GOOGLE_OAUTH_CLIENT_SECRET: 'mock-google-client-secret',
            GOOGLE_OAUTH_REDIRECT_URI: `${baseUrl}/api/google-calendar/callback`,
            GOOGLE_OAUTH_AUTH_URL: `http://127.0.0.1:${cloudPort}/google-auth`,
            GOOGLE_OAUTH_TOKEN_URL: `http://127.0.0.1:${cloudPort}/google-token`,
            GOOGLE_CALENDAR_API_BASE_URL: `http://127.0.0.1:${cloudPort}`,
            OPENAI_API_KEY: '',
            AITUNNEL_KEY: '',
            DEEPSEEK_API_KEY: '',
            AI_ANALYSIS_API_URL: `http://127.0.0.1:${cloudPort}/ai`,
            AI_TRANSCRIPTION_API_URL: `http://127.0.0.1:${cloudPort}/transcription`,
          },
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        }
      )
      const collectOutput = (chunk) => {
        appOutput = `${appOutput}${chunk}`.slice(-12_000)
      }
      appProcess.stdout.on('data', collectOutput)
      appProcess.stderr.on('data', collectOutput)
      await waitForPort(appPort, appProcess, 'Next.js', () => appOutput)

      const login = async (phone, deviceId) =>
        readJson(
          await apiRequest(baseUrl, '/api/mobile/v1/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              phone,
              password,
              deviceId,
              platform: 'android',
            }),
          })
        )

      const loginA = await login('79000000001', 'device-a')
      const loginASecond = await login('79000000001', 'device-a-second')
      const loginB = await login('79000000002', 'device-b')
      assert.equal(loginA.response.status, 200, JSON.stringify(loginA.body))
      assert.equal(
        loginASecond.response.status,
        200,
        JSON.stringify(loginASecond.body)
      )
      assert.equal(loginB.response.status, 200, JSON.stringify(loginB.body))
      assert.equal(loginA.body.data.user.tenantId, String(tenantA))
      assert.equal(loginB.body.data.user.tenantId, String(tenantB))

      await t.test('refresh атомарен на уровне HTTP route', async () => {
        const refresh = () =>
          readJson(
            apiRequest(baseUrl, '/api/mobile/v1/auth/refresh', {
              method: 'POST',
              body: JSON.stringify({
                refreshToken: loginA.body.data.refreshToken,
                deviceId: 'device-a',
              }),
            })
          )
        const results = await Promise.all([refresh(), refresh()])
        assert.deepEqual(
          results.map(({ response }) => response.status).sort(),
          [200, 401]
        )
        const successful = results.find(({ response }) => response.ok)
        assert.ok(successful.body.data.refreshToken)

        const replay = await refresh()
        assert.equal(replay.response.status, 401)
        loginA.body.data = successful.body.data
      })

      await t.test('resource endpoints не смешивают tenant', async () => {
        const syncA = await readJson(
          await apiRequest(baseUrl, '/api/mobile/v1/sync/pull', {
            headers: authHeaders(loginA.body.data.accessToken),
          })
        )
        const syncB = await readJson(
          await apiRequest(baseUrl, '/api/mobile/v1/sync/pull', {
            headers: authHeaders(loginB.body.data.accessToken),
          })
        )
        assert.equal(syncA.response.status, 200, JSON.stringify(syncA.body))
        assert.equal(syncB.response.status, 200, JSON.stringify(syncB.body))
        assert.deepEqual(
          syncA.body.data.entities.clients.map((item) => item.firstName),
          ['Клиент tenant A']
        )
        assert.deepEqual(
          syncB.body.data.entities.clients.map((item) => item.firstName),
          ['Клиент tenant B']
        )
      })

      await t.test(
        'online resource matrix изолирует пользовательские разделы',
        async () => {
          const get = (path, accessToken, headers = {}) =>
            readJson(
              apiRequest(baseUrl, path, {
                headers: { ...authHeaders(accessToken), ...headers },
              })
            )

          const bootstrapA = await get(
            '/api/mobile/v1/bootstrap',
            loginA.body.data.accessToken
          )
          assert.equal(
            bootstrapA.response.status,
            200,
            JSON.stringify(bootstrapA.body)
          )
          assert.equal(
            bootstrapA.body.data.entities.clients.every(
              (client) => client.tenantId === String(tenantA)
            ),
            true
          )
          assert.deepEqual(bootstrapA.body.data.entities.siteSettings.towns, [
            'Город A',
          ])
          assert.equal(bootstrapA.body.data.access.allowDocuments, true)
          assert.equal('user' in bootstrapA.body.data.access, false)
          assert.equal('tariff' in bootstrapA.body.data.access, false)
          const bootstrapJson = JSON.stringify(bootstrapA.body)
          for (const secret of [
            'MobilePassword123!',
            'google-refresh-secret-a',
            'avito-secret-a',
            'vk-secret-a',
            Buffer.from('template-a').toString('base64'),
          ]) {
            assert.equal(
              bootstrapJson.includes(secret),
              false,
              `Bootstrap раскрыл ${secret}`
            )
          }

          const [tasksA, callsA, statisticsA, referralsA] = await Promise.all([
            get('/api/mobile/v1/tasks', loginA.body.data.accessToken),
            get('/api/mobile/v1/calls', loginA.body.data.accessToken),
            get('/api/mobile/v1/statistics', loginA.body.data.accessToken),
            get('/api/mobile/v1/referrals', loginA.body.data.accessToken),
          ])
          assert.equal(tasksA.response.status, 200, JSON.stringify(tasksA.body))
          const taskTitles = [
            ...tasksA.body.data.overdue,
            ...tasksA.body.data.today,
            ...tasksA.body.data.tomorrow,
          ].map((task) => task.title)
          assert.deepEqual(taskTitles, ['Перезвонить tenant A'])

          assert.equal(callsA.response.status, 200, JSON.stringify(callsA.body))
          assert.deepEqual(
            callsA.body.data.map((call) => call.transcript),
            ['Звонок tenant A']
          )
          assert.equal('providerCallId' in callsA.body.data[0], false)
          assert.equal('recordingStorageKey' in callsA.body.data[0], false)

          assert.equal(
            statisticsA.response.status,
            200,
            JSON.stringify(statisticsA.body)
          )
          assert.equal(
            statisticsA.body.data.events.every(
              (event) => event.description !== 'Статистика tenant B'
            ),
            true
          )
          assert.deepEqual(
            statisticsA.body.data.transactions.map(
              (transaction) => transaction.amount
            ),
            [1111]
          )
          assert.equal(
            statisticsA.body.data.clients.every(
              (client) => client.firstName !== 'Клиент tenant B'
            ),
            true
          )

          assert.equal(
            referralsA.response.status,
            200,
            JSON.stringify(referralsA.body)
          )
          assert.equal(referralsA.body.data.referralsCount, 1)
          assert.equal(
            referralsA.body.data.referrals[0].user.firstName,
            'Реферал tenant A'
          )

          const [listsA, listsB, notificationsA, notificationsB] =
            await Promise.all([
              get('/api/mobile/v1/lists', loginA.body.data.accessToken),
              get('/api/mobile/v1/lists', loginB.body.data.accessToken),
              get(
                '/api/mobile/v1/notifications',
                loginA.body.data.accessToken,
                {
                  'x-device-id': 'device-a',
                }
              ),
              get(
                '/api/mobile/v1/notifications',
                loginB.body.data.accessToken,
                {
                  'x-device-id': 'device-b',
                }
              ),
            ])
          assert.deepEqual(listsA.body.data.towns, ['Город A'])
          assert.deepEqual(listsB.body.data.towns, ['Город B'])
          assert.equal(notificationsA.body.data.activeDeviceCount, 1)
          assert.equal(notificationsA.body.data.deviceSubscribed, true)
          assert.equal(notificationsB.body.data.activeDeviceCount, 2)

          const updatedListsA = await readJson(
            apiRequest(baseUrl, '/api/mobile/v1/lists', {
              method: 'PUT',
              headers: authHeaders(loginA.body.data.accessToken),
              body: JSON.stringify({
                towns: ['Новый город A'],
                defaultTown: 'Новый город A',
                eventTypes: ['Новый тип A'],
              }),
            })
          )
          assert.deepEqual(updatedListsA.body.data.towns, ['Новый город A'])
          const unchangedListsB = await get(
            '/api/mobile/v1/lists',
            loginB.body.data.accessToken
          )
          assert.deepEqual(unchangedListsB.body.data.towns, ['Город B'])

          const updatedNotificationsA = await readJson(
            apiRequest(baseUrl, '/api/mobile/v1/notifications', {
              method: 'PATCH',
              headers: {
                ...authHeaders(loginA.body.data.accessToken),
                'x-device-id': 'device-a',
              },
              body: JSON.stringify({
                remindersEnabled: false,
                reminderTime: '12:45',
              }),
            })
          )
          assert.equal(updatedNotificationsA.body.data.remindersEnabled, false)
          assert.equal(updatedNotificationsA.body.data.reminderTime, '12:45')
          const unchangedNotificationsB = await get(
            '/api/mobile/v1/notifications',
            loginB.body.data.accessToken,
            { 'x-device-id': 'device-b' }
          )
          assert.equal(
            unchangedNotificationsB.body.data.remindersEnabled,
            false
          )
          assert.equal(unchangedNotificationsB.body.data.reminderTime, '11:30')

          const [integrationsA, integrationsB, templatesA, templatesB] =
            await Promise.all([
              get(
                '/api/mobile/v1/integrations/status',
                loginA.body.data.accessToken
              ),
              get(
                '/api/mobile/v1/integrations/status',
                loginB.body.data.accessToken
              ),
              get(
                '/api/mobile/v1/document-templates',
                loginA.body.data.accessToken
              ),
              get(
                '/api/mobile/v1/document-templates',
                loginB.body.data.accessToken
              ),
            ])
          assert.equal(integrationsA.body.data.googleCalendar.connected, true)
          assert.equal(integrationsB.body.data.googleCalendar.connected, false)
          assert.equal(integrationsA.body.data.avito.configured, true)
          assert.equal(integrationsB.body.data.avito.configured, false)
          assert.equal(integrationsA.body.data.vk.configured, true)
          assert.equal(integrationsB.body.data.vk.configured, false)
          const integrationsJson = JSON.stringify(integrationsA.body)
          assert.equal(integrationsJson.includes('avito-secret-a'), false)
          assert.equal(integrationsJson.includes('vk-secret-a'), false)
          assert.equal(integrationsJson.includes('novofon-api-secret-a'), false)
          assert.equal(
            integrationsJson.includes('novofon-webhook-secret-a'),
            false
          )
          assert.equal(integrationsJson.includes('aitunnel-secret-a'), false)
          assert.equal(integrationsJson.includes('lead-secret-a'), false)

          assert.deepEqual(
            templatesA.body.data.map((template) => template.id),
            ['template-a']
          )
          assert.deepEqual(
            templatesB.body.data.map((template) => template.id),
            ['template-b']
          )
          assert.equal(
            JSON.stringify(templatesA.body).includes('templateBase64'),
            false
          )
        }
      )

      await t.test(
        'голосовой AI-черновик принимает bearer и сохраняет тарифную проверку',
        async () => {
          const unauthorized = await readJson(
            apiRequest(baseUrl, '/api/mobile/v1/events/ai-draft', {
              method: 'POST',
              body: JSON.stringify({ text: 'Свадьба завтра' }),
            })
          )
          assert.equal(unauthorized.response.status, 401)

          const draft = await readJson(
            apiRequest(baseUrl, '/api/mobile/v1/events/ai-draft', {
              method: 'POST',
              headers: authHeaders(loginA.body.data.accessToken),
              body: JSON.stringify({
                text: 'Свадьба 20.08.2026, город Красноярск, бюджет 50 тысяч рублей, нужен задаток 10 тысяч',
              }),
            })
          )
          assert.equal(draft.response.status, 200, JSON.stringify(draft.body))
          assert.equal(draft.body.fields.eventType, 'Свадьба')
          assert.equal(draft.body.fields.contractSum, 50_000)
          assert.equal(draft.body.fields.waitDeposit, true)

          const emptyAudio = await readJson(
            apiRequest(baseUrl, '/api/mobile/v1/events/voice-transcript', {
              method: 'POST',
              headers: authHeaders(loginA.body.data.accessToken),
              body: new FormData(),
            })
          )
          assert.equal(emptyAudio.response.status, 400)
          assert.equal(emptyAudio.body.error, 'Аудиофайл не передан')

          await db
            .collection('tariffs')
            .updateOne({ _id: tariffId }, { $set: { allowAi: false } })
          const tariffDenied = await readJson(
            apiRequest(baseUrl, '/api/mobile/v1/events/ai-draft', {
              method: 'POST',
              headers: authHeaders(loginA.body.data.accessToken),
              body: JSON.stringify({ text: 'Свадьба завтра' }),
            })
          )
          assert.equal(tariffDenied.response.status, 403)
          await db
            .collection('tariffs')
            .updateOne({ _id: tariffId }, { $set: { allowAi: true } })
        }
      )

      await t.test(
        'профиль и реквизиты артиста обновляются tenant-aware',
        async () => {
          const get = (path, accessToken) =>
            readJson(
              apiRequest(baseUrl, path, { headers: authHeaders(accessToken) })
            )
          const patch = (path, accessToken, body) =>
            readJson(
              apiRequest(baseUrl, path, {
                method: 'PATCH',
                headers: authHeaders(accessToken),
                body: JSON.stringify(body),
              })
            )
          const tokenA = loginA.body.data.accessToken
          const tokenB = loginB.body.data.accessToken

          const profileA = await get('/api/mobile/v1/auth/me', tokenA)
          assert.equal(profileA.body.data.telegram, 'tenant_a')
          assert.equal(profileA.body.data.whatsapp, '79000000011')
          assert.equal('password' in profileA.body.data, false)
          assert.equal('googleCalendar' in profileA.body.data, false)

          const updatedProfileB = await patch(
            '/api/mobile/v1/auth/me',
            tokenB,
            {
              firstName: '  Артист B ',
              secondName: 'Фамилия B',
              thirdName: 'Отчество B',
              email: ' ARTIST.B@EXAMPLE.COM ',
              whatsapp: '+7 (900) 000-00-32',
              viber: '+7 900 000 00 42',
              telegram: 'https://t.me/artist_b/',
              vk: '@artist-b-vk',
              instagram: 'https://instagram.com/artist_b/',
              tenantId: String(tenantA),
              password: 'must-not-change',
              role: 'admin',
            }
          )
          assert.equal(
            updatedProfileB.response.status,
            200,
            JSON.stringify(updatedProfileB.body)
          )
          assert.equal(updatedProfileB.body.data.firstName, 'Артист B')
          assert.equal(updatedProfileB.body.data.email, 'artist.b@example.com')
          assert.equal(updatedProfileB.body.data.whatsapp, '79000000032')
          assert.equal(updatedProfileB.body.data.telegram, 'artist_b')
          assert.equal(updatedProfileB.body.data.instagram, 'artist_b')

          const invalidEmail = await patch('/api/mobile/v1/auth/me', tokenB, {
            email: 'not-an-email',
          })
          assert.equal(invalidEmail.response.status, 400)
          assert.equal(invalidEmail.body.error.code, 'PROFILE_INVALID')

          const storedAUser = await db
            .collection('users')
            .findOne({ _id: tenantA })
          const storedBUser = await db
            .collection('users')
            .findOne({ _id: tenantB })
          assert.equal(storedAUser.firstName, 'Tenant A')
          assert.equal(storedBUser.firstName, 'Артист B')
          assert.equal(String(storedBUser.tenantId), String(tenantB))
          assert.equal(storedBUser.password, passwordHash)
          assert.equal(storedBUser.role, 'user')

          const requisitesA = await get(
            '/api/mobile/v1/profile/requisites',
            tokenA
          )
          const requisitesB = await get(
            '/api/mobile/v1/profile/requisites',
            tokenB
          )
          assert.equal(
            requisitesA.body.data.artistFullName,
            'ИП Артист Tenant A'
          )
          assert.equal(requisitesA.body.data.artistInn, '123456789012')
          assert.equal(requisitesB.body.data.artistFullName, '')
          assert.equal('custom' in requisitesA.body.data, false)
          assert.equal(
            JSON.stringify(requisitesA.body).includes('avito-secret-a'),
            false
          )

          const updatedRequisitesB = await patch(
            '/api/mobile/v1/profile/requisites',
            tokenB,
            {
              artistStatus: 'self_employed',
              artistFullName: '  Самозанятый Артист B ',
              artistName: 'Артист B',
              artistOgrnip: '999-999',
              artistInn: '987 654 321 098',
              artistBankName: 'Банк B',
              artistBik: '044 525 999',
              artistCheckingAccount: '40702 810 000 000 000 002',
              artistCorrespondentAccount: '30101 810 000 000 000 299',
              artistLegalAddress: 'Адрес B',
              avitoClientSecret: 'must-not-be-written',
            }
          )
          assert.equal(
            updatedRequisitesB.response.status,
            200,
            JSON.stringify(updatedRequisitesB.body)
          )
          assert.equal(
            updatedRequisitesB.body.data.artistStatus,
            'self_employed'
          )
          assert.equal(updatedRequisitesB.body.data.artistOgrnip, '')
          assert.equal(updatedRequisitesB.body.data.artistInn, '987654321098')
          assert.equal(updatedRequisitesB.body.data.artistBik, '044525999')

          const storedASettings = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantA })
          const storedBSettings = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantB })
          assert.equal(
            storedASettings.custom.contractArtistFullName,
            'ИП Артист Tenant A'
          )
          assert.equal(
            storedBSettings.custom.contractArtistFullName,
            'Самозанятый Артист B'
          )
          assert.equal(storedBSettings.custom.contractArtistOgrnip, '')
          assert.equal(storedBSettings.custom.avitoClientSecret, undefined)
          assert.deepEqual(storedBSettings.custom.eventTypes, ['Тип B'])
        }
      )

      await t.test(
        'Avito/VK conversations работают через mock и не раскрывают raw',
        async () => {
          const get = (path, accessToken) =>
            readJson(
              apiRequest(baseUrl, path, { headers: authHeaders(accessToken) })
            )
          const mutate = (path, accessToken, method, body) =>
            readJson(
              apiRequest(baseUrl, path, {
                method,
                headers: authHeaders(accessToken),
                body: JSON.stringify(body),
              })
            )

          for (const provider of ['avito', 'vk']) {
            const listA = await get(
              `/api/mobile/v1/conversations/${provider}`,
              loginA.body.data.accessToken
            )
            const listB = await get(
              `/api/mobile/v1/conversations/${provider}`,
              loginB.body.data.accessToken
            )
            assert.equal(listA.response.status, 200, JSON.stringify(listA.body))
            assert.equal(listB.response.status, 200, JSON.stringify(listB.body))
            assert.equal(listA.body.data.length, 1)
            assert.equal(listB.body.data.length, 1)
            assert.match(listA.body.data[0].clientName, /клиент A/)
            assert.match(listB.body.data[0].clientName, /клиент B/)
            assert.equal('tenantId' in listA.body.data[0], false)
            assert.equal('raw' in listA.body.data[0], false)
            assert.equal(
              JSON.stringify(listA.body).includes(
                `${provider}-conversation-raw-a`
              ),
              false
            )
          }

          const avitoMessages = await get(
            `/api/mobile/v1/conversations/avito/${avitoConversationA}/messages`,
            loginA.body.data.accessToken
          )
          const vkMessages = await get(
            `/api/mobile/v1/conversations/vk/${vkConversationA}/messages`,
            loginA.body.data.accessToken
          )
          assert.deepEqual(
            avitoMessages.body.data.messages.map((message) => message.text),
            ['Avito входящее A']
          )
          assert.deepEqual(
            vkMessages.body.data.messages.map((message) => message.text),
            ['VK входящее A']
          )
          const messagesJson = JSON.stringify({ avitoMessages, vkMessages })
          for (const secret of [
            'avito-message-raw-a',
            'vk-message-raw-a',
            'avito-provider-message-a',
            'vk-provider-message-a',
          ]) {
            assert.equal(messagesJson.includes(secret), false)
          }

          const crossTenantRead = await get(
            `/api/mobile/v1/conversations/avito/${avitoConversationB}/messages`,
            loginA.body.data.accessToken
          )
          assert.equal(crossTenantRead.response.status, 404)

          const patchedAvito = await mutate(
            `/api/mobile/v1/conversations/avito/${avitoConversationA}`,
            loginA.body.data.accessToken,
            'PATCH',
            { status: 'closed', markRead: true }
          )
          const patchedVk = await mutate(
            `/api/mobile/v1/conversations/vk/${vkConversationA}`,
            loginA.body.data.accessToken,
            'PATCH',
            { status: 'ignored', markRead: true }
          )
          assert.equal(patchedAvito.body.data.status, 'closed')
          assert.equal(patchedAvito.body.data.unreadCount, 0)
          assert.equal(patchedVk.body.data.status, 'ignored')
          assert.equal(patchedVk.body.data.unreadCount, 0)
          assert.equal(
            (
              await db
                .collection('avitoconversations')
                .findOne({ _id: avitoConversationB })
            ).status,
            'open'
          )
          assert.equal(
            (
              await db
                .collection('vkconversations')
                .findOne({ _id: vkConversationB })
            ).status,
            'open'
          )

          const avitoReply = await mutate(
            `/api/mobile/v1/conversations/avito/${avitoConversationA}/messages`,
            loginA.body.data.accessToken,
            'POST',
            { text: 'Ответ Avito из Android' }
          )
          const vkReply = await mutate(
            `/api/mobile/v1/conversations/vk/${vkConversationA}/messages`,
            loginA.body.data.accessToken,
            'POST',
            { text: 'Ответ VK из Android' }
          )
          assert.equal(
            avitoReply.response.status,
            201,
            JSON.stringify(avitoReply.body)
          )
          assert.equal(
            vkReply.response.status,
            201,
            JSON.stringify(vkReply.body)
          )
          assert.equal(avitoReply.body.data.message.status, 'sent')
          assert.equal(vkReply.body.data.message.status, 'sent')
          assert.equal('raw' in avitoReply.body.data.message, false)
          assert.equal('raw' in vkReply.body.data.message, false)

          const conversationProviderRequests = providerRequests.filter(
            (request) =>
              request.url.startsWith('/avito/') ||
              request.url === '/vk/messages.send'
          )
          assert.equal(conversationProviderRequests.length, 3)
          const avitoTokenRequest = conversationProviderRequests.find(
            (request) => request.url === '/avito/token/'
          )
          const avitoSendRequest = conversationProviderRequests.find(
            (request) => request.url.includes('/avito/messenger/v1/accounts/')
          )
          const vkSendRequest = conversationProviderRequests.find(
            (request) => request.url === '/vk/messages.send'
          )
          assert.ok(avitoTokenRequest)
          assert.ok(avitoSendRequest)
          assert.ok(vkSendRequest)
          assert.match(avitoTokenRequest.body, /client_secret=avito-secret-a/)
          assert.equal(
            avitoSendRequest.headers.authorization,
            'Bearer mock-avito-access-token'
          )
          assert.match(avitoSendRequest.body, /Ответ Avito из Android/)
          const vkRequestParams = new URLSearchParams(vkSendRequest.body)
          assert.equal(vkRequestParams.get('access_token'), 'vk-secret-a')
          assert.equal(vkRequestParams.get('message'), 'Ответ VK из Android')

          const invalidProvider = await get(
            '/api/mobile/v1/conversations/unknown',
            loginA.body.data.accessToken
          )
          assert.equal(invalidProvider.response.status, 400)
          assert.equal(invalidProvider.body.error.code, 'PROVIDER_INVALID')
        }
      )

      await t.test(
        'Avito/VK подключаются и отключаются без утечки credentials',
        async () => {
          const get = (path, accessToken) =>
            readJson(
              apiRequest(baseUrl, path, { headers: authHeaders(accessToken) })
            )
          const mutate = (path, accessToken, method, body) =>
            readJson(
              apiRequest(baseUrl, path, {
                method,
                headers: authHeaders(accessToken),
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              })
            )
          const tokenB = loginB.body.data.accessToken

          for (const provider of ['avito', 'vk']) {
            const initial = await get(
              `/api/mobile/v1/integrations/${provider}`,
              tokenB
            )
            assert.equal(
              initial.response.status,
              200,
              JSON.stringify(initial.body)
            )
            assert.equal(initial.body.data.provider, provider)
            assert.equal(initial.body.data.available, true)
            assert.equal(initial.body.data.configured, false)
          }

          const avitoInput = {
            clientId: 'mobile-avito-client-b',
            clientSecret: 'mobile-avito-secret-b',
            userId: 'mobile-avito-user-b',
          }
          const avitoConnected = await mutate(
            '/api/mobile/v1/integrations/avito',
            tokenB,
            'POST',
            avitoInput
          )
          assert.equal(
            avitoConnected.response.status,
            200,
            JSON.stringify(avitoConnected.body)
          )
          assert.equal(avitoConnected.body.data.configured, true)
          assert.equal(avitoConnected.body.data.enabled, true)
          assert.equal(avitoConnected.body.data.clientId, avitoInput.clientId)
          assert.equal(avitoConnected.body.data.accountId, avitoInput.userId)

          const avitoChecked = await mutate(
            '/api/mobile/v1/integrations/avito',
            tokenB,
            'PATCH'
          )
          assert.equal(
            avitoChecked.response.status,
            200,
            JSON.stringify(avitoChecked.body)
          )
          assert.equal(avitoChecked.body.data.configured, true)
          assert.ok(avitoChecked.body.data.lastCheckedAt)

          const vkInput = {
            groupId: 'mobile-vk-group-b',
            accessToken: 'mobile-vk-secret-b',
            confirmationCode: 'mobile-vk-confirm-b',
          }
          const vkConnected = await mutate(
            '/api/mobile/v1/integrations/vk',
            tokenB,
            'POST',
            vkInput
          )
          assert.equal(
            vkConnected.response.status,
            200,
            JSON.stringify(vkConnected.body)
          )
          assert.equal(vkConnected.body.data.configured, true)
          assert.equal(vkConnected.body.data.enabled, true)
          assert.equal(vkConnected.body.data.accountId, vkInput.groupId)

          const vkChecked = await mutate(
            '/api/mobile/v1/integrations/vk',
            tokenB,
            'PATCH'
          )
          assert.equal(
            vkChecked.response.status,
            200,
            JSON.stringify(vkChecked.body)
          )
          assert.equal(vkChecked.body.data.configured, true)
          assert.ok(vkChecked.body.data.lastCheckedAt)

          const mobileResponses = JSON.stringify({
            avitoConnected: avitoConnected.body,
            avitoChecked: avitoChecked.body,
            vkConnected: vkConnected.body,
            vkChecked: vkChecked.body,
          })
          for (const secret of [
            avitoInput.clientSecret,
            vkInput.accessToken,
            vkInput.confirmationCode,
            'webhookToken',
            'webhookSecret',
            'webhookUrl',
          ]) {
            assert.equal(mobileResponses.includes(secret), false)
          }

          const storedB = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantB })
          assert.equal(
            storedB.custom.avitoClientSecret,
            avitoInput.clientSecret
          )
          assert.equal(storedB.custom.vkGroupAccessToken, vkInput.accessToken)
          assert.equal(
            storedB.custom.vkGroupConfirmationCode,
            vkInput.confirmationCode
          )
          assert.ok(storedB.custom.avitoWebhookToken)
          assert.ok(storedB.custom.vkGroupWebhookSecret)

          const storedA = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantA })
          assert.equal(storedA.custom.avitoClientSecret, 'avito-secret-a')
          assert.equal(storedA.custom.vkGroupAccessToken, 'vk-secret-a')

          const avitoTokenRequest = providerRequests.findLast(
            (request) =>
              request.url === '/avito/token/' &&
              request.body.includes(avitoInput.clientSecret)
          )
          const avitoWebhookRequest = providerRequests.findLast(
            (request) => request.url === '/avito/messenger/v3/webhook'
          )
          const vkAccessRequest = providerRequests.findLast(
            (request) =>
              request.url === '/vk/groups.getById' &&
              request.body.includes(vkInput.accessToken)
          )
          assert.ok(avitoTokenRequest)
          assert.ok(avitoWebhookRequest)
          assert.ok(vkAccessRequest)
          assert.equal(
            avitoWebhookRequest.headers.authorization,
            'Bearer mock-avito-access-token'
          )

          const avitoDisconnected = await mutate(
            '/api/mobile/v1/integrations/avito',
            tokenB,
            'DELETE'
          )
          const vkDisconnected = await mutate(
            '/api/mobile/v1/integrations/vk',
            tokenB,
            'DELETE'
          )
          assert.equal(
            avitoDisconnected.response.status,
            200,
            JSON.stringify(avitoDisconnected.body)
          )
          assert.equal(
            vkDisconnected.response.status,
            200,
            JSON.stringify(vkDisconnected.body)
          )
          assert.equal(avitoDisconnected.body.data.configured, false)
          assert.equal(avitoDisconnected.body.data.enabled, false)
          assert.equal(vkDisconnected.body.data.configured, false)
          assert.equal(vkDisconnected.body.data.enabled, false)

          const clearedB = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantB })
          for (const field of [
            'avitoClientId',
            'avitoClientSecret',
            'avitoUserId',
            'avitoWebhookToken',
            'avitoWebhookUrl',
            'avitoWebhookId',
            'vkGroupId',
            'vkGroupAccessToken',
            'vkGroupConfirmationCode',
            'vkGroupWebhookToken',
            'vkGroupWebhookSecret',
            'vkGroupWebhookUrl',
          ]) {
            assert.equal(clearedB.custom[field], '', field)
          }

          const unchangedA = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantA })
          assert.equal(unchangedA.custom.avitoClientSecret, 'avito-secret-a')
          assert.equal(unchangedA.custom.vkGroupAccessToken, 'vk-secret-a')

          const invalidProvider = await get(
            '/api/mobile/v1/integrations/unknown',
            tokenB
          )
          assert.equal(invalidProvider.response.status, 400)
          assert.equal(invalidProvider.body.error.code, 'PROVIDER_INVALID')
        }
      )

      await t.test(
        'Novofon, AITunnel и Public Leads управляются с одноразовыми секретами',
        async () => {
          const get = (path, accessToken) =>
            readJson(
              apiRequest(baseUrl, path, { headers: authHeaders(accessToken) })
            )
          const mutate = (path, accessToken, method, body) =>
            readJson(
              apiRequest(baseUrl, path, {
                method,
                headers: authHeaders(accessToken),
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              })
            )
          const tokenB = loginB.body.data.accessToken

          for (const provider of ['telephony', 'ai', 'public-leads']) {
            const initial = await get(
              `/api/mobile/v1/integrations/${provider}`,
              tokenB
            )
            assert.equal(
              initial.response.status,
              200,
              JSON.stringify(initial.body)
            )
            assert.equal(initial.body.data.available, true)
            assert.equal(initial.body.data.configured, false)
          }

          const novofonApiKey = 'mobile-novofon-api-b'
          const novofonConnected = await mutate(
            '/api/mobile/v1/integrations/telephony',
            tokenB,
            'POST',
            { apiKey: novofonApiKey }
          )
          assert.equal(
            novofonConnected.response.status,
            200,
            JSON.stringify(novofonConnected.body)
          )
          assert.equal(novofonConnected.body.data.configured, true)
          assert.equal(novofonConnected.body.data.hasApiKey, true)
          const firstWebhookSecret =
            novofonConnected.body.data.setup.webhookSecret
          assert.match(firstWebhookSecret, /^novofon_[a-f0-9]{48}$/)
          assert.match(
            novofonConnected.body.data.setup.webhookUrl,
            new RegExp(firstWebhookSecret)
          )
          assert.equal(
            JSON.stringify(novofonConnected.body).includes(novofonApiKey),
            false
          )

          const novofonRotated = await mutate(
            '/api/mobile/v1/integrations/telephony',
            tokenB,
            'POST',
            {}
          )
          const secondWebhookSecret =
            novofonRotated.body.data.setup.webhookSecret
          assert.notEqual(secondWebhookSecret, firstWebhookSecret)

          const aiKey = 'mobile-aitunnel-secret-b'
          const aiConnected = await mutate(
            '/api/mobile/v1/integrations/ai',
            tokenB,
            'POST',
            {
              provider: 'aitunnel',
              key: aiKey,
              transcriptionModel: 'whisper-mobile',
              analysisModel: 'analysis-mobile',
            }
          )
          assert.equal(
            aiConnected.response.status,
            200,
            JSON.stringify(aiConnected.body)
          )
          assert.equal(aiConnected.body.data.configured, true)
          assert.equal(
            aiConnected.body.data.transcriptionModel,
            'whisper-mobile'
          )
          assert.equal(JSON.stringify(aiConnected.body).includes(aiKey), false)
          const aiPaused = await mutate(
            '/api/mobile/v1/integrations/ai',
            tokenB,
            'PATCH',
            { enabled: false }
          )
          assert.equal(aiPaused.body.data.enabled, false)
          assert.equal(aiPaused.body.data.configured, true)

          const firstLead = await mutate(
            '/api/mobile/v1/integrations/public-leads',
            tokenB,
            'POST',
            { name: 'Сайт B' }
          )
          assert.equal(
            firstLead.response.status,
            200,
            JSON.stringify(firstLead.body)
          )
          const firstLeadSecret = firstLead.body.data.issuedKey
          const firstLeadId = firstLead.body.data.keys[0].id
          assert.match(firstLeadSecret, /^lead_[a-f0-9]{48}$/)
          assert.equal(
            firstLead.body.data.keys[0].lastFour,
            firstLeadSecret.slice(-4)
          )
          const secondLead = await mutate(
            '/api/mobile/v1/integrations/public-leads',
            tokenB,
            'POST',
            { name: 'Tilda B' }
          )
          assert.equal(secondLead.body.data.keys.length, 2)
          assert.notEqual(secondLead.body.data.issuedKey, firstLeadSecret)

          const disabledLead = await mutate(
            '/api/mobile/v1/integrations/public-leads',
            tokenB,
            'PATCH',
            { keyId: firstLeadId, enabled: false }
          )
          assert.equal(
            disabledLead.body.data.keys.find((item) => item.id === firstLeadId)
              .enabled,
            false
          )
          const deletedLead = await mutate(
            '/api/mobile/v1/integrations/public-leads',
            tokenB,
            'DELETE',
            { keyId: firstLeadId }
          )
          assert.equal(deletedLead.body.data.keys.length, 1)

          const [safeNovofon, safeAi, safeLeads] = await Promise.all([
            get('/api/mobile/v1/integrations/telephony', tokenB),
            get('/api/mobile/v1/integrations/ai', tokenB),
            get('/api/mobile/v1/integrations/public-leads', tokenB),
          ])
          const safeJson = JSON.stringify({
            novofon: safeNovofon.body,
            ai: safeAi.body,
            leads: safeLeads.body,
          })
          for (const secret of [
            novofonApiKey,
            firstWebhookSecret,
            secondWebhookSecret,
            aiKey,
            firstLeadSecret,
            secondLead.body.data.issuedKey,
          ]) {
            assert.equal(safeJson.includes(secret), false)
          }

          const storedB = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantB })
          assert.equal(storedB.custom.novofonApiKey, novofonApiKey)
          assert.equal(storedB.custom.novofonWebhookSecret, secondWebhookSecret)
          assert.equal(storedB.custom.aitunnelKey, aiKey)
          assert.equal(storedB.custom.publicLeadApiKeys.length, 1)

          const unchangedA = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantA })
          assert.equal(unchangedA.custom.novofonApiKey, 'novofon-api-secret-a')
          assert.equal(unchangedA.custom.aitunnelKey, 'aitunnel-secret-a')
          assert.equal(unchangedA.custom.publicLeadApiKey, 'lead-secret-a')

          await db.collection('tariffs').updateOne(
            { _id: tariffId },
            {
              $set: {
                allowTelephony: false,
                allowAi: false,
                allowPublicLeadApi: false,
              },
            }
          )
          const tariffDenied = await mutate(
            '/api/mobile/v1/integrations/ai',
            tokenB,
            'POST',
            { key: 'must-not-be-saved' }
          )
          assert.equal(tariffDenied.response.status, 403)

          const [novofonDisconnected, aiDisconnected, leadsDisconnected] =
            await Promise.all([
              mutate('/api/mobile/v1/integrations/telephony', tokenB, 'DELETE'),
              mutate('/api/mobile/v1/integrations/ai', tokenB, 'DELETE'),
              mutate(
                '/api/mobile/v1/integrations/public-leads',
                tokenB,
                'DELETE'
              ),
            ])
          assert.equal(novofonDisconnected.body.data.configured, false)
          assert.equal(aiDisconnected.body.data.configured, false)
          assert.equal(leadsDisconnected.body.data.keys.length, 0)

          const clearedB = await db
            .collection('sitesettings')
            .findOne({ tenantId: tenantB })
          for (const field of [
            'novofonApiKey',
            'novofonWebhookSecret',
            'aitunnelKey',
            'publicLeadApiKey',
          ]) {
            assert.equal(clearedB.custom[field], '', field)
          }
          assert.deepEqual(clearedB.custom.publicLeadApiKeys, [])
          assert.equal(clearedB.custom.novofonEnabled, false)
          assert.equal(clearedB.custom.aitunnelEnabled, false)
          assert.equal(clearedB.custom.publicLeadEnabled, false)

          await db.collection('tariffs').updateOne(
            { _id: tariffId },
            {
              $set: {
                allowTelephony: true,
                allowAi: true,
                allowPublicLeadApi: true,
              },
            }
          )
        }
      )

      await t.test(
        'Google Calendar mobile OAuth одноразов и не раскрывает токены',
        async () => {
          await db
            .collection('tariffs')
            .updateOne({ _id: tariffId }, { $set: { allowCalendarSync: true } })
          const get = (path, accessToken, options = {}) =>
            readJson(
              apiRequest(baseUrl, path, {
                ...options,
                headers: {
                  ...authHeaders(accessToken),
                  ...(options.headers || {}),
                },
              })
            )
          const mutate = (path, accessToken, method, body) =>
            readJson(
              apiRequest(baseUrl, path, {
                method,
                headers: authHeaders(accessToken),
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
              })
            )

          const unauthorized = await apiRequest(
            baseUrl,
            '/api/mobile/v1/integrations/google-calendar/auth-url'
          )
          assert.equal(unauthorized.status, 401)

          const statusA = await get(
            '/api/mobile/v1/integrations/google-calendar',
            loginA.body.data.accessToken
          )
          assert.equal(
            statusA.response.status,
            200,
            JSON.stringify(statusA.body)
          )
          assert.equal(statusA.body.data.connected, true)
          assert.equal(statusA.body.data.calendarName, 'Календарь A')
          const statusJson = JSON.stringify(statusA.body)
          assert.equal(statusJson.includes('google-refresh-secret-a'), false)
          assert.equal(statusJson.includes('google-access-secret-a'), false)

          const calendarsA = await get(
            '/api/mobile/v1/integrations/google-calendar/calendars',
            loginA.body.data.accessToken
          )
          assert.equal(
            calendarsA.response.status,
            200,
            JSON.stringify(calendarsA.body)
          )
          assert.deepEqual(
            calendarsA.body.data.calendars.map((calendar) => calendar.id),
            ['primary', 'team-calendar']
          )
          assert.equal(
            JSON.stringify(calendarsA.body).includes('google-access-secret-a'),
            false
          )

          const selected = await mutate(
            '/api/mobile/v1/integrations/google-calendar/select',
            loginA.body.data.accessToken,
            'POST',
            { calendarId: 'team-calendar' }
          )
          assert.equal(
            selected.response.status,
            200,
            JSON.stringify(selected.body)
          )
          assert.equal(selected.body.data.calendarName, 'Выступления')

          const patched = await mutate(
            '/api/mobile/v1/integrations/google-calendar',
            loginA.body.data.accessToken,
            'PATCH',
            {
              reminders: {
                useDefault: false,
                overrides: [{ method: 'popup', minutes: 60 }],
              },
              deleteCanceledFromCalendar: true,
              skipTransferredFromCalendar: true,
            }
          )
          assert.equal(
            patched.response.status,
            200,
            JSON.stringify(patched.body)
          )
          assert.equal(patched.body.data.reminders.overrides[0].minutes, 60)
          assert.equal(patched.body.data.deleteCanceledFromCalendar, true)
          assert.equal(patched.body.data.skipTransferredFromCalendar, true)
          const storedA = await db.collection('users').findOne({ _id: tenantA })
          const storedBBeforeOAuth = await db
            .collection('users')
            .findOne({ _id: tenantB })
          assert.equal(storedA.googleCalendar.calendarId, 'team-calendar')
          assert.equal(storedA.googleCalendar.calendarName, 'Выступления')
          assert.equal(storedBBeforeOAuth.googleCalendar, undefined)

          const authUrlResponse = await get(
            '/api/mobile/v1/integrations/google-calendar/auth-url',
            loginB.body.data.accessToken
          )
          assert.equal(
            authUrlResponse.response.status,
            200,
            JSON.stringify(authUrlResponse.body)
          )
          const googleAuthUrl = new URL(authUrlResponse.body.data.url)
          assert.equal(googleAuthUrl.origin, `http://127.0.0.1:${cloudPort}`)
          assert.equal(googleAuthUrl.pathname, '/google-auth')
          assert.equal(
            googleAuthUrl.searchParams.get('client_id'),
            'mock-google-client-id'
          )
          assert.equal(
            googleAuthUrl.searchParams.get('redirect_uri'),
            `${baseUrl}/api/google-calendar/callback`
          )
          const state = googleAuthUrl.searchParams.get('state')
          assert.match(state, /^m1\./)
          const sessionWithState = await db
            .collection('mobilesessions')
            .findOne({
              userId: tenantB,
              deviceId: 'device-b',
            })
          assert.ok(sessionWithState?.googleOAuthStateHash)
          assert.notEqual(sessionWithState.googleOAuthStateHash, state)

          const callbackPath = `/api/google-calendar/callback?code=google-mobile-code&state=${encodeURIComponent(state)}`
          const callback = await apiRequest(baseUrl, callbackPath, {
            redirect: 'manual',
          })
          assert.equal(callback.status, 307)
          assert.match(
            callback.headers.get('location') || '',
            /^vedelo:\/\/more\/integrations\?gc_connected=1/
          )
          const storedBAfterOAuth = await db
            .collection('users')
            .findOne({ _id: tenantB })
          assert.equal(
            storedBAfterOAuth.googleCalendar.refreshToken,
            'mock-google-callback-refresh'
          )
          assert.equal(
            storedBAfterOAuth.googleCalendar.accessToken,
            'mock-google-callback-access'
          )

          const googleTokenRequests = providerRequests.filter(
            (request) => request.url === '/google-token'
          )
          assert.equal(googleTokenRequests.length, 1)
          const tokenParams = new URLSearchParams(googleTokenRequests[0].body)
          assert.equal(tokenParams.get('code'), 'google-mobile-code')
          assert.equal(
            tokenParams.get('client_secret'),
            'mock-google-client-secret'
          )

          const replay = await apiRequest(baseUrl, callbackPath, {
            redirect: 'manual',
          })
          assert.equal(replay.status, 307)
          assert.match(replay.headers.get('location') || '', /gc_error=state/)
          assert.equal(
            providerRequests.filter(
              (request) => request.url === '/google-token'
            ).length,
            1
          )

          const calendarsB = await get(
            '/api/mobile/v1/integrations/google-calendar/calendars',
            loginB.body.data.accessToken
          )
          assert.equal(
            calendarsB.response.status,
            200,
            JSON.stringify(calendarsB.body)
          )
          const googleApiRequest = providerRequests.findLast((request) =>
            request.url.startsWith('/calendar/v3/users/me/calendarList')
          )
          assert.ok(googleApiRequest)
          assert.equal(
            googleApiRequest.headers.authorization,
            'Bearer mock-google-callback-access'
          )

          const disconnected = await mutate(
            '/api/mobile/v1/integrations/google-calendar',
            loginB.body.data.accessToken,
            'DELETE'
          )
          assert.equal(
            disconnected.response.status,
            200,
            JSON.stringify(disconnected.body)
          )
          assert.equal(disconnected.body.data.connected, false)
          const disconnectedUser = await db
            .collection('users')
            .findOne({ _id: tenantB })
          assert.equal(disconnectedUser.googleCalendar.refreshToken, '')
          assert.equal(disconnectedUser.googleCalendar.accessToken, '')
          assert.equal(disconnectedUser.googleCalendar.calendarId, '')
          assert.equal(disconnectedUser.googleCalendar.calendarName, '')
          const mobileResponses = JSON.stringify({
            statusA: statusA.body,
            calendarsA: calendarsA.body,
            authUrl: authUrlResponse.body,
            calendarsB: calendarsB.body,
            disconnected: disconnected.body,
          })
          for (const secret of [
            'mock-google-client-secret',
            'mock-google-callback-refresh',
            'mock-google-callback-access',
            'google-refresh-secret-a',
            'google-access-secret-a',
          ]) {
            assert.equal(
              mobileResponses.includes(secret),
              false,
              `Google API раскрыл ${secret}`
            )
          }
          await db
            .collection('tariffs')
            .updateOne(
              { _id: tariffId },
              { $set: { allowCalendarSync: false } }
            )
        }
      )

      await t.test(
        'sync push/pull передаёт CRUD и tombstone между устройствами',
        async () => {
          const push = (accessToken, operations) =>
            readJson(
              apiRequest(baseUrl, '/api/mobile/v1/sync/push', {
                method: 'POST',
                headers: authHeaders(accessToken),
                body: JSON.stringify({ operations }),
              })
            )
          const pull = (accessToken, cursor = '') =>
            readJson(
              apiRequest(
                baseUrl,
                `/api/mobile/v1/sync/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
                { headers: authHeaders(accessToken) }
              )
            )
          const operation = (overrides) => ({
            operationId: randomUUID(),
            entityType: 'clients',
            entityId: 'local-http-client',
            method: 'create',
            payload: { firstName: 'Offline HTTP клиент' },
            attachments: [],
            ...overrides,
          })

          const createOperation = operation({
            operationId: 'http-create-client',
          })
          const concurrentCreates = await Promise.all([
            push(loginA.body.data.accessToken, [createOperation]),
            push(loginA.body.data.accessToken, [createOperation]),
          ])
          assert.equal(
            concurrentCreates.some(
              ({ body }) => body.data.results[0].status === 'applied'
            ),
            true
          )
          assert.equal(
            await db.collection('clients').countDocuments({
              tenantId: tenantA,
              firstName: 'Offline HTTP клиент',
            }),
            1
          )
          const replay = await push(loginA.body.data.accessToken, [
            createOperation,
          ])
          assert.equal(replay.body.data.results[0].status, 'applied')
          const created = replay.body.data.results[0].entity
          assert.ok(created?._id)
          assert.equal(created.syncVersion, 1)

          const firstPull = await pull(loginASecond.body.data.accessToken)
          assert.equal(
            firstPull.response.status,
            200,
            JSON.stringify(firstPull.body)
          )
          assert.equal(
            firstPull.body.data.entities.clients.some(
              (item) =>
                item._id === created._id &&
                item.firstName === 'Offline HTTP клиент'
            ),
            true
          )
          let secondDeviceCursor = firstPull.body.data.cursor
          await new Promise((resolve) => setTimeout(resolve, 10))

          const updateOperation = operation({
            operationId: 'http-update-client',
            entityId: created._id,
            method: 'update',
            payload: {
              firstName: 'Обновлено на первом устройстве',
              secondName: 'Базовая фамилия',
              phone: '79000000041',
            },
            baseVersion: 1,
            baseValues: {
              firstName: 'Offline HTTP клиент',
              secondName: created.secondName || '',
              phone: created.phone || '',
            },
          })
          const updated = await push(loginA.body.data.accessToken, [
            updateOperation,
          ])
          assert.equal(updated.body.data.results[0].status, 'applied')
          assert.equal(updated.body.data.results[0].entity.syncVersion, 2)

          const updatePull = await pull(
            loginASecond.body.data.accessToken,
            secondDeviceCursor
          )
          assert.equal(
            updatePull.body.data.entities.clients.some(
              (item) => item._id === created._id && item.syncVersion === 2
            ),
            true
          )
          secondDeviceCursor = updatePull.body.data.cursor
          await new Promise((resolve) => setTimeout(resolve, 10))

          await db.collection('clients').updateOne(
            {
              _id: new mongoose.Types.ObjectId(created._id),
              tenantId: tenantA,
            },
            {
              $set: {
                firstName: 'Изменено в web',
                phone: '79000000042',
                syncVersion: 3,
                updatedAt: new Date(),
              },
            }
          )
          const conflictOperation = operation({
            operationId: 'http-conflict-client',
            entityId: created._id,
            method: 'update',
            payload: {
              firstName: 'Локальная конфликтующая версия',
              phone: '79000000043',
              secondName: 'Несвязанное локальное изменение',
            },
            baseVersion: 2,
            baseValues: {
              firstName: 'Обновлено на первом устройстве',
              phone: '79000000041',
              secondName: 'Базовая фамилия',
            },
          })
          const conflict = await push(loginA.body.data.accessToken, [
            conflictOperation,
          ])
          assert.equal(conflict.body.data.results[0].status, 'conflict')
          assert.deepEqual(
            conflict.body.data.results[0].conflicts
              .map((item) => item.path)
              .sort(),
            ['firstName', 'phone']
          )
          assert.equal(
            conflict.body.data.results[0].conflicts.some(
              (item) => item.path === 'secondName'
            ),
            false
          )

          const foreignUpdate = await push(loginB.body.data.accessToken, [
            operation({
              operationId: 'http-foreign-update',
              entityId: created._id,
              method: 'update',
              payload: { firstName: 'Попытка другого tenant' },
              baseVersion: 3,
              baseValues: { firstName: 'Изменено в web' },
            }),
          ])
          assert.equal(foreignUpdate.body.data.results[0].status, 'failed')
          assert.equal(
            foreignUpdate.body.data.results[0].error.code,
            'ENTITY_NOT_FOUND'
          )

          const deleteOperation = operation({
            operationId: 'http-delete-client',
            entityId: created._id,
            method: 'delete',
            payload: undefined,
            baseVersion: 3,
            baseValues: {},
          })
          const deleted = await push(loginA.body.data.accessToken, [
            deleteOperation,
          ])
          assert.equal(deleted.body.data.results[0].status, 'applied')
          const deleteReplay = await push(loginA.body.data.accessToken, [
            deleteOperation,
          ])
          assert.deepEqual(
            deleteReplay.body.data.results[0],
            deleted.body.data.results[0]
          )
          assert.equal(
            await db.collection('clients').countDocuments({
              _id: new mongoose.Types.ObjectId(created._id),
            }),
            0
          )

          const tombstonePull = await pull(
            loginASecond.body.data.accessToken,
            secondDeviceCursor
          )
          assert.equal(
            tombstonePull.body.data.tombstones.some(
              (item) =>
                item.entityType === 'clients' && item.entityId === created._id
            ),
            true
          )
          assert.equal(
            tombstonePull.body.data.entities.clients.some(
              (item) => item._id === created._id
            ),
            false
          )
          const foreignTombstonePull = await pull(loginB.body.data.accessToken)
          assert.equal(
            foreignTombstonePull.body.data.tombstones.some(
              (item) =>
                item.entityType === 'clients' && item.entityId === created._id
            ),
            false
          )
        }
      )

      await t.test(
        'stale sync state восстанавливается только до начала CRUD',
        async () => {
          const push = (operations) =>
            readJson(
              apiRequest(baseUrl, '/api/mobile/v1/sync/push', {
                method: 'POST',
                headers: authHeaders(loginASecond.body.data.accessToken),
                body: JSON.stringify({ operations }),
              })
            )
          const staleAt = new Date(Date.now() - 5 * 60 * 1000)
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
          const reservedOperation = {
            operationId: 'http-stale-reserved',
            entityType: 'clients',
            entityId: 'local-stale-reserved',
            method: 'create',
            payload: { firstName: 'Восстановлено после reserved' },
            attachments: [],
          }
          await db.collection('mobilesyncoperations').insertOne({
            tenantId: tenantA,
            userId: tenantA,
            operationId: reservedOperation.operationId,
            operationHash: getSyncOperationFingerprint(reservedOperation),
            entityType: reservedOperation.entityType,
            entityId: reservedOperation.entityId,
            status: 'processing',
            phase: 'reserved',
            response: null,
            expiresAt,
            createdAt: staleAt,
            updatedAt: staleAt,
          })
          const recovered = await push([reservedOperation])
          assert.equal(recovered.body.data.results[0].status, 'applied')
          assert.equal(
            await db.collection('clients').countDocuments({
              tenantId: tenantA,
              firstName: 'Восстановлено после reserved',
            }),
            1
          )

          const applyingOperation = {
            operationId: 'http-stale-applying',
            entityType: 'clients',
            entityId: 'local-stale-applying',
            method: 'create',
            payload: { firstName: 'Не должен создаться повторно' },
            attachments: [],
          }
          await db.collection('mobilesyncoperations').insertOne({
            tenantId: tenantA,
            userId: tenantA,
            operationId: applyingOperation.operationId,
            operationHash: getSyncOperationFingerprint(applyingOperation),
            entityType: applyingOperation.entityType,
            entityId: applyingOperation.entityId,
            status: 'processing',
            phase: 'applying',
            response: null,
            expiresAt,
            createdAt: staleAt,
            updatedAt: staleAt,
          })
          const unknown = await push([applyingOperation])
          assert.equal(unknown.body.data.results[0].status, 'failed')
          assert.equal(
            unknown.body.data.results[0].error.code,
            'OPERATION_STATE_UNKNOWN'
          )
          assert.equal(
            await db.collection('clients').countDocuments({
              tenantId: tenantA,
              firstName: 'Не должен создаться повторно',
            }),
            0
          )
        }
      )

      await t.test(
        'sync matrix покрывает мероприятия, финансы, услуги и группы',
        async () => {
          const push = (operations) =>
            readJson(
              apiRequest(baseUrl, '/api/mobile/v1/sync/push', {
                method: 'POST',
                headers: authHeaders(loginASecond.body.data.accessToken),
                body: JSON.stringify({ operations }),
              })
            )
          const pull = (accessToken, cursor = '') =>
            readJson(
              apiRequest(
                baseUrl,
                `/api/mobile/v1/sync/pull${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
                { headers: authHeaders(accessToken) }
              )
            )
          const createOperation = ({ operationId, entityType, payload }) => ({
            operationId,
            entityType,
            entityId: `local-${operationId}`,
            method: 'create',
            payload,
            attachments: [],
          })
          const mutateOperation = ({
            operationId,
            entityType,
            entityId,
            method,
            payload,
            baseVersion,
            baseValues = {},
          }) => ({
            operationId,
            entityType,
            entityId,
            method,
            ...(method === 'delete' ? {} : { payload }),
            baseVersion,
            baseValues,
            attachments: [],
          })

          const groupCreate = await push([
            createOperation({
              operationId: 'matrix-group-create',
              entityType: 'serviceGroups',
              payload: { title: 'Offline группа', order: 3 },
            }),
          ])
          const group = groupCreate.body.data.results[0].entity
          assert.equal(groupCreate.body.data.results[0].status, 'applied')
          assert.equal(group.syncVersion, 1)

          const initialCreates = await push([
            createOperation({
              operationId: 'matrix-service-create',
              entityType: 'services',
              payload: {
                title: 'Offline услуга',
                price: 15000,
                groupId: group._id,
                tenantId: String(tenantB),
              },
            }),
            createOperation({
              operationId: 'matrix-transaction-create',
              entityType: 'transactions',
              payload: {
                amount: 5000,
                type: 'income',
                category: 'deposit',
                paymentMethod: 'transfer',
                comment: 'Offline платёж',
              },
            }),
            createOperation({
              operationId: 'matrix-event-create',
              entityType: 'events',
              payload: {
                eventType: 'Свадьба',
                status: 'draft',
                description: 'Offline заявка',
              },
            }),
          ])
          assert.equal(
            initialCreates.response.status,
            200,
            JSON.stringify(initialCreates.body)
          )
          assert.deepEqual(
            initialCreates.body.data.results.map((item) => item.status),
            ['applied', 'applied', 'applied']
          )
          const [service, transaction, event] =
            initialCreates.body.data.results.map((item) => item.entity)
          assert.equal(service.tenantId, String(tenantA))
          assert.equal(service.groupId, group._id)
          assert.equal(transaction.syncVersion, 1)
          assert.equal(event.syncVersion, 1)

          const createPull = await pull(loginA.body.data.accessToken)
          assert.equal(
            createPull.body.data.entities.serviceGroups.some(
              (item) => item._id === group._id
            ),
            true
          )
          assert.equal(
            createPull.body.data.entities.services.some(
              (item) => item._id === service._id
            ),
            true
          )
          assert.equal(
            createPull.body.data.entities.transactions.some(
              (item) => item._id === transaction._id
            ),
            true
          )
          assert.equal(
            createPull.body.data.entities.events.some(
              (item) => item._id === event._id
            ),
            true
          )
          let cursor = createPull.body.data.cursor
          await new Promise((resolve) => setTimeout(resolve, 10))

          const updates = await push([
            mutateOperation({
              operationId: 'matrix-group-update',
              entityType: 'serviceGroups',
              entityId: group._id,
              method: 'update',
              payload: { title: 'Обновлённая группа' },
              baseVersion: 1,
              baseValues: { title: 'Offline группа' },
            }),
            mutateOperation({
              operationId: 'matrix-service-update',
              entityType: 'services',
              entityId: service._id,
              method: 'update',
              payload: { title: 'Обновлённая услуга', price: 17000 },
              baseVersion: 1,
              baseValues: { title: 'Offline услуга', price: 15000 },
            }),
            mutateOperation({
              operationId: 'matrix-transaction-update',
              entityType: 'transactions',
              entityId: transaction._id,
              method: 'update',
              payload: { amount: 7000, comment: 'Обновлённый платёж' },
              baseVersion: 1,
              baseValues: { amount: 5000, comment: 'Offline платёж' },
            }),
            mutateOperation({
              operationId: 'matrix-event-update',
              entityType: 'events',
              entityId: event._id,
              method: 'update',
              payload: { description: 'Обновлённая offline заявка' },
              baseVersion: 1,
              baseValues: { description: 'Offline заявка' },
            }),
          ])
          assert.deepEqual(
            updates.body.data.results.map((item) => item.status),
            ['applied', 'applied', 'applied', 'applied']
          )
          assert.deepEqual(
            updates.body.data.results.map((item) => item.entity.syncVersion),
            [2, 2, 2, 2]
          )

          const updatePull = await pull(loginA.body.data.accessToken, cursor)
          assert.equal(
            updatePull.body.data.entities.serviceGroups.some(
              (item) => item._id === group._id && item.syncVersion === 2
            ),
            true
          )
          assert.equal(
            updatePull.body.data.entities.services.some(
              (item) => item._id === service._id && item.syncVersion === 2
            ),
            true
          )
          assert.equal(
            updatePull.body.data.entities.transactions.some(
              (item) => item._id === transaction._id && item.syncVersion === 2
            ),
            true
          )
          assert.equal(
            updatePull.body.data.entities.events.some(
              (item) => item._id === event._id && item.syncVersion === 2
            ),
            true
          )
          cursor = updatePull.body.data.cursor
          await new Promise((resolve) => setTimeout(resolve, 10))

          const deletes = await push([
            mutateOperation({
              operationId: 'matrix-service-delete',
              entityType: 'services',
              entityId: service._id,
              method: 'delete',
              baseVersion: 2,
            }),
            mutateOperation({
              operationId: 'matrix-group-delete',
              entityType: 'serviceGroups',
              entityId: group._id,
              method: 'delete',
              baseVersion: 2,
            }),
            mutateOperation({
              operationId: 'matrix-transaction-delete',
              entityType: 'transactions',
              entityId: transaction._id,
              method: 'delete',
              baseVersion: 2,
            }),
            mutateOperation({
              operationId: 'matrix-event-delete',
              entityType: 'events',
              entityId: event._id,
              method: 'delete',
              baseVersion: 2,
            }),
          ])
          assert.deepEqual(
            deletes.body.data.results.map((item) => item.status),
            ['applied', 'applied', 'applied', 'applied']
          )

          const tombstonePull = await pull(loginA.body.data.accessToken, cursor)
          const expectedTombstones = new Set([
            `services:${service._id}`,
            `serviceGroups:${group._id}`,
            `transactions:${transaction._id}`,
            `events:${event._id}`,
          ])
          const receivedTombstones = new Set(
            tombstonePull.body.data.tombstones.map(
              (item) => `${item.entityType}:${item.entityId}`
            )
          )
          for (const key of expectedTombstones) {
            assert.equal(
              receivedTombstones.has(key),
              true,
              `Не получен tombstone ${key}`
            )
          }

          const foreignPull = await pull(loginB.body.data.accessToken)
          const foreignTombstones = new Set(
            foreignPull.body.data.tombstones.map(
              (item) => `${item.entityType}:${item.entityId}`
            )
          )
          for (const key of expectedTombstones) {
            assert.equal(
              foreignTombstones.has(key),
              false,
              `Утечка tombstone ${key}`
            )
          }
        }
      )

      await t.test(
        'управление устройствами не раскрывает ID и не отзывает текущую/чужую сессию',
        async () => {
          const sessionsA = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/auth/sessions', {
              headers: authHeaders(loginA.body.data.accessToken),
            })
          )
          assert.equal(sessionsA.response.status, 200)
          const sessionA = sessionsA.body.data.find((item) => item.current)
          const sessionASecond = sessionsA.body.data.find(
            (item) => !item.current
          )
          assert.ok(sessionA?._id)
          assert.ok(sessionASecond?._id)
          assert.equal(
            sessionsA.body.data.some(
              (item) =>
                'deviceId' in item ||
                'tenantId' in item ||
                'refreshTokenHash' in item
            ),
            false
          )

          const malformed = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/auth/sessions', {
              method: 'DELETE',
              headers: authHeaders(loginB.body.data.accessToken),
              body: JSON.stringify({ sessionId: 'not-an-object-id' }),
            })
          )
          assert.equal(malformed.response.status, 400)
          assert.equal(malformed.body.error.code, 'SESSION_ID_INVALID')

          const foreignRevoke = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/auth/sessions', {
              method: 'DELETE',
              headers: authHeaders(loginB.body.data.accessToken),
              body: JSON.stringify({ sessionId: sessionA._id }),
            })
          )
          assert.equal(foreignRevoke.response.status, 200)
          assert.equal(foreignRevoke.body.data.revoked, false)

          const stillAuthorized = await apiRequest(
            baseUrl,
            '/api/mobile/v1/auth/me',
            {
              headers: authHeaders(loginA.body.data.accessToken),
            }
          )
          assert.equal(stillAuthorized.status, 200)

          const currentRevoke = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/auth/sessions', {
              method: 'DELETE',
              headers: authHeaders(loginA.body.data.accessToken),
              body: JSON.stringify({ sessionId: sessionA._id }),
            })
          )
          assert.equal(currentRevoke.response.status, 400)
          assert.equal(
            currentRevoke.body.error.code,
            'SESSION_CURRENT_USE_LOGOUT'
          )

          const ownRevoke = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/auth/sessions', {
              method: 'DELETE',
              headers: authHeaders(loginA.body.data.accessToken),
              body: JSON.stringify({ sessionId: sessionASecond._id }),
            })
          )
          assert.equal(ownRevoke.body.data.revoked, true)
          const revokedAccess = await apiRequest(
            baseUrl,
            '/api/mobile/v1/auth/me',
            {
              headers: authHeaders(loginASecond.body.data.accessToken),
            }
          )
          assert.equal(revokedAccess.status, 401)
          const currentStillAuthorized = await apiRequest(
            baseUrl,
            '/api/mobile/v1/auth/me',
            { headers: authHeaders(loginA.body.data.accessToken) }
          )
          assert.equal(currentStillAuthorized.status, 200)
        }
      )

      await t.test(
        'offline logout отзывается по refresh token без access token и отключает push устройства',
        async () => {
          const offlineSession = await login(
            '79000000001',
            'device-offline-logout'
          )
          assert.equal(offlineSession.response.status, 200)
          const pushToken = 'ExpoPushToken[offline-logout-test]'
          const subscribed = await apiRequest(
            baseUrl,
            '/api/push/expo/subscribe',
            {
              method: 'POST',
              headers: {
                ...authHeaders(offlineSession.body.data.accessToken),
                'x-device-id': 'device-offline-logout',
              },
              body: JSON.stringify({
                pushToken,
                platform: 'android',
                appVersion: '1.0.0',
              }),
            }
          )
          assert.equal(subscribed.status, 200)

          const logout = await readJson(
            apiRequest(baseUrl, '/api/mobile/v1/auth/logout', {
              method: 'POST',
              body: JSON.stringify({
                refreshToken: offlineSession.body.data.refreshToken,
              }),
            })
          )
          assert.equal(logout.response.status, 200, JSON.stringify(logout.body))
          assert.equal(logout.body.data.loggedOut, true)

          const revokedAccess = await apiRequest(
            baseUrl,
            '/api/mobile/v1/auth/me',
            { headers: authHeaders(offlineSession.body.data.accessToken) }
          )
          assert.equal(revokedAccess.status, 401)
          const storedPush = await db.collection('expopushtokens').findOne({
            tenantId: tenantA,
            deviceId: 'device-offline-logout',
            pushToken,
          })
          assert.equal(storedPush?.isActive, false)

          const replay = await apiRequest(
            baseUrl,
            '/api/mobile/v1/auth/logout',
            {
              method: 'POST',
              body: JSON.stringify({
                refreshToken: offlineSession.body.data.refreshToken,
              }),
            }
          )
          assert.equal(replay.status, 200)
        }
      )

      await t.test(
        'явная push-отписка одного устройства не отключает второе',
        async () => {
          const deviceOne = await login('79000000001', 'push-device-one')
          const deviceTwo = await login('79000000001', 'push-device-two')
          const tokenOne = 'ExpoPushToken[device-one]'
          const tokenTwo = 'ExpoPushToken[device-two]'
          const subscribe = (session, deviceId, pushToken) =>
            apiRequest(baseUrl, '/api/push/expo/subscribe', {
              method: 'POST',
              headers: {
                ...authHeaders(session.body.data.accessToken),
                'x-device-id': deviceId,
              },
              body: JSON.stringify({
                pushToken,
                platform: 'android',
                appVersion: '1.0.0',
              }),
            })
          assert.equal(
            (await subscribe(deviceOne, 'push-device-one', tokenOne)).status,
            200
          )
          assert.equal(
            (await subscribe(deviceTwo, 'push-device-two', tokenTwo)).status,
            200
          )

          const foreignDeviceAttempt = await apiRequest(
            baseUrl,
            '/api/push/expo/unsubscribe',
            {
              method: 'POST',
              headers: {
                ...authHeaders(deviceOne.body.data.accessToken),
                'x-device-id': 'push-device-one',
              },
              body: JSON.stringify({ pushToken: tokenTwo }),
            }
          )
          assert.equal(foreignDeviceAttempt.status, 200)
          assert.equal(
            (
              await db.collection('expopushtokens').findOne({
                tenantId: tenantA,
                pushToken: tokenTwo,
              })
            )?.isActive,
            true
          )

          const ownUnsubscribe = await apiRequest(
            baseUrl,
            '/api/push/expo/unsubscribe',
            {
              method: 'POST',
              headers: {
                ...authHeaders(deviceOne.body.data.accessToken),
                'x-device-id': 'push-device-one',
              },
              body: JSON.stringify({ pushToken: tokenOne }),
            }
          )
          assert.equal(ownUnsubscribe.status, 200)
          const [storedOne, storedTwo] = await Promise.all([
            db.collection('expopushtokens').findOne({
              tenantId: tenantA,
              pushToken: tokenOne,
            }),
            db.collection('expopushtokens').findOne({
              tenantId: tenantA,
              pushToken: tokenTwo,
            }),
          ])
          assert.equal(storedOne?.isActive, false)
          assert.equal(storedTwo?.isActive, true)
        }
      )

      await t.test(
        'file route проверяет bearer, размер и серверный tenant-каталог',
        async () => {
          const unauthorizedForm = new FormData()
          unauthorizedForm.append('files', new Blob(['test']), 'test.txt')
          const unauthorized = await apiRequest(
            baseUrl,
            '/api/mobile/v1/files',
            {
              method: 'POST',
              body: unauthorizedForm,
            }
          )
          assert.equal(unauthorized.status, 401)

          const multipleForm = new FormData()
          multipleForm.append('files', new Blob(['one']), 'one.txt')
          multipleForm.append('files', new Blob(['two']), 'two.txt')
          const multiple = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/files', {
              method: 'POST',
              headers: authHeaders(loginB.body.data.accessToken),
              body: multipleForm,
            })
          )
          assert.equal(multiple.response.status, 400)
          assert.equal(multiple.body.error.code, 'FILE_REQUIRED')

          const oversizedForm = new FormData()
          oversizedForm.append(
            'files',
            new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)]),
            'large.bin'
          )
          const oversized = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/files', {
              method: 'POST',
              headers: authHeaders(loginB.body.data.accessToken),
              body: oversizedForm,
            })
          )
          assert.equal(oversized.response.status, 413)
          assert.equal(oversized.body.error.code, 'FILE_TOO_LARGE')

          const uploadForm = new FormData()
          uploadForm.append('directory', 'artistcrm/another-tenant/private')
          uploadForm.append(
            'files',
            new Blob(['safe-content']),
            '../../unsafe?.docx'
          )
          const uploaded = await readJson(
            await apiRequest(baseUrl, '/api/mobile/v1/files', {
              method: 'POST',
              headers: authHeaders(loginB.body.data.accessToken),
              body: uploadForm,
            })
          )
          assert.equal(
            uploaded.response.status,
            200,
            JSON.stringify(uploaded.body)
          )
          assert.equal(cloudRequests.length, 1)
          assert.match(
            cloudRequests[0].body,
            new RegExp(`artistcrm/${tenantB}/mobile`)
          )
          assert.match(cloudRequests[0].body, /\.\._\.\._unsafe_\.docx/)
          assert.doesNotMatch(cloudRequests[0].body, /another-tenant/)
          assert.equal(
            cloudRequests[0].headers['x-api-password'],
            'integration-password'
          )

          const eventAttachmentForm = () => {
            const form = new FormData()
            form.append('fileQueueId', 'mobile-event-file-1')
            form.append(
              'files',
              new Blob(['event-image'], { type: 'image/jpeg' }),
              'photo.jpg'
            )
            return form
          }
          const eventAttachment = await readJson(
            await apiRequest(
              baseUrl,
              `/api/mobile/v1/events/${taskEventB}/files`,
              {
                method: 'POST',
                headers: authHeaders(loginB.body.data.accessToken),
                body: eventAttachmentForm(),
              }
            )
          )
          assert.equal(
            eventAttachment.response.status,
            200,
            JSON.stringify(eventAttachment.body)
          )
          assert.equal(
            eventAttachment.body.data.document.id,
            'mobile-event-file-1'
          )
          assert.equal(cloudRequests.length, 2)
          assert.match(
            cloudRequests[1].body,
            new RegExp(
              `vedelo/${tenantB}/events/${taskEventB}/documents/mobile-event-file-1`
            )
          )

          const replayAttachment = await readJson(
            await apiRequest(
              baseUrl,
              `/api/mobile/v1/events/${taskEventB}/files`,
              {
                method: 'POST',
                headers: authHeaders(loginB.body.data.accessToken),
                body: eventAttachmentForm(),
              }
            )
          )
          assert.equal(replayAttachment.response.status, 200)
          assert.equal(
            cloudRequests.length,
            2,
            'replay не должен повторно загружать файл'
          )
          const storedEventB = await db
            .collection('events')
            .findOne({ _id: taskEventB })
          assert.equal(storedEventB.documents.length, 1)
          assert.equal(
            storedEventB.documents[0].file.storageKey,
            `vedelo/${tenantB}/events/${taskEventB}/documents/mobile-event-file-1`
          )

          const foreignAttachment = await readJson(
            await apiRequest(
              baseUrl,
              `/api/mobile/v1/events/${taskEventA}/files`,
              {
                method: 'POST',
                headers: authHeaders(loginB.body.data.accessToken),
                body: eventAttachmentForm(),
              }
            )
          )
          assert.equal(foreignAttachment.response.status, 404)
          assert.equal(cloudRequests.length, 2)
        }
      )

      await t.test(
        'phone registration/recovery и VK PKCE соблюдают mobile auth contract',
        async () => {
          const post = (path, body) =>
            readJson(
              apiRequest(baseUrl, path, {
                method: 'POST',
                body: JSON.stringify(body),
              })
            )
          const registerPhone = '79000000003'
          const registerPassword = 'RegisteredPassword123!'

          const registerStart = await post('/api/phone/verify/start', {
            phone: registerPhone,
            flow: 'register',
          })
          assert.equal(
            registerStart.response.status,
            200,
            JSON.stringify(registerStart.body)
          )
          assert.equal(registerStart.body.data.id, 3003)
          assert.equal(
            JSON.stringify(registerStart.body).includes('mock-telefonip-token'),
            false
          )

          const registerCheck = await post('/api/phone/verify/check', {
            phone: registerPhone,
            callId: registerStart.body.data.id,
          })
          assert.equal(
            registerCheck.response.status,
            200,
            JSON.stringify(registerCheck.body)
          )
          assert.equal(registerCheck.body.data.confirmed, true)

          const withoutConsent = await post('/api/mobile/v1/auth/register', {
            phone: registerPhone,
            password: registerPassword,
            deviceId: 'registered-device',
            platform: 'android',
          })
          assert.equal(withoutConsent.response.status, 400)
          assert.equal(withoutConsent.body.error.code, 'CONSENT_REQUIRED')

          const legacyTwoConsents = await post('/api/mobile/v1/auth/register', {
            phone: registerPhone,
            password: registerPassword,
            consentPrivacyPolicy: true,
            consentPersonalData: true,
            deviceId: 'registered-device',
            platform: 'android',
          })
          assert.equal(legacyTwoConsents.response.status, 400)
          assert.equal(legacyTwoConsents.body.error.code, 'CONSENT_REQUIRED')

          const registered = await post('/api/mobile/v1/auth/register', {
            phone: registerPhone,
            password: registerPassword,
            consentTerms: true,
            consentPrivacyPolicy: true,
            consentPersonalData: true,
            deviceId: 'registered-device',
            platform: 'android',
          })
          assert.equal(
            registered.response.status,
            201,
            JSON.stringify(registered.body)
          )
          assert.equal(registered.body.data.user.phone, registerPhone)
          assert.equal(registered.body.data.user.consentTermsAccepted, true)
          assert.equal(
            registered.body.data.user.consentPrivacyPolicyAccepted,
            true
          )
          assert.equal(
            registered.body.data.user.consentPersonalDataAccepted,
            true
          )
          const registeredRecord = await db
            .collection('users')
            .findOne({ phone: registerPhone })
          assert.ok(registeredRecord)
          assert.equal(
            String(registeredRecord.tenantId),
            String(registeredRecord._id)
          )
          assert.equal(
            await bcrypt.compare(registerPassword, registeredRecord.password),
            true
          )

          const vkExisting = await post('/api/mobile/v1/auth/vk', {
            code: 'vk-existing-code',
            device_id: 'vk-provider-device-a',
            code_verifier: 'vk-pkce-verifier-a',
            mode: 'login',
            deviceId: 'android-vk-existing',
            platform: 'android',
          })
          assert.equal(
            vkExisting.response.status,
            200,
            JSON.stringify(vkExisting.body)
          )
          assert.equal(vkExisting.body.data.user._id, String(tenantA))

          const vkUnknownLogin = await post('/api/mobile/v1/auth/vk', {
            code: 'vk-new-code',
            device_id: 'vk-provider-device-new',
            code_verifier: 'vk-pkce-verifier-new',
            mode: 'login',
            deviceId: 'android-vk-unknown',
            platform: 'android',
          })
          assert.equal(vkUnknownLogin.response.status, 404)
          assert.equal(vkUnknownLogin.body.error.code, 'VK_PROFILE_NOT_FOUND')
          assert.equal(
            await db
              .collection('users')
              .countDocuments({ phone: '79000000004' }),
            0
          )

          const vkWithoutConsent = await post('/api/mobile/v1/auth/vk', {
            code: 'vk-new-code',
            device_id: 'vk-provider-device-new',
            code_verifier: 'vk-pkce-verifier-new',
            mode: 'register',
            deviceId: 'android-vk-new',
            platform: 'android',
          })
          assert.equal(vkWithoutConsent.response.status, 400)
          assert.equal(vkWithoutConsent.body.error.code, 'CONSENT_REQUIRED')
          assert.equal(
            await db
              .collection('users')
              .countDocuments({ phone: '79000000004' }),
            0
          )

          const vkWithoutTerms = await post('/api/mobile/v1/auth/vk', {
            code: 'vk-new-code',
            device_id: 'vk-provider-device-new',
            code_verifier: 'vk-pkce-verifier-new',
            mode: 'register',
            consentPrivacyPolicy: true,
            consentPersonalData: true,
            deviceId: 'android-vk-new',
            platform: 'android',
          })
          assert.equal(vkWithoutTerms.response.status, 400)
          assert.equal(vkWithoutTerms.body.error.code, 'CONSENT_REQUIRED')

          const vkRegistered = await post('/api/mobile/v1/auth/vk', {
            code: 'vk-new-code',
            device_id: 'vk-provider-device-new',
            code_verifier: 'vk-pkce-verifier-new',
            mode: 'register',
            consentTerms: true,
            consentPrivacyPolicy: true,
            consentPersonalData: true,
            deviceId: 'android-vk-new',
            platform: 'android',
          })
          assert.equal(
            vkRegistered.response.status,
            200,
            JSON.stringify(vkRegistered.body)
          )
          assert.equal(vkRegistered.body.data.user.phone, '79000000004')
          assert.equal(vkRegistered.body.data.user.registrationType, 'vk')
          assert.equal(vkRegistered.body.data.user.consentTermsAccepted, true)
          assert.equal(
            vkRegistered.body.data.user.consentPrivacyPolicyAccepted,
            true
          )
          assert.equal(
            vkRegistered.body.data.user.consentPersonalDataAccepted,
            true
          )

          const recoveryStart = await post('/api/phone/verify/start', {
            phone: '79000000002',
            flow: 'recovery',
          })
          assert.equal(
            recoveryStart.response.status,
            200,
            JSON.stringify(recoveryStart.body)
          )
          const smsSent = await post('/api/phone/verify/sms/send', {
            phone: '79000000002',
            flow: 'recovery',
          })
          assert.equal(
            smsSent.response.status,
            200,
            JSON.stringify(smsSent.body)
          )
          assert.equal(smsSent.body.data.smsSent, true)
          assert.equal('debugCode' in smsSent.body.data, false)
          const smsRequest = providerRequests.findLast(
            (request) => request.url === '/sms'
          )
          assert.ok(smsRequest)
          const smsPayload = JSON.parse(smsRequest.body)
          assert.equal(smsPayload.phone, '79000000002')
          assert.equal(smsPayload.flow, 'recovery')
          assert.match(smsPayload.code, /^\d{4,6}$/)

          const smsChecked = await post('/api/phone/verify/sms/check', {
            phone: '79000000002',
            flow: 'recovery',
            code: smsPayload.code,
          })
          assert.equal(
            smsChecked.response.status,
            200,
            JSON.stringify(smsChecked.body)
          )
          assert.equal(smsChecked.body.data.confirmed, true)

          const recoveredPassword = 'RecoveredPassword123!'
          const recovered = await post('/api/mobile/v1/auth/recovery', {
            phone: '79000000002',
            password: recoveredPassword,
            deviceId: 'device-b-recovered',
            platform: 'android',
          })
          assert.equal(
            recovered.response.status,
            200,
            JSON.stringify(recovered.body)
          )
          const previousAccess = await apiRequest(
            baseUrl,
            '/api/mobile/v1/auth/me',
            {
              headers: authHeaders(loginB.body.data.accessToken),
            }
          )
          assert.equal(previousAccess.status, 401)

          const oldPasswordLogin = await post('/api/mobile/v1/auth/login', {
            phone: '79000000002',
            password,
            deviceId: 'device-b-old-password',
            platform: 'android',
          })
          assert.equal(oldPasswordLogin.response.status, 401)
          const newPasswordLogin = await post('/api/mobile/v1/auth/login', {
            phone: '79000000002',
            password: recoveredPassword,
            deviceId: 'device-b-new-password',
            platform: 'android',
          })
          assert.equal(
            newPasswordLogin.response.status,
            200,
            JSON.stringify(newPasswordLogin.body)
          )

          const vkRequests = providerRequests.filter((request) =>
            request.url.startsWith('/vk-id/')
          )
          // Два запроса регистрации без полного набора согласий отклоняются
          // до передачи authorization code провайдеру.
          assert.equal(vkRequests.length, 6)
          const firstVkExchange = vkRequests.find((request) =>
            request.url.startsWith('/vk-id/oauth2/auth')
          )
          assert.ok(firstVkExchange)
          const firstVkExchangeUrl = new URL(
            firstVkExchange.url,
            'http://mock.local'
          )
          assert.equal(
            firstVkExchangeUrl.searchParams.get('client_id'),
            'mock-vk-app-id'
          )
          assert.equal(
            firstVkExchangeUrl.searchParams.get('code_verifier'),
            'vk-pkce-verifier-a'
          )
          const authResponsesJson = JSON.stringify({
            registered: registered.body,
            vkExisting: vkExisting.body,
            vkRegistered: vkRegistered.body,
            recovered: recovered.body,
          })
          for (const secret of [
            'mock-telefonip-token',
            'mock-vk-client-secret',
            'mock-vk-existing-token',
            'mock-vk-new-token',
            smsPayload.code,
          ]) {
            assert.equal(
              authResponsesJson.includes(secret),
              false,
              `Auth API раскрыл ${secret}`
            )
          }
        }
      )
      await t.test(
        'web credentials → клиент → заявка → оплаты → закрытие, tenant isolation',
        async () => {
          const webTenantA = new mongoose.Types.ObjectId()
          const webTenantB = new mongoose.Types.ObjectId()
          const webTariffId = new mongoose.Types.ObjectId()
          await db.collection('tariffs').insertOne({
            _id: webTariffId,
            title: 'Web smoke',
            eventsPerMonth: 100,
            allowDocuments: true,
            allowStatistics: true,
          })
          await db.collection('users').insertMany([
            {
              _id: webTenantA,
              tenantId: webTenantA,
              phone: '79000000881',
              password: passwordHash,
              tariffId: webTariffId,
              role: 'user',
              archive: false,
            },
            {
              _id: webTenantB,
              tenantId: webTenantB,
              phone: '79000000882',
              password: passwordHash,
              tariffId: webTariffId,
              role: 'user',
              archive: false,
            },
          ])
          await runWebCoreSmoke({
            baseUrl,
            password,
            tenantA: webTenantA,
            tenantB: webTenantB,
            phoneA: '79000000881',
            phoneB: '79000000882',
          })
        }
      )
      await t.test('web integrations/billing: tenant isolation и права', async (isolationTest) => {
        await runIntegrationIsolationSmoke({ t: isolationTest, baseUrl, db, password, passwordHash })
      })
      await t.test(
        'browser: вход и гидратация на desktop и телефоне',
        {
          skip: process.env.PLAYWRIGHT_MODULE
            ? false
            : 'PLAYWRIGHT_MODULE не настроен',
        },
        async () => {
          await runBrowserSmoke({ baseUrl, phone: '79000000881', password })
        }
      )
      await t.test(
        'Public Leads и Tilda: ключи, tenant, дедупликация и очистка секретов',
        async () => {
          await runPublicLeadSmoke({ baseUrl, db })
        }
      )
      await t.test(
        'browser: offline-очередь после перезапуска процесса',
        {
          skip: process.env.PLAYWRIGHT_MODULE
            ? false
            : 'PLAYWRIGHT_MODULE не настроен',
        },
        async () => {
          const repeats = Math.min(12, Math.max(1, Number(process.env.OFFLINE_SYNC_REPEATS) || 3))
          for (let index = 0; index < repeats; index += 1) {
            await runRestartSmoke({ baseUrl, phone: '79000000881', password })
          }
        }
      )
      await t.test(
        'documents: договор/акт, реквизиты, tenant и тариф',
        async () => {
          await runDocumentsHttpSmoke({
            baseUrl,
            db,
            password,
            passwordHash,
            cloudRequests,
          })
        }
      )
      await t.test(
        'billing: повтор, неверная сумма и параллельные начисления',
        async () => {
          await runPaymentProcessingSmoke({ db })
        }
      )
    } finally {
      await terminate(appProcess)
      await new Promise((resolve) => cloudServer.close(resolve))
      if (db) await db.close()
      await terminate(mongod)
      await rm(dbPath, { recursive: true, force: true }).catch(() => undefined)
    }
  }
)
