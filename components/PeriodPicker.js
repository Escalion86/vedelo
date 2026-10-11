'use client'

import { useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import cn from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCalendarDays,
  faChevronDown,
  faRotateLeft,
} from '@fortawesome/free-solid-svg-icons'
import InputWrapper from './InputWrapper'
import AppButton from './AppButton'
import Notice from './Notice'
import {
  buildMonthDays,
  MONTHS_FULL,
  WEEKDAY_LABELS,
} from '@helpers/transactionDateRange'
import {
  EMPTY_PERIOD,
  dateKey,
  manualDate,
  parseDateKey,
  parseManualDate,
  periodPresets,
  rangeError,
  rangeSummary,
  compactRangeSummary,
} from '@helpers/webPeriodRange.mjs'
import styles from './PeriodPicker.module.css'

const sameRange = (a, b) =>
  (a?.from || '') === (b?.from || '') && (a?.to || '') === (b?.to || '')
const cursorFor = (range, today) => {
  const key = [range?.from, range?.to, today].find((v) => parseDateKey(v))
  const [year, month] = key.split('-').map(Number)
  const d = new Date(0)
  d.setFullYear(year, month - 1, 1)
  d.setHours(12, 0, 0, 0)
  return d
}

export default function PeriodPicker({
  value = EMPTY_PERIOD,
  onChange,
  label = 'Период',
  disabled = false,
  requiredRange = false,
  resetValue = EMPTY_PERIOD,
  minDate,
  maxDate,
  maxDays,
  timeZone = 'local',
  extraPresets = [],
  activeDateKeys,
  className,
}) {
  const id = useId()
  const trigger = useRef(null)
  const dialog = useRef(null)
  const heading = useRef(null)
  const firstInput = useRef(null)
  const [open, setOpen] = useState(false)
  const [stage, setStage] = useState('presets')
  const [draft, setDraft] = useState(value)
  const [text, setText] = useState({
    from: manualDate(value.from),
    to: manualDate(value.to),
  })
  const [cursor, setCursor] = useState(() =>
    cursorFor(value, dateKey(new Date(), timeZone))
  )
  const [choosingEnd, setChoosingEnd] = useState(false)
  const today = dateKey(new Date(), timeZone)
  const constraints = { requiredRange, minDate, maxDate, maxDays }
  const presets = periodPresets({ today, requiredRange, maxDate, extraPresets })
  const summary = rangeSummary(value)
  const selectedPreset = presets.find((p) => sameRange(value, p.range))
  const candidate =
    stage === 'manual'
      ? { from: parseManualDate(text.from), to: parseManualDate(text.to) }
      : draft
  const error = rangeError(candidate, constraints)
  const close = () => setOpen(false)
  const changeStage = (next) => {
    if (next === 'manual')
      setText({ from: manualDate(draft.from), to: manualDate(draft.to) })
    if (stage === 'manual' && !error) setDraft(candidate)
    setStage(next)
  }

  useLayoutEffect(() => {
    if (!open) return undefined
    const node = dialog.current
    const opener = trigger.current
    node.showModal()
    const old = [document.documentElement, document.body].map((el) => ({
      el,
      overflow: el.style.getPropertyValue('overflow'),
      priority: el.style.getPropertyPriority('overflow'),
    }))
    old.forEach(({ el }) => el.style.setProperty('overflow', 'hidden'))
    return () => {
      node.close()
      old.forEach(({ el, overflow, priority }) =>
        overflow
          ? el.style.setProperty('overflow', overflow, priority)
          : el.style.removeProperty('overflow')
      )
      opener?.focus({ preventScroll: true })
    }
  }, [open])
  useLayoutEffect(() => {
    if (!open) return
    if (stage === 'manual') firstInput.current?.focus({ preventScroll: true })
    else heading.current?.focus({ preventScroll: true })
  }, [open, stage])

  const apply = (next) => {
    if (disabled || rangeError(next, constraints)) return
    onChange?.({ ...next })
    close()
  }
  const selectDay = (key) => {
    if (!choosingEnd || !draft.from) {
      setDraft({ from: key, to: key })
      setChoosingEnd(true)
    } else {
      setDraft(
        key < draft.from
          ? { from: key, to: draft.from }
          : { from: draft.from, to: key }
      )
      setChoosingEnd(false)
    }
  }
  const modal = open ? (
    <dialog
      ref={dialog}
      id={id}
      className={styles.dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(e) => {
        e.preventDefault()
        e.stopPropagation()
        close()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          close()
        }
        if (e.key === 'Tab') {
          const nodes = Array.from(
            dialog.current.querySelectorAll(
              'button:not(:disabled),input:not(:disabled)'
            )
          )
          const first = nodes[0],
            last = nodes[nodes.length - 1]
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === heading.current)
          ) {
            e.preventDefault()
            last?.focus()
          }
          if (
            !e.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === heading.current)
          ) {
            e.preventDefault()
            first?.focus()
          }
        }
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return
        const r = e.currentTarget.getBoundingClientRect()
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          close()
      }}
    >
      <div className={styles.shell}>
        <header className={styles.header}>
          {stage !== 'presets' ? (
            <AppButton
              variant="ghost"
              className={styles.iconButton}
              aria-label="Назад к готовым периодам"
              onClick={() => changeStage('presets')}
            >
              ←
            </AppButton>
          ) : null}
          <h2 ref={heading} tabIndex={-1} id={`${id}-title`}>
            {stage === 'presets'
              ? 'Выберите период'
              : stage === 'manual'
                ? 'Введите даты'
                : 'Выберите даты'}
          </h2>
          <AppButton
            variant="ghost"
            className={styles.iconButton}
            aria-label="Закрыть выбор периода"
            onClick={close}
          >
            ×
          </AppButton>
        </header>
        <div className={styles.body}>
          {stage === 'presets' ? (
            <div className={styles.presets} aria-label="Готовые периоды">
              {presets.map((p) => (
                <AppButton
                  key={p.id}
                  variant="ghost"
                  className={styles.preset}
                  title={rangeSummary(p.range)}
                  aria-label={`${p.label}: ${rangeSummary(p.range)}`}
                  aria-pressed={sameRange(value, p.range)}
                  disabled={
                    disabled || Boolean(rangeError(p.range, constraints))
                  }
                  onClick={() => apply(p.range)}
                >
                  {p.label}
                </AppButton>
              ))}
              <AppButton
                variant="ghost"
                className={styles.custom}
                onClick={() => changeStage('calendar')}
              >
                Выбрать даты
              </AppButton>
            </div>
          ) : stage === 'calendar' ? (
            <>
              <div className={styles.nav}>
                <AppButton
                  variant="ghost"
                  className={styles.iconButton}
                  aria-label="Предыдущий месяц"
                  onClick={() =>
                    setCursor(
                      new Date(
                        cursor.getFullYear(),
                        cursor.getMonth() - 1,
                        1,
                        12
                      )
                    )
                  }
                >
                  ←
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
                      new Date(
                        cursor.getFullYear(),
                        cursor.getMonth() + 1,
                        1,
                        12
                      )
                    )
                  }
                >
                  →
                </AppButton>
              </div>
              <div className={styles.week} aria-hidden="true">
                {WEEKDAY_LABELS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className={styles.days} aria-label="Календарь">
                {buildMonthDays(cursor).map((day, i) => {
                  if (day === null) return <span key={`blank-${i}`} />
                  const key = `${String(cursor.getFullYear()).padStart(4, '0')}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const edge = key === draft.from || key === draft.to
                  const selected =
                    edge ||
                    Boolean(
                      draft.from &&
                      draft.to &&
                      key >= draft.from &&
                      key <= draft.to
                    )
                  const marked = Boolean(activeDateKeys?.has(key))
                  return (
                    <button
                      key={key}
                      type="button"
                      data-date={key}
                      data-active={marked || undefined}
                      className={cn(
                        styles.day,
                        selected && styles.selected,
                        edge && styles.edge,
                        marked && styles.marked
                      )}
                      aria-label={`${rangeSummary({ from: key, to: key })}${marked ? ', есть транзакции' : ''}`}
                      title={marked ? 'Есть транзакции' : undefined}
                      aria-pressed={selected}
                      aria-current={key === today ? 'date' : undefined}
                      disabled={
                        disabled ||
                        Boolean(
                          rangeError(
                            { from: key, to: key },
                            { minDate, maxDate }
                          )
                        )
                      }
                      onClick={() => selectDay(key)}
                    >
                      {day}
                      {marked ? (
                        <span className={styles.dot} aria-hidden="true" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <p className={styles.status} role="status">
                {choosingEnd
                  ? 'Выберите конечную дату'
                  : 'Выберите начальную дату'}
              </p>
              <AppButton
                variant="ghost"
                className={styles.manualToggle}
                onClick={() => changeStage('manual')}
              >
                Ввести даты вручную
              </AppButton>
            </>
          ) : (
            <>
              <div className={styles.fields}>
                {['from', 'to'].map((key) => (
                  <InputWrapper
                    key={key}
                    label={key === 'from' ? 'С даты' : 'По дату включительно'}
                    noMargin
                    required={requiredRange}
                    value={text[key]}
                    error={Boolean(error)}
                    paddingY={false}
                    wrapperClassName="min-w-0"
                  >
                    <input
                      ref={key === 'from' ? firstInput : undefined}
                      className={styles.input}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={10}
                      placeholder="ДД.ММ.ГГГГ"
                      aria-label={
                        key === 'from' ? 'Начало периода' : 'Конец периода'
                      }
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? `${id}-error` : undefined}
                      value={text[key]}
                      onChange={(e) =>
                        setText((current) => ({
                          ...current,
                          [key]: e.target.value,
                        }))
                      }
                      disabled={disabled}
                    />
                  </InputWrapper>
                ))}
              </div>
              <p className={styles.status}>
                Формат: ДД.ММ.ГГГГ.
                {requiredRange
                  ? ' Обе даты обязательны.'
                  : ' Можно оставить одну границу пустой.'}
              </p>
              <AppButton
                variant="ghost"
                onClick={() => changeStage('calendar')}
              >
                Выбрать в календаре
              </AppButton>
            </>
          )}
          {stage !== 'presets' && error ? (
            <Notice
              tone="error"
              className={styles.error}
              id={`${id}-error`}
              role="alert"
            >
              {error}
            </Notice>
          ) : null}
        </div>
        {stage !== 'presets' ? (
          <footer className={styles.footer}>
            <span className={styles.summary}>
              {error ? 'Проверьте даты' : rangeSummary(candidate)}
            </span>
            <AppButton variant="secondary" onClick={close}>
              Отмена
            </AppButton>
            <AppButton
              onClick={() => apply(candidate)}
              disabled={disabled || Boolean(error)}
            >
              Применить
            </AppButton>
          </footer>
        ) : null}
      </div>
    </dialog>
  ) : null
  return (
    <div className={cn(styles.root, className)} data-period-picker>
      <div className={styles.label}>
        <span className="input-label">{label}</span>
      </div>
      <div className={styles.row}>
        <button
          ref={trigger}
          type="button"
          className={cn('border-input bg-white', styles.trigger)}
          aria-label={`${label}: ${summary}`}
          title={summary}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={id}
          disabled={disabled}
          onClick={() => {
            setDraft({ from: value.from || '', to: value.to || '' })
            setText({ from: manualDate(value.from), to: manualDate(value.to) })
            setCursor(cursorFor(value, today))
            setChoosingEnd(false)
            setStage('presets')
            setOpen(true)
          }}
        >
          <FontAwesomeIcon
            icon={faCalendarDays}
            className={styles.calendarIcon}
            aria-hidden="true"
          />
          <span className={styles.triggerText}>
            {selectedPreset?.label || compactRangeSummary(value)}
          </span>
          <FontAwesomeIcon
            icon={faChevronDown}
            className={styles.chevron}
            aria-hidden="true"
          />
        </button>
        {!sameRange(value, resetValue) ? (
          <AppButton
            variant="secondary"
            className={styles.reset}
            aria-label="Сбросить период"
            title="Сбросить период"
            disabled={disabled || Boolean(rangeError(resetValue, constraints))}
            onClick={() => apply(resetValue)}
          >
            <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
            <span className={styles.resetText}>Сбросить</span>
          </AppButton>
        ) : null}
      </div>
      {open && typeof document !== 'undefined'
        ? createPortal(modal, document.body)
        : null}
    </div>
  )
}
