import TelegramQuestionnaireSettings from '@models/TelegramQuestionnaireSettings'
import { telegramQuestionnaireBlockTypes, telegramQuestionnaireMediaKey } from '@helpers/telegramQuestionnaireBlocks.mjs'

export const QUESTIONNAIRE_MEDIA_LIMIT = 6
export const QUESTIONNAIRE_ATTACHMENT_ID = /^[a-f0-9]{24}$/

export const questionnaireError = (message, status = 400) =>
  Object.assign(new Error(message), { status })

const legacyDefaults = () => ({
  enabled: false,
  useTelegramGreeting: false,
  welcomeText: '',
  questions: {
    service: {
      text: 'Для какого мероприятия нужна услуга?',
      options: ['Свадьба', 'День рождения', 'Корпоратив'],
    },
    date: { text: 'На какую дату планируете мероприятие?' },
    city: { text: 'В каком городе пройдёт мероприятие?', options: [] },
    details: { text: 'Что ещё важно учесть?' },
  },
  media: [],
})

const asBlocks = (questionnaire) => {
  if (questionnaire.schemaVersion === 2) return questionnaire
  const { questions, media, enabled, ...settings } = questionnaire
  const question = (key, type, required, label) => ({
    id: `legacy-${key}`, type, text: questions[key].text, required,
    options: (questions[key].options ?? []).map((label, index) => ({ id: `option-${index}`, label })),
    ...(label ? { label } : {}),
  })
  return {
    ...settings, schemaVersion: 2, enabled, mode: enabled ? 'live' : 'off', media, testChatIds: [],
    blocks: [
      ...(media.length ? [{ id: 'legacy-media', type: 'message', text: '', required: false, options: [],
        mediaIds: media.map(telegramQuestionnaireMediaKey) }] : []),
      question('service', 'eventType', true), question('date', 'dateTime', false),
      question('city', 'location', true), question('details', 'question', false, 'Пожелания'),
    ],
  }
}

export const defaultTelegramQuestionnaire = () => asBlocks(legacyDefaults())

const checkedText = (value, limit, label) => {
  if (typeof value !== 'string' || value.trim().length > limit) {
    throw questionnaireError(`${label} — до ${limit} символов`)
  }
  return value.trim()
}

const normalizeOptions = (values) => {
  if (!Array.isArray(values) || values.length > 8) {
    throw questionnaireError('У вопроса может быть до 8 вариантов ответа')
  }
  return [...new Set(values.map((value) =>
    checkedText(value, 80, 'Вариант ответа')
  ).filter(Boolean))]
}

const normalizeMediaUrl = (value) => {
  const candidate = checkedText(value, 2048, 'Ссылка на файл')
  let url
  try {
    url = new URL(candidate)
  } catch {
    throw questionnaireError('Укажите прямую HTTPS-ссылку на файл')
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw questionnaireError('Укажите прямую HTTPS-ссылку на файл')
  }
  return url.href
}

const normalizeMedia = (input, storedMedia) => {
  if (!Array.isArray(input) || input.length > QUESTIONNAIRE_MEDIA_LIMIT) {
    throw questionnaireError(`Можно добавить до ${QUESTIONNAIRE_MEDIA_LIMIT} фото и видео`)
  }
  const media = new Map()
  const originalKeys = new Map()
  for (const item of input) {
    if (!['photo', 'video'].includes(item?.type)) {
      throw questionnaireError('Выберите фото или видео')
    }
    if (item.id !== undefined) {
      const stored = storedMedia.find(({ id }) => id && id === item.id)
      if (!stored || stored.type !== item.type) {
        throw questionnaireError('Загруженный файл не найден', 409)
      }
      media.set(stored.id, stored)
      originalKeys.set(stored.id, stored.id)
    } else {
      const url = normalizeMediaUrl(item.url)
      const key = telegramQuestionnaireMediaKey({ type: item.type, url })
      media.set(key, { type: item.type, url })
      originalKeys.set(telegramQuestionnaireMediaKey(item), key)
    }
  }
  return { media: [...media.values()], originalKeys }
}

const validBlockId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,48}$/.test(id) &&
  !Object.hasOwn(Object.prototype, id)

const normalizeBlocks = (input, mediaKeys) => {
  if (!Array.isArray(input) || input.length > 24) throw questionnaireError('Добавьте до 24 блоков')
  const previous = new Map()
  for (const block of input) {
    if (!validBlockId(block?.id) || previous.has(block.id) || !telegramQuestionnaireBlockTypes.includes(block.type)) {
      throw questionnaireError('Обновите список блоков сценария')
    }
    const { id, type } = block
    const text = checkedText(block.text ?? '', 500, 'Текст блока')
    const result = { id, type, text, required: block.required === true, options: [] }
    if (type === 'message') {
      const ids = Array.isArray(block.mediaIds) ? block.mediaIds : []
      if (ids.some(key => !mediaKeys.has(key))) throw questionnaireError('Проверьте вложения блока')
      result.mediaIds = [...new Set(ids.map(key => mediaKeys.get(key)))]
      if (!text && !ids.length) throw questionnaireError('Добавьте текст или вложение в блок сообщения')
    } else if (type === 'ai') {
      result.topics = checkedText(block.topics ?? '', 500, 'Темы ИИ-уточнения')
      if (!result.topics) throw questionnaireError('Укажите темы для ИИ-уточнения')
    } else if (!text) {
      throw questionnaireError('Введите текст вопроса')
    }
    const options = block.options ?? []
    if (!Array.isArray(options) || options.length > 8) throw questionnaireError('Добавьте до 8 вариантов ответа')
    if (['eventType', 'location', 'services', 'question'].includes(type)) {
      const optionIds = new Set()
      result.options = options.map(option => {
        const label = checkedText(option?.label ?? '', 80, 'Вариант ответа')
        if (!validBlockId(option?.id) || optionIds.has(option.id) || !label) throw questionnaireError('Проверьте варианты ответа')
        optionIds.add(option.id)
        if (type !== 'services') return { id: option.id, label }
        if (typeof option.serviceId !== 'string' || !QUESTIONNAIRE_ATTACHMENT_ID.test(option.serviceId)) {
          throw questionnaireError('Выберите услугу из каталога')
        }
        return { id: option.id, label, serviceId: option.serviceId }
      })
    }
    if (type === 'services' && !result.options.length) throw questionnaireError('Выберите хотя бы одну услугу из каталога')
    if (type === 'question') result.label = checkedText(block.label ?? '', 80, 'Подпись в заявке') || text.slice(0, 80)
    if (block.condition) {
      const { blockId, optionId, operator } = block.condition
      if (!['equals', 'notEquals'].includes(operator) || !previous.get(blockId)?.options.some(option => option.id === optionId)) {
        throw questionnaireError('Условие должно ссылаться на вариант ответа в предыдущем блоке')
      }
      result.condition = { blockId, optionId, operator }
    }
    previous.set(id, result)
  }
  return [...previous.values()]
}

export const validateTelegramQuestionnaire = (body, storedMedia = []) => {
  if (typeof body?.useTelegramGreeting !== 'boolean') throw questionnaireError('Укажите режим приветствия')
  const { media, originalKeys } = normalizeMedia(body.media, storedMedia)
  const settings = { media, useTelegramGreeting: body.useTelegramGreeting,
    welcomeText: checkedText(body.welcomeText ?? '', 500, 'Приветствие') }
  if (body.schemaVersion === 2) {
    const { mode, testChatIds = [] } = body
    if (!['off', 'test', 'live'].includes(mode)) throw questionnaireError('Укажите режим работы автоответчика')
    if (!Array.isArray(testChatIds) || testChatIds.length > 12 || testChatIds.some(id =>
      typeof id !== 'string' || !QUESTIONNAIRE_ATTACHMENT_ID.test(id))) throw questionnaireError('Выберите до 12 тестовых чатов')
    if (mode === 'test' && !testChatIds.length) throw questionnaireError('Добавьте хотя бы один тестовый чат')
    const blocks = normalizeBlocks(body.blocks, originalKeys)
    if (mode !== 'off' && !blocks.some(block => block.type !== 'message')) throw questionnaireError('Добавьте хотя бы один вопрос')
    return { ...settings, schemaVersion: 2, mode, enabled: mode !== 'off', blocks, testChatIds: [...new Set(testChatIds)] }
  }
  if (typeof body.enabled !== 'boolean') throw questionnaireError('Укажите режим работы автоответчика')
  const questions = Object.fromEntries(Object.entries(legacyDefaults().questions).map(([key, question]) => {
    const input = body.questions?.[key]
    const text = checkedText(input?.text ?? '', 500, 'Текст вопроса') || question.text
    return [key, question.options ? { text, options: normalizeOptions(input?.options ?? question.options) } : { text }]
  }))
  return { ...settings, enabled: body.enabled, questions }
}

const toSettings = (row) => ({
  ...(row?.questionnaire ? asBlocks(row.questionnaire) : defaultTelegramQuestionnaire()),
  revision: row?.revision ?? 0,
})

export const readTelegramQuestionnaire = async (tenantId) =>
  toSettings(await TelegramQuestionnaireSettings.findOne({ tenantId }).lean())

const ensureSettings = async (tenantId) => {
  await TelegramQuestionnaireSettings.init()
  await TelegramQuestionnaireSettings.updateOne(
    { tenantId },
    { $setOnInsert: { questionnaire: defaultTelegramQuestionnaire() } },
    { upsert: true }
  ).catch((error) => {
    if (error?.code !== 11000) throw error
  })
}

export const saveTelegramQuestionnaire = async ({ tenantId, revision, questionnaire }) => {
  await ensureSettings(tenantId)
  const row = await TelegramQuestionnaireSettings.findOneAndUpdate(
    { tenantId, revision },
    { $set: { questionnaire }, $inc: { revision: 1 } },
    { returnDocument: 'after' }
  ).lean()
  if (!row) throw questionnaireError('Настройки обновились. Откройте их заново и повторите изменения', 409)
  return toSettings(row)
}

export const appendTelegramQuestionnaireMedia = async ({ tenantId, revision, attachment }) => {
  const { revision: currentRevision, ...questionnaire } = await readTelegramQuestionnaire(tenantId)
  if (currentRevision !== revision || questionnaire.media.length >= QUESTIONNAIRE_MEDIA_LIMIT) {
    throw questionnaireError('Настройки обновились. Откройте их заново и повторите загрузку', 409)
  }
  return saveTelegramQuestionnaire({
    tenantId, revision, questionnaire: { ...questionnaire, media: [...questionnaire.media, attachment] },
  })
}
