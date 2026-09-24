import { faAsterisk } from '@fortawesome/free-solid-svg-icons/faAsterisk'
import { faBan } from '@fortawesome/free-solid-svg-icons/faBan'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import cn from 'classnames'
import { forwardRef } from 'react'

const InputWrapper = forwardRef(
  (
    {
      label,
      labelClassName,
      value,
      className,
      required,
      children,
      error,
      showErrorText,
      paddingY = true,
      paddingX = true,
      postfix,
      postfixClassName,
      insetPostfix = false,
      prefix,
      prefixClassName,
      wrapperClassName,
      hidden = false,
      fullWidth = false,
      fitWidth = false,
      noBorder = false,
      disabled = false,
      noMargin = false,
      centerLabel = false,
      showDisabledIcon = true,
      smallMargin = false,
      comment,
      commentClassName,

      ...props
    },
    ref
  ) => {
    const hasErrorText = Boolean(error && showErrorText)

    const borderColorClass = error ? 'border-danger' : 'border-input'

    const focusBorderClass =
      'focus-within:border-general hover:border-general [&:not(:focus-within)]:hover:border-opacity-50'

    const labelColorClass = 'input-label'

    const marginClass = noMargin
      ? ''
      : hasErrorText || comment
        ? 'mt-2 mb-4'
        : smallMargin
          ? 'mt-1'
          : 'mt-2 mb-1'

    const isRequiredFilled =
      (value !== null && typeof value === 'object' && value.length > 0) ||
      (typeof value !== 'object' && (value || value === false))

    const requiredIconClass = cn(
      'h-2.5 w-2.5',
      isRequiredFilled ? 'text-disabled' : 'text-danger'
    )

    return (
      <div
        className={cn(
          'flex flex-col',
          label ? 'gap-1' : '',
          marginClass,
          fullWidth ? 'w-full' : '',
          fitWidth ? 'w-fit' : '',
          hidden ? 'hidden' : '',
          className
        )}
        ref={ref}
        {...props}
      >
        {label && (
          <div
            className={cn(
              'flex items-center gap-1 px-1 text-xs font-semibold select-none',
              centerLabel ? 'justify-center' : '',
              disabled ? 'cursor-not-allowed' : '',
              labelColorClass,
              labelClassName
            )}
          >
            {label}
            {required && (
              <FontAwesomeIcon
                className={requiredIconClass}
                icon={faAsterisk}
                size="1x"
              />
            )}
          </div>
        )}
        <div
          className={cn(
            'relative flex h-fit items-stretch bg-white',
            insetPostfix
              ? 'pl-2 pr-1'
              : paddingX === 'small' ? 'px-1' : paddingX ? 'px-2' : 'px-0',
            noBorder
              ? 'min-h-[36px]'
              : `[&:not(:focus-within)]:hover:border-opacity-50 min-h-[40px] rounded border-2 ${borderColorClass} ${focusBorderClass}`,
            insetPostfix
              ? 'py-1'
              : paddingY === 'small'
              ? 'pt-1.5 pb-1'
              : paddingY === 'big'
                ? 'pt-2.5 pb-2'
                : paddingY
                  ? 'pt-2 pb-1.5'
                  : '',
            disabled ? 'cursor-not-allowed' : ''
          )}
        >
          <div
            className={cn(
              '[&:has(:focus)_.groupe]:max-w-full',
              'tablet:min-h-[28px] flex min-h-[24px] w-full items-center self-stretch',
              wrapperClassName,
              disabled ? 'cursor-not-allowed' : ''
            )}
          >
            {prefix && (
              <div
                className={cn(
                  'groupe text-disabled items-center overflow-hidden pl-1 transition-all',
                  value ? 'max-w-full' : 'max-w-0',
                  prefixClassName
                )}
              >
                {prefix}
              </div>
            )}
            {children}

            {(postfix || disabled) && (
              <div
                className={cn(
                  'text-disabled ml-1 flex items-center gap-x-1 self-stretch',
                  postfixClassName
                )}
              >
                {postfix && <span className="flex items-center">{postfix}</span>}
                {disabled && showDisabledIcon && (
                  <FontAwesomeIcon
                    className="text-disabled h-4 w-4"
                    icon={faBan}
                    size="1x"
                  />
                )}
              </div>
            )}
          </div>
          {required && !label && (
            <div
              className={cn(
                'absolute -top-[9px] right-1 flex h-4 items-center bg-white px-1 text-xs',
                isRequiredFilled ? 'text-disabled' : 'text-danger'
              )}
            >
              <FontAwesomeIcon
                className={cn('h-2.5 w-2.5')}
                icon={faAsterisk}
                size="1x"
              />
            </div>
          )}
          {hasErrorText && (
            <div
              className={cn(
                'text-danger absolute -bottom-[15px] left-1 bg-white px-1 text-xs leading-[12px] whitespace-nowrap'
              )}
            >
              {error}
            </div>
          )}
          {comment && (
            <div
              className={cn(
                'absolute right-1 -bottom-[15px] bg-white px-1 text-xs leading-[12px] whitespace-nowrap',
                commentClassName
              )}
            >
              {comment}
            </div>
          )}
        </div>
      </div>
    )
  }
)

InputWrapper.displayName = 'InputWrapper'

export default InputWrapper
