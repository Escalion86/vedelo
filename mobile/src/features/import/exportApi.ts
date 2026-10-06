import { z } from 'zod'
import { api } from '../../shared/api/client'
import { exportSchemas, type ExportData } from './exportDatasets'

const gate = z.object({ success: z.literal(true), data: z.object({ filters: z.object({ year: z.null(), town: z.literal(''), status: z.literal('all') }) }) })
export async function loadExportData(signal: AbortSignal, current: () => boolean): Promise<ExportData> {
  // Server-authorized allowStatistics gate, with no saved city/year/status.
  gate.parse(await api.get('/mobile/v1/statistics', { signal }))
  if (!current() || signal.aborted) throw new Error('STALE_EXPORT')
  const keys = ['events', 'clients', 'services', 'transactions'] as const
  const results = await Promise.all(keys.map(async key => {
    const response = await api.get(`/mobile/v1/${key}`, { signal })
    const result = z.object({ success: z.literal(true), data: z.array(exportSchemas[key]), meta: z.object({ hasMore: z.boolean().optional(), totalCount: z.number().int().nonnegative().optional() }).optional() }).parse(response)
    // The existing default collection GETs are exhaustive. Refuse a future
    // partial/paginated response rather than silently exporting one page.
    if (result.meta?.hasMore || (result.meta?.totalCount !== undefined && result.meta.totalCount !== result.data.length) || new Set(result.data.map(row => row._id)).size !== result.data.length) throw new Error('INCOMPLETE_EXPORT')
    return result.data
  }))
  if (!current() || signal.aborted) throw new Error('STALE_EXPORT')
  return Object.fromEntries(keys.map((key, i) => [key, results[i]])) as ExportData
}
