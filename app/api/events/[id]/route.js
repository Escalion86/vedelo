import { after, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import dbConnect from '@server/dbConnect'
import {
  deleteEventFromCalendar,
  deleteRelatedEventsFromCalendar,
  updateEventInCalendar,
} from '@server/CRUD'
import getRequestContext from '@server/getRequestContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { recordActivityHistory } from '@server/activityHistory'
import {
  notifyTaskCreated,
  notifyTaskCompleted,
  notifyTaskUpdated,
} from '@server/taskPushNotifications'
import compareObjectsWithDif from '@helpers/compareObjectsWithDif'
import { recordSyncTombstone } from '@server/mobile/sync'
import { recordCrmItemCreated } from '@server/acquisitionFunnel'
import {
  hasDocuments,
  normalizeAdditionalEvents,
  normalizeDepositExpectedAmount,
  normalizeEventDocumentFiles,
  normalizeEventDocuments,
  normalizeEventType,
  normalizeWaitDeposit,
  parseDateValue,
} from '@server/eventApiNormalization'
import {
  getCloseBlockedByObligationsMessage,
  hasObligationPaymentMethod,
} from '@helpers/transactionObligation'
import { getEventCloseBlockedReason } from '@helpers/eventCloseSuggestion'
import { getTenantWorkItemTerminology } from '@server/tenantTerminology'
import { getDocumentStorageKeys } from '@helpers/entityDocuments'

const EVENT_STATUSES = new Set(['draft', 'canceled', 'active', 'closed'])

const DEFAULT_ADDRESS = {
  town: '',
  street: '',
  house: '',
  entrance: '',
  floor: '',
  flat: '',
  comment: '',
  link2Gis: '',
  linkYandexNavigator: '',
  link2GisShow: true,
  linkYandexShow: true,
}

const normalizeAddress = (rawAddress, legacyLocation) => {
  const normalized = {
    ...DEFAULT_ADDRESS,
    ...(rawAddress && typeof rawAddress === 'object' ? rawAddress : {}),
  }

  const hasMainFields =
    normalized.town || normalized.street || normalized.house || normalized.flat

  if (legacyLocation && !normalized.comment && !hasMainFields) {
    normalized.comment = legacyLocation
  }

  return normalized
}

const normalizeCancelReason = (value) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeOtherContacts = (contacts) => {
  if (!Array.isArray(contacts)) return []
  return contacts
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const clientId = normalizeObjectId(item.clientId)
      if (!clientId) return null
      return {
        clientId,
        comment: typeof item.comment === 'string' ? item.comment.trim() : '',
      }
    })
    .filter(Boolean)
}

const normalizeObjectId = (value) => {
  if (value === null || value === undefined) return null
  const normalized = String(value).trim()
  if (!normalized) return null
  return mongoose.Types.ObjectId.isValid(normalized) ? normalized : null
}

const normalizeObjectIdList = (items) => {
  if (!Array.isArray(items)) return []
  return items.map((item) => normalizeObjectId(item)).filter(Boolean)
}
const getNextStatus = (current, body) => {
  const next = body?.status
  if (next && EVENT_STATUSES.has(next)) return next
  return current
}

export const GET = async (req, { params }) => {
  const { id } = await params
  const context = await getRequestContext(req)
  const { tenantId, user } = context
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  await dbConnect()
  const terms = await getTenantWorkItemTerminology(tenantId)
  const event = await Events.findOne({ _id: id, tenantId }).lean()
  if (!event) {
    return NextResponse.json(
      { success: false, error: `${terms.labelCapitalized} не найден${terms.mode === 'events' ? 'о' : ''}` },
      { status: 404 }
    )
  }

  return NextResponse.json({ success: true, data: event }, { status: 200 })
}

export const PUT = async (req, { params }) => {
  const { id } = await params
  const body = await req.json()
  const context = await getRequestContext(req)
  const { tenantId, user } = context
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  const access = await getUserTariffAccess(user._id)
  if (!access?.trialActive && !access?.hasTariff) {
    return NextResponse.json(
      { success: false, error: 'Не выбран тариф' },
      { status: 403 }
    )
  }
  if (!access?.allowDocuments && hasDocuments(body)) {
    return NextResponse.json(
      { success: false, error: 'Доступ к документам недоступен' },
      { status: 403 }
    )
  }
  await dbConnect()
  const terms = await getTenantWorkItemTerminology(tenantId)

  const oldEvent = await Events.findOne({ _id: id, tenantId }).lean()
  if (!oldEvent)
    return NextResponse.json(
      { success: false, error: `${terms.labelCapitalized} не найден${terms.mode === 'events' ? 'о' : ''}` },
      { status: 404 }
    )

  const nextStatus = getNextStatus(oldEvent?.status, body)
  if (
    nextStatus === 'draft' &&
    (hasDocuments(body) || hasDocuments(oldEvent))
  ) {
    return NextResponse.json(
      {
        success: false,
        error: 'Документы недоступны для заявки',
      },
      { status: 400 }
    )
  }
  if (nextStatus === 'closed') {
    const eventTransactions = await Transactions.find({
      tenantId,
      eventId: id,
    })
      .select('type amount category paymentMethod')
      .lean()
    const financialFieldsChanged =
      body.contractSum !== undefined || body.isByContract !== undefined
    const error =
      oldEvent.status !== 'closed' || financialFieldsChanged
        ? getEventCloseBlockedReason(
            {
              ...oldEvent,
              contractSum:
                body.contractSum === undefined
                  ? oldEvent.contractSum
                  : Number(body.contractSum) || 0,
              isByContract:
                body.isByContract === undefined
                  ? oldEvent.isByContract
                  : Boolean(body.isByContract),
            },
            eventTransactions
          )
        : hasObligationPaymentMethod(eventTransactions)
          ? getCloseBlockedByObligationsMessage()
          : ''
    if (error) {
      return NextResponse.json(
        {
          success: false,
          error,
        },
        { status: 409 }
      )
    }
  }

  if (body.eventDate !== undefined || body.dateEnd !== undefined) {
    const startDate =
      body.eventDate !== undefined
        ? parseDateValue(body.eventDate)
        : oldEvent.eventDate
    const endDate =
      body.dateEnd !== undefined
        ? parseDateValue(body.dateEnd)
        : oldEvent.dateEnd
    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Дата начала не может быть позже даты завершения',
        },
        { status: 400 }
      )
    }
  }
  if (body.eventType !== undefined && !normalizeEventType(body.eventType)) {
    return NextResponse.json(
      { success: false, error: 'Поле "Что за событие" обязательно' },
      { status: 400 }
    )
  }

  const update = {}
  update.syncVersion = Number(oldEvent?.syncVersion || 1) + 1
  if (body.eventDate !== undefined)
    update.eventDate = body.eventDate ? new Date(body.eventDate) : null
  if (body.dateEnd !== undefined)
    update.dateEnd = body.dateEnd ? new Date(body.dateEnd) : null
  if (body.additionalEvents !== undefined)
    update.additionalEvents = normalizeAdditionalEvents(body.additionalEvents)
  if (body.clientId !== undefined)
    update.clientId = normalizeObjectId(body.clientId)
  if (body.address !== undefined) {
    if (typeof body.address === 'string')
      update.address = normalizeAddress({}, body.address)
    else update.address = normalizeAddress(body.address)
  }
  if (body.contractSum !== undefined)
    update.contractSum = Number(body.contractSum) || 0
  if (body.waitDeposit !== undefined)
    update.waitDeposit = normalizeWaitDeposit(body.waitDeposit)
  if (body.depositDueAt !== undefined)
    update.depositDueAt = parseDateValue(body.depositDueAt)
  if (body.depositExpectedAmount !== undefined)
    update.depositExpectedAmount = normalizeDepositExpectedAmount(
      body.depositExpectedAmount
    )
  if (body.description !== undefined)
    update.description = body.description ?? ''
  if (body.eventType !== undefined)
    update.eventType = normalizeEventType(body.eventType)
  if (body.financeComment !== undefined)
    update.financeComment = body.financeComment ?? ''
  if (body.invoiceLinks !== undefined)
    update.invoiceLinks = Array.isArray(body.invoiceLinks)
      ? body.invoiceLinks
      : []
  if (body.receiptLinks !== undefined)
    update.receiptLinks = Array.isArray(body.receiptLinks)
      ? body.receiptLinks
      : []
  if (body.actLinks !== undefined)
    update.actLinks = Array.isArray(body.actLinks) ? body.actLinks : []
  if (body.contractLinks !== undefined)
    update.contractLinks = Array.isArray(body.contractLinks)
      ? body.contractLinks
      : []
  if (body.documentFiles !== undefined)
    update.documentFiles = normalizeEventDocumentFiles(body.documentFiles)
  if (body.documents !== undefined)
    update.documents = normalizeEventDocuments(body.documents, {
      allowedStorageKeys: getDocumentStorageKeys(oldEvent.documents),
    })
  if (body.isByContract !== undefined)
    update.isByContract = Boolean(body.isByContract)
  if (body.servicesIds !== undefined)
    update.servicesIds = normalizeObjectIdList(body.servicesIds)
  if (body.otherContacts !== undefined)
    update.otherContacts = normalizeOtherContacts(body.otherContacts)
  if (body.calendarImportChecked !== undefined && access?.allowCalendarSync) {
    update.calendarImportChecked = Boolean(body.calendarImportChecked)
    if (update.calendarImportChecked) {
      update.calendarImportAiFields = []
      update.calendarImportWarnings = []
    }
  }
  if (
    oldEvent.importedFromFile &&
    typeof body.fileImportChecked === 'boolean'
  ) {
    update.fileImportChecked = body.fileImportChecked
    if (update.fileImportChecked) {
      update.fileImportAiFields = []
      update.fileImportWarnings = []
    }
  }
  if (body.colleagueId !== undefined)
    update.colleagueId = normalizeObjectId(body.colleagueId)
  if (body.isTransferred !== undefined) {
    update.isTransferred = Boolean(body.isTransferred)
    if (!update.isTransferred) update.colleagueId = null
    if (update.isTransferred && !update.colleagueId) update.colleagueId = null
  }
  if (body.cancelReason !== undefined) {
    update.cancelReason = normalizeCancelReason(body.cancelReason)
  }
  if (body.status && EVENT_STATUSES.has(body.status))
    update.status = body.status

  let event = null
  try {
    event = await Events.findOneAndUpdate({ _id: id, tenantId }, update, {
      returnDocument: 'after',
    })
  } catch (error) {
    console.error('Events PUT update error', error)
    if (error?.name === 'CastError') {
      return NextResponse.json(
        {
          success: false,
          error: `Некорректное значение поля "${error.path}"`,
        },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { success: false, error: `Не удалось сохранить ${terms.accusative}` },
      { status: 500 }
    )
  }
  if (!event)
    return NextResponse.json(
      { success: false, error: `${terms.labelCapitalized} не найден${terms.mode === 'events' ? 'о' : ''}` },
      { status: 404 }
    )

  const changes = compareObjectsWithDif(oldEvent, event.toJSON?.() ?? event)
  if (Object.keys(changes).length > 0) {
    await recordActivityHistory({
      req,
      context,
      entityType: 'event',
      entityId: event._id,
      operation: 'update',
      before: oldEvent,
      after: event.toJSON?.() ?? event,
    })
  }

  let responseEvent = event
  if (!event?.importedFromCalendar && !access?.allowCalendarSync) {
    responseEvent = await Events.findByIdAndUpdate(
      event._id,
      { calendarSyncError: 'calendar_sync_unavailable' },
      { returnDocument: 'after' }
    )
  } else if (
    event.calendarImportChecked &&
    access?.allowCalendarSync &&
    (!event.importedFromFile || event.fileImportChecked)
  ) {
    try {
      await updateEventInCalendar(event, req, user, oldEvent)
      responseEvent = await Events.findByIdAndUpdate(
        event._id,
        { calendarSyncError: '' },
        { returnDocument: 'after' }
      )
    } catch (error) {
      console.log('Google Calendar update error', error)
      responseEvent = await Events.findByIdAndUpdate(
        event._id,
        { calendarSyncError: 'calendar_sync_failed' },
        { returnDocument: 'after' }
      )
    }
  }

  await recordCrmItemCreated({
    userId: user._id,
    hasNextAction: responseEvent?.additionalEvents?.some(
      (item) => item && !item.done
    ),
  })

  // Send push notifications for task changes
  if (responseEvent) {
    const oldTasks = Array.isArray(oldEvent?.additionalEvents)
      ? oldEvent.additionalEvents
      : []
    const newTasks = Array.isArray(responseEvent?.additionalEvents)
      ? responseEvent.additionalEvents
      : []

    // Check for new tasks
    for (let i = 0; i < newTasks.length; i++) {
      const newTask = newTasks[i]
      const oldTask = oldTasks[i]

      if (!newTask) continue

      if (!oldTask && !newTask.done) {
        // New task added
        notifyTaskCreated({
          tenantId,
          event: responseEvent,
          task: newTask,
        }).catch((err) =>
          console.log('Push notification error (task created)', err)
        )
      } else if (
        !newTask.done &&
        (oldTask.title !== newTask.title ||
          String(oldTask.date) !== String(newTask.date) ||
          oldTask.description !== newTask.description)
      ) {
        // Task updated
        notifyTaskUpdated({
          tenantId,
          event: responseEvent,
          task: newTask,
        }).catch((err) =>
          console.log('Push notification error (task updated)', err)
        )
      }

      // Task marked as done
      if (newTask.done && oldTask && !oldTask.done) {
        notifyTaskCompleted({
          tenantId,
          event: responseEvent,
          task: newTask,
        }).catch((err) =>
          console.log('Push notification error (task completed)', err)
        )
      }
    }
  }

  return NextResponse.json(
    { success: true, data: responseEvent ?? event },
    { status: 200 }
  )
}

export const DELETE = async (req, { params }) => {
  const { id } = await params
  const context = await getRequestContext(req)
  const { tenantId, user } = context
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  await dbConnect()
  const terms = await getTenantWorkItemTerminology(tenantId)
  const transactionsCount = await Transactions.countDocuments({
    tenantId,
    eventId: id,
  })
  if (transactionsCount > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `Нельзя удалить ${terms.accusative}: есть транзакции (${transactionsCount})`,
      },
      { status: 409 }
    )
  }
  const deleted = await Events.findOneAndDelete({ _id: id, tenantId })
  if (!deleted)
    return NextResponse.json(
      { success: false, error: `${terms.labelCapitalized} не найден${terms.mode === 'events' ? 'о' : ''}` },
      { status: 404 }
    )
  await recordActivityHistory({
    req,
    context,
    entityType: 'event',
    entityId: deleted._id,
    operation: 'delete',
    before: deleted.toJSON?.() ?? deleted,
  })
  await recordSyncTombstone({
    tenantId,
    entityType: 'events',
    entityId: id,
    version: deleted.syncVersion,
  })
  const additionalCalendarEventIds = Array.isArray(deleted.additionalEvents)
    ? deleted.additionalEvents
        .map((item) =>
          typeof item?.googleCalendarEventId === 'string'
            ? item.googleCalendarEventId.trim()
            : ''
        )
        .filter(Boolean)
    : []
  const calendarEventIds = [
    deleted.googleCalendarId,
    ...additionalCalendarEventIds,
  ].filter(Boolean)
  if (
    calendarEventIds.length > 0 ||
    deleted.calendarImportChecked ||
    deleted.importedFromCalendar
  ) {
    after(async () => {
      try {
        const access = await getUserTariffAccess(user._id)
        if (access?.allowCalendarSync) {
          const uniqueCalendarEventIds = Array.from(new Set(calendarEventIds))
          for (const googleCalendarId of uniqueCalendarEventIds) {
            try {
              await deleteEventFromCalendar(
                googleCalendarId,
                deleted.googleCalendarCalendarId,
                user
              )
            } catch (error) {
              if (error?.code !== 404 && error?.code !== 410) {
                console.log('Google Calendar delete event item error', {
                  eventId: String(deleted?._id ?? ''),
                  googleCalendarId,
                  error: {
                    name: error?.name,
                    code: error?.code,
                  },
                })
              }
            }
          }
          await deleteRelatedEventsFromCalendar(
            deleted._id,
            deleted.googleCalendarCalendarId,
            user
          )
        }
      } catch (error) {
        console.log('Google Calendar delete error', {
          eventId: String(deleted?._id ?? ''),
          error: {
            name: error?.name,
            code: error?.code,
          },
        })
      }
    })
  }
  return NextResponse.json({ success: true }, { status: 200 })
}
