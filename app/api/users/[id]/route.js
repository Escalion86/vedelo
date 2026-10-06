import { NextResponse } from 'next/server'
import Users from '@models/Users'
import Histories from '@models/Histories'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import bcrypt from 'bcryptjs'
import { isValidMaxContact, normalizeMaxContactInput } from '@helpers/maxContact'
import Tariffs from '@models/Tariffs'
import Payments from '@models/Payments'
import Events from '@models/Events'
import { applyUserEventStats } from '@helpers/userEventStats'
import { isRegistrationOfferTariff } from '@helpers/tariffAccess'

const addMonths = (date, count) => {
  const next = new Date(date)
  const day = next.getDate()
  next.setMonth(next.getMonth() + count)
  if (next.getDate() < day) {
    next.setDate(0)
  }
  return next
}

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const sanitizeUser = (user) => {
  if (!user) return null
  const data = typeof user.toObject === 'function' ? user.toObject() : user
  const { password, ...rest } = data
  return rest
}

const appendEventStats = async (user) => {
  const sanitized = sanitizeUser(user)
  if (!sanitized?._id) return sanitized

  const eventStats = await Events.aggregate([
    { $match: { tenantId: sanitized._id } },
    {
      $group: {
        _id: { tenantId: '$tenantId', status: '$status' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        tenantId: '$_id.tenantId',
        status: '$_id.status',
        count: 1,
      },
    },
  ])

  return applyUserEventStats([sanitized], eventStats)[0] ?? sanitized
}

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  const { user, tenantId } = await getTenantContext()
  console.log('[users][PUT] start', {
    id,
    userId: user?._id,
    role: user?.role,
    tenantId,
    bodyKeys: Object.keys(body ?? {}),
  })
  if (!user) {
    console.log('[users][PUT] unauthorized')
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  const isAdmin = ['dev', 'admin'].includes(user?.role)
  const isSelf = String(user?._id) === String(id)
  if (!isAdmin && !isSelf) {
    console.log('[users][PUT] forbidden', { isAdmin, isSelf })
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }
  await dbConnect()

  const canManageAllUsers = isAdmin
  const query =
    canManageAllUsers || isSelf ? { _id: id } : { _id: id, tenantId }
  const existing = await Users.findOne(query)
  if (!existing) {
    console.log('[users][PUT] not found', { query })
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const update = {}
  const allowedTariffKeys = ['_id', 'tariffId']
  const bodyKeys = Object.keys(body ?? {})
  const isTariffSelection =
    Object.prototype.hasOwnProperty.call(body, 'tariffId') &&
    bodyKeys.every((key) => allowedTariffKeys.includes(key))

  const applyTariffSelection = async (tariffId, options = {}) => {
    if (!tariffId) {
      return {
        error: NextResponse.json(
          { success: false, error: 'Тариф не найден' },
          { status: 400 }
        ),
      }
    }
    const now = new Date()
    const tariff = await Tariffs.findById(tariffId).lean()
    if (!tariff) {
      return {
        error: NextResponse.json(
          { success: false, error: 'Тариф не найден' },
          { status: 404 }
        ),
      }
    }
    const currentTariff =
      existing.tariffId &&
      existing.tariffActiveUntil &&
      !isRegistrationOfferTariff(existing)
        ? await Tariffs.findById(existing.tariffId).lean()
        : null
    let creditAmount = 0
    const skipCompensation = options?.skipCompensation === true
    if (
      !skipCompensation &&
      currentTariff &&
      Number(currentTariff.price ?? 0) > 0
    ) {
      const activeUntil = new Date(existing.tariffActiveUntil)
      if (!Number.isNaN(activeUntil.getTime()) && activeUntil > now) {
        const periodStart = addMonths(activeUntil, -1)
        const periodMs = activeUntil.getTime() - periodStart.getTime()
        const remainingMs = activeUntil.getTime() - now.getTime()
        if (periodMs > 0 && remainingMs > 0) {
          creditAmount = Math.floor(
            (Number(currentTariff.price ?? 0) * remainingMs) / periodMs
          )
        }
      }
    }
    const price = Number(tariff.price ?? 0)
    const balance = Number(existing.balance ?? 0)
    const availableBalance = balance + creditAmount
    if (price > 0) {
      if (!Number.isFinite(availableBalance) || availableBalance < price) {
        const missing = Math.max(price - (Number.isFinite(availableBalance) ? availableBalance : 0), 0)
        return {
          error: NextResponse.json(
            {
              success: false,
              error: `Недостаточно средств. Не хватает ${missing} руб.`,
            },
            { status: 402 }
          ),
        }
      }
      const nextChargeAt = addMonths(now, 1)
      update.tariffId = tariff._id
      update.balance = availableBalance - price
      update.billingStatus = 'active'
      update.tariffActiveUntil = nextChargeAt
      update.nextChargeAt = nextChargeAt
      if (creditAmount > 0 && currentTariff) {
        await Payments.create({
          userId: existing._id,
          tenantId: existing.tenantId ?? existing._id,
          tariffId: currentTariff._id,
          amount: creditAmount,
          type: 'refund',
          source: 'system',
          comment: `Компенсация за неиспользованный период тарифа "${currentTariff.title}"`,
        })
      }
      const chargeComment = `Оплата тарифа "${tariff.title}"`
      await Payments.create({
        userId: existing._id,
        tenantId: existing.tenantId ?? existing._id,
        tariffId: tariff._id,
        amount: price,
        type: 'charge',
        source: 'system',
        comment: chargeComment,
      })
      return { ok: true }
    }
    update.tariffId = tariff._id
    update.billingStatus = 'active'
    update.tariffActiveUntil = null
    update.nextChargeAt = null
    if (creditAmount > 0 && currentTariff) {
      update.balance = availableBalance
      await Payments.create({
        userId: existing._id,
        tenantId: existing.tenantId ?? existing._id,
        tariffId: currentTariff._id,
        amount: creditAmount,
        type: 'refund',
        source: 'system',
        comment: `Компенсация за неиспользованный период тарифа "${currentTariff.title}"`,
      })
    }
    return { ok: true }
  }

  const allowedSelfKeys = [
    '_id',
    'firstName',
    'secondName',
    'thirdName',
    'email',
    'phone',
    'whatsapp',
    'max',
    'viber',
    'telegram',
    'vk',
    'instagram',
    'images',
    'tariffId',
  ]

  if (isTariffSelection && isSelf) {
    const result = await applyTariffSelection(body.tariffId ?? null)
    if (result?.error) return result.error
  } else if (!isAdmin) {
    const hasOnlyAllowedKeys = bodyKeys.every((key) =>
      allowedSelfKeys.includes(key)
    )
    if (!hasOnlyAllowedKeys) {
      console.log('[users][PUT] forbidden keys', { bodyKeys })
      return NextResponse.json(
        { success: false, error: 'Нет доступа' },
        { status: 403 }
      )
    }
    if (isTariffSelection) {
      const result = await applyTariffSelection(body.tariffId ?? null)
      if (result?.error) return result.error
    } else {
      Object.assign(update, body)
      delete update._id
      if (!existing.tenantId) update.tenantId = existing._id
      if (body.phone !== undefined) {
        const normalizedPhone = normalizePhone(body.phone)
        if (normalizedPhone) {
          const phoneAsNumber = Number(normalizedPhone)
          const phoneQuery = Number.isNaN(phoneAsNumber)
            ? { phone: normalizedPhone }
            : { $or: [{ phone: normalizedPhone }, { phone: phoneAsNumber }] }
          const duplicate = await Users.findOne({
            ...phoneQuery,
            _id: { $ne: existing._id },
          }).lean()
          if (duplicate) {
            console.log('[users][PUT] phone duplicate', { normalizedPhone })
            return NextResponse.json(
              { success: false, error: 'Телефон уже используется' },
              { status: 409 }
            )
          }
        }
        update.phone = normalizedPhone || null
      }
    }
  } else {
    const nextTariffId = body.tariffId ?? null
    const shouldApplyTariff =
      nextTariffId &&
      String(nextTariffId) !== String(existing.tariffId ?? '')
    if (shouldApplyTariff) {
      const result = await applyTariffSelection(nextTariffId, {
        skipCompensation: Boolean(body.skipCompensation),
      })
      if (result?.error) return result.error
    }

    const normalizedPhone =
      body.phone !== undefined ? normalizePhone(body.phone) : null
    if (normalizedPhone) {
      const phoneAsNumber = Number(normalizedPhone)
      const phoneQuery = Number.isNaN(phoneAsNumber)
        ? { phone: normalizedPhone }
        : { $or: [{ phone: normalizedPhone }, { phone: phoneAsNumber }] }
      const duplicate = await Users.findOne({
        ...phoneQuery,
        _id: { $ne: existing._id },
      }).lean()
      if (duplicate) {
        console.log('[users][PUT] phone duplicate (admin)', { normalizedPhone })
        return NextResponse.json(
          { success: false, error: 'Телефон уже используется' },
          { status: 409 }
        )
      }
    }

    Object.assign(update, body)
    delete update._id
    delete update.skipCompensation
    if (normalizedPhone !== null) update.phone = normalizedPhone
    if (update.password) {
      update.password = await bcrypt.hash(update.password, 10)
    } else {
      delete update.password
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'max')) {
    if (typeof body.max !== 'string' || body.max.length > 512 || !isValidMaxContact(body.max)) {
      return NextResponse.json({ success: false, error: 'Введите ссылку MAX или номер телефона' }, { status: 400 })
    }
    update.max = normalizeMaxContactInput(body.max)
  }

  console.log('[users][PUT] update', { query, updateKeys: Object.keys(update) })
  const updated = await Users.findOneAndUpdate(query, update, {
    returnDocument: 'after',
  })
  if (!updated) {
    console.log('[users][PUT] update failed', { query })
  }
  return NextResponse.json(
    { success: true, data: await appendEventStats(updated) },
    { status: 200 }
  )
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const { user, tenantId } = await getTenantContext()
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  if (!['dev', 'admin'].includes(user?.role)) {
    return NextResponse.json(
      { success: false, error: 'Нет доступа' },
      { status: 403 }
    )
  }
  await dbConnect()

  const canManageAllUsers = ['dev', 'admin'].includes(user?.role)
  const query = canManageAllUsers ? { _id: id } : { _id: id, tenantId }
  const deleted = await Users.findOneAndDelete(query)
  if (!deleted) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }
  if (String(deleted.tenantId || deleted._id) === String(deleted._id)) {
    await Histories.deleteMany({ tenantId: deleted._id })
  }
  return NextResponse.json({ success: true }, { status: 200 })
}
