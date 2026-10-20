import mongoose from 'mongoose'
import eventsSchema from '@schemas/eventsSchema'

const EventsSchema = new mongoose.Schema(eventsSchema, { timestamps: true })
EventsSchema.add({ aiEditReceipts: { type: [String], select: false, default: undefined } })
EventsSchema.index({ tenantId: 1, eventDate: -1 })
EventsSchema.index({ tenantId: 1, status: 1 })
EventsSchema.index({ tenantId: 1, clientId: 1 })
EventsSchema.index({ tenantId: 1, colleagueId: 1 })
EventsSchema.index({ tenantId: 1, eventDate: -1, status: 1, clientId: 1 })
EventsSchema.index({ tenantId: 1, googleCalendarCalendarId: 1, googleCalendarId: 1 })
EventsSchema.index({ tenantId: 1, fileImportKey: 1 }, { unique: true, partialFilterExpression: { fileImportKey: { $type: 'string' } } })

export default mongoose.models.Events || mongoose.model('Events', EventsSchema)
