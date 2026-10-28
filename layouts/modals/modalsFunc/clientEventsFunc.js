import { useMemo } from 'react'
import EventCard from '@layouts/cards/EventCard'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  useClientQuery,
  useClientRelationsQuery,
  useClientsQuery,
} from '@helpers/useClientsQuery'

const clientEventsFunc = (clientId) => {
  const ClientEventsModal = () => {
    const terms = useWorkItemTerminology()
    const { data: clients = [] } = useClientsQuery()
    const initialClient = useMemo(
      () => clients.find((item) => item._id === clientId) ?? null,
      [clients]
    )
    const { data: client = initialClient } = useClientQuery(
      clientId,
      initialClient
    )
    const { data: relations } = useClientRelationsQuery(clientId)
    const events = useMemo(() => relations?.events ?? [], [relations?.events])

    const clientRequests = useMemo(
      () =>
        events.filter(
          (event) => event.clientId === clientId && event.status === 'draft'
        ),
      [events]
    )

    const clientEvents = useMemo(
      () =>
        events.filter(
          (event) => event.clientId === clientId && event.status !== 'draft'
        ),
      [events]
    )

    if (!clientId || !client)
      return (
        <div className="flex w-full justify-center text-lg ">
          ОШИБКА! Клиент не найден!
        </div>
      )

    return (
      <div className="flex flex-col gap-4 text-sm text-gray-800">
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-base font-semibold text-gray-900">
            {getPersonFullName(client, { fallback: 'Без имени' })}
          </div>
          <div className="mt-1 text-gray-600">
            {client.phone ? `+${client.phone}` : 'Телефон не указан'}
          </div>
        </div>

        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900">
              Заявки клиента
            </div>
            <div className="text-xs text-gray-500">
              Всего: {clientRequests.length}
            </div>
          </div>
          {clientRequests.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {clientRequests.map((request) => (
                <EventCard
                  key={request._id}
                  eventId={request._id}
                  event={request}
                  transactions={relations?.transactions ?? []}
                  showClient={false}
                  noHorizontalPadding
                />
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-500">Заявок нет</div>
          )}
        </div>

        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900">
              {terms.pluralCapitalized} клиента
            </div>
            <div className="text-xs text-gray-500">
              Всего: {clientEvents.length}
            </div>
          </div>
          {clientEvents.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {clientEvents.map((event) => (
                <EventCard
                  key={event._id}
                  eventId={event._id}
                  event={event}
                  transactions={relations?.transactions ?? []}
                  showClient={false}
                  noHorizontalPadding
                />
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-gray-500">
              Нет {terms.pluralGenitive}
            </div>
          )}
        </div>
      </div>
    )
  }

  return {
    title: 'Заявки и мероприятия клиента',
    confirmButtonName: 'Закрыть',
    showDecline: false,
    onConfirm: true,
    Children: ClientEventsModal,
  }
}

export default clientEventsFunc
