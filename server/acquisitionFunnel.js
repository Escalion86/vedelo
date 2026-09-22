import Users from '@models/Users'
import ServiceActivityDays from '@models/ServiceActivityDays'

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const DISTINCT_VISIT_MS = 6 * 60 * 60 * 1000

const asDate = (value) => {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

export const recordCrmItemCreated = async ({ userId, hasNextAction }) => {
  if (!userId) return null
  const user = await Users.findById(userId)
  if (!user) return null
  const now = new Date()
  user.acquisitionFunnel ??= {}
  if (!user.acquisitionFunnel.firstCrmItemCreatedAt) {
    user.acquisitionFunnel.firstCrmItemCreatedAt = now
  }
  if (hasNextAction && !user.acquisitionFunnel.firstNextActionAt) {
    user.acquisitionFunnel.firstNextActionAt = now
  }
  await user.save()
  return user.acquisitionFunnel
}

export const recordOnboardingCompleted = async (userId) => {
  if (!userId) return false
  const result = await Users.updateOne(
    {
      _id: userId,
      $or: [
        { 'acquisitionFunnel.onboardingCompletedAt': null },
        { 'acquisitionFunnel.onboardingCompletedAt': { $exists: false } },
      ],
    },
    { $set: { 'acquisitionFunnel.onboardingCompletedAt': new Date() } }
  )
  return result.modifiedCount > 0
}

export const recordPaymentSucceeded = async (userId, paidAt = new Date()) => {
  if (!userId) return false
  const result = await Users.updateOne(
    {
      _id: userId,
      $or: [
        { 'acquisitionFunnel.paymentSucceededAt': null },
        { 'acquisitionFunnel.paymentSucceededAt': { $exists: false } },
      ],
    },
    { $set: { 'acquisitionFunnel.paymentSucceededAt': paidAt } }
  )
  return result.modifiedCount > 0
}

export const recordPilotDemoRequested = async (userId) => {
  if (!userId) return false
  const result = await Users.updateOne(
    {
      _id: userId,
      $or: [
        { 'acquisitionFunnel.pilotDemoRequestedAt': null },
        { 'acquisitionFunnel.pilotDemoRequestedAt': { $exists: false } },
      ],
    },
    { $set: { 'acquisitionFunnel.pilotDemoRequestedAt': new Date() } }
  )
  return result.modifiedCount > 0
}

export const recordCabinetVisit = async (userId, now = new Date()) => {
  if (!userId) return { activatedNow: false, returnedNow: false }
  const user = await Users.findById(userId)
  if (!user) return { activatedNow: false, returnedNow: false }

  if (!['dev', 'admin'].includes(user.role)) {
    try {
      await ServiceActivityDays.updateOne(
        { tenantId: user.tenantId || user._id, userId: user._id, day: now.toISOString().slice(0, 10) },
        { $setOnInsert: { firstSeenAt: now } },
        { upsert: true }
      )
    } catch (error) {
      // Concurrent first visits may race on the unique index. Analytics must
      // not prevent normal cabinet use if its storage is unavailable.
      if (error?.code !== 11000) console.warn('Service activity recording unavailable')
    }
  }

  user.acquisitionFunnel ??= {}
  const funnel = user.acquisitionFunnel
  const previousTrackedVisit = asDate(funnel.lastTrackedVisitAt)
  const firstItemAt = asDate(funnel.firstCrmItemCreatedAt)
  const firstNextActionAt = asDate(funnel.firstNextActionAt)
  const isDistinctReturn =
    firstItemAt &&
    now.getTime() - firstItemAt.getTime() >= DISTINCT_VISIT_MS &&
    now.getTime() - firstItemAt.getTime() <= RETURN_WINDOW_MS &&
    (!previousTrackedVisit || previousTrackedVisit.getTime() < firstItemAt.getTime())

  let returnedNow = false
  let activatedNow = false
  if (isDistinctReturn && !funnel.returnedWithin7DaysAt) {
    funnel.returnedWithin7DaysAt = now
    returnedNow = true
  }
  if (
    firstItemAt &&
    firstNextActionAt &&
    funnel.returnedWithin7DaysAt &&
    !funnel.activatedAt
  ) {
    funnel.activatedAt = now
    activatedNow = true
  }

  if (
    !previousTrackedVisit ||
    now.getTime() - previousTrackedVisit.getTime() >= DISTINCT_VISIT_MS
  ) {
    funnel.lastTrackedVisitAt = now
    user.prevActivityAt = user.lastActivityAt || now
    user.lastActivityAt = now
    await user.save()
  } else if (returnedNow || activatedNow) {
    await user.save()
  }

  return { activatedNow, returnedNow }
}

export const ACQUISITION_RETURN_WINDOW_MS = RETURN_WINDOW_MS
export const ACQUISITION_DISTINCT_VISIT_MS = DISTINCT_VISIT_MS
