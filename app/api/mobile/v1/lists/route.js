import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'
import { normalizeMobileStringList } from '@server/mobile/lists'
import { mobileError, mobileSuccess } from '@server/mobile/routeHelpers'
import { sanitizeMobileSettings } from '@server/mobile/settings'

const loadSettings = async (tenantId) => {
  const settings = await SiteSettings.findOne({ tenantId }).lean()
  return sanitizeMobileSettings(settings) || {
    _id: '', syncVersion: 1, towns: [], defaultTown: '', custom: { eventTypes: [] },
  }
}

export const GET = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  await dbConnect()
  return mobileSuccess(await loadSettings(tenantId))
}

export const PUT = async (req) => {
  const { tenantId } = await getRequestContext(req)
  if (!tenantId) return mobileError('UNAUTHORIZED', 'Не авторизован', 401)
  const body = await req.json().catch(() => ({}))
  if (body.towns === undefined && body.eventTypes === undefined) {
    return mobileError('LISTS_REQUIRED', 'Не переданы пользовательские списки', 400)
  }
  await dbConnect()
  const update = { $set: { tenantId }, $inc: { syncVersion: 1 } }
  if (body.towns !== undefined) {
    const towns = normalizeMobileStringList(body.towns)
    const requestedDefault = String(body.defaultTown || '').trim()
    update.$set.towns = towns
    update.$set.defaultTown = towns.includes(requestedDefault) ? requestedDefault : ''
  }
  if (body.eventTypes !== undefined) {
    update.$set['custom.eventTypes'] = normalizeMobileStringList(body.eventTypes)
  }
  let settings
  try {
    settings = await SiteSettings.findOneAndUpdate(
      { tenantId, ...(body.eventTypes !== undefined ? { eventTypesEdit: null } : {}) },
      update,
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean()
  } catch (error) {
    if (error.code === 11000 && body.eventTypes !== undefined)
      return mobileError('LISTS_BUSY', 'Сначала завершите изменение типов событий в веб-разделе «Списки»', 409)
    throw error
  }
  return mobileSuccess(sanitizeMobileSettings(settings))
}
