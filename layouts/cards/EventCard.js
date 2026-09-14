'use client'

import cn from 'classnames'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import { isEventImportChecked } from '@helpers/fileImport.mjs'
import Image from 'next/image'
import { EVENT_STATUSES, EVENT_STATUSES_SIMPLE } from '@helpers/constants'
import formatDate from '@helpers/formatDate'
import formatAddress from '@helpers/formatAddress'
import { modalsFuncAtom } from '@state/atoms'
import servicesAtom from '@state/atoms/servicesAtom'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faShare,
  faTriangleExclamation,
  faFileContract,
  // faCircleCheck,
  // faBan,
  faUserSlash,
  faCalendarXmark,
  // faClock,
} from '@fortawesome/free-solid-svg-icons'
import CardButtons from '@components/CardButtons'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import CardWrapper from '@components/CardWrapper'
import DropDown from '@components/DropDown'
import StatusChip from '@components/StatusChip'
import { getSoonNoDepositEvents } from '@helpers/additionalEvents'
import getGoogleCalendarLinkFromText from '@helpers/getGoogleCalendarLinkFromText'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  getEventPublicApiSourceLabel,
  isEventCreatedViaPublicApi,
} from '@helpers/eventSource'
import { getEventExtraContactDisplays } from '@helpers/eventTransferDisplay'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventQuery } from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'
import { getEventCloseSuggestionState } from '@helpers/eventCloseSuggestion'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

// const CALENDAR_RESPONSE_MARKER = '--- Google Calendar Response ---'

const getEventCardDateParts = (value) => {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) {
    return { day: '—', monthWeekday: '', time: '' }
  }

  const month = date
    .toLocaleDateString('ru-RU', { month: 'short' })
    .replace('.', '')
  const weekday = date
    .toLocaleDateString('ru-RU', { weekday: 'short' })
    .replace('.', '')

  return {
    day: String(date.getDate()).padStart(2, '0'),
    month,
    weekday,
    time: date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    }),
  }
}

const getAdditionalEventTone = (date, nowDate) => {
  if (date.getTime() < nowDate.getTime()) return 'overdue'

  const isToday =
    date.getFullYear() === nowDate.getFullYear() &&
    date.getMonth() === nowDate.getMonth() &&
    date.getDate() === nowDate.getDate()
  if (isToday) return 'today'

  const tomorrow = new Date(nowDate)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()

  return isTomorrow ? 'tomorrow' : 'upcoming'
}

const getEventStatusMarkerClassName = ({
  isCanceled,
  isClosed,
  isDraft,
  isFinished,
}) => {
  if (isCanceled) return 'bg-red-500'
  if (isClosed) return 'bg-emerald-500'
  if (isFinished) return 'bg-gray-400'
  if (isDraft) return 'bg-amber-500'
  return 'bg-blue-500'
}

// const stripCalendarResponse = (text = '') => {
//   const marker = `\n\n${CALENDAR_RESPONSE_MARKER}\n`
//   const markerIndex = text.indexOf(marker)
//   if (markerIndex === -1) return text.trim()
//   return text.slice(0, markerIndex).trim()
// }

const EventCard = ({
  eventId,
  style,
  event: eventProp,
  transactions: transactionsProp,
  noHorizontalPadding = false,
}) => {
  const { data: cachedEvent } = useEventQuery(eventId, eventProp)
  const event = eventProp ?? cachedEvent
  const { data: clients = [] } = useClientsQuery()
  const client = useMemo(
    () => clients.find((item) => item._id === event?.clientId) ?? null,
    [clients, event?.clientId]
  )
  const extraContactDisplays = useMemo(
    () => getEventExtraContactDisplays(event, clients),
    [clients, event]
  )
  const { data: cachedTransactions = [] } = useTransactionsQuery(undefined, {
    enabled: false,
  })
  const transactions = transactionsProp ?? cachedTransactions
  const services = useAtomValue(servicesAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loading = useAtomValue(loadingAtom('event' + eventId))
  const error = useAtomValue(errorAtom('event' + eventId))
  const siteSettings = useAtomValue(siteSettingsAtom)
  const terms = resolveWorkItemTerminology(siteSettings)

  const calendarLink = useMemo(() => {
    return getGoogleCalendarLinkFromText(event?.description)
  }, [event?.description])

  const eventTitle = useMemo(() => {
    const title =
      typeof event?.eventType === 'string' ? event.eventType.trim() : ''
    return title || 'Событие не указано'
  }, [event?.eventType])

  const servicesTitle = useMemo(() => {
    const servicesIds = event?.servicesIds ?? []
    if (!servicesIds.length) return 'Услуга не указана'
    const titles = services
      .filter((service) => servicesIds.includes(service._id))
      .map((service) => service.title)
      .filter(Boolean)
    return titles.length > 0 ? titles.join(', ') : 'Услуга не указана'
  }, [event?.servicesIds, services])

  const { contractSum, paid, net, status, hasObligations } = useMemo(() => {
    if (!event)
      return {
        contractSum: 0,
        paid: 0,
        net: 0,
        status: null,
        hasObligations: false,
      }

    const eventTransactions = transactions
      .filter((transaction) => transaction.eventId === event._id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const contractSumValue = Number(event.contractSum ?? 0)
    const totals = eventTransactions.reduce(
      (result, transaction) => {
        const amount = Number(transaction.amount ?? 0)
        if (!Number.isFinite(amount)) return result
        if (transaction.type === 'income') result.income += amount
        if (transaction.type === 'expense') result.expense += amount
        return result
      },
      { income: 0, expense: 0 }
    )
    const statusValue =
      EVENT_STATUSES_SIMPLE.find((item) => item.value === event.status) ??
      EVENT_STATUSES.find((item) => item.value === event.status)
    const closeState = getEventCloseSuggestionState(
      {
        status: event.status,
        contractSum: contractSumValue,
        isByContract: event?.isByContract,
        eventDate: event?.eventDate,
        dateEnd: event?.dateEnd,
      },
      eventTransactions
    )

    return {
      contractSum: contractSumValue,
      paid: totals.income,
      net: totals.income - totals.expense,
      status: statusValue,
      hasObligations: closeState.hasObligations,
    }
  }, [event, transactions])

  const eventStart = event?.eventDate ? new Date(event.eventDate) : null
  const eventEnd = event?.dateEnd ? new Date(event.dateEnd) : eventStart
  const now = new Date()
  const rawStatus = status?.value ?? event.status
  const needsCheck = !isEventImportChecked(event)
  const hasCalendarError = Boolean(event?.calendarSyncError)
  const isCanceled = rawStatus === 'canceled'
  const isClosed = rawStatus === 'closed'
  const isDraft = rawStatus === 'draft'
  // const isActive = rawStatus === 'active'
  const isFinished =
    !isCanceled && !isClosed && eventEnd && eventEnd.getTime() < now.getTime()
  const statusMarkerClassName = getEventStatusMarkerClassName({
    isCanceled,
    isClosed,
    isDraft,
    isFinished,
  })
  const coordsLink =
    event?.address?.latitude && event?.address?.longitude
      ? `dgis://2gis.ru/geo/${event.address.longitude},${event.address.latitude}`
      : null
  const searchAddress =
    event?.address?.town && event?.address?.street && event?.address?.house
      ? `${event.address.town}, ${event.address.street}, ${event.address.house}`
      : null
  const searchLink = searchAddress
    ? `https://2gis.ru/search/${encodeURIComponent(searchAddress).replaceAll(
        '%20',
        ''
      )}`
    : null
  const mapLink = event?.address?.link2Gis || coordsLink || searchLink
  const displayAddress = useMemo(() => {
    const address = event?.address
    if (!address) return address
    const defaultTown = siteSettings?.defaultTown
    if (!defaultTown || !address?.town) return address
    const normalizedTown = String(address.town).trim().toLowerCase()
    const normalizedDefaultTown = String(defaultTown).trim().toLowerCase()
    if (normalizedTown !== normalizedDefaultTown) return address
    return { ...address, town: '' }
  }, [event?.address, siteSettings?.defaultTown])

  const hasSoonNoDepositWarning = useMemo(() => {
    if (!event?._id) return false
    const items = getSoonNoDepositEvents([event], transactions, new Date(), 3)
    return items.length > 0
  }, [event, transactions])

  const isCreatedViaApi = isEventCreatedViaPublicApi(event)
  const apiSourceLabel = getEventPublicApiSourceLabel(event)

  const nearestAdditionalEventInfo = useMemo(() => {
    const additionalEvents = Array.isArray(event?.additionalEvents)
      ? event.additionalEvents
      : []
    if (additionalEvents.length === 0) return null

    const nowDate = new Date()
    const prepared = additionalEvents
      .map((item) => {
        if (item?.done) return null
        const date = item?.date ? new Date(item.date) : null
        if (!date || Number.isNaN(date.getTime())) return null
        return {
          title: item?.title || 'Задача',
          date,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    if (prepared.length === 0) return null

    const overdueItems = prepared.filter(
      (item) => item.date.getTime() < nowDate.getTime()
    )
    const upcomingItems = prepared.filter(
      (item) => item.date.getTime() >= nowDate.getTime()
    )
    const orderedItems = overdueItems.slice().reverse().concat(upcomingItems)
    const nearest = orderedItems[0]
    if (!nearest) return null

    const tone = getAdditionalEventTone(nearest.date, nowDate)
    const nextTone = orderedItems[1]
      ? getAdditionalEventTone(orderedItems[1].date, nowDate)
      : null
    const timeLabel = nearest.date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })
    const prefix =
      tone === 'today'
        ? 'Сегодня'
        : tone === 'tomorrow'
          ? 'Завтра'
          : formatDate(nearest.date)
    return {
      title: nearest.title,
      label: `${prefix} ${timeLabel}`,
      tone,
      nextTone,
      totalCount: prepared.length,
      remainingCount: prepared.length - 1,
    }
  }, [event?.additionalEvents])

  const hiddenAdditionalCount = hasSoonNoDepositWarning
    ? (nearestAdditionalEventInfo?.totalCount ?? 0)
    : (nearestAdditionalEventInfo?.remainingCount ?? 0)

  const additionalStatusTone = hasSoonNoDepositWarning
    ? 'overdue'
    : (nearestAdditionalEventInfo?.tone ?? 'neutral')
  const hiddenAdditionalStatusTone = hasSoonNoDepositWarning
    ? (nearestAdditionalEventInfo?.tone ?? 'overdue')
    : (nearestAdditionalEventInfo?.nextTone ?? additionalStatusTone)

  if (!event) return null
  const eventCardDate = getEventCardDateParts(event.eventDate)

  return (
    <CardWrapper
      style={style}
      outerClassName={cn(noHorizontalPadding ? '' : 'px-2', 'py-1')}
      onClick={() => !loading && modalsFunc.event?.view(event._id)}
      onSwipeLeft={() => !loading && modalsFunc.event?.edit(event._id)}
      onSwipeRight={() => !loading && modalsFunc.event?.delete(event._id)}
      className="event-card-shell card-body-pad laptop:flex-row laptop:items-start laptop:gap-4 flex min-h-[160px] cursor-pointer flex-col gap-x-3 gap-y-1 overflow-hidden rounded-lg py-3 pr-3 pl-4"
      noHorizontalPadding
    >
      <CardOverlay loading={loading} error={error} />
      <CardActions className="!top-0 !right-0">
        <CardButtons
          item={event}
          typeOfItem="event"
          minimalActions
          alwaysCompact
          compactTriggerClassName="card-menu-trigger h-10 min-h-10 w-10"
          calendarLink={calendarLink}
          onEdit={() => modalsFunc.event?.edit(event._id)}
          onEditClientContacts={() =>
            modalsFunc.event?.edit(event._id, {
              initialTab: 'Клиент и Контакты',
            })
          }
          onEditFinanceDocs={() =>
            modalsFunc.event?.edit(event._id, {
              initialTab: 'Финансы и Документы',
            })
          }
          showEditButton={!isClosed}
        />
      </CardActions>
      <div
        className={`absolute top-3 bottom-3 left-0 w-1 rounded-r-full ${statusMarkerClassName}`}
        aria-hidden="true"
      />
      <div className="grid h-full w-full grid-cols-[58px_minmax(0,1fr)_auto] grid-rows-[auto_1fr_auto] gap-x-3 pr-1 pl-1">
        <div className="col-span-3 flex min-w-0 items-center gap-2 border-b border-gray-200 pr-11 pb-2">
          {event.isTransferred ? (
            <FontAwesomeIcon
              icon={faShare}
              className="h-4 w-4 shrink-0 text-amber-500"
              aria-label="Передано коллеге"
            />
          ) : null}
          {event.isByContract ? (
            <FontAwesomeIcon
              icon={faFileContract}
              className="h-4 w-4 shrink-0 text-blue-600"
              aria-label={`${terms.labelCapitalized} по договору`}
            />
          ) : null}
          {needsCheck ? (
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="h-4 w-4 shrink-0 text-amber-500"
              aria-label={
                event.importedFromFile
                  ? 'Импорт из файла не проверен'
                  : `Проверка ${terms.genitive} не завершена`
              }
            />
          ) : null}
          {event.importedFromFile ? (
            <span className="text-xs" title={event.fileImportName}>
              Из файла{needsCheck ? ' · Не проверено' : ''}
            </span>
          ) : null}
          {hasCalendarError ? (
            <FontAwesomeIcon
              icon={faCalendarXmark}
              className="h-4 w-4 shrink-0 text-red-500"
              aria-label="Синхронизация с календарем не выполнена"
            />
          ) : null}
          {!client ? (
            <FontAwesomeIcon
              icon={faUserSlash}
              className="h-4 w-4 shrink-0 text-red-500"
              aria-label="Клиент не указан"
            />
          ) : null}
          <div className="card-title min-w-0 flex-1 truncate text-base">
            {[eventTitle, servicesTitle].join(' • ')}
          </div>
        </div>

        <div className="flex flex-col border-r border-gray-200 py-2 pr-3 text-center">
          <div className="flex items-baseline gap-x-1">
            <span className="text-sm font-medium whitespace-nowrap uppercase">
              {eventCardDate.weekday}
            </span>
            <span className="card-title text-2xl leading-none">
              {eventCardDate.day}
            </span>
          </div>
          <span className="text-general text-base font-medium whitespace-nowrap">
            {eventCardDate.month}
          </span>
          <span className="card-meta mt-0.5 text-sm">{eventCardDate.time}</span>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-1 py-2">
          <div className="card-meta flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate">
              {formatAddress(displayAddress, '-')}
            </span>
            {mapLink ? (
              <a
                href={mapLink}
                target="_blank"
                rel="noreferrer"
                title="Открыть в 2ГИС"
                onClick={(clickEvent) => clickEvent.stopPropagation()}
                className="flex h-7 w-7 shrink-0 items-center justify-center transition-transform hover:scale-110"
              >
                <Image
                  src="/img/navigators/2gis.webp"
                  alt="2gis"
                  width={16}
                  height={16}
                  className="h-4 w-4"
                />
              </a>
            ) : null}
          </div>

          <div className="flex min-h-10 items-center gap-1 overflow-hidden">
            {hasSoonNoDepositWarning ? (
              <StatusChip tone="overdue">
                <span className="truncate">Просрочен задаток</span>
              </StatusChip>
            ) : nearestAdditionalEventInfo ? (
              <StatusChip
                tone={additionalStatusTone}
                className="event-additional-status-chip"
              >
                <span className="event-additional-status-chip__date truncate">
                  {nearestAdditionalEventInfo.label}
                </span>
                <span className="event-additional-status-chip__title truncate">
                  {nearestAdditionalEventInfo.title}
                </span>
              </StatusChip>
            ) : null}
            {hiddenAdditionalCount > 0 ? (
              <StatusChip
                tone={hiddenAdditionalStatusTone}
                className="shrink-0"
              >
                +{hiddenAdditionalCount}
              </StatusChip>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-[92px] flex-col items-end justify-center gap-1.5 py-2 text-right">
          {hasObligations ? (
            <span className="flex h-5 items-center justify-center rounded-full bg-amber-100 px-2 text-[11px] font-semibold text-amber-800">
              Обязательство
            </span>
          ) : null}
          {isCreatedViaApi ? (
            <StatusChip tone="neutral" className="max-w-max shrink-0">
              {apiSourceLabel}
            </StatusChip>
          ) : null}
          {isClosed ? (
            <span
              className={`event-profit-badge flex min-w-[92px] items-center justify-center rounded-full border px-3 py-1.5 text-base font-semibold whitespace-nowrap ${
                net > 0
                  ? 'event-profit-card event-profit-text'
                  : net < 0
                    ? 'event-profit-card--negative event-profit-text--negative'
                    : 'event-profit-card--zero event-profit-text--zero'
              }`}
              title={`Итог ${terms.genitive}: получено минус потрачено`}
            >
              {net.toLocaleString()} ₽
            </span>
          ) : (
            <span className="card-title text-base font-semibold whitespace-nowrap">
              {paid > 0 || contractSum > 0 ? (
                paid === contractSum ? (
                  <span className="text-emerald-600">
                    {paid.toLocaleString()} ₽
                  </span>
                ) : (
                  <>
                    {paid > 0 ? (
                      <span className="text-emerald-600">
                        {paid.toLocaleString()}
                      </span>
                    ) : null}
                    {paid > 0 && contractSum > 0 ? ' / ' : null}
                    {contractSum > 0 ? contractSum.toLocaleString() : null} ₽
                  </>
                )
              ) : (
                '—'
              )}
            </span>
          )}
        </div>

        <div className="col-span-3 flex min-h-11 min-w-0 flex-nowrap items-center gap-2 border-t border-gray-200 pt-2 text-sm">
          <span className="min-w-0 truncate">
            {client ? getPersonFullName(client, { fallback: client._id }) : '-'}
          </span>
          {client ? (
            <div
              className="ml-auto shrink-0"
              onClick={(event) => event.stopPropagation()}
            >
              <ContactsIconsButtons
                user={client}
                showChat
                compactButtons
                className="my-0 justify-end"
              />
            </div>
          ) : null}
          {extraContactDisplays.length > 0 ? (
            <div onClick={(event) => event.stopPropagation()}>
              <DropDown
                trigger={
                  <button
                    type="button"
                    className="contact-quick-button flex h-9 min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg border px-2 text-xs font-semibold text-[var(--ui-primary)] transition"
                    aria-label={`Показать дополнительные контакты: ${extraContactDisplays.length}`}
                  >
                    +{extraContactDisplays.length}
                  </button>
                }
                placement="right"
                menuPadding="sm"
                menuClassName="w-[min(340px,calc(100vw-24px))] items-stretch justify-start !border-gray-200 !bg-white"
                renderInPortal
                turnOffAutoClose="inside"
              >
                <div
                  className="flex w-full flex-col gap-2 p-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="text-sm font-semibold text-gray-900">
                    Дополнительные контакты
                  </div>
                  {extraContactDisplays.map((contact) => (
                    <div
                      key={contact.key}
                      className="rounded-md border border-gray-200 bg-gray-50 px-2 py-2"
                    >
                      <div className="text-sm font-semibold text-gray-800">
                        {contact.label}
                      </div>
                      {contact.comment ? (
                        <div className="text-xs text-gray-600">
                          {contact.comment}
                        </div>
                      ) : null}
                      <ContactsIconsButtons
                        user={contact.client}
                        showChat
                        compactButtons
                        className="mt-1"
                      />
                    </div>
                  ))}
                </div>
              </DropDown>
            </div>
          ) : null}
        </div>
      </div>
    </CardWrapper>
  )
}

export default EventCard
