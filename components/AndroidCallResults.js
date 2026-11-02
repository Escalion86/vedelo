'use client'

import { useQuery } from '@tanstack/react-query'
import AppButton from './AppButton'
import Notice from './Notice'
import SurfaceCard from './SurfaceCard'

const labels = { answered: 'Ответил', no_answer: 'Не ответил', callback: 'Перезвонить', follow_up: 'Следующий контакт' }
export default function AndroidCallResults({ user }) {
  const query = useQuery({ queryKey: ['android-call-results', user?.tenantId || user?._id, user?._id], enabled: Boolean(user?._id),
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/calls/android', { signal, cache: 'no-store' })
      const body = await response.json()
      if (!response.ok || !body.success) throw Error('Не удалось загрузить итоги')
      return body.data
    } })
  return <section className="mb-4 flex flex-col gap-3" aria-label="Итоги звонков из Android">
    <h2 className="text-lg font-semibold">Итоги звонков из Android</h2>
    <p className="card-muted text-sm">Последние 100 результатов, сохранённых вручную. Длительность сотового разговора не определяется.</p>
    {query.isError && <Notice tone="error">Не удалось загрузить итоги звонков.</Notice>}
    {query.data?.map(item => <SurfaceCard key={item._id} className="p-3">
      <p className="card-title font-semibold">{item.phone} · {labels[item.result] || item.result}</p>
      <p className="card-muted text-sm">Сохранено: {new Date(item.savedAt).toLocaleString('ru-RU')}</p>
      {item.note && <p className="card-description whitespace-pre-wrap break-words">{item.note}</p>}
      {item.pending && <Notice tone="warning">Следующий контакт пока не подтверждён. Повторите сохранённую попытку на исходном Android-устройстве.</Notice>}
    </SurfaceCard>)}
    {query.data?.length === 0 && <p className="card-muted text-sm">Сохранённых результатов пока нет.</p>}
    <AppButton variant="secondary" disabled={query.isFetching} onClick={() => query.refetch()}>Обновить итоги</AppButton>
  </section>
}
