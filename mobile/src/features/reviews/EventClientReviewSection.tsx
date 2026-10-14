import { useEffect, useRef, useState } from 'react'
import { Share, Text, View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Button, Field, Notice, SectionTitle } from '../../shared/ui/components'
import { useAuth } from '../../shared/auth/AuthProvider'
import { useFocusEffect } from 'expo-router'
import { useCallback } from 'react'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { useReviews, useRefreshReviews } from './hooks'
import { actOnReview, createReview, readExactReview } from './api'
import { useReviewLifetime } from './lifetime'
import { canRequestReview } from './domain'
import { ReviewCard } from './ReviewCard'
import { useReviewStyles } from './styles'
import type { ReviewAction, ReviewEvent, ReviewNavigation, ReviewResult } from './types'
export type EventClientReviewSectionProps = ReviewNavigation & {event:ReviewEvent;onChanged?:()=>void}
export function EventClientReviewSection(props:EventClientReviewSectionProps) {
  const {user}=useAuth()
  return <EventReviewContent key={`${user?._id}:${user?.tenantId}:${props.event._id}`} {...props} />
}
function EventReviewContent({event,onChanged,...navigation}:EventClientReviewSectionProps) {
  const {user}=useAuth()
  const styles = useReviewStyles(), query = useReviews({eventId:event._id,page:0}), refresh = useRefreshReviews()
  const [confirmed,setConfirmed] = useState(false),[busy,setBusy] = useState(false),[error,setError] = useState(''),[notice,setNotice] = useState('')
  const [sharing,setSharing] = useState<ReviewResult|null>(null),[message,setMessage] = useState(''),[revokeConfirm,setRevokeConfirm] = useState(false)
  const capture=useReviewLifetime(event._id)
  const lock = useRef(false), review = query.data?.items[0], eligible = canRequestReview(event)
  // Capability хранится только в локальной форме отправки, не в Query-кэше.
  useEffect(()=>{setSharing(null);setMessage('');setConfirmed(false);setRevokeConfirm(false);setBusy(false);setError('');setNotice('')},[event._id,user?._id,user?.tenantId])
  useFocusEffect(useCallback(()=>()=>{setSharing(null);setMessage('')},[]))
  const run = async (action?:ReviewAction) => {
    if(lock.current) return
    const current=capture()
    lock.current=true;setBusy(true);setError('');setNotice('')
    try {
      const result = action ? await actOnReview(review?._id || sharing!._id,action) : await createReview(event._id,confirmed)
      await readExactReview(result)
      await refresh()
      if(!current()) return
      if(result.url) {
        setSharing(result)
        setMessage(`Спасибо, что обратились ко мне! Поделитесь, пожалуйста, впечатлением о работе: ${result.url}\nМожно просто поставить оценку или добавить несколько слов.`)
      }
      onChanged?.();setRevokeConfirm(false)
      if(action==='revoke') {setSharing(null);setMessage('')}
      if(!result.url) setNotice(action==='sent'?'Отправка отмечена':'Изменения сохранены')
    } catch {if(current())setError('Не удалось сохранить изменения. Повторите попытку')}
    finally {lock.current=false;setBusy(false)}
  }
  const copy = async (value:string) => {
    setError('');setNotice('')
    try {await Clipboard.setStringAsync(value);setNotice('Скопировано')}
    catch {setError('Не удалось скопировать. Сообщение сохранено в поле для ручного копирования')}
  }
  const share = async () => {
    setError('');setNotice('')
    try {await Share.share({message})} catch {setError('Не удалось открыть отправку. Сообщение сохранено в поле')}
  }
  if(!eligible && !review && !query.isPending && !query.isError) return null
  return <View testID="event-client-review-section" style={styles.content}>
    <SectionTitle help={getFieldHelp('review.request')}>Отзыв клиента</SectionTitle>
    {query.isPending ? <Text style={styles.meta}>Загружаем отзыв…</Text>:null}
    {query.isError ? <><Notice tone="danger" message="Не удалось загрузить отзыв" /><Button title="Повторить загрузку" onPress={()=>query.refetch()} /></>:null}
    {query.data ? <>
      {query.isError ? <Text style={styles.meta}>Показан ранее загруженный отзыв. Открытая заметка сохранена в форме.</Text>:null}
      {review ? <ReviewCard review={review} showLinks={false} onChanged={()=>onChanged?.()} {...navigation} />:null}
      {!query.data?.allowClientReviews ? <Notice message="Доступно на тарифе с отзывами клиентов. Полученные отзывы сохраняются." />:null}
      {eligible && query.data?.allowClientReviews && !review?.submittedAt ? <>
        {!review && event.status!=='closed' ? <Button testID="review-completed-confirm" title={confirmed?'Работа выполнена ✓':'Работа выполнена'} variant={confirmed?'primary':'secondary'} accessibilityLabel="Работа выполнена" accessibilityState={{selected:confirmed}} disabled={busy} onPress={()=>setConfirmed(!confirmed)} />:null}
        <Button testID="review-request" title={!review?'Запросить отзыв':['expired','revoked'].includes(review.status)?'Создать новую ссылку':'Отправить ссылку'} loading={busy} disabled={!review && event.status!=='closed' && !confirmed} onPress={()=>run(review?['expired','revoked'].includes(review.status)?'renew':'link':undefined)} />
      </>:null}
      {review && ['created','sent'].includes(review.status) ? <>
        <Button title="Отключить ссылку" variant="danger" disabled={busy} onPress={()=>setRevokeConfirm(true)} />
        {revokeConfirm ? <><Notice tone="warning" message="Клиент больше не сможет отправить отзыв по этой ссылке. Отключить доступ?" />
          <Button testID="review-revoke-confirm" title="Подтвердить отключение" variant="danger" loading={busy} onPress={()=>run('revoke')} /><Button title="Отмена" variant="secondary" disabled={busy} onPress={()=>setRevokeConfirm(false)} /></>:null}
      </>:null}
    </>:null}
    {sharing?.url ? <View testID="review-share-panel" style={styles.content}>
      <Notice message={`Ссылка действует до ${new Date(sharing.expiresAt).toLocaleDateString('ru-RU')}. Открытие отправки не означает доставку сообщения клиенту.`} />
      <Field label="Сообщение клиенту" help="Измените текст перед отправкой. Ссылка даёт доступ к форме отзыва, не публикуйте её в общем доступе." value={message} onChangeText={setMessage} multiline editable={!busy} />
      <Button title="Скопировать сообщение" variant="secondary" disabled={busy} onPress={()=>copy(message)} />
      <Button testID="review-copy-link" title="Скопировать ссылку" variant="secondary" disabled={busy} onPress={()=>copy(sharing.url!)} />
      <Button title="Поделиться сообщением" variant="secondary" disabled={busy} onPress={share} />
      <Button testID="review-mark-sent" title="Я отправил сообщение" variant="secondary" loading={busy} onPress={()=>run('sent')} />
      <Button title="Закрыть отправку" variant="secondary" disabled={busy} onPress={()=>{setSharing(null);setMessage('')}} />
    </View>:null}
    {error ? <Notice tone="danger" message={error} />:null}
    {notice ? <Notice tone="success" message={notice} />:null}
  </View>
}
