'use client'

import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import UserName from '@components/UserName'

const fetchHistory = async (params) => {
  const response = await fetch(`/api/admin/promo-codes?${params}`, {
    cache: 'no-store',
  })
  const body = await response.json()
  if (!response.ok || !body.success)
    throw new Error(body.error || 'Не удалось загрузить историю')
  return body.data
}

const Receipt = ({ row }) => (
  <div className="text-sm">
    <p>{new Date(row.appliedAt).toLocaleString('ru-RU')}</p>
    {row.amount > 0 && <p>Бонус: {row.amount.toLocaleString('ru-RU')} ₽</p>}
    {row.tariffTitle && <p>Доступ к тарифу: {row.tariffTitle}</p>}
  </div>
)

export default function PromoCodeHistory({ code, userId }) {
  const [page, setPage] = useState(0)
  const query = useQuery({
    queryKey: ['admin-promo-history', userId || code, page],
    queryFn: () =>
      fetchHistory(new URLSearchParams(userId ? { userId } : { code, page })),
  })
  if (query.isPending)
    return <p role="status">Загрузка использованных промокодов…</p>
  if (query.error)
    return (
      <Notice tone="error" role="alert">
        {query.error.message}
        <AppButton variant="secondary" onClick={() => query.refetch()}>
          Повторить
        </AppButton>
      </Notice>
    )
  const rows = userId ? query.data : query.data.users
  if (userId && !rows.length) return null
  return (
    <section className="mt-4 flex min-w-0 flex-col gap-3">
      {userId && (
        <h3 className="text-sm font-semibold">
          Использованные промокоды ({rows.length})
        </h3>
      )}
      {!rows.length && <p>Этим промокодом пока никто не воспользовался.</p>}
      {rows.map((row) => (
        <div
          key={userId ? row.code : row._id}
          className="min-w-0 rounded-xl border border-gray-300 p-3 break-words"
        >
          {userId ? (
            <p className="font-semibold">{row.code}</p>
          ) : (
            <>
              <UserName user={row} className="font-semibold" />
              {!row.firstName && !row.secondName && !row.thirdName && (
                <p>Пользователь без имени</p>
              )}
              {row.phone && <p>{row.phone}</p>}
              {row.archive && <p>Пользователь в архиве</p>}
            </>
          )}
          <Receipt row={row} />
        </div>
      ))}
      {!userId && (page > 0 || query.data.hasMore) && (
        <div className="flex flex-wrap items-center gap-2">
          <AppButton
            variant="secondary"
            disabled={page === 0}
            onClick={() => setPage((n) => n - 1)}
          >
            Назад
          </AppButton>
          <span>Страница {page + 1}</span>
          <AppButton
            variant="secondary"
            disabled={!query.data.hasMore}
            onClick={() => setPage((n) => n + 1)}
          >
            Далее
          </AppButton>
        </div>
      )}
    </section>
  )
}

export function PromoCodeDelete({ row, onDelete, closeModal }) {
  const lock = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <p>
        Удалить промокод «{row.code}»? Удаление возможно, только если им никто
        не воспользовался.
      </p>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <AppButton
        variant="danger"
        disabled={busy}
        aria-busy={busy}
        onClick={async () => {
          if (lock.current) return
          lock.current = true
          setBusy(true)
          setError('')
          try {
            await onDelete(row)
            closeModal()
          } catch (err) {
            setError(err.message)
          } finally {
            lock.current = false
            setBusy(false)
          }
        }}
      >
        {busy ? 'Удаление…' : 'Удалить промокод'}
      </AppButton>
    </div>
  )
}
