'use client'

import { normalizeTransactionCategory } from '@helpers/transactionCategory.mjs'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import PropTypes from 'prop-types'
import CardButtons from '@components/CardButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import CardStatusBar from '@components/CardStatusBar'
import { TRANSACTION_CATEGORIES } from '@helpers/constants'
import formatDate from '@helpers/formatDate'
import formatAddress from '@helpers/formatAddress'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  getTransactionDateLabel,
  OBLIGATION_PAYMENT_METHOD,
} from '@helpers/transactionObligation'
import { useAtomValue } from 'jotai'
import CardWrapper from '@components/CardWrapper'

const typeClassNames = {
  income: 'bg-green-500',
  expense: 'bg-red-500',
  obligation: 'bg-amber-500',
}

const PAYMENT_METHOD_LABELS = {
  transfer: 'Перевод',
  account: 'Расчётный счёт',
  cash: 'Наличные',
  barter: 'Бартер',
  obligation: 'Обязательство',
}

const formatTransactionDate = (value) => {
  if (!value) return { day: '—', month: '', weekday: '', time: '' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { day: '—', month: '', weekday: '', time: '' }
  const month = date
    .toLocaleDateString('ru-RU', { month: 'short' })
    .replace('.', '')
  const timePart = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month,
    weekday: date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', ''),
    time: timePart,
  }
}

const TransactionCard = ({
  transaction,
  client,
  event,
  type,
  style,
  onEdit,
  onDelete,
}) => {
  const loading = useAtomValue(loadingAtom('transaction' + transaction._id))
  const error = useAtomValue(errorAtom('transaction' + transaction._id))
  const clientName = client
    ? getPersonFullName(client, { fallback: 'Без клиента' })
    : 'Без клиента'

  const eventTitle = event
    ? event?.eventType ||
      formatAddress(event?.address, '') ||
      (event?.eventDate
        ? `Мероприятие ${formatDate(event.eventDate, false, true)}`
        : 'Мероприятие')
    : 'Без мероприятия'

  const eventDateTime = event?.eventDate
    ? `${formatDate(event.eventDate, false, true)} ${new Date(
        event.eventDate
      ).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : null

  const eventTitleWithDate =
    event && eventDateTime ? `${eventTitle} - ${eventDateTime}` : eventTitle

  const categoryLabel =
    TRANSACTION_CATEGORIES.find((item) => item.value === normalizeTransactionCategory(transaction.category))
      ?.name ?? null
  const isObligation = transaction.paymentMethod === OBLIGATION_PAYMENT_METHOD
  const dateLabel = getTransactionDateLabel(transaction.paymentMethod)
  const transactionDate = formatTransactionDate(transaction.date)
  const transactionType = isObligation
    ? 'obligation'
    : (type?.value ?? transaction.type)
  const amount = Number(transaction.amount ?? 0)
  const amountPrefix = isObligation
    ? ''
    : transactionType === 'income'
      ? '+'
      : '−'
  const amountClassName = isObligation
    ? 'text-amber-600'
    : transactionType === 'income'
      ? 'text-emerald-600'
      : 'text-red-600'
  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[transaction.paymentMethod] ||
    transaction.paymentMethod ||
    'Способ не указан'
  const title = categoryLabel || transaction.comment || 'Транзакция'

  return (
    <CardWrapper
      style={style}
      outerClassName="px-2 py-1"
      onClick={() => !loading && onEdit?.()}
      onSwipeLeft={() => !loading && onEdit?.()}
      onSwipeRight={onDelete ? () => !loading && onDelete() : null}
      className="transaction-card-shell card-body-pad flex h-full w-full cursor-pointer p-3 pr-3 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} />
      <CardActions>
        <CardButtons
          item={transaction}
          compactTriggerClassName="card-menu-trigger h-10 min-h-10 w-10"
          typeOfItem="transaction"
          minimalActions
          alwaysCompact
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </CardActions>
      <CardStatusBar
        className={typeClassNames[transactionType] || 'bg-gray-300'}
      />

      <div className="grid h-full w-full grid-cols-[76px_minmax(0,1fr)_auto] gap-3 pr-8 pl-3">
        <div
          className="flex flex-col border-r border-gray-200 py-2 pr-3 text-center"
          title={dateLabel}
          aria-label={dateLabel}
        >
          <div className="flex items-baseline gap-x-1">
            <span className="text-sm font-medium whitespace-nowrap uppercase">
              {transactionDate.weekday}
            </span>
            <span className="card-title text-2xl leading-none">
              {transactionDate.day}
            </span>
          </div>
          {transactionDate.month ? (
            <span className="text-general text-base font-medium whitespace-nowrap">
              {transactionDate.month}
            </span>
          ) : null}
          {transactionDate.time ? (
            <span className="card-meta mt-0.5 text-sm">{transactionDate.time}</span>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1">
          <div className="min-w-0 truncate text-sm">
            <span className="card-title">{title}</span>
            <span className="card-muted text-xs font-medium">
              {' · '}
              {paymentMethodLabel}
            </span>
          </div>
          <div className="card-meta truncate text-sm font-medium">
            {clientName || '-'}
          </div>
          <div className="card-muted truncate text-xs">
            {eventTitleWithDate}
          </div>
          {transaction.comment && transaction.comment !== title ? (
            <div className="card-muted line-clamp-1 text-xs">
              {transaction.comment}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-[92px] flex-col items-end justify-center gap-2 text-right">
          <div
            className={`text-base font-semibold whitespace-nowrap ${amountClassName}`}
          >
            {amountPrefix}
            {amount.toLocaleString()} ₽
          </div>
        </div>
      </div>
    </CardWrapper>
  )
}

TransactionCard.propTypes = {
  transaction: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    date: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.instanceOf(Date),
    ]),
    type: PropTypes.string,
    clientId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    eventId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    comment: PropTypes.string,
    amount: PropTypes.number,
    category: PropTypes.string,
    paymentMethod: PropTypes.string,
  }).isRequired,
  client: PropTypes.shape({
    firstName: PropTypes.string,
    secondName: PropTypes.string,
  }),
  event: PropTypes.shape({
    eventType: PropTypes.string,
    eventDate: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.instanceOf(Date),
    ]),
    address: PropTypes.shape({
      town: PropTypes.string,
      street: PropTypes.string,
      house: PropTypes.string,
      entrance: PropTypes.string,
      floor: PropTypes.string,
      flat: PropTypes.string,
      comment: PropTypes.string,
      link2Gis: PropTypes.string,
      linkYandexNavigator: PropTypes.string,
      link2GisShow: PropTypes.bool,
      linkYandexShow: PropTypes.bool,
    }),
  }),
  type: PropTypes.shape({
    value: PropTypes.string,
  }),
  style: PropTypes.shape({}),
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
}

TransactionCard.defaultProps = {
  client: null,
  event: null,
  type: null,
  style: null,
}

export default TransactionCard
