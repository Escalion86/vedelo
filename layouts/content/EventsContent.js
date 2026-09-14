'use client'
import { isEventImportChecked } from '@helpers/fileImport.mjs'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { List, useListRef } from 'react-window'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import ViewListIcon from '@mui/icons-material/ViewList'
import ContentHeader from '@components/ContentHeader'
import CreateEventFab from '@components/CreateEventFab'
import ComboBox from '@components/ComboBox'
import DropDown from '@components/DropDown'
import EmptyState from '@components/EmptyState'
import CabinetFilterChip from '@components/CabinetFilterChip'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import useEventCreateMenu from '@helpers/useEventCreateMenu'
import windowDimensionsTailwindSelector from '@state/selectors/windowDimensionsTailwindSelector'
// import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom, modalsAtom } from '@state/atoms'
import EventCard from '@layouts/cards/EventCard'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  eventHasAdditionalSegment,
  getAdditionalEventsSummary,
} from '@helpers/additionalEvents'
import AppButton from '@components/AppButton'
import useUiDensity from '@helpers/useUiDensity'
import { getData } from '@helpers/CRUD'
import { isEventCreatedViaPublicApi } from '@helpers/eventSource'
import {
  useEventsQuery,
  useLoadMorePastEventsMutation,
} from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'
import { getEventStatusFlags } from '@helpers/eventStatusFilter'
import {
  createEventListFiltersState,
  getStatusFilterDefaults,
  getStatusFilterKeys,
  readEventListFiltersState,
  writeEventListFiltersState,
} from '@helpers/eventListFilters'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

// Неделя в календаре месяца начинается с понедельника (локально для этого экрана,
// общий DAYS_OF_WEEK в helpers/constants остаётся с воскресенья для форматтеров дат)
const DAYS_OF_WEEK_MONDAY_START = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

const STATUS_FILTER_META = {
  request: {
    label: 'Заявки',
    selectedClass: 'border-gray-600 bg-gray-700 text-white',
    idleClass: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    dotClass: 'bg-gray-500',
  },
  active: {
    label: 'Мероприятия',
    selectedClass: 'border-blue-600 bg-blue-600 text-white',
    idleClass: 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50',
    dotClass: 'bg-blue-600',
  },
  finished: {
    label: 'Завершены',
    selectedClass: 'border-emerald-600 bg-emerald-600 text-white',
    idleClass:
      'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50',
    dotClass: 'bg-emerald-600',
  },
  closed: {
    label: 'Закрыты',
    selectedClass: 'border-sky-600 bg-sky-600 text-white',
    idleClass: 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50',
    dotClass: 'bg-sky-600',
  },
  canceled: {
    label: 'Отменены',
    selectedClass: 'border-red-600 bg-red-600 text-white',
    idleClass: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
    dotClass: 'bg-red-600',
  },
}

const CHECK_FILTER_META = {
  checked: {
    label: 'Проверенные',
    selectedClass: 'border-emerald-600 bg-emerald-600 text-white',
    idleClass:
      'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50',
    dotClass: 'bg-emerald-600',
  },
  unchecked: {
    label: 'Не проверенные',
    selectedClass: 'border-amber-500 bg-amber-500 text-white',
    idleClass: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50',
    dotClass: 'bg-amber-500',
  },
}

const TRANSFERRED_FILTER_META = {
  label: 'Переданы',
  selectedClass: 'border-amber-500 bg-amber-500 text-white',
  idleClass: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50',
  dotClass: 'bg-amber-500',
}

const PAST_QUICK_FILTERS = [
  {
    key: 'needsClose',
    label: 'Нужно закрыть',
    statusFilter: {
      finished: true,
      closed: false,
      canceled: false,
    },
    transferredMode: 'exclude',
  },
  {
    key: 'closed',
    label: 'Закрытые',
    statusFilter: {
      finished: false,
      closed: true,
      canceled: false,
    },
    transferredMode: 'all',
  },
  {
    key: 'canceled',
    label: 'Отмененные',
    statusFilter: {
      finished: false,
      closed: false,
      canceled: true,
    },
    transferredMode: 'all',
  },
]

const getCalendarItemTimeLabel = (value) => {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return 'Время не указано'
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const DayEventsModal = ({ eventItems, additionalItems, openEvent }) => (
  <div className="flex max-h-[70vh] flex-col gap-2 overflow-auto px-1 py-1">
    {eventItems.length > 0 ? (
      <>
        <div className="text-sm font-semibold text-gray-700">Мероприятия</div>
        <div className="grid min-w-0">
          {eventItems.map((item) => (
            <EventCard
              key={item.eventId}
              eventId={item.eventId}
              event={item.event}
            />
          ))}
        </div>
      </>
    ) : null}
    {additionalItems.length > 0 ? (
      <>
        <div className="mt-2 text-sm font-semibold text-gray-700">
          Задачи/События
        </div>
        {additionalItems.map((item, index) => (
          <div
            key={`month-day-additional-${item.eventId}-${item.index}-${index}`}
            className="rounded border border-gray-200 bg-white px-3 py-2"
          >
            <div className="text-sm font-semibold text-gray-900">
              {item.title}
            </div>
            <div className="text-xs text-gray-600">
              {item.done ? 'Выполнено' : 'Активно'} •{' '}
              {getCalendarItemTimeLabel(item.date)}
            </div>
            {item.description ? (
              <div className="text-xs text-gray-600">{item.description}</div>
            ) : null}
            <div className="mt-2">
              <AppButton
                variant="secondary"
                size="sm"
                className="tablet:w-auto w-full rounded-md"
                onClick={() => openEvent?.(item.eventId)}
              >
                Открыть мероприятие
              </AppButton>
            </div>
          </div>
        ))}
      </>
    ) : null}
  </div>
)

const getMonthItemToneClassName = (item) => {
  if (item.type === 'event') {
    if (item.status === 'canceled') {
      return 'border-red-200 bg-red-50 text-red-700'
    }
    if (item.status === 'draft') {
      return 'border-gray-200 bg-gray-100 text-gray-700'
    }
    if (item.status === 'closed') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    }
    return 'border-blue-200 bg-blue-50 text-blue-700'
  }

  if (item.done) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 line-through'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700'
}

const EventStatusFilterChips = ({
  value,
  onChange,
  mode = 'all',
  activeLabel,
}) => {
  const keys = getStatusFilterKeys(mode)

  const handleToggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    const hasAnySelected = keys.some((statusKey) => Boolean(next[statusKey]))
    if (!hasAnySelected) next[key] = true
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {keys.map((key) => {
        const meta = STATUS_FILTER_META[key]
        return (
          <CabinetFilterChip
            key={key}
            active={Boolean(value[key])}
            label={key === 'active' && activeLabel ? activeLabel : meta.label}
            selectedClassName={meta.selectedClass}
            idleClassName={meta.idleClass}
            dotClassName={meta.dotClass}
            onClick={() => handleToggle(key)}
          />
        )
      })}
    </div>
  )
}

const EventCheckFilterChips = ({ value, onChange }) => {
  const keys = ['checked', 'unchecked']

  const handleToggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    if (!next.checked && !next.unchecked) {
      const fallbackKey = key === 'checked' ? 'unchecked' : 'checked'
      next[fallbackKey] = true
    }
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {keys.map((key) => {
        const meta = CHECK_FILTER_META[key]
        return (
          <CabinetFilterChip
            key={key}
            active={Boolean(value[key])}
            label={meta.label}
            selectedClassName={meta.selectedClass}
            idleClassName={meta.idleClass}
            dotClassName={meta.dotClass}
            onClick={() => handleToggle(key)}
          />
        )
      })}
    </div>
  )
}

const EventTransferredFilterChip = ({ value, onChange }) => {
  const meta = TRANSFERRED_FILTER_META

  return (
    <div className="border-t border-gray-200 pt-2">
      <div className="mb-1.5 text-xs font-medium text-gray-500">Передача</div>
      <CabinetFilterChip
        active={value}
        label={meta.label}
        selectedClassName={meta.selectedClass}
        idleClassName={meta.idleClass}
        dotClassName={meta.dotClass}
        onClick={() => onChange(!value)}
      />
    </div>
  )
}

const parseBooleanSearchParam = (value) => {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

const getEventCompletionTime = (event) => {
  const raw = event?.dateEnd ?? event?.eventDate ?? null
  if (!raw) return null
  const time = new Date(raw).getTime()
  return Number.isNaN(time) ? null : time
}

const toMonthStart = (value = new Date()) =>
  new Date(value.getFullYear(), value.getMonth(), 1)

const toDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const toMinuteOfDay = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours() * 60 + date.getMinutes()
}

const getValidDateTime = (value) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

const EventsContent = ({
  filter = 'all',
  eventsPaging = null,
  onHeaderCountChange,
}) => {
  const { isCompact } = useUiDensity()
  const workItemTerms = useWorkItemTerminology()
  const eventsScope =
    filter === 'upcoming' ? 'upcoming' : filter === 'past' ? 'past' : 'all'

  const [viewMode, setViewMode] = useState('list')
  const [monthCursor, setMonthCursor] = useState(() => toMonthStart(new Date()))
  const monthAutoPositionedRef = useRef(false)

  // Сетка дней календаря (включая дни соседних месяцев), неделя с понедельника
  const monthGridDays = useMemo(() => {
    const monthStart = toMonthStart(monthCursor)
    const year = monthStart.getFullYear()
    const month = monthStart.getMonth()

    // getDay(): воскресенье = 0 → переводим в понедельник = 0
    const toMondayIndex = (date) => (date.getDay() + 6) % 7

    const firstDay = new Date(year, month, 1)
    const gridStart = new Date(year, month, 1 - toMondayIndex(firstDay))

    const lastDay = new Date(year, month + 1, 0)
    const gridEnd = new Date(
      year,
      month,
      lastDay.getDate() + (6 - toMondayIndex(lastDay))
    )

    const diffMs = gridEnd.getTime() - gridStart.getTime()
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1
    const weeksCount = Math.ceil(totalDays / 7)
    const gridSize = weeksCount * 7

    return Array.from({ length: gridSize }, (_, index) => {
      const day = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index
      )
      return {
        date: day,
        key: toDateKey(day),
        inCurrentMonth: day.getMonth() === month,
      }
    })
  }, [monthCursor])

  const { data: eventsPayload } = useEventsQuery({
    scope: eventsScope,
    initialMeta: eventsPaging ?? {},
  })
  const events = useMemo(
    () => (Array.isArray(eventsPayload?.data) ? eventsPayload.data : []),
    [eventsPayload?.data]
  )
  const loadMorePastEventsMutation = useLoadMorePastEventsMutation()
  const { data: transactions = [] } = useTransactionsQuery(undefined, {
    enabled: false,
  })
  // const siteSettings = useAtomValue(siteSettingsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const modals = useAtomValue(modalsAtom)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const device = useAtomValue(windowDimensionsTailwindSelector)
  const isPhone = device === 'phoneV' || device === 'phoneH'
  const listRef = useListRef()
  const openHandledRef = useRef(false)
  const upcomingOverviewActionHandledRef = useRef(false)
  const [selectedTown, setSelectedTown] = useState(
    () => createEventListFiltersState(filter).selectedTown
  )
  const [pendingOpenId, setPendingOpenId] = useState(null)
  const [checkFilter, setCheckFilter] = useState(
    () => createEventListFiltersState(filter).checkFilter
  )
  const [statusFilter, setStatusFilter] = useState(
    () => createEventListFiltersState(filter).statusFilter
  )
  const [transferredMode, setTransferredMode] = useState(
    () => createEventListFiltersState(filter).transferredMode
  )
  const [additionalQuickFilter, setAdditionalQuickFilter] = useState('')
  const [pastHasMore, setPastHasMore] = useState(false)
  const [pastNextBefore, setPastNextBefore] = useState(null)
  const [pastLoadingMore, setPastLoadingMore] = useState(false)
  const [serverFilteredCount, setServerFilteredCount] = useState(null)
  const skipEventFiltersPersistRef = useRef(true)
  const statusFilterKeys = useMemo(() => getStatusFilterKeys(filter), [filter])
  const itemHeight = isCompact ? 194 : 206

  useEffect(() => {
    if (filter !== 'past') {
      setPastHasMore(false)
      setPastNextBefore(null)
      setPastLoadingMore(false)
      setServerFilteredCount(null)
      return
    }
    setPastHasMore(Boolean(eventsPaging?.hasMore))
    setPastNextBefore(eventsPaging?.nextBefore || null)
  }, [eventsPaging?.hasMore, eventsPaging?.nextBefore, filter])

  const baseEvents = useMemo(() => {
    if (filter === 'all') return events

    const nowTime = Date.now()

    return events.filter((event) => {
      const completionTime = getEventCompletionTime(event)
      if (completionTime === null) return filter === 'upcoming'
      return filter === 'upcoming'
        ? completionTime >= nowTime
        : completionTime < nowTime
    })
  }, [events, filter])

  const townsOptions = useMemo(() => {
    const townsSet = new Set()
    baseEvents.forEach((event) => {
      const town = event?.address?.town
      if (typeof town === 'string' && town.trim()) townsSet.add(town.trim())
    })
    return Array.from(townsSet).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [baseEvents])

  const filteredEvents = useMemo(() => {
    if (!selectedTown) return baseEvents
    return baseEvents.filter(
      (event) => (event?.address?.town ?? '') === selectedTown
    )
  }, [selectedTown, baseEvents])

  const hasUncheckedEvents = useMemo(
    () => filteredEvents.some((event) => !isEventImportChecked(event)),
    [filteredEvents]
  )

  useEffect(() => {
    if (!selectedTown) return
    if (townsOptions.includes(selectedTown)) return
    setSelectedTown('')
  }, [selectedTown, townsOptions])

  useEffect(() => {
    if (modals.length === 0) {
      openHandledRef.current = false
    }
  }, [modals.length])

  useEffect(() => {
    const nextFilters =
      typeof window === 'undefined'
        ? createEventListFiltersState(filter)
        : readEventListFiltersState(filter, window.localStorage)

    skipEventFiltersPersistRef.current = true
    setSelectedTown(nextFilters.selectedTown)
    setCheckFilter(nextFilters.checkFilter)
    setStatusFilter(nextFilters.statusFilter)
    setTransferredMode(nextFilters.transferredMode)
    setAdditionalQuickFilter('')
  }, [filter])

  useEffect(() => {
    if (filter !== 'past') return

    const finishedParam = parseBooleanSearchParam(
      searchParams?.get('statusFinished')
    )
    const closedParam = parseBooleanSearchParam(
      searchParams?.get('statusClosed')
    )
    const canceledParam = parseBooleanSearchParam(
      searchParams?.get('statusCanceled')
    )
    const transferredParam = parseBooleanSearchParam(
      searchParams?.get('statusTransferred')
    )

    if (
      finishedParam === null &&
      closedParam === null &&
      transferredParam === null &&
      canceledParam === null
    ) {
      return
    }

    setStatusFilter({
      finished:
        finishedParam === null
          ? getStatusFilterDefaults('past').finished
          : finishedParam,
      closed:
        closedParam === null
          ? getStatusFilterDefaults('past').closed
          : closedParam,
      canceled:
        canceledParam === null
          ? getStatusFilterDefaults('past').canceled
          : canceledParam,
    })
    const hasSelectedStatus = [finishedParam, closedParam, canceledParam].some(
      (value) => value === true
    )
    if (transferredParam !== null) {
      setTransferredMode(
        transferredParam ? (hasSelectedStatus ? 'all' : 'only') : 'exclude'
      )
    }
  }, [filter, searchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (skipEventFiltersPersistRef.current) {
      skipEventFiltersPersistRef.current = false
      return
    }

    writeEventListFiltersState(filter, window.localStorage, {
      selectedTown,
      checkFilter,
      statusFilter,
      transferredMode,
    })
  }, [checkFilter, filter, selectedTown, statusFilter, transferredMode])

  const filteredByCheck = useMemo(() => {
    if (checkFilter.checked && checkFilter.unchecked) return filteredEvents
    if (checkFilter.checked)
      return filteredEvents.filter((event) => isEventImportChecked(event))
    if (checkFilter.unchecked)
      return filteredEvents.filter((event) => !isEventImportChecked(event))
    return filteredEvents
  }, [checkFilter, filteredEvents])

  const filteredByStatus = useMemo(() => {
    const allSelected = statusFilterKeys.every((key) =>
      Boolean(statusFilter[key])
    )
    const now = new Date()
    return filteredByCheck.filter((event) => {
      const flags = getEventStatusFlags(event, now)
      if (transferredMode === 'only' && !flags.transferred) return false
      if (transferredMode === 'exclude' && flags.transferred) return false
      if (allSelected) return true
      return statusFilterKeys.some(
        (key) => Boolean(statusFilter[key]) && Boolean(flags[key])
      )
    })
  }, [filteredByCheck, statusFilter, statusFilterKeys, transferredMode])

  const additionalSummary = useMemo(
    () => getAdditionalEventsSummary(filteredByStatus),
    [filteredByStatus]
  )
  const filteredByAdditionalQuick = useMemo(() => {
    if (!additionalQuickFilter) return filteredByStatus
    const now = new Date()
    return filteredByStatus.filter((event) =>
      eventHasAdditionalSegment(event, additionalQuickFilter, now)
    )
  }, [additionalQuickFilter, filteredByStatus])

  const sortedEvents = useMemo(() => {
    if (filter === 'upcoming') {
      return [...filteredByAdditionalQuick].sort((a, b) => {
        const aEventDate = getValidDateTime(a?.eventDate)
        const bEventDate = getValidDateTime(b?.eventDate)
        const aNoDate = aEventDate === null
        const bNoDate = bEventDate === null
        const aApiNoDate = aNoDate && isEventCreatedViaPublicApi(a)
        const bApiNoDate = bNoDate && isEventCreatedViaPublicApi(b)

        if (aApiNoDate !== bApiNoDate) return aApiNoDate ? -1 : 1
        if (aNoDate !== bNoDate) return aNoDate ? 1 : -1

        if (!aNoDate && !bNoDate && aEventDate !== bEventDate) {
          return aEventDate - bEventDate
        }

        const aRequestCreatedAt = getValidDateTime(a?.requestCreatedAt) ?? 0
        const bRequestCreatedAt = getValidDateTime(b?.requestCreatedAt) ?? 0
        return bRequestCreatedAt - aRequestCreatedAt
      })
    }

    const sorter = (a, b) => {
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0
      return dateB - dateA
    }
    return [...filteredByAdditionalQuick].sort(sorter)
  }, [filteredByAdditionalQuick, filter])

  useEffect(() => {
    const urlTargetId = searchParams?.get('openEvent')
    const urlTab = searchParams?.get('openTab') || null
    const urlAction = searchParams?.get('openAction') || null
    const urlDate = searchParams?.get('openDate') || null

    if (!urlTargetId && !pendingOpenId && typeof window !== 'undefined') {
      const storedId = window.sessionStorage.getItem('openEvent')
      if (storedId) {
        const storedAt = Number(
          window.sessionStorage.getItem('openEventAt') || 0
        )
        if (!storedAt || Date.now() - storedAt < 2 * 60 * 1000) {
          setPendingOpenId(storedId)
        }
        window.sessionStorage.removeItem('openEvent')
        window.sessionStorage.removeItem('openEventAt')
        window.sessionStorage.removeItem('openEventPage')
      }
    }

    const targetId = urlTargetId || pendingOpenId
    if (!targetId) return
    let isActive = true
    let attempts = 0

    const scheduleRetry = () => {
      if (!isActive) return
      if (attempts >= 10) return
      attempts += 1
      setTimeout(tryOpen, 250)
    }

    const tryOpen = () => {
      if (!isActive) return
      if (openHandledRef.current) return
      if (!modalsFunc.event?.view) return scheduleRetry()
      if (!events || events.length === 0) return scheduleRetry()

      const indexInAll = events.findIndex(
        (item) => String(item?._id) === String(targetId)
      )
      if (indexInAll === -1) return scheduleRetry()

      const event = events[indexInAll]
      const completionTime = getEventCompletionTime(event)
      const nowTime = Date.now()
      const shouldBeUpcoming =
        completionTime === null || completionTime >= nowTime
      const expectedPage = shouldBeUpcoming ? 'eventsUpcoming' : 'eventsPast'

      if (
        filter !== 'all' &&
        expectedPage !==
          (filter === 'upcoming' ? 'eventsUpcoming' : 'eventsPast')
      ) {
        // Store deep link params for cross-page navigation
        const params = new URLSearchParams()
        params.set('openEvent', targetId)
        if (urlTab) params.set('openTab', urlTab)
        if (urlAction) params.set('openAction', urlAction)
        if (urlDate) params.set('openDate', urlDate)
        router.replace(`/cabinet/${expectedPage}?${params.toString()}`)
        return
      }

      const eventTown = event?.address?.town ?? ''
      if (selectedTown && eventTown !== selectedTown) {
        setSelectedTown(eventTown)
        return
      }

      if (!checkFilter.checked || !checkFilter.unchecked) {
        const isChecked = isEventImportChecked(event)
        const isVisible =
          (isChecked && checkFilter.checked) ||
          (!isChecked && checkFilter.unchecked)
        if (!isVisible) {
          setCheckFilter({ checked: true, unchecked: true })
          return
        }
      }

      const allStatusSelected = statusFilterKeys.every((key) =>
        Boolean(statusFilter[key])
      )
      const flags = getEventStatusFlags(event, new Date())
      if (transferredMode === 'only' && !flags.transferred) {
        setTransferredMode('all')
        return
      }
      if (transferredMode === 'exclude' && flags.transferred) {
        setTransferredMode('all')
        return
      }
      if (!allStatusSelected) {
        const isVisible = statusFilterKeys.some(
          (key) => Boolean(statusFilter[key]) && Boolean(flags[key])
        )
        if (!isVisible) {
          setStatusFilter(getStatusFilterDefaults(filter))
          return
        }
      }

      const index = sortedEvents.findIndex(
        (item) => String(item?._id) === String(targetId)
      )
      if (index === -1) return scheduleRetry()

      let scrollAttempts = 0
      const tryScroll = () => {
        if (!isActive) return
        if (listRef.current?.scrollToRow) {
          listRef.current.scrollToRow({ index, align: 'center' })
        } else if (scrollAttempts < 6) {
          scrollAttempts += 1
          setTimeout(tryScroll, 100)
        }
      }
      tryScroll()

      setTimeout(() => {
        if (!isActive) return
        const viewOptions = {}
        if (urlTab) viewOptions.tab = urlTab
        if (urlAction) viewOptions.action = urlAction
        if (urlDate) viewOptions.date = urlDate
        modalsFunc.event?.view(
          targetId,
          Object.keys(viewOptions).length > 0 ? viewOptions : undefined
        )
        openHandledRef.current = true
        if (pendingOpenId) setPendingOpenId(null)
        if (pathname) router.replace(pathname, { scroll: false })
      }, 200)
    }

    tryOpen()
    return () => {
      isActive = false
    }
  }, [
    checkFilter.checked,
    checkFilter.unchecked,
    events,
    filter,
    modalsFunc.event,
    pathname,
    listRef,
    router,
    searchParams,
    selectedTown,
    sortedEvents,
    pendingOpenId,
    statusFilter,
    statusFilterKeys,
    transferredMode,
  ])

  // Handle openAction=upcomingOverview from push notification click
  useEffect(() => {
    if (typeof window === 'undefined') return
    const action = searchParams?.get('openAction')
    if (action !== 'upcomingOverview') return
    if (upcomingOverviewActionHandledRef.current) return
    if (modals.length > 0) return

    upcomingOverviewActionHandledRef.current = true
    if (pathname) {
      window.history.replaceState(window.history.state, '', pathname)
      router.replace(pathname, { scroll: false })
    }

    const timer = setTimeout(() => {
      modalsFunc.event?.upcomingOverview?.()
    }, 300)

    return () => clearTimeout(timer)
  }, [searchParams, modals.length, modalsFunc, pathname, router])

  // Автоматические всплывающие напоминания при входе убраны (UX-03):
  // вместо них работают бейджи и кнопка «Требует внимания».

  const filterName =
    filter === 'upcoming'
      ? 'Предстоящие'
      : filter === 'past'
        ? 'Прошедшие'
        : 'Все'

  useEffect(() => {
    if (filter !== 'past') return

    if (!pastHasMore) {
      setServerFilteredCount(sortedEvents.length)
      return
    }

    let isActive = true
    const search = new URLSearchParams({
      scope: 'past',
      countOnly: '1',
      statusFinished: String(Boolean(statusFilter.finished)),
      statusClosed: String(Boolean(statusFilter.closed)),
      statusCanceled: String(Boolean(statusFilter.canceled)),
      transferredMode,
    })

    if (selectedTown) search.set('town', selectedTown)
    if (additionalQuickFilter)
      search.set('additionalQuick', additionalQuickFilter)
    if (checkFilter.checked !== checkFilter.unchecked) {
      search.set('calendarChecked', String(Boolean(checkFilter.checked)))
    }

    ;(async () => {
      try {
        const response = await getData(
          `/api/events?${search.toString()}`,
          null,
          null,
          null,
          true
        )
        const totalCount = Number(response?.meta?.totalCount)
        if (!isActive) return
        setServerFilteredCount(
          Number.isFinite(totalCount) ? totalCount : sortedEvents.length
        )
      } catch (error) {
        if (!isActive) return
        setServerFilteredCount(sortedEvents.length)
      }
    })()

    return () => {
      isActive = false
    }
  }, [
    additionalQuickFilter,
    checkFilter.checked,
    checkFilter.unchecked,
    filter,
    pastHasMore,
    selectedTown,
    sortedEvents.length,
    statusFilter.canceled,
    statusFilter.closed,
    statusFilter.finished,
    transferredMode,
  ])

  const displayedCount =
    filter === 'past'
      ? (serverFilteredCount ?? sortedEvents.length)
      : sortedEvents.length

  useEffect(() => {
    onHeaderCountChange?.(displayedCount)
  }, [displayedCount, onHeaderCountChange])

  const currentMonthStart = useMemo(() => toMonthStart(new Date()), [])
  const isUpcomingMinMonth =
    filter === 'upcoming' &&
    monthCursor.getTime() <= currentMonthStart.getTime()

  const isStatusFilterDefault = useMemo(() => {
    const defaults = getStatusFilterDefaults(filter)
    return statusFilterKeys.every(
      (key) => Boolean(statusFilter[key]) === Boolean(defaults[key])
    )
  }, [filter, statusFilter, statusFilterKeys])

  const isCheckFilterDefault = checkFilter.checked && checkFilter.unchecked
  const hasActiveFilters = [
    selectedTown,
    filter !== 'all' && !isStatusFilterDefault,
    hasUncheckedEvents && !isCheckFilterDefault,
    additionalQuickFilter,
    transferredMode !== 'all',
  ].some(Boolean)

  const resetFilters = useCallback(() => {
    setSelectedTown('')
    setCheckFilter({ checked: true, unchecked: true })
    setStatusFilter(getStatusFilterDefaults(filter))
    setTransferredMode('all')
    setAdditionalQuickFilter('')
  }, [filter])

  const setPastQuickFilter = useCallback(
    (preset) => {
      const isActivePreset =
        preset.transferredMode === transferredMode &&
        Object.entries(preset.statusFilter).every(
          ([key, value]) => Boolean(statusFilter[key]) === value
        )

      setStatusFilter(
        isActivePreset ? getStatusFilterDefaults('past') : preset.statusFilter
      )
      setTransferredMode(isActivePreset ? 'all' : preset.transferredMode)
      setAdditionalQuickFilter('')
    },
    [statusFilter, transferredMode]
  )

  const activePastQuickFilter = useMemo(() => {
    if (filter !== 'past') return ''
    const active = PAST_QUICK_FILTERS.find(
      (item) =>
        item.transferredMode === transferredMode &&
        Object.entries(item.statusFilter).every(
          ([key, value]) => Boolean(statusFilter[key]) === value
        )
    )
    return active?.key ?? ''
  }, [filter, statusFilter, transferredMode])

  const toggleAdditionalQuickFilter = (value) => {
    setAdditionalQuickFilter((prev) => (prev === value ? '' : value))
  }

  const handleLoadMorePast = useCallback(async () => {
    if (pastLoadingMore || !pastHasMore) return
    setPastLoadingMore(true)
    try {
      const response = await loadMorePastEventsMutation.mutateAsync({
        before: pastNextBefore,
        limit: 120,
      })
      const loadedItems = Array.isArray(response?.data) ? response.data : []
      const nextMeta = response?.meta ?? {}

      setPastHasMore(Boolean(nextMeta?.hasMore))
      setPastNextBefore(nextMeta?.nextBefore || null)
    } finally {
      setPastLoadingMore(false)
    }
  }, [loadMorePastEventsMutation, pastHasMore, pastLoadingMore, pastNextBefore])

  const monthTitle = useMemo(
    () =>
      monthCursor.toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      }),
    [monthCursor]
  )

  const monthItemsByDay = useMemo(() => {
    const map = new Map()
    sortedEvents.forEach((event) => {
      const pushByDate = (dateValue, payload) => {
        const dayKey = toDateKey(dateValue)
        if (!dayKey) return
        if (!map.has(dayKey)) map.set(dayKey, [])
        map.get(dayKey).push(payload)
      }

      pushByDate(event?.eventDate, {
        type: 'event',
        eventId: event?._id,
        event,
        title: event?.eventType || 'Мероприятие',
        description: event?.description || '',
        date: event?.eventDate ?? null,
        status: event?.status || 'active',
        time: toMinuteOfDay(event?.eventDate),
      })
      ;(Array.isArray(event?.additionalEvents)
        ? event.additionalEvents
        : []
      ).forEach((item, index) => {
        pushByDate(item?.date, {
          type: 'additional',
          eventId: event?._id,
          title: item?.title || `Задача #${index + 1}`,
          description: item?.description || '',
          date: item?.date ?? null,
          index,
          status: item?.done ? 'done' : 'active',
          done: Boolean(item?.done),
          time: toMinuteOfDay(item?.date),
        })
      })
    })

    map.forEach((items, key) => {
      map.set(
        key,
        [...items].sort((a, b) => {
          if (a.time !== b.time) return a.time - b.time
          if (a.type === b.type) return 0
          return a.type === 'event' ? -1 : 1
        })
      )
    })
    return map
  }, [sortedEvents])

  const monthMeta = useMemo(() => {
    const meta = { events: 0, additional: 0 }
    monthGridDays.forEach((day) => {
      if (!day.inCurrentMonth) return
      const dayItems = monthItemsByDay.get(day.key) || []
      dayItems.forEach((item) => {
        if (item.type === 'event') meta.events += 1
        else meta.additional += 1
      })
    })
    return meta
  }, [monthGridDays, monthItemsByDay])

  useEffect(() => {
    if (viewMode !== 'month') {
      monthAutoPositionedRef.current = false
      return
    }
    // Для upcoming не даём уйти раньше текущего месяца
    if (
      filter === 'upcoming' &&
      monthCursor.getTime() < currentMonthStart.getTime()
    ) {
      setMonthCursor(currentMonthStart)
      return
    }
    // Если данные еще не загрузились — ждём (не фиксируем флаг)
    if (sortedEvents.length === 0) return
    if (monthAutoPositionedRef.current) return

    // Проверяем, есть ли события в текущем видимом месяце
    const hasItemsInCurrentMonth = monthGridDays.some((day) => {
      if (!day.inCurrentMonth) return false
      const items = monthItemsByDay.get(day.key)
      return Array.isArray(items) && items.length > 0
    })
    if (hasItemsInCurrentMonth) {
      monthAutoPositionedRef.current = true
      return
    }

    // В текущем месяце нет событий — переходим на первый месяц, где есть
    const firstDate = sortedEvents[0]?.eventDate
    const parsed = firstDate ? new Date(firstDate) : null
    if (!parsed || Number.isNaN(parsed.getTime())) {
      monthAutoPositionedRef.current = true
      return
    }
    setMonthCursor(toMonthStart(parsed))
    monthAutoPositionedRef.current = true
  }, [
    currentMonthStart,
    filter,
    monthCursor,
    monthGridDays,
    monthItemsByDay,
    sortedEvents,
    viewMode,
  ])

  // Авто-подгрузка прошедших мероприятий при навигации по месяцам в календаре
  useEffect(() => {
    if (viewMode !== 'month' || filter !== 'past') return
    if (!pastHasMore || pastLoadingMore) return

    const hasItemsInCurrentMonth = monthGridDays.some((day) => {
      if (!day.inCurrentMonth) return false
      const items = monthItemsByDay.get(day.key)
      return Array.isArray(items) && items.length > 0
    })

    if (!hasItemsInCurrentMonth) {
      handleLoadMorePast()
    }
  }, [
    monthCursor,
    monthGridDays,
    monthItemsByDay,
    pastHasMore,
    pastLoadingMore,
    viewMode,
    filter,
    handleLoadMorePast,
  ])

  const openDayEventsModal = useCallback(
    (day) => {
      const dayItems = monthItemsByDay.get(day?.key) || []
      if (dayItems.length === 0) return

      const dayEvents = dayItems
        .filter((item) => item.type === 'event')
        .map((item) => ({
          ...item,
          eventId: String(item.eventId ?? ''),
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : 'Мероприятие',
        }))
        .filter((item) => item.eventId)
      const dayAdditionalEvents = dayItems.filter(
        (item) => item.type === 'additional'
      )

      const dayTitle = day?.date
        ? day.date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : 'Выбранный день'

      modalsFunc.add({
        title: `План на день: ${dayTitle}`,
        confirmButtonName: 'Закрыть',
        onConfirm: true,
        showDecline: false,
        Children: DayEventsModal,
        childrenProps: {
          eventItems: dayEvents,
          additionalItems: dayAdditionalEvents,
          openEvent: modalsFunc.event?.view,
        },
      })
    },
    [modalsFunc, monthItemsByDay]
  )

  useEffect(() => {
    if (!additionalQuickFilter) return
    if ((additionalSummary?.[additionalQuickFilter] ?? 0) > 0) return
    setAdditionalQuickFilter('')
  }, [additionalQuickFilter, additionalSummary])

  const RowComponent = useCallback(
    ({ index, style }) => {
      const contentRowCount =
        sortedEvents.length + (filter === 'past' && pastHasMore ? 1 : 0)
      if (index >= contentRowCount) {
        // Пустая строка-спейсер: FAB не перекрывает действия последней карточки
        return <div style={style} aria-hidden="true" />
      }
      if (filter === 'past' && index >= sortedEvents.length) {
        return (
          <div
            style={{ ...style, padding: '6px 8px' }}
            className="flex items-center justify-center"
          >
            <AppButton
              variant="secondary"
              size="sm"
              className="rounded-md px-4"
              disabled={pastLoadingMore}
              onClick={handleLoadMorePast}
            >
              {pastLoadingMore ? 'Загрузка...' : 'Загрузить еще прошедшие'}
            </AppButton>
          </div>
        )
      }
      const event = sortedEvents[index]

      return (
        <EventCard
          eventId={event._id}
          event={event}
          style={{ ...style, padding: '6px 8px' }}
          transactions={transactions}
        />
      )
    },
    [
      filter,
      pastLoadingMore,
      pastHasMore,
      sortedEvents,
      handleLoadMorePast,
      transactions,
    ]
  )

  const listContentRowCount =
    sortedEvents.length + (filter === 'past' && pastHasMore ? 1 : 0)

  const getEventRowHeight = useCallback(
    // Последняя строка — спейсер под плавающую кнопку создания
    // (на телефоне FAB скрыт, а нижняя навигация в потоке — хватает 16px)
    (index) => (index >= listContentRowCount ? (isPhone ? 16 : 96) : itemHeight),
    [listContentRowCount, itemHeight, isPhone]
  )

  const {
    items: fabItems,
    draftModals,
    createRequest: handleCreateRequest,
  } = useEventCreateMenu()

  return (
    <div className="tablet:gap-3 flex h-full flex-col gap-x-2">
      {draftModals}
      <CreateEventFab items={fabItems} />
      <ContentHeader>
        <div className="flex w-full min-w-0 items-center gap-2">
          <DropDown
            renderInPortal
            turnOffAutoClose="inside"
            placement="right"
            menuPadding={false}
            menuClassName="filter-menu w-[min(340px,calc(100vw-24px))] flex-col items-stretch p-3"
            className="min-w-0"
            trigger={
              <button
                type="button"
                className={`filter-control ${
                  hasActiveFilters
                    ? 'filter-control--primary'
                    : 'filter-control--outline'
                } min-w-[118px] gap-1 px-3 text-xs`}
                aria-label={
                  hasActiveFilters
                    ? `Фильтры ${workItemTerms.pluralGenitive}, есть активные фильтры`
                    : `Фильтры ${workItemTerms.pluralGenitive}`
                }
              >
                <FilterAltIcon fontSize="small" />
                <span className="truncate">Фильтры</span>
              </button>
            }
          >
            <div className="flex w-full flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-semibold text-gray-800">
                  Фильтры
                </div>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    className="text-general cursor-pointer text-xs font-semibold hover:underline"
                    onClick={resetFilters}
                  >
                    Сбросить
                  </button>
                ) : null}
              </div>
              <ComboBox
                label="Город"
                items={townsOptions}
                value={selectedTown}
                onChange={(value) => setSelectedTown(value ?? '')}
                placeholder="Все города"
                activePlaceholder
                fullWidth
                noMargin
                className="mt-1"
              />
              {filter !== 'all' ? (
                <div className="flex flex-col gap-2">
                  {hasUncheckedEvents ? (
                    <EventCheckFilterChips
                      value={checkFilter}
                      onChange={setCheckFilter}
                    />
                  ) : null}
                  <EventStatusFilterChips
                    value={statusFilter}
                    onChange={setStatusFilter}
                    mode={filter}
                    activeLabel={workItemTerms.pluralCapitalized}
                  />
                  <EventTransferredFilterChip
                    value={transferredMode === 'only'}
                    onChange={(active) =>
                      setTransferredMode(active ? 'only' : 'all')
                    }
                  />
                </div>
              ) : null}
            </div>
          </DropDown>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <AppButton
              variant="secondary"
              size="sm"
              className="flex h-9 w-9 items-center justify-center rounded-md p-0"
              onClick={() =>
                setViewMode((prev) => (prev === 'list' ? 'month' : 'list'))
              }
              title={
                viewMode === 'list' ? 'Показать календарь' : 'Показать список'
              }
              aria-label={
                viewMode === 'list' ? 'Показать календарь' : 'Показать список'
              }
            >
              {viewMode === 'list' ? (
                <CalendarMonthIcon fontSize="small" />
              ) : (
                <ViewListIcon fontSize="small" />
              )}
            </AppButton>
          </div>
        </div>
      </ContentHeader>
      {filter === 'past' ? (
        <ContentHeader>
          <SectionCard className="event-quick-filters bg-white/95 p-2 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <div className="tablet:w-auto tablet:flex-1 tablet:justify-end flex w-full items-center justify-start">
                <div className="phoneH:flex-row tablet:w-auto flex w-full flex-row gap-x-2">
                  {filter === 'past'
                    ? PAST_QUICK_FILTERS.map((item) => (
                        <AppButton
                          key={item.key}
                          variant={
                            activePastQuickFilter === item.key
                              ? 'primary'
                              : 'secondary'
                          }
                          size="sm"
                          className={`event-quick-filter-chip phoneH:w-auto tablet:flex-none tablet:px-3 tablet:text-sm min-w-0 flex-auto rounded-md px-2 text-xs font-semibold whitespace-normal ${
                            activePastQuickFilter === item.key
                              ? 'event-quick-filter-chip--active'
                              : ''
                          }`}
                          onClick={() => setPastQuickFilter(item)}
                          aria-pressed={activePastQuickFilter === item.key}
                        >
                          {item.label}
                        </AppButton>
                      ))
                    : null}
                </div>
              </div>
            </div>
          </SectionCard>
        </ContentHeader>
      ) : null}
      <SectionCard className="min-h-0 flex-1 overflow-hidden border-0 bg-transparent shadow-none">
        {viewMode === 'list' ? (
          sortedEvents.length > 0 ? (
            <List
              listRef={listRef}
              rowCount={listContentRowCount + 1}
              rowHeight={getEventRowHeight}
              rowComponent={RowComponent}
              rowProps={{}}
              style={{ height: '100%', width: '100%' }}
            />
          ) : baseEvents.length === 0 && !hasActiveFilters ? (
            <EmptyState
              icon={<NoteAddIcon />}
              title={
                filter === 'past'
                  ? `Прошедших ${workItemTerms.pluralGenitive} пока нет`
                  : 'Пока нет ни одной заявки'
              }
              hint={
                filter === 'past'
                  ? `Завершённые и закрытые ${workItemTerms.plural} появятся здесь автоматически.`
                  : 'Создайте первую заявку — вручную, голосом или свободным текстом. Дальше Ведело напомнит о следующем контакте и задатке.'
              }
              actionLabel={filter === 'past' ? null : 'Создать заявку'}
              onAction={filter === 'past' ? null : handleCreateRequest}
            />
          ) : (
            <EmptyState
              icon={<FilterAltIcon />}
              title="По выбранным фильтрам ничего не найдено"
              hint="Попробуйте изменить условия или сбросить все фильтры."
              actionLabel="Сбросить фильтры"
              onAction={resetFilters}
            />
          )
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            <SectionCard className="border border-gray-200 bg-white/95 p-3 shadow-sm">
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center gap-2">
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="flex h-9 w-9 items-center justify-center rounded-md p-0"
                    disabled={isUpcomingMinMonth}
                    onClick={() =>
                      setMonthCursor((prev) =>
                        filter === 'upcoming' &&
                        prev.getTime() <= currentMonthStart.getTime()
                          ? currentMonthStart
                          : toMonthStart(
                              new Date(
                                prev.getFullYear(),
                                prev.getMonth() - 1,
                                1
                              )
                            )
                      )
                    }
                    title="Предыдущий месяц"
                    aria-label="Предыдущий месяц"
                  >
                    <ChevronLeftIcon fontSize="small" />
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="rounded-md px-3"
                    onClick={() => setMonthCursor(toMonthStart(new Date()))}
                  >
                    Сегодня
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="flex h-9 w-9 items-center justify-center rounded-md p-0"
                    onClick={() =>
                      setMonthCursor((prev) =>
                        toMonthStart(
                          new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                        )
                      )
                    }
                    title="Следующий месяц"
                    aria-label="Следующий месяц"
                  >
                    <ChevronRightIcon fontSize="small" />
                  </AppButton>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
                  <div className="text-sm font-semibold text-gray-800 capitalize">
                    {monthTitle}
                  </div>
                  <MutedText className="text-xs">
                    {workItemTerms.pluralCapitalized}: {monthMeta.events} | Задач:{' '}
                    {monthMeta.additional}
                  </MutedText>
                </div>
              </div>
            </SectionCard>
            <div className="event-month-calendar min-h-0 flex-1 overflow-auto rounded-lg border bg-white pb-24">
              <div className="event-month-calendar__weekdays sticky top-0 z-10 grid grid-cols-7 border-b shadow-sm backdrop-blur">
                {DAYS_OF_WEEK_MONDAY_START.map((dayName) => (
                  <div
                    key={dayName}
                    className="px-1.5 py-1.5 text-center text-[11px] font-semibold"
                  >
                    {dayName}
                  </div>
                ))}
              </div>
              <div className="grid auto-rows-auto grid-cols-7">
                {monthGridDays.map((day) => {
                  const dayItems = monthItemsByDay.get(day.key) || []
                  const hasDayContent = dayItems.length > 0
                  const visibleDayItems = dayItems.slice(0, 2)
                  const extraCount = dayItems.length - visibleDayItems.length
                  const today = new Date()
                  const todayStart = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate()
                  ).getTime()
                  const dayStart = new Date(
                    day.date.getFullYear(),
                    day.date.getMonth(),
                    day.date.getDate()
                  ).getTime()
                  const isToday = dayStart === todayStart
                  const isPastDay = dayStart < todayStart
                  return (
                    <div
                      key={day.key}
                      className={`event-month-calendar__day min-h-[62px] border-r border-b p-1 ${
                        day.inCurrentMonth
                          ? isPastDay
                            ? 'event-month-calendar__day--past'
                            : isToday
                              ? 'event-month-calendar__day--today'
                              : 'event-month-calendar__day--current'
                          : 'event-month-calendar__day--outside'
                      } ${hasDayContent ? 'event-month-calendar__day--interactive cursor-pointer' : ''}`}
                      onClick={() => openDayEventsModal(day)}
                    >
                      <div
                        className={`event-month-calendar__day-number mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-semibold ${
                          isToday
                            ? 'event-month-calendar__day-number--today'
                            : day.inCurrentMonth
                              ? isPastDay
                                ? 'event-month-calendar__day-number--past'
                                : 'event-month-calendar__day-number--current'
                              : 'event-month-calendar__day-number--outside'
                        }`}
                      >
                        {day.date.getDate()}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {visibleDayItems.map((item, index) => (
                          <button
                            key={`${day.key}-${item.type}-${item.eventId}-${index}`}
                            type="button"
                            className={`flex w-full cursor-pointer items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[10px] leading-tight ${getMonthItemToneClassName(item)}`}
                            title={item.title}
                            onClick={(event) => {
                              event.stopPropagation()
                              modalsFunc.event?.view?.(item.eventId)
                            }}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                item.type === 'event'
                                  ? 'bg-current'
                                  : 'border border-current'
                              }`}
                            />
                            <span className="min-w-0 truncate">
                              {item.title}
                            </span>
                          </button>
                        ))}
                        {extraCount > 0 ? (
                          <div className="px-1 text-[10px] leading-tight text-gray-500">
                            +{extraCount} еще
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default EventsContent
