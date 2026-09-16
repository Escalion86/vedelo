import CardButtons from '@components/CardButtons'
import Chip from '@components/Chips/Chip'
import cn from 'classnames'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import { faCopy } from '@fortawesome/free-solid-svg-icons/faCopy'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import ImageGallery from '@components/ImageGallery'
import Notice from '@components/Notice'
import SurfaceCard from '@components/SurfaceCard'
import TextLine from '@components/TextLine'
import formatAddress from '@helpers/formatAddress'
import formatDateTime from '@helpers/formatDateTime'
import { formatMoney } from '@helpers/formatMoney'
import formatMinutes from '@helpers/formatMinutes'
import { formatPhoneWithPlus } from '@helpers/phoneUi'
import getGoogleCalendarLinkFromText from '@helpers/getGoogleCalendarLinkFromText'
import getEventDuration from '@helpers/getEventDuration'
import getPersonFullName from '@helpers/getPersonFullName'
import { getEventTransferDisplay } from '@helpers/eventTransferDisplay'
import Image from 'next/image'
import sanitizeHtml from '@helpers/sanitizeHtml'
import { getAdditionalEventsDisplayGroups } from '@helpers/additionalEvents'
import { useEffect, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import servicesAtom from '@state/atoms/servicesAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { modalsFuncAtom } from '@state/atoms'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import {
  TRANSACTION_CATEGORIES,
  TRANSACTION_PAYMENT_METHODS,
} from '@helpers/constants'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventQuery } from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'
import {
  getCloseBlockedByObligationsMessage,
  getTransactionDateLabel,
  hasObligationPaymentMethod,
  OBLIGATION_PAYMENT_METHOD,
} from '@helpers/transactionObligation'
import AdditionalEventCard, {
  AdditionalEventCardSkeleton,
} from './AdditionalEventCard'
import openEventAdditionalEventEditorModal from './eventAdditionalEventEditorModal'
import openEventAdditionalEventViewModal from './eventAdditionalEventViewModal'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const EVENT_STATUS_META = Object.freeze({
  draft: {
    label: 'Заявка',
    className: 'event-view-status event-view-status--draft',
  },
  active: {
    label: 'Подтверждено',
    className: 'event-view-status event-view-status--active',
  },
  canceled: {
    label: 'Отменено',
    className: 'event-view-status event-view-status--canceled',
  },
  finished: {
    label: 'Завершено',
    className: 'event-view-status event-view-status--finished',
  },
  closed: {
    label: 'Закрыто',
    className: 'event-view-status event-view-status--closed',
  },
})

const TRANSACTION_CATEGORY_NAMES = new Map(
  TRANSACTION_CATEGORIES.map((item) => [item.value, item.name])
)
const TRANSACTION_PAYMENT_METHOD_NAMES = new Map(
  TRANSACTION_PAYMENT_METHODS.map((item) => [item.value, item.name])
)

const getTransactionAmount = (transaction) => {
  const amount = Number(transaction?.amount ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

const formatTransactionDate = (value) => {
  if (!value) return 'не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'не указана'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const FinanceMetric = ({ label, value, valueClassName = 'text-gray-900' }) => (
  <div className="event-view-kpi min-w-0 rounded-lg border border-gray-200 bg-gray-50 p-2">
    <div className="text-[11px] text-gray-500">{label}</div>
    <div className={`break-words text-base font-semibold ${valueClassName}`}>
      {value}
    </div>
  </div>
)

const EventFinanceSection = ({ event, transactions, terms }) => {
  const summary = useMemo(() => {
    const sortedTransactions = [...transactions].sort(
      (a, b) =>
        new Date(b?.date ?? 0).getTime() - new Date(a?.date ?? 0).getTime()
    )
    const actualTransactions = sortedTransactions.filter(
      (item) => item?.paymentMethod !== OBLIGATION_PAYMENT_METHOD
    )
    const income = actualTransactions
      .filter((item) => item?.type === 'income')
      .reduce((total, item) => total + getTransactionAmount(item), 0)
    const expense = actualTransactions
      .filter((item) => item?.type === 'expense')
      .reduce((total, item) => total + getTransactionAmount(item), 0)
    const rawContractSum = Number(event?.contractSum ?? 0)
    const contractSum = Number.isFinite(rawContractSum) ? rawContractSum : 0

    return {
      contractSum,
      income,
      expense,
      profit: income - expense,
      paymentLeft: contractSum - income,
      sortedTransactions,
    }
  }, [event?.contractSum, transactions])

  const paymentStatus =
    summary.contractSum <= 0
      ? 'Договорная сумма не указана'
      : summary.paymentLeft > 0
        ? `Осталось получить ${formatMoney(summary.paymentLeft)}`
        : summary.paymentLeft < 0
          ? `Переплата ${formatMoney(Math.abs(summary.paymentLeft))}`
          : 'Оплачено полностью'

  return (
    <SectionBlock title="Финансы">
      <div className="grid grid-cols-2 gap-2 tablet:grid-cols-4">
        <FinanceMetric
          label="Договорная сумма"
          value={
            summary.contractSum > 0 ? formatMoney(summary.contractSum) : '—'
          }
        />
        <FinanceMetric
          label="Получено"
          value={formatMoney(summary.income)}
          valueClassName="text-emerald-700"
        />
        <FinanceMetric
          label="Расходы"
          value={formatMoney(summary.expense)}
          valueClassName="text-red-700"
        />
        <FinanceMetric
          label="Итог"
          value={formatMoney(summary.profit)}
          valueClassName={
            summary.profit > 0
              ? 'text-emerald-700'
              : summary.profit < 0
                ? 'text-red-700'
                : 'text-gray-900'
          }
        />
      </div>

      <Notice
        tone={
          summary.contractSum <= 0
            ? 'neutral'
            : summary.paymentLeft > 0
              ? 'warning'
              : 'success'
        }
        className="mt-2 font-semibold"
      >
        {paymentStatus}
      </Notice>

      <div className="mt-3">
        <div className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Операции ({summary.sortedTransactions.length})
        </div>
        {summary.sortedTransactions.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-sm text-gray-500">
            Транзакций по {terms.dative} нет
          </div>
        ) : (
          <div className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
            {summary.sortedTransactions.map((transaction, index) => {
              const isIncome = transaction?.type === 'income'
              const isObligation =
                transaction?.paymentMethod === OBLIGATION_PAYMENT_METHOD
              const categoryName =
                TRANSACTION_CATEGORY_NAMES.get(transaction?.category) ||
                transaction?.category ||
                'Без категории'
              const paymentMethodName =
                TRANSACTION_PAYMENT_METHOD_NAMES.get(
                  transaction?.paymentMethod
                ) || transaction?.paymentMethod

              return (
                <div
                  key={transaction?._id ?? `${transaction?.date}-${index}`}
                  className="flex flex-col gap-1 px-3 py-3 tablet:flex-row tablet:items-start tablet:justify-between tablet:gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={`font-semibold ${
                          isIncome ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {isIncome ? '+' : '−'}
                        {formatMoney(getTransactionAmount(transaction))}
                      </span>
                      <span className="text-sm text-gray-700">
                        {categoryName}
                      </span>
                      {isObligation ? (
                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          Обязательство
                        </span>
                      ) : null}
                    </div>
                    {transaction?.comment ? (
                      <div className="mt-1 break-words text-sm text-gray-600">
                        {transaction.comment}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-xs text-gray-500 tablet:text-right">
                    <div>
                      {getTransactionDateLabel(transaction?.paymentMethod)}:{' '}
                      {formatTransactionDate(transaction?.date)}
                    </div>
                    {paymentMethodName ? <div>{paymentMethodName}</div> : null}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionBlock>
  )
}

const getClientContactItems = (client) => {
  if (!client || typeof client !== 'object') return []
  return [
    {
      key: 'phone',
      label: 'Телефон',
      value: formatPhoneWithPlus(client.phone),
      canCopy: true,
    },
    { key: 'whatsapp', label: 'WhatsApp', value: client.whatsapp },
    { key: 'viber', label: 'Viber', value: client.viber },
    { key: 'telegram', label: 'Telegram', value: client.telegram },
    { key: 'instagram', label: 'Instagram', value: client.instagram },
    { key: 'vk', label: 'VK', value: client.vk },
    { key: 'max', label: 'MAX', value: client.max },
    { key: 'email', label: 'Email', value: client.email },
  ].filter((item) => item.value)
}

const ClientContactLines = ({ client }) =>
  getClientContactItems(client).map((item) => (
    <div
      key={item.key}
      className="flex min-h-6 items-center gap-1 text-xs text-gray-600"
    >
      <span className="min-w-0 break-all">
        {item.label}: {item.value}
      </span>
      {item.canCopy ? (
        <button
          type="button"
          className="flex h-6 min-w-6 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 transition hover:bg-gray-200 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-[var(--ui-primary)]/40 focus-visible:outline-none"
          onClick={(event) => {
            event.stopPropagation()
            if (!navigator.clipboard) return
            navigator.clipboard.writeText(item.value).catch(() => {})
          }}
          onKeyDown={(event) => event.stopPropagation()}
          title="Скопировать номер телефона"
          aria-label={`Скопировать номер телефона ${item.value}`}
        >
          <FontAwesomeIcon icon={faCopy} className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  ))

const SectionBlock = ({ title, children }) => (
  <SurfaceCard>
    {title ? (
      <div className="mb-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {title}
      </div>
    ) : null}
    {children}
  </SurfaceCard>
)

const CardButtonsComponent = ({ event, calendarLink }) => (
  <CardButtons
    item={event}
    typeOfItem="event"
    minimalActions
    alwaysCompact
    calendarLink={calendarLink}
    dropDownPlacement="left"
    showEditButton={event?.status !== 'closed'}
  />
)

const eventViewFunc = (eventId, options = {}) => {
  const configTerms = resolveWorkItemTerminology(options.siteSettings)
  const EventViewModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
    setTopLeftComponent,
  }) => {
    const { data: event, isPending, isError } = useEventQuery(eventId)
    const services = useAtomValue(servicesAtom)
    const { data: transactions = [] } = useTransactionsQuery(undefined, {
      enabled: false,
    })
    const { data: clients = [] } = useClientsQuery()
    const siteSettings = useAtomValue(siteSettingsAtom)
    const terms = resolveWorkItemTerminology(siteSettings)
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const itemsFunc = useAtomValue(itemsFuncAtom)
    const [pendingAdditionalEventIndex, setPendingAdditionalEventIndex] =
      useState(null)

    const duration = getEventDuration(event)
    const additionalEvents = useMemo(
      () =>
        Array.isArray(event?.additionalEvents) ? event.additionalEvents : [],
      [event?.additionalEvents]
    )
    const additionalEventGroups = useMemo(
      () => getAdditionalEventsDisplayGroups(additionalEvents),
      [additionalEvents]
    )
    const statusMeta =
      EVENT_STATUS_META[event?.status] || EVENT_STATUS_META.active

    const calendarLink = useMemo(() => {
      return getGoogleCalendarLinkFromText(event?.description)
    }, [event?.description])
    const serviceTitles = (event?.servicesIds ?? [])
      .map((serviceId) => services.find((item) => item._id === serviceId))
      .filter(Boolean)
      .map((service) => service.title)
    const mainClient = useMemo(
      () => clients.find((item) => item._id === event?.clientId) ?? null,
      [clients, event?.clientId]
    )
    const transferDisplay = useMemo(
      () => getEventTransferDisplay(event, clients),
      [clients, event]
    )
    const otherContacts = useMemo(() => {
      const contacts = Array.isArray(event?.otherContacts)
        ? event.otherContacts
        : []
      return contacts
        .map((contact) => {
          if (!contact?.clientId && !contact?.comment) return null
          const client = clients.find((item) => item._id === contact?.clientId)
          const name = getPersonFullName(client)
          return {
            client,
            label: name || contact?.clientId || 'Контакт',
            comment: contact?.comment ? String(contact.comment) : '',
          }
        })
        .filter(Boolean)
    }, [clients, event?.otherContacts])
    const tagItems = useMemo(() => {
      const list = Array.isArray(event?.tags) ? event.tags : []
      const eventsTags = siteSettings?.eventsTags ?? []
      const map = new Map(
        eventsTags
          .filter((item) => item?.text)
          .map((item) => [String(item.text).toLowerCase(), item.color])
      )
      return list
        .map((value) => String(value).trim())
        .filter(Boolean)
        .map((value) => ({
          value,
          color: map.get(value.toLowerCase()) || '#f3f4f6',
        }))
    }, [event?.tags, siteSettings?.eventsTags])
    const eventTransactions = useMemo(
      () =>
        (transactions ?? []).filter(
          (transaction) => transaction.eventId === event?._id
        ),
      [event?._id, transactions]
    )
    const hasObligations = useMemo(
      () => hasObligationPaymentMethod(eventTransactions),
      [eventTransactions]
    )

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

    const updateAdditionalEvents = async (nextItems) => {
      if (!event?._id) return
      await itemsFunc?.event?.set(
        {
          _id: event._id,
          additionalEvents: nextItems,
        },
        false,
        true
      )
    }

    const editAdditionalEvent = (index) => {
      const sourceItems = Array.isArray(event?.additionalEvents)
        ? event.additionalEvents
        : []
      const sourceItem = sourceItems[index]
      if (!sourceItem) return
      openEventAdditionalEventEditorModal({
        modalsFunc,
        index,
        sourceItem,
        onConfirm: async (nextItem) => {
          const currentItems = Array.isArray(event?.additionalEvents)
            ? event.additionalEvents
            : []
          const nextItems = currentItems.map((item, idx) =>
            idx === index ? { ...item, ...nextItem } : item
          )
          setPendingAdditionalEventIndex(index)
          try {
            await updateAdditionalEvents(nextItems)
          } finally {
            setPendingAdditionalEventIndex(null)
          }
        },
      })
    }

    const toggleAdditionalEventDone = async (index) => {
      const sourceItems = Array.isArray(event?.additionalEvents)
        ? event.additionalEvents
        : []
      const target = sourceItems[index]
      if (!target) return
      const nextItems = sourceItems.map((item, idx) =>
        idx === index
          ? {
              ...item,
              done: !Boolean(item?.done),
              doneAt: !Boolean(item?.done) ? new Date().toISOString() : null,
            }
          : item
      )
      await updateAdditionalEvents(nextItems)
    }

    const deleteAdditionalEvent = async (index) => {
      const sourceItems = Array.isArray(event?.additionalEvents)
        ? event.additionalEvents
        : []
      if (!sourceItems[index]) return
      const nextItems = sourceItems.filter((_, idx) => idx !== index)
      await updateAdditionalEvents(nextItems)
    }

    const confirmDeleteAdditionalEvent = (index) => {
      const sourceItems = Array.isArray(event?.additionalEvents)
        ? event.additionalEvents
        : []
      if (!sourceItems[index]) return
      modalsFunc.confirm({
        title: 'Удаление задачи',
        text: 'Удалить эту задачу?',
        onConfirm: async () => {
          await deleteAdditionalEvent(index)
        },
      })
    }

    const openAdditionalEventView = (index) => {
      const sourceItems = Array.isArray(event?.additionalEvents)
        ? event.additionalEvents
        : []
      const sourceItem = sourceItems[index]
      if (!sourceItem) return
      openEventAdditionalEventViewModal({
        modalsFunc,
        event,
        item: sourceItem,
        index,
        onToggleDone: toggleAdditionalEventDone,
        onEdit: editAdditionalEvent,
        onDelete: deleteAdditionalEvent,
      })
    }

    const openClientView = (client) => {
      if (!client?._id) return
      modalsFunc.client?.view(client._id)
    }

    const getClientCardProps = (client) => {
      if (!client?._id) return {}
      return {
        role: 'button',
        tabIndex: 0,
        onClick: () => openClientView(client),
        onKeyDown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          openClientView(client)
        },
      }
    }

    useEffect(() => {
      if (setTopLeftComponent) {
        if (!event?._id) {
          setTopLeftComponent(null)
          return
        }
        setTopLeftComponent(() => (
          <CardButtonsComponent event={event} calendarLink={calendarLink} />
        ))
      }
    }, [event, calendarLink, setTopLeftComponent])

    if (!event && eventId && isPending)
      return <Notice tone="neutral">Загружаем {terms.accusative}…</Notice>

    if (!event?._id || !eventId)
      return (
        <Notice tone="error">
          {isError
            ? `Не удалось загрузить ${terms.accusative}. Попробуйте открыть его ещё раз.`
            : `${terms.labelCapitalized} не найден${terms.mode === 'events' ? 'о' : ''}.`}
        </Notice>
      )

    return (
      <div className="flex flex-col gap-y-3">
        {event.importedFromFile ? <Notice tone={event.fileImportChecked ? 'neutral' : 'warning'}>
          <p>{event.fileImportChecked ? 'Импорт из файла проверен' : 'Импорт из файла не проверен'}</p>
          <details className="mt-2 text-sm"><summary className="cursor-pointer">Источник: {event.fileImportName || 'файл'}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-xs">{event.fileImportSource}</pre></details>
        </Notice> : null}
        <ImageGallery images={event?.images} />
        <div className="flex flex-1 flex-col">
          <div className="flex w-full max-w-full flex-1 flex-col gap-y-3 px-2 py-2">
            <div className="flex w-full items-center gap-x-1">
              {tagItems.length > 0 && (
                <div className={cn('flex flex-wrap gap-2', 'flex-1')}>
                  {tagItems.map((tag) => (
                    <Chip key={tag.value} text={tag.value} color={tag.color} />
                  ))}
                </div>
              )}
              {!setTopLeftComponent && (
                <div className="flex flex-1 justify-end">
                  <CardButtonsComponent
                    event={event}
                    calendarLink={calendarLink}
                  />
                </div>
              )}
            </div>
            <SectionBlock>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="tablet:text-2xl text-left text-lg font-bold break-words text-gray-900">
                    {formatAddress(displayAddress, terms.labelCapitalized)}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Создано:{' '}
                    {formatDateTime(
                      event?.requestCreatedAt ?? event?.createdAt
                    )}
                  </div>
                </div>
                <div
                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusMeta.className}`}
                >
                  {statusMeta.label}
                </div>
              </div>
              <div className="tablet:grid-cols-3 mt-3 grid grid-cols-1 gap-2 text-sm">
                <div className="event-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <div className="text-[11px] text-gray-500">Начало</div>
                  <div className="font-semibold text-gray-900">
                    {formatDateTime(event?.eventDate)}
                  </div>
                </div>
                <div className="event-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <div className="text-[11px] text-gray-500">Завершение</div>
                  <div className="font-semibold text-gray-900">
                    {formatDateTime(event?.dateEnd)}
                  </div>
                </div>
                <div className="event-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-2">
                  <div className="text-[11px] text-gray-500">Длительность</div>
                  <div className="font-semibold text-gray-900">
                    {formatMinutes(duration ?? 60)}
                  </div>
                </div>
              </div>
            </SectionBlock>

            {event?.description ? (
              <SectionBlock title="Описание">
                <div
                  className="textarea ql w-full max-w-full list-disc overflow-hidden"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtml(event?.description),
                  }}
                />
              </SectionBlock>
            ) : null}

            {hasObligations ? (
              <SectionBlock title="Предупреждение">
                <Notice tone="warning" role="alert" className="p-3">
                  {getCloseBlockedByObligationsMessage()}
                </Notice>
              </SectionBlock>
            ) : null}

            {event?.status !== 'draft' ? (
              <EventFinanceSection
                event={event}
                transactions={eventTransactions}
                terms={terms}
              />
            ) : null}

            <SectionBlock title="Подробности">
              <TextLine label="ID">{event?._id}</TextLine>
              {event?.address && (
                <TextLine label="Адрес">
                  {formatAddress(displayAddress, '[не указан]')}
                </TextLine>
              )}
              {serviceTitles.length > 0 && (
                <TextLine label="Услуги">{serviceTitles.join(', ')}</TextLine>
              )}
            </SectionBlock>

            {(mainClient ||
              transferDisplay.isTransferred ||
              otherContacts.length > 0) && (
              <SectionBlock title="Контакты">
                {mainClient ? (
                  <div
                    {...getClientCardProps(mainClient)}
                    className="event-view-kpi hover:border-general focus:ring-general/30 cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-2 transition hover:bg-white hover:shadow-sm focus:ring-2 focus:outline-none"
                  >
                    <div className="text-sm font-semibold text-gray-800">
                      Клиент:{' '}
                      {getPersonFullName(mainClient, {
                        fallback: 'Не указан',
                      })}
                    </div>
                    <ClientContactLines client={mainClient} />
                    <div
                      className="mt-1"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <ContactsIconsButtons
                        user={mainClient}
                        showChat
                        compactButtons
                      />
                    </div>
                  </div>
                ) : (
                  <TextLine label="Клиент">Не указан</TextLine>
                )}
                {transferDisplay.isTransferred ? (
                  <div
                    {...getClientCardProps(transferDisplay.colleague)}
                    className={cn(
                      'event-view-kpi focus:ring-general/30 mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 transition focus:ring-2 focus:outline-none',
                      transferDisplay.colleague
                        ? 'hover:border-general cursor-pointer hover:bg-white hover:shadow-sm'
                        : ''
                    )}
                  >
                    <div className="text-sm font-semibold text-amber-900">
                      Передано коллеге:{' '}
                      {transferDisplay.colleagueName || 'не указан'}
                    </div>
                    {transferDisplay.colleague ? (
                      <ClientContactLines client={transferDisplay.colleague} />
                    ) : null}
                    {transferDisplay.colleague ? (
                      <div
                        className="mt-1"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <ContactsIconsButtons
                          user={transferDisplay.colleague}
                          showChat
                          compactButtons
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {otherContacts.length > 0 && (
                  <div className="mt-2">
                    <div className="mb-1 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                      Доп. контакты
                    </div>
                    <div className="flex flex-col gap-2">
                      {otherContacts.map((contact, index) => (
                        <div
                          key={`${contact.label}-${index}`}
                          {...getClientCardProps(contact.client)}
                          className={cn(
                            'event-view-kpi focus:ring-general/30 rounded-lg border border-gray-200 bg-gray-50 p-2 transition focus:ring-2 focus:outline-none',
                            contact.client
                              ? 'hover:border-general cursor-pointer hover:bg-white hover:shadow-sm'
                              : ''
                          )}
                        >
                          <div className="text-sm font-semibold text-gray-800">
                            {contact.label}
                          </div>
                          {contact.comment ? (
                            <div className="mb-1 text-xs text-gray-600">
                              {contact.comment}
                            </div>
                          ) : null}
                          {contact.client ? (
                            <ClientContactLines client={contact.client} />
                          ) : null}
                          {contact.client && (
                            <div
                              className="mt-1"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <ContactsIconsButtons
                                user={contact.client}
                                showChat
                                compactButtons
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </SectionBlock>
            )}

            {additionalEvents.length > 0 && (
              <SectionBlock title="Задачи/События">
                <div className="flex flex-col gap-3">
                  {additionalEventGroups.map((group) => (
                    <section key={group.key} className="flex flex-col gap-2">
                      <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                        {group.label}
                      </div>
                      <div className="tablet:grid-cols-2 laptop:grid-cols-3 grid grid-cols-1 gap-2">
                        {group.items.map((item) => {
                          const originalIndex = item.originalIndex
                          return pendingAdditionalEventIndex ===
                            originalIndex ? (
                            <AdditionalEventCardSkeleton
                              key={`additional-event-view-${originalIndex}-pending`}
                            />
                          ) : (
                            <AdditionalEventCard
                              key={`additional-event-view-${originalIndex}`}
                              item={item}
                              index={originalIndex}
                              onOpen={() =>
                                openAdditionalEventView(originalIndex)
                              }
                              onOpenEvent={() => modalsFunc.event?.view(event?._id)}
                              onToggleDone={toggleAdditionalEventDone}
                              onEdit={editAdditionalEvent}
                              onDelete={confirmDeleteAdditionalEvent}
                            />
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </SectionBlock>
            )}
            {event?.address && event.address?.town && event.address?.street && (
              <SectionBlock title="Навигация">
                <TextLine label="Ссылки для навигатора">
                  <a
                    data-tip="Открыть адрес в 2ГИС"
                    href={`https://2gis.ru/search/${event.address.town},%20${
                      event.address.street
                    }%20${event.address.house.replaceAll('/', '%2F')}`}
                  >
                    <Image
                      className="h-6 min-h-6 w-6 min-w-6 object-contain"
                      src="/img/navigators/2gis.webp"
                      alt="2gis"
                      width={24}
                      height={24}
                    />
                  </a>
                  <a
                    data-tip="Открыть адрес в Яндекс Навигаторе"
                    href={`yandexnavi://map_search?text=${
                      event.address.town
                    },%20${
                      event.address.street
                    }%20${event.address.house.replaceAll('/', '%2F')}`}
                  >
                    <Image
                      className="h-6 min-h-6 w-6 min-w-6 object-contain"
                      src="/img/navigators/yandex.webp"
                      alt="yandex"
                      width={24}
                      height={24}
                    />
                  </a>
                </TextLine>
              </SectionBlock>
            )}
          </div>
        </div>
      </div>
    )
  }

  return {
    title: configTerms.labelCapitalized,
    Children: EventViewModal,
  }
}

export default eventViewFunc
