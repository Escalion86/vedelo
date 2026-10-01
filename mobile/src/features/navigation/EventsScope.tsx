import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react'

export type EventsFilter = 'requests' | 'upcoming' | 'past' | 'all'
type ScopeState = {
  filter: EventsFilter
  setFilter: (filter: EventsFilter) => void
  selectScope: (scope: 'upcoming' | 'past') => void
  selection: number
}
const EventsScopeContext = createContext<ScopeState | null>(null)
export function EventsScopeProvider({ children }: PropsWithChildren) {
  const [filter, setFilter] = useState<EventsFilter>('upcoming')
  const [selection, setSelection] = useState(0)
  const value = useMemo(() => ({ filter, setFilter, selection,
    selectScope: (scope: 'upcoming' | 'past') => { setFilter(scope); setSelection((current) => current + 1) },
  }), [filter, selection])
  return <EventsScopeContext.Provider value={value}>{children}</EventsScopeContext.Provider>
}
export function useEventsScope() {
  const value = useContext(EventsScopeContext)
  if (!value) throw new Error('EventsScopeProvider is required')
  return value
}
