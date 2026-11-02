import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { api } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { useAuth } from '../../shared/auth/AuthProvider'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'
import { Button, Field, Notice, SectionTitle, Surface } from '../../shared/ui/components'
import { formatRubles } from './format'

type Receipt = { alreadyUsed?: boolean; amount?: number; tariffId?: string; tariffTitle?: string }
export const PromoCodeRedeem = ({ onChanged }: { onChanged?: () => void } = {}) => {
  const { refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const lock = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const redeem = async () => {
    if (lock.current || !code.trim()) return
    const session = getAuthSessionEpoch(), current = () => alive.current && session === getAuthSessionEpoch()
    lock.current = true; setBusy(true); setError(''); setReceipt(null)
    try {
      const response = await api.post<{ success: boolean; data: Receipt }>('/promo-codes/redeem', { code: code.trim() })
      if (!response.success || !response.data) throw new Error('UNCONFIRMED')
      if (current()) setReceipt(response.data)
    } catch (reason) {
      if (current()) setError(reason instanceof ApiError && reason.status < 500 ? reason.message : 'Результат не подтверждён. Повторите тот же промокод для сверки: повторного начисления не будет.')
    } finally {
      if (current()) {
        // A lost response may still have credited the account.
        await Promise.allSettled([refreshUser(), queryClient.invalidateQueries({ queryKey: ['payment-history'] })])
        if (current()) { onChanged?.(); setBusy(false) }
      }
      lock.current = false
    }
  }
  return <Surface><SectionTitle>Промокод</SectionTitle>
    <Notice message="Каждый промокод можно использовать один раз на аккаунт." />
    <Field label="Введите промокод" value={code} maxLength={40} autoCapitalize="characters" autoCorrect={false} editable={!busy} onChangeText={value => { setCode(value); setError(''); setReceipt(null) }} />
    <Button title="Активировать промокод" disabled={busy || !code.trim()} loading={busy} onPress={() => void redeem()} />
    {error ? <Notice tone="danger" message={error} /> : null}
    {receipt ? <><Notice tone={receipt.alreadyUsed ? 'info' : 'success'} message={receipt.alreadyUsed ? 'Этот промокод уже использован. Повторного начисления нет.' : 'Промокод активирован.'} />
      {Number(receipt.amount) > 0 ? <Notice message={`Бонус на баланс: ${formatRubles(receipt.amount!)}`} /> : null}
      {receipt.tariffId ? <><Notice message={`Предоставлен доступ к тарифу «${receipt.tariffTitle || ''}». Подключите его в разделе выбора тарифа.`} /><Button title="Выбрать тариф" variant="secondary" onPress={() => router.push('/billing')} /></> : null}
    </> : null}
  </Surface>
}
