import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react'

export type EventsFilter = 'requests' | 'upcoming' | 'past' | 'all'
type ScopeState = {
  filter: EventsFilter
  setFilter: (filter: EventsFilter) => void
  selectScope: (scope: 'upcoming' | 'past', unclosedOnly?: boolean) => void
  unclosedOnly: boolean
  selection: number
}
const EventsScopeContext = createContext<ScopeState | null>(null)
export function EventsScopeProvider({ children }: PropsWithChildren) {
  const [filter, setFilter] = useState<EventsFilter>('upcoming')
  const [selection, setSelection] = useState(0)
  const [unclosedOnly, setUnclosedOnly] = useState(false)
  const value = useMemo(() => ({ filter, selection, unclosedOnly,
    setFilter: (next: EventsFilter) => { setFilter(next); setUnclosedOnly(false) },
    selectScope: (scope: 'upcoming' | 'past', unclosed = false) => {
      setFilter(scope); setUnclosedOnly(scope === 'past' && unclosed); setSelection((current) => current + 1)
    },
  }), [filter, selection, unclosedOnly])
  return <EventsScopeContext.Provider value={value}>{children}</EventsScopeContext.Provider>
}
export function useEventsScope() {
  const value = useContext(EventsScopeContext)
  if (!value) throw new Error('EventsScopeProvider is required')
  return value
}
