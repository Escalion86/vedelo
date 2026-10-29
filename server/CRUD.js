import { buildGoogleEventDescription, sanitizeToPlainText, isValidDateValue } from '@server/googleEventDescription'
import { isGoogleTasksBeta } from '@helpers/googleTasksBeta.mjs'
import { syncGoogleAdditionalEvents } from '@server/googleAdditionalSync'
import formatAddress from '@helpers/formatAddress'
import Events from '@models/Events'
import Histories from '@models/Histories'
import SiteSettings from '@models/SiteSettings'
import Services from '@models/Services'
import Clients from '@models/Clients'
import Transactions from '@models/Transactions'
import dbConnect from './dbConnect'
// import { DEFAULT_ROLES } from '@helpers/constants'
// import Roles from '@models/Roles'
import mongoose from 'mongoose'
import compareObjectsWithDif from '@helpers/compareObjectsWithDif'
import { NextResponse } from 'next/server'
import {
  getUserCalendarClient,
  getUserCalendarId,
  normalizeCalendarSettings,
} from '@server/googleUserCalendarClient'
import {
  buildGoogleCalendarStatusIconsPrefix,
  shouldSkipGoogleCalendarEventSync,
} from '@helpers/googleCalendarStatusIcons'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'
import { getCanonicalBaseUrl } from '@helpers/brand.mjs'

function isJson(str) {
  try {
    JSON.parse(str)
  } catch (e) {
    return false
  }
  return true
}

// const test_callback = {
//   update_id: 173172137,
//   callback_query: {
//     id: '1121425242543370968',
//     from: {
//       id: 261102161,
//       is_bot: false,
//       first_name: 'Алексей',
//       last_name: 'Белинский Иллюзионист',
//       username: 'Escalion',
//       language_code: 'ru',
//       is_premium: true,
//     },
//     message: {
//       message_id: 91,
//       from: '[Object]',
//       chat: ' [Object]',
//       date: 1683689196,
//       text: 'Неизвестная команда',
//       reply_markup: '[Object]',
//     },
//     chat_instance: '3955131192076482535',
//     data: '/createTeam',
//   },
// }
// const rtest = {
//   body: {
//     update_id: 173172081,
//     message: {
//       message_id: 14,
//       from: {
//         id: 261102161,
//         is_bot: false,
//         first_name: 'Алексей',
//         last_name: 'Белинский Иллюзионист',
//         username: 'Escalion',
//         language_code: 'ru',
//         is_premium: true,
//       },
//       chat: {
//         id: 261102161,
//         first_name: 'Алексей',
//         last_name: 'Белинский Иллюзионист',
//         username: 'Escalion',
//         type: 'private',
//       },
//       date: 1683645745,
//       text: '/new_team',
//       entities: [{ offset: 0, length: 12, type: 'bot_command' }],
//     },
//   },
// }

const DEFAULT_TIME_ZONE = 'Asia/Krasnoyarsk'

const getSiteTimeZone = async (tenantId) => {
  if (!tenantId) return DEFAULT_TIME_ZONE
  await dbConnect()
  const settings = await SiteSettings.findOne({ tenantId })
    .select('timeZone')
    .lean()
  return settings?.timeZone || DEFAULT_TIME_ZONE
}

const getCalendarContext = async (user) => {
  if (!user) return null
  const settings = normalizeCalendarSettings(user)
  if (!settings.refreshToken || !settings.enabled) return null
  const calendar = getUserCalendarClient(user)
  if (!calendar) return null
  return { calendar, calendarId: getUserCalendarId(user) }
}

const addBlankEventToCalendar = async (tenantId, user) => {
  const context = await getCalendarContext(user)
  if (!context) return null
  const { calendar, calendarId } = context
  const timeZone = await getSiteTimeZone(tenantId)
  const settings = normalizeCalendarSettings(user)
  const reminders = settings?.reminders ?? {}
  const calendarReminders = reminders.useDefault
    ? { useDefault: true }
    : { useDefault: false, overrides: reminders.overrides ?? [] }

  const calendarEvent = {
    summary: '[blank]',
    description: '',
    start: {
      dateTime: new Date(),
      timeZone,
    },
    end: {
      dateTime: new Date(),
      timeZone,
    },
    attendees: [],
    reminders: calendarReminders,
  }

  const calendarEventData = await new Promise((resolve, reject) => {
    calendar.events.insert(
      {
        calendarId,
        resource: calendarEvent,
      },
      (error, result) => {
        if (error) {
          console.log({ error })
          reject(error)
          // res.send(JSON.stringify({ error: error }))
        } else {
          if (result) {
            console.log(result)
            resolve(result)
            // res.send(JSON.stringify({ events: result.data.items }))
          } else {
            console.log({ message: 'Что-то пошло не так' })
            reject('Что-то пошло не так')
            // res.send(JSON.stringify({ message: 'No upcoming events found.' }))
          }
        }
      }
    )
  })

  return {
    googleCalendarId: calendarEventData?.data?.id ?? null,
    googleCalendarCalendarId: calendarId,
  }
}

const deleteEventFromCalendar = async (googleCalendarId, calendarId, user) => {
  if (!googleCalendarId) return
  const context = await getCalendarContext(user)
  if (!context) return undefined
  const { calendar } = context
  const calendarIds = Array.from(
    new Set([calendarId, context.calendarId].filter(Boolean))
  )
  if (calendarIds.length === 0) return undefined

  let lastError = null
  for (const effectiveCalendarId of calendarIds) {
    try {
      const calendarEventData = await new Promise((resolve, reject) => {
        calendar.events.delete(
          {
            calendarId: effectiveCalendarId,
            eventId: googleCalendarId,
          },
          (error, result) => {
            if (error) {
              console.log({ error })
              reject(error)
              // res.send(JSON.stringify({ error: error }))
            } else {
              if (result) {
                console.log(result)
                resolve(result)
                // res.send(JSON.stringify({ events: result.data.items }))
              } else {
                console.log({ message: 'Что-то пошло не так' })
                reject('Что-то пошло не так')
                // res.send(JSON.stringify({ message: 'No upcoming events found.' }))
              }
            }
          }
        )
      })

      return calendarEventData
    } catch (error) {
      lastError = error
      if (error?.code !== 404 && error?.code !== 410) throw error
    }
  }

  if (lastError) throw lastError
  return undefined
}

const deleteRelatedEventsFromCalendar = async (eventId, calendarId, user) => {
  if (!eventId) return
  const context = await getCalendarContext(user)
  if (!context) return undefined
  const { calendar } = context
  const calendarIds = Array.from(
    new Set([calendarId, context.calendarId].filter(Boolean))
  )
  if (calendarIds.length === 0) return undefined

  const eventIdText = String(eventId)
  const linkNeedle = `/event/${eventIdText}`
  const deletedIds = new Set()

  for (const effectiveCalendarId of calendarIds) {
    const listResult = await new Promise((resolve, reject) => {
      calendar.events.list(
        {
          calendarId: effectiveCalendarId,
          maxResults: 2500,
          q: eventIdText,
          showDeleted: false,
          singleEvents: true,
          timeMin: '2000-01-01T00:00:00.000Z',
          timeMax: '2100-01-01T00:00:00.000Z',
        },
        (error, result) => {
          if (error) return reject(error)
          return resolve(result)
        }
      )
    })

    const items = Array.isArray(listResult?.data?.items)
      ? listResult.data.items
      : []
    const relatedItems = items.filter((item) => {
      const description =
        typeof item?.description === 'string' ? item.description : ''
      return item?.id && description.includes(linkNeedle)
    })

    for (const item of relatedItems) {
      if (deletedIds.has(item.id)) continue
      try {
        await deleteEventFromCalendar(item.id, effectiveCalendarId, user)
        deletedIds.add(item.id)
      } catch (error) {
        if (error?.code !== 404 && error?.code !== 410) throw error
      }
    }
  }

  return deletedIds.size
}

const updateEventInCalendar = async (
  event,
  req,
  user,
  previousEvent = null
) => {
  if (event?.importedFromFile && event.fileImportChecked !== true) return undefined
  const tasksBeta = isGoogleTasksBeta(user)
  if (tasksBeta && String(event?.tenantId) === String(user.tenantId || user._id)) {
    await syncGoogleAdditionalEvents(user, { eventId: event._id, previousEvent })
  }
  const context = await getCalendarContext(user)
  if (!context) return undefined
  const { calendar, calendarId } = context
  const effectiveCalendarId = event?.googleCalendarCalendarId || calendarId
  const timeZone = await getSiteTimeZone(event?.tenantId)
  const tenantSiteSettings = event?.tenantId
    ? await SiteSettings.findOne({ tenantId: event.tenantId }).select('custom').lean()
    : null
  const workItemTerms = resolveWorkItemTerminology(tenantSiteSettings)
  const previousAdditionalEvents = Array.isArray(
    previousEvent?.additionalEvents
  )
    ? previousEvent.additionalEvents
    : []
  const settings = normalizeCalendarSettings(user)
  const syncSettings = settings?.syncSettings ?? {}

  // calendar.events.list(
  //   {
  //     calendarId: GOOGLE_CALENDAR_ID,
  //     timeMin: new Date().toISOString(),
  //     maxResults: 10,
  //     singleEvents: true,
  //     orderBy: 'startTime',
  //   },
  //   (error, result) => {
  //     if (error) {
  //       console.log({ error })
  //       // res.send(JSON.stringify({ error: error }))
  //     } else {
  //       if (result.data.items.length) {
  //         console.log({ events: result.data.items })
  //         // res.send(JSON.stringify({ events: result.data.items }))
  //       } else {
  //         console.log({ message: 'No upcoming events found.' })
  //         // res.send(JSON.stringify({ message: 'No upcoming events found.' }))
  //       }
  //     }
  //   }
  // )
  const { preparedText, clientName, clientContactLines, colleagueName, colleagueContactLines } =
    await buildGoogleEventDescription(event, syncSettings)

  const rawStart = event.eventDate ?? event.dateEnd ?? null
  const rawEnd =
    event.dateEnd ??
    (rawStart ? new Date(new Date(rawStart).getTime() + 60 * 60 * 1000) : null)
  const startDate = rawStart ? new Date(rawStart) : null
  const endDate = rawEnd ? new Date(rawEnd) : null
  const formatDateTimeInZone = (value, zone) => {
    if (!isValidDateValue(value)) return null
    const parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(value)
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`
  }
  let startDateTime = formatDateTimeInZone(startDate, timeZone)
  let endDateTime = formatDateTimeInZone(endDate, timeZone)
  if (startDateTime && isValidDateValue(startDate)) {
    const startMs = startDate.getTime()
    const endMs = isValidDateValue(endDate) ? endDate.getTime() : NaN
    if (!Number.isFinite(endMs) || endMs <= startMs) {
      endDateTime = formatDateTimeInZone(
        new Date(startMs + 60 * 60 * 1000),
        timeZone
      )
    }
  }
  console.log('Google Calendar event time', {
    eventId: event?._id,
    rawStart,
    rawEnd,
    startDateTime,
    endDateTime,
  })
  const calendarLocation = formatAddress(event.address, event.location)
  const eventTypeTitle =
    typeof event?.eventType === 'string' ? event.eventType.trim() : ''
  let servicesTitle = ''
  if (Array.isArray(event?.servicesIds) && event.servicesIds.length > 0) {
    const services = await Services.find({
      _id: { $in: event.servicesIds },
      tenantId: event?.tenantId,
    })
      .select('title')
      .lean()
    servicesTitle = services
      .map((item) => item?.title)
      .filter(Boolean)
      .join(', ')
  }

  // Определяем иконки статуса оплаты и передачи для заголовка
  let statusIconsPrefix = ''
  if (syncSettings.showStatusIcons && event?._id) {
    await dbConnect()
    const statusTransactions = await Transactions.find({ eventId: event._id })
      .select('amount type category')
      .lean()
    statusIconsPrefix = buildGoogleCalendarStatusIconsPrefix(
      event,
      statusTransactions
    )
  }

  const buildCalendarTitle = () => {
    const eventTitle =
      typeof event?.title === 'string' ? event.title.trim() : ''
    const titleMode = syncSettings.titleMode || 'eventType_services'
    const modes = {
      eventType_services: [eventTypeTitle, servicesTitle],
      services_eventType: [servicesTitle, eventTypeTitle],
      eventType: [eventTypeTitle],
      services: [servicesTitle],
      eventTitle: [eventTitle],
      client_eventType: [clientName, eventTypeTitle],
    }
    const titleParts = modes[titleMode] ?? modes.eventType_services
    const title = titleParts.filter(Boolean).join(' • ')
    if (title) return title
    return (
      [eventTypeTitle, servicesTitle, eventTitle, clientName]
        .filter(Boolean)
        .join(' • ') || workItemTerms.labelCapitalized
    )
  }
  const calendarTitle = buildCalendarTitle()

  const reminders = settings?.reminders ?? {}
  const statusColors = settings?.statusColors ?? {}
  const deleteCanceledFromCalendar = Boolean(
    settings?.deleteCanceledFromCalendar
  )
  const skipTransferredFromCalendar = Boolean(
    settings?.skipTransferredFromCalendar
  )
  const calendarReminders = reminders.useDefault
    ? { useDefault: true }
    : { useDefault: false, overrides: reminders.overrides ?? [] }
  const calendarColorId =
    statusColors?.[event?.status] || statusColors?.active || undefined

  const isCanceled = event.status === 'canceled'
  const isTransferred = Boolean(event?.isTransferred)
  const eventReminders = isCanceled
    ? { useDefault: false, overrides: [] }
    : calendarReminders
  const statusPrefix = isCanceled
    ? '[ОТМЕНЕНО] '
    : isTransferred
      ? '[ПЕРЕДАНО] '
      : event.status === 'draft'
        ? '[ЗАЯВКА] '
        : ''
  const calendarEvent = {
    summary: `${statusIconsPrefix}${statusPrefix}${calendarTitle}`,
    description: [
      sanitizeToPlainText(
        preparedText
          .replaceAll('<p><br></p>', '\n')
          .replaceAll('</blockquote>', '\n</blockquote>')
          // .replaceAll('<ul>', '\n<ul>')
          // .replaceAll('<ol>', '\n<ol>')
          .replaceAll('<li>', '\u{2764} <li>')
          .replaceAll('</li>', '\n</li>')
          .replaceAll('</p>', '\n</p>')
          .replaceAll('<br>', '\n')
          .replaceAll('&nbsp;', ' ')
          .trim('\n')
      ),
      syncSettings.showEventLink
        ? `Ссылка на ${workItemTerms.accusative}:\n${getCanonicalBaseUrl(process.env.DOMAIN) + '/event/' + event._id}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
    location: calendarLocation,
    attendees: [],
    reminders: eventReminders,
    colorId: calendarColorId,
    // visibility: event.showOnSite ? 'default' : 'private',
  }

  const eventLink = `${getCanonicalBaseUrl(process.env.DOMAIN) + '/event/' + event._id}`
  const eventDateLabel = isValidDateValue(startDate)
    ? startDate.toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'не указана'
  const clientBlock =
    syncSettings.showClient && clientName
      ? `Клиент: ${clientName}${
          clientContactLines.length ? `\n${clientContactLines.join('\n')}` : ''
        }`
      : ''
  const colleagueBlock =
    syncSettings.showColleague && isTransferred
      ? `Передано: ${colleagueName || 'Контакт не указан'}${
          colleagueContactLines.length
            ? `\n${colleagueContactLines.join('\n')}`
            : ''
        }`
      : ''
  const additionalBaseDescriptionLines = [
    `Доп. событие по ${workItemTerms.dative}`,
    `${workItemTerms.labelCapitalized}: ${calendarTitle}`,
    `Дата ${workItemTerms.genitive}: ${eventDateLabel}`,
    `Статус: ${
      event.status === 'draft'
        ? 'Заявка'
        : event.status === 'canceled'
          ? 'Отменено'
          : event.status === 'closed'
            ? 'Закрыто'
            : workItemTerms.labelCapitalized
    }`,
    clientBlock,
    colleagueBlock,
    syncSettings.showEventLink ? `Ссылка на ${workItemTerms.accusative}:\n${eventLink}` : '',
  ].filter(Boolean)

  const toAdditionalEventPayload = (item) => {
    if (!item || typeof item !== 'object') return null
    const title = typeof item.title === 'string' ? item.title.trim() : ''
    const description =
      typeof item.description === 'string' ? item.description.trim() : ''
    const rawDate = item.date ? new Date(item.date) : null
    const date = isValidDateValue(rawDate) ? rawDate : null
    const googleCalendarEventId =
      typeof item.googleCalendarEventId === 'string'
        ? item.googleCalendarEventId.trim()
        : ''
    const done = Boolean(item.done)
    return {
      ...item,
      title,
      description,
      date,
      done,
      googleCalendarEventId,
    }
  }

  const calendarInsert = async (resource) =>
    new Promise((resolve, reject) => {
      calendar.events.insert(
        {
          calendarId: effectiveCalendarId,
          resource,
        },
        (error, result) => {
          if (error) return reject(error)
          if (!result) return reject(new Error('Не удалось создать событие'))
          return resolve(result)
        }
      )
    })

  const calendarUpdate = async (eventId, resource) =>
    new Promise((resolve, reject) => {
      calendar.events.update(
        {
          calendarId: effectiveCalendarId,
          eventId,
          resource,
        },
        (error, result) => {
          if (error) return reject(error)
          if (!result) return reject(new Error('Не удалось обновить событие'))
          return resolve(result)
        }
      )
    })

  const calendarDelete = async (eventId) =>
    new Promise((resolve, reject) => {
      calendar.events.delete(
        {
          calendarId: effectiveCalendarId,
          eventId,
        },
        (error, result) => {
          if (error) return reject(error)
          return resolve(result)
        }
      )
    })

  if (
    shouldSkipGoogleCalendarEventSync(event, {
      deleteCanceledFromCalendar,
      skipTransferredFromCalendar,
    })
  ) {
    if (event.googleCalendarId) {
      try {
        await calendarDelete(event.googleCalendarId)
      } catch (error) {
        if (error?.code !== 404) throw error
      }
      await Events.findByIdAndUpdate(event._id, {
        googleCalendarId: '',
        googleCalendarCalendarId: '',
      })
      event.googleCalendarId = ''
      event.googleCalendarCalendarId = ''
    }
    return null
  }

  let updatedCalendarEvent
  if (!event.googleCalendarId) {
    console.log('Создаем новое событие в календаре')
    const createdCalendarEvent = await calendarInsert(calendarEvent)
    event.googleCalendarId = createdCalendarEvent?.data?.id ?? null

    await dbConnect()
    await Events.findByIdAndUpdate(
      event._id,
      {
        googleCalendarId: createdCalendarEvent.data.id,
        googleCalendarCalendarId: effectiveCalendarId,
      },
      {
        returnDocument: 'after',
        runValidators: true,
      }
    ).lean()
    updatedCalendarEvent = createdCalendarEvent
  } else {
    console.log('Обновляем событие в календаре')
    updatedCalendarEvent = await calendarUpdate(
      event.googleCalendarId ?? undefined,
      calendarEvent
    )
  }

  if (tasksBeta) return updatedCalendarEvent
  const previousAdditionalByGoogleId = new Map(
    previousAdditionalEvents
      .map((item) => toAdditionalEventPayload(item))
      .filter((item) => item?.googleCalendarEventId)
      .map((item) => [item.googleCalendarEventId, item])
  )

  const normalizedAdditionalEvents = (
    Array.isArray(event?.additionalEvents) ? event.additionalEvents : []
  )
    .map((item) => toAdditionalEventPayload(item))
    .filter(Boolean)

  const currentAdditionalGoogleIds = new Set(
    normalizedAdditionalEvents
      .map((item) => item.googleCalendarEventId)
      .filter(Boolean)
  )

  const removedGoogleIds = Array.from(
    previousAdditionalByGoogleId.keys()
  ).filter((googleId) => !currentAdditionalGoogleIds.has(googleId))
  for (const googleId of removedGoogleIds) {
    try {
      await calendarDelete(googleId)
    } catch (error) {
      if (error?.code !== 404) {
        console.log('Google Calendar additional event delete error', {
          eventId: event?._id,
          googleId,
          error,
        })
      }
    }
  }

  let additionalEventsChanged = false
  const nextAdditionalEvents = []
  for (const item of normalizedAdditionalEvents) {
    if (item.googleSyncMode === 'task' || item.googleSyncMode === 'none') {
      nextAdditionalEvents.push(item)
      continue
    }
    const hasContent = Boolean(item.title || item.description || item.date)
    if (!hasContent) continue

    if (item.done) {
      if (item.googleCalendarEventId) {
        try {
          await calendarDelete(item.googleCalendarEventId)
        } catch (error) {
          if (error?.code !== 404) {
            console.log('Google Calendar additional event delete error', {
              eventId: event?._id,
              googleId: item.googleCalendarEventId,
              error,
            })
          }
        }
        item.googleCalendarEventId = ''
        additionalEventsChanged = true
      }
      nextAdditionalEvents.push(item)
      continue
    }

    if (!item.date) {
      if (item.googleCalendarEventId) {
        try {
          await calendarDelete(item.googleCalendarEventId)
        } catch (error) {
          if (error?.code !== 404) {
            console.log('Google Calendar additional event delete error', {
              eventId: event?._id,
              googleId: item.googleCalendarEventId,
              error,
            })
          }
        }
        item.googleCalendarEventId = ''
        additionalEventsChanged = true
      }
      nextAdditionalEvents.push(item)
      continue
    }

    const startValue = formatDateTimeInZone(item.date, timeZone)
    const endValue = formatDateTimeInZone(
      new Date(item.date.getTime() + 30 * 60 * 1000),
      timeZone
    )
    if (!startValue || !endValue) {
      nextAdditionalEvents.push(item)
      continue
    }

    const detailsLines = []
    if (item.description) detailsLines.push(`Описание:\n${item.description}`)
    const additionalEventDescription = [
      ...additionalBaseDescriptionLines,
      ...detailsLines,
    ].join('\n\n')
    const additionalCalendarEvent = {
      summary: `${item.done ? '✓ ' : ''}${item.title || 'Доп. событие'}`,
      description: additionalEventDescription,
      start: {
        dateTime: startValue,
        timeZone,
      },
      end: {
        dateTime: endValue,
        timeZone,
      },
      reminders: item.done
        ? { useDefault: false, overrides: [] }
        : calendarReminders,
    }

    if (item.googleCalendarEventId) {
      try {
        await calendarUpdate(
          item.googleCalendarEventId,
          additionalCalendarEvent
        )
      } catch (error) {
        if (error?.code === 404) {
          const created = await calendarInsert(additionalCalendarEvent)
          item.googleCalendarEventId = created?.data?.id || ''
          additionalEventsChanged = true
        } else {
          throw error
        }
      }
    } else {
      const created = await calendarInsert(additionalCalendarEvent)
      item.googleCalendarEventId = created?.data?.id || ''
      additionalEventsChanged = true
    }

    nextAdditionalEvents.push(item)
  }

  if (!event.googleCalendarCalendarId || additionalEventsChanged) {
    const updatePayload = {}
    if (!event.googleCalendarCalendarId) {
      updatePayload.googleCalendarCalendarId = effectiveCalendarId
    }
    if (additionalEventsChanged) {
      updatePayload.additionalEvents = nextAdditionalEvents.map((item) => ({
        _id: item._id,
        googleSyncMode: item.googleSyncMode,
        googleDurationMinutes: item.googleDurationMinutes,
        title: item.title || '',
        description: item.description || '',
        date: item.date || null,
        done: Boolean(item.done),
        doneAt: item.doneAt || null,
        googleCalendarEventId: item.googleCalendarEventId || '',
      }))
    }
    await Events.findByIdAndUpdate(event._id, updatePayload)
  }

  return updatedCalendarEvent
}

export {
  addBlankEventToCalendar,
  deleteEventFromCalendar,
  deleteRelatedEventsFromCalendar,
  updateEventInCalendar,
}

export default async function handler(Schema, req, res, params = null) {
  const { query, method } = req
  const body = await req.json()
  // console.log('req :>> ', req)
  // console.log('res.params :>> ', res.params)

  const id = query?.id || res.params?.id

  await dbConnect()

  let data
  console.log('CRUD', { Schema, method, params, id, body, query })

  switch (method) {
    case 'GET':
      try {
        if (id) {
          data = await Schema.findById(id).select({ password: 0 })
          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }
          return NextResponse.json({ success: true }, { status: 200 })
        } else if (Object.keys(query).length > 0) {
          const preparedQuery = { ...query }
          for (const [key, value] of Object.entries(preparedQuery)) {
            if (isJson(value)) preparedQuery[key] = JSON.parse(value)
          }
          if (preparedQuery['data._id'])
            preparedQuery['data._id'] = new mongoose.Types.ObjectId(
              preparedQuery['data._id']
            )
          data = await Schema.find(preparedQuery).select({ password: 0 })
          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }
          return NextResponse.json({ success: true }, { status: 200 })
        } else if (params) {
          data = await Schema.find(params).select({ password: 0 })
          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }
          return NextResponse.json({ success: true, data }, { status: 200 })
        } else {
          data = await Schema.find().select({ password: 0 })
          return NextResponse.json({ success: true, data }, { status: 200 })
        }
      } catch (error) {
        console.log(error)
        return NextResponse.json({ success: false, error }, { status: 400 })
      }
      break
    case 'POST':
      try {
        if (id) {
          return NextResponse.json(
            { success: false, error: 'No need to set Id' },
            { status: 400 }
          )
        } else {
          const clearedBody = { ...body.data }
          delete clearedBody._id

          // Создаем пустой календарь и получаем его id
          if (Schema === Events) {
            clearedBody.googleCalendarId = await addBlankEventToCalendar(
              clearedBody?.tenantId
            )
          }

          data = await Schema.create(clearedBody)
          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }
          const jsonData = data.toJSON()

          if (Schema === Events) {
            // Вносим данные в календарь так как теперь мы имеем id мероприятия
            const calendarEvent = updateEventInCalendar(jsonData, req)
          }

          await Histories.create({
            schema: Schema.collection.collectionName,
            action: 'add',
            data: jsonData,
            userId: body.userId,
          })

          return NextResponse.json(
            { success: true, data: jsonData },
            { status: 201 }
          )
        }
      } catch (error) {
        console.log(error)
        return NextResponse.json({ success: false, error }, { status: 400 })
      }
      break
    case 'PUT':
      try {
        if (id) {
          const oldData = await Schema.findById(id).lean()
          if (!oldData) {
            return NextResponse.json({ success: false }, { status: 400 })
          }

          data = await Schema.findByIdAndUpdate(id, body.data, {
            returnDocument: 'after',
            runValidators: true,
          }).lean()

          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }

          if (Schema === Events) {
            const calendarEvent = updateEventInCalendar(data, req)
          }

          const difference = compareObjectsWithDif(oldData, data)
          difference._id = new mongoose.Types.ObjectId(id)

          await Histories.create({
            schema: Schema.collection.collectionName,
            action: 'update',
            data: difference,
            userId: body.userId,
            difference: true,
          })

          return NextResponse.json({ success: true, data }, { status: 200 })
        } else {
          return NextResponse.json(
            { success: false, error: 'No Id' },
            { status: 400 }
          )
        }
      } catch (error) {
        console.log(error)
        return NextResponse.json({ success: false }, { status: 400 })
      }
      break
    case 'DELETE':
      try {
        if (params) {
          data = await Schema.deleteMany(params)
          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }
          await Histories.create({
            schema: Schema.collection.collectionName,
            action: 'delete',
            data,
            userId: body.userId,
          })
          return res?.status(200).json({ success: true, data })
        } else if (id) {
          const existingData = await Schema.findById(id)
          if (!existingData) {
            return NextResponse.json({ success: false }, { status: 400 })
          }
          data = await Schema.deleteOne({
            _id: id,
          })
          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }

          if (Schema === Events) {
            deleteEventFromCalendar(existingData.googleCalendarId)
          }

          await Histories.create({
            schema: Schema.collection.collectionName,
            action: 'delete',
            data,
            userId: body.userId,
          })
          return NextResponse.json({ success: true }, { status: 200 })
        } else if (body?.params) {
          data = await Schema.deleteMany({
            _id: { $in: body.params },
          })
          if (!data) {
            return NextResponse.json({ success: false }, { status: 400 })
          }
          await Histories.create({
            schema: Schema.collection.collectionName,
            action: 'delete',
            data,
            userId: body.userId,
          })
          return NextResponse.json({ success: true }, { status: 200 })
        } else {
          return NextResponse.json({ success: false }, { status: 400 })
        }
      } catch (error) {
        console.log(error)
        return NextResponse.json({ success: false, error }, { status: 400 })
      }
      break
    default:
      return NextResponse.json({ success: false }, { status: 400 })
      break
  }
}
