export const calendarSyncStatusProjection = {
  _id: 1,
  calendarSyncStatus: 1,
  calendarSyncError: 1,
  calendarSyncUpdatedAt: 1,
  syncVersion: 1,
}

export const serializeCalendarSyncStatus = (event) => ({
  _id: event._id,
  calendarSyncStatus: event.calendarSyncStatus || '',
  calendarSyncError: event.calendarSyncError || '',
  calendarSyncUpdatedAt: event.calendarSyncUpdatedAt ?? null,
  syncVersion: event.syncVersion ?? 1,
})
