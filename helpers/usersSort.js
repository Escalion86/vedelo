export const USER_SORT_MODES = {
  NAME: 'name',
  REGISTRATION: 'registration',
  ACTIVITY: 'activity',
  BALANCE: 'balance',
  CREATED_ITEMS: 'createdItems',
}

export const USER_SORT_OPTIONS = [
  { value: USER_SORT_MODES.NAME, label: 'По имени' },
  { value: USER_SORT_MODES.REGISTRATION, label: 'По дате регистрации' },
  { value: USER_SORT_MODES.ACTIVITY, label: 'По последней активности' },
  { value: USER_SORT_MODES.BALANCE, label: 'По балансу' },
  { value: USER_SORT_MODES.CREATED_ITEMS, label: 'По мероприятиям и заявкам' },
]

const getDateTime = (value) => {
  const date = value ? new Date(value) : null
  const time = date?.getTime()
  return Number.isFinite(time) ? time : 0
}

const getNumber = (value) => {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

const compareByName = (a, b) => {
  const lastNameCompare = (a?.secondName || '').localeCompare(
    b?.secondName || '',
    'ru'
  )
  if (lastNameCompare !== 0) return lastNameCompare
  return (a?.firstName || '').localeCompare(b?.firstName || '', 'ru')
}

const compareByCreatedItems = (a, b) => {
  const aCount = getNumber(a?.eventsCount) + getNumber(a?.requestsCount)
  const bCount = getNumber(b?.eventsCount) + getNumber(b?.requestsCount)
  return bCount - aCount || compareByName(a, b)
}

export const sortUsers = (users = [], mode = USER_SORT_MODES.NAME) => {
  const items = Array.isArray(users) ? [...users] : []

  if (mode === USER_SORT_MODES.ACTIVITY) {
    return items.sort(
      (a, b) =>
        getDateTime(b?.lastMutationAt) - getDateTime(a?.lastMutationAt) ||
        compareByName(a, b)
    )
  }

  if (mode === USER_SORT_MODES.REGISTRATION) {
    return items.sort(
      (a, b) =>
        getDateTime(b?.createdAt) - getDateTime(a?.createdAt) ||
        compareByName(a, b)
    )
  }

  if (mode === USER_SORT_MODES.BALANCE) {
    return items.sort(
      (a, b) =>
        getNumber(b?.balance) - getNumber(a?.balance) || compareByName(a, b)
    )
  }

  if (mode === USER_SORT_MODES.CREATED_ITEMS) {
    return items.sort(compareByCreatedItems)
  }

  return items.sort(compareByName)
}
