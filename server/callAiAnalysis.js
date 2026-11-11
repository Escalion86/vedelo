import { requestAiChatCompletion } from './aiChatCompletion.js'

const EVENT_TYPES = new Set([
  'kids',
  'birthday',
  'wedding',
  'corporate',
  'presentation',
  'opening',
  'club',
])

const trimText = (value, maxLength = 12000) =>
  String(value ?? '').trim().slice(0, maxLength)

const parseJsonObject = (value) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (error) {
    const match = String(value).match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch (nestedError) {
      return null
    }
  }
}

const parseDateOrNull = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const hasExplicitYear = (text) => /\b(?:19|20)\d{2}\b/.test(String(text ?? ''))

const repairImplicitYear = (value, transcript, referenceDate) => {
  const date = parseDateOrNull(value)
  const reference = parseDateOrNull(referenceDate) ?? new Date()
  if (!date || hasExplicitYear(transcript) || date >= reference) return date

  const repaired = new Date(date)
  repaired.setFullYear(reference.getFullYear())
  if (repaired < reference) repaired.setFullYear(reference.getFullYear() + 1)
  return repaired
}

const parseBudget = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(String(value).replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(number) && number >= 0 ? number : null
}

const normalizeStringList = (items) =>
  Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []

const normalizeComparableText = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()

const matchAllowedService = (value, allowedServices) => {
  const normalized = normalizeComparableText(value)
  if (!normalized) return ''
  const exact = allowedServices.find(
    (serviceTitle) => normalizeComparableText(serviceTitle) === normalized
  )
  if (exact) return exact

  const candidates = allowedServices.filter((serviceTitle) => {
    const candidate = normalizeComparableText(serviceTitle)
    return (
      normalized.length >= 4 &&
      candidate.length >= 4 &&
      (candidate.includes(normalized) || normalized.includes(candidate))
    )
  })
  return candidates.length === 1 ? candidates[0] : ''
}

const normalizeEventType = (value, allowedEventTypes = []) => {
  const normalized = String(value ?? '').trim()
  const lowerNormalized = normalized.toLowerCase()
  const existingEventType = allowedEventTypes.find(
    (item) => item.toLowerCase() === lowerNormalized
  )
  if (existingEventType) return existingEventType
  if (allowedEventTypes.length) return ''
  return EVENT_TYPES.has(normalized) ? normalized : ''
}

export const normalizeAiCallAnalysis = (raw, options = {}) => {
  const data = raw && typeof raw === 'object' ? raw : {}
  const allowedEventTypes = normalizeStringList(options.eventTypes)
  const confidence = Number(data.confidence)
  const eventDate = repairImplicitYear(
    data.eventDate,
    options.transcript,
    options.referenceDate
  )
  const dateEnd = repairImplicitYear(
    data.dateEnd,
    options.transcript,
    options.referenceDate
  )
  const depositDueAt = repairImplicitYear(
    data.depositDueAt,
    options.transcript,
    options.referenceDate
  )
  const depositExpectedAmount = parseBudget(data.depositExpectedAmount)
  const waitDeposit =
    data.waitDeposit === true || Boolean(depositDueAt || depositExpectedAmount)
  const allowedServices = normalizeStringList(options.services)
  const requestedServices = normalizeStringList(
    data.serviceTitles ?? (data.serviceTitle ? [data.serviceTitle] : [])
  )
  const serviceTitles = requestedServices
    .map((title) => matchAllowedService(title, allowedServices))
    .filter(Boolean)
  return {
    summary: trimText(data.summary, 3000),
    extractedFields: {
      clientName: trimText(data.clientName, 120),
      eventType: normalizeEventType(data.eventType, allowedEventTypes),
      eventDate,
      dateEnd: dateEnd && (!eventDate || dateEnd >= eventDate) ? dateEnd : null,
      eventCity: trimText(data.eventCity, 120),
      eventLocation: trimText(data.eventLocation, 240),
      guestCount: trimText(data.guestCount, 80),
      budget: parseBudget(data.budget),
      waitDeposit,
      depositDueAt,
      depositExpectedAmount,
      serviceTitles,
      nextContactAt: parseDateOrNull(data.nextContactAt),
      nextContactReason: trimText(data.nextContactReason, 240),
      objections: Array.isArray(data.objections)
        ? data.objections.map((item) => trimText(item, 180)).filter(Boolean)
        : [],
      confidence: Number.isFinite(confidence)
        ? Math.max(0, Math.min(1, confidence))
        : 0,
    },
  }
}

const buildFallbackAnalysis = (transcript, settings = {}) => {
  const text = trimText(transcript, 3000)
  const firstLine = text.split('\n').find(Boolean) || text.slice(0, 220)
  return normalizeAiCallAnalysis(
    {
      summary: firstLine
        ? `AI-анализ не настроен. Черновое резюме по transcript: ${firstLine}`
        : 'AI-анализ не настроен. Добавьте transcript или настройте AI provider API key.',
      eventType: '',
      confidence: 0.1,
    },
    settings
  )
}

const buildEventTypeInstruction = (settings = {}) => {
  const eventTypes = normalizeStringList(settings.eventTypes)
  if (!eventTypes.length) {
    return 'одно из kids, birthday, wedding, corporate, presentation, opening, club; если нет уверенного совпадения, верни пустую строку.'
  }
  return `строго одно из существующих значений: ${eventTypes
    .map((item) => JSON.stringify(item))
    .join(', ')}; если нет уверенного совпадения, верни пустую строку.`
}

const buildServicesInstruction = (settings = {}) => {
  const services = normalizeStringList(settings.services)
  if (!services.length) return 'пустой массив.'
  return `массив из существующих названий: ${services
    .map((item) => JSON.stringify(item))
    .join(', ')}; не придумывай новые услуги.`
}

const buildPrompt = (transcript, settings = {}, referenceDate = new Date()) => `
Ты анализируешь телефонный разговор артиста с потенциальным клиентом CRM.
Верни только JSON без markdown.

Текущая дата: ${referenceDate.toISOString()}. Если год события не назван, используй текущий год, а если такая дата уже прошла — следующий. Не переноси дату в прошлые годы.

Нужно извлечь поля:
- summary: краткое резюме разговора на русском языке.
- clientName: имя клиента, если оно явно звучит.
- eventType: ${buildEventTypeInstruction(settings)}
- eventDate: дата/время мероприятия в ISO 8601 или null. Если время не названо, используй 12:00.
- dateEnd: дата/время завершения в ISO 8601 или null. Если названа продолжительность, вычисли окончание от eventDate.
- eventCity: город, если есть.
- eventLocation: площадка/адрес/комментарий к месту, если есть.
- guestCount: количество гостей строкой, если есть.
- budget: число в рублях или null.
- waitDeposit: true, если стороны договорились о задатке/авансе/предоплате или ожидают его. Учитывай ошибки распознавания речи рядом с обсуждением оплаты (например, «водаток» вместо «задаток»).
- depositDueAt: ожидаемая дата задатка в ISO 8601 или null. Фразы «в ближайшие пару дней», «завтра» и подобные считай относительно текущей даты.
- depositExpectedAmount: ожидаемая сумма задатка в рублях или null. Не путай её с полной стоимостью.
- serviceTitles: ${buildServicesInstruction(settings)}
- nextContactAt: дата/время следующего контакта в ISO 8601 или null.
- nextContactReason: почему нужен следующий контакт.
- objections: массив сомнений/возражений клиента.
- confidence: число от 0 до 1.

Если данных нет или они сомнительные, ставь null/пустую строку и снижай confidence.

Transcript:
${transcript}
`

export const analyzeCallTranscript = async (
  transcript,
  settings = {},
  options = {}
) => {
  const cleanTranscript = trimText(transcript)
  const referenceDate = parseDateOrNull(options.referenceDate) ?? new Date()
  const normalizationOptions = {
    ...settings,
    transcript: cleanTranscript,
    referenceDate,
  }
  if (!cleanTranscript) {
    return buildFallbackAnalysis('', normalizationOptions)
  }

  const completion = await requestAiChatCompletion({
    settings,
    feature: options.feature || 'call_analysis',
    operationId: options.operationId,
    groupId: options.groupId || '',
    messages: [
      {
        role: 'system',
        content:
          'Ты аккуратный CRM-ассистент. Извлекаешь только явно подтвержденные данные и возвращаешь строгий JSON.',
      },
      {
        role: 'user',
        content: buildPrompt(cleanTranscript, settings, referenceDate),
      },
    ],
  })
  if (!completion)
    return buildFallbackAnalysis(cleanTranscript, normalizationOptions)

  const json = parseJsonObject(completion.content)
  if (!json) throw new Error('AI вернул некорректный JSON')

  return {
    ...normalizeAiCallAnalysis(json, normalizationOptions),
    ...(completion.provider ? { provider: completion.provider, model: completion.model } : {}),
  }
}
