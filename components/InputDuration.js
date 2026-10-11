import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'
import InputAffixDivider from './InputAffixDivider'
import InputWrapper from './InputWrapper'

const parseNonNegativeInt = (raw) => {
  const digits = String(raw ?? '').replace(/[^\d]/g, '')
  if (!digits) return 0
  return Number(digits)
}

const ArrowButton = ({ icon, onClick, disabled }) => {
  return (
    <div
      className={cn(
        'flex items-center px-1 duration-300',
        disabled
          ? 'text-disabled cursor-not-allowed'
          : 'text-general hover:text-success cursor-pointer'
      )}
      onClick={disabled ? undefined : onClick}
    >
      <FontAwesomeIcon icon={icon} className="h-4 min-h-4 w-4" />
    </div>
  )
}

const InputDuration = ({
  label = 'Продолжительность',
  help,
  value = 0,
  onChange,
  min = 0,
  max,
  disabled = false,
  error = false,
  required,
  noMargin = false,
  className,
  inputClassName,
}) => {
  const parsed = Number(value)
  const total = Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0
  const hours = Math.floor(total / 60)
  const minutes = total % 60

  const emit = (nextHours, nextMinutes) => {
    if (typeof onChange !== 'function') return
    const safeHours = Number.isFinite(nextHours)
      ? Math.max(0, Math.round(nextHours))
      : 0
    const safeMinutes = Number.isFinite(nextMinutes)
      ? Math.max(0, Math.round(nextMinutes))
      : 0
    let nextTotal = safeHours * 60 + safeMinutes
    if (typeof min === 'number') nextTotal = Math.max(min, nextTotal)
    if (typeof max === 'number') nextTotal = Math.min(max, nextTotal)
    onChange(nextTotal)
  }

  const inputBaseClass = cn(
    'hide-number-spin h-7 w-12 self-center bg-transparent px-1 text-center text-black focus:outline-none',
    disabled ? 'text-disabled cursor-not-allowed' : '',
    inputClassName
  )

  const suffixClass = 'text-disabled flex select-none items-center px-1 text-sm'

  const arrowsDisabled = disabled
  const effectiveMin = typeof min === 'number' ? min : 0

  // Часы: шаг 60 минут, не трогаем минутную часть
  const canIncreaseHours =
    !arrowsDisabled && (typeof max !== 'number' || total + 60 <= max)
  const canDecreaseHours =
    !arrowsDisabled && hours > 0 && total - 60 >= effectiveMin

  // Минуты: шаг 1 минута в пределах 0-59, без переноса в часы
  const canIncreaseMinutes =
    !arrowsDisabled &&
    minutes < 59 &&
    (typeof max !== 'number' || total + 1 <= max)
  const canDecreaseMinutes =
    !arrowsDisabled && minutes > 0 && total - 1 >= effectiveMin

  return (
    <InputWrapper
      label={label}
      help={help}
      value={total}
      className={cn('w-fit max-w-full', className)}
      required={required}
      error={error}
      disabled={disabled}
      fitWidth
      noMargin={noMargin}
      paddingY={false}
    >
      <div className="flex items-stretch self-stretch">
        <ArrowButton
          icon={faArrowDown}
          disabled={!canDecreaseHours}
          onClick={() => emit(hours - 1, minutes)}
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          className={inputBaseClass}
          value={hours}
          disabled={disabled}
          placeholder=" "
          onWheel={(e) => e.target.blur()}
          onChange={(e) => emit(parseNonNegativeInt(e.target.value), minutes)}
        />
        <ArrowButton
          icon={faArrowUp}
          disabled={!canIncreaseHours}
          onClick={() => emit(hours + 1, minutes)}
        />
        <InputAffixDivider />
        <span className={suffixClass}>ч</span>
        <InputAffixDivider thick />
        <ArrowButton
          icon={faArrowDown}
          disabled={!canDecreaseMinutes}
          onClick={() => emit(hours, minutes - 1)}
        />
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          className={inputBaseClass}
          value={minutes}
          disabled={disabled}
          onWheel={(e) => e.target.blur()}
          onChange={(e) => {
            const parsedMinutes = parseNonNegativeInt(e.target.value)
            if (parsedMinutes >= 60) {
              emit(hours + Math.floor(parsedMinutes / 60), parsedMinutes % 60)
            } else {
              emit(hours, parsedMinutes)
            }
          }}
        />
        <ArrowButton
          icon={faArrowUp}
          disabled={!canIncreaseMinutes}
          onClick={() => emit(hours, minutes + 1)}
        />
        <InputAffixDivider />
        <span className={suffixClass}>мин</span>
      </div>
    </InputWrapper>
  )
}

export default InputDuration
