import Events from '@models/Events'
import SiteSettings from '@models/SiteSettings'
import PushReminderLogs from '@models/PushReminderLogs'
import { logPushDelivery } from '@server/pushNotifications'
import { sendMultiChannelPushToTenant } from '@server/multiChannelPush'
import { shouldRunForTenantReminderTime } from '@server/additionalEventsReminderTime'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const DEFAULT_TIME_ZONE = 'Asia/Krasnoyarsk'

const MAX_SUMMARY_ITEMS = 15
const SUMMARY_TAG = 'daily_push_reminder_summary'
const NEXT_24H_HOURS = 24

const toDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getZonedParts = (value, timeZone = DEFAULT_TIME_ZONE) => {
  const date = toDate(value)
  if (!date) return null
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  }
}

const toDateKey = (value, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = getZonedParts(value, timeZone)
  if (!parts) return null
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-')
}

const isSameZonedDay = (dateA, dateB, timeZone = DEFAULT_TIME_ZONE) => {
  const keyA = toDateKey(dateA, timeZone)
  const keyB = toDateKey(dateB, timeZone)
  if (!keyA || !keyB) return false
  return keyA === keyB
}

const canSendForTenant = (siteSettings) => {
  if (!siteSettings) return false
  const custom = siteSettings?.custom
  const readValue = (key) => {
    if (!custom) return undefined
    if (typeof custom.get === 'function') return custom.get(key)
    return custom[key]
  }
  const basePushEnabled = readValue('publicLeadPushEnabled') === true
  const remindersEnabled = readValue('additionalEventsPushEnabled')
  if (!basePushEnabled) return false
  if (remindersEnabled === false) return false
  return true
}

const formatEventLine = ({ title, date, timeZone }) => {
  const dateObj = toDate(date)
  if (!dateObj) return `• ${title}`
  const timeStr = dateObj.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
  const dateStr = dateObj.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
  })
  return `• ${title} — ${dateStr} ${timeStr}`
}

const formatAdditionalEventLine = ({
  eventTitle,
  additionalTitle,
  date,
  isOverdue,
  timeZone,
}) => {
  const workItemTerms = resolveWorkItemTerminology(tenantSettings)
  const dateObj = toDate(date)
  if (isOverdue) {
    return `• ${additionalTitle} — просрочено`
  }
  const timeStr = dateObj
    ? dateObj.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      })
    : '--:--'
  return `• ${additionalTitle} — сегодня ${timeStr}`
}

const buildSummaryPayload = ({
  tenantSettings,
  timeZone = DEFAULT_TIME_ZONE,
  next24hEvents = [],
  needsClosingCount = 0,
  overdueAdditionalEvents = [],
  todayAdditionalEvents = [],
}) => {
  const lines = []
  let totalItems = 0

  // --- Section 1: Events in next 24 hours ---
  if (next24hEvents.length > 0) {
    const displayEvents = next24hEvents.slice(0, MAX_SUMMARY_ITEMS)
    lines.push(`📅 На сегодня: ${next24hEvents.length} ${workItemTerms.pluralGenitive}`)
    for (const item of displayEvents) {
      lines.push(
        formatEventLine({ title: item.title, date: item.date, timeZone })
      )
    }
    if (next24hEvents.length > MAX_SUMMARY_ITEMS) {
      lines.push(`...и ещё ${next24hEvents.length - MAX_SUMMARY_ITEMS}`)
    }
    totalItems += next24hEvents.length
  }

  // --- Section 2: Events needing closure ---
  if (needsClosingCount > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`📋 Закрыть: ${needsClosingCount} ${workItemTerms.pluralGenitive}`)
    totalItems += needsClosingCount
  }

  // --- Section 3: Additional events ---
  const overdueAddCount = overdueAdditionalEvents.length
  const todayAddCount = todayAdditionalEvents.length
  if (overdueAddCount > 0 || todayAddCount > 0) {
    if (lines.length > 0) lines.push('')
    const addParts = []
    if (overdueAddCount > 0) addParts.push(`${overdueAddCount} просрочено`)
    if (todayAddCount > 0) addParts.push(`${todayAddCount} сегодня`)
    lines.push(`📌 Задачи/События: ${addParts.join(', ')}`)

    // Show overdue first, then today's
    const allAddItems = [
      ...overdueAdditionalEvents.map((i) => ({ ...i, isOverdue: true })),
      ...todayAdditionalEvents.map((i) => ({ ...i, isOverdue: false })),
    ]
    const displayAddItems = allAddItems.slice(0, MAX_SUMMARY_ITEMS)
    for (const item of displayAddItems) {
      lines.push(
        formatAdditionalEventLine({
          eventTitle: item.eventTitle,
          additionalTitle: item.additionalTitle,
          date: item.date,
          isOverdue: item.isOverdue,
          timeZone,
        })
      )
    }
    if (allAddItems.length > MAX_SUMMARY_ITEMS) {
      lines.push(`...и ещё ${allAddItems.length - MAX_SUMMARY_ITEMS}`)
    }
    totalItems += allAddItems.length
  }

  // If nothing at all found — return null so we skip sending
  if (totalItems === 0) return null

  const hasOverdue = needsClosingCount > 0 || overdueAddCount > 0
  const title = hasOverdue
    ? `📋 Сводка: ${totalItems} напоминаний`
    : `📋 Напоминания: ${totalItems} ${workItemTerms.pluralGenitive}`

  const body = lines.join('\n')

  return {
    title,
    body,
    icon: '/icons/vedelo-v1/android/android-launchericon-192-192.png',
    badge: '/icons/notification-badge.svg',
    tag: SUMMARY_TAG,
    renotify: false,
    requireInteraction: hasOverdue,
    data: {
      url: '/cabinet/attention',
      type: 'push_reminder_summary',
      totalCount: totalItems,
      needsClosingCount,
      overdueAdditionalCount: overdueAddCount,
      todayAdditionalCount: todayAddCount,
      next24hCount: next24hEvents.length,
    },
  }
}

const sendAdditionalEventsPushReminders = async ({ now = new Date() } = {}) => {
  const nowDate = toDate(now) || new Date()

  // Find all tenants with push enabled
  const siteSettings = await SiteSettings.find({
    'custom.publicLeadPushEnabled': true,
  })
    .select('tenantId custom timeZone')
    .lean()

  const enabledTenantSettings = (siteSettings || []).filter((item) =>
    canSendForTenant(item)
  )
  const scheduledTenantSettings = enabledTenantSettings.filter((item) =>
    shouldRunForTenantReminderTime(item, nowDate)
  )
  const skippedByTime =
    enabledTenantSettings.length - scheduledTenantSettings.length
  const settingsByTenant = new Map(
    scheduledTenantSettings.map((item) => [String(item.tenantId), item])
  )

  if (scheduledTenantSettings.length === 0) {
    return {
      processedEvents: 0,
      dueCandidates: 0,
      sentReminders: 0,
      skippedByDedup: 0,
      skippedByTime,
      failed: 0,
      tenants: enabledTenantSettings.length,
      scheduledTenants: 0,
    }
  }

  const tenantIds = scheduledTenantSettings.map((item) => String(item.tenantId))

  // Load all non-canceled/non-closed events with date info
  const events = await Events.find({
    tenantId: { $in: tenantIds },
    status: { $nin: ['canceled', 'closed'] },
    $or: [
      { eventDate: { $ne: null } },
      { additionalEvents: { $exists: true, $ne: [] } },
    ],
  })
    .select('_id tenantId eventType eventDate additionalEvents status address')
    .lean()

  let dueCandidates = 0
  let sentReminders = 0
  let skippedByDedup = 0
  let failed = 0
  const tenantStats = new Map()

  // Collect due items per tenant for summary push
  const tenantDueItems = new Map()

  const getTenantStats = (tenantId) => {
    const key = String(tenantId)
    if (!tenantStats.has(key)) {
      tenantStats.set(key, {
        processedEvents: 0,
        dueCandidates: 0,
        sentReminders: 0,
        skippedByDedup: 0,
        failed: 0,
      })
    }
    return tenantStats.get(key)
  }

  const getTenantDueItems = (tenantId) => {
    const key = String(tenantId)
    if (!tenantDueItems.has(key)) {
      tenantDueItems.set(key, {
        next24hEvents: [],
        needsClosingCount: 0,
        overdueAdditionalEvents: [],
        todayAdditionalEvents: [],
      })
    }
    return tenantDueItems.get(key)
  }

  const nowMs = nowDate.getTime()
  const next24hMs = nowMs + NEXT_24H_HOURS * 60 * 60 * 1000

  for (const event of events) {
    const tenantSettings = settingsByTenant.get(String(event.tenantId))
    if (!tenantSettings) continue
    const timeZone = tenantSettings?.timeZone || DEFAULT_TIME_ZONE
    const stats = getTenantStats(event.tenantId)
    const dueItems = getTenantDueItems(event.tenantId)
    stats.processedEvents += 1

    const workItemTerms = resolveWorkItemTerminology(tenantSettings)
    const eventTitle =
      String(event?.eventType || workItemTerms.labelCapitalized).trim() ||
      workItemTerms.labelCapitalized

    // --- Main event date analysis ---
    if (event.eventDate) {
      const mainDate = toDate(event.eventDate)
      if (mainDate) {
        const mainMs = mainDate.getTime()

        // 1) Events in next 24 hours
        if (mainMs >= nowMs && mainMs <= next24hMs) {
          dueCandidates += 1
          stats.dueCandidates += 1
          dueItems.next24hEvents.push({
            eventId: String(event._id),
            title: eventTitle,
            date: mainDate,
          })
        }

        // 2) Events that need closing (past date, still active)
        if (mainMs < nowMs && event.status === 'active') {
          dueCandidates += 1
          stats.dueCandidates += 1
          dueItems.needsClosingCount += 1
        }
      }
    }

    // --- Additional events analysis ---
    const additionalEvents = Array.isArray(event?.additionalEvents)
      ? event.additionalEvents
      : []

    for (let index = 0; index < additionalEvents.length; index += 1) {
      const item = additionalEvents[index]
      if (!item || item.done === true) continue
      const date = toDate(item?.date)
      if (!date) continue

      const dateMs = date.getTime()

      // Overdue additional events
      if (dateMs < nowMs) {
        dueCandidates += 1
        stats.dueCandidates += 1
        dueItems.overdueAdditionalEvents.push({
          eventId: String(event._id),
          eventTitle,
          additionalTitle:
            String(item?.title || 'Задача').trim() || 'Задача',
          date,
        })
        continue
      }

      // Additional events for today (same calendar day)
      if (isSameZonedDay(date, nowDate, timeZone)) {
        dueCandidates += 1
        stats.dueCandidates += 1
        dueItems.todayAdditionalEvents.push({
          eventId: String(event._id),
          eventTitle,
          additionalTitle:
            String(item?.title || 'Задача').trim() || 'Задача',
          date,
        })
      }
    }
  }

  // Dedup check: have we already sent a summary today for this tenant?
  const todayKey = toDateKey(nowDate)

  // Send one summary push per tenant
  for (const [tenantId, dueItems] of tenantDueItems) {
    const tenantSettings = settingsByTenant.get(tenantId)
    const timeZone = tenantSettings?.timeZone || DEFAULT_TIME_ZONE

    const hasItems =
      dueItems.next24hEvents.length > 0 ||
      dueItems.needsClosingCount > 0 ||
      dueItems.overdueAdditionalEvents.length > 0 ||
      dueItems.todayAdditionalEvents.length > 0

    if (!hasItems) continue

    // Dedup: check if summary already sent today for this tenant
    const dedupKey = {
      tenantId,
      reminderType: 'summary',
      dateKey: todayKey,
    }

    const alreadySent = await PushReminderLogs.findOne(dedupKey).lean()
    if (alreadySent) {
      skippedByDedup += 1
      const stats = getTenantStats(tenantId)
      stats.skippedByDedup += 1
      continue
    }

    const payload = buildSummaryPayload({
      tenantSettings,
      timeZone,
      ...dueItems,
    })

    if (!payload) {
      // Nothing to show — skip
      continue
    }

    // Mark as sent BEFORE sending to avoid duplicates on retry
    await PushReminderLogs.create({
      ...dedupKey,
      sentAt: new Date(),
    })
    sentReminders += 1
    const stats = getTenantStats(tenantId)
    stats.sentReminders += 1

    const result = await sendMultiChannelPushToTenant({
      tenantId,
      payload,
      source: 'push_reminder_summary',
    })

    if (!result?.ok) {
      failed += 1
      stats.failed += 1
    }
  }

  for (const [tenantId, stats] of tenantStats) {
    await logPushDelivery({
      tenantId,
      source: 'push_reminder_summary',
      eventType: 'summary',
      status: stats.failed > 0 ? 'partial' : 'ok',
      payloadType: 'push_reminder',
      sent: stats.sentReminders,
      failed: stats.failed,
      message: `Итого: кандидатов ${stats.dueCandidates}, собрано в сводку ${stats.sentReminders}, дублей ${stats.skippedByDedup}, ошибок ${stats.failed}`,
      meta: stats,
    })
  }

  return {
    processedEvents: events.length,
    dueCandidates,
    sentReminders,
    skippedByDedup,
    skippedByTime,
    failed,
    tenants: enabledTenantSettings.length,
    scheduledTenants: scheduledTenantSettings.length,
  }
}

export { sendAdditionalEventsPushReminders }
