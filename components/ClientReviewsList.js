'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useClientReviews } from '@helpers/useClientReviews'
import ClientReviewCard from '@components/ClientReviewCard'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import LoadingSpinner from '@components/LoadingSpinner'

export default function ClientReviewsList({
  clientId,
  unread = false,
  compact = false,
  filters = {},
}) {
  const [page, setPage] = useState(0)
  const query = useClientReviews({
    clientId,
    ...(unread ? { unread: true } : {}),
    ...filters,
    page,
  })
  if (query.isPending) return <LoadingSpinner text="Загружаем отзывы…" />
  if (query.isError)
    return (
      <Notice tone="error">
        Не удалось загрузить отзывы.{' '}
        <AppButton variant="secondary" onClick={() => query.refetch()}>
          Повторить
        </AppButton>
      </Notice>
    )
  if (compact && !query.data.total) return null
  return (
    <section
      className="space-y-3"
      aria-label={unread ? 'Новые отзывы клиентов' : 'Отзывы клиентов'}
    >
      {compact ? (
        <h2 className="text-lg font-semibold">
          Новые отзывы клиентов · {query.data.total}
        </h2>
      ) : null}
      {!clientId && !compact && !query.data.allowClientReviews ? (
        <Notice tone="info">
          Создание запросов доступно на тарифе с отзывами клиентов. Полученные
          отзывы остаются доступны.
        </Notice>
      ) : null}
      {!query.data.total ? (
        <Notice tone="neutral">
          Отзывов пока нет. Запросить отзыв можно из просмотра выполненной
          работы.
        </Notice>
      ) : null}
      {(compact ? query.data.items.slice(0, 3) : query.data.items).map(
        (review) => (
          <ClientReviewCard key={review._id} review={review} />
        )
      )}
      {compact ? (
        <Link
          className="ui-btn ui-btn-secondary inline-flex px-4 py-2"
          href="/cabinet/client-reviews"
        >
          Все отзывы
        </Link>
      ) : query.data.total > 30 ? (
        <div className="flex items-center gap-3">
          <AppButton
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Назад
          </AppButton>
          <span>
            {page + 1} / {Math.ceil(query.data.total / 30)}
          </span>
          <AppButton
            variant="secondary"
            disabled={(page + 1) * 30 >= query.data.total}
            onClick={() => setPage(page + 1)}
          >
            Далее
          </AppButton>
        </div>
      ) : null}
    </section>
  )
}
