import { getCachedEntity, removeCachedEntity, upsertEntities } from '../../shared/storage/cache'
import { assertLocalEntityIdentity, localEntityIdentity } from '../../shared/storage/localEntityIds'
import { assertLocalDataEpoch, localDataEpoch, withLocalEntityWrite } from '../../shared/storage/localEntityCoordination'
import type { CalendarImportRequest, CalendarPreview } from './calendarImportApi'
export type PendingCalendarImport = CalendarImportRequest & { _id: string; preview: CalendarPreview }
const collection = '__google_import'
export const readPendingCalendarImport = () => getCachedEntity<PendingCalendarImport>(collection, 'pending')
export const savePendingCalendarImport = async (pending: PendingCalendarImport | null, current: () => boolean) => {
  const epoch = localDataEpoch(), identity = await localEntityIdentity()
  await withLocalEntityWrite(async () => {
    assertLocalDataEpoch(epoch); await assertLocalEntityIdentity(identity)
    if (!current()) throw new Error('SESSION_CHANGED')
    if (pending) await upsertEntities(collection, [pending])
    else await removeCachedEntity(collection, 'pending')
  })
}
