import { useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { Button, EmptyState, Field, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { PeriodPicker, type PeriodRange } from '../../shared/ui/PeriodPicker'
import { periodSummary } from '../../shared/ui/periodPickerDates'
import { getFieldHelp } from '../../shared/domain/fieldHelp'
import { useAuth } from '../../shared/auth/AuthProvider'
import { useReviews } from './hooks'
import { ReviewCard } from './ReviewCard'
import { searchReviews } from './domain'
import { useReviewStyles } from './styles'
import type { ReviewNavigation } from './types'
export type ClientReviewsSectionProps = ReviewNavigation & {clientId?:string;unreadOnly?:boolean;title?:string;showFilters?:boolean}
export function ClientReviewsSection(props:ClientReviewsSectionProps) {
  const {user}=useAuth()
  return <ClientReviewsContent key={`${user?._id}:${user?.tenantId}:${props.clientId || ''}:${Boolean(props.unreadOnly)}:${props.showFilters!==false}`} {...props} />
}
function ClientReviewsContent({ clientId, unreadOnly=false, title='Отзывы клиентов', showFilters=true, ...navigation }:ClientReviewsSectionProps) {
  const styles = useReviewStyles()
  const [open,setOpen] = useState(false), [rating,setRating] = useState(''), [unread,setUnread] = useState(false)
  const [period,setPeriod] = useState<PeriodRange>({from:'',to:''}), [search,setSearch] = useState(''), [page,setPage] = useState(0)
  const query = useReviews({clientId,rating,unread:unreadOnly || unread?'true':'',...period,page})
  const count = [rating,unread && !unreadOnly,period.from,period.to,search.trim()].filter(Boolean).length
  const summary = [rating && `${rating} из 5`,(unread || unreadOnly) && 'Непрочитанные',(period.from || period.to) && periodSummary(period),search.trim() && `Поиск на странице: ${search.trim()}`].filter(Boolean).join(' · ')
  const reset = () => {setRating('');setUnread(false);setPeriod({from:'',to:''});setSearch('');setPage(0)}
  const rows = searchReviews(query.data?.items || [],search)
  return <View testID={unreadOnly?'unread-client-reviews':'client-reviews-section'} style={styles.content}>
    <SectionTitle help={getFieldHelp('review.request')}>{title}{query.data?` (${query.data.total})`:''}</SectionTitle>
    {showFilters ? <Surface variant="toolbar">
      <View style={styles.actions}>
        <Button testID="reviews-filters-toggle" title={`Фильтры${count?` (${count})`:''}`} variant="secondary" accessibilityState={{expanded:open}} onPress={()=>setOpen(!open)} />
        {count ? <Button testID="reviews-filters-reset" title="Сбросить фильтры" variant="secondary" onPress={reset} />:null}
      </View>
      {summary ? <Text testID="reviews-filter-summary" style={styles.meta}>{summary}</Text>:null}
      {open ? <View style={styles.content}>
        <SectionTitle>Оценка</SectionTitle>
        <View style={styles.actions}>{['', '5','4','3','2','1'].map((value)=><Button key={value} title={value?`${value} из 5`:'Все оценки и запросы'} variant={rating===value?'primary':'secondary'} accessibilityState={{selected:rating===value}} onPress={()=>{setRating(value);setPage(0)}} />)}</View>
        {!unreadOnly ? <Button title="Только непрочитанные" variant={unread?'primary':'secondary'} accessibilityState={{selected:unread}} onPress={()=>{setUnread(!unread);setPage(0)}} />:null}
        <PeriodPicker testID="reviews-period" label="Период запросов" value={period} onChange={(next)=>{setPeriod(next);setPage(0)}} />
        <Text style={styles.meta}>Период применяется к дате создания приглашения, конечный день включён.</Text>
      </View>:null}
      <Field testID="reviews-search" label="Поиск по текущей странице" value={search} onChangeText={setSearch} help="Поиск по имени, работе, комментарию и заметке в 30 записях этой страницы. Остальные страницы не проверяются." />
    </Surface>:null}
    {query.isPending ? <><ActivityIndicator /><Text style={styles.meta}>Загружаем отзывы…</Text></>:null}
    {query.isError ? <><Notice tone="danger" message="Не удалось загрузить отзывы" /><Button title="Повторить загрузку" variant="secondary" onPress={()=>query.refetch()} /></>:null}
    {query.data ? <>
      {query.isError ? <Text style={styles.meta}>Показаны ранее загруженные отзывы. Открытые заметки сохранены в форме.</Text>:null}
      {!query.data.allowClientReviews ? <Notice message="Полученные отзывы, заметки и прочтение доступны. Новые приглашения доступны на тарифе с отзывами клиентов." />:null}
      {query.isFetching ? <Text style={styles.meta}>Обновляем отзывы…</Text>:null}
      {rows.map((review)=><ReviewCard key={review._id} review={review} {...navigation} />)}
      {!rows.length && !query.isError ? <EmptyState title={search.trim()?'Совпадений на этой странице нет':'Отзывов пока нет'} />:null}
      <Text testID="reviews-page" style={styles.meta}>Страница {page+1} из {Math.max(1,Math.ceil(query.data.total/30))} · Всего: {query.data.total}</Text>
      <View style={styles.actions}>
        <Button title="Предыдущая страница" variant="secondary" disabled={page===0 || query.isFetching} onPress={()=>setPage(page-1)} />
        <Button title="Следующая страница" variant="secondary" disabled={(page+1)*30>=query.data.total || query.isFetching} onPress={()=>setPage(page+1)} />
      </View>
    </>:null}
  </View>
}
export function UnreadClientReviewsSection(props:ReviewNavigation) {return <ClientReviewsSection {...props} title="Новые отзывы клиентов" unreadOnly showFilters={false} />}
