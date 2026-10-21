import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSetAtom } from 'jotai'
import Input from '@components/Input'
import ComboBox from '@components/ComboBox'
import Notice from '@components/Notice'
import FormWrapper from '@components/FormWrapper'
import { TRANSACTION_PAYMENT_METHODS } from '@helpers/constants'
import { apiJson } from '@helpers/apiClient'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'
import transactionsAtom from '@state/atoms/transactionsAtom'
import eventsAtom from '@state/atoms/eventsAtom'
import { queryKeys } from '@helpers/queryKeys'

const methods = TRANSACTION_PAYMENT_METHODS.filter(
  (item) => item.value !== 'obligation'
)
const upsert = (items = [], value) => [
  ...items.filter((item) => String(item._id) !== String(value._id)),
  value,
]

export const ReceiveDepositForm = ({
  event,
  closeModal,
  setOnConfirmFunc,
  setDisableConfirm,
  setOnShowOnCloseConfirmDialog,
}) => {
  const terms = useWorkItemTerminology()
  const queryClient = useQueryClient()
  const setTransactions = useSetAtom(transactionsAtom)
  const setEvents = useSetAtom(eventsAtom)
  const [amount, setAmount] = useState(event.depositExpectedAmount ?? '')
  const [paymentMethod, setPaymentMethod] = useState('transfer')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const missingDate = event.status === 'draft' && !event.eventDate
  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0

  useEffect(() => {
    setDisableConfirm(saving || !validAmount || missingDate)
    setOnShowOnCloseConfirmDialog(
      amount !== (event.depositExpectedAmount ?? '') ||
        paymentMethod !== 'transfer'
    )
  }, [
    amount,
    event.depositExpectedAmount,
    missingDate,
    paymentMethod,
    saving,
    setDisableConfirm,
    setOnShowOnCloseConfirmDialog,
    validAmount,
  ])

  useEffect(() => {
    setOnConfirmFunc(async () => {
      if (busy.current || !validAmount || missingDate) return
      busy.current = true
      setSaving(true)
      setError('')
      try {
        const result = await apiJson(`/api/events/${event._id}/deposit`, {
          method: 'POST',
          body: JSON.stringify({ amount: Number(amount), paymentMethod }),
        })
        queryClient.setQueryData(queryKeys.transactionsAll, (items) =>
          upsert(items, result.data)
        )
        setTransactions((items) => upsert(items, result.data))
        setEvents((items) => upsert(items, result.event))
        queryClient.setQueryData(queryKeys.event(event._id), result.event)
        queryClient.setQueriesData({ queryKey: ['events'] }, (previous) =>
          previous?.data
            ? { ...previous, data: upsert(previous.data, result.event) }
            : previous
        )
        closeModal()
      } catch (requestError) {
        setError(
          requestError?.message ||
            'Не удалось записать задаток. Повторите подтверждение'
        )
      } finally {
        await Promise.all(
          [
            'events',
            'event',
            'transactions',
            'statistics',
            'clientRelations',
          ].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
        )
        busy.current = false
        setSaving(false)
      }
    })
  }, [
    amount,
    closeModal,
    event._id,
    missingDate,
    paymentMethod,
    queryClient,
    setEvents,
    setOnConfirmFunc,
    setTransactions,
    validAmount,
  ])

  return (
    <FormWrapper>
      {event.status === 'draft' ? (
        <Notice tone="info">
          После подтверждения {terms.label} перейдёт из заявки в статус
          «Подтверждено».
        </Notice>
      ) : null}
      {missingDate ? (
        <Notice tone="warning">
          Сначала укажите дату {terms.genitive} в редакторе заявки.
        </Notice>
      ) : null}
      <Input
        label="Сумма задатка"
        type="number"
        min={0}
        decimalScale={2}
        postfix="₽"
        value={amount}
        onChange={setAmount}
        disabled={saving}
        error={!validAmount ? 'Укажите сумму больше нуля' : undefined}
      />
      <ComboBox
        label="Способ получения задатка"
        items={methods}
        value={paymentMethod}
        onChange={setPaymentMethod}
        disabled={saving}
        fullWidth
      />
      {error ? (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
    </FormWrapper>
  )
}

const receiveDepositFunc = (event) => ({
  title: 'Задаток получен',
  confirmButtonName: 'Подтвердить',
  declineButtonBgClassName: 'secondary',
  Children: (props) => <ReceiveDepositForm {...props} event={event} />,
})

export default receiveDepositFunc
