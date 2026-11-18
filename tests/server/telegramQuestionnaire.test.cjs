const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const { loadBindings, transformSync } = require('next/dist/build/swc')

const tenantId = 'a'.repeat(24)
const anotherTenant = 'b'.repeat(24)
const chatId = '100'
const connectionId = 'business-connection'
const rawConfig = {
  enabled: true,
  useTelegramGreeting: true,
  welcomeText: 'This greeting should not be sent',
  questions: {
    service: { text: 'Выберите услугу', options: ['Фотосъёмка'] },
    city: { text: 'В каком городе?', options: ['Красноярск'] },
  },
  media: [{ type: 'photo', id: 'synthetic-file' }],
}

const settings = {
  enabled: true, botToken: 'synthetic-token', businessConnectionId: connectionId,
  rights: { can_reply: true }, questionnaire: rawConfig,
}

const load = (filename, mocks) => {
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'ecmascript' } }, module: { type: 'commonjs' },
  })
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id in mocks) return mocks[id]
    return require(id)
  }, mod, mod.exports)
  return mod.exports
}

const lean = (value) => ({ select() { return this }, lean: async () => value == null ? null : structuredClone(value) })
const matches = (row, filter) => Object.entries(filter).every(([key, value]) => {
  if (key === '$or') return value.some(condition => matches(row, condition))
  if (value?.$in) return value.$in.includes(row[key])
  if (value?.$lte) return row[key] <= value.$lte
  if (value?.$gte && value?.$lt) return row[key] >= value.$gte && row[key] < value.$lt
  return row[key] === value || (value != null && row[key] != null && String(row[key]) === String(value))
})

function model(rows, defaults = {}) {
  const update = (row, changes) => {
    for (const [key, value] of Object.entries(changes.$set ?? {})) {
      const [field, property] = key.split('.')
      if (property) row[field][property] = value
      else row[key] = value
    }
    for (const [key, value] of Object.entries(changes.$inc ?? {})) row[key] += value
    return row
  }
  return {
    findOne: filter => lean(rows.find(row => matches(row, filter))),
    exists: async filter => rows.find(row => matches(row, filter)) ?? null,
    countDocuments: async filter => rows.filter(row => matches(row, filter)).length,
    findOneAndUpdate(filter, changes, options) {
      assert.ok(filter.tenantId, 'tenant scope is required')
      const row = rows.find(item => matches(item, filter))
      if (row) return lean(update(row, changes))
      if (!options?.upsert) return lean(null)
      const inserted = { ...structuredClone(defaults), ...structuredClone(changes.$setOnInsert) }
      rows.push(inserted)
      return lean(inserted)
    },
    async updateOne(filter, changes) {
      assert.ok(filter.tenantId, 'tenant scope is required')
      const row = rows.find(item => matches(item, filter))
      if (row) update(row, changes)
      return { modifiedCount: row ? 1 : 0 }
    },
  }
}

async function fixture({ clientTenant = tenantId, failMedia = false, eventsPerMonth = 20 } = {}) {
  await loadBindings()
  const steps = await import('../../server/telegramQuestionnaireSteps.mjs')
  const payload = await import('../../server/publicLeadPayload.mjs')
  const conversation = {
    _id: 'c'.repeat(24), tenantId, businessConnectionId: connectionId,
    telegramChatId: chatId, clientId: 'd'.repeat(24), lastIncomingAt: new Date(),
  }
  const prompts = [], saved = [], acknowledgements = [], media = [], push = [], history = [], events = [], sessions = []
  const failures = new Set()
  const eventsModel = model(events)
  const conversationsModel = model([conversation])
  const originalCreate = eventsModel.findOneAndUpdate
  const originalLink = conversationsModel.updateOne
  eventsModel.findOneAndUpdate = (...args) => {
    if (failures.delete('event')) throw new Error('synthetic DB failure')
    return originalCreate(...args)
  }
  conversationsModel.updateOne = (...args) => {
    if (failures.delete('link')) throw new Error('synthetic link failure')
    return originalLink(...args)
  }
  const questionnaires = model(sessions, {
    answers: {}, revision: 0, promptMessageId: 0, deliveryToken: '', deliveryLeaseUntil: null,
    mediaAttempted: false, submittedFromMessageId: 0,
  })
  let messageId = 0
  const makeMessage = (text) => ({ message_id: ++messageId, chat: { id: Number(chatId), type: 'private' }, from: { id: Number(chatId) }, business_connection_id: connectionId, text })
  const handlers = load('server/telegramQuestionnaire.js', {
    mongoose: { Types: { ObjectId: class { constructor() { return new String('e'.repeat(24)) } } } },
    '@models/Clients': model([{ _id: conversation.clientId, tenantId: clientTenant }]),
    '@models/Events': eventsModel,
    '@models/SiteSettings': model([{ tenantId, timeZone: 'Asia/Krasnoyarsk' }]),
    '@models/TelegramConversations': conversationsModel,
    '@models/TelegramQuestionnaires': questionnaires,
    '@server/getUserTariffAccess': async () => ({ allowTelegramIntegration: true, user: { role: 'dev' }, eventsPerMonth }),
    '@server/integrationAccess': { hasTelegramQuestionnaireAccess: access => access?.user?.role === 'dev' && access.allowTelegramIntegration },
    '@server/activityHistory': { recordActivityHistory: async entry => { history.push(entry) } },
    '@server/multiChannelPush': { sendMultiChannelPushToTenant: async entry => { push.push(entry) } },
    '@server/telegramQuestionnaireMedia': { sendTelegramQuestionnaireMedia: async entry => {
      media.push(entry)
      if (failMedia) throw new Error('synthetic media failure')
    } },
    '@server/telegramBusiness': {
      answerTelegramCallbackQuery: async entry => { acknowledgements.push(entry) },
      isTelegramReplyWindowOpen: lastIncomingAt => Date.now() - new Date(lastIncomingAt).getTime() < 24 * 3600_000,
      saveTelegramBusinessMessage: async entry => { saved.push(entry) },
      sendTelegramBusinessMessage: async ({ text, replyMarkup }) => {
        for (const prefix of failures) {
          if (text.startsWith(prefix)) {
            failures.delete(prefix)
            throw new Error('synthetic send failure')
          }
        }
        const message = makeMessage(text)
        prompts.push({ message, replyMarkup })
        return message
      },
    },
    './publicLeadPayload.mjs': payload,
    './telegramQuestionnaireSteps.mjs': steps,
  })
  const receive = (options = {}) => handlers.handleTelegramQuestionnaireMessage({
    tenantId, settings, message: makeMessage(options.text ?? 'Здравствуйте'),
    result: { conversation, direction: 'incoming', isNewMessage: true, ...options.result },
    ...options.context,
  })
  const makeCallback = (title) => {
    const prompt = prompts.at(-1)
    const button = prompt.replyMarkup.inline_keyboard.flat().find(item => item.text === title)
    assert.ok(button, title)
    assert.ok(Buffer.byteLength(button.callback_data) <= 64)
    return { data: button.callback_data, message: prompt.message, from: { id: Number(chatId) }, id: `callback-${messageId}` }
  }
  const callback = (callbackQuery, context = {}) => handlers.handleTelegramQuestionnaireCallback({
    tenantId, settings, callbackQuery, ...context,
  })
  return {
    ...handlers, receive, makeMessage, makeCallback, callback, conversation, sessions, events,
    prompts, acknowledgements, saved, media, push, history, failures,
  }
}

async function reachReview(f) {
  await f.receive({ result: { isFirstIncomingMessage: true } })
  assert.equal(f.prompts[0].message.text, 'Чем могу помочь?')
  await f.callback(f.makeCallback('Оставить заявку'))
  await f.callback(f.makeCallback('Фотосъёмка'))
  await f.receive({ text: '31.02.2030' })
  assert.match(f.prompts.at(-1).message.text, /ДД\.ММ\.ГГГГ/)
  await f.receive({ text: '07.12.2030' })
  await f.callback(f.makeCallback('Другое'))
  await f.receive({ text: 'Дивногорск' })
  await f.receive({ text: 'Нужен репортаж' })
  assert.match(f.prompts.at(-1).message.text, /Проверьте заявку\nУслуга: Фотосъёмка\nДата: 07\.12\.2030\nГород: Дивногорск/)
}

test('опрос создаёт одну связанную заявку после двух одновременных подтверждений', async () => {
  const f = await fixture({ failMedia: true })
  await reachReview(f)
  assert.equal(f.events.length, 0)
  assert.equal(f.media.length, 1)
  const submit = f.makeCallback('Отправить заявку')
  await Promise.all([f.callback(submit), f.callback(submit)])
  await f.callback(submit)
  assert.equal(f.events.length, 1)
  const [event] = f.events
  assert.equal(event.tenantId, tenantId)
  assert.equal(event.clientId, f.conversation.clientId)
  assert.equal(event.status, 'draft')
  assert.equal(event.eventType, 'Фотосъёмка')
  assert.equal(event.clientData.source, 'telegram')
  assert.equal(event.address.town, 'Дивногорск')
  assert.equal(event.eventDate.toISOString(), '2030-12-07T05:00:00.000Z')
  assert.match(event.description, /Фотосъёмка.+Нужен репортаж/s)
  assert.equal(event.additionalEvents[0].title, 'Связаться с клиентом')
  assert.equal(event.createdAt.getTime(), event.requestCreatedAt.getTime())
  assert.equal(String(f.conversation.eventId), String(event._id))
  assert.equal(f.push.length, 1)
  assert.equal(f.history.length, 1)
  assert.equal(f.saved.length, f.prompts.length)
  assert.match(f.acknowledgements.at(-1).text, /уже отправлена/)
})

test('повтор первого сообщения и ошибки подтверждения восстанавливают сохранённый шаг', async () => {
  const f = await fixture({ clientTenant: anotherTenant })
  const original = f.makeMessage('Здравствуйте')
  f.failures.add('Чем могу помочь?')
  const receiveFirst = (isNewMessage) => f.receive({
    result: { isFirstIncomingMessage: true, isNewMessage }, context: { message: original },
  })
  await assert.rejects(receiveFirst(true), /synthetic send failure/)
  await receiveFirst(false)
  await receiveFirst(false)
  assert.equal(f.sessions.length, 1)
  assert.equal(f.prompts.length, 1)
  await f.callback(f.makeCallback('Оставить заявку'))
  await f.callback(f.makeCallback('Фотосъёмка'))
  await f.callback(f.makeCallback('Пока не знаю'))
  await f.callback(f.makeCallback('Красноярск'))
  await f.callback(f.makeCallback('Пропустить'))
  const submit = f.makeCallback('Отправить заявку')
  f.failures.add('event')
  await assert.rejects(f.callback(submit), /synthetic DB failure/)
  f.failures.add('link')
  await assert.rejects(f.callback(submit), /synthetic link failure/)
  assert.equal(f.events.length, 1)
  assert.equal(f.push.length, 0)
  f.failures.add('Спасибо, заявка отправлена')
  await assert.rejects(f.callback(submit), /synthetic send failure/)
  await f.callback(submit)
  assert.equal(f.events.length, 1)
  assert.equal(f.events[0].clientId, null)
  assert.equal(f.events[0].eventDate, null)
  assert.equal(f.push.length, 1)
  assert.match(f.prompts.at(-1).message.text, /Спасибо, заявка отправлена/)
})

test('старые, чужие и просроченные кнопки не двигают опрос, ручной ответ ставит его на паузу', async () => {
  const f = await fixture()
  await f.receive({ context: { settings: { ...settings, rights: {} } }, result: { isFirstIncomingMessage: true } })
  await f.receive()
  assert.equal(f.prompts.length, 0)
  await f.receive({ result: { isFirstIncomingMessage: true } })
  const start = f.makeCallback('Оставить заявку')
  await f.callback(start, { tenantId: anotherTenant })
  await f.callback({ ...start, from: { id: 999 } })
  await f.callback({ ...start, message: { ...start.message, business_connection_id: 'another-connection' } })
  f.conversation.lastIncomingAt = new Date(Date.now() - 25 * 3600_000)
  await f.callback(start)
  assert.equal(f.prompts.length, 1)
  assert.match(f.acknowledgements.at(-1).text, /новое сообщение/)
  f.conversation.lastIncomingAt = new Date()
  await f.callback(start)
  const service = f.makeCallback('Фотосъёмка')
  await f.callback(start)
  await f.pauseTelegramQuestionnaire({ tenantId, businessConnectionId: connectionId, chatId })
  await f.callback(service)
  assert.equal(f.prompts.length, 2)
  assert.equal(f.sessions[0].step, 'paused')
  assert.equal(f.events.length, 0)
  assert.equal(f.push.length, 0)
})

test('передача человеку и отмена завершают опрос без заявки', async () => {
  const handoff = await fixture()
  await handoff.receive({ result: { isFirstIncomingMessage: true } })
  await handoff.callback(handoff.makeCallback('Задать вопрос'))
  const result = await handoff.receive({ text: 'Есть ли свободное время?' })
  assert.equal(result.suppressMessagePush, false)
  assert.equal(handoff.media.length, 0)
  assert.equal(handoff.events.length, 0)
  assert.match(handoff.prompts.at(-1).message.text, /Напишите ваш вопрос/)

  const cancel = await fixture()
  await reachReview(cancel)
  await cancel.callback(cancel.makeCallback('Отменить'))
  assert.equal(cancel.events.length, 0)
  assert.match(cancel.prompts.at(-1).message.text, /Заявка отменена/)
})

test('редактирование очищает сводку, не повторяет медиа и учитывает месячный лимит', async () => {
  const f = await fixture({ eventsPerMonth: 1 })
  f.events.push({ _id: 'f'.repeat(24), tenantId, createdAt: new Date() })
  await reachReview(f)
  await f.callback(f.makeCallback('Изменить ответы'))
  await f.callback(f.makeCallback('Другое'))
  await f.receive({ text: 'Монтаж видео' })
  await f.callback(f.makeCallback('Пока не знаю'))
  await f.callback(f.makeCallback('Красноярск'))
  await f.callback(f.makeCallback('Пропустить'))
  assert.match(f.prompts.at(-1).message.text, /Монтаж видео/)
  assert.doesNotMatch(f.prompts.at(-1).message.text, /Дивногорск|07\.12\.2030|репортаж/)
  await f.callback(f.makeCallback('Отправить заявку'))
  assert.equal(f.events.length, 1)
  assert.equal(f.media.length, 1)
  assert.equal(f.push.length, 0)
  assert.match(f.prompts.at(-1).message.text, /не удалось принять заявку/)
})
