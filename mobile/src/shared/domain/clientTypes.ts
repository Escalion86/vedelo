export type ClientType = { value: string; name: string; hidden: boolean }

// Legacy fallback only: authoritative defaults and validation come from the API.
export const legacyClientTypes: ClientType[] = [
  { value: 'none', name: 'Без типа', hidden: false },
  { value: 'client', name: 'Клиент', hidden: false },
  { value: 'partner', name: 'Партнёр', hidden: false },
  { value: 'colleague', name: 'Коллега', hidden: false },
  { value: 'host', name: 'Ведущий', hidden: false },
  { value: 'organizer', name: 'Организатор', hidden: false },
]

export const clientTypeOptions = (items: ClientType[], selected: string) => {
  const options = items.filter(item => !item.hidden || item.value === selected)
    .map(item => ({ ...item, name: item.hidden ? `${item.name} (скрыт)` : item.name }))
  if (selected && !options.some(item => item.value === selected)) {
    options.push({ value: selected, name: legacyClientTypes.find(item => item.value === selected)?.name || `Сохранённый тип: ${selected}`, hidden: true })
  }
  return options
}
