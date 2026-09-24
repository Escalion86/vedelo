import cn from 'classnames'
import { useLayoutEffect, useRef } from 'react'
import InputWrapper from './InputWrapper'
import copyToClipboard from '@helpers/copyToClipboard'
import ClipboardActionButton from './ClipboardActionButton'

const toPhoneValue = (digits) => {
  if (!digits) return null
  return Number(`7${digits.slice(0, 10)}`)
}

const normalizePhoneDigits = (value) => {
  const rawDigits = String(value || '').replace(/[^\d]/g, '')
  if (!rawDigits) return ''

  let digits = rawDigits
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  else if (!digits.startsWith('7')) digits = `7${digits}`

  return digits.slice(0, 11)
}

const formatPhoneDigits = (value) => {
  const digits = normalizePhoneDigits(value)
  if (!digits || digits === '7') return ''

  const local = digits.slice(1)
  let formatted = `(${local.slice(0, 3)}`

  if (local.length >= 3) formatted += ')'
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`

  return formatted
}

const removeDigitAtIndex = (digits, indexToRemove) => {
  if (!digits) return ''
  const local = digits.startsWith('7') ? digits.slice(1) : digits
  if (indexToRemove < 0 || indexToRemove >= local.length) return digits
  const nextLocal = `${local.slice(0, indexToRemove)}${local.slice(indexToRemove + 1)}`
  return nextLocal ? `7${nextLocal}` : ''
}

const removeDigitsInRange = (digits, startIndex, endIndex) => {
  if (!digits) return ''
  const local = digits.startsWith('7') ? digits.slice(1) : digits
  const safeStart = Math.max(0, startIndex)
  const safeEnd = Math.min(local.length, endIndex)
  if (safeStart >= safeEnd) return digits
  const nextLocal = `${local.slice(0, safeStart)}${local.slice(safeEnd)}`
  return nextLocal ? `7${nextLocal}` : ''
}

const countDigitsBeforeCaret = (value, caretPosition) =>
  value.slice(0, caretPosition).replace(/[^\d]/g, '').length

const getCaretPositionFromDigitIndex = (value, digitIndex) => {
  if (digitIndex <= 0) return 0

  let digitsPassed = 0
  for (let i = 0; i < value.length; i += 1) {
    if (!/\d/.test(value[i])) continue
    digitsPassed += 1
    if (digitsPassed >= digitIndex) return i + 1
  }

  return value.length
}

const PhoneInput = ({
  value,
  label = 'Телефон',
  onChange,
  required = false,
  disabled,
  labelClassName,
  className,
  paddingY = false,
  noMargin,
  smallMargin,
  error,
  showErrorText,
  copyPasteButtons = false,
}) => {
  const phoneDisplayValue = formatPhoneDigits(value)
  const hasPhoneValue = Boolean(phoneDisplayValue)
  const normalizedDigits = normalizePhoneDigits(value)
  const inputRef = useRef(null)
  const nextCaretPositionRef = useRef(null)

  useLayoutEffect(() => {
    if (nextCaretPositionRef.current === null || !inputRef.current) return
    inputRef.current.setSelectionRange(
      nextCaretPositionRef.current,
      nextCaretPositionRef.current
    )
    nextCaretPositionRef.current = null
  }, [phoneDisplayValue])

  return (
    <InputWrapper
      label={label}
      labelClassName={labelClassName}
      value={value}
      required={required}
      className={cn('w-60', className)}
      disabled={disabled}
      paddingY={paddingY}
      noMargin={noMargin}
      smallMargin={smallMargin}
      error={error}
      showErrorText={showErrorText}
      wrapperClassName={
        disabled ? 'text-disabled cursor-not-allowed' : 'text-white'
      }
    >
      <div
        className={cn(
          'flex w-full items-center',
          hasPhoneValue ? 'gap-2' : 'gap-0'
        )}
      >
        {hasPhoneValue && <div className={'text-gray-500'}>+7</div>}
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          disabled={disabled}
          placeholder="+7 (999) 123-45-67"
          className={cn(
            'w-full bg-transparent px-1 focus:outline-hidden',
            required && (!value || String(value).length !== 11)
              ? 'border-red-700'
              : 'border-gray-400',
            disabled ? 'text-disabled cursor-not-allowed' : 'text-input'
          )}
          value={phoneDisplayValue}
          onKeyDown={(e) => {
            const target = e.currentTarget
            const selectionStart = target.selectionStart ?? 0
            const selectionEnd = target.selectionEnd ?? 0
            const digitsBeforeSelection = countDigitsBeforeCaret(
              target.value,
              selectionStart
            )
            const digitsInsideSelection =
              countDigitsBeforeCaret(target.value, selectionEnd) -
              digitsBeforeSelection

            if (selectionStart !== selectionEnd) {
              if (digitsInsideSelection === 0) return
              if (e.key !== 'Backspace' && e.key !== 'Delete') return

              e.preventDefault()
              const nextDigits = removeDigitsInRange(
                normalizedDigits,
                digitsBeforeSelection,
                digitsBeforeSelection + digitsInsideSelection
              )
              const nextDisplayValue = formatPhoneDigits(nextDigits)
              nextCaretPositionRef.current = getCaretPositionFromDigitIndex(
                nextDisplayValue,
                digitsBeforeSelection
              )
              onChange(nextDigits ? toPhoneValue(nextDigits.slice(1)) : null)
              return
            }

            if (e.key !== 'Backspace' && e.key !== 'Delete') return

            if (e.key === 'Backspace') {
              if (digitsBeforeSelection === 0) return

              const nextDigits = removeDigitAtIndex(
                normalizedDigits,
                digitsBeforeSelection - 1
              )

              e.preventDefault()
              const nextDisplayValue = formatPhoneDigits(nextDigits)
              nextCaretPositionRef.current = getCaretPositionFromDigitIndex(
                nextDisplayValue,
                digitsBeforeSelection - 1
              )
              onChange(nextDigits ? toPhoneValue(nextDigits.slice(1)) : null)
              return
            }

            const localDigitsLength = normalizedDigits
              ? normalizedDigits.slice(1).length
              : 0
            if (digitsBeforeSelection >= localDigitsLength) return

            const nextDigits = removeDigitAtIndex(
              normalizedDigits,
              digitsBeforeSelection
            )

            e.preventDefault()
            const nextDisplayValue = formatPhoneDigits(nextDigits)
            nextCaretPositionRef.current = getCaretPositionFromDigitIndex(
              nextDisplayValue,
              digitsBeforeSelection
            )
            onChange(nextDigits ? toPhoneValue(nextDigits.slice(1)) : null)
          }}
          onChange={(e) => {
            const digits = normalizePhoneDigits(e.target.value)
            onChange(digits ? toPhoneValue(digits.slice(1)) : null)
          }}
        />
        {copyPasteButtons && !disabled && (
          <div className="flex items-center gap-1">
            <ClipboardActionButton
              action="paste"
              onClick={() => {
                if (!navigator?.clipboard) return
                navigator.clipboard.readText().then((text) => {
                  const digits = String(text || '').replace(/[^\d]/g, '')
                  if (!digits) {
                    onChange(null)
                    return
                  }
                  let normalized = digits
                  if (normalized.startsWith('7') || normalized.startsWith('8'))
                    normalized = normalized.slice(1)
                  if (normalized.length > 10) normalized = normalized.slice(-10)
                  onChange(toPhoneValue(normalized))
                })
              }}
              title="Вставить номер"
            />
            <ClipboardActionButton
              action="copy"
              onClick={() => {
                if (!value) return
                const raw = String(value).replace(/[^\d]/g, '')
                const digits = raw.startsWith('7') ? raw.slice(1, 11) : raw
                if (!digits) return
                const formatted =
                  digits.length >= 10
                    ? `+7(${digits.slice(0, 3)}) ${digits.slice(
                        3,
                        6
                      )}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
                    : `+7${digits}`
                copyToClipboard(formatted)
              }}
              title="Скопировать номер"
            />
          </div>
        )}
      </div>
    </InputWrapper>
  )
}

export default PhoneInput
