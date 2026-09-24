import { useEffect, useMemo } from 'react'
import CardButtons from '@components/CardButtons'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import formatDateTime from '@helpers/formatDateTime'
import { formatPhoneWithPlus } from '@helpers/phoneUi'
import getPersonFullName from '@helpers/getPersonFullName'
import { useClientsQuery } from '@helpers/useClientsQuery'
import {
  getEventAddressLine,
  getEventTitle,
} from '@helpers/upcomingEventsOverview'

const EVENT_STATUS_LABELS = Object.freeze({
  draft: 'Заявка',
  active: 'Подтверждено',
  canceled: 'Отменено',
  closed: 'Закрыто',
})

const DetailBlock = ({ label, children }) => (
  <div className="event-view-kpi rounded-lg border border-gray-200 bg-gray-50 p-3">
    <div className="text-xs tracking-wide text-gray-500 uppercase">{label}</div>
    <div className="mt-1">{children}</div>
  </div>
)

const findClientById = (clients, clientId) => {
  if (!clientId) return null
  const normalizedId = String(clientId)
  return (
    clients.find((client) => String(client?._id) === normalizedId) ?? null
  )
}

const EventContactCard = ({ client, label, comment, modalsFunc }) => {
  const clientName = getPersonFullName(client, {
    fallback: client ? client._id : 'Контакт не найден',
  })
  const phone = formatPhoneWithPlus(client?.phone)
  const openClient = () => {
    if (!client?._id) return
    modalsFunc.client?.view(client._id)
  }
  const clientCardProps = client?._id
    ? {
        role: 'button',
        tabIndex: 0,
        onClick: openClient,
        onKeyDown: (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          openClient()
        },
      }
    : {}

  return (
    <div
      {...clientCardProps}
      className={`event-view-kpi focus:ring-general/30 rounded-lg border border-gray-200 bg-white p-2 transition focus:ring-2 focus:outline-none ${
        client?._id
          ? 'hover:border-general cursor-pointer hover:shadow-sm'
          : ''
      }`}
    >
      <div className="text-[11px] font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-semibold text-gray-900">
        {clientName}
      </div>
      {comment ? (
        <div className="mt-0.5 whitespace-pre-wrap text-xs text-gray-600">
          {comment}
        </div>
      ) : null}
      {phone ? <div className="mt-0.5 text-xs text-gray-600">{phone}</div> : null}
      {client ? (
        <div
          className="mt-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <ContactsIconsButtons user={client} showChat compactButtons />
        </div>
      ) : null}
    </div>
  )
}

const EventContactsBlock = ({ event, clients, isPending, modalsFunc }) => {
  const mainClient = useMemo(
    () => findClientById(clients, event?.clientId),
    [clients, event?.clientId]
  )
  const additionalContacts = useMemo(() => {
    const contacts = Array.isArray(event?.otherContacts)
      ? event.otherContacts
      : []
    return contacts
      .map((contact, index) => {
        if (!contact?.clientId && !contact?.comment) return null
        return {
          key: `${contact?.clientId || 'contact'}-${index}`,
          client: findClientById(clients, contact?.clientId),
          comment:
            typeof contact?.comment === 'string' ? contact.comment : '',
        }
      })
      .filter(Boolean)
  }, [clients, event?.otherContacts])
  const hasContactReferences = Boolean(
    event?.clientId || additionalContacts.length > 0
  )

  return (
    <DetailBlock label="Контакты мероприятия">
      {isPending && hasContactReferences ? (
        <div
          className="flex flex-col gap-2"
          aria-label="Загружаем контакты мероприятия"
        >
          <div className="additional-event-skeleton-line h-16 animate-pulse rounded-lg" />
          {Array.isArray(event?.otherContacts) &&
          event.otherContacts.length > 0 ? (
            <div className="additional-event-skeleton-line h-16 animate-pulse rounded-lg" />
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {event?.clientId ? (
            <EventContactCard
              client={mainClient}
              label="Клиент"
              modalsFunc={modalsFunc}
            />
          ) : (
            <div className="text-sm text-gray-600">Клиент не указан</div>
          )}
          {additionalContacts.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Доп. контакты
              </div>
              {additionalContacts.map((contact) => (
                <EventContactCard
                  key={contact.key}
                  client={contact.client}
                  label="Доп. контакт"
                  comment={contact.comment}
                  modalsFunc={modalsFunc}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </DetailBlock>
  )
}

const EventReferenceCard = ({ event, onOpen }) => {
  const address = getEventAddressLine(event)
  const statusLabel = EVENT_STATUS_LABELS[event?.status] || 'Мероприятие'

  return (
    <button
      type="button"
      className="event-view-kpi hover:border-general focus:ring-general/30 group w-full cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-3 text-left transition hover:bg-white hover:shadow-sm focus:ring-2 focus:outline-none"
      onClick={onOpen}
      aria-label={`Открыть мероприятие «${getEventTitle(event)}»`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
          Связанное мероприятие
        </div>
        <div className="shrink-0 rounded-full border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
          {statusLabel}
        </div>
      </div>
      <div className="mt-1 text-base font-semibold text-gray-900">
        {getEventTitle(event)}
      </div>
      <div className="mt-1 text-sm text-gray-700">
        {event?.eventDate ? formatDateTime(event.eventDate) : 'Дата не указана'}
      </div>
      {address ? <div className="text-sm text-gray-600">{address}</div> : null}
      <div className="text-general mt-2 text-xs font-semibold">
        Открыть мероприятие →
      </div>
    </button>
  )
}

const openEventAdditionalEventViewModal = ({
  modalsFunc,
  event,
  item,
  index,
  onToggleDone,
  onEdit,
  onDelete,
  onOpenEvent,
}) => {
  if (!modalsFunc?.add || !item) return
  const displayDate = item?.done ? item?.doneAt ?? item?.date : item?.date
  const displayDateLabel = item?.done ? 'Дата выполнения' : 'Дата и время'

  const AdditionalEventViewContent = ({ closeModal, setTopLeftComponent }) => {
    const { data: clients = [], isPending: areClientsPending } =
      useClientsQuery()
    const handleOpenEvent = () => {
      closeModal?.()
      setTimeout(() => onOpenEvent?.(event), 150)
    }

    useEffect(() => {
      if (!setTopLeftComponent) return
      setTopLeftComponent(() => (
        <CardButtons
          item={{
            _id: `${event?._id || 'event'}-additional-${index}`,
            status: 'active',
          }}
          typeOfItem="event"
          minimalActions
          alwaysCompact
          dropDownPlacement="left"
          showAdditionalEventsButton={false}
          showCloneButton={false}
          showHistoryButton={false}
          showStatusButton={false}
          onEdit={() => {
            closeModal?.()
            onEdit?.(index)
          }}
          onDelete={() =>
            modalsFunc.confirm({
              title: 'Удаление задачи',
              text: 'Удалить эту задачу?',
              onConfirm: async () => {
                await onDelete?.(index)
                closeModal?.()
              },
            })
          }
        />
      ))
    }, [closeModal, setTopLeftComponent])

    return (
      <div className="flex flex-col gap-3 text-sm text-gray-800">
        <EventReferenceCard event={event} onOpen={handleOpenEvent} />
        <EventContactsBlock
          event={event}
          clients={clients}
          isPending={areClientsPending}
          modalsFunc={modalsFunc}
        />
        <DetailBlock label="Статус">
          <div
            className={`text-sm font-semibold ${
              item?.done ? 'text-emerald-700' : 'text-blue-700'
            }`}
          >
            {item?.done ? 'Выполнено' : 'Активно'}
          </div>
        </DetailBlock>
        <DetailBlock label={displayDateLabel}>
          <div className="font-semibold text-gray-900">
            {formatDateTime(displayDate)}
          </div>
        </DetailBlock>
        {item?.description ? (
          <DetailBlock label="Описание">
            <div className="whitespace-pre-wrap text-gray-700">
              {item.description}
            </div>
          </DetailBlock>
        ) : null}
      </div>
    )
  }

  modalsFunc.add({
    title: item?.title || `Событие #${index + 1}`,
    confirmButtonName: item?.done ? 'Возобновить' : 'Выполнено',
    declineButtonName: 'Закрыть',
    showDecline: true,
    onConfirm: () => onToggleDone?.(index),
    Children: AdditionalEventViewContent,
  })
}

export default openEventAdditionalEventViewModal
