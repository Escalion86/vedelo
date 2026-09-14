'use client'

import { useEffect, useState } from 'react'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import Image from 'next/image'

const DISMISSED_KEY = 'vedelo:migration-announcement-dismissed'

const getLegacyPushEndpoint = async () => {
  if (!('serviceWorker' in navigator)) return ''
  const registration = await navigator.serviceWorker.ready.catch(() => null)
  const subscription = await registration?.pushManager?.getSubscription().catch(() => null)
  return subscription?.endpoint || ''
}

const beginMigration = async (setLoading, setError) => {
  setLoading(true)
  setError('')
  try {
    const legacyPushEndpoint = await getLegacyPushEndpoint()
    const response = await fetch('/api/domain-migration/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legacyPushEndpoint }),
    })
    const result = await response.json().catch(() => ({}))
    if (response.status === 401) {
      window.location.assign('https://vedelo.ru/login?callbackUrl=%2Fmigrate')
      return
    }
    if (!response.ok || !result?.data?.url) {
      throw new Error(result?.error || 'Не удалось начать перенос')
    }
    window.location.assign(result.data.url)
  } catch (reason) {
    setError(reason instanceof Error ? reason.message : 'Не удалось начать перенос')
    setLoading(false)
  }
}

const DomainMigrationBanner = () => {
  const [status, setStatus] = useState(null)
  const [dismissed, setDismissed] = useState(
    () => typeof window !== 'undefined' && localStorage.getItem(DISMISSED_KEY) === '1'
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/domain-migration/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => setStatus(result?.data || null))
      .catch(() => null)
  }, [])

  if (!status || status.origin !== 'artistcrm' || status.phase === 'inactive') return null
  if (status.phase === 'announcement' && dismissed) return null

  return (
    <Notice tone="warning" className="mx-3 mt-3 rounded-xl p-3 shadow-sm" role="status">
      <div className="flex items-start gap-3">
        <Image src="/brand/vedelo-mark.svg" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Ведело — ранее ArtistCRM</div>
          <p className="mt-1 text-sm leading-5">
            Мы меняем название и переезжаем на vedelo.ru. Данные и тариф сохранятся.
            {status.phase === 'countdown' ? ` До закрытия старого кабинета: ${status.daysLeft} дн.` : ''}
          </p>
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <AppButton onClick={() => beginMigration(setLoading, setError)} disabled={loading}>
              {loading ? 'Подготавливаем…' : 'Перейти в Ведело'}
            </AppButton>
            {status.phase === 'announcement' ? (
              <AppButton
                variant="secondary"
                onClick={() => {
                  localStorage.setItem(DISMISSED_KEY, '1')
                  setDismissed(true)
                }}
              >
                Напомнить позже
              </AppButton>
            ) : null}
          </div>
        </div>
      </div>
    </Notice>
  )
}

export default DomainMigrationBanner
