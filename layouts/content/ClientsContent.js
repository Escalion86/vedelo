'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import { List } from 'react-window'
import AddIconButton from '@components/AddIconButton'
import EmptyState from '@components/EmptyState'
import Input from '@components/Input'
import SectionCard from '@components/SectionCard'
import ClientCard from '@layouts/cards/ClientCard'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import useUiDensity from '@helpers/useUiDensity'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventsQuery } from '@helpers/useEventsQuery'
import DropDown from '@components/DropDown'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faFilter, faUser, faUserPlus } from '@fortawesome/free-solid-svg-icons'
import { getEventStatusFlags } from '@helpers/eventStatusFilter'

const normalizeDigits = (value) => String(value ?? '').replace(/[^\d]/g, '')

const CLIENT_FILTER_OPTIONS = [
  { value: 'all', label: 'Все клиенты' },
  { value: 'requests', label: 'С заявками' },
  { value: 'events', label: 'С мероприятиями' },
  { value: 'canceled', label: 'Есть отмены' },
]

const ClientsContent = ({ onHeaderCountChange }) => {
  const { isCompact } = useUiDensity()
  const { data: clients = [] } = useClientsQuery()
  const { data: eventsPayload } = useEventsQuery({
    scope: 'all',
    enabled: false,
  })
  const events = useMemo(() => eventsPayload?.data ?? [], [eventsPayload?.data])
  const modalsFunc = useAtomValue(modalsFuncAtom)

  const [search, setSearch] = useState('')
  const [clientFilter, setClientFilter] = useState('all')
  const itemHeight = isCompact ? 178 : 190

  const clientsWithStats = useMemo(() => {
    const lowerSearch = search.trim().toLowerCase()
    const digitsSearch = normalizeDigits(search)
    const now = new Date()
    return clients
      .map((client) => {
        const clientStats = events.reduce(
          (stats, event) => {
            if (event.clientId !== client._id) return stats

            const statusFlags = getEventStatusFlags(event, now)
            const endDateValue = event.dateEnd ?? event.eventDate
            const endDate = endDateValue ? new Date(endDateValue) : null
            const isCompletedByDate =
              endDate &&
              !Number.isNaN(endDate.getTime()) &&
              endDate.getTime() < now.getTime()
            if (statusFlags.request) stats.requestsCount += 1
            else if (statusFlags.canceled) stats.canceledEventsCount += 1
            else if (
              statusFlags.finished ||
              statusFlags.closed ||
              isCompletedByDate
            )
              stats.completedEventsCount += 1
            else stats.eventsCount += 1

            const value =
              event.requestCreatedAt ?? event.createdAt ?? event.eventDate
            if (!value) return stats
            const requestDate = new Date(value)
            if (Number.isNaN(requestDate.getTime())) return stats
            if (!stats.lastRequest || requestDate > stats.lastRequest.date) {
              stats.lastRequest = { date: requestDate, status: event.status }
            }
            return stats
          },
          {
            requestsCount: 0,
            canceledEventsCount: 0,
            completedEventsCount: 0,
            eventsCount: 0,
            lastRequest: null,
          }
        )
        return {
          ...client,
          requestsCount: clientStats.requestsCount,
          eventsCount: clientStats.eventsCount,
          canceledEventsCount: clientStats.canceledEventsCount,
          completedEventsCount: clientStats.completedEventsCount,
          lastRequest: clientStats.lastRequest?.date ?? null,
          lastRequestStatus: clientStats.lastRequest?.status ?? '',
        }
      })
      .filter((client) => {
        if (clientFilter === 'requests') return client.requestsCount > 0
        if (clientFilter === 'events') return client.eventsCount > 0
        if (clientFilter === 'canceled') return client.canceledEventsCount > 0
        return true
      })
      .filter((client) => {
        if (!lowerSearch) return true
        const textMatch = [
          client.firstName,
          client.secondName,
          client.thirdName,
          client.telegram,
          client.instagram,
          client.vk,
          client.max,
          client.phone ? `+${client.phone}` : '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(lowerSearch)

        if (textMatch) return true
        if (!digitsSearch) return false

        const contactsDigits = [
          client.phone,
          client.whatsapp,
          client.viber,
          client.telegram,
          client.max,
        ]
          .map(normalizeDigits)
          .filter(Boolean)
          .join(' ')

        return contactsDigits.includes(digitsSearch)
      })
      .sort((a, b) => {
        if (a.lastRequest && b.lastRequest)
          return b.lastRequest.getTime() - a.lastRequest.getTime()
        if (a.lastRequest) return -1
        if (b.lastRequest) return 1
        return (b.requestsCount || 0) - (a.requestsCount || 0)
      })
  }, [clientFilter, clients, events, search])

  const RowComponent = useCallback(
    ({ index, style }) => {
      const client = clientsWithStats[index]
      return (
        <ClientCard
          style={style}
          client={client}
          onEdit={() => modalsFunc.client?.edit(client._id)}
          onView={() => modalsFunc.client?.view(client._id)}
          onDelete={() => modalsFunc.client?.delete(client._id)}
        />
      )
    },
    [clientsWithStats, modalsFunc.client]
  )

  useEffect(() => {
    onHeaderCountChange?.(clientsWithStats.length)
  }, [clientsWithStats.length, onHeaderCountChange])

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-2 pb-2">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Input
              label="Поиск клиента"
              value={search}
              onChange={setSearch}
              placeholder="Введите имя или телефон"
              noMargin
            />
          </div>
          <AddIconButton
            onClick={() => modalsFunc.client?.add()}
            disabled={!modalsFunc.client?.add}
            title="Добавить клиента"
            size="sm"
            variant="neutral"
            className="mb-0.5 shrink-0"
          />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            className="filter-control filter-control--primary"
            onClick={() => setClientFilter('all')}
          >
            {CLIENT_FILTER_OPTIONS.find((item) => item.value === clientFilter)
              ?.label || 'Все клиенты'}
          </button>
          <DropDown
            renderInPortal
            menuPadding={false}
            menuClassName="filter-menu w-[min(260px,calc(100vw-24px))] flex-col items-stretch overflow-hidden"
            trigger={
              <button
                type="button"
                className="filter-control filter-control--outline"
                aria-label="Фильтры клиентов"
              >
                <FontAwesomeIcon icon={faFilter} className="h-4 w-4" />
                Фильтры
                {clientFilter !== 'all' ? (
                  <span className="text-[var(--ui-primary)]">1</span>
                ) : null}
              </button>
            }
          >
            {CLIENT_FILTER_OPTIONS.map((option) => {
              const active = option.value === clientFilter
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`filter-menu-item ${
                    active ? 'filter-menu-item--active' : ''
                  }`}
                  onClick={() => setClientFilter(option.value)}
                >
                  {option.label}
                  {active ? (
                    <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
                  ) : null}
                </button>
              )
            })}
          </DropDown>
        </div>
      </div>
      <SectionCard className="min-h-0 flex-1 overflow-visible">
        {clientsWithStats.length > 0 ? (
          <List
            rowCount={clientsWithStats.length}
            rowHeight={itemHeight}
            rowComponent={RowComponent}
            rowProps={{}}
            style={{ height: '100%', width: '100%' }}
          />
        ) : clients.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={<FontAwesomeIcon icon={faUserPlus} className="h-5 w-5" />}
            title="Пока нет ни одного клиента"
            hint="Клиенты появляются автоматически из заявок. Можно добавить клиента и вручную."
            actionLabel="Добавить клиента"
            onAction={() => modalsFunc.client?.add()}
          />
        ) : (
          <EmptyState
            bordered={false}
            icon={<FontAwesomeIcon icon={faUser} className="h-5 w-5" />}
            title="Клиенты не найдены"
            hint="Попробуйте изменить поисковый запрос или сбросить фильтр."
            actionLabel="Сбросить поиск и фильтр"
            onAction={() => {
              setSearch('')
              setClientFilter('all')
            }}
          />
        )}
      </SectionCard>
    </div>
  )
}

export default ClientsContent
