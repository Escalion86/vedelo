import cn from 'classnames'
import InputWrapper from './InputWrapper'

const Textarea = ({
  label,
  help,
  ariaLabel,
  onChange,
  value,
  inputClassName,
  labelClassName,
  wrapperClassName,
  error = false,
  rows = 3,
  required,
  defaultValue,
  noMargin = false,
  smallMargin = false,
  fullWidth = false,
}) => {
  return (
    <InputWrapper
      label={label}
      help={help}
      labelClassName={labelClassName}
      value={value}
      className={wrapperClassName}
      required={required}
      error={error}
      noMargin={noMargin}
      smallMargin={smallMargin}
      fullWidth={fullWidth}
    >
      <textarea
        aria-label={ariaLabel}
        className={cn('flex-1 px-1 text-black outline-none', inputClassName)}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={(e) => onChange(e.target.value)}
      />
    </InputWrapper>
  )
}

export default Textarea
