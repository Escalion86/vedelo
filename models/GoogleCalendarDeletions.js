import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  connectionKey: String,
  calendarId: String,
  googleCalendarId: String,
  tasks: [{
    _id: { type: mongoose.Schema.Types.ObjectId },
    googleCalendarEventId: String,
  }],
  tasksBeta: Boolean,
  nextAttemptAt: Date,
  attempts: Number,
  leaseToken: String,
  leaseUntil: Date,
  expiresAt: Date,
})

schema.index({ tenantId: 1, eventId: 1 }, { unique: true })
schema.index({ nextAttemptAt: 1 })
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export default mongoose.models.GoogleCalendarDeletions ||
  mongoose.model('GoogleCalendarDeletions', schema)
