import InputWrapper from '@components/InputWrapper'
import { EVENT_STATUSES } from '@helpers/constants'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'

const EVENT_STATUS_DESCRIPTIONS = Object.freeze({
  draft: 'Без подтверждения',
  active: 'Заказ подтверждён',
  canceled: 'Мероприятие отменено',
  closed: 'Завершено и оплачено',
})
const EMPTY_VALUES = Object.freeze([])
const EMPTY_REASONS = Object.freeze({})

const EventStatusPicker = ({
  status,
  onChange = null,
  label = 'Статус мероприятия',
  required = false,
  disabledValues = EMPTY_VALUES,
  disabledReasons = EMPTY_REASONS,
  error = false,
}) => (
  <InputWrapper
    label={label}
    value={status}
    required={required}
    error={error}
    paddingX={false}
    paddingY={false}
    noBorder
    fullWidth
    wrapperClassName="items-stretch"
  >
    <div
      className="event-status-picker__options"
      role="radiogroup"
      aria-label="Статус мероприятия"
    >
      {EVENT_STATUSES.map((item) => {
        const isActive = item.value === status
        const isDisabled = disabledValues.includes(item.value)
        const disabledReason = disabledReasons[item.value]

        return (
          <button
            key={item.value}
            type="button"
            className={cn(
              'event-status-picker__option',
              `event-status-picker__option--${item.value}`,
              isDisabled
                ? 'event-status-picker__option--disabled cursor-not-allowed'
                : 'cursor-pointer'
            )}
            onClick={
              !isDisabled && onChange ? () => onChange(item.value) : undefined
            }
            disabled={isDisabled}
            role="radio"
            aria-checked={isActive}
            aria-label={
              disabledReason ? `${item.name}. ${disabledReason}` : item.name
            }
            data-selected={isActive ? 'true' : undefined}
            title={disabledReason || undefined}
          >
            <span className="event-status-picker__icon" aria-hidden="true">
              {item.icon ? <FontAwesomeIcon icon={item.icon} /> : null}
              <span className="event-status-picker__selected-mark">
                <FontAwesomeIcon icon={faCheck} />
              </span>
            </span>
            <span className="event-status-picker__copy">
              <span className="event-status-picker__name">{item.name}</span>
              <span className="event-status-picker__description">
                {EVENT_STATUS_DESCRIPTIONS[item.value]}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  </InputWrapper>
)

export default EventStatusPicker
