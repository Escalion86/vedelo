const STORAGE_VERSION = 2
const STORAGE_PREFIX = 'artistcrm:event-list-filters'

const defaultCheckFilter = () => ({
  checked: true,
  unchecked: true,
})

export const getStatusFilterDefaults = (filter) => {
  if (filter === 'upcoming') {
    return {
      request: true,
      active: true,
      canceled: false,
    }
  }
  if (filter === 'past') {
    return {
      request: true,
      finished: true,
      closed: true,
      canceled: false,
    }
  }
  return {
    request: true,
    active: true,
    finished: true,
    closed: true,
    canceled: false,
  }
}

export const getStatusFilterKeys = (filter) => {
  if (filter === 'upcoming') return ['request', 'active', 'canceled']
  if (filter === 'past') return ['request', 'finished', 'closed', 'canceled']
  return ['request', 'active', 'finished', 'closed', 'canceled']
}

export const getEventListFiltersStorageKey = (filter) =>
  `${STORAGE_PREFIX}:${filter || 'all'}:v${STORAGE_VERSION}`

const normalizeCheckFilter = (value) => {
  if (!value || typeof value !== 'object') return defaultCheckFilter()
  const next = {
    checked:
      typeof value.checked === 'boolean'
        ? value.checked
        : defaultCheckFilter().checked,
    unchecked:
      typeof value.unchecked === 'boolean'
        ? value.unchecked
        : defaultCheckFilter().unchecked,
  }
  return next.checked || next.unchecked ? next : defaultCheckFilter()
}

export const normalizeStatusFilter = (filter, value) => {
  const defaults = getStatusFilterDefaults(filter)
  const keys = getStatusFilterKeys(filter)
  if (!value || typeof value !== 'object') return defaults

  const next = keys.reduce(
    (result, key) => ({
      ...result,
      [key]: typeof value[key] === 'boolean' ? value[key] : defaults[key],
    }),
    {}
  )

  const hasAnySelected = keys.some((key) => Boolean(next[key]))
  return hasAnySelected ? next : defaults
}

export const createEventListFiltersState = (filter) => ({
  selectedTown: '',
  checkFilter: defaultCheckFilter(),
  statusFilter: getStatusFilterDefaults(filter),
  transferredMode: 'all',
})

const normalizeEventListFiltersState = (filter, value) => {
  const defaults = createEventListFiltersState(filter)
  if (!value || typeof value !== 'object') return defaults

  return {
    selectedTown:
      typeof value.selectedTown === 'string'
        ? value.selectedTown
        : defaults.selectedTown,
    checkFilter: normalizeCheckFilter(value.checkFilter),
    statusFilter: normalizeStatusFilter(filter, value.statusFilter),
    transferredMode: ['all', 'only', 'exclude'].includes(value.transferredMode)
      ? value.transferredMode
      : defaults.transferredMode,
  }
}

export const serializeEventListFiltersState = (filter, state) =>
  JSON.stringify({
    version: STORAGE_VERSION,
    ...normalizeEventListFiltersState(filter, state),
  })

export const readEventListFiltersState = (filter, storage) => {
  if (!storage?.getItem) return createEventListFiltersState(filter)

  try {
    const raw = storage.getItem(getEventListFiltersStorageKey(filter))
    if (!raw) return createEventListFiltersState(filter)
    const parsed = JSON.parse(raw)
    if (parsed?.version !== STORAGE_VERSION) {
      return createEventListFiltersState(filter)
    }
    return normalizeEventListFiltersState(filter, parsed)
  } catch {
    return createEventListFiltersState(filter)
  }
}

export const writeEventListFiltersState = (filter, storage, state) => {
  if (!storage?.setItem) return
  storage.setItem(
    getEventListFiltersStorageKey(filter),
    serializeEventListFiltersState(filter, state)
  )
}
