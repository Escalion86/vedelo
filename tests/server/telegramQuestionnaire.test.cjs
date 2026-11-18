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
    async updateMany(filter, changes) {
      assert.ok(filter.tenantId, 'tenant scope is required')
      const matching = rows.filter(item => matches(item, filter))
      matching.forEach(row => update(row, changes))
      return { modifiedCount: matching.length }
    },
  }
}

async function fixture({ clientTenant = tenantId, failMedia = false, eventsPerMonth = 20, aiQuestion = null } = {}) {
  await loadBindings()
  const steps = await import('../../server/telegramQuestionnaireSteps.mjs')
  const blocks = await import('../../server/telegramQuestionnaireBlocks.mjs')
  const sharedBlocks = await import('../../helpers/telegramQuestionnaireBlocks.mjs')
  const payload = await import('../../server/publicLeadPayload.mjs')
  const conversation = {
    _id: 'c'.repeat(24), tenantId, businessConnectionId: connectionId,
    telegramChatId: chatId, clientId: 'd'.repeat(24), lastIncomingAt: new Date(),
  }
  const prompts = [], saved = [], acknowledgements = [], media = [], push = [], history = [], events = [], sessions = []
  const failures = new Set()
  const aiCalls = []
  const serviceFilters = []
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
  const makeMessage = (text) => ({ message_id: ++messageId, date: Math.floor(Date.now() / 1000), chat: { id: Number(chatId), type: 'private' }, from: { id: Number(chatId) }, business_connection_id: connectionId, text })
  let eventIdSequence = 0
  const handlers = load('server/telegramQuestionnaire.js', {
    mongoose: { Types: { ObjectId: class { constructor() { return new String(`${'e'.repeat(20)}${String(++eventIdSequence).padStart(4, '0')}`) } } } },
    '@models/Clients': model([{ _id: conversation.clientId, tenantId: clientTenant }]),
    '@models/Events': eventsModel,
    '@models/Services': { find: (filter) => {
      serviceFilters.push(filter)
      return lean(filter?.tenantId === tenantId ? filter._id.$in.filter(id => id === '1'.repeat(24)).map(_id => ({ _id })) : [])
    } },
    '@models/SiteSettings': model([{ tenantId, timeZone: 'Asia/Krasnoyarsk' }]),
    '@models/TelegramConversations': conversationsModel,
    '@models/TelegramQuestionnaires': questionnaires,
    '@server/getUserTariffAccess': async () => ({ allowTelegramIntegration: true, user: { role: 'dev' }, eventsPerMonth }),
    '@server/integrationAccess': { hasTelegramQuestionnaireAccess: access => access?.user?.role === 'dev' && access.allowTelegramIntegration },
    '@server/activityHistory': { recordActivityHistory: async entry => { history.push(entry) } },
    '@server/multiChannelPush': { sendMultiChannelPushToTenant: async entry => { push.push(entry) } },
    '@server/telegramQuestionnaireAi': { getTelegramQuestionnaireAiQuestion: async input => {
      aiCalls.push(input)
      return Array.isArray(aiQuestion) ? aiQuestion[aiCalls.length - 1] ?? null : aiQuestion
    } },
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
    './telegramQuestionnaireBlocks.mjs': blocks,
    '../helpers/telegramQuestionnaireBlocks.mjs': sharedBlocks,
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
    prompts, acknowledgements, saved, media, push, history, failures, aiCalls, serviceFilters,
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

const settingsV2 = {
  ...settings,
  questionnaire: {
    enabled: true, schemaVersion: 2, mode: 'live',
    welcomeText: 'Приветствие конструктора',
    media: [{ type: 'photo', id: 'sample-photo' }, { type: 'video', id: 'unused-video' }],
    blocks: [
      { id: 'event', type: 'eventType', label: 'Тип события', text: 'Какое событие?', required: true,
        options: [{ id: 'wedding', label: 'Свадьба' }, { id: 'party', label: 'Корпоратив' }] },
      { id: 'proof', type: 'message', text: 'Пример со свадьбы', mediaIds: ['sample-photo'],
        condition: { blockId: 'event', optionId: 'wedding', operator: 'equals' } },
      { id: 'guests', type: 'question', label: 'Гостей', text: 'Сколько гостей?', required: true,
        condition: { blockId: 'event', optionId: 'wedding', operator: 'equals' } },
      { id: 'company', type: 'question', label: 'Компания', text: 'Как называется компания?', required: true,
        condition: { blockId: 'event', optionId: 'wedding', operator: 'notEquals' } },
      { id: 'date', type: 'dateTime', text: 'Когда мероприятие?', required: false },
      { id: 'town', type: 'location', text: 'Где мероприятие?', required: true },
      { id: 'service', type: 'services', text: 'Выберите услугу', required: true, options: [
        { id: 'photo', label: 'Фотосъёмка', serviceId: '1'.repeat(24) },
        { id: 'foreign', label: 'Старая услуга', serviceId: '2'.repeat(24) },
      ] },
      { id: 'ai', type: 'ai', text: 'Уточнения', topics: 'Площадка' },
    ],
  },
}

test('конструктор заполняет поля, убирает скрытые ответы и сохраняет два ИИ-уточнения', async () => {
  const f = await fixture({ aiQuestion: ['Как называется площадка?', 'Какой вход использовать?'] })
  const context = { settings: settingsV2 }
  const receive = (text, first = false) => f.receive({ text, context, result: { isFirstIncomingMessage: first } })
  const choose = (title) => f.callback(f.makeCallback(title), context)
  await receive('Здравствуйте', true)
  await choose('Оставить заявку')
  const wedding = f.makeCallback('Свадьба')
  await Promise.all([f.callback(wedding, context), f.callback(wedding, context)])
  assert.equal(f.media.length, 1)
  assert.deepEqual(f.media[0].media.map(item => item.id), ['sample-photo'])
  assert.match(f.prompts.at(-1).message.text, /Сколько гостей/)
  await receive('47')
  await receive('07.12.2030 18:45')
  await receive('Красноярск, Концертный зал')
  await choose('Фотосъёмка')
  assert.equal(f.aiCalls.length, 1)
  assert.equal(f.aiCalls[0].initialMessage, 'Здравствуйте')
  await receive('Дворец культуры')
  assert.deepEqual(f.aiCalls[1].previousClarifications, [{ question: 'Как называется площадка?', answer: 'Дворец культуры' }])
  await receive('Главный вход')
  assert.match(f.prompts.at(-1).message.text, /Гостей: 47/)
  await choose('Изменить ответы')
  await choose('Уточнения')
  await receive('Городской дворец культуры')
  await receive('Вход со двора')
  await choose('Изменить ответы')
  await choose('Тип события')
  await choose('Корпоратив')
  assert.match(f.prompts.at(-1).message.text, /Как называется компания/)
  await receive('Ведело')
  assert.doesNotMatch(f.prompts.at(-1).message.text, /Гостей: 47|Свадьба/)
  const submit = f.makeCallback('Отправить заявку')
  await Promise.all([f.callback(submit, context), f.callback(submit, context)])
  assert.equal(f.events.length, 1)
  const [event] = f.events
  assert.equal(event.eventType, 'Корпоратив')
  assert.equal(event.eventDate.toISOString(), '2030-12-07T11:45:00.000Z')
  assert.deepEqual(event.servicesIds, ['1'.repeat(24)])
  assert.deepEqual(f.serviceFilters, [{ tenantId, _id: { $in: ['1'.repeat(24)] } }])
  assert.equal(event.address.town, 'Красноярск')
  assert.equal(event.address.comment, 'Концертный зал')
  assert.match(event.description, /Компания: Ведело/)
  assert.match(event.description, /Как называется площадка\?: Городской дворец культуры/)
  assert.match(event.description, /Какой вход использовать\?: Вход со двора/)
  assert.doesNotMatch(event.description, /Гостей: 47/)
  assert.equal(f.aiCalls.length, 2)
})

test('повторные тесты требуют команды и создают заметную карточку только при согласии', async () => {
  const f = await fixture()
  const testSettings = { ...settingsV2, questionnaire: {
    ...settingsV2.questionnaire, mode: 'test', blocks: [{ id: 'city', type: 'location', text: 'Где?', required: true }],
  } }
  const dryRun = { id: 'self-test-1', armedAt: new Date(Date.now() - 5000), createDraft: false }
  const realRun = { ...dryRun, id: 'self-test-2', createDraft: true }
  const run = async (testRun) => {
    const context = { settings: testSettings, testRun }
    const start = await f.receive({ text: 'Начать тест', context })
    assert.equal(start.suppressMessagePush, true)
    await f.callback(f.makeCallback('Оставить заявку'), context)
    await f.receive({ text: 'Красноярск', context })
    const submit = f.makeCallback('Отправить заявку')
    await f.callback(submit, context)
    await f.callback(submit, context)
  }
  await f.receive({ text: 'Начать тест', context: { settings: testSettings } })
  await f.receive({ text: 'Обычное сообщение', context: { settings: testSettings, testRun: dryRun } })
  assert.equal(f.sessions.length, 0)
  await run(dryRun)
  assert.equal(f.sessions[0].step, 'completed')
  assert.deepEqual(f.sessions[0].testResult, { eventType: '', date: '', time: '', city: 'Красноярск', venue: '', services: [], description: '' })
  assert.equal(f.events.length, 0)
  assert.equal(f.push.length, 0)
  await run(realRun)
  assert.equal(f.sessions.length, 2)
  assert.equal(f.sessions[1].testResult.draftId, String(f.events[0]._id))
  assert.match(f.events[0].description, /^Тестовая заявка из Telegram/)
  assert.equal(f.events[0].clientId, null)
  assert.equal(f.conversation.eventId, undefined)
  assert.equal(f.push.length, 1)
  assert.match(f.push[0].payload.title, /^Тестовая заявка/)
})

test('начатая v1 анкета отвечает прежними вопросами после публикации v2', async () => {
  const f = await fixture()
  await f.receive({ result: { isFirstIncomingMessage: true } })
  const migrated = { ...settingsV2, questionnaire: { ...settingsV2.questionnaire, blocks: [
    ...settingsV2.questionnaire.blocks, { id: 'legacy-media', type: 'message', mediaIds: ['sample-photo'] },
  ] } }
  await f.callback(f.makeCallback('Оставить заявку'), { settings: migrated })
  assert.deepEqual(f.media[0].media.map(item => item.id), ['sample-photo'])
  assert.equal(f.prompts.at(-1).message.text, 'Выберите услугу')
  await f.callback(f.makeCallback('Фотосъёмка'), { settings: settingsV2 })
  assert.equal(f.sessions[0].step, 'date')
  assert.equal(f.sessions[0].schemaVersion, undefined)
})

test('дата без времени сохраняется в запросе клиента без условного времени в карточке', async () => {
  const f = await fixture()
  const context = { settings: { ...settingsV2, questionnaire: {
    ...settingsV2.questionnaire,
    blocks: [{ id: 'date', type: 'dateTime', text: 'Когда мероприятие?', required: true }],
  } } }
  await f.receive({ context, result: { isFirstIncomingMessage: true } })
  await f.callback(f.makeCallback('Оставить заявку'), context)
  await f.receive({ text: '07.12.2030 25:00', context })
  assert.match(f.prompts.at(-1).message.text, /Проверьте дату/)
  await f.receive({ text: '07.12.2030', context })
  await f.callback(f.makeCallback('Отправить заявку'), context)
  assert.equal(f.events[0].eventDate, null)
  assert.match(f.events[0].description, /Дата: 07\.12\.2030\. Время не указано/)
  assert.equal(f.events[0].clientData.lead.requestedDate, '2030-12-07')
  assert.equal(f.events[0].clientData.lead.timeNotSpecified, true)
})

test('структурные поля берут первый видимый заполненный ответ', async () => {
  const { readQuestionnaireResult } = await import('../../server/telegramQuestionnaireBlocks.mjs')
  const { result } = readQuestionnaireResult({
    blocks: [
      { id: 'event1', type: 'eventType', text: 'Тип' }, { id: 'event2', type: 'eventType', text: 'Тип ещё раз' },
      { id: 'date1', type: 'dateTime', text: 'Дата' }, { id: 'date2', type: 'dateTime', text: 'Дата ещё раз' },
      { id: 'town1', type: 'location', text: 'Город' }, { id: 'town2', type: 'location', text: 'Город ещё раз' },
    ],
    blockAnswers: [
      { blockId: 'event1', value: 'Свадьба' }, { blockId: 'event2', value: 'Праздник' },
      { blockId: 'date1', value: '08.12.2030', date: '2030-12-08' }, { blockId: 'date2', value: '07.12.2030', date: '2030-12-07', time: '19:00' },
      { blockId: 'town1', value: 'Красноярск, Дворец культуры' }, { blockId: 'town2', value: 'Ачинск' },
    ],
  })
  assert.equal(result.eventType, 'Свадьба')
  assert.equal(result.date, '2030-12-08')
  assert.equal(result.time, '')
  assert.equal(result.city, 'Красноярск')
  assert.equal(result.venue, 'Дворец культуры')
})
