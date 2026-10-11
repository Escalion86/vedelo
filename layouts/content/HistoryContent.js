'use client'

import { useDeferredValue, useId, useMemo, useState } from 'react'
import { useAtomValue } from 'jotai'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faFilter } from '@fortawesome/free-solid-svg-icons'
import AppButton from '@components/AppButton'
import PeriodPicker from '@components/PeriodPicker'
import HistoryFeed from '@components/HistoryFeed'
import Notice from '@components/Notice'
import { modalsFuncAtom } from '@state/atoms'
import { useUsersQuery } from '@helpers/useEntityQueries'
import styles from './HistoryContent.module.css'

const ENTITY_OPTIONS = [
  ['', 'Все карточки'],
  ['event', 'Заявки и мероприятия'],
  ['client', 'Клиенты'],
  ['transaction', 'Финансы'],
]
const OPERATION_OPTIONS = [
  ['', 'Все действия'],
  ['create', 'Добавление'],
  ['update', 'Изменение'],
  ['delete', 'Удаление'],
  ['merge', 'Объединение'],
]
const SOURCE_OPTIONS = [
  ['', 'Все источники'],
  ['web', 'Web'],
  ['android', 'Android'],
  ['public_api', 'Public API'],
  ['tilda', 'Tilda'],
  ['google_import', 'Google Calendar'],
  ['avito', 'Avito'],
  ['vk', 'VK'],
  ['telephony', 'Телефония'],
  ['file_import', 'Импорт из файла'],
]

const FilterSelect = ({ label, value, onChange, options }) => {
  const id = useId()
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className={`ui-input ${styles.input}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  )
}

const HistoryContent = () => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const [entityType, setEntityType] = useState('')
  const [operation, setOperation] = useState('')
  const [source, setSource] = useState('')
  const [actorId, setActorId] = useState('')
  const [search, setSearch] = useState('')
  const [period, setPeriod] = useState({ from: '', to: '' })
  const { from: dateFrom, to: dateTo } = period
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtersId = useId()
  const deferredSearch = useDeferredValue(search.trim())
  const { data: users = [] } = useUsersQuery()
  const actorOptions = useMemo(
    () => [
      ['', 'Все авторы'],
      ...users.map((user) => [
        String(user._id),
        [user.firstName, user.secondName].filter(Boolean).join(' ') ||
          user.phone ||
          'Пользователь',
      ]),
    ],
    [users]
  )
  const filters = useMemo(
    () => ({
      entityType,
      operation,
      source,
      actorId,
      search: deferredSearch,
      dateFrom,
      dateTo: dateTo ? `${dateTo}T23:59:59.999` : '',
      limit: 30,
    }),
    [actorId, dateFrom, dateTo, deferredSearch, entityType, operation, source]
  )
  const activeCount = [
    entityType,
    operation,
    source,
    actorId,
    dateFrom,
    dateTo,
  ].filter(Boolean).length
  const activeLabels = [
    ENTITY_OPTIONS.find(([value]) => value && value === entityType)?.[1],
    OPERATION_OPTIONS.find(([value]) => value && value === operation)?.[1],
    SOURCE_OPTIONS.find(([value]) => value && value === source)?.[1],
    actorOptions.find(([value]) => value && value === actorId)?.[1],
    dateFrom && `С ${dateFrom}`,
    dateTo && `По ${dateTo}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const resetFilters = () => {
    setEntityType('')
    setOperation('')
    setSource('')
    setActorId('')
    setSearch('')
    setPeriod({ from: '', to: '' })
  }

  const openItem = (item) => {
    if (item.entityType === 'event') modalsFunc.event?.view(item.entityId)
    if (item.entityType === 'client') modalsFunc.client?.view(item.entityId)
    if (item.entityType === 'transaction')
      modalsFunc.transaction?.edit(null, item.entityId)
  }

  return (
    <div className="laptop:p-4 flex h-full min-h-0 flex-col gap-3 overflow-hidden p-3">
      <div className={styles.toolbar}>
        <div className={styles.searchRow}>
          <label className={`${styles.field} ${styles.search}`}>
            Поиск
            <input
              className={`ui-input ${styles.input}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Карточка или пользователь"
            />
          </label>
          <AppButton
            variant="secondary"
            size="sm"
            className={styles.toggle}
            aria-expanded={filtersOpen}
            aria-controls={filtersId}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <FontAwesomeIcon icon={faFilter} className="h-3 w-3" />
            Фильтры{activeCount ? ` (${activeCount})` : ''}
            <FontAwesomeIcon
              icon={faChevronDown}
              className={`h-3 w-3 ${filtersOpen ? 'rotate-180' : ''}`}
            />
          </AppButton>
        </div>
        {activeCount || search.trim() ? (
          <div className={styles.summaryRow}>
            <span
              className={`card-muted ${styles.summary}`}
              title={activeLabels}
            >
              {activeLabels || 'Поиск по истории'}
            </span>
            <AppButton
              variant="ghost"
              size="sm"
              className={styles.reset}
              aria-label="Сбросить фильтры"
              onClick={resetFilters}
            >
              Сбросить
            </AppButton>
          </div>
        ) : null}
        <div id={filtersId} hidden={!filtersOpen} className={styles.expanded}>
          {filtersOpen ? (
            <div className={styles.grid}>
              <FilterSelect
                label="Карточки"
                value={entityType}
                onChange={setEntityType}
                options={ENTITY_OPTIONS}
              />
              <FilterSelect
                label="Действия"
                value={operation}
                onChange={setOperation}
                options={OPERATION_OPTIONS}
              />
              <FilterSelect
                label="Источник"
                value={source}
                onChange={setSource}
                options={SOURCE_OPTIONS}
              />
              <FilterSelect
                label="Автор"
                value={actorId}
                onChange={setActorId}
                options={actorOptions}
              />
              <PeriodPicker
                className="col-span-2"
                value={period}
                onChange={setPeriod}
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <Notice tone="info" className="mb-3 text-xs">
          История до даты обновления могла сохраниться не полностью.
        </Notice>
        <HistoryFeed filters={filters} onOpenItem={openItem} />
      </div>
    </div>
  )
}

export default HistoryContent
