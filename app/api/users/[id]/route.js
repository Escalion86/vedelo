import { NextResponse } from 'next/server'
import Users from '@models/Users'
import Histories from '@models/Histories'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import bcrypt from 'bcryptjs'
import { isValidMaxContact, normalizeMaxContactInput } from '@helpers/maxContact'
import Tariffs from '@models/Tariffs'
import personalTariffs from '@server/personalTariffs'
import { billingIdentity } from '@helpers/personalTariffs.mjs'
import mongoose from 'mongoose'
import Events from '@models/Events'
import { applyUserEventStats } from '@helpers/userEventStats'
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

import { hasProtectedAuthFields } from '@helpers/protectedAuthFields.mjs'

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  if (hasProtectedAuthFields(body))
    return NextResponse.json({ success: false, error: 'Яндекс ID подключается только через авторизацию' }, { status: 400 })
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
  const query = canManageAllUsers ? { _id: id } : {
    _id: id, $or: [{ tenantId }, { tenantId: null, _id: tenantId }],
  }
  const existing = await Users.findOne(query)
  if (!existing) {
    console.log('[users][PUT] not found', { query })
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const protectedKeys = ['allowedTariffIds', 'pendingTariffChange', 'pendingBillingReceipt', 'billingRevision']
  if (Object.keys(body).some((key) => key.startsWith('$') || key.includes('.') || protectedKeys.includes(key))) {
    return NextResponse.json({ success: false, error: 'Используйте управление доступом к тарифам' }, { status: 400 })
  }
  const update = {}
  const allowedTariffKeys = ['_id', 'tariffId']
  const bodyKeys = Object.keys(body ?? {})
  const isTariffSelection =
    Object.prototype.hasOwnProperty.call(body, 'tariffId') &&
    bodyKeys.every((key) => allowedTariffKeys.includes(key))

  const applyTariffSelection = async (tariffId, options = {}) => {
    if (typeof tariffId !== 'string' || !mongoose.isValidObjectId(tariffId)) {
      return { error: NextResponse.json({ success: false, error: 'Тариф не найден' }, { status: 400 }) }
    }
    const tariff = await Tariffs.findById(tariffId).lean()
    const result = await personalTariffs.change({ user: existing.toObject(), tariff, admin: isAdmin, ...options })
    return result.ok ? {} : { error: NextResponse.json({ success: false, error: result.error }, { status: result.status || 409 }) }
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
    if (shouldApplyTariff) {
      for (const key of ['tariffId', 'balance', 'tariffActiveUntil', 'nextChargeAt', 'billingStatus']) delete update[key]
    }
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
  const updated = await Users.findOneAndUpdate(billingIdentity(existing), update, {
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
