'use client'

import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import PropTypes from 'prop-types'
import CardButtons from '@components/CardButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import formatDate from '@helpers/formatDate'
import getPersonFullName from '@helpers/getPersonFullName'
import { useAtomValue } from 'jotai'
import CardWrapper from '@components/CardWrapper'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBellSlash } from '@fortawesome/free-solid-svg-icons'

const CONTACT_CHANNEL_LABELS = {
  phone: 'Телефон',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  max: 'MAX',
  vk: 'VK',
  other: 'Другое',
}

const getPreferredContactChannelLabel = (client) => {
  if (!client?.preferredContactChannel) return ''
  if (client.preferredContactChannel === 'other')
    return client.preferredContactChannelOther?.trim() || 'Другое'
  return CONTACT_CHANNEL_LABELS[client.preferredContactChannel] || ''
}

const LAST_REQUEST_STATUS = {
  draft: {
    label: 'Ждём ответа',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  active: {
    label: 'Подтверждена',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  canceled: {
    label: 'Отменена',
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  closed: {
    label: 'Закрыта',
    className: 'border-gray-200 bg-gray-100 text-gray-600',
  },
}

const ClientCard = ({ client, style, onEdit, onView, onDelete }) => {
  const loading = useAtomValue(loadingAtom('client' + client._id))
  const error = useAtomValue(errorAtom('client' + client._id))
  const lastRequestLabel = client.lastRequest
    ? formatDate(client.lastRequest.toISOString(), false, true)
    : '-'
  const preferredContactChannelLabel = getPreferredContactChannelLabel(client)
  const lastRequestStatus = LAST_REQUEST_STATUS[client.lastRequestStatus]
  const statistics = [
    {
      key: 'requests',
      mobileLabel: 'Заявки',
      desktopLabel: 'Заявки',
      value: Number(client.requestsCount || 0),
    },
    {
      key: 'canceled',
      mobileLabel: 'Отмены',
      desktopLabel: 'Отменено',
      value: Number(client.canceledEventsCount || 0),
    },
    {
      key: 'completed',
      mobileLabel: 'Выполн.',
      desktopLabel: 'Выполнено',
      value: Number(client.completedEventsCount || 0),
    },
    {
      key: 'events',
      mobileLabel: 'События',
      desktopLabel: 'Мероприятия',
      value: Number(client.eventsCount || 0),
    },
  ].filter((item) => item.value > 0)

  return (
    <CardWrapper
      style={style}
      outerClassName="px-2 py-1"
      onClick={() => !loading && onView?.()}
      onSwipeLeft={() => !loading && onEdit?.()}
      onSwipeRight={() => !loading && onDelete?.()}
      className="card-body-pad group flex h-full w-full cursor-pointer p-4 pr-3 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} />
      <CardActions>
        <CardButtons
          compactTriggerClassName="card-menu-trigger h-10 min-h-10 w-10"
          item={client}
          typeOfItem="client"
          minimalActions
          alwaysCompact
          onEdit={onEdit}
        />
      </CardActions>

      <div className="flex h-full w-full min-w-0 flex-col">
        <div className="flex min-w-0 shrink-0 items-center border-b border-gray-200 pr-12 pb-2">
          <div className="card-title min-w-0 flex-1 truncate text-base">
            {getPersonFullName(client, { fallback: '-' })}
          </div>
          {client.messengerPushMuted ? (
            <span
              className="ml-2 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-500"
              title="Push-уведомления по входящим сообщениям этого клиента отключены"
              aria-label="Push-уведомления отключены"
            >
              <FontAwesomeIcon icon={faBellSlash} className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center py-2">
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 text-sm">
            <span className="card-muted truncate">
              Последняя заявка: {lastRequestLabel}
            </span>
            {lastRequestStatus ? (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${lastRequestStatus.className}`}
              >
                {lastRequestStatus.label}
              </span>
            ) : null}
          </div>

          <div className="card-meta mt-2 min-h-5 shrink-0 text-sm">
            {preferredContactChannelLabel ? (
              <div className="truncate text-gray-600">
                Предпочитает {preferredContactChannelLabel}
              </div>
            ) : client.comment ? (
              <div className="line-clamp-1 break-words text-gray-600">
                {client.comment}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-nowrap items-center justify-between gap-2 border-t border-gray-200 pt-2">
          <div className="card-muted flex min-w-0 flex-wrap items-center gap-x-2 text-[11px] leading-4 font-medium">
            {statistics.map((item) => (
              <span key={item.key} className="whitespace-nowrap">
                <span className="tablet:hidden">
                  {item.mobileLabel} {item.value}
                </span>
                <span className="tablet:inline hidden">
                  {item.desktopLabel} {item.value}
                </span>
              </span>
            ))}
          </div>
          <div
            className="ml-auto shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            <ContactsIconsButtons
              user={client}
              showChat
              compactButtons
              forceTelegram={false}
              className="my-0 justify-end"
            />
          </div>
        </div>
      </div>
    </CardWrapper>
  )
}

ClientCard.propTypes = {
  client: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    firstName: PropTypes.string,
    secondName: PropTypes.string,
    thirdName: PropTypes.string,
    phone: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    max: PropTypes.string,
    preferredContactChannel: PropTypes.string,
    preferredContactChannelOther: PropTypes.string,
    messengerPushMuted: PropTypes.bool,
    significantDates: PropTypes.arrayOf(
      PropTypes.shape({
        title: PropTypes.string,
        date: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.instanceOf(Date),
        ]),
        comment: PropTypes.string,
      })
    ),
    comment: PropTypes.string,
    requestsCount: PropTypes.number,
    eventsCount: PropTypes.number,
    canceledEventsCount: PropTypes.number,
    completedEventsCount: PropTypes.number,
    lastRequest: PropTypes.instanceOf(Date),
    lastRequestStatus: PropTypes.string,
  }).isRequired,
  style: PropTypes.shape({}),
  onEdit: PropTypes.func.isRequired,
  onView: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
}

ClientCard.defaultProps = {
  style: null,
}

export default ClientCard
