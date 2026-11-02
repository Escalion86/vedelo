import { NextResponse } from 'next/server'
import AiUsage from '@models/AiUsage'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Services from '@models/Services'
import SiteSettings from '@models/SiteSettings'
import { parseGoogleEvent } from '@helpers/googleCalendarParsers'
import {
  chooseGoogleImportAddress,
  getGoogleImportDates,
  getGoogleImportEstimateRub,
  getGoogleImportSourceText,
  GOOGLE_IMPORT_BATCH_SIZE,
  GOOGLE_IMPORT_MAX_EVENTS,
  isGoogleImportCanceled,
  normalizeGoogleImportAiFields,
  normalizeGoogleImportRange,
  serializeGoogleImportCandidate,
} from '@helpers/googleCalendarImport.mjs'
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
import { applyAiEventDraftHints } from '@helpers/aiEventDraftHints.mjs'
import dbConnect from '@server/dbConnect'
import { recordActivityHistory } from '@server/activityHistory'
import { getTenantAiSettings } from '@server/aiSettings'
import {
  getAiBalanceErrorMessage,
  getPlatformAiAccessQuote,
  isAiBalanceError,
} from '@server/aiBilling'
import {
  getAiAnalysisProviderConfig,
  requestAiChatCompletion,
} from '@server/aiChatCompletion'
import { listCalendarEvents } from '@server/googleCalendarClient'
import {
  getUserImportCalendarClient,
  getUserImportCalendarId,
  normalizeImportCalendarSettings,
} from '@server/googleUserCalendarClient'
import { getGoogleImportContext } from '@server/googleImportContext'
import { withGoogleImportOperation } from '@server/googleImportOperation'
import getUserTariffAccess from '@server/getUserTariffAccess'

export const runtime = 'nodejs'

const AI_EVENT_FIELDS = new Set([
  'eventType',
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

const getImportAccess = async (req) => {
  const { tenantId, user } = await getGoogleImportContext(req)
  if (!tenantId || !user?._id) {
    return { error: 'Не авторизован', status: 401 }
  }
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowCalendarSync || !access?.allowAi) {
    return {
      error: 'Импорт Google Calendar доступен только в тарифе с календарём и ИИ',
      status: 403,
    }
  }
  const settings = normalizeImportCalendarSettings(user)
  if (!settings.refreshToken) {
    return { error: 'Google Calendar не подключен', status: 400 }
  }
  const importCalendarId = getUserImportCalendarId(user)
  if (!importCalendarId) {
    return { error: 'Календарь для импорта не выбран', status: 400 }
  }
  const calendar = getUserImportCalendarClient(user)
  if (!calendar) {
    return { error: 'Не удалось подключиться к Google Calendar', status: 500 }
  }
  return {
    tenantId,
    user,
    access,
    calendar,
    calendarId: importCalendarId,
    calendarName: settings.calendarName || '',
  }
}

const parseJsonContent = (content) => {
  try {
    return JSON.parse(content)
  } catch {
    const match = String(content ?? '').match(/```(?:json)?\s*([\s\S]*?)```/)
    if (!match) return null
    try {
      return JSON.parse(match[1].trim())
    } catch {
      return null
    }
  }
}

const normalizeWarnings = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => typeof item === 'string' && item.trim())
        .map((item) => item.trim().slice(0, 240))
        .slice(0, 3)
    : []

const getVerifiedClientName = (value, sourceText) => {
  const name = String(value ?? '').trim()
  if (!name) return ''
  const source = String(sourceText ?? '').toLocaleLowerCase('ru-RU')
  return name
    .split(/\s+/)
    .some((part) => part.length > 2 && source.includes(part.toLocaleLowerCase('ru-RU')))
    ? name
    : ''
}

const buildAiPrompt = ({ services, clients, hasGoogleLocation }) => `Ты разбираешь описание события Google Calendar для CRM артиста.
Верни только JSON. Извлекай только данные, явно присутствующие в названии или описании.
Дата и время всегда берутся из Google Calendar, поэтому не возвращай eventDate и dateEnd.
${hasGoogleLocation ? 'У события заполнена Google-локация: не возвращай address.' : 'Если в тексте есть адрес, верни address.'}
Разрешённые поля: eventType, description, contractSum, waitDeposit, depositExpectedAmount, isByContract, financeComment, address, clientId, clientName, clientPhone, clientWhatsapp, clientViber, clientEmail, clientTelegram, clientInstagram, clientVk, servicesIds, warnings.
Суммы извлекай только при явном денежном контексте. Числа дома, даты и телефоны не являются суммами.
description содержит только важный остаток, не продублированный в других полях.
warnings добавляй только при реальной неоднозначности или противоречии.
Если подходят несколько клиентов, не возвращай clientId.
servicesIds может содержать только ID из списка.

Услуги:
${services.map((item) => `- ${item._id}: ${item.title}`).join('\n')}

Клиенты:
${clients
  .map(
    (item) =>
      `- ${item._id}: ${[item.firstName, item.secondName, item.thirdName]
        .filter(Boolean)
        .join(' ')}`
  )
  .join('\n')}`

const analyzeCalendarItem = async ({
  item,
  services,
  clients,
  aiSettings,
  timeZone,
  groupId,
  operationId,
  skipAi = false,
}) => {
  const sourceText = getGoogleImportSourceText(item)
  const validServiceIds = services.map((service) => String(service._id))
  let parsed = null
  let providerUnavailable = false

  if (!skipAi && String(item?.description ?? '').trim()) {
    const completion = await requestAiChatCompletion({
      settings: aiSettings,
      feature: 'calendar_import',
      groupId,
      operationId,
      timeoutMs: 45_000,
      messages: [
        {
          role: 'system',
          content: buildAiPrompt({
            services,
            clients,
            hasGoogleLocation: Boolean(String(item?.location ?? '').trim()),
          }),
        },
        { role: 'user', content: sourceText },
      ],
      temperature: 0.1,
      maxTokens: 800,
    })
    if (completion) parsed = parseJsonContent(completion.content)
    else providerUnavailable = true
  }

  let fields = normalizeGoogleImportAiFields(parsed, validServiceIds)
  fields = applyAiEventDraftHints(fields, sourceText, { timeZone })
  delete fields.eventDate
  delete fields.dateEnd
  if (String(item?.location ?? '').trim()) delete fields.address

  const deterministicServiceIds = matchAiServiceIds(sourceText, services)
  const servicesIds = Array.from(
    new Set([...(fields.servicesIds ?? []), ...deterministicServiceIds])
  )
  if (servicesIds.length > 0) fields.servicesIds = servicesIds

  const warnings = normalizeWarnings(parsed?.warnings)
  if (skipAi) {
    warnings.push('Предыдущий ответ ИИ не сохранён. Повторный платный разбор не запускался. Проверьте поля вручную.')
  } else if (providerUnavailable) {
    warnings.push('ИИ-провайдер недоступен: импортированы только данные Google Calendar.')
  } else if (item?.description && !parsed) {
    warnings.push('ИИ не смог разобрать описание. Проверьте мероприятие вручную.')
  }

  return { fields, warnings, sourceText, parsed }
}

const resolveClient = async ({
  tenantId,
  req,
  context,
  batchId,
  clients,
  sourceText,
  fields,
  parsed,
  warnings,
  clientId,
  assertCurrent,
}) => {
  const contacts = keepAiContactsPresentInText(
    mergeAiClientContacts(extractAiClientContacts(sourceText), parsed ?? {}),
    sourceText
  )
  let client = findClientByAiContacts(clients, contacts)
  const nameResolution = resolveAiClientByName(clients, sourceText)

  if (!client && nameResolution.client) {
    client = nameResolution.client
  } else if (!client && nameResolution.ambiguous) {
    const names = nameResolution.candidates
      .map(formatAiClientName)
      .filter(Boolean)
      .slice(0, 3)
    warnings.push(
      `Не удалось однозначно определить клиента: подходят ${names.join(', ')}. Выберите клиента вручную.`
    )
  } else if (!client && fields.clientId) {
    client = clients.find(
      (item) => String(item._id) === String(fields.clientId)
    )
  }

  if (!client && !nameResolution.ambiguous && hasAiClientContacts(contacts)) {
    await assertCurrent()
    client = await Clients.findOneAndUpdate({ _id: clientId, tenantId }, { $setOnInsert: {
      ...buildAiClientPayload({
        clientName: getVerifiedClientName(fields.clientName, sourceText),
        contacts,
      }),
      tenantId,
    } }, { upsert: true, returnDocument: 'after', runValidators: true })
    clients.push(client.toObject())
    await recordActivityHistory({
      req,
      context,
      entityType: 'client',
      entityId: client._id,
      operation: 'create',
      after: client.toJSON(),
      source: 'google_import',
      batchId,
    })
  }

  if (client?._id) fields.clientId = String(client._id)
  else delete fields.clientId
  return client
}

const getActualImportCost = async (tenantId, groupId) => {
  if (!groupId) return 0
  const rows = await AiUsage.find({
    tenantId,
    groupId,
    source: 'platform',
    status: 'succeeded',
  })
    .select('chargedKopecks')
    .lean()
  return (
    rows.reduce((sum, item) => sum + Number(item.chargedKopecks || 0), 0) /
    100
  )
}

export const GET = async (req) => {
  try {
    const context = await getImportAccess(req)
    if (context.error) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status }
      )
    }
    const url = new URL(req.url)
    const range = normalizeGoogleImportRange(
      url.searchParams.get('timeMin'),
      url.searchParams.get('timeMax')
    )
    await dbConnect()
    const [calendarResult, aiSettings] = await Promise.all([
      listCalendarEvents(context.calendar, {
        calendarId: context.calendarId,
        ...range,
      }),
      getTenantAiSettings(context.tenantId),
    ])
    const items = Array.isArray(calendarResult.items)
      ? calendarResult.items.filter((item) => item?.id && item?.start)
      : []
    const ids = items.map((item) => item.id)
    const existing = ids.length
      ? await Events.find({
          tenantId: context.tenantId,
          googleCalendarCalendarId: context.calendarId,
          googleCalendarId: { $in: ids },
        })
          .select('googleCalendarId')
          .lean()
      : []
    const existingIds = new Set(existing.map((item) => item.googleCalendarId))
    const candidates = items.map((item) =>
      serializeGoogleImportCandidate(item, {
        alreadyImported: existingIds.has(item.id),
      })
    )
    const provider = getAiAnalysisProviderConfig(aiSettings)
    let quote = {
      billingMode: 'user_key',
      costPerEvent: 0,
      balance: null,
      platformConfigured: true,
    }
    if (provider.name === 'artistcrm') {
      const platformQuote = await getPlatformAiAccessQuote({
        tenantId: context.tenantId,
        feature: 'calendar_import',
      })
      quote = {
        billingMode: 'artistcrm',
        costPerEvent: platformQuote.requiredBalanceRub,
        balance: platformQuote.balanceRub,
        platformConfigured: platformQuote.platformConfigured,
      }
    }
    const defaultAiCount = candidates.filter(
      (item) => !item.alreadyImported && !item.canceled && item.needsAi
    ).length
    return NextResponse.json({
      success: true,
      data: {
        calendarId: context.calendarId,
        calendarName: context.calendarName,
        candidates,
        maxEvents: GOOGLE_IMPORT_MAX_EVENTS,
        batchSize: GOOGLE_IMPORT_BATCH_SIZE,
        quote: {
          ...quote,
          estimatedCost: getGoogleImportEstimateRub(
            defaultAiCount,
            quote.costPerEvent
          ),
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Не удалось получить события' },
      { status: 400 }
    )
  }
}

export const POST = async (req) => {
  try {
    const context = await getImportAccess(req)
    if (context.error) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status }
      )
    }
    const body = await req.json().catch(() => ({}))
    if (body.calendarId !== undefined && body.calendarId !== context.calendarId) {
      return NextResponse.json({ success: false, error: 'Календарь для импорта изменился. Обновите список.' }, { status: 409 })
    }
    const range = normalizeGoogleImportRange(body.timeMin, body.timeMax)
    const eventIds = Array.from(
      new Set(
        (Array.isArray(body.eventIds) ? body.eventIds : [])
          .map((item) => String(item ?? '').trim())
          .filter(Boolean)
      )
    )
    if (!eventIds.length) {
      return NextResponse.json(
        { success: false, error: 'Не выбраны мероприятия для импорта' },
        { status: 400 }
      )
    }
    if (eventIds.length > GOOGLE_IMPORT_BATCH_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `За один запрос можно импортировать не более ${GOOGLE_IMPORT_BATCH_SIZE} мероприятий`,
        },
        { status: 400 }
      )
    }

    await dbConnect()
    const groupId = String(body.groupId ?? '').trim().slice(0, 100)
    const calendarResult = await listCalendarEvents(context.calendar, {
      calendarId: context.calendarId,
      ...range,
    })
    const selectedIds = new Set(eventIds)
    const selected = (calendarResult.items ?? []).filter((item) =>
      selectedIds.has(String(item?.id ?? ''))
    )
    const [services, aiSettings, siteSettings] =
      await Promise.all([
        Services.find({ tenantId: context.tenantId })
          .select('_id title description price')
          .lean(),
        getTenantAiSettings(context.tenantId),
        SiteSettings.findOne({ tenantId: context.tenantId })
          .select('timeZone custom.defaultEventDurationMinutes')
          .lean(),
      ])
    const timeZone = siteSettings?.timeZone || 'Asia/Krasnoyarsk'
    const defaultDurationMinutes = Number(
      siteSettings?.custom?.defaultEventDurationMinutes || 60
    )
    const accessLimit =
      Number.isFinite(context.access?.eventsPerMonth) &&
      context.access.eventsPerMonth > 0
        ? context.access.eventsPerMonth
        : null

    const results = []
    const createdEvents = []
    for (const item of selected) {
      if (isGoogleImportCanceled(item)) {
        results.push({ id: item.id, title: item.summary, status: 'canceled' })
        continue
      }

      try {
        await withGoogleImportOperation({ tenantId: context.tenantId, calendarId: context.calendarId, sourceId: item.id }, async operation => {
        // Reload after the tenant lease: another device may have finished while
        // Google was returning the candidate list.
        const existing = await Events.findOne({ tenantId: context.tenantId, googleCalendarCalendarId: context.calendarId, googleCalendarId: item.id }).select('_id').lean()
        if (existing || operation.row.completed) {
          if (existing && !operation.row.completed) await operation.save({ completed: true, eventId: existing._id, analysis: null })
          results.push({ id: item.id, title: item.summary, status: 'duplicate' })
          return
        }
        const freshClients = await Clients.find({ tenantId: context.tenantId }).lean()
        const dates = getGoogleImportDates(item, { timeZone, defaultDurationMinutes })
        if (!dates.eventDate) { results.push({ id: item.id, title: item.summary, status: 'invalid_date' }); return }
        if (accessLimit) {
          const now = new Date()
          const count = await Events.countDocuments({ tenantId: context.tenantId, createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1), $lt: new Date(now.getFullYear(), now.getMonth() + 1, 1) } })
          if (count >= accessLimit) { results.push({ id: item.id, title: item.summary, status: 'limit' }); return }
        }
        let analysis = operation.row.analysis
        if (!analysis) {
        await operation.save({ analysisStarted: true })
        try { analysis = await analyzeCalendarItem({
          item,
          services,
          clients: freshClients,
          aiSettings,
          timeZone,
          groupId,
          operationId: operation.analysisOperationId,
          skipAi: operation.row.analysisStarted,
        }) } catch (error) {
          // A definite balance refusal happened before the provider request.
          // Other uncertain failures must never automatically charge again.
          if (isAiBalanceError(error)) await operation.save({ analysisStarted: false, analysisAttempt: (operation.row.analysisAttempt || 0) + 1 })
          throw error
        }
        await operation.save({ analysis })
        }
        const liveContext = await getImportAccess(req)
        if (liveContext.error || String(liveContext.tenantId) !== String(context.tenantId) || String(liveContext.user?._id) !== String(context.user._id) || liveContext.calendarId !== context.calendarId) {
          throw new Error('IMPORT_ACCESS_CHANGED')
        }
        const warnings = [...analysis.warnings]
        const client = await resolveClient({
          tenantId: context.tenantId,
          req,
          context,
          batchId: groupId,
          clients: freshClients,
          sourceText: analysis.sourceText,
          fields: analysis.fields,
          parsed: analysis.parsed,
          warnings,
          clientId: operation.clientId,
          assertCurrent: operation.assertCurrent,
        })
        if (dates.allDay) {
          warnings.push(
            'Событие было на весь день: установлено 12:00. Проверьте время.'
          )
        }
        const calendarParsed = parseGoogleEvent({
          ...item,
          summary: '',
          description: '',
        })
        const fallbackParsed = parseGoogleEvent(item)
        const address = chooseGoogleImportAddress({
          calendarLocation: item.location,
          calendarAddress: calendarParsed.address,
          aiAddress: analysis.fields.address,
          fallbackAddress: fallbackParsed.address,
        })
        const eventType =
          String(analysis.fields.eventType ?? '').trim() || 'Другое'
        const aiFields = Object.keys(analysis.fields).filter((field) =>
          AI_EVENT_FIELDS.has(field)
        )
        await operation.assertCurrent()
        const event = await Events.findOneAndUpdate({ _id: operation.eventId, tenantId: context.tenantId }, { $setOnInsert: {
          tenantId: context.tenantId,
          clientId: client?._id ?? null,
          servicesIds: analysis.fields.servicesIds ?? [],
          description:
            String(analysis.fields.description ?? '').trim() ||
            String(item.description ?? '').trim() ||
            String(item.summary ?? '').trim() ||
            'Импортировано из Google Calendar',
          eventType,
          eventDate: dates.eventDate,
          dateEnd: dates.dateEnd,
          address,
          status: 'draft',
          contractSum: Number(analysis.fields.contractSum || 0),
          waitDeposit: Boolean(analysis.fields.waitDeposit),
          depositExpectedAmount:
            analysis.fields.depositExpectedAmount ?? null,
          isByContract: Boolean(analysis.fields.isByContract),
          financeComment: String(analysis.fields.financeComment ?? ''),
          googleCalendarId: item.id,
          googleCalendarCalendarId: context.calendarId,
          importedFromCalendar: true,
          calendarImportChecked: false,
          calendarImportAiFields: Array.from(new Set(aiFields)),
          calendarImportWarnings: Array.from(new Set(warnings)).slice(0, 5),
          calendarImportBatchId: groupId,
          calendarSyncError: '',
        } }, { upsert: true, returnDocument: 'after', runValidators: true })
        await operation.save({ completed: true, eventId: event._id, analysis: null })
        createdEvents.push(event.toJSON())
        results.push({
          id: item.id,
          eventId: String(event._id),
          title: item.summary,
          status: 'created',
          warnings: event.calendarImportWarnings,
        })
        })
      } catch (error) {
        if (isAiBalanceError(error)) {
          results.push({
            id: item.id,
            title: item.summary,
            status: 'balance_error',
            error: getAiBalanceErrorMessage(error),
          })
          break
        }
        results.push({
          id: item.id,
          title: item.summary,
          status: 'error',
          error: error?.code === 'GOOGLE_IMPORT_BUSY' ? error.message : 'Импорт не завершён. Повторное подтверждение продолжит сохранённый результат без повторного платного разбора.',
        })
      }
    }

    if (createdEvents.length > 0) {
      await Promise.all(
        createdEvents.map((event) =>
          recordActivityHistory({
            req,
            context,
            entityType: 'event',
            entityId: event._id,
            operation: 'create',
            after: event,
            source: 'google_import',
            batchId: groupId,
          })
        )
      )
    }
    return NextResponse.json({
      success: true,
      data: {
        results,
        created: results.filter((item) => item.status === 'created').length,
        skipped: results.filter((item) => item.status !== 'created').length,
        actualCost: await getActualImportCost(context.tenantId, groupId),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Не удалось выполнить импорт' },
      { status: 400 }
    )
  }
}
