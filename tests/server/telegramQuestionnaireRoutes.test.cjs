const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const fs = require('node:fs')
const test = require('node:test')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const load = (filename, mocks) => {
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
  })
  const compiled = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    assert.ok(id in mocks, id)
    return mocks[id]
  }, compiled, compiled.exports)
  return compiled.exports
}

const tenantId = 'a'.repeat(24)
const foreignTenantId = 'b'.repeat(24)
const id = '1'.repeat(24)
const privateFile = { id, name: 'Портфолио.jpg', type: 'photo' }
const loggerlessResponse = { NextResponse: { json: (body, options) => Response.json(body, options) } }
const root = 'app/api/integrations/telegram'
const loadIntegrationAccess = ({ getRequestContext, getUserTariffAccess } = {}) => load('server/integrationAccess.js', {
  '@server/getTenantContext': async () => ({}),
  '@server/getRequestContext': getRequestContext,
  '@server/getUserTariffAccess': getUserTariffAccess,
})

test('конструктор не принимает условия на удалённые и последующие варианты', async () => {
  await loadBindings()
  const blocks = await import('../../helpers/telegramQuestionnaireBlocks.mjs')
  const lib = load('server/telegramQuestionnaireSettings.js', {
    '@models/TelegramQuestionnaireSettings': {}, '@helpers/telegramQuestionnaireBlocks.mjs': blocks,
  })
  const form = { ...lib.defaultTelegramQuestionnaire(), mode: 'test', testChatIds: [id] }
  const first = { id: 'event', type: 'eventType', text: 'Какое событие?', options: [{ id: 'wedding', label: 'Свадьба' }, { id: 'other', label: 'Другое' }] }
  const wedding = { id: 'wedding-block', type: 'question', text: 'Где пройдёт регистрация?', condition: { blockId: first.id, optionId: 'wedding', operator: 'equals' } }
  const other = { id: 'other-block', type: 'question', text: 'Расскажите подробнее', condition: { ...wedding.condition, operator: 'notEquals' } }
  const valid = lib.validateTelegramQuestionnaire({ ...form, blocks: [first, wedding, other] })
  assert.deepEqual(blocks.getVisibleTelegramQuestionnaireBlocks(valid.blocks, {}).map(block => block.id), ['event'])
  assert.deepEqual(blocks.getVisibleTelegramQuestionnaireBlocks(valid.blocks, { event: { optionId: 'wedding' } }).map(block => block.id), ['event', 'wedding-block'])
  assert.deepEqual(blocks.getVisibleTelegramQuestionnaireBlocks(valid.blocks, { event: { optionId: 'other' } }).map(block => block.id), ['event', 'other-block'])
  assert.deepEqual(blocks.getVisibleTelegramQuestionnaireBlocks(valid.blocks, { event: { value: 'Премьера' } }).map(block => block.id), ['event', 'other-block'])
  assert.throws(() => lib.validateTelegramQuestionnaire({ ...form, blocks: [wedding, first] }), { status: 400 })
  assert.throws(() => lib.validateTelegramQuestionnaire({ ...form, blocks: [{ ...first, options: [first.options[1]] }, wedding] }), { status: 400 })
})

test('загрузка в активный старый сценарий сохраняет только прежние вложения в блоке отправки', async () => {
  await loadBindings()
  const nextId = '2'.repeat(24)
  const attachment = { id: nextId, type: 'video', name: 'Тест.mp4' }
  const question = { text: 'Ваш ответ?' }
  const legacy = { revision: 5, questionnaire: { enabled: true, useTelegramGreeting: false, welcomeText: '',
    questions: { service: question, date: question, city: question, details: question }, media: [privateFile] } }
  const lib = load('server/telegramQuestionnaireSettings.js', {
    '@helpers/telegramQuestionnaireBlocks.mjs': await import('../../helpers/telegramQuestionnaireBlocks.mjs'),
    '@models/TelegramQuestionnaireSettings': {
      findOne: () => ({ lean: async () => legacy }), init: async () => {}, updateOne: async () => {},
      findOneAndUpdate: (scope, update) => ({ lean: async () => {
        assert.deepEqual(scope, { tenantId, revision: 5 })
        return { revision: 6, questionnaire: update.$set.questionnaire }
      } }),
    },
  })
  const result = await lib.appendTelegramQuestionnaireMedia({ tenantId, revision: 5, attachment })
  assert.equal(result.mode, 'live')
  assert.deepEqual(result.media, [privateFile, attachment])
  assert.deepEqual(result.blocks.find(block => block.id === 'legacy-media').mediaIds, [id])
})

test('тестовый запуск принадлежит выбранному чату и текущему подключению', async () => {
  await loadBindings()
  const error = (message, status) => Object.assign(new Error(message), { status })
  const writes = []
  const model = load('server/telegramQuestionnaireTestRuns.js', {
    'node:crypto': require('node:crypto'), '@models/Clients': {}, '@models/Services': {},
    '@models/TelegramQuestionnaires': {},
    '@models/TelegramMessages': { find: scope => {
      assert.equal(scope.tenantId, tenantId)
      assert.equal(scope.businessConnectionId, 'current')
      return { select: () => ({ lean: async () => [{ telegramMessageId: '38' }] }) }
    } },
    '@models/TelegramConversations': { findOne: scope => ({ select: () => ({ lean: async () =>
      scope.tenantId === tenantId && scope.businessConnectionId === 'current' && scope._id === id && scope.status === 'open'
        ? { _id: id, telegramChatId: '17' } : null }) }) },
    '@models/TelegramQuestionnaireTestRuns': {
      init: async () => {},
      findOneAndUpdate: (scope, update) => ({ lean: async () => {
        writes.push({ ...scope, ...update.$set })
        return writes.at(-1)
      } }),
      findOne: scope => ({ select: () => ({ lean: async () => writes.find(run =>
        scope.tenantId === run.tenantId && scope.businessConnectionId === run.businessConnectionId &&
        scope.telegramChatId === run.telegramChatId && scope.chatId.$in.includes(run.chatId)) }) }),
    },
    '@server/telegramQuestionnaireSettings': { questionnaireError: error },
  })
  const questionnaire = { mode: 'test', testChatIds: [id] }
  const scope = { tenantId, businessConnectionId: 'current', questionnaire }
  await assert.rejects(model.armTelegramQuestionnaireTest({ ...scope, chatId: foreignTenantId }), { status: 409 })
  await assert.rejects(model.armTelegramQuestionnaireTest({ ...scope, tenantId: foreignTenantId, chatId: id }), { status: 404 })
  const run = await model.armTelegramQuestionnaireTest({ ...scope, chatId: id, createDraft: false })
  assert.equal(run.status, 'waiting')
  const current = await model.readTelegramQuestionnaireTestRun({ ...scope, telegramChatId: 17 })
  assert.equal(current.id, run.runId)
  const { isTelegramQuestionnaireTestStart } = await import('../../helpers/telegramQuestionnaireBlocks.mjs')
  const command = { date: Math.floor(current.armedAt.getTime() / 1000), text: 'Начать тест' }
  assert.equal(isTelegramQuestionnaireTestStart(current, { ...command, message_id: 38 }), false)
  assert.equal(isTelegramQuestionnaireTestStart(current, { ...command, message_id: 39 }), true)
  assert.equal(await model.readTelegramQuestionnaireTestRun({ ...scope, telegramChatId: 18 }), null)
  assert.equal(await model.readTelegramQuestionnaireTestRun({ ...scope, businessConnectionId: 'old', telegramChatId: 17 }), null)
  assert.equal(await model.readTelegramQuestionnaireTestRun({ ...scope, questionnaire: { mode: 'test', testChatIds: [] }, telegramChatId: 17 }), null)
  assert.equal(await model.readTelegramQuestionnaireTestRun({ ...scope, questionnaire: { mode: 'live', testChatIds: [id] }, telegramChatId: 17 }), null)
})

test('анкета изолирует настройки и вложения арендатора, проверяет ревизию и обновляет webhook при включении', async () => {
  await loadBindings()
  const lib = load('server/telegramQuestionnaireSettings.js', {
    '@models/TelegramQuestionnaireSettings': {},
    '@helpers/telegramQuestionnaireBlocks.mjs': await import('../../helpers/telegramQuestionnaireBlocks.mjs'),
  })
  const defaults = lib.defaultTelegramQuestionnaire()
  const saved = [], webhooks = [], removed = []
  const integrationAccess = loadIntegrationAccess({
    getRequestContext: async req => {
      const tenantId = req.headers.get('x-test-tenant')
      if (!tenantId) return {}
      return { tenantId, user: { _id: tenantId, role: req.headers.get('x-test-role') ?? 'dev',
        impersonation: { active: req.headers.get('x-test-impersonation') === 'true' } } }
    },
    getUserTariffAccess: async tenant => ({ allowTelegramIntegration: true,
      user: { role: tenant === 'ordinary-tenant' ? 'user' : 'dev' } }),
  })
  const route = load(`${root}/questionnaire/route.js`, {
    'next/server': loggerlessResponse,
    '@models/TelegramQuestionnaires': { exists: async () => false },
    '@models/SiteSettings': { findOne: scope => {
      assert.deepEqual(scope, { tenantId })
      return { lean: async () => ({ custom: {} }) }
    } },
    '@server/dbConnect': async () => {},
    '@server/integrationAccess': integrationAccess,
    '@server/telegramBusiness': {
      normalizeTelegramSettings: () => ({ enabled: true, businessConnectionId: 'test-connection', botToken: 'test-token', webhookToken: 'test-webhook', webhookSecret: 'test-secret', rights: { can_reply: true } }),
      buildTelegramWebhookUrl: () => 'https://example.test/callback',
      setTelegramWebhook: async options => webhooks.push(options),
    },
    '@server/telegramQuestionnaireSettings': {
      ...lib,
      readTelegramQuestionnaire: async tenant => ({ ...defaults, media: tenant === tenantId ? [privateFile] : [], revision: 1 }),
      saveTelegramQuestionnaire: async payload => {
        saved.push(payload)
        return { ...payload.questionnaire, revision: 2 }
      },
    },
    '@server/telegramQuestionnaireMedia': { deleteTelegramQuestionnaireMedia: async options => removed.push(options) },
    '@server/telegramQuestionnaireTestRuns': { validateTelegramQuestionnaireReferences: async () => {} },
  })
  const request = (tenant, body, headers = {}) => new Request('https://example.test/config', {
    ...(tenant ? { headers: { 'x-test-tenant': tenant, ...headers } } : {}),
    ...(body ? { method: 'PATCH', body: JSON.stringify(body) } : {}),
  })
  const form = { ...defaults, revision: 1, mode: 'live', media: [privateFile] }
  assert.equal((await route.GET(request(null))).status, 401)
  assert.equal((await route.GET(request(tenantId, null, { 'x-test-role': 'user' }))).status, 403)
  assert.equal((await route.PATCH(request(tenantId, form, { 'x-test-role': 'admin' }))).status, 403)
  assert.equal((await route.PATCH(request(tenantId, form, { 'x-test-impersonation': 'true' }))).status, 403)
  assert.equal((await route.GET(request('ordinary-tenant'))).status, 403)
  assert.deepEqual((await (await route.GET(request(foreignTenantId))).json()).questionnaire.media, [])
  assert.equal((await route.PATCH(request(foreignTenantId, form))).status, 409)
  assert.equal((await route.PATCH(request(tenantId, { ...form, revision: 0 }))).status, 409)
  assert.equal((await route.PATCH(request(tenantId, { ...form, media: [{ type: 'video', url: 'http://example.test/video.mp4' }] }))).status, 400)
  assert.equal(saved.length, 0)
  assert.equal(webhooks.length, 0)
  const response = await route.PATCH(request(tenantId, { ...form, media: [{ type: 'video', url: 'https://example.test/video.mp4' }] }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).questionnaire.enabled, true)
  assert.equal(webhooks.length, 1)
  assert.deepEqual(removed, [{ tenantId, id }])
  assert.equal(saved[0].tenantId, tenantId)
})

test('файл выдаётся только с действующей подписью своего tenant и при включённом автоответчике', async () => {
  await loadBindings()
  const media = load('server/telegramQuestionnaireMedia.js', {
    'node:crypto': require('node:crypto'), 'node:stream': require('node:stream'),
    'node:stream/promises': require('node:stream/promises'), mongoose: {}, sharp: {},
    '@server/telegramBusiness': {}, '@server/telegramQuestionnaireSettings': {},
  })
  let tariffAllowed = true, enabled = true, ownerRole = 'dev'
  const route = load(`${root}/questionnaire/media/[id]/route.js`, {
    '@models/TelegramQuestionnaires': { exists: async () => false },
    '@models/SiteSettings': { findOne: scope => {
      assert.deepEqual(scope, { tenantId })
      return { lean: async () => ({ custom: {} }) }
    } },
    '@server/dbConnect': async () => {},
    '@server/integrationAccess': loadIntegrationAccess(),
    '@server/getUserTariffAccess': async id => ({ allowTelegramIntegration: id === tenantId && tariffAllowed, user: { role: ownerRole } }),
    '@server/telegramBusiness': { normalizeTelegramSettings: () => ({ enabled: true, businessConnectionId: 'test-connection', webhookSecret: 'synthetic-secret' }) },
    '@server/telegramQuestionnaireMedia': {
      verifyTelegramQuestionnaireMediaSignature: media.verifyTelegramQuestionnaireMediaSignature,
      findTelegramQuestionnaireMedia: async key => key === id ? { metadata: { tenantId } } : null,
      telegramQuestionnaireMediaResponse: (_file, head) => new Response(head ? null : 'media'),
    },
    '@server/telegramQuestionnaireSettings': { QUESTIONNAIRE_ATTACHMENT_ID: /^[a-f0-9]{24}$/, readTelegramQuestionnaire: async () => ({ enabled, media: [privateFile] }) },
  })
  const context = { params: Promise.resolve({ id }) }
  const url = (tenant, expires = Math.floor(Date.now() / 1000) + 200) => {
    const token = createHmac('sha256', 'synthetic-secret').update(`${tenant}:${id}:${expires}`).digest('hex')
    return new Request(`https://example.test/media/${id}?expires=${expires}&token=${token}`)
  }
  assert.equal((await route.GET(url(foreignTenantId), context)).status, 404)
  assert.equal((await route.GET(url(tenantId, Math.floor(Date.now() / 1000) - 1), context)).status, 404)
  assert.equal(await (await route.GET(url(tenantId), context)).text(), 'media')
  assert.equal(await (await route.HEAD(url(tenantId), context)).text(), '')
  ownerRole = 'user'
  assert.equal((await route.GET(url(tenantId), context)).status, 404)
  assert.equal((await route.HEAD(url(tenantId), context)).status, 404)
  ownerRole = 'dev'
  tariffAllowed = false
  assert.equal((await route.GET(url(tenantId), context)).status, 404)
  tariffAllowed = true
  enabled = false
  assert.equal((await route.GET(url(tenantId), context)).status, 404)
})

test('фото и видео уходят в один диалог с временной ссылкой для загруженного файла', async () => {
  await loadBindings()
  const calls = [], saved = []
  const media = load('server/telegramQuestionnaireMedia.js', {
    'node:crypto': require('node:crypto'), 'node:stream': require('node:stream'),
    'node:stream/promises': require('node:stream/promises'), mongoose: {}, sharp: {},
    '@server/telegramQuestionnaireSettings': {},
    '@server/telegramBusiness': {
      sendTelegramBusinessMedia: async (options) => { calls.push(options); return [{ message_id: 11 }, { message_id: 12 }] },
      saveTelegramBusinessMessage: async (options) => saved.push(options),
    },
  })
  const settings = {
    botToken: 'synthetic-token', webhookSecret: 'synthetic-secret', businessConnectionId: 'synthetic-connection',
    webhookUrl: 'https://example.test/api/integrations/telegram/webhook/path-token',
  }
  await media.sendTelegramQuestionnaireMedia({
    tenantId, chatId: 'chat', settings, media: [privateFile, { type: 'video', url: 'https://example.test/video.mp4' }],
  })
  assert.equal(calls.length, 1)
  const [photo, video] = calls[0].media
  const url = new URL(photo.url)
  assert.equal(photo.type, 'photo')
  assert.equal(url.pathname, `/api/integrations/telegram/questionnaire/media/${id}`)
  assert.ok(media.verifyTelegramQuestionnaireMediaSignature({
    tenantId, id, expires: url.searchParams.get('expires'), token: url.searchParams.get('token'), secret: settings.webhookSecret,
  }))
  assert.deepEqual(video, { type: 'video', url: 'https://example.test/video.mp4' })
  assert.equal(calls[0].chatId, 'chat')
  assert.deepEqual(saved.map(({ message }) => message.business_connection_id), ['synthetic-connection', 'synthetic-connection'])
})

test('загрузка проверяет доступ и ревизию до записи, а конфликт очищает незарегистрированный файл', async () => {
  await loadBindings()
  let revision = 2, conflict = false
  const writes = [], removed = []
  const route = load(`${root}/questionnaire/media/route.js`, {
    'next/server': loggerlessResponse,
    '@server/dbConnect': async () => {},
    '@server/integrationAccess': loadIntegrationAccess({
      getRequestContext: async req => ({ tenantId: req.headers.get('x-test-tenant'), user: { _id: tenantId,
        role: req.headers.get('x-test-role') ?? 'dev' } }),
      getUserTariffAccess: async id => ({ allowTelegramIntegration: true, user: { role: id === tenantId ? 'dev' : 'user' } }),
    }),
    '@server/telegramQuestionnaireMedia': {
      QUESTIONNAIRE_UPLOAD_LIMIT: 64,
      uploadTelegramQuestionnaireMedia: async (value) => { writes.push(value); return privateFile },
      deleteTelegramQuestionnaireMedia: async (value) => removed.push(value),
    },
    '@server/telegramQuestionnaireSettings': {
      QUESTIONNAIRE_MEDIA_LIMIT: 6,
      readTelegramQuestionnaire: async (tenant) => {
        assert.equal(tenant, tenantId)
        return { revision, media: [] }
      },
      appendTelegramQuestionnaireMedia: async (value) => {
        assert.deepEqual(value, { tenantId, revision, attachment: privateFile })
        if (conflict) throw Object.assign(new Error('Настройки обновились'), { status: 409 })
        revision++
        return { revision, media: [privateFile] }
      },
    },
  })
  const request = (tenant, revisionValue, bytes = 32, role = 'dev') => {
    const body = new FormData()
    body.set('type', 'photo')
    body.set('file', new File([new Uint8Array(bytes)], 'photo.jpg'))
    body.set('revision', String(revisionValue))
    return new Request('https://example.test/upload', { method: 'POST', headers: { 'x-test-tenant': tenant, 'x-test-role': role }, body })
  }
  assert.equal((await route.POST(request(foreignTenantId, 2))).status, 403)
  assert.equal((await route.POST(request(tenantId, 2, 32, 'user'))).status, 403)
  assert.equal((await route.POST(request(tenantId, 1))).status, 409)
  assert.equal((await route.POST(request(tenantId, 2, 70_000))).status, 413)
  assert.equal(writes.length, 0)
  assert.equal((await route.POST(request(tenantId, 2))).status, 201)
  assert.deepEqual(writes.map(({ tenantId, type, file }) => [tenantId, type, file.name]), [[tenantId, 'photo', 'photo.jpg']])
  conflict = true
  assert.equal((await route.POST(request(tenantId, 3))).status, 409)
  assert.deepEqual(removed, [{ tenantId, id }])
})

test('webhook передаёт в опрос нажатия и новые входящие, сохраняя обычные уведомления', async () => {
  await loadBindings()
  const handled = [], pushes = [], pauses = []
  let ownerRole = 'dev'
  const route = load(`${root}/webhook/[token]/route.js`, {
    'next/server': loggerlessResponse,
    '@models/SiteSettings': { findOne: async scope => scope['custom.telegramBusinessWebhookToken'] === 'token' ? { tenantId, custom: {} } : null },
    '@models/TelegramMessages': {}, '@server/dbConnect': async () => {},
    '@helpers/telegramQuestionnaireBlocks.mjs': await import('../../helpers/telegramQuestionnaireBlocks.mjs'),
    '@server/integrationAccess': loadIntegrationAccess(),
    '@server/getUserTariffAccess': async id => ({ allowTelegramIntegration: id === tenantId, user: { role: ownerRole } }),
    '@server/rateLimit': { checkRateLimit: async () => ({ ok: true }) },
    '@server/telegramBusiness': {
      buildTelegramWebhookUrl: () => 'https://example.test/callback',
      normalizeTelegramSettings: () => ({ enabled: true, webhookSecret: 'secret', businessConnectionId: 'connection', businessAccountUserId: '7' }),
      saveTelegramBusinessMessage: async ({ message, canStartQuestionnaire }) => ({
        direction: message.from?.id === 7 ? 'outgoing' : 'incoming',
        isNewMessage: true, isFirstIncomingMessage: canStartQuestionnaire && message.message_id === 1,
      }),
      updateTelegramCustom: async () => {},
    },
    '@server/messengerPush': { notifyIncomingClientMessage: async ({ messageId }) => pushes.push(messageId) },
    '@server/telegramQuestionnaireSettings': { readTelegramQuestionnaire: async tenant => ({ enabled: tenant === tenantId }) },
    '@server/telegramQuestionnaireTestRuns': { readTelegramQuestionnaireTestRun: async () => null },
    '@server/telegramQuestionnaire': {
      TELEGRAM_QUESTIONNAIRE_PREFIX: 'vq:',
      handleTelegramQuestionnaireCallback: async ({ callbackQuery }) => handled.push(callbackQuery.data),
      handleTelegramQuestionnaireMessage: async ({ message }) => {
        handled.push(message.message_id)
        return { suppressMessagePush: true }
      },
      pauseTelegramQuestionnaire: async (scope) => pauses.push(scope),
    },
  })
  const call = (body, secret = 'secret') => route.POST(new Request('https://example.test/webhook', {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ token: 'token' }) })
  assert.equal((await call({ callback_query: { data: 'vq:option' } }, 'wrong')).status, 403)
  await call({ callback_query: { data: 42 } })
  await call({ callback_query: { data: 'vq:option' } })
  await call({ business_message: { business_connection_id: 'connection', message_id: 1 } })
  await call({ business_message: { business_connection_id: 'connection', message_id: 2 } })
  await call({ business_message: { business_connection_id: 'replaced-connection', message_id: 4 } })
  await call({ edited_business_message: { business_connection_id: 'connection', message_id: 3 } })
  const outgoing = { business_connection_id: 'connection', chat: { id: 17, type: 'private' }, from: { id: 7 } }
  await call({ business_message: { ...outgoing, message_id: 5, is_from_offline: true } })
  await call({ business_message: { ...outgoing, message_id: 6, sender_business_bot: { id: 18 } } })
  await call({ edited_business_message: { ...outgoing, message_id: 7 } })
  await call({ business_message: { ...outgoing, message_id: 8 } })
  ownerRole = 'user'
  assert.equal((await call({ callback_query: { data: 'vq:old-button' } })).status, 200)
  assert.equal((await call({ business_message: { business_connection_id: 'connection', message_id: 9 } })).status, 200)
  assert.equal((await call({ business_message: { ...outgoing, message_id: 10 } })).status, 200)
  assert.deepEqual(handled, ['vq:option', 1, 2])
  assert.deepEqual(pushes, ['1', '3', '9'])
  assert.deepEqual(pauses, [{ tenantId, businessConnectionId: 'connection', chatId: 17, messageId: 8 }])
})

test('исходящее приветствие перед первым входящим не мешает запуску опроса', async () => {
  await loadBindings()
  const conversation = { _id: id, tenantId, telegramChatId: '17', businessConnectionId: 'connection' }
  const ids = new Set()
  const { saveTelegramBusinessMessage } = load('server/telegramBusiness.js', {
    crypto: require('node:crypto'), dns: require('node:dns'),
    undici: { Agent: class {}, ProxyAgent: class {}, Socks5ProxyAgent: class {} },
    '@helpers/telegramPushAudience.mjs': {},
    '@helpers/telegramBusinessMessage': { getTelegramBusinessMessageDirection: () => 'incoming' },
    '@models/Clients': { findOne: async () => null }, '@models/SiteSettings': {},
    '@models/TelegramConversations': {
      findOne: scope => {
        assert.deepEqual(scope, { tenantId, telegramChatId: '17' })
        return { select: () => ({ lean: async () => ({ ...conversation }) }) }
      },
      updateOne: async (scope, update) => {
        assert.deepEqual(scope, { tenantId, telegramChatId: '17', businessConnectionId: 'connection', lastIncomingAt: null, questionnaireFirstMessageId: null })
        if (!conversation.lastIncomingAt && !conversation.questionnaireFirstMessageId) Object.assign(conversation, update.$set)
      },
      findOneAndUpdate: async (_scope, update) => {
        Object.assign(conversation, update.$set, update.$max)
        return conversation
      },
    },
    '@models/TelegramMessages': {
      exists: async scope => ids.has(scope.telegramMessageId),
      findOneAndUpdate: async (scope, update) => {
        ids.add(scope.telegramMessageId)
        return update.$set
      },
    },
  })
  const incoming = messageId => saveTelegramBusinessMessage({
    tenantId, settings: {}, canStartQuestionnaire: true,
    message: { message_id: messageId, business_connection_id: 'connection', chat: { type: 'private', id: 17 }, text: 'Тест' },
  })
  assert.equal((await incoming(2)).isFirstIncomingMessage, true)
  const replayed = await incoming(2)
  assert.equal(replayed.isNewMessage, false)
  assert.equal(replayed.isFirstIncomingMessage, true)
  assert.equal((await incoming(3)).isFirstIncomingMessage, false)
})
