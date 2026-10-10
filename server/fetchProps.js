import Events from '@models/Events'
import SiteSettings from '@models/SiteSettings'
import Clients from '@models/Clients'
import Transactions from '@models/Transactions'
import Services from '@models/Services'
import Users from '@models/Users'
import { withUserMutationActivity } from '@server/userMutationActivity'
import News from '@models/News'
import Tariffs from '@models/Tariffs'
import { withAiIncludedEstimates } from '@server/aiIncludedEstimate'
import dbConnect from './dbConnect'
import mongoose from 'mongoose'
import { applyUserEventStats } from '@helpers/userEventStats'
import { sanitizeTelegramSiteSettings } from '@server/telegramBusiness'

let tenantBackfillApplied = false

const safeErrorPayload = (error) => {
  if (!error) return null
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: typeof error?.stack === 'string' ? error.stack : undefined,
    code: error?.code,
    cause: error?.cause
      ? {
          name: error.cause?.name || 'Error',
          message: error.cause?.message || String(error.cause),
        }
      : undefined,
  }
}

const normalizeObjectId = (value) => {
  const stringValue = value ? String(value) : ''
  return mongoose.Types.ObjectId.isValid(stringValue)
    ? new mongoose.Types.ObjectId(stringValue)
    : null
}

const buildSafeDefaultPayload = (serverDateTime, user, extra = {}) => ({
  loggedUser: JSON.parse(JSON.stringify(user ?? null)),
  clients: [],
  events: [],
  eventsPaging: {
    scope: 'all',
    hasMore: false,
    nextBefore: null,
    limit: 0,
    totalCount: 0,
  },
  siteSettings: {},
  transactions: [],
  news: [],
  services: [],
  tariffs: [],
  users: [],
  serverSettings: JSON.parse(
    JSON.stringify({
      dateTime: serverDateTime,
    })
  ),
  ...extra,
})

const ensureLegacyTenantBackfill = async (tenantObjectId) => {
  if (tenantBackfillApplied) return
  tenantBackfillApplied = true

  await Promise.all([
    Clients.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: tenantObjectId } }
    ),
    Events.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: tenantObjectId } }
    ),
    Transactions.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: tenantObjectId } }
    ),
    Services.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: tenantObjectId } }
    ),
    SiteSettings.updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: tenantObjectId } }
    ),
  ])
}

const PAST_EVENTS_INITIAL_LIMIT = 120
const USER_LIST_PAGES = new Set(['users', 'profile', 'questionnaire', 'dev'])
const EVENTS_PAYLOAD_PAGES = new Set([
  'attention',
  'eventsUpcoming',
  'eventsPast',
  'events',
  'clients',
  'transactions',
  'statistics',
  'export',
  'dev',
])
const CLIENTS_PAYLOAD_PAGES = new Set([
  'attention',
  'eventsUpcoming',
  'eventsPast',
  'events',
  'clients',
  'transactions',
  'statistics',
  'export',
  'dev',
])
const TRANSACTIONS_PAYLOAD_PAGES = new Set([
  'attention',
  'eventsUpcoming',
  'eventsPast',
  'events',
  'clients',
  'transactions',
  'statistics',
  'export',
  'dev',
])
const FULL_TRANSACTIONS_PAGES = new Set([
  'clients',
  'transactions',
  'statistics',
  'export',
  'dev',
])
const SERVICES_PAYLOAD_PAGES = new Set([
  'eventsUpcoming',
  'eventsPast',
  'events',
  'clients',
  'services',
  'transactions',
  'statistics',
  'export',
  'dev',
])

const buildPastCompletionQuery = (cutoffDate) => ({
  $or: [
    { dateEnd: { $lt: cutoffDate } },
    {
      $and: [
        { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
        { eventDate: { $lt: cutoffDate } },
      ],
    },
  ],
})

const buildUpcomingCompletionQuery = (nowDate) => ({
  $or: [
    { dateEnd: { $gte: nowDate } },
    {
      $and: [
        { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
        { eventDate: { $gte: nowDate } },
      ],
    },
    {
      $and: [
        { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
        { $or: [{ eventDate: null }, { eventDate: { $exists: false } }] },
      ],
    },
  ],
})

const buildEventsPayload = async (tenantId, page) => {
  if (!EVENTS_PAYLOAD_PAGES.has(page)) {
    return {
      events: [],
      paging: {
        scope: 'none',
        hasMore: false,
        nextBefore: null,
        limit: 0,
        totalCount: 0,
      },
    }
  }

  const now = new Date()

  if (page === 'eventsPast') {
    const pastBaseQuery = {
      tenantId,
      ...buildPastCompletionQuery(now),
    }
    const [totalCount, rows] = await Promise.all([
      Events.countDocuments(pastBaseQuery),
      Events.find(pastBaseQuery)
        .sort({ dateEnd: -1, eventDate: -1, createdAt: -1 })
        .limit(PAST_EVENTS_INITIAL_LIMIT + 1)
        .lean(),
    ])
    const hasMore = rows.length > PAST_EVENTS_INITIAL_LIMIT
    const items = hasMore ? rows.slice(0, PAST_EVENTS_INITIAL_LIMIT) : rows
    const lastItem = items[items.length - 1]
    return {
      events: items,
      paging: {
        scope: 'past',
        hasMore,
        nextBefore: lastItem?.dateEnd || lastItem?.eventDate
          ? new Date(lastItem.dateEnd ?? lastItem.eventDate).toISOString()
          : null,
        limit: PAST_EVENTS_INITIAL_LIMIT,
        totalCount,
      },
    }
  }

  if (page === 'eventsUpcoming' || page === 'attention') {
    const items = await Events.find({
      tenantId,
      ...buildUpcomingCompletionQuery(now),
    })
      .sort({ eventDate: -1, createdAt: -1 })
      .lean()
    return {
      events: items,
      paging: {
        scope: 'upcoming',
        hasMore: false,
        nextBefore: null,
        limit: 0,
        totalCount: items.length,
      },
    }
  }

  return {
    events: await Events.find({ tenantId }).lean(),
    paging: {
      scope: 'all',
      hasMore: false,
      nextBefore: null,
      limit: 0,
      totalCount: 0,
    },
  }
}

const fetchProps = async (user, page = 'eventsUpcoming') => {
  const serverDateTime = new Date()
  const requestId = `fetchProps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    const db = await dbConnect()
    const tenantId = user?.tenantId || user?._id || null

    if (!tenantId) {
      console.error('[fetchProps] tenantId not resolved', {
        requestId,
        page,
        userId: user?._id ?? null,
        tenantId: user?.tenantId ?? null,
      })
      return buildSafeDefaultPayload(serverDateTime, user, {
        error: { message: 'Не удалось определить пользователя' },
      })
    }

    const tenantObjectId = normalizeObjectId(tenantId)
    if (!tenantObjectId) {
      const safeError = {
        name: 'InvalidTenantId',
        message: 'Некорректный tenantId в сессии пользователя',
      }
      console.error('[fetchProps] invalid tenantId', JSON.stringify({
        requestId,
        page,
        userId: user?._id ?? null,
        tenantId,
        error: safeError,
      }))
      return buildSafeDefaultPayload(serverDateTime, user, {
        error: safeError,
      })
    }

    await ensureLegacyTenantBackfill(tenantObjectId)

    const canManageAllUsers = ['dev', 'admin'].includes(user?.role)
    const shouldFetchUsers =
      USER_LIST_PAGES.has(page) || (page === 'feedback' && canManageAllUsers)
    const shouldFetchClients = CLIENTS_PAYLOAD_PAGES.has(page)
    const shouldFetchTransactions = TRANSACTIONS_PAYLOAD_PAGES.has(page)
    const shouldFetchServices = SERVICES_PAYLOAD_PAGES.has(page)
    const usersQuery = canManageAllUsers ? {} : { tenantId: tenantObjectId }

    const [
      eventsPayload,
      siteSettings,
      tariffs,
      users,
      loggedUser,
      newsList,
    ] = await Promise.all([
      buildEventsPayload(tenantObjectId, page),
      SiteSettings.findOne({ tenantId: tenantObjectId }).lean(),
      Tariffs.find({}).sort({ price: 1, title: 1 }).lean(),
      shouldFetchUsers
        ? Users.find(usersQuery).select('-password').lean()
        : Promise.resolve([]),
      user?._id ? Users.findById(user._id).select('-password').lean() : null,
      News.find({ isPublished: true })
        .sort({ publishedAt: -1 })
        .limit(50)
        .lean(),
    ])

    const eventIds = (eventsPayload.events ?? [])
      .map((event) => event?._id)
      .filter(Boolean)
    const transactionsQuery =
      shouldFetchTransactions && !FULL_TRANSACTIONS_PAGES.has(page)
        ? eventIds.length > 0
          ? { tenantId: tenantObjectId, eventId: { $in: eventIds } }
          : null
        : { tenantId: tenantObjectId }

    const [clients, transactions, services] = await Promise.all([
      shouldFetchClients
        ? Clients.find({ tenantId: tenantObjectId }).select('-password').lean()
        : Promise.resolve([]),
      shouldFetchTransactions && transactionsQuery
        ? Transactions.find(transactionsQuery).lean()
        : Promise.resolve([]),
      shouldFetchServices
        ? Services.find({ tenantId: tenantObjectId }).lean()
        : Promise.resolve([]),
    ])

    const safeLoggedUser = loggedUser ?? user ?? null
    const usersPayload = shouldFetchUsers
      ? users
      : safeLoggedUser
        ? [safeLoggedUser]
        : []
    const userIds = usersPayload.map((item) => item?._id).filter(Boolean)
    const userEventStats =
      shouldFetchUsers && userIds.length > 0
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
    const usersWithEventStats = shouldFetchUsers
      ? await withUserMutationActivity(
          applyUserEventStats(usersPayload, userEventStats)
        )
      : usersPayload

    const fetchResult = {
      loggedUser: JSON.parse(JSON.stringify(safeLoggedUser)),
      clients: JSON.parse(JSON.stringify(clients)),
      events: JSON.parse(JSON.stringify(eventsPayload.events)),
      eventsPaging: JSON.parse(JSON.stringify(eventsPayload.paging)),
      siteSettings: JSON.parse(
        JSON.stringify(sanitizeTelegramSiteSettings(siteSettings ?? {}))
      ),
      transactions: JSON.parse(JSON.stringify(transactions)),
      news: JSON.parse(JSON.stringify(newsList)),
      services: JSON.parse(JSON.stringify(services)),
      tariffs: JSON.parse(
        JSON.stringify(await withAiIncludedEstimates(tariffs))
      ),
      users: JSON.parse(JSON.stringify(usersWithEventStats)),
      serverSettings: JSON.parse(
        JSON.stringify({
          dateTime: serverDateTime,
        })
      ),
    }

    return fetchResult
  } catch (error) {
    const safeError = safeErrorPayload(error)
    console.error('[fetchProps] failed', JSON.stringify({
      requestId,
      page,
      userId: user?._id ?? null,
      tenantId: user?.tenantId ?? null,
      error: safeError,
    }))
    return buildSafeDefaultPayload(serverDateTime, user, {
      error: safeError,
    })
  }
}

export default fetchProps
