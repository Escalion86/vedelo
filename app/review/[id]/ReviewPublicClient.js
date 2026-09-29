'use client'

import { useEffect, useState } from 'react'
import AppButton from '@components/AppButton'
import SurfaceCard from '@components/SurfaceCard'
import Notice from '@components/Notice'
import Textarea from '@components/Textarea'
import { apiJson } from '@helpers/apiClient'

export default function ReviewPublicClient({ id }) {
  const [token, setToken] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const secret = window.location.hash.slice(1)
    apiJson(`/api/public/client-reviews/${id}`, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Authorization: `Bearer ${secret}` },
    })
      .then((result) => {
        setToken(secret)
        setData(result.data)
        setError('')
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message)
      })
    return () => controller.abort()
  }, [id, retry])
  const submit = async (event) => {
    event.preventDefault()
    if (!rating || busy) return
    setBusy(true)
    setError('')
    try {
      await apiJson(`/api/public/client-reviews/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment }),
      })
      setData({ ...data, submitted: true })
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center gap-4 p-4">
      <p className="text-center text-sm">Ведело · Отзыв о работе</p>
      <SurfaceCard className="space-y-5" paddingClassName="p-5">
        {data?.submitted ? (
          <>
            <h1 className="text-2xl font-semibold">Спасибо за отзыв!</h1>
            <p>Ваш отзыв передан исполнителю.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">Как всё прошло?</h1>
            {!data && !error ? (
              <p role="status">Загружаем приглашение…</p>
            ) : null}
            {error ? (
              <Notice tone="error" role="alert">
                {error}
                {!data ? (
                  <AppButton
                    variant="secondary"
                    onClick={() => setRetry(retry + 1)}
                  >
                    Повторить
                  </AppButton>
                ) : null}
              </Notice>
            ) : null}
            {data ? (
              <form onSubmit={submit} className="space-y-5">
                <p>
                  Оцените работу: <strong>{data.performerName}</strong>
                </p>
                {data.eventDate ? (
                  <p className="text-sm">
                    Дата работы:{' '}
                    {new Date(data.eventDate).toLocaleDateString('ru-RU')}
                  </p>
                ) : null}
                <fieldset disabled={busy}>
                  <legend className="mb-2 text-sm">Ваша оценка</legend>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <label
                        key={value}
                        className={`focus-within:outline-general relative flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-lg border p-2 text-3xl focus-within:outline-2 focus-within:outline-offset-2 ${rating === value ? 'border-general bg-general/10' : 'border-gray-300'}`}
                      >
                        <input
                          className="absolute inset-0 cursor-pointer opacity-0"
                          type="radio"
                          name="rating"
                          value={value}
                          checked={rating === value}
                          onChange={() => setRating(value)}
                          aria-label={`${value} из 5`}
                          required
                        />
                        <span aria-hidden="true">
                          {value <= rating ? '★' : '☆'}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-2 text-sm" aria-live="polite">
                    {rating ? `${rating} из 5` : 'Выберите от 1 до 5 звёзд'}
                  </p>
                </fieldset>
                <Textarea
                  label="Что понравилось или что можно улучшить?"
                  ariaLabel="Комментарий"
                  value={comment}
                  onChange={setComment}
                  rows={4}
                  error={
                    comment.length > 2000 ? 'Не более 2000 символов' : false
                  }
                />
                <p className="text-sm">
                  Комментарий необязателен · {comment.length}/2000
                </p>
                <AppButton
                  fullWidth
                  type="submit"
                  disabled={!rating || busy || comment.length > 2000}
                  aria-busy={busy}
                >
                  {busy ? 'Отправляем…' : 'Отправить отзыв'}
                </AppButton>
                <p className="text-sm">
                  Отзыв увидит исполнитель. Он не будет опубликован
                  автоматически.
                </p>
              </form>
            ) : null}
          </>
        )}
      </SurfaceCard>
    </main>
  )
}
