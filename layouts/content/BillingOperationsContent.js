'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowDown,
  faArrowUp,
  faClock,
  faGift,
  faReceipt,
} from '@fortawesome/free-solid-svg-icons'
import { useState } from 'react'
import cn from 'classnames'
import AppButton from '@components/AppButton'
import EmptyState from '@components/EmptyState'
import Input from '@components/Input'
import LoadingSpinner from '@components/LoadingSpinner'
import NativeSelect from '@components/NativeSelect'
import Notice from '@components/Notice'
import SectionCard from '@components/SectionCard'
import PaymentReceiptControl from '@components/PaymentReceiptControl'
import { formatMoney } from '@helpers/formatMoney'
import { usePaymentOperationsQuery } from '@helpers/usePaymentOperationsQuery'

const CATEGORY_OPTIONS = [
  ['all', 'Все операции'],
  ['receipt_missing', 'Без чека'],
  ['tariff', 'Тарифы'],
  ['topup', 'Пополнения'],
  ['bonus', 'Бонусы'],
  ['refund', 'Возвраты'],
  ['charge', 'Списания'],
]
const STATUS_OPTIONS = [
  ['all', 'Все статусы'],
  ['succeeded', 'Проведено'],
  ['pending', 'Ожидает'],
  ['failed', 'Ошибка'],
  ['canceled', 'Отменено'],
]
const SOURCE_OPTIONS = [
  ['all', 'Все источники'],
  ['tochka', 'Точка'],
  ['yookassa', 'ЮKassa'],
  ['manual', 'Ручная операция'],
  ['system', 'Ведело'],
]
const SORT_OPTIONS = [
  ['newest', 'Сначала новые'],
  ['oldest', 'Сначала старые'],
  ['amount_desc', 'Сумма: больше'],
  ['amount_asc', 'Сумма: меньше'],
]
const PAGE_SIZE = 50
const formatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const formatDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Дата не указана'
    : formatter.format(date)
}
const getStatus = (status) =>
  status === 'pending'
    ? ['Ожидает', 'pending']
    : status === 'failed'
      ? ['Ошибка', 'failed']
      : status === 'canceled'
        ? ['Отменено', 'failed']
        : ['Проведено', 'succeeded']
const getIcon = (item) =>
  item.kind === 'bonus' || item.kind === 'referral_bonus'
    ? faGift
    : item.kind === 'tariff'
      ? faReceipt
      : item.direction === 'out'
        ? faArrowUp
        : faArrowDown

const PaymentOperationRow = ({ item }) => {
  const [statusLabel, tone] = getStatus(item.status)
  const muted = tone !== 'succeeded'
  const sign = muted ? '' : item.direction === 'out' ? '−' : '+'
  return (
    <li className="ui-surface-card grid gap-3 rounded-xl p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(180px,.8fr)_auto] lg:items-center">
      <div className="flex w-full min-w-0 items-start gap-3">
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
            muted
              ? 'border-gray-300 bg-gray-100 text-gray-500'
              : item.direction === 'out'
                ? 'border-red-200 bg-red-50 text-[var(--tx-expense)]'
                : 'border-emerald-200 bg-emerald-50 text-[var(--tx-income)]'
          )}
        >
          <FontAwesomeIcon icon={getIcon(item)} className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-gray-900">{item.title}</div>
          {item.details ? (
            <div className="mt-0.5 text-sm text-gray-600">{item.details}</div>
          ) : null}
          <div className="mt-1 text-xs text-gray-500">
            {[statusLabel, item.sourceTitle, item.methodTitle]
              .filter(Boolean)
              .join(' • ')}
          </div>
          <PaymentReceiptControl
            item={item}
            userId={item.user?.id}
            canEdit={item.management?.canEditReceipt && Boolean(item.user?.id)}
          />
        </div>
      </div>
      <div className="min-w-0 border-t border-gray-100 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
        <div className="truncate text-sm font-semibold text-gray-900">
          {item.user?.name || 'Пользователь удалён'}
        </div>
        {item.user?.contact ? (
          <div className="mt-0.5 truncate text-xs text-gray-500">
            {item.user.contact}
          </div>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-4 lg:flex-col lg:text-right">
        <div
          className={cn(
            'font-semibold tabular-nums',
            muted
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
      </div>
    </li>
  )
}

const FilterSelect = ({ label, value, onChange, options }) => (
  <label className="input-label flex flex-col gap-1 text-xs font-semibold">
    {label}
    <NativeSelect
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full cursor-pointer rounded border border-gray-300 bg-white px-3 text-sm font-semibold text-gray-800"
      arrowClassName="right-3"
    >
      {options.map(([optionValue, optionLabel]) => (
        <option key={optionValue} value={optionValue}>
          {optionLabel}
        </option>
      ))}
    </NativeSelect>
  </label>
)

const BillingOperationsContent = () => {
  const [filters, setFilters] = useState({
    category: 'all',
    status: 'all',
    source: 'all',
    direction: 'all',
    sort: 'newest',
    search: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
    limit: PAGE_SIZE,
  })
  const query = usePaymentOperationsQuery(filters)
  const items = query.data?.data || []
  const meta = query.data?.meta
  const setFilter = (key, value) =>
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: key === 'page' ? value : 1,
    }))
  const clearFilters = () =>
    setFilters({
      category: 'all',
      status: 'all',
      source: 'all',
      direction: 'all',
      sort: 'newest',
      search: '',
      dateFrom: '',
      dateTo: '',
      page: 1,
      limit: PAGE_SIZE,
    })
  return (
    <div className="laptop:p-4 flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        <SectionCard className="p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Все операции
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Пополнения, списания за тарифы, реферальные начисления, возвраты
                и служебные операции всех пользователей.
              </p>
            </div>
            <AppButton variant="secondary" size="sm" onClick={clearFilters}>
              Сбросить фильтры
            </AppButton>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2 lg:col-span-2">
              <Input
                label="Пользователь или контакт"
                value={filters.search}
                onChange={(value) => setFilter('search', value)}
                placeholder="Имя, телефон, email или Telegram"
                noMargin
              />
            </div>
            <FilterSelect
              label="Категория"
              value={filters.category}
              onChange={(value) => setFilter('category', value)}
              options={CATEGORY_OPTIONS}
            />
            <FilterSelect
              label="Статус"
              value={filters.status}
              onChange={(value) => setFilter('status', value)}
              options={STATUS_OPTIONS}
            />
            <FilterSelect
              label="Источник"
              value={filters.source}
              onChange={(value) => setFilter('source', value)}
              options={SOURCE_OPTIONS}
            />
            <FilterSelect
              label="Направление"
              value={filters.direction}
              onChange={(value) => setFilter('direction', value)}
              options={[
                ['all', 'Все направления'],
                ['in', 'Поступления'],
                ['out', 'Списания'],
              ]}
            />
            <FilterSelect
              label="Сортировка"
              value={filters.sort}
              onChange={(value) => setFilter('sort', value)}
              options={SORT_OPTIONS}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Дата от"
                type="date"
                value={filters.dateFrom}
                onChange={(value) => setFilter('dateFrom', value)}
                className="min-w-0"
                inputClassName="min-w-0 w-full [&::-webkit-calendar-picker-indicator]:-mr-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                noMargin
              />
              <Input
                label="Дата до"
                type="date"
                value={filters.dateTo}
                onChange={(value) => setFilter('dateTo', value)}
                className="min-w-0"
                inputClassName="min-w-0 w-full [&::-webkit-calendar-picker-indicator]:-mr-1 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                noMargin
              />
            </div>
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
            className="flex items-center justify-between gap-3"
          >
            <span>
              {query.error?.message || 'Не удалось загрузить операции'}
            </span>
            <AppButton
              variant="secondary"
              size="sm"
              onClick={() => query.refetch()}
            >
              Повторить
            </AppButton>
          </Notice>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-sm text-gray-500">
              <span>Найдено: {meta?.total ?? 0}</span>
              {meta?.pageCount > 1 ? (
                <span>
                  Страница {meta.page} из {meta.pageCount}
                </span>
              ) : null}
            </div>
            {items.length === 0 ? (
              <EmptyState
                className="min-h-48"
                icon={<FontAwesomeIcon icon={faClock} className="h-5 w-5" />}
                title="Операций не найдено"
                hint="Измените условия фильтрации или сбросьте их."
              />
            ) : (
              <ul className="grid gap-2">
                {items.map((item) => (
                  <PaymentOperationRow key={item.id} item={item} />
                ))}
              </ul>
            )}
            {meta?.pageCount > 1 ? (
              <div className="flex justify-center gap-2 pb-2">
                <AppButton
                  variant="secondary"
                  size="sm"
                  disabled={filters.page <= 1}
                  onClick={() => setFilter('page', filters.page - 1)}
                >
                  Назад
                </AppButton>
                <AppButton
                  variant="secondary"
                  size="sm"
                  disabled={filters.page >= meta.pageCount}
                  onClick={() => setFilter('page', filters.page + 1)}
                >
                  Вперёд
                </AppButton>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

export default BillingOperationsContent
