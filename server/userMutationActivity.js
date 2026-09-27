import Histories from '@models/Histories'
import mongoose from 'mongoose'

// Call only with users already filtered by the caller's access rules.
// Match both author and tenant: another member's or integration's changes
// must not become this user's activity.
export const withUserMutationActivity = async (users = []) => {
  const scopes = users.flatMap((user) => {
    const userId = String(user?._id || '')
    const tenantId = String(user?.tenantId || userId)
    if (
      !mongoose.isObjectIdOrHexString(userId) ||
      !mongoose.isObjectIdOrHexString(tenantId)
    )
      return []
    return [
      {
        tenantId: new mongoose.Types.ObjectId(tenantId),
        $or: [
          {
            actorType: 'user',
            actorId: userId,
            operation: { $in: ['create', 'update', 'delete', 'merge'] },
          },
          {
            actorType: { $in: ['', null] },
            userId,
            action: { $in: ['add', 'update', 'delete'] },
          },
        ],
      },
    ]
  })
  const activity = scopes.length
    ? await Histories.aggregate([
        { $match: { $or: scopes } },
        {
          $group: {
            _id: {
              tenantId: '$tenantId',
              userId: {
                $cond: [{ $eq: ['$actorType', 'user'] }, '$actorId', '$userId'],
              },
            },
            lastMutationAt: {
              $max: {
                $cond: [
                  { $eq: ['$actorType', 'user'] },
                  { $ifNull: ['$occurredAt', '$createdAt'] },
                  '$createdAt',
                ],
              },
            },
          },
        },
      ])
    : []
  const byUser = new Map(
    activity.map((row) => [
      `${row._id.tenantId}:${row._id.userId}`,
      row.lastMutationAt,
    ])
  )
  return users.map((user) => ({
    ...user,
    lastMutationAt:
      byUser.get(`${user.tenantId || user._id}:${user._id}`) || null,
  }))
}
