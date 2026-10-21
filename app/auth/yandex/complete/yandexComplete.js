'use client'

import { useEffect, useState } from 'react'
import { signIn, signOut } from 'next-auth/react'
import Link from 'next/link'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'

const returnUrl = encodeURIComponent('/auth/yandex/complete')

export default function YandexComplete({ signedIn, initialError = '' }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(initialError)
  useEffect(() => {
    if (initialError) return
    let active = true
    const finishLogin = async () => {
      try {
        const response = await fetch('/api/yandex-id/complete', { cache: 'no-store' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Не удалось проверить подключение')
        if (!active) return
        setData(result)
        if (!result.accountExists) return
        // Only the live effect starts a mutation (including React Strict Mode).
        // The browser never supplies the phone or target account to the server.
        const completed = await fetch('/api/yandex-id/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'login' }),
        })
        const ticket = await completed.json()
        if (!completed.ok) throw new Error(ticket.error || 'Не удалось завершить вход')
        const login = await signIn('yandex', { token: ticket.token, redirect: false })
        if (!login || login.error) throw new Error('Не удалось войти. Начните вход через Яндекс заново.')
        window.location.replace('/cabinet')
      } catch (cause) {
        if (active) setError(cause.message)
      }
    }
    void finishLogin()
    return () => { active = false }
  }, [initialError])
  const registerUrl = `/login?mode=register&callbackUrl=${returnUrl}${data?.referrerId ? `&ref=${encodeURIComponent(data.referrerId)}` : ''}`
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Вход через Яндекс ID</h1>
      {error ? <Notice tone="error" role="alert">{error}</Notice> : (
        !data || data.accountExists ? <p role="status">Входим в кабинет…</p> : (
          <>
            <p>Номер из Яндекс ID: +{data.phone}</p>
            <Notice tone="info">С этим номером ещё нет аккаунта. Подтвердите телефон, задайте пароль и примите соглашения. После регистрации вход через Яндекс завершится автоматически.</Notice>
            {signedIn ? (
              <AppButton onClick={() => signOut({ callbackUrl: registerUrl })}>Перейти к регистрации с номером Яндекса</AppButton>
            ) : (
              <Link className="ui-btn ui-btn-primary px-4 py-2 text-center" href={registerUrl}>Зарегистрироваться через Яндекс</Link>
            )}
            <p className="text-sm">На завершение регистрации есть 15 минут. Если время истекло, начните вход через Яндекс заново.</p>
          </>
        )
      )}
      <Link className="underline" href="/login">Вернуться ко входу</Link>
    </main>
  )
}
