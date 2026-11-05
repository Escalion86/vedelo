import { useEffect, useState } from 'react'
import SingleDateCalendar from '@components/SingleDateCalendar'
import Notice from '@components/Notice'
import { moveDateToSelectedDay } from '@helpers/upcomingEventsOverview'

const openAttentionTaskDateModal = ({ modalsFunc, date, onConfirm }) => {
  if (!modalsFunc?.add) return
  const parsed = date ? new Date(date) : null
  const initialDate =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()

  const TaskDateModal = ({ setOnConfirmFunc, closeModal }) => {
    const [selected, setSelected] = useState(initialDate)
    const [error, setError] = useState('')
    useEffect(() => {
      setOnConfirmFunc(async () => {
        setError('')
        try {
          await onConfirm(moveDateToSelectedDay(initialDate, selected))
          closeModal()
        } catch {
          setError('Не удалось перенести задачу. Попробуйте ещё раз.')
        }
      })
    }, [selected, setOnConfirmFunc, closeModal])

    return (
      <div className="mx-auto w-full max-w-sm">
        <SingleDateCalendar
          value={selected}
          onChange={setSelected}
          label="Календарь переноса задачи"
        />
        <p className="card-muted mt-3 text-sm" role="status">
          {selected.toLocaleDateString('ru-RU')} · Время задачи:{' '}
          {initialDate.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        {error ? (
          <Notice tone="error" role="alert" className="mt-2">
            {error}
          </Notice>
        ) : null}
      </div>
    )
  }

  modalsFunc.add({
    title: 'Перенести задачу',
    confirmButtonName: 'Перенести',
    confirmButtonPendingName: 'Переносим…',
    closeButtonName: 'Отмена',
    declineButtonBgClassName: 'bg-transparent',
    Children: TaskDateModal,
  })
}

export default openAttentionTaskDateModal
