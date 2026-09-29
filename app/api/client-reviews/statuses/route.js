import ClientReviews from '@models/ClientReviews'
import { reviewContext, reviewResponse } from '@server/clientReviews'
import { reviewStatus } from '@helpers/clientReviews.mjs'

export const GET = async () => {
  const ctx = await reviewContext()
  if (ctx.response) return ctx.response
  const rows = await ClientReviews.find({ tenantId: ctx.tenantId })
    .select('eventId rating submittedAt revokedAt expiresAt sentAt')
    .lean()
  return reviewResponse(
    Object.fromEntries(
      rows.map((row) => [
        String(row.eventId),
        {
          status: reviewStatus(row),
          rating: row.rating,
        },
      ])
    )
  )
}
