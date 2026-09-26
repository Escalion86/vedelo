'use client'

import { useEffect, useRef, useState } from 'react'
import ComboBox from '@components/ComboBox'
import Input from '@components/Input'
import Notice from '@components/Notice'
import {
  DOCUMENT_TYPE_OPTIONS,
  getDocumentDefaultTitle,
  getDocumentTitleAfterTypeChange,
} from '@helpers/documentTypes'
import { isReceiptPayment } from '@helpers/documentWorkflow'

export default function DocumentEditDialog({
  document,
  payments = [],
  onSave,
  closeModal,
  setOnConfirmFunc,
  setDisableConfirm,
}) {
  const [type, setType] = useState(document.type || 'other')
  const [title, setTitle] = useState(
    document.title ||
      getDocumentDefaultTitle(document.type, document.customTypeName)
  )
  const [customTypeName, setCustomTypeName] = useState(
    document.customTypeName || ''
  )
  const [url, setUrl] = useState(document.url || '')
  const [transactionId, setTransactionId] = useState(
    document.transactionId || ''
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const confirmRef = useRef(null)
  const inFlight = useRef(false)
  const paymentOptions = payments.filter(isReceiptPayment).map((item) => ({
    value: String(item._id),
    name: `${Number(item.amount).toLocaleString('ru-RU')} ₽ · ${new Date(item.date).toLocaleDateString('ru-RU')}${item.comment ? ` · ${item.comment}` : ''}`,
  }))

  useEffect(() => {
    confirmRef.current = async () => {
      if (inFlight.current) return
      inFlight.current = true
      setBusy(true)
      setError('')
      try {
        const nextTitle = title.trim()
        if (!nextTitle) throw new Error('Укажите название документа')
        let nextUrl = url.trim()
        if (document.url) {
          try {
            nextUrl = new URL(nextUrl).toString()
          } catch {
            throw new Error('Введите полную ссылку https://…')
          }
          if (!['https:', 'http:'].includes(new URL(nextUrl).protocol)) {
            throw new Error('Допустимы только ссылки HTTP/HTTPS')
          }
        }
        await onSave({
          type,
          title: nextTitle,
          customTypeName: type === 'other' ? customTypeName.trim() : '',
          url: nextUrl,
          transactionId: type === 'receipt' ? transactionId : '',
        })
        closeModal()
      } catch (reason) {
        setError(reason?.message || 'Не удалось изменить документ')
      } finally {
        setBusy(false)
        inFlight.current = false
      }
    }
  }, [
    type,
    title,
    customTypeName,
    url,
    transactionId,
    document.url,
    onSave,
    closeModal,
  ])

  useEffect(() => {
    setOnConfirmFunc(() => confirmRef.current?.())
  }, [setOnConfirmFunc])

  useEffect(() => {
    setDisableConfirm(busy)
  }, [busy, setDisableConfirm])

  return (
    <div className="document-edit-dialog flex flex-col gap-3">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <ComboBox
        label="Тип документа"
        items={DOCUMENT_TYPE_OPTIONS}
        value={type}
        onChange={(value) => {
          const nextType = value || 'other'
          setTitle((currentTitle) =>
            getDocumentTitleAfterTypeChange({
              title: currentTitle,
              previousType: type,
              nextType,
              previousCustomTypeName: customTypeName,
              nextCustomTypeName: customTypeName,
            })
          )
          setType(nextType)
          setError('')
        }}
        noMargin
        fullWidth
      />
      <Input
        label="Название"
        value={title}
        onChange={setTitle}
        noMargin
        fullWidth
      />
      {type === 'other' ? (
        <Input
          label="Название типа"
          value={customTypeName}
          onChange={(value) => {
            setTitle((currentTitle) =>
              getDocumentTitleAfterTypeChange({
                title: currentTitle,
                previousType: type,
                nextType: type,
                previousCustomTypeName: customTypeName,
                nextCustomTypeName: value,
              })
            )
            setCustomTypeName(value)
          }}
          noMargin
          fullWidth
        />
      ) : null}
      {document.url ? (
        <Input
          label="Ссылка"
          value={url}
          onChange={setUrl}
          noMargin
          fullWidth
        />
      ) : null}
      {type === 'receipt' && paymentOptions.length ? (
        <ComboBox
          label="К какой оплате относится чек"
          items={[
            { value: '', name: 'Без связи с оплатой' },
            ...paymentOptions,
          ]}
          value={transactionId}
          onChange={(value) => setTransactionId(value || '')}
          noMargin
          fullWidth
        />
      ) : null}
    </div>
  )
}
