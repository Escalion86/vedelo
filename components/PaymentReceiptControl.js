'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import AppButton from '@components/AppButton'
import Input from '@components/Input'
import { apiJson } from '@helpers/apiClient'
import useSnackbar from '@helpers/useSnackbar'

const PaymentReceiptControl = ({ item, userId, canEdit = false }) => {
  const queryClient = useQueryClient()
  const snackbar = useSnackbar()
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(item.receiptUrl || '')
  const [saving, setSaving] = useState(false)

  const cancel = () => {
    setUrl(item.receiptUrl || '')
    setEditing(false)
  }
  const save = async (nextUrl = url) => {
    setSaving(true)
    try {
      await apiJson(`/api/billing/receipts/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ userId, receiptUrl: nextUrl }),
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['paymentHistory'] }),
        queryClient.invalidateQueries({ queryKey: ['paymentOperations'] }),
        queryClient.invalidateQueries({
          queryKey: ['missingPaymentReceiptsCount'],
        }),
      ])
      setEditing(false)
      snackbar.success(
        nextUrl ? 'Ссылка на чек сохранена' : 'Ссылка на чек удалена'
      )
    } catch (error) {
      snackbar.error(error.message || 'Не удалось сохранить ссылку на чек')
    } finally {
      setSaving(false)
    }
  }

  if (!item.receiptUrl && !canEdit) return null

  return (
    <div className="mt-2 flex min-w-0 flex-col items-start gap-2">
      {item.receiptUrl ? (
        <a
          href={item.receiptUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer text-sm font-semibold text-[var(--ui-primary)] underline underline-offset-2 hover:opacity-75"
        >
          Открыть чек
        </a>
      ) : null}
      {canEdit && !editing ? (
        <AppButton
          variant="ghost"
          size="sm"
          onClick={() => {
            setUrl(item.receiptUrl || '')
            setEditing(true)
          }}
        >
          {item.receiptUrl
            ? 'Изменить ссылку на чек'
            : 'Добавить ссылку на чек'}
        </AppButton>
      ) : null}
      {canEdit && editing ? (
        <div className="flex w-full max-w-md flex-col gap-2">
          <Input
            label="Ссылка на чек"
            type="url"
            value={url}
            onChange={setUrl}
            placeholder="https://..."
            maxLength={2048}
            fullWidth
            noMargin
          />
          <div className="flex flex-wrap gap-2">
            <AppButton
              size="sm"
              disabled={saving || !url.trim()}
              onClick={() => save()}
            >
              Сохранить
            </AppButton>
            {item.receiptUrl ? (
              <AppButton
                variant="secondary"
                size="sm"
                disabled={saving}
                onClick={() => save('')}
              >
                Удалить ссылку
              </AppButton>
            ) : null}
            <AppButton
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={cancel}
            >
              Отмена
            </AppButton>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default PaymentReceiptControl
