import cn from 'classnames'
import InputWrapper from './InputWrapper'

const Select = ({
  label,
  help,
  labelClassName,
  value,
  onChange,
  options = [],
  placeholder,
  error = false,
  required = false,
  disabled = false,
  className,
  wrapperClassName,
  fullWidth = false,
  noMargin = false,
  smallMargin = false,
  ...props
}) => {
  const borderColorClass = error
    ? 'border-danger'
    : 'border-input focus-within:border-general hover:border-general'

  const labelColorClass = 'input-label'

  return (
    <InputWrapper
      label={label}
      help={help}
      labelClassName={cn(labelColorClass, labelClassName)}
      value={value || ''}
      required={required}
      error={error}
      className={cn('w-48', fullWidth ? 'w-full' : '', className)}
      noMargin={noMargin}
      smallMargin={smallMargin}
    >
      <div className="relative flex-1">
        <select
          className={cn(
            'w-full cursor-pointer appearance-none bg-transparent px-1 pr-6 text-black outline-none',
            disabled ? 'text-disabled cursor-not-allowed bg-gray-50' : '',
            wrapperClassName
          )}
          value={value || ''}
          onChange={(e) => onChange?.(e.target.value)}
          disabled={disabled}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Custom arrow */}
        <div className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-gray-400">
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>
    </InputWrapper>
  )
}

Select.displayName = 'Select'

export default Select
