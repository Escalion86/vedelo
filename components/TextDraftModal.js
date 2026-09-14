'use client'

import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import Modal from '@components/Modal'
import AppButton from '@components/AppButton'
import useWorkItemTerminology from '@helpers/useWorkItemTerminology'

const MAX_TEXT_LENGTH = 12000

const TextDraftModal = ({ open, onClose, onDraft }) => {
  const terms = useWorkItemTerminology()
  const [text, setText] = useState('')
  const [processing, setProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleClose = useCallback(() => {
    if (processing) return
    setText('')
    setErrorMessage('')
    onClose()
  }, [onClose, processing])

  const handleSubmit = useCallback(async () => {
    const normalizedText = text.trim()
    if (!normalizedText) {
      setErrorMessage(`Вставьте описание ${terms.genitive}`)
      return
    }

    setProcessing(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/events/ai-draft', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: normalizedText }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || payload?.error) {
        throw new Error(payload?.error || 'Не удалось разобрать текст')
      }

      setText('')
      onDraft(
        payload?.fields ?? {},
        normalizedText,
        payload?.aiFilledFields ?? [],
        payload?.client ?? null,
        payload?.aiWarnings ?? []
      )
    } catch (error) {
      setErrorMessage(error?.message || 'Не удалось обработать заметку')
    } finally {
      setProcessing(false)
    }
  }, [onDraft, terms.genitive, text])

  const handleKeyDown = useCallback(
    (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Добавить из свободного текста"
      size="lg"
      disableBackdropClick={processing}
      footer={
        <>
          <AppButton
            variant="secondary"
            onClick={handleClose}
            disabled={processing}
          >
            Отмена
          </AppButton>
          <AppButton
            onClick={handleSubmit}
            disabled={processing || !text.trim()}
          >
            {processing ? 'ИИ разбирает текст…' : 'Распознать и заполнить'}
          </AppButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">
          Вставьте заметку о {terms.prepositional}. ИИ попробует определить дату, клиента,
          адрес, стоимость и другие данные, а затем откроет заполненную форму для
          проверки.
        </p>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            if (errorMessage) setErrorMessage('')
          }}
          onKeyDown={handleKeyDown}
          maxLength={MAX_TEXT_LENGTH}
          rows={10}
          disabled={processing}
          autoFocus
          placeholder="Например: 15 сентября свадьба, клиент Анна, начало в 18:00, Красноярск, ресторан Маяк. Гонорар 50 000 ₽, задаток 10 000 ₽."
          className="min-h-56 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-general focus:ring-2 focus:ring-general/20 disabled:cursor-wait disabled:bg-gray-50"
          aria-label={`Описание ${terms.genitive} свободным текстом`}
          aria-invalid={Boolean(errorMessage)}
        />
        <div className="flex items-start justify-between gap-3 text-xs">
          <div className="text-red-600" role="alert">
            {errorMessage}
          </div>
          <div className="ml-auto shrink-0 text-gray-400">
            {text.length} / {MAX_TEXT_LENGTH}
          </div>
        </div>
      </div>
    </Modal>
  )
}

TextDraftModal.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onDraft: PropTypes.func.isRequired,
}

export default TextDraftModal
