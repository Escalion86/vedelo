import mongoose from 'mongoose'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Calls from '@models/Calls'
import Services from '@models/Services'
import SiteSettings from '@models/SiteSettings'
import { analyzeCallTranscript } from '@server/callAiAnalysis'
import { transcribeCallRecording } from '@server/callTranscription'
import {
  getAiBalanceErrorMessage,
  isAiBalanceError,
} from '@server/aiBilling'
import { getTenantAiSettings } from '@server/aiSettings'

const DEFAULT_CALL_ADDRESS = Object.freeze({
  town: '',
  street: '',
  house: '',
  entrance: '',
  floor: '',
  flat: '',
  comment: '',
  latitude: '',
  longitude: '',
  link2Gis: '',
  linkYandexNavigator: '',
  link2GisShow: true,
  linkYandexShow: true,
})

export const normalizePhoneDigits = (phone) =>
  String(phone ?? '').replace(/[^\d]/g, '')

export const normalizeRuPhone = (phone) => {
  const digits = normalizePhoneDigits(phone)
  if (!digits) return ''
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

export const normalizeCallDirection = (direction) => {
  if (direction === 'incoming' || direction === 'outgoing') return direction
  return 'unknown'
}

export const normalizeCallStatus = (status) => {
  const allowed = new Set([
    'new',
    'processing',
    'ready',
    'linked',
    'ignored',
    'failed',
  ])
  return allowed.has(status) ? status : 'new'
}

export const parseOptionalDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const parseOptionalNumber = (value, fallback = 0) => {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return number
}

const normalizeObjectId = (value) => {
  if (!value) return null
  const stringValue = String(value)
  return mongoose.Types.ObjectId.isValid(stringValue) ? stringValue : null
}

const getSiteSettingsCustomValue = (siteSettings, key) => {
  const custom = siteSettings?.custom
  if (!custom) return undefined
  if (custom instanceof Map) return custom.get(key)
  return custom[key]
}

const normalizeStringList = (items) =>
  Array.isArray(items)
    ? items
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : []

const getExistingEventTypes = async (tenantId) => {
  if (!tenantId) return []
  const siteSettings = await SiteSettings.findOne({ tenantId })
    .select('custom')
    .lean()
  return normalizeStringList(getSiteSettingsCustomValue(siteSettings, 'eventTypes'))
}

const matchExistingEventType = (value, eventTypes) => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''
  const lowerNormalized = normalized.toLowerCase()
  return (
    eventTypes.find((item) => item.toLowerCase() === lowerNormalized) || ''
  )
}

export const findClientByCallPhone = async (tenantId, normalizedPhone) => {
  if (!tenantId || !normalizedPhone) return null
  const phoneAsNumber = Number(normalizedPhone)
  const phoneQuery = Number.isNaN(phoneAsNumber)
    ? { phone: normalizedPhone }
    : {
        $or: [
          { phone: normalizedPhone },
          { phone: phoneAsNumber },
          { whatsapp: normalizedPhone },
          { whatsapp: phoneAsNumber },
        ],
      }
  return Clients.findOne({ tenantId, ...phoneQuery }).lean()
}

export const ensureClientForCall = async (call, tenantId) => {
  if (!tenantId || !call) return null
  const linkedClientId = normalizeObjectId(call.linkedClientId)
  if (linkedClientId) {
    return Clients.findOne({ _id: linkedClientId, tenantId }).lean()
  }

  const normalizedPhone = normalizeRuPhone(call.normalizedPhone || call.phone)
  const existing = await findClientByCallPhone(tenantId, normalizedPhone)
  if (existing?._id) {
    await Calls.updateOne(
      { _id: call._id, tenantId },
      { $set: { linkedClientId: existing._id } }
    )
    return existing
  }

  if (!normalizedPhone) return null

  const fields = call.aiExtractedFields ?? {}
  const nameParts = String(fields.clientName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const client = await Clients.create({
    tenantId,
    firstName: nameParts[0] || '',
    secondName: nameParts.slice(1).join(' '),
    phone: Number(normalizedPhone),
    whatsapp: Number(normalizedPhone),
    clientType: 'none',
    preferredContactChannel: 'phone',
    comment: 'Клиент создан автоматически из звонка Novofon',
  })

  await Calls.updateOne(
    { _id: call._id, tenantId },
    { $set: { linkedClientId: client._id } }
  )

  return client.toJSON()
}

export const normalizeCallInput = async (body, tenantId) => {
  const normalizedPhone = normalizeRuPhone(body?.phone)
  const linkedClientId = normalizeObjectId(body?.linkedClientId)
  const linkedEventId = normalizeObjectId(body?.linkedEventId)
  const matchedClient =
    linkedClientId || !normalizedPhone
      ? null
      : await findClientByCallPhone(tenantId, normalizedPhone)

  return {
    provider: String(body?.provider || 'manual').trim() || 'manual',
    providerCallId: String(body?.providerCallId || '').trim(),
    direction: normalizeCallDirection(body?.direction),
    phone: String(body?.phone || '').trim(),
    normalizedPhone,
    startedAt: parseOptionalDate(body?.startedAt) ?? new Date(),
    endedAt: parseOptionalDate(body?.endedAt),
    durationSec: Math.max(0, parseOptionalNumber(body?.durationSec, 0)),
    status: normalizeCallStatus(body?.status),
    recordingUrl: String(body?.recordingUrl || '').trim(),
    recordingStorageKey: String(body?.recordingStorageKey || '').trim(),
    recordingExpiresAt: parseOptionalDate(body?.recordingExpiresAt),
    transcript: String(body?.transcript || '').trim(),
    linkedClientId: linkedClientId ?? matchedClient?._id ?? null,
    linkedEventId,
  }
}

export const buildEventDraftFromCall = async (call, tenantId) => {
  const fields = call?.aiExtractedFields ?? {}
  const linkedClientId = normalizeObjectId(call?.linkedClientId)
  const linkedEventId = normalizeObjectId(call?.linkedEventId)
  const linkedEvent = linkedEventId
    ? await Events.findOne({ _id: linkedEventId, tenantId }).lean()
    : null
  const [eventTypes, services] = await Promise.all([
    getExistingEventTypes(tenantId),
    Services.find({ tenantId }).select('_id title').lean(),
  ])
  const eventType =
    matchExistingEventType(fields?.eventType, eventTypes) ||
    matchExistingEventType(linkedEvent?.eventType, eventTypes)

  const additionalEvents = []
  if (fields?.nextContactAt) {
    additionalEvents.push({
      title: 'Следующий контакт',
      description:
        fields.nextContactReason ||
        'Напоминание предложено по итогам телефонного разговора',
      date: fields.nextContactAt,
      done: false,
      googleCalendarEventId: '',
    })
  }

  const summaryParts = [
    call?.aiSummary ? `AI-резюме звонка:\n${call.aiSummary}` : '',
    call?.transcript ? `\nTranscript:\n${call.transcript}` : '',
  ].filter(Boolean)

  const normalizedServiceTitles = normalizeStringList(
    fields?.serviceTitles
  ).map((title) => title.toLowerCase())
  const servicesIds = services
    .filter((service) =>
      normalizedServiceTitles.includes(
        String(service?.title || '').toLowerCase()
      )
    )
    .map((service) => String(service._id))

  const aiFilledFields = [
    fields?.eventDate ? 'eventDate' : '',
    fields?.dateEnd ? 'dateEnd' : '',
    fields?.eventCity || fields?.eventLocation ? 'address' : '',
    fields?.budget !== null && fields?.budget !== undefined
      ? 'contractSum'
      : '',
    eventType ? 'eventType' : '',
    fields?.waitDeposit ? 'waitDeposit' : '',
    fields?.depositDueAt ? 'depositDueAt' : '',
    fields?.depositExpectedAmount ? 'depositExpectedAmount' : '',
    servicesIds.length ? 'servicesIds' : '',
    summaryParts.length ? 'description' : '',
  ].filter(Boolean)

  return {
    clientId: linkedClientId,
    status: 'draft',
    requestCreatedAt: call?.startedAt ?? new Date(),
    eventDate: fields?.eventDate ?? null,
    dateEnd: fields?.dateEnd ?? null,
    address: {
      ...DEFAULT_CALL_ADDRESS,
      town: fields?.eventCity ?? '',
      comment: fields?.eventLocation ?? '',
    },
    contractSum: fields?.budget ?? 0,
    waitDeposit: Boolean(fields?.waitDeposit),
    depositDueAt: fields?.depositDueAt ?? null,
    depositExpectedAmount: fields?.depositExpectedAmount ?? null,
    servicesIds,
    eventType,
    description: summaryParts.join('\n').trim(),
    financeComment: fields?.budget
      ? `Бюджет из разговора: ${fields.budget}`
      : '',
    additionalEvents,
    sourceCallId: call?._id ?? null,
    aiFilledFields,
  }
}

export const processCallRecording = async (callId, tenantId) => {
  const call = await Calls.findOne({ _id: callId, tenantId }).lean()
  if (!call) throw new Error('CALL_NOT_FOUND')
  if (!call.recordingUrl) throw new Error('RECORDING_URL_REQUIRED')

  await Calls.findOneAndUpdate(
    { _id: callId, tenantId },
    { status: 'processing', processingError: '' }
  )

  try {
    const [aiSettings, services] = await Promise.all([
      getTenantAiSettings(tenantId),
      Services.find({ tenantId }).select('title').lean(),
    ])
    aiSettings.services = services
      .map((service) => service.title)
      .filter(Boolean)
    const groupId = `call:${callId}`
    const { transcript, provider: transcriptionProvider, model: transcriptionModel } = await transcribeCallRecording(
      call.recordingUrl,
      aiSettings,
      { feature: 'call_transcription', groupId, includeProvider: true }
    )
    await Calls.findOneAndUpdate(
      { _id: callId, tenantId },
      { transcript, transcriptionProvider, transcriptionModel, status: 'processing', processingError: '' }
    )
    const analysis = await analyzeCallTranscript(transcript, aiSettings, {
      feature: 'call_analysis',
      groupId,
      referenceDate: call.startedAt ?? new Date(),
    })
    return Calls.findOneAndUpdate(
      { _id: callId, tenantId },
      {
        status: 'ready',
        transcript,
        aiSummary: analysis.summary,
        aiExtractedFields: analysis.extractedFields,
        analysisProvider: analysis.provider || '',
        analysisModel: analysis.model || '',
        processingError: '',
      },
      { returnDocument: 'after' }
    ).lean()
  } catch (error) {
    await Calls.findOneAndUpdate(
      { _id: callId, tenantId },
      {
        status: 'failed',
        processingError:
          isAiBalanceError(error)
            ? getAiBalanceErrorMessage(error)
            : error?.message === 'TRANSCRIPTION_API_KEY_REQUIRED'
            ? 'Не настроен провайдер распознавания аудио'
            : 'Не удалось распознать запись звонка',
      }
    )
    throw error
  }
}
