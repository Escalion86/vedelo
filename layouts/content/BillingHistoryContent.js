'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDown,
  faArrowUp,
  faClock,
  faGift,
  faReceipt,
  faRotateLeft,
  faWallet,
} from '@fortawesome/free-solid-svg-icons'
import { useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import cn from 'classnames'
import AppButton from '@components/AppButton'
import EmptyState from '@components/EmptyState'
import LoadingSpinner from '@components/LoadingSpinner'
import Notice from '@components/Notice'
import SectionCard from '@components/SectionCard'
import { formatMoney } from '@helpers/formatMoney'
import { usePaymentHistoryQuery } from '@helpers/usePaymentHistoryQuery'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import modalsFuncAtom from '@state/atoms/modalsFuncAtom'
import userEditSelector from '@state/selectors/userEditSelector'
import ManualBalanceChargeForm from '@components/ManualBalanceChargeForm'
import PaymentReceiptControl from '@components/PaymentReceiptControl'
import { apiJson } from '@helpers/apiClient'
import useSnackbar from '@helpers/useSnackbar'

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'tariff', label: 'Тарифы' },
  { value: 'topup', label: 'Пополнения' },
  { value: 'bonus', label: 'Бонусы' },
  { value: 'refund', label: 'Возвраты' },
  { value: 'charge', label: 'Списания' },
]

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

const formatDate = (value, formatter = dateTimeFormatter) => {
  if (!value) return 'Дата не указана'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Дата не указана'
    : formatter.format(date)
}

const getStatusInfo = (status) => {
  if (status === 'pending')
    return { label: 'Ожидает подтверждения', tone: 'pending' }
  if (status === 'canceled') return { label: 'Отменено', tone: 'failed' }
  if (status === 'failed') return { label: 'Ошибка', tone: 'failed' }
  return { label: 'Проведено', tone: 'succeeded' }
}

const getOperationIcon = (kind, direction) => {
  if (kind === 'referral_bonus' || kind === 'bonus') return faGift
  if (kind === 'refund') return faRotateLeft
  if (kind === 'tariff') return faReceipt
  return direction === 'out' ? faArrowUp : faArrowDown
}

const PaymentRow = ({
  item,
  userId,
  canManage,
  canEditReceipt,
  busy,
  onDelete,
  onSync,
}) => {
  const status = getStatusInfo(item.status)
  const isMuted = status.tone !== 'succeeded'
  const sign = isMuted ? '' : item.direction === 'out' ? '−' : '+'
  const metadata = [status.label, item.sourceTitle, item.methodTitle].filter(
    Boolean
  )

  return (
    <li className="ui-surface-card flex flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full min-w-0 flex-col">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
              isMuted
                ? 'border-gray-300 bg-gray-100 text-gray-500'
                : item.direction === 'out'
                  ? 'border-red-200 bg-red-50 text-[var(--tx-expense)]'
                  : 'border-emerald-200 bg-emerald-50 text-[var(--tx-income)]'
            )}
            aria-hidden="true"
          >
            <FontAwesomeIcon
              icon={getOperationIcon(item.kind, item.direction)}
              className="h-4 w-4"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900">{item.title}</div>
            {item.details ? (
              <div className="mt-0.5 text-sm leading-5 text-gray-600">
                {item.details}
              </div>
            ) : null}
            <div className="mt-1 text-xs text-gray-500">
              {metadata.join(' • ')}
            </div>
          </div>
        </div>
        <PaymentReceiptControl
          item={item}
          userId={userId}
          canEdit={canEditReceipt && item.management?.canEditReceipt}
        />
      </div>
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4 pl-[52px] sm:flex-col sm:pl-0 sm:text-right">
        <div
          className={cn(
            'text-base font-semibold tabular-nums',
            isMuted
              ? 'text-gray-500'
              : item.direction === 'out'
                ? 'text-[var(--tx-expense)]'
                : 'text-[var(--tx-income)]'
          )}
        >
          {sign}
          {formatMoney(item.amount)}
        </div>
        <time
          className="text-xs text-gray-500"
          dateTime={item.occurredAt || undefined}
        >
          {formatDate(item.occurredAt)}
        </time>
        {canManage && item.management?.canDelete ? (
          <AppButton
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDelete(item)}
          >
            Удалить
          </AppButton>
        ) : null}
        {canManage && item.management?.syncProvider ? (
          <AppButton
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => onSync(item)}
          >
            Проверить платёж
          </AppButton>
        ) : null}
      </div>
    </li>
  )
}

const BillingHistoryContent = ({
  userId = '',
  accountUser = null,
  embedded = false,
}) => {
  const router = useRouter()
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const setUser = useSetAtom(userEditSelector)
  const queryClient = useQueryClient()
  const snackbar = useSnackbar()
  const canManage = Boolean(
    userId && ['dev', 'admin'].includes(loggedUser?.role)
  )
  const [showCharge, setShowCharge] = useState(false)
  const [busy, setBusy] = useState(false)
  const [category, setCategory] = useState('all')
  const filters = useMemo(
    () => ({ category, limit: 30, userId }),
    [category, userId]
  )
  const query = usePaymentHistoryQuery(filters)
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page?.data?.items ?? []) ?? [],
    [query.data?.pages]
  )
  const account = query.data?.pages?.[0]?.data?.account
  const fallbackUser = accountUser || loggedUser
  const balance = account?.balance ?? fallbackUser?.balance ?? 0
  const tariffId = account?.tariffId || fallbackUser?.tariffId
  const currentTariff = tariffs.find(
    (tariff) => String(tariff?._id) === String(tariffId)
  )
  const tariffActiveUntil =
    account?.tariffActiveUntil ?? fallbackUser?.tariffActiveUntil

  const refreshHistory = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['paymentHistory'] }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({
        queryKey: ['missingPaymentReceiptsCount'],
      }),
    ])
  const handleChargeSuccess = (updatedUser) => {
    setUser({ ...accountUser, ...updatedUser })
    setShowCharge(false)
    snackbar.success('Списание проведено')
    refreshHistory()
  }
  const deletePayment = async (item) => {
    const warning =
      item.direction === 'out'
        ? `Удалить списание ${formatMoney(item.amount)} и вернуть эту сумму на баланс? Срок тарифа не изменится.`
        : `Удалить начисление ${formatMoney(item.amount)} и вычесть его из баланса? Связанный реферальный бонус также будет удалён.`
    if (!window.confirm(warning)) return
    setBusy(true)
    try {
      const result = await apiJson('/api/payments', {
        method: 'DELETE',
        body: JSON.stringify({ paymentId: item.id }),
      })
      result.data?.users?.forEach(setUser)
      snackbar.success('Операция удалена, баланс пересчитан')
    } catch (error) {
      snackbar.error(error.message || 'Не удалось удалить операцию')
    } finally {
      await refreshHistory()
      setBusy(false)
    }
  }
  const syncPayment = async (item) => {
    setBusy(true)
    try {
      await apiJson(`/api/billing/${item.management.syncProvider}/sync`, {
        method: 'POST',
        body: JSON.stringify({ paymentId: item.id }),
      })
      snackbar.success('Статус платежа обновлён')
    } catch (error) {
      snackbar.error(error.message || 'Не удалось проверить платёж')
    } finally {
      await refreshHistory()
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        embedded ? 'min-w-0' : 'flex min-h-0 flex-1 flex-col overflow-hidden'
      )}
    >
      <div
        className={cn(
          embedded ? 'pb-2' : 'laptop:p-4 min-h-0 flex-1 overflow-y-auto p-3'
        )}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SectionCard className="flex items-center gap-3 p-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[var(--ui-primary)]">
                <FontAwesomeIcon icon={faWallet} className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">
                  Текущий баланс
                </div>
                <div className="mt-0.5 text-2xl font-semibold text-gray-900 tabular-nums">
                  {formatMoney(balance)}
                </div>
              </div>
            </SectionCard>
            <SectionCard className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-gray-500 uppercase">
                  Текущий тариф
                </div>
                <div className="mt-0.5 truncate text-lg font-semibold text-gray-900">
                  {currentTariff?.title || 'Не выбран'}
                </div>
                <div className="text-xs text-gray-500">
                  {tariffActiveUntil
                    ? `Активен до ${formatDate(tariffActiveUntil, dateFormatter)}`
                    : 'Без установленной даты окончания'}
                </div>
              </div>
              {!userId ? (
                <AppButton
                  variant="secondary"
                  size="sm"
                  className="shrink-0 rounded-md"
                  onClick={() => router.push('/cabinet/tariff-select')}
                >
                  Тарифы
                </AppButton>
              ) : null}
            </SectionCard>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <AppButton
                disabled={busy || showCharge}
                onClick={() => modalsFunc.user?.topup(userId, refreshHistory)}
              >
                Пополнить баланс
              </AppButton>
              <AppButton
                variant="secondary"
                disabled={busy || showCharge}
                onClick={() => setShowCharge(true)}
              >
                Списать с баланса
              </AppButton>
              <AppButton
                variant="secondary"
                disabled={busy || showCharge}
                onClick={() =>
                  modalsFunc.user?.tariffChange(userId, refreshHistory)
                }
              >
                Сменить тариф
              </AppButton>
            </div>
          ) : null}
          {canManage && showCharge ? (
            <ManualBalanceChargeForm
              userId={userId}
              balance={balance}
              onSuccess={handleChargeSuccess}
              onCancel={() => setShowCharge(false)}
            />
          ) : null}

          <SectionCard className="p-3">
            <div className="mb-3">
              <div className="font-semibold text-gray-900">
                История операций
              </div>
              <div className="mt-0.5 text-sm text-gray-500">
                Оплаты тарифов, пополнения, возвраты и бонусы. Банковское
                зачисление и списание за тариф отображаются отдельно.
              </div>
            </div>
            <div
              className="flex gap-2 overflow-x-auto pb-1"
              role="group"
              aria-label="Фильтр истории операций"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={category === option.value}
                  className={cn(
                    'min-h-11 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-semibold transition-colors',
                    category === option.value
                      ? 'border-general bg-general text-white'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  )}
                  onClick={() => setCategory(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </SectionCard>

          {query.isLoading ? (
            <div className="flex min-h-48 items-center justify-center">
              <LoadingSpinner size="sm" text="Загружаем операции..." />
            </div>
          ) : query.isError ? (
            <Notice
              tone="error"
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <span>
                {query.error?.message ||
                  'Не удалось загрузить историю операций'}
              </span>
              <AppButton
                variant="secondary"
                size="sm"
                onClick={() => query.refetch()}
              >
                Повторить
              </AppButton>
            </Notice>
          ) : items.length === 0 ? (
            <EmptyState
              className="min-h-48"
              icon={<FontAwesomeIcon icon={faClock} className="h-5 w-5" />}
              title="Операций пока нет"
              hint={
                category === 'all'
                  ? 'Здесь появятся оплаты тарифов, пополнения и бонусы.'
                  : 'В выбранной категории операций пока нет.'
              }
            />
          ) : (
            <ul className="grid gap-2">
              {items.map((item) => (
                <PaymentRow
                  key={item.id}
                  item={item}
                  userId={userId}
                  canManage={canManage}
                  canEditReceipt={loggedUser?.role === 'dev' && Boolean(userId)}
                  busy={busy || showCharge}
                  onDelete={deletePayment}
                  onSync={syncPayment}
                />
              ))}
            </ul>
          )}

          {query.hasNextPage ? (
            <div className="flex justify-center pb-2">
              <AppButton
                variant="secondary"
                disabled={query.isFetchingNextPage}
                onClick={() => query.fetchNextPage()}
              >
                {query.isFetchingNextPage
                  ? 'Загрузка...'
                  : 'Показать более ранние'}
              </AppButton>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default BillingHistoryContent
