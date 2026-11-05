import { useEffect, useState } from 'react'
import SingleDateCalendar from '@components/SingleDateCalendar'
import Notice from '@components/Notice'
import { dateKey } from '@helpers/webPeriodRange.mjs'

const openProposalExpiryDateModal = ({ modalsFunc, title, onConfirm, onClose }) => {
  // Поле срока отправляет YYYY-MM-DD (UTC). Первый день должен быть будущим
  // именно для этого контракта, независимо от часового пояса браузера.
  const next = new Date()
  next.setUTCDate(next.getUTCDate() + 1)
  const minimum = new Date(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 12)

  const ExpiryDateModal = ({ setOnConfirmFunc, closeModal }) => {
    const [selected, setSelected] = useState(minimum)
    const [error, setError] = useState('')
    useEffect(() => {
      setOnConfirmFunc(async () => {
        setError('')
        const validUntil = dateKey(selected)
        if (new Date(validUntil).getTime() <= Date.now()) {
          setError('Выберите будущую дату.')
          return
        }
        try {
          await onConfirm(validUntil)
          closeModal()
        } catch (error) {
          setError(error.message || 'Не удалось продлить срок. Попробуйте ещё раз.')
        }
      })
    }, [selected, setOnConfirmFunc, closeModal])

    return (
      <div className="mx-auto w-full max-w-sm">
        <p className="card-title mb-3 break-words text-sm">{title}</p>
        <SingleDateCalendar
          value={selected}
          onChange={setSelected}
          minDate={minimum}
          label="Новый срок действия КП"
          autoFocus
        />
        <p className="card-muted mt-3 text-sm" role="status">
          Действует до: {selected.toLocaleDateString('ru-RU')}
        </p>
        {error ? (
          <Notice tone="error" role="alert" className="mt-2">{error}</Notice>
        ) : null}
      </div>
    )
  }

  modalsFunc.add({
    title: 'Продлить срок КП',
    confirmButtonName: 'Продлить',
    confirmButtonPendingName: 'Продлеваем…',
    closeButtonName: 'Отмена',
    declineButtonBgClassName: 'bg-transparent',
    onClose,
    Children: ExpiryDateModal,
  })
}

export default openProposalExpiryDateModal
