import PropTypes from 'prop-types'
import cn from 'classnames'

export const ACTION_ICON_BUTTON_SIZES = {
  xs: 'h-8 min-w-8',
  sm: 'h-9 min-w-9',
  base: 'h-10 min-w-10',
  md: 'h-11 min-w-11',
  lg: 'h-12 min-w-12',
  xl: 'h-14 min-w-14',
}

const VARIANT_CLASS = {
  success: 'action-icon-button--success',
  warning: 'action-icon-button--warning',
  danger: 'action-icon-button--danger',
  neutral: 'action-icon-button--neutral',
}

const ActionIconButton = ({
  children,
  onClick,
  title = '',
  disabled = false,
  size = 'base',
  variant = 'neutral',
  className = '',
  type = 'button',
}) => (
  <button
    type={type}
    aria-label={title || undefined}
    className={cn(
      'action-icon-button flex cursor-pointer items-center justify-center rounded',
      VARIANT_CLASS[variant] || VARIANT_CLASS.neutral,
      ACTION_ICON_BUTTON_SIZES[size] || ACTION_ICON_BUTTON_SIZES.base,
      className
    )}
    onClick={onClick}
    title={title}
    disabled={disabled}
  >
    {children}
  </button>
)

ActionIconButton.propTypes = {
  children: PropTypes.node.isRequired,
  onClick: PropTypes.func,
  title: PropTypes.string,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(['xs', 'sm', 'base', 'md', 'lg', 'xl']),
  variant: PropTypes.oneOf(['success', 'warning', 'danger', 'neutral']),
  className: PropTypes.string,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
}

ActionIconButton.defaultProps = {
  onClick: undefined,
  title: '',
  disabled: false,
  size: 'base',
  variant: 'neutral',
  className: '',
  type: 'button',
}

export default ActionIconButton
