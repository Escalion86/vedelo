import PropTypes from 'prop-types'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import IconActionButton from '@components/IconActionButton'

const AddIconButton = ({
  onClick,
  title = 'Добавить',
  disabled = false,
  size = 'base',
  variant = 'success',
  className,
  iconClassName,
  type = 'button',
  label = '',
}) => {
  return (
    <IconActionButton
      icon={faPlus}
      onClick={onClick}
      title={title}
      disabled={disabled}
      size={size}
      variant={variant}
      className={className}
      iconClassName={iconClassName}
      type={type}
      label={label}
    />
  )
}

AddIconButton.propTypes = {
  onClick: PropTypes.func,
  title: PropTypes.string,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(['xs', 'sm', 'base', 'md', 'lg', 'xl']),
  variant: PropTypes.oneOf(['success', 'neutral']),
  className: PropTypes.string,
  iconClassName: PropTypes.string,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  label: PropTypes.string,
}

AddIconButton.defaultProps = {
  onClick: undefined,
  title: 'Добавить',
  disabled: false,
  size: 'base',
  variant: 'success',
  className: '',
  iconClassName: '',
  type: 'button',
  label: '',
}

export default AddIconButton
