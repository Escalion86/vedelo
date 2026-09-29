'use client'

import { useQuery } from '@tanstack/react-query'
import { apiJson } from '@helpers/apiClient'
import { REVIEW_STATUS_LABELS } from '@helpers/clientReviews.mjs'
import StatusChip from '@components/StatusChip'

export default function EventClientReviewStatus({ eventId }) {
  const { data } = useQuery({
    queryKey: ['clientReviews', 'statuses'],
    queryFn: async ({ signal }) =>
      (await apiJson('/api/client-reviews/statuses', { signal })).data,
    staleTime: 30000,
    refetchInterval: 30000,
  })
  const review = data?.[eventId]
  if (!review) return null
  return (
    <StatusChip tone={review.rating ? 'success' : 'neutral'}>
      {review.rating
        ? `★ ${review.rating} · Отзыв`
        : REVIEW_STATUS_LABELS[review.status]}
    </StatusChip>
  )
}
