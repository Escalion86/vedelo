import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getRequestContext from '@server/getRequestContext'

// Mobile auth deliberately returns a public DTO, without Google credentials.
// Always reload only the authenticated account, including legacy tenant owners.
export const googleImportUserFilter = (userId, tenantId) => ({
  _id: userId,
  tenantId: String(userId) === String(tenantId) ? { $in: [tenantId, null] } : tenantId,
  archive: { $ne: true },
})

export const getGoogleImportContext = async (req) => {
  const context = await getRequestContext(req)
  if (!context.tenantId || !context.user?._id) return { ...context, user: null }
  await dbConnect()
  const user = await Users.findOne(googleImportUserFilter(context.user._id, context.tenantId))
  return { ...context, user }
}
