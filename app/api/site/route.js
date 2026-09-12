import { NextResponse } from 'next/server'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { getProtectedCustomAccessFailures } from '@server/integrationAccess'
import { sanitizeTelegramSiteSettings } from '@server/telegramBusiness'
import { mergeSiteSettingsCustom } from '@helpers/siteSettingsCustom.mjs'

const normalizeTowns = (towns = []) =>
  Array.from(
    new Set(
      towns
        .map((town) => (typeof town === 'string' ? town.trim() : ''))
        .filter(Boolean)
    )
  )

const normalizeAddress = (address) => {
  if (!address || typeof address !== 'object') return null
  return {
    town: String(address.town ?? '').trim(),
    street: String(address.street ?? '').trim(),
    house: String(address.house ?? '').trim(),
    entrance: String(address.entrance ?? '').trim(),
    floor: String(address.floor ?? '').trim(),
    flat: String(address.flat ?? '').trim(),
    comment: String(address.comment ?? '').trim(),
    link2Gis: String(address.link2Gis ?? '').trim(),
    linkYandexNavigator: String(address.linkYandexNavigator ?? '').trim(),
    latitude: String(address.latitude ?? '').trim(),
    longitude: String(address.longitude ?? '').trim(),
  }
}

const readCustom = (custom, key) =>
  typeof custom?.get === 'function' ? custom.get(key) : custom?.[key]

export const GET = async () => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  return NextResponse.json(
    {
      success: true,
      data: sanitizeTelegramSiteSettings(siteSettings ?? {}),
    },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId, user } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()

  const existingSiteSettings =
    body.custom !== undefined
      ? await SiteSettings.findOne({ tenantId }).lean()
      : null
  if (body.custom !== undefined) {
    const existingCustom = existingSiteSettings?.custom ?? {}
    const normalizedExistingCustom =
      typeof existingCustom?.get === 'function'
        ? Object.fromEntries(existingCustom)
        : existingCustom
    const protectedTelegramKeys = [
      'telegramBusinessBotToken',
      'telegramBusinessWebhookToken',
      'telegramBusinessWebhookSecret',
      'telegramBusinessWebhookUrl',
      'telegramBusinessConnectionId',
      'telegramBusinessAccountUserId',
      'telegramBusinessRights',
    ]
    for (const key of protectedTelegramKeys) {
      if (
        readCustom(body.custom, key) === undefined &&
        normalizedExistingCustom?.[key] !== undefined
      ) {
        body.custom[key] = normalizedExistingCustom[key]
      }
    }
    const nextCustom = mergeSiteSettingsCustom(existingCustom, body.custom)
    const nextProvider = String(
      readCustom(nextCustom, 'aiAnalysisProvider') || ''
    )
      .trim()
      .toLowerCase()
    const previousProvider = String(
      readCustom(existingSiteSettings?.custom, 'aiAnalysisProvider') || ''
    )
      .trim()
      .toLowerCase()
    const previousDeepseekKey = String(
      readCustom(existingSiteSettings?.custom, 'deepseekKey') || ''
    )
    const nextDeepseekKey = String(readCustom(nextCustom, 'deepseekKey') || '')
    if (
      user?.role !== 'dev' &&
      ((nextProvider === 'deepseek' && previousProvider !== 'deepseek') ||
        nextDeepseekKey !== previousDeepseekKey)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Интеграция DeepSeek пока доступна только разработчику',
        },
        { status: 403 }
      )
    }
    const access = await getUserTariffAccess(tenantId)
    const failures = getProtectedCustomAccessFailures({
      existingCustom: existingSiteSettings?.custom,
      nextCustom,
      access,
    })
    if (failures.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Недоступно по тарифу: ${failures.join(', ')}`,
        },
        { status: 403 }
      )
    }
    body.custom = nextCustom
  }

  const update = {}
  if (body.eventsTags !== undefined) update.eventsTags = body.eventsTags ?? []
  if (body.towns !== undefined) update.towns = normalizeTowns(body.towns)
  if (body.defaultTown !== undefined)
    update.defaultTown = body.defaultTown ?? ''
  if (body.custom !== undefined) update.custom = body.custom
  if (body.fabMenu !== undefined) update.fabMenu = body.fabMenu ?? []
  if (body.supervisor !== undefined) update.supervisor = body.supervisor ?? {}
  if (body.dateStartProject !== undefined)
    update.dateStartProject = body.dateStartProject ?? null
  if (body.headerInfo !== undefined) update.headerInfo = body.headerInfo ?? {}
  if (body.codeSendService !== undefined)
    update.codeSendService = body.codeSendService ?? 'telefonip'
  if (body.email !== undefined) update.email = body.email ?? null
  if (body.phone !== undefined) update.phone = body.phone ?? null
  if (body.whatsapp !== undefined) update.whatsapp = body.whatsapp ?? null
  if (body.viber !== undefined) update.viber = body.viber ?? null
  if (body.telegram !== undefined) update.telegram = body.telegram ?? null
  if (body.instagram !== undefined) update.instagram = body.instagram ?? null
  if (body.vk !== undefined) update.vk = body.vk ?? null
  if (body.timeZone !== undefined)
    update.timeZone = body.timeZone ?? 'Asia/Krasnoyarsk'
  if (body.storeCalendarResponse !== undefined)
    update.storeCalendarResponse = Boolean(body.storeCalendarResponse)
  if (body.addresses !== undefined) {
    const rawAddresses = Array.isArray(body.addresses) ? body.addresses : []
    update.addresses = rawAddresses
      .map(normalizeAddress)
      .filter((addr) => addr && (addr.town || addr.street || addr.house))
  }
  if (body.addAddress !== undefined) {
    const newAddress = normalizeAddress(body.addAddress)
    if (
      newAddress &&
      (newAddress.town || newAddress.street || newAddress.house)
    ) {
      const existing = await SiteSettings.findOne({ tenantId }).lean()
      const existingAddresses = Array.isArray(existing?.addresses)
        ? existing.addresses
        : []
      const isDuplicate = existingAddresses.some(
        (addr) =>
          addr.town === newAddress.town &&
          addr.street === newAddress.street &&
          addr.house === newAddress.house
      )
      if (!isDuplicate) {
        await SiteSettings.findOneAndUpdate(
          { tenantId },
          { $push: { addresses: newAddress }, $set: { tenantId } },
          { upsert: true }
        )
        const updated = await SiteSettings.findOne({ tenantId }).lean()
        return NextResponse.json(
          { success: true, data: updated },
          { status: 200 }
        )
      }
    }
  }
  if (body.removeAddress !== undefined) {
    const addressToRemove = normalizeAddress(body.removeAddress)
    if (addressToRemove) {
      await SiteSettings.findOneAndUpdate(
        { tenantId },
        { $pull: { addresses: addressToRemove } }
      )
      const updated = await SiteSettings.findOne({ tenantId }).lean()
      return NextResponse.json(
        { success: true, data: updated },
        { status: 200 }
      )
    }
  }

  const siteSettings = await SiteSettings.findOneAndUpdate(
    { tenantId },
    { $set: { ...update, tenantId } },
    { returnDocument: 'after', upsert: true }
  )

  return NextResponse.json(
    { success: true, data: sanitizeTelegramSiteSettings(siteSettings) },
    { status: 200 }
  )
}
