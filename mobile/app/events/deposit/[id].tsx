import { useEffect, useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useQueryClient } from '@tanstack/react-query'
import { useCachedEntities } from '../../../src/shared/hooks/useCachedEntities'
import type { Event, Transaction } from '../../../src/shared/domain/types'
import { Button, CompactField, EmptyState, Notice, PageHeader, Screen, Surface } from '../../../src/shared/ui/components'
import { receiveDeposit, type DepositPayment } from '../../../src/features/events/receiveDeposit'

export default function DepositScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const events = useCachedEntities<Event>('events'), transactions = useCachedEntities<Transaction>('transactions')
  const event = events.data?.find(item => item._id === id)
  const existing = transactions.data?.find(item => item.eventId === id && item.type === 'income' && item.paymentMethod !== 'obligation' && ['deposit', 'advance'].includes(item.category || '') && item.amount > 0)
  const [amount, setAmount] = useState(''), [method, setMethod] = useState<DepositPayment['paymentMethod']>('transfer')
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false)
  const [attempt, setAttempt] = useState<DepositPayment | null>(null)
  const initialized = useRef(false), lock = useRef(false), alive = useRef(true)
  const queryClient = useQueryClient()
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    if (event && !initialized.current && !transactions.isPending) {
      initialized.current = true; setAmount(String(existing?.amount || event.depositExpectedAmount || ''))
      if (existing?.paymentMethod && existing.paymentMethod !== 'obligation') setMethod(existing.paymentMethod)
    }
  }, [event, existing, transactions.isPending])
  const submit = async () => {
    if (lock.current) return
    const payment = attempt || { amount: Number(amount.replace(',', '.')), paymentMethod: method }
    if (!Number.isFinite(payment.amount) || payment.amount <= 0) { setError('Укажите сумму больше нуля.'); return }
    lock.current = true; setBusy(true); setError(''); setAttempt(payment)
    try {
      await receiveDeposit(id, payment)
      await queryClient.invalidateQueries({ queryKey: ['cached-entities'] })
      if (alive.current) setDone(true)
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Не удалось подтвердить оплату. Повторите ту же попытку.') }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  return <Screen><PageHeader title="Задаток получен" />
    {error ? <Notice tone="danger" message={error} /> : null}
    {done ? <><Notice tone="success" message="Задаток записан. Заявка подтверждена, если ожидала подтверждения." /><Button title="Открыть запись" onPress={() => router.replace(`/events/${id}` as never)} /></>
      : !event ? <EmptyState title={events.isPending ? 'Загрузка…' : 'Запись недоступна'} /> : <Surface>
        {event.status === 'draft' ? <Notice message="Получение задатка подтвердит заявку. Дата работы должна быть указана." /> : null}
        <CompactField label="Сумма, ₽" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!busy && !attempt} />
        {([['transfer', 'Перевод'], ['account', 'Расчётный счёт'], ['cash', 'Наличные'], ['barter', 'Бартер']] as const).map(([value, label]) => <Button key={value} title={`${method === value ? '✓ ' : ''}${label}`} variant="secondary" disabled={busy || Boolean(attempt)} onPress={() => setMethod(value)} />)}
        {attempt ? <Notice message="Сумма и способ сохранены для повторной попытки. Повтор не создаст второй платёж." /> : null}
        <Button title={attempt ? 'Повторить ту же попытку' : 'Подтвердить получение'} disabled={busy} onPress={() => void submit()} />
      </Surface>}
  </Screen>
}
