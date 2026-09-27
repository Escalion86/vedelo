import { NextResponse } from 'next/server'
import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import bcrypt from 'bcryptjs'
import Events from '@models/Events'
import { applyUserEventStats } from '@helpers/userEventStats'
import { buildRegistrationTrialUserFields } from '@server/registrationTrial'
import { withUserMutationActivity } from '@server/userMutationActivity'

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

export const GET = async () => {
  const { user, tenantId } = await getTenantContext()
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const canManageAllUsers = ['dev', 'admin'].includes(user?.role)
  const query = canManageAllUsers ? {} : { tenantId }
  const users = await Users.find(query).select('-password').lean()
  const userIds = users.map((item) => item?._id).filter(Boolean)
  const eventStats =
    userIds.length > 0
      ? await Events.aggregate([
          { $match: { tenantId: { $in: userIds } } },
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
      : []
  return NextResponse.json(
    {
      success: true,
      data: await withUserMutationActivity(applyUserEventStats(users, eventStats)),
    },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const body = await req.json()
  const { user } = await getTenantContext()
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

  const normalizedPhone = normalizePhone(body.phone)
  const phoneAsNumber = normalizedPhone ? Number(normalizedPhone) : null
  if (normalizedPhone) {
    const phoneQuery = Number.isNaN(phoneAsNumber)
      ? { phone: normalizedPhone }
      : { $or: [{ phone: normalizedPhone }, { phone: phoneAsNumber }] }
    const exists = await Users.findOne(phoneQuery).lean()
    if (exists) {
      return NextResponse.json(
        { success: false, error: 'Телефон уже используется' },
        { status: 409 }
      )
    }
  }

  const payload = {
    ...body,
    phone: normalizedPhone || '',
  }

  if (!payload.tariffId) {
    Object.assign(payload, await buildRegistrationTrialUserFields())
  }

  if (payload.password) {
    payload.password = await bcrypt.hash(payload.password, 10)
  } else {
    delete payload.password
  }

  const created = await Users.create(payload)
  const tenantId = payload.tenantId ?? created._id
  if (!created.tenantId) {
    created.tenantId = tenantId
    await created.save()
  }

  return NextResponse.json(
    {
      success: true,
      data: { ...sanitizeUser(created), eventsCount: 0, requestsCount: 0 },
    },
    { status: 201 }
  )
}
