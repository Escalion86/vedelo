'use client'

import { useEffect, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import Link from 'next/link'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'

const returnUrl = encodeURIComponent('/auth/yandex/complete')

export default function YandexComplete({ signedIn, phone, initialError = '' }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (initialError) return
    let active = true
    fetch('/api/yandex-id/complete', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось проверить подключение')
        if (active) setData(result)
      }).catch((cause) => { if (active) setError(cause.message) })
    return () => { active = false }
  }, [initialError])
  const complete = async (action) => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/yandex-id/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Не удалось завершить вход')
      const login = await signIn('yandex', { token: result.token, redirect: false })
      if (!login || login.error) throw new Error('Не удалось войти. Начните вход через Яндекс заново.')
      window.location.replace('/cabinet')
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Вход через Яндекс ID</h1>
      {error && <Notice tone="error" role="alert">{error}</Notice>}
      {!data && !error && <p role="status">Проверяем подключение…</p>}
      {data?.phone && <p>Номер из Яндекс ID: +{data.phone}</p>}
      {data?.linked ? (
        <>
          <p>Аккаунт с этим номером уже подключён к Яндекс ID. Продолжите вход в кабинет.</p>
          <AppButton disabled={busy} aria-busy={busy} onClick={() => complete('login')}>
            {busy ? 'Входим…' : 'Войти в кабинет'}
          </AppButton>
        </>
      ) : data ? signedIn ? (
        String(phone) !== data.phone ? (
          <>
            <Notice tone="error">В текущем аккаунте другой номер: {phone}. Для подключения войдите или зарегистрируйтесь с номером +{data.phone}.</Notice>
            <AppButton onClick={() => signOut({ callbackUrl: `/login?mode=${data.accountExists ? 'login' : 'register'}&callbackUrl=${returnUrl}` })}>Войти с номером Яндекса</AppButton>
          </>
        ) : (
        <>
          <Notice tone="info">Подключить этот Яндекс ID к вашему аккаунту с телефоном {phone}? После подключения вы сможете входить через Яндекс.</Notice>
          <AppButton disabled={busy} aria-busy={busy} onClick={() => complete('link')}>
            {busy ? 'Подключаем…' : 'Подключить Яндекс ID'}
          </AppButton>
        </>
        )
      ) : (
        <>
          <Notice tone="info">{data.accountExists ? 'Аккаунт с этим номером уже существует. Подтвердите доступ обычным входом.' : 'Зарегистрируйтесь с номером из Яндекс ID: подтвердите телефон, задайте пароль и примите соглашения.'} После этого вы вернётесь сюда для подключения Яндекса.</Notice>
          <Link className="ui-btn ui-btn-primary px-4 py-2 text-center" href={`/login?callbackUrl=${returnUrl}`}>Войти в существующий аккаунт</Link>
          {!data.accountExists && <Link className="ui-btn ui-btn-secondary px-4 py-2 text-center" href={`/login?mode=register&callbackUrl=${returnUrl}${data.referrerId ? `&ref=${encodeURIComponent(data.referrerId)}` : ''}`}>Зарегистрироваться через Яндекс</Link>}
          <p className="text-sm">Если забыли пароль, воспользуйтесь восстановлением на странице входа. Подключение ожидает подтверждения 15 минут.</p>
        </>
      ) : null}
      <Link className="underline" href="/login">Вернуться ко входу</Link>
    </main>
  )
}
