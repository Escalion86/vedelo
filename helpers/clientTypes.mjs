export const DEFAULT_CLIENT_TYPES = Object.freeze([
  { value: 'none', name: 'Без типа', hidden: false },
  { value: 'client', name: 'Клиент', hidden: false },
  { value: 'partner', name: 'Партнёр', hidden: false },
  { value: 'colleague', name: 'Коллега', hidden: false },
])
export const LEGACY_CLIENT_TYPES = Object.freeze([
  ...DEFAULT_CLIENT_TYPES,
  { value: 'host', name: 'Ведущий', hidden: false },
  { value: 'organizer', name: 'Организатор', hidden: false },
])

export const resolveClientTypes = (settings) =>
  Array.isArray(settings?.clientTypes) ? settings.clientTypes : LEGACY_CLIENT_TYPES

export const clientTypeOptions = (items, selected = 'none') => {
  const options = items.filter((item) => !item.hidden || item.value === selected)
    .map((item) => ({ ...item, name: item.hidden ? `${item.name} (скрыт)` : item.name }))
  if (selected && !options.some((item) => item.value === selected)) {
    const known = LEGACY_CLIENT_TYPES.find((item) => item.value === selected)
    options.push({ value: selected, name: known?.name || `Сохранённый тип: ${selected}`, hidden: true })
  }
  return options
}

export const validateClientTypes = (input, previous) => {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100)
    throw new Error('Допустимо от 1 до 100 типов клиентов')
  const ids = new Set()
  const names = new Set()
  const known = new Set(LEGACY_CLIENT_TYPES.map((item) => item.value))
  const items = input.map((item) => {
    if (!item || typeof item.value !== 'string' ||
      (!known.has(item.value) && !/^custom_[a-zA-Z0-9-]{8,64}$/.test(item.value)))
      throw new Error('Некорректный идентификатор типа клиента')
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    if (!name || name.length > 60 || /[\u0000-\u001f]/.test(name))
      throw new Error('Название типа должно содержать от 1 до 60 символов')
    if (ids.has(item.value) || names.has(name.toLocaleLowerCase('ru')))
      throw new Error('Названия типов не должны повторяться')
    if (typeof item.hidden !== 'boolean') throw new Error('Укажите видимость типа')
    if (item.value === 'none' && item.hidden) throw new Error('Вариант «Без типа» нельзя скрыть')
    ids.add(item.value)
    names.add(name.toLocaleLowerCase('ru'))
    return { value: item.value, name, hidden: item.hidden }
  })
  if (!ids.has('none') || previous.some((item) => !ids.has(item.value)))
    throw new Error('Тип нельзя удалить: скройте его, чтобы сохранить старые карточки')
  return items
}
