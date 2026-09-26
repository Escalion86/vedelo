'use client'

import { useEffect, useRef, useState } from 'react'
import ComboBox from '@components/ComboBox'
import Notice from '@components/Notice'
import { isReceiptPayment } from '@helpers/documentWorkflow'
import { apiJson } from '@helpers/apiClient'

export default function ReceiptPaymentDialog({
  document,
  eventId,
  payments,
  onSaved,
  closeModal,
  setOnConfirmFunc,
  setDisableConfirm,
}) {
  const [transactionId, setTransactionId] = useState(
    document.transactionId || ''
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = useRef(null)
  const inFlight = useRef(false)
  useEffect(() => {
    confirm.current = async () => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy(true)
      setError('')
      try {
        const result = await apiJson(`/api/events/${eventId}/documents`, {
          method: 'PATCH',
          body: JSON.stringify({ documentId: document.id, transactionId }),
        })
        await onSaved(result.data)
        closeModal()
      } catch (reason) {
        setError(reason.message)
      } finally {
        setBusy(false)
        inFlight.current = false
      }
    }
  }, [transactionId, document.id, eventId, onSaved, closeModal])
  useEffect(() => {
    setOnConfirmFunc(() => confirm.current?.())
  }, [setOnConfirmFunc])
  useEffect(() => {
    setDisableConfirm(busy)
  }, [busy, setDisableConfirm])
  return (
    <div className="space-y-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <ComboBox
        label="Оплата"
        value={transactionId}
        onChange={(value) => setTransactionId(value || '')}
        items={[
          { value: '', name: 'Без связи с оплатой' },
          ...payments
            .filter(isReceiptPayment)
            .map((item) => ({
              value: String(item._id),
              name: `${Number(item.amount).toLocaleString('ru-RU')} ₽ · ${new Date(item.date).toLocaleDateString('ru-RU')}`,
            })),
        ]}
        noMargin
        fullWidth
      />
    </div>
  )
}
