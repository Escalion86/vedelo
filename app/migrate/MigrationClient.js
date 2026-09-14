'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { syncPushSubscription } from '@helpers/pushClient'

const MigrationClient = () => {
  const [mode, setMode] = useState('loading')
  const [message, setMessage] = useState('Подготавливаем перенос…')
  const [installPrompt, setInstallPrompt] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
    }
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onInstallPrompt)
  }, [])

  useEffect(() => {
    const isLegacy = /(^|\.)artistcrm\.ru$/i.test(window.location.hostname)
    if (isLegacy) {
      setMode('legacy')
      setMessage('Старый кабинет переехал на vedelo.ru')
      return
    }

    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const code = fragment.get('code') || ''
    window.history.replaceState(null, '', '/migrate')
    if (!code) {
      setMode('install')
      setMessage('Ведело готово к работе')
      return
    }

    signIn('domain-migration', { code, redirect: false, callbackUrl: '/cabinet' })
      .then((result) => {
        if (result?.ok) {
          setMode('install')
          setMessage('Вход перенесён. Установите новое приложение.')
        } else {
          setMode('error')
          setMessage('Код истёк или уже использован. Войдите на vedelo.ru.')
        }
      })
      .catch(() => {
        setMode('error')
        setMessage('Не удалось перенести вход. Войдите на vedelo.ru.')
      })
  }, [])

  const beginFromLegacy = async () => {
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker?.ready.catch(() => null)
      const subscription = await registration?.pushManager?.getSubscription().catch(() => null)
      const response = await fetch('/api/domain-migration/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ legacyPushEndpoint: subscription?.endpoint || '' }),
      })
      const result = await response.json().catch(() => ({}))
      if (response.status === 401) {
        window.location.assign('https://vedelo.ru/login?callbackUrl=%2Fmigrate')
        return
      }
      if (!response.ok || !result?.data?.url) throw new Error()
      window.location.assign(result.data.url)
    } catch (error) {
      setMessage('Не удалось начать перенос. Повторите позже.')
      setBusy(false)
    }
  }

  const enableNotifications = async () => {
    if (!('Notification' in window)) return
    setBusy(true)
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      await syncPushSubscription({ ensureLocalSubscription: true }).catch(() => null)
    }
    setBusy(false)
  }

  const install = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice.catch(() => null)
    setInstallPrompt(null)
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f7efe1] px-4 py-10 text-[#2f2a24]">
      <section className="w-full max-w-lg rounded-3xl border border-[#d8bf9d] bg-[#fffaf2] p-7 shadow-xl">
        <Image src="/brand/vedelo-wordmark.svg" alt="Ведело" width={560} height={176} priority className="h-auto w-56 max-w-full" />
        <p className="mt-6 text-xs font-semibold tracking-[0.16em] text-[#916021] uppercase">Ведело — ранее ArtistCRM</p>
        <h1 className="mt-2 text-3xl font-semibold">{message}</h1>
        <p className="mt-3 text-sm leading-6 text-[#675b4e]">
          Все клиенты, заявки, оплаты и тариф сохранены. Старую иконку ArtistCRM нужно удалить вручную после установки Ведело.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          {mode === 'legacy' ? (
            <button type="button" className="min-h-12 cursor-pointer rounded-xl bg-[#a56f2a] px-5 font-semibold text-white" onClick={beginFromLegacy} disabled={busy}>
              {busy ? 'Подготавливаем…' : 'Перейти и сохранить вход'}
            </button>
          ) : null}
          {mode === 'install' ? (
            <>
              {installPrompt ? (
                <button type="button" className="min-h-12 cursor-pointer rounded-xl bg-[#a56f2a] px-5 font-semibold text-white" onClick={install}>Установить Ведело</button>
              ) : (
                <div className="rounded-xl bg-[#efe3d1] p-4 text-sm leading-5">
                  <strong>Как установить:</strong> откройте меню браузера и выберите «Установить приложение». На iPhone: «Поделиться» → «На экран Домой».
                </div>
              )}
              <button type="button" className="min-h-12 cursor-pointer rounded-xl border border-[#b58a55] px-5 font-semibold" onClick={enableNotifications} disabled={busy}>Включить уведомления</button>
              <Link href="/cabinet" className="flex min-h-12 items-center justify-center rounded-xl border border-[#b58a55] px-5 font-semibold">Открыть кабинет</Link>
            </>
          ) : null}
          {mode === 'error' ? <Link href="/login?callbackUrl=%2Fmigrate" className="flex min-h-12 items-center justify-center rounded-xl bg-[#a56f2a] px-5 font-semibold text-white">Войти в Ведело</Link> : null}
        </div>
      </section>
    </main>
  )
}

export default MigrationClient
