'use client'

import { useEffect, useState } from 'react'
import ReviewPageView from '@components/ReviewPageView'
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
  const state = !data
    ? error
      ? 'error'
      : 'loading'
    : data.submitted
      ? 'thanks'
      : 'form'
  return (
    <ReviewPageView
      appearance={data?.appearance ?? null}
      state={state}
      error={error}
      performerName={data?.performerName ?? ''}
      eventDate={data?.eventDate ?? null}
      rating={rating}
      comment={comment}
      onRatingChange={setRating}
      onCommentChange={setComment}
      onSubmit={submit}
      onRetry={!data && error ? () => setRetry(retry + 1) : undefined}
      busy={busy}
    />
  )
}
