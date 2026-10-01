import { MenuRow } from './MenuRow'
export function EventsSubmenu({ scope, onSelect }: {
  scope: string; onSelect: (scope: 'upcoming' | 'past') => void
}) {
  return <>
    <MenuRow title="Предстоящие" icon="calendar-arrow-right" selected={scope === 'upcoming'} onPress={() => onSelect('upcoming')} />
    <MenuRow title="Прошедшие" icon="calendar-check-outline" selected={scope === 'past'} onPress={() => onSelect('past')} />
  </>
}
