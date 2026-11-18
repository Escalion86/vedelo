import TelegramQuestionnaireSettings from '@models/TelegramQuestionnaireSettings'

export const QUESTIONNAIRE_MEDIA_LIMIT = 6
export const QUESTIONNAIRE_ATTACHMENT_ID = /^[a-f0-9]{24}$/

export const questionnaireError = (message, status = 400) =>
  Object.assign(new Error(message), { status })

export const defaultTelegramQuestionnaire = () => ({
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

export const validateTelegramQuestionnaire = (body, storedMedia = []) => {
  if (typeof body?.enabled !== 'boolean' || typeof body.useTelegramGreeting !== 'boolean') {
    throw questionnaireError('Укажите режим работы автоответчика')
  }
  const defaults = defaultTelegramQuestionnaire()
  const questions = Object.fromEntries(Object.entries(defaults.questions).map(([key, question]) => {
    const input = body.questions?.[key]
    const text = checkedText(input?.text ?? '', 500, 'Текст вопроса') || question.text
    return [key, question.options ? { text, options: normalizeOptions(input?.options ?? question.options) } : { text }]
  }))
  if (!Array.isArray(body.media) || body.media.length > QUESTIONNAIRE_MEDIA_LIMIT) {
    throw questionnaireError(`Можно добавить до ${QUESTIONNAIRE_MEDIA_LIMIT} фото и видео`)
  }
  const media = new Map()
  for (const item of body.media) {
    if (!['photo', 'video'].includes(item?.type)) {
      throw questionnaireError('Выберите фото или видео')
    }
    if (item.id !== undefined) {
      const stored = storedMedia.find(({ id }) => id && id === item.id)
      if (!stored || stored.type !== item.type) {
        throw questionnaireError('Загруженный файл не найден', 409)
      }
      media.set(`file:${stored.id}`, stored)
    } else {
      const url = normalizeMediaUrl(item.url)
      media.set(`${item.type}:${url}`, { type: item.type, url })
    }
  }
  return {
    enabled: body.enabled,
    useTelegramGreeting: body.useTelegramGreeting,
    welcomeText: checkedText(body.welcomeText ?? '', 500, 'Приветствие'),
    questions,
    media: [...media.values()],
  }
}

const toSettings = (row) => ({
  ...(row?.questionnaire ?? defaultTelegramQuestionnaire()),
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
  await ensureSettings(tenantId)
  const row = await TelegramQuestionnaireSettings.findOneAndUpdate(
    { tenantId, revision, [`questionnaire.media.${QUESTIONNAIRE_MEDIA_LIMIT - 1}`]: { $exists: false } },
    { $push: { 'questionnaire.media': attachment }, $inc: { revision: 1 } },
    { returnDocument: 'after' }
  ).lean()
  if (!row) throw questionnaireError('Настройки обновились. Откройте их заново и повторите загрузку', 409)
  return toSettings(row)
}
