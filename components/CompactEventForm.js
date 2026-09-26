import { useEffect, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays } from '@fortawesome/free-solid-svg-icons/faCalendarDays'
import { faLocationDot } from '@fortawesome/free-solid-svg-icons/faLocationDot'
import { faRubleSign } from '@fortawesome/free-solid-svg-icons/faRubleSign'
import { faBell } from '@fortawesome/free-solid-svg-icons/faBell'
import { faPaperclip } from '@fortawesome/free-solid-svg-icons/faPaperclip'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import { faXmark } from '@fortawesome/free-solid-svg-icons/faXmark'
import { faUser } from '@fortawesome/free-solid-svg-icons/faUser'
import { faSliders } from '@fortawesome/free-solid-svg-icons/faSliders'
import { EVENT_STATUSES } from '@helpers/constants'
import Section from './CompactEventSection'
import InputWrapper from './InputWrapper'
import AppButton from './AppButton'
import AiFieldHighlight from './AiFieldHighlight'
import getPersonFullName from '@helpers/getPersonFullName'
import formatAddress from '@helpers/formatAddress'
import { formatEventDateRange } from '@helpers/formatEventDateRange.mjs'

const dateLabel = (value) => {
  if (!value || Number.isNaN(new Date(value).getTime())) return ''
  return new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
const money = (value) => `${Number(value).toLocaleString('ru-RU')} ₽`
const EMPTY_AI_HIGHLIGHTED_FIELDS = new Set()

// The legacy and compact layouts receive the same controls and save state.
export default function CompactEventForm({
  fields,
  errors,
  validationAttempt,
  initialTab,
  isClosed,
  isDraft,
  isNew,
  selectedClient,
  clientHighlighted,
  onSelectClient,
  onCreateClient,
  services,
  servicesIds,
  onRemoveService,
  eventType,
  eventDate,
  dateEnd,
  address,
  contractSum,
  paidAmount = 0,
  expenseAmount = 0,
  waitDeposit,
  depositExpectedAmount,
  additionalEvents,
  otherContacts,
  documents,
  proposalsEnabled = false,
  aiHighlightedFields = EMPTY_AI_HIGHLIGHTED_FIELDS,
  statusLabel,
  status,
  onClearDates,
}) {
  const ref = useRef(null)
  useEffect(() => {
    if (!validationAttempt) return
    const frame = requestAnimationFrame(() => {
      const target = ref.current?.querySelector('[data-invalid="true"]')
      const section = target?.querySelector('details')
      if (section) section.open = true
      target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
      target?.querySelector('input, textarea, button, summary')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [validationAttempt])
  const pending = additionalEvents.filter((item) => !item.done)
  const statusDefinition = EVENT_STATUSES.find((item) => item.value === status) || EVENT_STATUSES[0]
  const next = [...pending]
    .filter((item) => item.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0]
  const selectedServices = servicesIds.map(
    (id) =>
      services.find((item) => item._id === id) || { _id: id, title: 'Услуга' }
  )
  const hasAiHighlight = (...fieldNames) =>
    fieldNames.some((fieldName) => aiHighlightedFields.has(fieldName))
  return (
    <div ref={ref} className="compact-event-form">
      {isNew ? (
        <p className="mb-4 text-sm text-gray-500">
          Сохраните главное, детали — позже
        </p>
      ) : null}
      {fields.hints}
      <fieldset
        disabled={isClosed}
        className="m-0 min-w-0 border-0 p-0 disabled:opacity-60"
      >
        <div data-invalid={Boolean(errors.clientId)}>
          <Section
            title="Клиент и прочие контакты"
            icon={faUser}
            summary={[
              getPersonFullName(selectedClient, { fallback: 'Клиент не выбран' }),
              otherContacts.length ? `Прочих контактов: ${otherContacts.length}` : '',
            ].filter(Boolean).join(' · ')}
            initiallyOpen={initialTab === 'Клиент и Контакты'}
            invalid={Boolean(errors.clientId)}
            aiHighlighted={hasAiHighlight('clientId', 'description')}
          >
            <AiFieldHighlight active={clientHighlighted}>
              <InputWrapper
                label="Клиент"
                required
                error={errors.clientId}
                value={selectedClient?._id}
                fullWidth
              >
                <button
                  type="button"
                  onClick={onSelectClient}
                  className="flex min-h-10 w-full cursor-pointer items-center gap-3 text-left"
                >
                  <FontAwesomeIcon icon={faUser} className="text-gray-400" />
                  <span className="min-w-0 flex-1 truncate">
                    {getPersonFullName(selectedClient, {
                      fallback: 'Имя или телефон',
                    })}
                  </span>
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="text-xs text-gray-400"
                  />
                </button>
              </InputWrapper>
              {errors.clientId ? (
                <p role="alert" className="text-sm text-red-600">
                  {errors.clientId}
                </p>
              ) : null}
              {!selectedClient ? (
                <button
                  type="button"
                  onClick={onCreateClient}
                  className="compact-event-link"
                >
                  <FontAwesomeIcon icon={faPlus} /> Новый клиент
                </button>
              ) : null}
            </AiFieldHighlight>
            <div className="mt-3">{fields.description}</div>
            {fields.contacts}
          </Section>
        </div>
        <div data-invalid={Boolean(errors.servicesIds || errors.eventType)}>
          <Section
            title={
              selectedServices.length
                ? 'Услуги и тип события'
                : 'Добавить услугу и тип события'
            }
            summary={
              selectedServices.length
                ? eventType || `Выбрано услуг: ${selectedServices.length}`
                : 'Не выбрано'
            }
            icon={faPlus}
            invalid={Boolean(errors.servicesIds || errors.eventType)}
            aiHighlighted={hasAiHighlight('servicesIds', 'eventType')}
          >
            <div className="input-label flex items-center gap-1 px-1 text-xs font-semibold select-none">
              Услуги
            </div>
            <div className="flex flex-wrap items-center gap-2 py-2">
              {selectedServices.map((service) => (
                <button
                  key={service._id}
                  type="button"
                  className="compact-event-service"
                  onClick={() => onRemoveService(service._id)}
                  aria-label={`Убрать услугу «${service.title}»`}
                >
                  <span className="min-w-0 break-words">{service.title}</span>
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              ))}
              {fields.services}
            </div>
            {errors.servicesIds ? (
              <p role="alert" className="text-sm text-red-600">{errors.servicesIds}</p>
            ) : null}
            {fields.eventType}
          </Section>
        </div>
        <div data-invalid={Boolean(errors.eventDate || errors.dateEnd)}>
          <Section
            title="Дата и время"
            icon={faCalendarDays}
            summary={formatEventDateRange(eventDate, dateEnd)}
            wrapSummary
            invalid={Boolean(errors.eventDate || errors.dateEnd)}
            aiHighlighted={hasAiHighlight('eventDate', 'dateEnd')}
          >
            {fields.dates}
            {isDraft && eventDate ? (
              <AppButton
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={onClearDates}
              >
                Дата пока неизвестна
              </AppButton>
            ) : null}
            {errors.dateEnd ? (
              <p role="alert" className="text-sm text-red-600">
                {errors.dateEnd}
              </p>
            ) : null}
          </Section>
        </div>
        <Section
          title="Место проведения"
          icon={faLocationDot}
          summary={formatAddress(address, 'Не указано')}
          aiHighlighted={hasAiHighlight('address')}
        >
          {fields.address}
        </Section>
        <Section
          title="Финансы"
          icon={faRubleSign}
          wrapSummary
          summary={[
            `Оплачено: ${money(paidAmount)}`,
            expenseAmount ? `Затраты: ${money(expenseAmount)}` : '',
            `Договорная сумма: ${contractSum ? money(contractSum) : 'не согласована'}`,
            waitDeposit
              ? `ждём задаток${depositExpectedAmount ? ` ${money(depositExpectedAmount)}` : ''}`
              : '',
          ]
            .filter(Boolean)
            .join(' • ')}
          initiallyOpen={initialTab === 'Финансы'}
          aiHighlighted={hasAiHighlight(
            'contractSum',
            'waitDeposit',
            'depositExpectedAmount',
            'depositDueAt',
            'financeComment',
            'isByContract'
          )}
        >
          {fields.finance}
          {fields.transactions}
        </Section>
        <Section
          title="Задачи/События"
          icon={faBell}
          summary={
            next
              ? `${dateLabel(next.date)} · ${next.title}`
              : pending.length
                ? `Задач без даты: ${pending.length}`
                : 'Добавить напоминание'
          }
        >
          {fields.reminders}
        </Section>
        <Section
          title="Файлы и документы"
          icon={faPaperclip}
          summary={`Документов: ${documents.length}`}
        >
          {fields.documents}
        </Section>
        {proposalsEnabled ? <Section title="Коммерческие предложения" icon={faPaperclip} summary="По необходимости — без договора и счёта">
          {fields.proposals}
        </Section> : null}
        <div data-invalid={Boolean(errors.colleagueId)}>
          <Section
            title="Другие детали"
            icon={faSliders}
            summary="Дата заявки, передача коллеге"
            invalid={Boolean(errors.colleagueId)}
          >
            {fields.other}
          </Section>
        </div>
      </fieldset>
      <Section
        title={`Статус: ${statusLabel}`}
        noDivider
        icon={statusDefinition.icon}
        iconClassName={`event-status-picker__option--${statusDefinition.value}`}
        iconStyle={{ color: 'var(--event-status-accent)', opacity: 1 }}
        summary="Изменить"
      >
        {fields.status}
      </Section>
      {fields.google}
    </div>
  )
}
