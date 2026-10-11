import FieldHelp from './FieldHelp'
import cn from 'classnames'

const CheckBox = ({
  checked = false,
  onClick = null,
  onChange = null,
  small = false,
  big = false,
  label = null,
  help,
  labelClassName,
  readOnly = false,
  hidden = false,
  wrapperClassName,
  error,
  type = 'checkbox',
  noMargin,
  disabled,
}) => {
  if (readOnly && !checked) return null

  return (
    (!readOnly || checked) && (
      <div
        className={cn(
          'flex items-center gap-x-1.5 pl-1',
          noMargin ? '' : 'my-2',
          hidden ? 'hidden' : '',
          wrapperClassName
        )}
      >
        <input
          disabled={disabled}
          readOnly
          checked={checked}
          type={type}
          className={cn(
            'transition-all duration-300',
            type === 'checkbox'
              ? checked
                ? 'bg-check'
                : ''
              : checked
                ? 'bg-radio'
                : '',
            disabled ? 'cursor-not-allowed bg-gray-400' : 'bg-white',
            readOnly
              ? 'bg-gray-500'
              : !disabled
                ? 'checked:bg-general cursor-pointer'
                : '',
            'appearance-none border from-blue-900 checked:border-transparent focus:outline-none',
            big
              ? 'h-6 min-h-6 w-6 min-w-6'
              : small
                ? 'h-4 min-h-4 w-4 min-w-4'
                : 'h-5 min-h-5 w-5 min-w-5',
            type === 'checkbox'
              ? big
                ? 'rounded-lg'
                : small
                  ? 'rounded-sm'
                  : 'rounded-md'
              : 'rounded-full',
            error ? 'border-danger' : 'border-gray-400'
          )}
          onClick={!readOnly ? onClick : null}
          onChange={!readOnly ? onChange : null}
          aria-label="CheckBox"
        />
        <div
          // for="exampleFormControlInput1"
          className={cn('leading-[0.875rem]', labelClassName)}
        >
          {label}
        </div>
        {help ? <FieldHelp text={help} label={typeof label === 'string' ? label : 'поле'} /> : null}
      </div>
    )
  )
}

CheckBox.defaultProps = {}

export default CheckBox
