import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'
import InputAffixDivider from './InputAffixDivider'
import InputWrapper from './InputWrapper'

const MINUTE_STEP = 5

const parseNonNegativeInt = (raw) => {
  const value = Number(String(raw ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(value) ? value : 0
}

const ArrowButton = ({ icon, label, onClick, disabled }) => {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      className={cn(
        'flex items-center px-1 duration-300',
        disabled
          ? 'text-disabled cursor-not-allowed'
          : 'text-general hover:text-success cursor-pointer'
      )}
      onClick={onClick}
    >
      <FontAwesomeIcon icon={icon} className="h-4 min-h-4 w-4" />
    </button>
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

  const emit = (nextTotal) => {
    if (typeof onChange !== 'function') return
    nextTotal = Number.isFinite(nextTotal) ? Math.max(0, nextTotal) : 0
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

  const effectiveMin = typeof min === 'number' ? min : 0

  const canIncreaseHours =
    !disabled && (typeof max !== 'number' || total + 60 <= max)
  const canDecreaseHours =
    !disabled && hours > 0 && total - 60 >= effectiveMin

  const canIncreaseMinutes =
    !disabled && (typeof max !== 'number' || total < max)
  const canDecreaseMinutes = !disabled && total > effectiveMin

  const changeMinutesByStep = (direction) => {
    if (direction > 0 ? canIncreaseMinutes : canDecreaseMinutes) {
      emit(total + direction * MINUTE_STEP)
    }
  }

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
          label="Уменьшить часы"
          disabled={!canDecreaseHours}
          onClick={() => emit(total - 60)}
        />
        <input
          aria-label="Часы"
          type="number"
          inputMode="numeric"
          min={0}
          className={inputBaseClass}
          value={hours}
          disabled={disabled}
          placeholder=" "
          onWheel={(e) => e.target.blur()}
          onChange={(e) => emit(parseNonNegativeInt(e.target.value) * 60 + minutes)}
        />
        <ArrowButton
          icon={faArrowUp}
          label="Увеличить часы"
          disabled={!canIncreaseHours}
          onClick={() => emit(total + 60)}
        />
        <InputAffixDivider />
        <span className={suffixClass}>ч</span>
        <InputAffixDivider thick />
        <ArrowButton
          icon={faArrowDown}
          label="Уменьшить минуты"
          disabled={!canDecreaseMinutes}
          onClick={() => changeMinutesByStep(-1)}
        />
        <input
          aria-label="Минуты"
          type="number"
          inputMode="numeric"
          min={0}
          max={59}
          className={inputBaseClass}
          value={minutes}
          disabled={disabled}
          onWheel={(e) => e.target.blur()}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault()
              changeMinutesByStep(event.key === 'ArrowUp' ? 1 : -1)
            }
          }}
          onChange={(e) => emit(hours * 60 + parseNonNegativeInt(e.target.value))}
        />
        <ArrowButton
          icon={faArrowUp}
          label="Увеличить минуты"
          disabled={!canIncreaseMinutes}
          onClick={() => changeMinutesByStep(1)}
        />
        <InputAffixDivider />
        <span className={suffixClass}>мин</span>
      </div>
    </InputWrapper>
  )
}

export default InputDuration
