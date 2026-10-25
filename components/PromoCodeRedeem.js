'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import AppButton from './AppButton'
import Input from './Input'
import Notice from './Notice'
import LabeledContainer from './LabeledContainer'

export default function PromoCodeRedeem() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const lock = useRef(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const redeem = async (event) => {
    event.preventDefault()
    if (lock.current || !code.trim()) return
    lock.current = true
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await fetch('/api/promo-codes/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const body = await response.json()
      if (!response.ok || !body.success)
        throw new Error(body.error || 'Не удалось активировать промокод')
      setResult(body.data)
    } catch (err) {
      setError(
        err.message ||
          'Не удалось завершить активацию. Повторите тот же промокод'
      )
    } finally {
      // An interrupted response may still have credited the account.
      for (const key of [
        'loggedUser',
        'users',
        'tariffs',
        'paymentHistory',
        'paymentOperations',
      ])
        void queryClient.invalidateQueries({ queryKey: [key] })
      router.refresh()
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <LabeledContainer label="Промокод" noMargin>
      <form onSubmit={redeem} className="flex w-full max-w-xl flex-col gap-3">
        <p className="text-sm text-gray-600">
          Каждый промокод можно использовать один раз на аккаунт.
        </p>
        <Input
          ariaLabel="Введите промокод"
          label="Введите промокод"
          value={code}
          maxLength={40}
          disabled={busy}
          onChange={(value) => {
            setCode(value)
            setError('')
            setResult(null)
          }}
          noMargin
        />
        <div>
          <AppButton
            type="submit"
            disabled={busy || !code.trim()}
            aria-busy={busy}
          >
            {busy ? 'Активация…' : 'Активировать'}
          </AppButton>
        </div>
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        {result && (
          <Notice tone={result.alreadyUsed ? 'info' : 'success'} role="status">
            <p>
              {result.alreadyUsed
                ? 'Этот промокод уже использован. Повторного начисления нет.'
                : 'Промокод активирован.'}
            </p>
            {result.amount > 0 && (
              <p>Бонус на баланс: {result.amount.toLocaleString('ru-RU')} ₽.</p>
            )}
            {result.tariffId && (
              <p>
                Предоставлен доступ к тарифу «{result.tariffTitle}». Подключите
                его в разделе «Выбор тарифа».
              </p>
            )}
            {result.tariffId && (
              <AppButton
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => router.push('/cabinet/tariff-select')}
              >
                Выбрать тариф
              </AppButton>
            )}
          </Notice>
        )}
      </form>
    </LabeledContainer>
  )
}
