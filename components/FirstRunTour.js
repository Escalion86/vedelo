'use client'

import { useState } from 'react'
import Input from '@components/Input'
import Notice from '@components/Notice'
import { getOnboardingPreset } from '@helpers/onboardingPresets.mjs'

const steps = [
  {
    title: 'Поступил запрос',
    text: 'В заявке собраны клиент, услуга и дата. Пока клиент думает, заказ остаётся в статусе «Заявка».',
    action: 'Посмотреть следующий шаг',
  },
  {
    title: 'Запланируйте контакт',
    text: 'Чтобы не забыть о клиенте, назначьте следующее действие. Попробуйте добавить контакт на завтра.',
    action: 'Связаться завтра в 12:00',
  },
  {
    title: 'Клиент согласился',
    text: 'Подтвердите заказ. Все договорённости останутся в той же карточке.',
    action: 'Подтвердить заказ',
  },
  {
    title: 'Возьмите задаток под контроль',
    text: 'Укажите ожидаемую сумму. В примере ждём задаток завтра; до оплаты он будет виден в «Важном».',
    action: 'Ожидать задаток завтра',
  },
]

// Intentionally independent of working atoms, CRUD and calendar integrations.
export default function FirstRunTour({ presetKey, onExit, busy = false }) {
  const [step, setStep] = useState(0)
  const [contact, setContact] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [deposit, setDeposit] = useState(false)
  const [paid, setPaid] = useState(false)
  const [amount, setAmount] = useState(5000)
  const preset = getOnboardingPreset(presetKey)
  const current = steps[step]
  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0
  const advance = () => {
    if (step === 1) setContact(true)
    if (step === 2) setConfirmed(true)
    if (step === 3) {
      if (!validAmount) return
      setDeposit(true)
    }
    setStep((value) => value + 1)
  }

  return (
    <div className="first-run flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">
          Учебный пример · {Math.min(step + 1, 4)} из 4
        </span>
        <button
          type="button"
          className="first-run-link"
          disabled={busy}
          onClick={() => onExit('skipped')}
        >
          Перейти в кабинет
        </button>
      </div>
      <p className="first-run-muted text-sm">
        Это тренировка. Ваши заявки, календарь и оплаты не изменятся.
      </p>
      <section className="first-run-card" aria-label="Учебная карточка">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{preset.demo.eventType}</h3>
          <span className="first-run-badge">
            {confirmed ? 'Подтверждено' : 'Заявка'}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm">
          <div>
            <dt className="first-run-muted">Клиент</dt>
            <dd>Анна · учебный клиент</dd>
          </div>
          <div>
            <dt className="first-run-muted">Услуга</dt>
            <dd>{preset.starterServices[0].title}</dd>
          </div>
          <div>
            <dt className="first-run-muted">Дата</dt>
            <dd>Завтра, 14:00</dd>
          </div>
        </dl>
      </section>
      <div aria-live="polite">
        {contact && (
          <Notice tone="neutral" className="rounded-md">
            <strong>Важное · Завтра</strong>
            <div className="mt-1">
              12:00 — связаться с Анной и уточнить детали.
            </div>
            {deposit && (
              <div className="mt-2">
                {paid ? 'Задаток получен' : 'Ждём задаток'}:{' '}
                {Number(amount).toLocaleString('ru-RU')} ₽
                {!paid ? ' · срок завтра' : ''}.
              </div>
            )}
          </Notice>
        )}
      </div>
      {current ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold" aria-live="polite">
            {current.title}
          </h3>
          <p className="text-sm">{current.text}</p>
          {step === 3 && (
            <Input
              label="Учебный задаток"
              type="number"
              value={amount}
              onChange={setAmount}
              min={1}
              postfix="₽"
              fullWidth
              noMargin
            />
          )}
          <button
            type="button"
            className="first-run-primary"
            disabled={busy || (step === 3 && !validAmount)}
            onClick={advance}
          >
            {current.action}
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {!paid ? (
            <>
              <p className="text-sm">
                Когда деньги поступят, отметьте оплату — ожидание задатка будет
                закрыто.
              </p>
              <button
                type="button"
                className="first-run-primary"
                disabled={busy}
                onClick={() => setPaid(true)}
              >
                Отметить учебный задаток полученным
              </button>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold">
                Теперь можно попробовать свою заявку
              </h3>
              <p className="text-sm">
                После выполнения работ и окончательного расчёта закройте заказ. Если
                он не состоится, выберите «Отменено».
              </p>
              <button
                type="button"
                className="first-run-primary"
                disabled={busy}
                onClick={() => onExit('completed')}
              >
                Завершить знакомство
              </button>
            </>
          )}
        </section>
      )}
    </div>
  )
}
