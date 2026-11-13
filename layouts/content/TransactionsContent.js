'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { List } from 'react-window'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import AppButton from '@components/AppButton'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import LoadingSpinner from '@components/LoadingSpinner'
import Notice from '@components/Notice'
import TransactionDateRangeFilter from '@components/TransactionDateRangeFilter'
import DropDown from '@components/DropDown'
import SectionCard from '@components/SectionCard'
import TransactionCard from '@layouts/cards/TransactionCard'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'
import { TRANSACTION_TYPES } from '@helpers/constants'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import { setAtomValue } from '@state/storeHelpers'
import useUiDensity from '@helpers/useUiDensity'
import { toDateInputValue } from '@helpers/transactionDateRange'
import { filterTransactions } from '@helpers/transactionFilters'
import { queryKeys } from '@helpers/queryKeys'
import {
  useDeleteTransactionMutation,
  useTransactionsQuery,
} from '@helpers/useTransactionsQuery'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventsQuery } from '@helpers/useEventsQuery'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import FiltersButton from '@components/FiltersButton'
import {
  faCheck,
  faChevronDown,
  faFilter,
  faLink,
  faMoneyBill,
  faUnlink,
} from '@fortawesome/free-solid-svg-icons'

const TRANSACTION_TYPE_OPTIONS = [
  { value: 'all', label: 'Все транзакции' },
  { value: 'income', label: 'Доходы' },
  { value: 'expense', label: 'Расходы' },
  { value: 'obligation', label: 'Обязательства' },
]
const EMPTY_TRANSACTIONS = []

const TransactionTypeFilter = ({ value, onChange }) => {
  const activeOption =
    TRANSACTION_TYPE_OPTIONS.find((item) => item.value === value) ??
    TRANSACTION_TYPE_OPTIONS[0]

  return (
    <DropDown
      renderInPortal
      menuPadding={false}
      menuClassName="filter-menu w-[min(276px,calc(100vw-24px))] flex-col items-stretch overflow-hidden"
      trigger={
        <button
          type="button"
          className="filter-control filter-control--primary min-w-[72px]"
          aria-label="Выбрать тип транзакций"
        >
          {activeOption.value === 'all' ? 'Все' : activeOption.label}
          <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3" />
        </button>
      }
    >
      {TRANSACTION_TYPE_OPTIONS.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            className={`filter-menu-item ${
              active ? 'filter-menu-item--active' : ''
            }`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {active ? (
              <FontAwesomeIcon icon={faCheck} className="h-4 w-4" />
            ) : null}
          </button>
        )
      })}
    </DropDown>
  )
}

const TransactionRelationFilter = ({ value, onChange }) => {
  const activeCount = Number(!value.linked) + Number(!value.unlinked)
  const toggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    if (!next.linked && !next.unlinked) return
    onChange(next)
  }

  return (
    <DropDown
      renderInPortal
      turnOffAutoClose="inside"
      menuPadding="sm"
      menuClassName="min-w-52 flex-col items-stretch !border-gray-200 !bg-white"
      trigger={
        <FiltersButton
          active={activeCount > 0}
          count={activeCount}
          aria-label={
            activeCount > 0
              ? 'Дополнительные фильтры транзакций, есть активные фильтры'
              : 'Дополнительные фильтры транзакций'
          }
        />
      }
    >
      <div className="w-full p-1">
        {[
          { key: 'linked', label: 'Связанные', icon: faLink },
          { key: 'unlinked', label: 'Без связи', icon: faUnlink },
        ].map((item) => (
          <button
            key={item.key}
            type="button"
            className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => toggle(item.key)}
          >
            <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {value[item.key] ? (
              <FontAwesomeIcon
                icon={faCheck}
                className="h-4 w-4 text-[var(--ui-primary)]"
              />
            ) : null}
          </button>
        ))}
      </div>
    </DropDown>
  )
}

const TransactionsContent = ({ onHeaderCountChange }) => {
  const { isCompact } = useUiDensity()
  const transactionsQuery = useTransactionsQuery(undefined, {
    queryKey: queryKeys.transactionsList,
  })
  const transactions = transactionsQuery.data ?? EMPTY_TRANSACTIONS
  const showTransactions =
    Array.isArray(transactionsQuery.data) &&
    (!transactionsQuery.isError || transactions.length > 0)
  const isOffline = transactionsQuery.fetchStatus === 'paused'
  const deleteTransactionMutation = useDeleteTransactionMutation()
  const { data: clients = [] } = useClientsQuery()
  const { data: eventsPayload } = useEventsQuery({
    scope: 'all',
    enabled: false,
  })
  const events = useMemo(() => eventsPayload?.data ?? [], [eventsPayload?.data])
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [typeMode, setTypeMode] = useState('all')
  const [relationFilter, setRelationFilter] = useState({
    linked: true,
    unlinked: true,
  })
  const [dateRange, setDateRange] = useState({
    from: '',
    to: '',
  })
  const itemHeight = isCompact ? 116 : 128

  const typeFilter = useMemo(
    () => ({
      income: typeMode === 'all' || typeMode === 'income',
      expense: typeMode === 'all' || typeMode === 'expense',
      obligation: typeMode === 'all' || typeMode === 'obligation',
    }),
    [typeMode]
  )

  const typeMap = useMemo(
    () =>
      TRANSACTION_TYPES.reduce((acc, item) => {
        acc[item.value] = item
        return acc
      }, {}),
    []
  )

  const clientsMap = useMemo(
    () =>
      clients.reduce((acc, client) => {
        acc[client._id] = client
        return acc
      }, {}),
    [clients]
  )

  const eventsMap = useMemo(
    () =>
      events.reduce((acc, event) => {
        acc[event._id] = event
        return acc
      }, {}),
    [events]
  )

  const sortedTransactions = useMemo(
    () =>
      [...transactions].sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0
        const dateB = b.date ? new Date(b.date).getTime() : 0
        return dateB - dateA
      }),
    [transactions]
  )

  const transactionsBeforeDateFilter = useMemo(() => {
    return filterTransactions({
      transactions: sortedTransactions,
      typeFilter,
      relationFilter,
      dateFrom: '',
      dateTo: '',
    })
  }, [relationFilter, sortedTransactions, typeFilter])

  const activeTransactionDateKeys = useMemo(() => {
    const keys = new Set()
    transactionsBeforeDateFilter.forEach((transaction) => {
      const key = toDateInputValue(transaction?.date)
      if (key) keys.add(key)
    })
    return keys
  }, [transactionsBeforeDateFilter])

  const filteredTransactions = useMemo(() => {
    return filterTransactions({
      transactions: transactionsBeforeDateFilter,
      typeFilter,
      relationFilter,
      dateFrom: dateRange.from,
      dateTo: dateRange.to,
    })
  }, [
    dateRange.from,
    dateRange.to,
    relationFilter,
    transactionsBeforeDateFilter,
    typeFilter,
  ])

  const handleDelete = useCallback(
    (transactionId) => {
      modalsFunc.confirm({
        title: 'Удаление транзакции',
        text: 'Вы уверены, что хотите удалить транзакцию?',
        onConfirm: async () => {
          setAtomValue(loadingAtom('transaction' + transactionId), true)
          setAtomValue(errorAtom('transaction' + transactionId), false)
          try {
            await deleteTransactionMutation.mutateAsync(transactionId)
            setAtomValue(loadingAtom('transaction' + transactionId), false)
          } catch (error) {
            setAtomValue(loadingAtom('transaction' + transactionId), false)
            setAtomValue(errorAtom('transaction' + transactionId), true)
          }
        },
      })
    },
    [deleteTransactionMutation, modalsFunc]
  )

  const RowComponent = useCallback(
    ({ index, style }) => {
      const transaction = filteredTransactions[index]
      const client = clientsMap[transaction.clientId]
      const event = eventsMap[transaction.eventId]
      const type = typeMap[transaction.type] ?? typeMap.expense
      const handleEdit = () =>
        modalsFunc.transaction?.edit(transaction.eventId, transaction._id, {
          initialTransaction: transaction,
        })

      return (
        <TransactionCard
          style={style}
          transaction={transaction}
          client={client}
          event={event}
          type={type}
          onEdit={handleEdit}
          onDelete={() => handleDelete(transaction._id)}
        />
      )
    },
    [
      filteredTransactions,
      clientsMap,
      eventsMap,
      typeMap,
      modalsFunc.transaction,
      handleDelete,
    ]
  )

  const headerCount = showTransactions ? filteredTransactions.length : null
  useEffect(() => {
    onHeaderCountChange?.(headerCount)
  }, [headerCount, onHeaderCountChange])

  return (
    <div className="flex h-full flex-col">
      <ContentHeader>
        <HeaderActions
          left={
            <div className="ml-2 flex min-w-0 flex-wrap items-end gap-2">
              <TransactionTypeFilter value={typeMode} onChange={setTypeMode} />
              <TransactionDateRangeFilter
                value={dateRange}
                onChange={setDateRange}
                activeDateKeys={activeTransactionDateKeys}
              />
              <TransactionRelationFilter
                value={relationFilter}
                onChange={setRelationFilter}
              />
            </div>
          }
          leftClassName="min-w-0 flex-wrap"
          right={
            <AddIconButton
              onClick={() => modalsFunc.transaction?.add()}
              disabled={!modalsFunc.transaction?.add}
              title="Добавить транзакцию"
              size="sm"
              variant="neutral"
            />
          }
        />
      </ContentHeader>
      <SectionCard className="flex min-h-0 flex-1 flex-col overflow-hidden border-0 bg-transparent shadow-none">
        {transactionsQuery.isError ? (
          <Notice
            tone={showTransactions ? 'warning' : 'error'}
            role={showTransactions ? 'status' : 'alert'}
            className="mx-2 mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3"
          >
            <span>
              {showTransactions
                ? 'Не удалось обновить транзакции. Показаны сохранённые данные.'
                : 'Не удалось загрузить транзакции'}
            </span>
            <AppButton
              variant="secondary"
              size="sm"
              disabled={transactionsQuery.isFetching || isOffline}
              aria-busy={transactionsQuery.isFetching}
              onClick={() => void transactionsQuery.refetch()}
            >
              Повторить
            </AppButton>
          </Notice>
        ) : null}
        {!showTransactions ? (
          !transactionsQuery.isError && (
            <div role="status" className="flex min-h-40 items-center justify-center">
              {isOffline ? (
                <span className="card-muted">Ожидаем подключения к интернету…</span>
              ) : (
                <>
                  <div aria-hidden="true">
                    <LoadingSpinner size="xs" heightClassName="h-auto" />
                  </div>
                  <span>Загружаем транзакции…</span>
                </>
              )}
            </div>
          )
        ) : filteredTransactions.length > 0 ? (
          <div className="min-h-0 flex-1">
            <List
              rowCount={filteredTransactions.length}
              rowHeight={itemHeight}
              rowComponent={RowComponent}
              rowProps={{}}
              style={{ height: '100%', width: '100%' }}
            />
          </div>
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={<FontAwesomeIcon icon={faMoneyBill} className="h-5 w-5" />}
            title="Пока нет ни одной транзакции"
            hint="Фиксируйте задатки, оплаты и расходы — так карточка мероприятия покажет реальный итог."
            actionLabel="Добавить транзакцию"
            onAction={() => modalsFunc.transaction?.add()}
          />
        ) : (
          <EmptyState
            icon={<FontAwesomeIcon icon={faFilter} className="h-5 w-5" />}
            title="По выбранным фильтрам транзакций нет"
            hint="Попробуйте изменить период или сбросить фильтры."
            actionLabel="Сбросить фильтры"
            onAction={() => {
              setTypeMode('all')
              setRelationFilter({ linked: true, unlinked: true })
              setDateRange({ from: '', to: '' })
            }}
          />
        )}
      </SectionCard>
    </div>
  )
}

export default TransactionsContent
