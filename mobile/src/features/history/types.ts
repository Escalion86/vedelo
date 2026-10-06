export type HistoryChange = {
  field: string
  label: string
  oldValue: unknown
  newValue: unknown
}

export type HistoryItem = {
  id: string
  entityType: 'event' | 'client' | 'transaction'
  entityId: string
  operation: 'create' | 'update' | 'delete' | 'merge'
  semanticAction?: string
  entityLabel: string
  summary: string
  changes: HistoryChange[]
  actorId?: string
  actorLabel?: string
  source?: string
  occurredAt: string
  actorType?: string
  createdAt?: string
  batchId?: string
  legacy?: boolean
  entityExists?: boolean
}

export type HistoryFilters = {
  entityType?: string
  entityId?: string
  operation?: string
  source?: string
  actorId?: string
  search?: string
  dateFrom?: string
  dateTo?: string
}
