'use client'

import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronLeft } from '@fortawesome/free-solid-svg-icons/faChevronLeft'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import AppButton from '@components/AppButton'
import {
  buildMonthDays,
  MONTHS_FULL,
  WEEKDAY_LABELS,
} from '@helpers/transactionDateRange'
import { dateKey } from '@helpers/webPeriodRange.mjs'
import styles from '@components/PeriodPicker.module.css'

export default function SingleDateCalendar({
  value,
  onChange,
  minDate,
  label = 'Календарь выбора даты',
  autoFocus = false,
}) {
  const [cursor, setCursor] = useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1, 12)
  )
  const minimum = minDate ? dateKey(minDate) : ''
  const previousMonthUnavailable =
    minDate && cursor <= new Date(minDate.getFullYear(), minDate.getMonth(), 1, 12)

  return (
    <>
      <div className={styles.nav}>
        <AppButton
          variant="ghost"
          className={styles.iconButton}
          aria-label="Предыдущий месяц"
          disabled={Boolean(previousMonthUnavailable)}
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1, 12))}
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
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1, 12))}
        >
          <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
        </AppButton>
      </div>
      <div className={styles.week} aria-hidden="true">
        {WEEKDAY_LABELS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className={styles.days} role="group" aria-label={label}>
        {buildMonthDays(cursor).map((day, index) => {
          if (day === null) return <span key={`blank-${index}`} />
          const date = new Date(cursor.getFullYear(), cursor.getMonth(), day, 12)
          const key = dateKey(date)
          const active = key === dateKey(value)
          return (
            <button
              key={key}
              type="button"
              data-date={key}
              className={`${styles.day} ${active ? styles.edge : ''}`}
              aria-label={date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              aria-pressed={active}
              aria-current={key === dateKey(new Date()) ? 'date' : undefined}
              disabled={Boolean(minimum && key < minimum)}
              autoFocus={autoFocus && active}
              onClick={() => onChange(date)}
            >
              {day}
            </button>
          )
        })}
      </div>
    </>
  )
}
