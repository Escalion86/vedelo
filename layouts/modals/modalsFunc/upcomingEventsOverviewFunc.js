import AppButton from '@components/AppButton'
import LoadingSpinner from '@components/LoadingSpinner'
import ModalSection from '@components/ModalSection'
import QuickActionButtons from '@components/QuickActionButtons'
import StatusChip from '@components/StatusChip'
import formatDateTime from '@helpers/formatDateTime'
import { PROVIDER_LABELS } from '@helpers/incomingMessageNotification'
import {
  getAdditionalEventSegment,
  getAdditionalEventsListBySegments,
  getSoonNoDepositEvents,
  getUpcomingEventsByDays,
} from '@helpers/additionalEvents'
import {
  getServerSyncQueueSummary,
  readServerSyncQueue,
  SERVER_SYNC_FLUSH_NOW_EVENT,
  SERVER_SYNC_QUEUE_CHANGED_EVENT,
} from '@helpers/serverSyncQueue'
import { modalsFuncAtom } from '@state/atoms'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import { useAtomValue } from 'jotai'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useEffect, useMemo, useState } from 'react'
import { useEventsQuery } from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'
import { useClientsQuery } from '@helpers/useClientsQuery'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  buildClientEvents,
  formatClientEventDate,
  formatClientEventDaysLeft,
} from '@helpers/clientSignificantDates'
import { useRouter } from 'next/navigation'
import { getData } from '@helpers/CRUD'
import { getNounEvents } from '@helpers/getNoun'
import { useMessengerSummaryQuery } from '@helpers/useMessengerSummary'
import {
  getEventAddressLine,
  getEventTitle,
  getPendingAttentionCount,
  getPostponeActionsForSegment,
  moveDateToDayOffset,
} from '@helpers/upcomingEventsOverview'
import AdditionalEventCard from './AdditionalEventCard'
import EventCard from '@layouts/cards/EventCard'
import openEventAdditionalEventEditorModal from './eventAdditionalEventEditorModal'
import openEventAdditionalEventViewModal from './eventAdditionalEventViewModal'

const SEGMENT_META = {
  overdue: {
    title: 'Просрочено',
    emptyText: 'Просроченных задач нет',
    tone: 'overdue',
  },
  today: {
    title: 'Сегодня',
    emptyText: 'На сегодня задач нет',
    tone: 'today',
  },
  tomorrow: {
    title: 'Завтра',
    emptyText: 'На завтра задач нет',
    tone: 'tomorrow',
  },
}

const normalizeText = (value, fallback = '') => {
  if (!value) return fallback
  return (
    String(value)
      .replace(/<[^>]+>/g, '')
      .trim() || fallback
  )
}

const parseDateSafe = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const isSameDay = (a, b) => {
  const dateA = parseDateSafe(a)
  const dateB = parseDateSafe(b)
  if (!dateA || !dateB) return false
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

const readQueueSummary = () => getServerSyncQueueSummary(readServerSyncQueue())

const getInitials = (name) =>
  String(name || '')
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

export const UpcomingEventsOverview = ({ closeModal }) => {
  const { data: eventsPayload, isPending: isEventsPending } = useEventsQuery({
    scope: 'upcoming',
  })
  const events = useMemo(() => eventsPayload?.data ?? [], [eventsPayload?.data])
  const { data: transactions = [], isPending: isTransactionsPending } =
    useTransactionsQuery()
  const { data: clients = [], isPending: isClientsPending } = useClientsQuery()
  const {
    data: messengerSummary,
    isLoading: isMessengerSummaryLoading,
    isError: isMessengerSummaryError,
  } = useMessengerSummaryQuery()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const itemsFunc = useAtomValue(itemsFuncAtom)
  const router = useRouter()
  const [savingKey, setSavingKey] = useState('')
  const [pastClosableCount, setPastClosableCount] = useState(null)
  const [queueSummary, setQueueSummary] = useState(readQueueSummary)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  )

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refreshNow = () => setNow(new Date())
    const timer = setInterval(refreshNow, 60_000)
    window.addEventListener('focus', refreshNow)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refreshNow)
    }
  }, [])
  const segmentedAdditional = useMemo(
    () => getAdditionalEventsListBySegments(events, now),
    [events, now]
  )
  const overdueNoDepositEvents = useMemo(
    () => getSoonNoDepositEvents(events, transactions, now, 3),
    [events, transactions, now]
  )
  const upcomingEvents = useMemo(
    () => getUpcomingEventsByDays(events, 3, now),
    [events, now]
  )
  const clientEvents = useMemo(
    () => buildClientEvents(clients, now),
    [clients, now]
  )
  const unreadItems = useMemo(
    () =>
      Array.isArray(messengerSummary?.unreadItems)
        ? messengerSummary.unreadItems
        : [],
    [messengerSummary?.unreadItems]
  )
  const totalUnreadMessages = useMemo(
    () =>
      unreadItems.reduce(
        (total, item) => total + Math.max(0, Number(item?.unreadCount || 0)),
        0
      ),
    [unreadItems]
  )
  const segmentedItems = useMemo(() => {
    const withType = (items) =>
      (Array.isArray(items) ? items : []).map((item) => ({
        ...item,
        reminderType: 'additional',
      }))
    const overdueNoDepositItems = overdueNoDepositEvents.map((event) => ({
      eventId: event?._id,
      eventDate: event?.eventDate ?? null,
      eventType: event?.eventType ?? '',
      eventStatus: event?.status ?? '',
      eventAddress: event?.address ?? null,
      eventTown: event?.address?.town ?? '',
      eventDescription: event?.description ?? '',
      title: 'Просрочен задаток',
      description:
        Number(event?.depositExpectedAmount ?? 0) > 0
          ? `Ожидается: ${Number(event.depositExpectedAmount).toLocaleString('ru-RU')} ₽`
          : '',
      date: event?.depositDueAt ?? null,
      index: -1,
      reminderType: 'depositOverdue',
    }))

    const parseTime = (value) => {
      const date = parseDateSafe(value)
      return date ? date.getTime() : 0
    }

    const overdue = withType(segmentedAdditional.overdue)
      .concat(overdueNoDepositItems)
      .sort((a, b) => parseTime(a?.date) - parseTime(b?.date))

    const doneBySegment = {
      overdue: [],
      today: [],
      tomorrow: [],
    }
    ;(Array.isArray(events) ? events : []).forEach((event) => {
      ;(Array.isArray(event?.additionalEvents)
        ? event.additionalEvents
        : []
      ).forEach((item, index) => {
        if (!item?.done) return
        const doneToday = isSameDay(item?.doneAt, now)
        let segment = getAdditionalEventSegment(item?.date, now)
        if (!segment || !(segment in doneBySegment)) {
          // Задача без даты или с датой «позднее»: показываем, только если
          // выполнена сегодня — чтобы действие можно было отменить.
          if (!doneToday) return
          segment = 'today'
        }
        if (segment === 'overdue' && !doneToday) return
        doneBySegment[segment].push({
          eventId: event?._id,
          eventDate: event?.eventDate ?? null,
          eventType: event?.eventType ?? '',
          eventStatus: event?.status ?? '',
          eventAddress: event?.address ?? null,
          eventTown: event?.address?.town ?? '',
          eventDescription: event?.description ?? '',
          title: item?.title ?? '',
          description: item?.description ?? '',
          date: item?.date ?? null,
          doneAt: item?.doneAt ?? null,
          index,
          done: true,
          reminderType: 'additional_done',
        })
      })
    })

    Object.keys(doneBySegment).forEach((key) => {
      doneBySegment[key].sort((a, b) => parseTime(a?.date) - parseTime(b?.date))
    })

    return {
      overdue: overdue.concat(doneBySegment.overdue),
      today: withType(segmentedAdditional.today).concat(doneBySegment.today),
      tomorrow: withType(segmentedAdditional.tomorrow).concat(
        doneBySegment.tomorrow
      ),
    }
  }, [events, now, overdueNoDepositEvents, segmentedAdditional])

  const getEventById = (eventId) =>
    (events ?? []).find((item) => String(item?._id) === String(eventId))

  const getAdditionalEventSource = (eventId, additionalEventIndex) => {
    const event = getEventById(eventId)
    if (!event) return { event: null, sourceItem: null, additionalEvents: [] }
    const additionalEvents = Array.isArray(event.additionalEvents)
      ? event.additionalEvents
      : []
    return {
      event,
      sourceItem: additionalEvents[additionalEventIndex] ?? null,
      additionalEvents,
    }
  }

  const updateAdditionalEvents = async (eventId, nextAdditionalEvents) => {
    const event = getEventById(eventId)
    if (!event) return
    await itemsFunc?.event?.set(
      {
        _id: event._id,
        additionalEvents: nextAdditionalEvents,
      },
      false,
      true
    )
  }

  const updateAdditionalEventDate = async (
    eventId,
    additionalEventIndex,
    date
  ) => {
    if (!eventId || !date) return
    const { sourceItem, additionalEvents } = getAdditionalEventSource(
      eventId,
      additionalEventIndex
    )
    if (!sourceItem) return
    const nextAdditionalEvents = additionalEvents.map((item, idx) =>
      idx === additionalEventIndex
        ? { ...item, date: date.toISOString() }
        : item
    )
    const actionKey = `${eventId}-${additionalEventIndex}`
    try {
      setSavingKey(actionKey)
      await updateAdditionalEvents(eventId, nextAdditionalEvents)
    } finally {
      setSavingKey('')
    }
  }

  const shiftAdditionalEventDate = async (
    eventId,
    additionalEventIndex,
    targetDayOffset
  ) => {
    const { sourceItem } = getAdditionalEventSource(
      eventId,
      additionalEventIndex
    )
    if (!sourceItem) return
    const baseDate = parseDateSafe(sourceItem?.date) || new Date()
    const nextDate = moveDateToDayOffset(baseDate, targetDayOffset, now)
    await updateAdditionalEventDate(eventId, additionalEventIndex, nextDate)
  }

  const openEvent = (eventId) => {
    closeModal?.()
    setTimeout(() => modalsFunc.event?.view(eventId), 150)
  }

  const openClientMessenger = (clientId) => {
    if (!clientId) return
    closeModal?.()
    setTimeout(() => modalsFunc.client?.messenger(clientId), 150)
  }

  const openClientCard = (clientId) => {
    if (!clientId) return
    closeModal?.()
    setTimeout(() => modalsFunc.client?.view(clientId), 150)
  }

  const toggleAdditionalEventDone = async (eventId, additionalEventIndex) => {
    const { sourceItem, additionalEvents } = getAdditionalEventSource(
      eventId,
      additionalEventIndex
    )
    if (!sourceItem) return

    const nextAdditionalEvents = additionalEvents.map((item, idx) =>
      idx === additionalEventIndex
        ? {
            ...item,
            done: !Boolean(item?.done),
            doneAt: !Boolean(item?.done) ? new Date().toISOString() : null,
          }
        : item
    )
    await updateAdditionalEvents(eventId, nextAdditionalEvents)
  }

  const editAdditionalEvent = (eventId, additionalEventIndex) => {
    const { sourceItem } = getAdditionalEventSource(
      eventId,
      additionalEventIndex
    )
    if (!sourceItem) return
    openEventAdditionalEventEditorModal({
      modalsFunc,
      index: additionalEventIndex,
      sourceItem,
      onConfirm: async (nextItem) => {
        const { additionalEvents } = getAdditionalEventSource(
          eventId,
          additionalEventIndex
        )
        const nextAdditionalEvents = additionalEvents.map((item, idx) =>
          idx === additionalEventIndex ? { ...item, ...nextItem } : item
        )
        await updateAdditionalEvents(eventId, nextAdditionalEvents)
      },
    })
  }

  const deleteAdditionalEvent = async (eventId, additionalEventIndex) => {
    const { sourceItem, additionalEvents } = getAdditionalEventSource(
      eventId,
      additionalEventIndex
    )
    if (!sourceItem) return
    const nextAdditionalEvents = additionalEvents.filter(
      (_, idx) => idx !== additionalEventIndex
    )
    await updateAdditionalEvents(eventId, nextAdditionalEvents)
  }

  const confirmDeleteAdditionalEvent = (eventId, additionalEventIndex) => {
    const { sourceItem } = getAdditionalEventSource(
      eventId,
      additionalEventIndex
    )
    if (!sourceItem) return
    modalsFunc.confirm({
      title: 'Удаление задачи',
      text: 'Удалить эту задачу?',
      onConfirm: async () => {
        await deleteAdditionalEvent(eventId, additionalEventIndex)
      },
    })
  }

  const openAdditionalEventView = (eventId, additionalEventIndex) => {
    const { event, sourceItem } = getAdditionalEventSource(
      eventId,
      additionalEventIndex
    )
    if (!event || !sourceItem) return
    openEventAdditionalEventViewModal({
      modalsFunc,
      event,
      item: sourceItem,
      index: additionalEventIndex,
      onToggleDone: (index) => toggleAdditionalEventDone(eventId, index),
      onEdit: (index) => editAdditionalEvent(eventId, index),
      onDelete: (index) => deleteAdditionalEvent(eventId, index),
      onOpenEvent: () => openEvent(eventId),
    })
  }

  useEffect(() => {
    const refreshQueueState = () => {
      setQueueSummary(readQueueSummary())
      setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine)
    }

    refreshQueueState()
    window.addEventListener(SERVER_SYNC_QUEUE_CHANGED_EVENT, refreshQueueState)
    window.addEventListener('online', refreshQueueState)
    window.addEventListener('offline', refreshQueueState)

    return () => {
      window.removeEventListener(
        SERVER_SYNC_QUEUE_CHANGED_EVENT,
        refreshQueueState
      )
      window.removeEventListener('online', refreshQueueState)
      window.removeEventListener('offline', refreshQueueState)
    }
  }, [])

  const requestSync = () => {
    window.dispatchEvent(new CustomEvent(SERVER_SYNC_FLUSH_NOW_EVENT))
    setTimeout(() => setQueueSummary(readQueueSummary()), 250)
  }

  // Считаем прошедшие, но не закрытые мероприятия — их нужно закрыть
  // (те же условия, что у быстрого фильтра на странице «Прошедшие»).
  useEffect(() => {
    let isActive = true

    ;(async () => {
      try {
        const response = await getData(
          '/api/events?scope=past&countOnly=1&statusFinished=true&statusClosed=false&statusTransferred=false&statusCanceled=false',
          null,
          null,
          null,
          true
        )
        const totalCount = Number(response?.meta?.totalCount)
        if (!isActive) return
        setPastClosableCount(Number.isFinite(totalCount) ? totalCount : 0)
      } catch (error) {
        if (!isActive) return
        setPastClosableCount(0)
      }
    })()

    return () => {
      isActive = false
    }
  }, [])

  const openClosePastEvents = () => {
    closeModal?.()
    router.push(
      '/cabinet/eventsPast?statusFinished=true&statusClosed=false&statusTransferred=false&statusCanceled=false'
    )
  }

  const summaryChips = useMemo(
    () =>
      [
        {
          key: 'overdue',
          targetId: 'attention-seg-overdue',
          color: '#dc2626',
          label: 'просроч.',
          count: getPendingAttentionCount(segmentedItems.overdue),
        },
        {
          key: 'today',
          targetId: 'attention-seg-today',
          color: '#d97706',
          label: 'сегодня',
          count: getPendingAttentionCount(segmentedItems.today),
        },
        {
          key: 'tomorrow',
          targetId: 'attention-seg-tomorrow',
          color: '#2563eb',
          label: 'завтра',
          count: getPendingAttentionCount(segmentedItems.tomorrow),
        },
        {
          key: 'messages',
          targetId: 'attention-messages',
          color: '#7c3aed',
          label: 'сообщ.',
          count: totalUnreadMessages,
        },
        {
          key: 'closePast',
          targetId: 'attention-close-past',
          color: '#dc2626',
          label: 'не закрыто',
          count: pastClosableCount,
        },
        {
          key: 'clientEvents',
          targetId: 'attention-client-events',
          color: '#0d9488',
          label: 'даты клиентов',
          count: clientEvents.length,
        },
      ].filter((chip) => chip.count > 0),
    [segmentedItems, totalUnreadMessages, pastClosableCount, clientEvents]
  )

  const scrollToSection = (id) => {
    if (typeof document === 'undefined') return
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const syncTone =
    queueSummary.conflict > 0 || queueSummary.failed > 0
      ? 'overdue'
      : queueSummary.syncing > 0
        ? 'today'
        : 'upcoming'
  const syncButtonDisabled =
    !isOnline || queueSummary.ready === 0 || queueSummary.syncing > 0
  const isOverviewPending =
    isEventsPending ||
    isTransactionsPending ||
    isClientsPending ||
    isMessengerSummaryLoading ||
    pastClosableCount === null

  if (isOverviewPending) {
    return (
      <div
        className="flex min-h-56 items-center justify-center rounded-lg border border-gray-200 p-4"
        role="status"
        aria-live="polite"
      >
        <LoadingSpinner
          size="sm"
          heightClassName="h-auto"
          text="Проверяем важные дела…"
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pb-2">
      {summaryChips.length > 0 ? (
        <div className="attention-summary">
          {summaryChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="attention-summary-chip"
              onClick={() => scrollToSection(chip.targetId)}
            >
              <span
                className="attention-summary-dot"
                style={{ background: chip.color }}
              />
              {chip.count} {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      {pastClosableCount > 0 ? (
        <ModalSection
          id="attention-close-past"
          className="attention-section attention-section--close-past"
          title="Закрытие мероприятий"
          titleClassName="card-title"
          titleRight={
            <StatusChip tone="overdue">{pastClosableCount}</StatusChip>
          }
        >
          <div className="mt-2 rounded border border-gray-200 px-3 py-2">
            <div className="text-sm font-semibold text-gray-900">
              Необходимо закрыть {getNounEvents(pastClosableCount)}
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Эти мероприятия уже завершились, но ещё не закрыты: проверьте
              оплаты и завершите их, чтобы статистика была корректной.
            </div>
            <AppButton
              variant="secondary"
              size="sm"
              className="tablet:w-auto mt-2 w-full"
              onClick={openClosePastEvents}
            >
              Закрыть прошедшие мероприятия
            </AppButton>
          </div>
        </ModalSection>
      ) : null}
      {Object.keys(SEGMENT_META).map((key) => {
        const meta = SEGMENT_META[key]
        const items = segmentedItems[key] ?? []
        return (
          <ModalSection
            key={key}
            id={`attention-seg-${key}`}
            className={`attention-section attention-section--${key}`}
            title={meta.title}
            titleClassName="card-title"
            titleRight={
              <StatusChip tone={meta.tone}>
                {getPendingAttentionCount(items)}
              </StatusChip>
            }
          >
            {items.length === 0 ? (
              <div className="mt-2 text-sm text-gray-500">{meta.emptyText}</div>
            ) : (
              <div className="mt-2 flex flex-col gap-2">
                {items.slice(0, 12).map((item, idx) => {
                  const eventAddressLine = getEventAddressLine({
                    address: item.eventAddress,
                  })
                  const keyValue = `${item.eventId}-${item.index}-${idx}`

                  if (
                    item.reminderType === 'additional' ||
                    item.reminderType === 'additional_done'
                  ) {
                    const card = (
                      <AdditionalEventCard
                        key={keyValue}
                        item={{
                          ...item,
                          displayDate:
                            item.reminderType === 'additional_done'
                              ? (item.doneAt ?? item.date)
                              : item.date,
                          displayDateLabel:
                            item.reminderType === 'additional_done'
                              ? 'Выполнено'
                              : '',
                          title: normalizeText(item.title, 'Задача'),
                          description: normalizeText(item.description),
                        }}
                        index={item.index}
                        onOpen={() =>
                          openAdditionalEventView(item.eventId, item.index)
                        }
                        onOpenEvent={() => openEvent(item.eventId)}
                        onToggleDone={(index) =>
                          toggleAdditionalEventDone(item.eventId, index)
                        }
                        onEdit={(index) =>
                          editAdditionalEvent(item.eventId, index)
                        }
                        onDelete={(index) =>
                          confirmDeleteAdditionalEvent(item.eventId, index)
                        }
                      >
                        <div className="text-xs text-gray-500">
                          {getEventTitle(item)}
                          {item.eventDate
                            ? ` • начало ${formatDateTime(
                                item.eventDate,
                                true,
                                false,
                                true,
                                false
                              )}`
                            : ''}
                        </div>
                        {eventAddressLine ? (
                          <div className="text-xs text-gray-500">
                            {eventAddressLine}
                          </div>
                        ) : null}
                        {item.reminderType === 'additional' ? (
                          <div
                            className="mt-2"
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            <QuickActionButtons
                              actions={getPostponeActionsForSegment(key).map(
                                (action) => ({
                                  key: action.key,
                                  label: action.label,
                                  variant: 'secondary',
                                  className: 'w-full tablet:w-auto',
                                  disabled:
                                    savingKey ===
                                    `${item.eventId}-${item.index}`,
                                  onClick: () =>
                                    shiftAdditionalEventDate(
                                      item.eventId,
                                      item.index,
                                      action.targetDayOffset
                                    ),
                                })
                              )}
                            />
                          </div>
                        ) : null}
                      </AdditionalEventCard>
                    )
                    return card
                  }

                  return (
                    <div
                      key={keyValue}
                      className="rounded border border-gray-200 px-3 py-2"
                    >
                      <div className="text-sm font-semibold text-gray-900">
                        {normalizeText(item.title, 'Напоминание')}
                      </div>
                      <div className="text-xs text-gray-600">
                        {item.date
                          ? formatDateTime(item.date, true, false, true, false)
                          : 'Дата не указана'}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {getEventTitle(item)}
                        {item.eventDate
                          ? ` • начало ${formatDateTime(
                              item.eventDate,
                              true,
                              false,
                              true,
                              false
                            )}`
                          : ''}
                      </div>
                      {eventAddressLine ? (
                        <div className="text-xs text-gray-500">
                          {eventAddressLine}
                        </div>
                      ) : null}
                      {item?.description ? (
                        <div className="text-xs text-gray-600">
                          {normalizeText(item.description)}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            )}
          </ModalSection>
        )
      })}

      <ModalSection
        id="attention-messages"
        className="attention-section attention-section--messages"
        title="Неотвеченные сообщения"
        titleClassName="card-title"
        titleRight={
          <StatusChip tone={totalUnreadMessages > 0 ? 'overdue' : 'upcoming'}>
            {totalUnreadMessages}
          </StatusChip>
        }
      >
        {isMessengerSummaryLoading && unreadItems.length === 0 ? (
          <div className="mt-2 text-sm text-gray-500">
            Проверяем входящие сообщения...
          </div>
        ) : isMessengerSummaryError ? (
          <div className="mt-2 text-sm text-red-600">
            Не удалось загрузить непрочитанные сообщения
          </div>
        ) : unreadItems.length === 0 ? (
          <div className="mt-2 text-sm text-gray-500">
            Неотвеченных сообщений нет
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {unreadItems.slice(0, 20).map((item) => {
              const providerNames = (item.providers || [])
                .map((provider) => PROVIDER_LABELS[provider] || provider)
                .join(', ')
              const canOpenClientMessenger = Boolean(item.clientId)
              const openCardMessenger = (event) => {
                if (
                  !canOpenClientMessenger ||
                  event.target?.closest?.('button, a')
                ) {
                  return
                }
                openClientMessenger(item.clientId)
              }
              const openCardMessengerFromKeyboard = (event) => {
                if (
                  !canOpenClientMessenger ||
                  !['Enter', ' '].includes(event.key) ||
                  event.target?.closest?.('button, a')
                ) {
                  return
                }
                event.preventDefault()
                openClientMessenger(item.clientId)
              }
              return (
                <div
                  key={item.key}
                  className={`rounded border border-gray-200 px-3 py-2 ${
                    canOpenClientMessenger
                      ? 'hover:border-general cursor-pointer transition-colors'
                      : ''
                  }`}
                  role={canOpenClientMessenger ? 'button' : undefined}
                  tabIndex={canOpenClientMessenger ? 0 : undefined}
                  aria-label={
                    canOpenClientMessenger
                      ? `Открыть диалог с клиентом ${normalizeText(
                          item.clientName,
                          'Клиент'
                        )}`
                      : undefined
                  }
                  onClick={openCardMessenger}
                  onKeyDown={openCardMessengerFromKeyboard}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="attention-msg-avatar" aria-hidden="true">
                        {getInitials(normalizeText(item.clientName, 'К'))}
                      </div>
                      <div className="min-w-0 truncate text-sm font-semibold text-gray-900">
                        {normalizeText(item.clientName, 'Клиент')}
                      </div>
                    </div>
                    <StatusChip tone="overdue">{item.unreadCount}</StatusChip>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {providerNames || 'Входящий канал'}
                    {item.lastMessageAt
                      ? ` • ${formatDateTime(
                          item.lastMessageAt,
                          true,
                          false,
                          true,
                          false
                        )}`
                      : ''}
                  </div>
                  {item.lastMessageText ? (
                    <div className="mt-1 line-clamp-2 text-xs text-gray-600">
                      {normalizeText(item.lastMessageText)}
                    </div>
                  ) : null}
                  {item.event ? (
                    <div className="mt-2 rounded border border-gray-200 px-2 py-1.5 text-xs text-gray-600">
                      <span className="font-semibold text-gray-800">
                        Ближайшее мероприятие:
                      </span>{' '}
                      {normalizeText(item.event.eventType, 'Мероприятие')}
                      {item.event.eventDate
                        ? ` • ${formatDateTime(
                            item.event.eventDate,
                            true,
                            false,
                            true,
                            false
                          )}`
                        : ''}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-gray-500">
                      Связанного ближайшего мероприятия нет
                    </div>
                  )}
                  <QuickActionButtons
                    wrapperClassName="mt-2"
                    actions={[
                      item.clientId
                        ? {
                            key: 'open-chat',
                            label: 'Открыть диалог',
                            variant: 'primary',
                            className: 'w-full tablet:w-auto',
                            onClick: () => openClientMessenger(item.clientId),
                          }
                        : null,
                      item.event?._id
                        ? {
                            key: 'open-event',
                            label: 'Открыть мероприятие',
                            variant: 'secondary',
                            className: 'w-full tablet:w-auto',
                            onClick: () => openEvent(item.event._id),
                          }
                        : null,
                    ].filter(Boolean)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </ModalSection>

      {queueSummary.total > 0 ? (
        <ModalSection
          title="Синхронизация"
          titleClassName="card-title"
          titleRight={
            <StatusChip tone={syncTone}>{queueSummary.total}</StatusChip>
          }
        >
          <div className="mt-2 rounded border border-gray-200 px-3 py-2">
            <div className="text-sm font-semibold text-gray-900">
              {isOnline
                ? queueSummary.syncing > 0
                  ? 'Синхронизация выполняется'
                  : 'Есть локальные изменения'
                : 'Нет сети'}
            </div>
            <div className="mt-1 text-xs text-gray-600">
              Ожидают отправки: {queueSummary.pending}. Готовы к повтору:{' '}
              {queueSummary.ready}. Ошибки: {queueSummary.failed}. Конфликты:{' '}
              {queueSummary.conflict}.
            </div>
            {queueSummary.waitingRetry > 0 ? (
              <div className="mt-1 text-xs text-gray-500">
                {queueSummary.waitingRetry} измен. будут повторены позже
              </div>
            ) : null}
            {queueSummary.conflict > 0 ? (
              <div className="mt-1 text-xs text-red-600">
                Есть конфликт: изменение не будет отправлено автоматически.
              </div>
            ) : null}
            <AppButton
              variant="secondary"
              size="sm"
              className="tablet:w-auto mt-2 w-full"
              disabled={syncButtonDisabled}
              onClick={requestSync}
            >
              Синхронизировать
            </AppButton>
          </div>
        </ModalSection>
      ) : null}

      <ModalSection
        id="attention-events"
        className="attention-section attention-section--events"
        title="Мероприятия на 3 дня"
        titleClassName="card-title"
        titleRight={
          <StatusChip tone="upcoming">{upcomingEvents.length}</StatusChip>
        }
      >
        {upcomingEvents.length === 0 ? (
          <div className="mt-2 text-sm text-gray-500">
            В ближайшие 3 дня мероприятий нет
          </div>
        ) : (
          <div className="mt-2 grid min-w-0">
            {upcomingEvents.slice(0, 12).map((event) => (
              <EventCard
                key={event._id}
                eventId={event._id}
                event={event}
                transactions={transactions}
                noHorizontalPadding
              />
            ))}
          </div>
        )}
      </ModalSection>

      {clientEvents.length > 0 ? (
        <ModalSection
          id="attention-client-events"
          className="attention-section attention-section--client-events"
          title="События клиентов"
          titleClassName="card-title"
          titleRight={
            <StatusChip tone="upcoming">{clientEvents.length}</StatusChip>
          }
        >
          <div className="mt-2 flex flex-col gap-2">
            {clientEvents.slice(0, 12).map((item) => (
              <button
                key={`${item.client?._id}-${item.title}-${item.nextDate.toISOString()}`}
                type="button"
                className="hover:border-general flex cursor-pointer items-start justify-between gap-3 rounded border border-gray-200 px-3 py-2 text-left transition-colors"
                onClick={() => openClientCard(item.client?._id)}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">
                    {item.title}
                  </div>
                  <div className="truncate text-xs text-gray-600">
                    {getPersonFullName(item.client, { fallback: 'Без имени' })}
                  </div>
                  {item.comment ? (
                    <div className="mt-1 line-clamp-2 text-xs text-gray-500">
                      {item.comment}
                    </div>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {formatClientEventDate(item.nextDate)}
                  </div>
                  <div className="text-xs font-medium text-gray-500">
                    {formatClientEventDaysLeft(item.daysLeft)}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ModalSection>
      ) : null}
    </div>
  )
}

const upcomingEventsOverviewFunc = () => ({
  title: 'Требует внимания',
  confirmButtonName: 'Закрыть',
  showDecline: false,
  onConfirm: true,
  Children: UpcomingEventsOverview,
})

export default upcomingEventsOverviewFunc
