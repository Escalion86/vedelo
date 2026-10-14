import { useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { Button, Field, Notice, SectionTitle, StatusChip, Surface } from '../../shared/ui/components'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { actOnReview, readExactReview } from './api'
import { useRefreshReviews } from './hooks'
import { useReviewLifetime } from './lifetime'
import { reviewLabels } from './domain'
import { useReviewStyles } from './styles'
import type { ClientReview, ReviewNavigation } from './types'
export function ReviewCard({ review, showLinks = true, onChanged, onOpenEvent, onOpenClient, onPlanContact }: ReviewNavigation & {review:ClientReview;showLinks?:boolean;onChanged?:(review:ClientReview)=>void}) {
  const styles = useReviewStyles(), refresh = useRefreshReviews()
  const [note,setNote] = useState(review.note), [saved,setSaved] = useState(review.note), [open,setOpen] = useState(false)
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState('')
  const lock = useRef(false),capture=useReviewLifetime(review._id)
  const save = async (action:'note'|'read') => {
    if (lock.current) return
    const current=capture()
    lock.current=true;setBusy(true);setError('');setMessage('')
    try {
      const result = await actOnReview(review._id,action,note)
      const exact = await readExactReview(result)
      await refresh()
      if(!current())return
      if (action === 'note') {setNote(exact.note);setSaved(exact.note)}
      onChanged?.(exact);setMessage('Изменения сохранены')
    } catch {if(current())setError('Не удалось сохранить изменения. Повторите попытку')}
    finally {lock.current=false;setBusy(false)}
  }
  return <Surface testID={`review-card-${review._id}`}>
    <StatusChip label={review.rating ? `★ ${review.rating} из 5` : reviewLabels[review.status]} tone={review.rating && review.rating <= 3 ? 'warning':'neutral'} />
    <Text style={styles.meta}>Запрос: {new Date(review.createdAt).toLocaleDateString('ru-RU')}</Text>
    {review.submittedAt ? <Text style={styles.meta}>Получен: {new Date(review.submittedAt).toLocaleDateString('ru-RU')}</Text>:null}
    {review.clientName ? <SectionTitle>{review.clientName}</SectionTitle> : null}
    {review.eventTitle ? <Text style={styles.text}>{review.eventTitle}{review.eventDate?` · ${new Date(review.eventDate).toLocaleDateString('ru-RU')}`:''}</Text> : null}
    {review.comment ? <Text selectable style={styles.text}>{review.comment}</Text> : null}
    {review.submittedAt ? <Text style={styles.meta}>{review.readAt?'Прочитан':'Новый отзыв'}</Text>:null}
    {showLinks ? <View style={styles.actions}>
      <Button title="Открыть работу" variant="secondary" onPress={() => onOpenEvent ? onOpenEvent(review.eventId) : router.push(`/events/${review.eventId}`)} />
      <Button title="Клиент и контакты" variant="secondary" onPress={() => onOpenClient ? onOpenClient(review.clientId) : router.push(`/clients/${review.clientId}`)} />
    </View> : null}
    {review.rating && review.rating <= 3 ? <Button title="Запланировать контакт" variant="secondary" onPress={() => onPlanContact ? onPlanContact(review.eventId) : router.push({pathname:'/events/edit/[id]',params:{id:review.eventId,section:'contacts'}} as never)} />:null}
    {review.submittedAt && !review.readAt ? <Button testID={`review-read-${review._id}`} title="Отметить прочитанным" variant="secondary" loading={busy} onPress={() => save('read')} />:null}
    <Button title="Внутренняя заметка" variant="secondary" accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)} />
    {open ? <><Field testID={`review-note-${review._id}`} label="Заметка для себя" help={getFieldHelp('review.privateNote')} value={note} onChangeText={setNote} multiline editable={!busy} maxLength={2000} />
      <Button title="Сохранить заметку" variant="secondary" loading={busy} disabled={note===saved} onPress={()=>save('note')} /></>:null}
    {error ? <Notice tone="danger" message={error} />:null}
    {message ? <Notice tone="success" message={message} />:null}
  </Surface>
}
