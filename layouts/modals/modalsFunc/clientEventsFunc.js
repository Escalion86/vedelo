import { useId, useMemo, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import AiBadge from '@components/AiBadge'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import EventCard from '@layouts/cards/EventCard'
import useEventCreateMenu from '@helpers/useEventCreateMenu'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  useClientQuery,
  useClientRelationsQuery,
  useClientsQuery,
} from '@helpers/useClientsQuery'

const clientEventsFunc = (clientId, workItemTerms) => {
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
    const { items, draftModals, createDisabled } = useEventCreateMenu(client)
    const createMenuId = useId()
    const [createAnchor, setCreateAnchor] = useState(null)
    const { data: relations, isError, isFetching, refetch } = useClientRelationsQuery(clientId)
    const events = useMemo(() => relations?.events ?? [], [relations?.events])

    const clientRequests = useMemo(
      () =>
        events.filter((event) => event.status === 'draft'),
      [events]
    )

    const clientEvents = useMemo(
      () =>
        events.filter((event) => event.status !== 'draft'),
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
        {draftModals}
        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="text-base font-semibold text-gray-900">
            {getPersonFullName(client, { fallback: 'Без имени' })}
          </div>
          <div className="mt-1 text-gray-600">
            {client.phone ? `+${client.phone}` : 'Телефон не указан'}
          </div>
        </div>

        {isError ? (
          <Notice tone="warning" role="status" className="flex flex-wrap items-center gap-2">
            Не удалось {relations ? 'обновить' : 'загрузить'} список работ
            <AppButton variant="secondary" size="sm" disabled={isFetching} aria-busy={isFetching} onClick={() => refetch()}>
              Повторить
            </AppButton>
          </Notice>
        ) : !relations && isFetching ? (
          <Notice role="status">Загружаем список…</Notice>
        ) : null}

        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-gray-900">
              Заявки клиента
            </div>
            {relations && <div className="text-xs text-gray-500">Всего: {clientRequests.length}</div>}
          </div>
          {clientRequests.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {clientRequests.map((request) => (
                <EventCard
                  key={request._id}
                  eventId={request._id}
                  event={request}
                  transactions={relations?.transactions ?? []}
                  showClient={request.clientId !== clientId}
                  noHorizontalPadding
                />
              ))}
            </div>
          ) : relations ? (
            <div className="mt-2 text-sm text-gray-500">Заявок нет</div>
          ) : null}
        </div>

        <div className="p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {terms.pluralCapitalized} клиента
              </div>
              {relations && <div className="text-xs text-gray-500">Всего: {clientEvents.length}</div>}
            </div>
            {!createDisabled && (
              <AppButton
                id={`${createMenuId}-button`}
                size="sm"
                variant="secondary"
                className="min-h-11 cursor-pointer gap-1.5"
                aria-haspopup="menu"
                aria-expanded={Boolean(createAnchor)}
                aria-controls={createAnchor ? createMenuId : undefined}
                onClick={(event) => setCreateAnchor(event.currentTarget)}
              >
                <AddIcon fontSize="small" />
                {`Добавить ${terms.accusative}`}
                <ExpandMoreIcon fontSize="small" />
              </AppButton>
            )}
            <Menu
              anchorEl={createAnchor}
              open={Boolean(createAnchor)}
              onClose={() => setCreateAnchor(null)}
              disableScrollLock
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{
                list: {
                  id: createMenuId,
                  'aria-labelledby': `${createMenuId}-button`,
                },
                paper: {
                  sx: {
                    background: 'var(--surface-card-bg)',
                    color: 'var(--ui-secondary-text)',
                    '& .MuiMenuItem-root': { minHeight: 44, fontFamily: 'inherit' },
                    '& .MuiMenuItem-root:is(:hover, .Mui-focusVisible)': {
                      background: 'color-mix(in srgb, var(--ui-primary) 14%, transparent)',
                    },
                  },
                },
              }}
            >
              {items.map((item) => (
                <MenuItem
                  key={item.key}
                  className="gap-2"
                  onClick={() => {
                    setCreateAnchor(null)
                    item.onClick()
                  }}
                >
                  {item.icon}
                  {item.label}
                  {item.usesAi && <AiBadge />}
                </MenuItem>
              ))}
            </Menu>
          </div>
          {clientEvents.length > 0 ? (
            <div className="mt-3 grid gap-2">
              {clientEvents.map((event) => (
                <EventCard
                  key={event._id}
                  eventId={event._id}
                  event={event}
                  transactions={relations?.transactions ?? []}
                  showClient={event.clientId !== clientId}
                  noHorizontalPadding
                />
              ))}
            </div>
          ) : relations ? (
            <div className="mt-2 text-sm text-gray-500">
              Нет {terms.pluralGenitive}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return {
    title: `Заявки и ${workItemTerms.plural} клиента`,
    confirmButtonName: 'Закрыть',
    showDecline: false,
    onConfirm: true,
    Children: ClientEventsModal,
  }
}

export default clientEventsFunc
