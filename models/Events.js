import mongoose from 'mongoose'
import eventsSchema from '@schemas/eventsSchema'

const EventsSchema = new mongoose.Schema(eventsSchema, { timestamps: true })
EventsSchema.add({ aiEditReceipts: { type: [String], select: false, default: undefined } })
const calendarSyncJobSchema = new mongoose.Schema({
  generation: String,
  userId: mongoose.Schema.Types.ObjectId,
  connectionKey: String,
  effectiveCalendarId: String,
  suppressTasksBeta: Boolean,
  attempts: Number,
  nextAttemptAt: Date,
  leaseToken: String,
  leaseUntil: Date,
  removedTasks: [{
    _id: { type: mongoose.Schema.Types.ObjectId },
    googleCalendarEventId: String,
  }],
}, { _id: false })
EventsSchema.add({ calendarSyncJob: { type: calendarSyncJobSchema, select: false } })
EventsSchema.set('toJSON', {
  transform(_document, result) {
    delete result.calendarSyncJob
    return result
  },
})
EventsSchema.index({ tenantId: 1, eventDate: -1 })
EventsSchema.index({ tenantId: 1, status: 1 })
EventsSchema.index({ tenantId: 1, clientId: 1 })
EventsSchema.index({ tenantId: 1, colleagueId: 1 })
EventsSchema.index({ tenantId: 1, eventDate: -1, status: 1, clientId: 1 })
EventsSchema.index({ tenantId: 1, googleCalendarCalendarId: 1, googleCalendarId: 1 })
EventsSchema.index({ calendarSyncStatus: 1, 'calendarSyncJob.nextAttemptAt': 1 }, {
  partialFilterExpression: { calendarSyncStatus: 'pending' },
})
EventsSchema.index({ tenantId: 1, fileImportKey: 1 }, { unique: true, partialFilterExpression: { fileImportKey: { $type: 'string' } } })

export default mongoose.models.Events || mongoose.model('Events', EventsSchema)
