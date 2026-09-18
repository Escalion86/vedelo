import { useRef, useState } from 'react'
import AppButton from '@components/AppButton'
import InputWrapper from '@components/InputWrapper'
import NativeSelect from '@components/NativeSelect'
import Input from '@components/Input'
import Notice from '@components/Notice'
import { apiJson } from '@helpers/apiClient'
import { formatMoney } from '@helpers/formatMoney'

const localDateTime = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}

const ManualBalanceChargeForm = ({ userId, balance, onSuccess, onCancel }) => {
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(localDateTime)
  const [comment, setComment] = useState('')
  const [purpose, setPurpose] = useState('tariff')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const request = useRef(null)
  const inFlight = useRef(false)

  const submit = async (event) => {
    event.preventDefault()
    if (inFlight.current) return
    const date = new Date(paidAt)
    if (!Number.isFinite(date.getTime()) || date > new Date()) {
      setError('Укажите дату не позднее текущего времени')
      return
    }
    const values = {
      userId,
      amount: Number(amount),
      paidAt: date.toISOString(),
      comment: comment.trim(),
      purpose,
    }
    const fingerprint = JSON.stringify(values)
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, idempotenceKey: crypto.randomUUID() }
    inFlight.current = true
    setSaving(true)
    setError('')
    try {
      const result = await apiJson('/api/payments/charge', {
        method: 'POST',
        body: JSON.stringify({
          ...values,
          idempotenceKey: request.current.idempotenceKey,
        }),
      })
      onSuccess(result.data.user)
    } catch (err) {
      setError(err.message || 'Не удалось выполнить списание')
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="ui-surface-card grid gap-3 rounded-xl p-4"
    >
      <div className="font-semibold text-gray-900">Ручное списание</div>
      <Notice tone="info">
        Деньги будут списаны сейчас. Дата указывает период корректировки в
        истории. Срок тарифа и дата следующего автосписания не изменятся.
      </Notice>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          label="Сумма списания (руб.)"
          type="number"
          value={amount}
          onChange={setAmount}
          min={0.01}
          max={100000000}
          step={0.01}
          decimalScale={2}
          required
          disabled={saving}
        />
        <Input
          label="Дата списания"
          type="datetime-local"
          value={paidAt}
          onChange={setPaidAt}
          max={localDateTime()}
          required
          disabled={saving}
        />
      </div>
      <InputWrapper label="Вид списания">
        <NativeSelect
          aria-label="Вид списания"
          className="min-h-8 w-full cursor-pointer bg-transparent text-sm"
          wrapperClassName="w-full"
          value={purpose}
          disabled={saving}
          onChange={(event) => setPurpose(event.target.value)}
        >
          <option value="tariff">За тариф</option>
          <option value="balance">Другая причина</option>
        </NativeSelect>
      </InputWrapper>
      <Input
        label="Причина списания"
        value={comment}
        onChange={setComment}
        maxLength={240}
        placeholder="Например: тариф за август 2026 года"
        required
        disabled={saving}
      />
      {Number(amount) > 0 ? (
        <div className="text-sm text-gray-600">
          Баланс после списания: {formatMoney(balance - Number(amount))}
        </div>
      ) : null}
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      {Number(amount) > balance ? (
        <Notice tone="warning">
          Недостаточно средств. Сумма списания не должна превышать баланс.
        </Notice>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <AppButton variant="secondary" onClick={onCancel} disabled={saving}>
          Отмена
        </AppButton>
        <AppButton
          type="submit"
          variant="danger"
          disabled={
            saving ||
            !(Number(amount) > 0) ||
            Number(amount) > balance ||
            !comment.trim()
          }
        >
          {saving ? 'Списание...' : 'Списать с баланса'}
        </AppButton>
      </div>
    </form>
  )
}

export default ManualBalanceChargeForm
