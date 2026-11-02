import News from '@models/News'
import Users from '@models/Users'
import { getNewsContentHtml } from '@helpers/newsRichText.mjs'

export const newsReaderScope = ({ tenantId, user }) => {
  if (!tenantId || !user?._id || user.archive) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return { _id: user._id, tenantId: String(user._id) === String(tenantId) ? { $in: [tenantId, null] } : tenantId, archive: { $ne: true } }
}

export const readUserNews = async context => {
  const user = await Users.findOne(newsReaderScope(context)).select('lastSeenNewsAt').lean()
  if (!user) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  // News is a platform-wide published catalogue, not a tenant's private data.
  const rows = await News.find({ isPublished: true }).sort({ publishedAt: -1 }).limit(50).lean()
  return { lastSeenNewsAt: user.lastSeenNewsAt || null, items: rows.map(row => ({
    _id: String(row._id), title: row.title, version: row.version || '',
    publishedAt: row.publishedAt || row.createdAt || null,
    contentHtml: getNewsContentHtml(row),
  })) }
}

export const markUserNewsSeen = async (context, body, now = new Date()) => {
  const scope = newsReaderScope(context)
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'seenAt')) throw Object.assign(new Error('Некорректная отметка прочтения'), { status: 400 })
  const requested = body.seenAt ? new Date(body.seenAt) : now
  const lastSeenNewsAt = Number.isNaN(requested.getTime()) || requested > now ? now : requested
  const saved = await Users.findOneAndUpdate(scope, { $max: { lastSeenNewsAt } }, { returnDocument: 'after' }).select('lastSeenNewsAt').lean()
  if (!saved) throw Object.assign(new Error('Не авторизован'), { status: 401 })
  return { lastSeenNewsAt: saved.lastSeenNewsAt || null }
}
