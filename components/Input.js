import { faArrowDown } from '@fortawesome/free-solid-svg-icons/faArrowDown'
import { faArrowUp } from '@fortawesome/free-solid-svg-icons/faArrowUp'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'
import { forwardRef } from 'react'
import { MaskedInput } from '@thaborach/react-text-mask'
import {
  adjustNumberByStep,
  normalizeDecimalInputString,
  normalizeNumberInputString,
  toNormalizedNumber,
} from '@helpers/numberInput'
import copyToClipboard from '@helpers/copyToClipboard'
import InputWrapper from './InputWrapper'
import ClipboardActionButton from './ClipboardActionButton'

const toPhoneValue = (digits) => {
  if (!digits) return null
  return Number(`7${digits.slice(0, 10)}`)
}

const normalizePhoneDigits = (value) => {
  const digits = String(value || '').replace(/[^\d]/g, '')
  if (!digits) return ''

  if (
    digits.length === 11 &&
    (digits.startsWith('7') || digits.startsWith('8'))
  )
    return digits.slice(1)

  return digits.slice(0, 10)
}

const Input = forwardRef(
  (
    {
      label,
      onChange,
      value,
      className,
      type = 'text',
      inputClassName,
      labelClassName,
      error = false,
      prefix,
      postfix,
      noBorder = false,
      disabled = false,
      showDisabledIcon = true,
      min,
      max,
      required,
      step,
      defaultValue,
      placeholder,
      showErrorText = false,
      fullWidth = false,
      paddingY = false,
      paddingX = true,
      noMargin = false,
      smallMargin = false,
      showArrows = true,
      autoComplete,
      maxLength,
      dataList,
      copyPasteButtons = false,
      normalizePastedValue,

      decimalScale,
    },
    ref
  ) => {
    const isPhone = type === 'phone'
    const prefixValue = isPhone && prefix === undefined ? '+7' : prefix
    const phoneMask = [
      '(',
      /[1-9]/,
      /\d/,
      /\d/,
      ')',
      ' ',
      /\d/,
      /\d/,
      /\d/,
      '-',
      /\d/,
      /\d/,
      '-',
      /\d/,
      /\d/,
    ]
    const phoneDisplayValue = (() => {
      if (!isPhone) return value
      if (value === null || value === undefined) return ''
      return normalizePhoneDigits(value)
    })()
    const placeholderValue =
      placeholder ?? (isPhone ? '+7 (999) 123-45-67' : label)
    const isDecimalNumber =
      type === 'number' && Number.isInteger(decimalScale) && decimalScale > 0
    const resolvedStep =
      step ??
      (type === 'number'
        ? postfix === '₽' ||
          label?.includes('₽') ||
          label?.toLowerCase?.().includes('цена') ||
          label?.toLowerCase?.().includes('стоим')
          ? 1000
          : label?.toLowerCase?.().includes('мин')
            ? 5
            : 1
        : 1)
    const changeNumberByStep = (direction) => {
      const nextValue = adjustNumberByStep(value, {
        step: resolvedStep,
        direction,
        min,
        max,
        fractionDigits: isDecimalNumber ? decimalScale : undefined,
      })
      onChange(isDecimalNumber ? String(nextValue) : nextValue)
    }

    // Определяем цвета для стрелочек в зависимости от темы
    const arrowTextColor = 'text-general'
    const arrowHoverColor = 'hover:text-success'

    return (
      <InputWrapper
        label={label}
        labelClassName={labelClassName}
        value={value ?? defaultValue}
        className={cn(
          className,
          type === 'number' && !fullWidth ? 'max-w-fit' : ''
        )}
        required={required}
        error={error}
        showErrorText={showErrorText}
        paddingY={paddingY}
        paddingX={paddingX}
        postfix={postfix}
        prefix={prefixValue}
        ref={ref}
        disabled={disabled}
        fullWidth={fullWidth}
        noBorder={noBorder}
        noMargin={noMargin}
        smallMargin={smallMargin}
        showDisabledIcon={showDisabledIcon}
        comment={
          maxLength ? `${String(value)?.length} / ${maxLength}` : undefined
        }
        commentClassName={
          maxLength && String(value)?.length >= maxLength
            ? 'text-danger'
            : undefined
        }
      >
        {showArrows && type === 'number' && !disabled && (
          <div
            className={cn(
              'px-1 duration-300',
              typeof min === 'number' && value <= min
                ? 'text-disabled cursor-not-allowed'
                : `${arrowTextColor} ${arrowHoverColor} cursor-pointer`
            )}
            onClick={() => changeNumberByStep(-1)}
          >
            <FontAwesomeIcon icon={faArrowDown} className="h-4 min-h-4 w-4" />
          </div>
        )}

        {isPhone ? (
          <MaskedInput
            className={cn(
              'h-7 flex-1 bg-transparent px-1 text-black focus:outline-none',
              disabled ? 'text-disabled cursor-not-allowed' : '',
              inputClassName
            )}
            guide={false}
            mask={phoneMask}
            value={phoneDisplayValue}
            onKeyDown={(e) => {
              if (e.key !== 'Backspace') return
              const target = e.currentTarget
              const cursorAtEnd =
                target.selectionStart === target.selectionEnd &&
                target.selectionStart === target.value.length
              if (!cursorAtEnd || /\d$/.test(target.value)) return

              const digits = target.value.replace(/[^\d]/g, '')
              if (!digits) return
              e.preventDefault()
              onChange(toPhoneValue(digits.slice(0, -1)))
            }}
            onChange={(e) => {
              const digits = normalizePhoneDigits(e.target.value)

              if (!digits) {
                onChange(null)
                return
              }

              onChange(toPhoneValue(digits))
            }}
            placeholder={placeholderValue}
            autoComplete={autoComplete}
            disabled={disabled}
          />
        ) : (
          <input
            type={isDecimalNumber ? 'text' : type}
            inputMode={isDecimalNumber ? 'decimal' : undefined}
            step={resolvedStep}
            className={cn(
              'h-7 flex-1 bg-transparent px-1 text-black focus:outline-none',
              type === 'number'
                ? `hide-number-spin ${fullWidth ? '' : 'max-w-22'} text-center`
                : '',
              disabled ? 'text-disabled cursor-not-allowed' : '',
              inputClassName
            )}
            onWheel={(e) => e.target.blur()}
            min={min}
            max={max}
            disabled={disabled}
            value={
              isDecimalNumber
                ? (value ?? '')
                : value === null || !value
                  ? type === 'number'
                    ? 0
                    : ''
                  : typeof value === 'number'
                    ? String(value)
                    : value
            }
            defaultValue={defaultValue}
            onChange={(e) => {
              const { value } = e.target
              if (type === 'number') {
                if (isDecimalNumber) {
                  onChange(
                    normalizeDecimalInputString(value, {
                      maxFractionDigits: decimalScale,
                    })
                  )
                  return
                }
                if (value === '') {
                  onChange(0)
                  return
                }

                onChange(toNormalizedNumber(value, { fallback: 0, min, max }))
              } else {
                if (maxLength && value?.length > maxLength)
                  onChange(value.substring(0, maxLength))
                else onChange(value)
              }
            }}
            onBlur={(e) => {
              if (type !== 'number') return
              if (isDecimalNumber) {
                const normalized = normalizeDecimalInputString(e.target.value, {
                  maxFractionDigits: decimalScale,
                })
                const parsed = Number(normalized)
                if (!Number.isFinite(parsed)) return
                const clamped = Math.min(
                  typeof max === 'number' ? max : parsed,
                  Math.max(typeof min === 'number' ? min : parsed, parsed)
                )
                onChange(
                  String(
                    Math.round(clamped * 10 ** decimalScale) /
                      10 ** decimalScale
                  )
                )
                return
              }
              const normalized = normalizeNumberInputString(e.target.value)
              if (!normalized || normalized === e.target.value) return
              onChange(
                toNormalizedNumber(normalized, { fallback: 0, min, max })
              )
            }}
            placeholder={placeholderValue}
            autoComplete={autoComplete}
            list={dataList?.name}
          />
        )}
        {dataList?.list && (
          <datalist id={dataList?.name}>
            {dataList.list.map((item) => (
              <option key={'list' + item}>{item}</option>
            ))}
          </datalist>
        )}
        {copyPasteButtons && !disabled && type !== 'number' && !isPhone && (
          <div className="flex shrink-0 items-center gap-1">
            <ClipboardActionButton
              action="paste"
              onClick={() => {
                if (!navigator?.clipboard) return
                navigator.clipboard.readText().then((text) => {
                  const normalized =
                    typeof normalizePastedValue === 'function'
                      ? normalizePastedValue(text)
                      : String(text ?? '')
                  onChange(normalized)
                })
              }}
              title="Вставить"
            />
            <ClipboardActionButton
              action="copy"
              onClick={() => {
                copyToClipboard(String(value ?? ''))
              }}
              title="Скопировать"
            />
          </div>
        )}
        {showArrows && type === 'number' && !disabled && (
          <div
            className={cn(
              'px-1 duration-300',
              typeof max === 'number' && value >= max
                ? 'text-disabled cursor-not-allowed'
                : `${arrowTextColor} ${arrowHoverColor} cursor-pointer`
            )}
            onClick={() => changeNumberByStep(1)}
          >
            <FontAwesomeIcon icon={faArrowUp} className="h-4 min-h-4 w-4" />
          </div>
        )}
      </InputWrapper>
    )
  }
)

Input.displayName = 'Input'

export default Input
