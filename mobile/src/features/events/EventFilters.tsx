import { useState } from 'react'
import { FilterOverlay, type FilterOption } from '../../shared/ui/FilterOverlay'
import { applyPastPreset, defaultEventFilters, hasEventFilters, statusFilterKeys,
  type EventFiltersState, type EventsListScope, type PastPreset, type StatusFilter } from './filters'

const labels: Record<StatusFilter, string> = {
  request: 'Заявки', active: 'Подтверждено', finished: 'Завершено', closed: 'Закрыто', canceled: 'Отменено',
}
export function EventFilters({ scope, value, towns, onChange }: {
  scope: EventsListScope; value: EventFiltersState; towns: string[]; onChange: (value: EventFiltersState) => void
}) {
  const [visible, setVisible] = useState(false)
  const selected = hasEventFilters(scope, value)
  const options: FilterOption[] = [
    { value: 'reset', label: 'Сбросить фильтры' },
    ...['', ...towns].map((town) => ({ value: `town:${town}`, label: town || 'Все города', selected: value.town === town })),
    ...([['all', 'Любая проверенность'], ['checked', 'Проверено'], ['unchecked', 'Не проверено']] as const)
      .map(([key, label]) => ({ value: `checked:${key}`, label, selected: value.checked === key })),
    ...statusFilterKeys(scope).map((key) => ({ value: `status:${key}`, label: labels[key], selected: value.statuses.includes(key) })),
    ...([['all', 'Любая передача'], ['only', 'Передано коллеге'], ['exclude', 'Без передачи коллеге']] as const)
      .map(([key, label]) => ({ value: `transferred:${key}`, label, selected: value.transferred === key })),
    ...(scope === 'past' ? ([['unclosed', 'Не закрыто'], ['closed', 'Только закрытые'], ['canceled', 'Только отменённые']] as const)
      .map(([key, label]) => ({ value: `preset:${key}`, label, selected: value.preset === key })) : []),
  ]
  const select = (option: string) => {
    const separator = option.indexOf(':')
    const key = option.slice(0, separator), next = option.slice(separator + 1)
    if (option === 'reset') onChange(defaultEventFilters(scope))
    else if (key === 'town') onChange({ ...value, town: next })
    else if (key === 'checked') onChange({ ...value, checked: next as EventFiltersState['checked'] })
    else if (key === 'transferred') onChange({ ...value, transferred: next as EventFiltersState['transferred'], preset: '' })
    else if (key === 'preset') onChange(applyPastPreset(value, value.preset === next ? '' : next as PastPreset))
    else if (key === 'status') {
      const status = next as StatusFilter
      const statuses = value.statuses.includes(status) ? value.statuses.filter((item) => item !== status) : [...value.statuses, status]
      if (statuses.length) onChange({ ...value, statuses, preset: '' })
    }
  }
  return <FilterOverlay title={selected ? 'Фильтры · выбраны' : 'Фильтры'} visible={visible} selected={selected}
    onOpen={() => setVisible(true)} onClose={() => setVisible(false)} options={options} onSelect={select} testID="events-filters" />
}
