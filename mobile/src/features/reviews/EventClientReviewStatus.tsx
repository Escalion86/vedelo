import { Text } from 'react-native'
import { StatusChip } from '../../shared/ui/components'
import { useReviewStatuses } from './hooks'
import { reviewLabels } from './domain'
import { useReviewStyles } from './styles'
// Карточки используют одну карту tenant, не N+1 запросы по eventId.
export function EventClientReviewStatus({eventId}:{eventId:string}) {
  const query=useReviewStatuses(),styles=useReviewStyles(),review=query.data?.[eventId]
  if(query.isPending)return <Text style={styles.meta}>Загружаем статус отзыва…</Text>
  if(query.isError)return <Text style={styles.meta}>Статус отзыва недоступен</Text>
  return review?<StatusChip label={review.rating?`★ ${review.rating} из 5`:reviewLabels[review.status]} tone={review.rating && review.rating<=3?'warning':'neutral'} />:null
}
