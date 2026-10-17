import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Users from '@models/Users'
import Tariffs from '@models/Tariffs'
import getRequestContext from '@server/getRequestContext'
import dbConnect from '@server/dbConnect'
import personalTariffs from '@server/personalTariffs'
import { withAiIncludedEstimates } from '@server/aiIncludedEstimate'
import { billingIdentity, canSelectTariff } from '@helpers/personalTariffs.mjs'

const fail = (error, status) =>
  NextResponse.json({ success: false, error }, { status })

const resolve = async (req) => {
  const context = await getRequestContext(req)
  if (!context.user?._id || !context.tenantId)
    return { error: fail('Не авторизован', 401) }
  const id =
    new URL(req.url).searchParams.get('userId') || String(context.user._id)
  const admin = ['admin', 'dev'].includes(context.user.role)
  if (!mongoose.isValidObjectId(id))
    return { error: fail('Пользователь не найден', 400) }
  if (!admin && id !== String(context.user._id))
    return { error: fail('Нет доступа', 403) }
  await dbConnect()
  const target = admin ? await Users.findById(id).lean() : context.user
  if (!target) return { error: fail('Пользователь не найден', 404) }
  const user = await Users.findOne(billingIdentity(target)).lean()
  if (
    !user ||
    (!admin && String(user.tenantId || user._id) !== String(context.tenantId))
  )
    return { error: fail('Нет доступа', 403) }
  return { user, admin }
}

const response = async (user, admin) => {
  const all = await Tariffs.find({}).sort({ price: 1, title: 1 }).lean()
  const tariffs = await withAiIncludedEstimates(
    all.filter((tariff) => admin || canSelectTariff(user, tariff))
  )
  const pending = user.pendingTariffChange
  const pendingTariff = all.find(
    (t) => String(t._id) === String(pending?.tariffId)
  )
  return NextResponse.json(
    {
      success: true,
      data: {
        tariffs,
        allowedTariffIds: user.allowedTariffIds || [],
        tariffId: user.tariffId,
        tariffActiveUntil: user.tariffActiveUntil,
        pendingTariffChange: pending
          ? {
              ...pending,
              title: pendingTariff?.title || 'Тариф недоступен',
              price: pendingTariff?.price ?? null,
            }
          : null,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export const GET = async (req) => {
  const context = await resolve(req)
  if (context.error) return context.error
  return response(context.user, context.admin)
}

export const POST = async (req) => {
  const context = await resolve(req)
  if (context.error) return context.error
  const body = await req.json().catch(() => null)
  if (!body || !['grant', 'schedule', 'cancel'].includes(body.action))
    return fail('Некорректное действие', 400)
  if (
    body.action === 'grant' &&
    (!context.admin || typeof body.enabled !== 'boolean')
  )
    return fail('Нет доступа', 403)
  let tariff = null
  if (body.action !== 'cancel') {
    if (
      typeof body.tariffId !== 'string' ||
      !mongoose.isValidObjectId(body.tariffId)
    )
      return fail('Тариф не найден', 400)
    tariff = await Tariffs.findById(body.tariffId).lean()
    if (!tariff) return fail('Тариф не найден', 404)
  }
  const result =
    body.action === 'cancel'
      ? await personalTariffs.cancel(context.user)
      : await personalTariffs[body.action]({
          ...context,
          tariff,
          enabled: body.enabled,
        })
  if (!result.ok) return fail(result.error, result.status)
  return response(result.user, context.admin)
}
