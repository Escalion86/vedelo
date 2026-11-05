import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons/faChevronLeft'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import AppButton from '@components/AppButton'
import Notice from '@components/Notice'
import {
  buildMonthDays,
  MONTHS_FULL,
  WEEKDAY_LABELS,
} from '@helpers/transactionDateRange'
import { moveDateToSelectedDay } from '@helpers/upcomingEventsOverview'
import { dateKey } from '@helpers/webPeriodRange.mjs'
import styles from '@components/PeriodPicker.module.css'

const openAttentionTaskDateModal = ({ modalsFunc, date, onConfirm }) => {
  if (!modalsFunc?.add) return
  const parsed = date ? new Date(date) : null
  const initialDate =
    parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date()

  const TaskDateModal = ({ setOnConfirmFunc, closeModal }) => {
    const [selected, setSelected] = useState(initialDate)
    const [cursor, setCursor] = useState(
      () => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1, 12)
    )
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
        <div className={styles.nav}>
          <AppButton
            variant="ghost"
            className={styles.iconButton}
            aria-label="Предыдущий месяц"
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1, 12)
              )
            }
          >
            <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
          </AppButton>
          <span aria-live="polite">
            {MONTHS_FULL[cursor.getMonth()]} {cursor.getFullYear()}
          </span>
          <AppButton
            variant="ghost"
            className={styles.iconButton}
            aria-label="Следующий месяц"
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12)
              )
            }
          >
            <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
          </AppButton>
        </div>
        <div className={styles.week} aria-hidden="true">
          {WEEKDAY_LABELS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div
          className={styles.days}
          role="group"
          aria-label="Календарь переноса задачи"
        >
          {buildMonthDays(cursor).map((day, index) => {
            if (day === null) return <span key={`blank-${index}`} />
            const value = new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              day,
              12
            )
            const key = dateKey(value)
            const active = key === dateKey(selected)
            return (
              <button
                key={key}
                type="button"
                data-date={key}
                className={`${styles.day} ${active ? styles.edge : ''}`}
                aria-label={value.toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                aria-pressed={active}
                aria-current={key === dateKey(new Date()) ? 'date' : undefined}
                onClick={() => setSelected(value)}
              >
                {day}
              </button>
            )
          })}
        </div>
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
