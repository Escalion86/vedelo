'use client'

import { useState } from 'react'
import Input from '@components/Input'
import ComboBox from '@components/ComboBox'
import InputWrapper from '@components/InputWrapper'
import Section from '@components/CompactEventSection'
import { faUser, faPlus, faCalendarDays, faLocationDot, faRubleSign, faBell, faPaperclip, faSliders, faClock, faPlay } from '@fortawesome/free-solid-svg-icons'
import { getOnboardingPreset } from '@helpers/onboardingPresets.mjs'
import { resolveWorkItemTerminology } from '@helpers/workItemTerminology.mjs'

const steps = [
  {
    title: 'Поступил запрос',
    text: 'Откройте раздел «Клиент и прочие контакты», нажмите на поле «Клиент» и выберите Анну из списка. Для новой заявки достаточно выбрать клиента. Запрос, услуги, дату и тип события можно уточнить позже.',
  },
  {
    title: 'Запланируйте контакт',
    text: 'В разделе «Задачи/События» запланируйте следующий контакт. Он появится в «Важном». Попробуйте добавить напоминание на завтра.',
  },
  {
    title: 'Клиент согласился',
    text: 'Когда договорились с клиентом, выберите «Подтверждено» в разделе «Статус». Для подтверждения нужны клиент, услуги и дата — в примере они уже заполнены.',
  },
  {
    title: 'Возьмите задаток под контроль',
    text: 'В разделе «Стоимость и задаток» укажите ожидаемую сумму и срок. В примере ждём задаток завтра; до оплаты он будет виден в «Важном».',
  },
  {
    title: 'Задаток поступил',
    text: 'В разделе «Стоимость и задаток» отметьте учебную оплату. Сумма появится в подписи «Оплачено», а ожидание задатка закроется.',
  },
]

// A presentation-only preview: no working card actions, queries or integrations.
function TrainingCard({ preset, paid, amount }) {
  const [date] = useState(() => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow
  })
  return (
    <section aria-label="Карточка учебной заявки">
      <h3 className="mb-2 text-sm font-semibold">Примерно так выглядит карточка в списке</h3>
      <article className="ui-surface-card relative min-w-0 overflow-hidden rounded-lg py-3 pl-4 pr-3">
        <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-blue-500" aria-hidden="true" />
        <div className="card-title border-b border-gray-200 pb-2 text-base font-semibold break-words">
          {preset.demo.eventType} • {preset.starterServices[0].title}
        </div>
        <div className="flex min-w-0 gap-3 py-3">
          <div className="flex shrink-0 flex-col border-r border-gray-200 pr-3 text-center">
            <div className="flex items-baseline gap-1">
              <span className="text-sm uppercase">{date.toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
              <span className="card-title text-2xl leading-none">{date.getDate()}</span>
            </div>
            <span className="text-general font-medium">{date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '')}</span>
            <span className="card-meta mt-1 text-sm">14:00</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <div className="card-meta mt-1">Место не указано</div>
            </div>
            <div className="ml-auto text-right" aria-live="polite">
              <div className="card-title font-semibold">
                {paid && <><span className="text-emerald-600">{Number(amount).toLocaleString('ru-RU')}</span> / </>}
                30 000 ₽
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-2 text-sm">
          <span>Анна</span>
          <span className="card-meta text-xs">Учебная заявка</span>
        </div>
      </article>
      <div className="relative mt-2 pl-7 text-sm">
        <svg className="absolute -top-5 left-0 h-10 w-6 text-blue-500" viewBox="0 0 24 40" fill="none" aria-hidden="true">
          <path d="M22 36H10a6 6 0 0 1-6-6V3m-3 5 3-5 3 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p>Цвет полоски слева обозначает статус:</p>
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2" aria-label="Цвета статусов">
          {[
            ['Заявка', 'bg-amber-500'],
            ['Подтверждено', 'bg-blue-500'],
            ['Отменено', 'bg-red-500'],
            ['Закрыто', 'bg-emerald-500'],
          ].map(([label, color]) => (
            <li key={label} className="flex items-center gap-2">
              <span className={`h-5 w-1 shrink-0 rounded-full ${color}`} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

// Intentionally independent of working atoms, CRUD and calendar integrations.
export default function FirstRunTour({ presetKey, terminology, onExit, busy = false }) {
  const [step, setStep] = useState(0)
  const [clientId, setClientId] = useState(null)
  const [contact, setContact] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [deposit, setDeposit] = useState(false)
  const [paid, setPaid] = useState(false)
  const [amount, setAmount] = useState('')
  const preset = getOnboardingPreset(presetKey)
  const terms = resolveWorkItemTerminology({ custom: { onboardingActivityPreset: presetKey, primaryEntityTerminology: terminology } })
  const money = (value) => `${Number(value).toLocaleString('ru-RU')} ₽`
  const current = steps[step]
  const validAmount = Number.isFinite(Number(amount)) && Number(amount) > 0
  const stepComplete = [Boolean(clientId), contact, confirmed, deposit && validAmount, paid][step] ?? false
  const advance = () => {
    if (busy || !stepComplete) return
    setStep((value) => value + 1)
  }
  const goBack = () => {
    if (busy) return
    const previousStep = Math.max(0, step - 1)
    setPaid(false)
    setStep(previousStep)
    setContact(previousStep >= 2)
    setConfirmed(previousStep >= 3)
    setDeposit(previousStep >= 4)
  }

  return (
    <div className="first-run first-run-tour flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold">
          Учебный пример · {step + 1} из {steps.length + 1}
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
      {step > 0 && (
        <button
          type="button"
          className="first-run-link self-start text-sm underline underline-offset-4"
          disabled={busy}
          onClick={goBack}
        >
          ← Назад
        </button>
      )}
      <p className="first-run-muted text-sm">
        Это тренировка. Ваши заявки, календарь и оплаты не изменятся.
      </p>
      {current && (
        <div>
          <h3 className="text-lg font-semibold" aria-live="polite">{current.title}</h3>
          <p className="mt-2 text-sm">{current.text}</p>
        </div>
      )}
      {step === steps.length && <TrainingCard preset={preset} paid={paid} amount={amount} />}
      {current && <section key={step} className="compact-event-form first-run-card" aria-label="Учебная форма">
        <h3 className="mb-2 font-semibold">{confirmed ? `Редактирование ${terms.genitive}` : terms.newLabel}</h3>
        <Section title="Клиент и прочие контакты" icon={faUser} summary={clientId ? 'Анна · учебный клиент' : 'Клиент не выбран'} highlighted={step === 0}>
          <div className={step === 0 && !clientId ? "first-run-action-target" : undefined}>
          <ComboBox
            label="Клиент"
            value={clientId}
            onChange={setClientId}
            items={[{ value: 'anna', name: 'Анна · учебный клиент' }]}
            placeholder="Выберите клиента"
            required
            disabled={busy || step !== 0}
            fullWidth
          />
          </div>
          <InputWrapper label="Запрос клиента" fullWidth>
            <p className="min-w-0 whitespace-normal text-sm">{preset.demo.description}</p>
          </InputWrapper>
          <p className="first-run-muted mt-2 text-xs">Прочие контакты можно добавить здесь же.</p>
        </Section>
        <Section title="Услуги и тип события" icon={faPlus} summary={preset.demo.eventType}>
          <div className="input-label px-1 text-xs font-semibold">Услуги</div>
          <div className="my-2 inline-flex rounded border border-input px-3 py-2 text-sm">{preset.starterServices[0].title}</div>
          <Input label="Тип события" value={preset.demo.eventType} readOnly fullWidth />
          <p className="first-run-muted mt-2 text-xs">В рабочей форме кнопка «+» открывает список услуг по группам. Тип события необязателен.</p>
        </Section>
        <Section title="Дата и время" icon={faCalendarDays} summary="Завтра, 14:00 - 15:00">
          <p className="text-sm">Дата начала: завтра, 14:00. Дата окончания: завтра, 15:00.</p>
          <p className="first-run-muted mt-2 text-xs">У заявки дата может быть неизвестна. Укажите её перед подтверждением.</p>
        </Section>
        <Section title="Место проведения" icon={faLocationDot} summary="Не указано">
          <p className="text-sm">Здесь можно указать адрес и комментарий, когда согласуете место с клиентом.</p>
        </Section>
        <Section title="Стоимость и задаток" icon={faRubleSign} wrapSummary highlighted={step === 3 || step === 4}
          summary={`Оплачено: ${money(paid ? amount : 0)} • Договорная сумма: 30 000 ₽${deposit && !paid ? ` • ждём задаток ${money(amount)}` : ''}`}>
          <Input label="Договорная сумма" value={30000} postfix="₽" readOnly fullWidth />
          {step === 3 ? (
            <div className={!deposit ? 'first-run-action-target' : undefined}>
              <Input label="Учебный задаток" type="number" value={amount} onChange={(value) => { setAmount(value); setDeposit(false) }} min={1} postfix="₽" fullWidth disabled={busy} />
              <p className="my-2 text-sm">Срок: завтра</p>
              <button type="button" className="first-run-primary w-full" disabled={busy || !validAmount || deposit} onClick={() => setDeposit(true)}>
                {deposit ? 'Ожидание задатка добавлено' : 'Ожидать задаток завтра'}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-sm">{paid ? `Задаток получен: ${money(amount)}` : deposit ? `Ждём задаток: ${money(amount)} · срок завтра` : 'Здесь можно запланировать задаток и учесть поступления и затраты.'}</p>
          )}
          {step === 4 && !paid && (
            <div className="first-run-action-target mt-3">
              <button type="button" className="first-run-primary w-full" disabled={busy} onClick={() => setPaid(true)}>
                Отметить учебный задаток полученным
              </button>
            </div>
          )}
        </Section>
        <Section title="Задачи/События" icon={faBell} highlighted={step === 1}
          summary={contact ? 'Завтра, 12:00 · Связаться с Анной' : 'Добавить напоминание'}>
          <p className="text-sm">{contact ? '12:00 — связаться с Анной и уточнить детали.' : 'Следующий контакт: завтра в 12:00 — уточнить детали с Анной.'}</p>
          {step === 1 && !contact && (
            <div className="first-run-action-target mt-3">
              <button type="button" className="first-run-primary w-full" disabled={busy} onClick={() => setContact(true)}>
                Связаться завтра в 12:00
              </button>
            </div>
          )}
        </Section>
        <Section title="Файлы и документы" icon={faPaperclip} summary="Нет файлов">
          <p className="text-sm">После подтверждения здесь можно хранить файлы и работать с документами в рамках своего тарифа.</p>
        </Section>
        <Section title="Другие детали" icon={faSliders} summary="Дата заявки, передача коллеге">
          <p className="text-sm">Дополнительные настройки — дата заявки и передача коллеге, если она включена.</p>
        </Section>
        <Section title={`Статус: ${confirmed ? 'Подтверждено' : 'Заявка'}`} summary="Изменить"
          noDivider
          highlighted={step === 2}
          icon={confirmed ? faPlay : faClock}
          iconClassName={`event-status-picker__option--${confirmed ? 'active' : 'draft'}`}
          iconStyle={{ color: 'var(--event-status-accent)', opacity: 1 }}>
          <p className="text-sm">{confirmed ? 'Договорённости подтверждены. После выполнения и расчёта можно закрыть работу.' : 'Клиент пока принимает решение. После согласования выберите «Подтверждено».'}</p>
          {step === 2 && !confirmed && (
            <div className="first-run-action-target mt-3">
              <button type="button" className="first-run-primary w-full" disabled={busy} onClick={() => setConfirmed(true)}>
                Подтвердить {terms.accusative}
              </button>
            </div>
          )}
        </Section>
      </section>}
      {current ? (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            className="first-run-primary"
            disabled={busy || !stepComplete}
            onClick={advance}
          >
            Посмотреть следующий шаг
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
              <h3 className="text-lg font-semibold">
                Теперь можно попробовать свою заявку
              </h3>
              <p className="text-sm">
                После выполнения работ и окончательного расчёта закройте {terms.accusative}. Если
                договорённости отменены, выберите «Отменено».
              </p>
              <button
                type="button"
                className="first-run-primary"
                disabled={busy}
                onClick={() => onExit('completed')}
              >
                Завершить обучение
              </button>
        </section>
      )}
    </div>
  )
}
