import { NextResponse } from 'next/server'
import dbConnect from '@server/dbConnect'
import Clients from '@models/Clients'
import Services from '@models/Services'
import SiteSettings from '@models/SiteSettings'
import { getTenantAiSettings } from '@server/aiSettings'
import { requestAiChatCompletion } from '@server/aiChatCompletion'
import {
  getAiBalanceErrorMessage,
  isAiBalanceError,
} from '@server/aiBilling'
import {
  buildAiClientPayload,
  extractAiClientContacts,
  findClientByAiContacts,
  formatAiClientName,
  hasAiClientContacts,
  keepAiContactsPresentInText,
  matchAiServiceIds,
  mergeAiClientContacts,
  resolveAiClientByName,
} from '@helpers/aiEventDraftContacts.mjs'
import {
  applyAiEventDraftHints,
  getAiDraftToday,
} from '@helpers/aiEventDraftHints.mjs'

const AI_FORM_FIELDS = new Set([
  'eventType',
  'eventDate',
  'dateEnd',
  'description',
  'contractSum',
  'waitDeposit',
  'depositExpectedAmount',
  'isByContract',
  'financeComment',
  'address',
  'clientId',
  'servicesIds',
])

const toSafeClient = (client) => {
  if (!client) return null
  const source = typeof client.toObject === 'function' ? client.toObject() : client
  return {
    _id: String(source._id),
    firstName: source.firstName ?? '',
    secondName: source.secondName ?? '',
    thirdName: source.thirdName ?? '',
    phone: source.phone ?? null,
    whatsapp: source.whatsapp ?? null,
    viber: source.viber ?? null,
    email: source.email ?? '',
    telegram: source.telegram ?? '',
    instagram: source.instagram ?? '',
    vk: source.vk ?? '',
    preferredContactChannel: source.preferredContactChannel ?? '',
    clientType: source.clientType ?? 'none',
  }
}

const getVerifiedClientName = (clientName, sourceText) => {
  const name = String(clientName ?? '').trim()
  if (!name) return ''
  const normalizedName = name.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ')
  const normalizedSource = String(sourceText ?? '')
    .toLocaleLowerCase('ru-RU')
    .replace(/\s+/g, ' ')
  return normalizedSource.includes(normalizedName) ? name : ''
}

const normalizeAiWarnings = (warnings) =>
  Array.isArray(warnings)
    ? warnings
        .filter((warning) => typeof warning === 'string' && warning.trim())
        .map((warning) => warning.trim().slice(0, 240))
        .slice(0, 3)
    : []

const getAmbiguousClientWarning = (candidates) => {
  const names = candidates
    .map(formatAiClientName)
    .filter(Boolean)
    .slice(0, 3)
  const suffix = candidates.length > names.length ? ' и другие' : ''
  return `Не удалось однозначно определить клиента: подходят ${names.join(', ')}${suffix}. Выберите клиента вручную.`
}

export async function processEventAiDraft({ text, tenantId, userId, strict = false, aiSettings: providedAiSettings }) {
  try {
    // --- получаем данные для матчинга клиентов и услуг ---
    await dbConnect()
    const [clients, services, aiSettings, siteSettings] = await Promise.all([
      Clients.find({ tenantId })
        .select(
          '_id firstName secondName thirdName phone whatsapp viber email telegram instagram vk preferredContactChannel clientType'
        )
        .lean(),
      Services.find({ tenantId })
        .select('_id title description price')
        .sort({ title: 1 })
        .lean(),
      providedAiSettings || getTenantAiSettings(tenantId),
      SiteSettings.findOne({ tenantId }).select('timeZone').lean(),
    ])

    const clientNames = clients.map((c) => ({
      id: String(c._id),
      name: [c.firstName, c.secondName, c.thirdName]
        .filter(Boolean)
        .join(' ')
        .trim(),
    }))

    // --- получаем сегодняшнюю дату для контекста ---
    const today = new Date()
    const timeZone = siteSettings?.timeZone || 'Asia/Krasnoyarsk'
    const todayStr = getAiDraftToday(today, timeZone)

    // --- собираем промпт ---
    const systemPrompt = `Ты — ассистент CRM для иллюзиониста (артиста, ведущего мероприятий). Твоя задача — извлечь из свободного описания события структурированные данные для заполнения формы.

Возвращай ТОЛЬКО валидный JSON-объект с полями, которые удалось извлечь. Если поле не удалось определить — не включай его в ответ.

Доступные поля (все опциональны):
- eventType: строка, тип события. Например: "свадьба", "корпоратив", "день рождения", "выпускной", "юбилей", "новый год", "детский праздник", "гендер пати", "квартирник", "концерт", "тимбилдинг", "выставка", "презентация", "фуршет", "банкет", "помолвка", "девичник", "мальчишник", "крестины", "встреча", "тест", "другое"
- eventDate: строка даты и времени в ISO 8601. Если указан только день — ставь время на 12:00 в часовом поясе ${timeZone}. Если «завтра»/«послезавтра» — вычисляй относительно сегодня (${todayStr}). Если не указан год — подставляй текущий (${today.getFullYear()}).
- dateEnd: строка даты окончания в ISO 8601. Если указана только продолжительность (например «на 4 часа»), вычисли eventDate + длительность.
- description: строка, краткое описание события (2-3 предложения). Не дублируй то, что уже извлечено в другие поля.
- contractSum: число, сумма контракта в рублях. Извлекай из фраз вроде «бюджет 50 тысяч», «за 30000 руб», «гонорар 100к», «стоимость 15000₽».
- waitDeposit: булево, true если упоминается задаток/предоплата («нужен задаток», «возьму предоплату», «аванс»).
- depositExpectedAmount: число, сумма задатка если указана («задаток 10 тысяч»).
- isByContract: булево, true если упоминается договор («по договору», «с договором», «оформим договор»).
- financeComment: строка, финансовые заметки не попавшие в другие поля.
- servicesIds: массив ID услуг из списка ниже, которые явно выбрал клиент. Выбирай только существующие услуги и только если они подходят по смыслу заметки.

- address: объект с полями адреса. Любые из:
  - town: строка, город
  - street: строка, улица
  - house: строка, дом
  - comment: строка, примечание об адресе («вход со двора», «3 этаж»)

- clientId: строка (ID клиента) или null если клиент найден. Сопоставляй имя из текста со списком ниже.
- clientName: строка, имя клиента как оно упомянуто в тексте (даже если не найден в списке).
- clientPhone: телефон клиента.
- clientWhatsapp: номер WhatsApp клиента.
- clientViber: номер Viber клиента.
- clientEmail: email клиента.
- clientTelegram: логин или ссылка Telegram клиента.
- clientInstagram: логин или ссылка Instagram клиента.
- clientVk: логин, ID или ссылка VK клиента.
- warnings: массив коротких пояснений о неоднозначных или противоречивых данных. Добавляй предупреждение только если нужный факт присутствует в тексте, но его нельзя определить уверенно. Не перечисляй поля, которых в тексте просто нет.

Список услуг (id → название и описание):
${services
  .map(
    (service) =>
      `- ${service._id}: "${service.title}"${
        service.description ? ` — ${String(service.description).slice(0, 200)}` : ''
      }`
  )
  .join('\n')}

Список клиентов (id → name):
${clientNames.map((c) => `- ${c.id}: "${c.name}"`).join('\n')}

ВАЖНО: 
- Возвращай ТОЛЬКО JSON, без markdown-блоков.
- Не выдумывай данные — если чего-то нет в тексте, не добавляй это поле.
- Если клиент найден в списке — верни clientId, иначе — не включай clientId в ответ.
- Если подходят несколько клиентов и нельзя уверенно выбрать одного — не возвращай clientId и кратко объясни неоднозначность в warnings.
- Контакты возвращай только если они явно присутствуют в тексте.
- servicesIds может содержать только ID из списка услуг выше.
- Суммы возвращай как числа (не строки).
- contractSum и depositExpectedAmount указывай только при явном денежном контексте: «бюджет», «гонорар», «стоимость», «цена», «сумма», «оплата», валюта, «тысяч» или «к». Числа в адресах, датах и контактах суммами не являются.
- Учитывай словоформы и разговорные сокращения. Например, «свадебное» и «свадебный» означают тип события «Свадьба».
- Если факт уже разложен по структурированным полям, не дублируй его в description. Оставляй там только важный остаток текста.
- Пример: «Завтра на линейной 38 от Ларковича за свадебное» означает тип «Свадьба», завтра в 12:00, улица «Линейная», дом «38»; суммы в этой фразе нет.
- Даты в ISO 8601.`

    // --- LLM: выбранный пользователем OpenAI-совместимый провайдер ---
    let completion = null
    try {
      completion = await requestAiChatCompletion({
        settings: { ...aiSettings, ...(userId ? { userId } : {}) },
        feature: 'event_draft',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        temperature: 0.2,
        maxTokens: 800,
        ...(strict ? { timeoutMs: 45000 } : {}),
      })
    } catch (error) {
      if (isAiBalanceError(error)) {
        return NextResponse.json(
          { error: getAiBalanceErrorMessage(error), fields: null },
          { status: 402 }
        )
      }
      if (strict) return NextResponse.json({ error: 'Не удалось заполнить поля. Попробуйте другое фото или повторите распознавание.', fields: null }, { status: 502 })
      console.warn('[ai-draft] AI provider failed')
    }

    let parsed = null
    if (completion) {
      const content = completion.content
      try {
        parsed = JSON.parse(content)
      } catch {
        const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[1].trim())
          } catch {
            console.warn(
              '[ai-draft] не удалось разобрать LLM-ответ, использую regex'
            )
          }
        }
      }
    } else if (!strict) {
      console.warn('[ai-draft] AI provider не настроен, использую regex-заглушку')
    }

    if (strict && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) {
      return NextResponse.json({ error: 'ИИ не вернул корректные поля. Переснимите заметку или выберите другое фото.', fields: null }, { status: 502 })
    }

    const validServiceIds = services.map((service) => String(service._id))
    let fields = parsed
      ? normalizeLLMFields(parsed, clientNames, validServiceIds)
      : extractFieldsFallback(text, clientNames, todayStr, services)
    fields = applyAiEventDraftHints(fields, text, { now: today, timeZone })

    const deterministicServiceIds = matchAiServiceIds(text, services)
    const selectedServiceIds = Array.from(
      new Set([...(fields.servicesIds ?? []), ...deterministicServiceIds])
    )
    if (selectedServiceIds.length > 0) {
      fields.servicesIds = selectedServiceIds
    }

    const contacts = keepAiContactsPresentInText(
      mergeAiClientContacts(extractAiClientContacts(text), parsed ?? {}),
      text
    )
    const aiWarnings = normalizeAiWarnings(parsed?.warnings)
    let selectedClient = findClientByAiContacts(clients, contacts)
    const nameResolution = resolveAiClientByName(clients, text)
    if (!selectedClient && nameResolution.client) {
      selectedClient = nameResolution.client
    } else if (!selectedClient && nameResolution.ambiguous) {
      delete fields.clientId
      aiWarnings.unshift(getAmbiguousClientWarning(nameResolution.candidates))
    } else if (!selectedClient && fields.clientId) {
      selectedClient = clients.find(
        (client) => String(client._id) === String(fields.clientId)
      )
    }

    let clientCreated = false
    if (!selectedClient && hasAiClientContacts(contacts)) {
      selectedClient = await Clients.create({
        ...buildAiClientPayload({
          clientName: getVerifiedClientName(fields.clientName, text),
          contacts,
        }),
        tenantId,
      })
      clientCreated = true
    }

    if (selectedClient?._id) fields.clientId = String(selectedClient._id)

    const aiFilledFields = Object.keys(fields).filter((field) =>
      AI_FORM_FIELDS.has(field)
    )

    return NextResponse.json({
      fields,
      aiFilledFields,
      client: toSafeClient(selectedClient),
      clientCreated,
      aiWarnings: Array.from(new Set(aiWarnings)).slice(0, 3),
    })

  } catch (error) {
    console.error('[ai-draft] processing failed')
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера', fields: null },
      { status: 500 }
    )
  }
}

// ============================================================================
// Fallback: извлечение полей регулярными выражениями (когда нет LLM)
// ============================================================================

function extractFieldsFallback(text, clientNames, todayStr, services = []) {
  const fields = {}

  // --- дата события ---
  const datePatterns = [
    // "15 июня 2026", "15.06.2026", "15/06/2026", "15-06-2026"
    /(\d{1,2})\s+(январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\s*(\d{4})?/i,
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/,
    // "завтра", "послезавтра"
    /\b(завтра|послезавтра)\b/i,
  ]

  const months = {
    'января':1,'январь':1,'февраля':2,'февраль':2,'марта':3,'март':3,
    'апреля':4,'апрель':4,'мая':5,'май':5,'июня':6,'июнь':6,
    'июля':7,'июль':7,'августа':8,'август':8,'сентября':9,'сентябрь':9,
    'октября':10,'октябрь':10,'ноября':11,'ноябрь':11,'декабря':12,'декабрь':12,
  }

  // Пробуем «завтра» / «послезавтра»
  const tomorrowMatch = text.match(/\bпослезавтра\b/i)
  const todayMatch = text.match(/\bзавтра\b/i)
  const now = new Date()
  if (tomorrowMatch) {
    now.setDate(now.getDate() + 2)
    now.setHours(12, 0, 0, 0)
    fields.eventDate = now.toISOString()
  } else if (todayMatch) {
    now.setDate(now.getDate() + 1)
    now.setHours(12, 0, 0, 0)
    fields.eventDate = now.toISOString()
  } else {
    // Пробуем числовую дату
    const numMatch = text.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
    if (numMatch) {
      let [, d, m, y] = numMatch
      m = parseInt(m, 10)
      d = parseInt(d, 10)
      y = parseInt(y, 10)
      if (y < 100) y += 2000
      const date = new Date(y, m - 1, d, 12, 0, 0)
      if (!Number.isNaN(date.getTime())) {
        fields.eventDate = date.toISOString()
      }
    }

    // Пробуем текстовую дату
    const textMatch = text.match(/(\d{1,2})\s+(январ[ья]|феврал[ья]|март[а]?|апрел[ья]|ма[йя]|июн[ья]|июл[ья]|август[а]?|сентябр[ья]|октябр[ья]|ноябр[ья]|декабр[ья])\s*(\d{4})?/i)
    if (textMatch) {
      const d = parseInt(textMatch[1], 10)
      const mStr = textMatch[2].toLowerCase()
      const m = months[mStr] ?? months[mStr.replace(/[ья]$/, 'ь')] ?? 1
      const y = parseInt(textMatch[3] || String(now.getFullYear()), 10)
      const date = new Date(y, m - 1, d, 12, 0, 0)
      if (!Number.isNaN(date.getTime())) {
        fields.eventDate = date.toISOString()
      }
    }
  }

  // --- тип события ---
  const typeMatch = text.match(
    /(свадьб\w*|свадебн\w*|корпоратив|день\s+рождени[яе]|выпускной|юбилей|новый\s+год|детский\s+праздник|гендер\s+пати|квартирник|концерт|тимбилдинг|выставк[аи]|презентаци[яю]|фуршет|банкет|помолвк[аи]|девичник|мальчишник|крестины|встреч[ау]|тест)/i
  )
  if (typeMatch) {
    fields.eventType = /^свадьб|^свадебн/i.test(typeMatch[0])
      ? 'Свадьба'
      : typeMatch[0].toLowerCase()
  }

  // --- сумма контракта ---
  const sumMatch = text.match(
    /(?:бюджет|гонорар|стоимость|сумма|цена|контракт|оплата|за\s+)?\s*(\d[\d\s]*)\s*(?:тыс(?:яч[аи]?)?|к|руб|₽|р\b)/i
  )
  if (sumMatch) {
    let value = parseInt(sumMatch[1].replace(/\s/g, ''), 10)
    if (/тыс|к\b/i.test(sumMatch[0])) value *= 1000
    if (value > 0) fields.contractSum = value
  }

  // --- задаток ---
  if (/задаток|предоплата|аванс/i.test(text)) {
    fields.waitDeposit = true
    const depositMatch = text.match(/задаток\s*(\d[\d\s]*)/i)
    if (depositMatch) {
      const val = parseInt(depositMatch[1].replace(/\s/g, ''), 10)
      if (val > 0 && /тыс|к\b/i.test(text.slice(text.indexOf('задаток'), text.indexOf('задаток') + 30))) {
        fields.depositExpectedAmount = val * 1000
      } else if (val > 0) {
        fields.depositExpectedAmount = val
      }
    }
  }

  // --- договор ---
  if (/договор|по\s+договору/i.test(text)) {
    fields.isByContract = true
  }

  // --- адрес ---
  const townMatch = text.match(/гор(?:од[е]?|\.)?\s*(\S+)/i)
  if (townMatch) fields.address = { town: townMatch[1].replace(/[,.]/g, '') }

  const streetMatch = text.match(/ул(?:иц[ае]|\.)?\s*(\S+)/i)
  if (streetMatch) {
    fields.address = { ...(fields.address || {}), street: streetMatch[1].replace(/[,.]/g, '') }
  }

  const houseMatch = text.match(/д(?:ом|\.)?\s*(\d+[\w/]*)/i)
  if (houseMatch) {
    fields.address = { ...(fields.address || {}), house: houseMatch[1] }
  }

  // --- описание ---
  // Удаляем технические фрагменты (даты, суммы, адреса) и оставляем осмысленную часть
  let desc = text
    .replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, '')
    .replace(/\d+\s*(?:тыс|руб|₽|р\b|к\b)/gi, '')
    .replace(/бюджет|гонорар|стоимость|сумма|договор|задаток|предоплата|ул\.|гор\.|д\.\s*\d+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  if (desc.length > 10) {
    // берём первые 300 символов
    fields.description = desc.slice(0, 300)
  }

  // --- client matching ---
  const lowerText = text.toLowerCase()
  for (const c of clientNames) {
    const nameParts = c.name.toLowerCase().split(/\s+/)
    // проверяем, есть ли хотя бы 2 части имени или уникальное имя в тексте
    const matches = nameParts.filter((part) => part.length > 2 && lowerText.includes(part))
    if (matches.length >= Math.min(2, nameParts.length)) {
      fields.clientId = c.id
      fields.clientName = c.name
      break
    }
  }

  const servicesIds = matchAiServiceIds(text, services)
  if (servicesIds.length > 0) fields.servicesIds = servicesIds

  return fields
}

// ============================================================================
// Нормализация полей от LLM
// ============================================================================

function normalizeLLMFields(parsed, clientNames, validServiceIds = []) {
  const fields = {}

  if (typeof parsed.eventType === 'string' && parsed.eventType.trim()) {
    fields.eventType = parsed.eventType.trim()
  }

  if (typeof parsed.eventDate === 'string' && parsed.eventDate.trim()) {
    const d = new Date(parsed.eventDate)
    if (!Number.isNaN(d.getTime())) {
      fields.eventDate = d.toISOString()
    }
  }

  if (typeof parsed.dateEnd === 'string' && parsed.dateEnd.trim()) {
    const d = new Date(parsed.dateEnd)
    if (!Number.isNaN(d.getTime())) {
      fields.dateEnd = d.toISOString()
    }
  }

  if (typeof parsed.description === 'string' && parsed.description.trim()) {
    fields.description = parsed.description.trim().slice(0, 2000)
  }

  if (typeof parsed.contractSum === 'number' && parsed.contractSum > 0) {
    fields.contractSum = Math.round(parsed.contractSum)
  }

  if (typeof parsed.waitDeposit === 'boolean') {
    fields.waitDeposit = parsed.waitDeposit
  }

  if (typeof parsed.depositExpectedAmount === 'number' && parsed.depositExpectedAmount > 0) {
    fields.depositExpectedAmount = Math.round(parsed.depositExpectedAmount)
  }

  if (typeof parsed.isByContract === 'boolean') {
    fields.isByContract = parsed.isByContract
  }

  if (typeof parsed.financeComment === 'string' && parsed.financeComment.trim()) {
    fields.financeComment = parsed.financeComment.trim().slice(0, 500)
  }

  // address
  if (parsed.address && typeof parsed.address === 'object') {
    const addr = {}
    if (typeof parsed.address.town === 'string') addr.town = parsed.address.town.trim()
    if (typeof parsed.address.street === 'string') addr.street = parsed.address.street.trim()
    if (typeof parsed.address.house === 'string') addr.house = parsed.address.house.trim()
    if (typeof parsed.address.comment === 'string') addr.comment = parsed.address.comment.trim()
    if (Object.keys(addr).length > 0) fields.address = addr
  }

  // clientId validation
  if (typeof parsed.clientId === 'string' && parsed.clientId.trim()) {
    const validIds = clientNames.map((c) => c.id)
    if (validIds.includes(parsed.clientId)) {
      fields.clientId = parsed.clientId
    }
  }

  if (typeof parsed.clientName === 'string' && parsed.clientName.trim()) {
    fields.clientName = parsed.clientName.trim().slice(0, 100)
  }

  if (Array.isArray(parsed.servicesIds)) {
    const allowedIds = new Set(validServiceIds)
    const servicesIds = Array.from(
      new Set(
        parsed.servicesIds
          .map((value) => String(value ?? '').trim())
          .filter((value) => allowedIds.has(value))
      )
    )
    if (servicesIds.length > 0) fields.servicesIds = servicesIds
  }

  return fields
}
