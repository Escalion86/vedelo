import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import mongoose from 'mongoose'

// Только временная БД и локальный HTTP-сервер из integration runner.
// У платежей нет providerPaymentId: даже успешная авторизация не вызывает банк.
export const runIntegrationIsolationSmoke = async ({ t, baseUrl, db, password, passwordHash }) => {
  const oid = () => new mongoose.Types.ObjectId()
  const tenantA = oid()
  const tenantB = oid()
  const tariffId = oid()
  await db.collection('tariffs').insertOne({
    _id: tariffId, title: 'Web isolation', eventsPerMonth: 100,
    allowAvitoIntegration: true, allowVkIntegration: true, allowTelegramIntegration: true,
  })
  const users = [tenantA, tenantB].map((_id, index) => ({
    _id, tenantId: _id, phone: `7900000089${index + 1}`, password: passwordHash,
    tariffId, role: 'user', archive: false,
  }))
  await db.collection('users').insertMany(users)
  const login = async (phone) => {
    const cookies = new Map()
    const request = async (pathname, options = {}) => {
      const response = await fetch(`${baseUrl}${pathname}`, {
        ...options, redirect: 'manual',
        headers: {
          cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          ...options.headers,
        },
      })
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0]
        const separator = pair.indexOf('=')
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
      }
      return response
    }
    const { csrfToken } = await (await request('/api/auth/csrf')).json()
    const response = await request('/api/auth/callback/credentials', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ phone, password, csrfToken, json: 'true', callbackUrl: `${baseUrl}/cabinet/attention` }),
    })
    assert.equal(response.status, 200)
    assert.ok((await (await request('/api/auth/session')).json()).user?._id)
    return request
  }
  const userA = await login(users[0].phone)
  const userB = await login(users[1].phone)
  const anonymous = (path, options) => fetch(`${baseUrl}${path}`, options)
  const send = (request, path, method, body, headers = {}) => request(path, {
    method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
  const payments = []
  for (const provider of ['tochka', 'yookassa']) {
    const rows = [
      { tenantId: tenantA, userId: tenantA },
      { tenantId: tenantB, userId: tenantB },
      { tenantId: tenantB, userId: tenantA },
      { tenantId: tenantA, userId: tenantB },
    ].map((owner) => ({
      _id: oid(), ...owner, provider, source: provider, providerPaymentId: '',
      amount: 100, type: 'topup', purpose: 'balance', status: 'pending',
      idempotenceKey: `synthetic-private-payment-key-${provider}`, createdAt: new Date(),
    }))
    payments.push(...rows)
    await db.collection('payments').insertMany(rows)
    const endpoint = `/api/billing/${provider}/sync`
    await t.test(`${provider}: неверный ID возвращает 400`, async () => {
      assert.equal((await send(userA, endpoint, 'POST', { paymentId: 'invalid' })).status, 400)
    })
    await t.test(`${provider}: доступ к платежу требует владельца и tenant`, async () => {
      assert.equal((await send(anonymous, endpoint, 'POST', { paymentId: rows[0]._id })).status, 401)
      for (const row of rows.slice(1)) {
        assert.equal((await send(userA, endpoint, 'POST', {
          paymentId: row._id, tenantId: tenantB, userId: tenantB, role: 'admin',
        })).status, 404, `Недоступный платеж ${row._id}`)
      }
      const own = await send(userA, endpoint, 'POST', { paymentId: rows[0]._id })
      assert.equal(own.status, 200)
      assert.equal((await own.json()).data.error, 'provider_payment_id_missing')
      assert.equal((await send(userB, endpoint, 'POST', { paymentId: rows[0]._id })).status, 404)
    })
    await t.test(`${provider}: сохранён служебный доступ admin/dev`, async () => {
      try {
        for (const role of ['admin', 'dev']) {
          await db.collection('users').updateOne({ _id: tenantA }, { $set: { role } })
          assert.equal((await send(userA, endpoint, 'POST', { paymentId: rows[1]._id })).status, 200)
        }
      } finally {
        await db.collection('users').updateOne({ _id: tenantA }, { $set: { role: 'user' } })
      }
    })
  }
  await t.test('История платежей: чужие операции и внутренние поля скрыты', async () => {
    const response = await userA(`/api/billing/history?tenantId=${tenantB}`)
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.deepEqual(new Set(result.data.items.map(item => item.id)), new Set(
      payments.filter(row => row.tenantId.equals(tenantA) && row.userId.equals(tenantA)).map(row => String(row._id))
    ))
    assert.equal(JSON.stringify(result).includes('synthetic-private-payment-key'), false)
    for (const item of result.data.items) {
      assert.equal('providerPaymentId' in item, false)
      assert.equal('management' in item, false)
    }
    assert.equal((await userA(`/api/billing/history?userId=${tenantB}`)).status, 403)
    assert.equal((await userA('/api/billing/operations')).status, 403)
    assert.equal((await anonymous('/api/billing/history')).status, 401)
  })

  await t.test('Платёжные webhook отклоняют неверную подпись/секрет без изменения баланса', async () => {
    const balancesBefore = await db.collection('users').find({ _id: { $in: [tenantA, tenantB] } })
      .project({ balance: 1 }).sort({ _id: 1 }).toArray()
    const tochka = await anonymous('/api/billing/tochka/webhook', { method: 'POST', body: 'invalid-jwt' })
    assert.equal(tochka.status, 403)
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
    const signingInput = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
      webhookType: 'acquiringInternetPayment', operationId: 'must-not-sync', status: 'APPROVED',
    })}`
    const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url')
    assert.equal((await anonymous('/api/billing/tochka/webhook', {
      method: 'POST', body: `${signingInput}.${signature}`,
    })).status, 403)
    for (const token of ['', 'wrong-secret']) {
      assert.equal((await send(anonymous, `/api/billing/yookassa/webhook?token=${token}`, 'POST', {
        event: 'payment.succeeded', object: { id: 'must-not-sync', paid: true, status: 'succeeded' },
      })).status, 403)
    }
    // Корректный секрет + пустое уведомление не обращается к провайдеру.
    assert.equal((await send(anonymous, '/api/billing/yookassa/webhook', 'POST', {}, {
      'x-webhook-token': 'isolation-yookassa-secret',
    })).status, 200)
    assert.deepEqual(await db.collection('users').find({ _id: { $in: [tenantA, tenantB] } })
      .project({ balance: 1 }).sort({ _id: 1 }).toArray(), balancesBefore)
    assert.equal(await db.collection('payments').countDocuments({ _id: { $in: payments.map(row => row._id) }, status: 'pending' }), payments.length)
  })

  const clientA = oid()
  const clientB = oid()
  const eventB = oid()
  await db.collection('clients').insertMany([
    { _id: clientA, tenantId: tenantA, firstName: 'Isolation A' },
    { _id: clientB, tenantId: tenantB, firstName: 'Isolation B' },
  ])
  await db.collection('events').insertOne({ _id: eventB, tenantId: tenantB, status: 'draft' })
  const conversations = {}
  for (const provider of ['avito', 'vk', 'telegram']) {
    const providerFields = provider === 'avito' ? { avitoChatId: 'shared-chat' }
      : provider === 'vk' ? { vkPeerId: 'shared-chat' }
        : { telegramChatId: 'shared-chat', businessConnectionId: 'synthetic-connection', lastIncomingAt: new Date() }
    const rows = [
      { _id: oid(), tenantId: tenantA, clientId: clientA },
      { _id: oid(), tenantId: tenantB, clientId: clientB },
    ].map(row => ({ ...row, ...providerFields, status: 'open', unreadCount: 3, lastMessageAt: new Date() }))
    conversations[provider] = rows
    await db.collection(`${provider}conversations`).insertMany(rows)
    await db.collection(`${provider}messages`).insertMany(rows.map(row => ({
      _id: oid(), tenantId: row.tenantId, clientId: row.clientId, conversationId: row._id,
      ...providerFields, direction: 'incoming', text: row.tenantId.equals(tenantA) ? 'Own message' : 'Foreign message',
      sentAt: new Date(), status: 'received', raw: { secret: 'synthetic-private-raw' },
    })))
  }
  const settings = [tenantA, tenantB].map((tenantId, index) => ({ tenantId, custom: {
    telegramBusinessEnabled: true, telegramBusinessAutoCreateClients: false,
    telegramBusinessBotToken: `synthetic-bot-${index}`, telegramBusinessConnectionId: 'synthetic-connection',
    telegramBusinessWebhookToken: `isolation-webhook-${index}`, telegramBusinessWebhookSecret: `isolation-secret-${index}`,
    telegramBusinessRights: { can_reply: false },
  } }))
  await db.collection('sitesettings').insertMany(settings)

  await t.test('Web messenger: чтение и отметка прочитанного изолированы по tenant', async () => {
    for (const method of ['GET', 'PATCH']) {
      const response = await userA(`/api/clients/${clientB}/messenger`, { method })
      assert.equal(response.status, 200)
      const result = await response.json()
      assert.deepEqual(result.data.conversations, [])
      assert.deepEqual(result.data.messages, [])
    }
    const own = await (await userA(`/api/clients/${clientA}/messenger`)).json()
    assert.equal(own.data.conversations.length, 3)
    assert.equal(own.data.messages.length, 3)
    assert.equal(JSON.stringify(own).includes('synthetic-private-raw'), false)
    assert.equal(JSON.stringify(own).includes('Foreign message'), false)
    for (const provider of Object.keys(conversations)) {
      const row = await db.collection(`${provider}conversations`).findOne({ _id: conversations[provider][1]._id })
      assert.equal(row.unreadCount, 3)
    }
    assert.equal((await anonymous(`/api/clients/${clientA}/messenger`)).status, 401)
  })
  for (const provider of Object.keys(conversations)) {
    await t.test(`${provider}: отправка в чужой диалог отклоняется`, async () => {
      for (const clientId of [clientA, clientB]) {
        assert.equal((await send(userA, `/api/clients/${clientId}/messenger`, 'POST', {
          provider, conversationId: conversations[provider][1]._id, text: 'Must not send', tenantId: tenantB,
        })).status, 404)
      }
      if (provider === 'telegram') return
      const ownPath = `/api/integrations/${provider}/conversations/${conversations[provider][0]._id}`
      const foreignPath = `/api/integrations/${provider}/conversations/${conversations[provider][1]._id}`
      assert.equal((await userA(`${foreignPath}/messages`)).status, 404)
      assert.equal((await send(userA, `${foreignPath}/messages`, 'POST', { text: 'Must not send' })).status, 404)
      for (const body of [{ clientId: clientB }, { eventId: eventB }]) {
        assert.equal((await send(userA, ownPath, 'PATCH', body)).status, 404)
      }
      assert.equal((await send(userA, foreignPath, 'PATCH', { markRead: true, status: 'closed' })).status, 404)
      const row = await db.collection(`${provider}conversations`).findOne({ _id: conversations[provider][1]._id })
      assert.equal(row.unreadCount, 3)
      assert.equal(row.status, 'open')
    })
  }
  await t.test('Telegram: секреты скрыты, запрет ответа и истёкшее окно соблюдаются', async () => {
    const response = await userA('/api/integrations/telegram/status')
    assert.equal(response.status, 200)
    const status = await response.json()
    assert.equal(status.data.hasBotToken, true)
    assert.equal(JSON.stringify(status).includes('synthetic-bot'), false)
    assert.equal(JSON.stringify(status).includes('isolation-secret'), false)
    const reply = () => send(userA, `/api/clients/${clientA}/messenger`, 'POST', {
      provider: 'telegram', conversationId: conversations.telegram[0]._id, text: 'Must not send',
    })
    const denied = await reply()
    assert.equal(denied.status, 403)
    assert.equal((await denied.json()).error.code, 'reply_not_allowed')
    await db.collection('telegramconversations').updateOne({ _id: conversations.telegram[0]._id }, {
      $set: { lastIncomingAt: new Date(Date.now() - 25 * 3600_000) },
    })
    const expired = await reply()
    assert.equal(expired.status, 400)
    assert.equal((await expired.json()).error.code, 'reply_window_closed')
  })
  await t.test('Telegram webhook: секрет, повтор доставки, подмена tenant и удаление', async () => {
    const endpoint = index => `/api/integrations/telegram/webhook/isolation-webhook-${index}`
    const payload = { tenantId: String(tenantB), business_message: {
      message_id: 919191, business_connection_id: 'synthetic-connection',
      date: Math.floor(Date.now() / 1000), chat: { id: 919191, type: 'private' },
      from: { id: 919191, first_name: 'Webhook fixture' }, text: 'Webhook isolation',
    } }
    const deliver = (index, body = payload, secret = `isolation-secret-${index}`) => send(
      anonymous, endpoint(index), 'POST', body, { 'x-telegram-bot-api-secret-token': secret }
    )
    const messageFilter = { telegramChatId: '919191', telegramMessageId: '919191' }
    assert.equal((await deliver(0, payload, 'wrong-secret')).status, 403)
    assert.equal(await db.collection('telegrammessages').countDocuments(messageFilter), 0)
    for (const index of [0, 0, 1]) assert.equal((await deliver(index)).status, 200)
    for (const tenantId of [tenantA, tenantB]) {
      assert.equal(await db.collection('telegrammessages').countDocuments({ ...messageFilter, tenantId }), 1)
      const conversation = await db.collection('telegramconversations').findOne({ tenantId, telegramChatId: '919191' })
      assert.equal(conversation.unreadCount, 1)
    }
    assert.equal((await deliver(0, { tenantId: String(tenantB), deleted_business_messages: {
      chat: { id: 919191 }, message_ids: [919191],
    } })).status, 200)
    assert.equal(await db.collection('telegrammessages').countDocuments({ ...messageFilter, tenantId: tenantA }), 0)
    assert.equal(await db.collection('telegrammessages').countDocuments({ ...messageFilter, tenantId: tenantB }), 1)
  })
  await t.test('Тариф запрещает Telegram status и webhook до изменения данных', async () => {
    await db.collection('tariffs').updateOne({ _id: tariffId }, { $set: { allowTelegramIntegration: false } })
    assert.equal((await userA('/api/integrations/telegram/status')).status, 403)
    const response = await send(anonymous, '/api/integrations/telegram/webhook/isolation-webhook-0', 'POST', {
      business_connection: { id: 'must-not-save', is_enabled: true },
    }, { 'x-telegram-bot-api-secret-token': 'isolation-secret-0' })
    assert.equal(response.status, 403)
    const saved = await db.collection('sitesettings').findOne({ tenantId: tenantA })
    assert.equal(saved.custom.telegramBusinessConnectionId, 'synthetic-connection')
  })
}
