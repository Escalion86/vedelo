import AppButton from '@components/AppButton'
import cn from 'classnames'

const QuickActionButtons = ({
  actions = [],
  wrapperClassName,
  buttonClassName = 'rounded',
}) => {
  const validActions = Array.isArray(actions) ? actions.filter(Boolean) : []
  if (validActions.length === 0) return null

  return (
    <div className={cn('flex flex-wrap gap-2', wrapperClassName)}>
      {validActions.map((action, index) => (
        <AppButton
          key={action?.key || `${action?.label || 'action'}-${index}`}
          variant={action?.selected ? 'primary' : action?.variant || 'secondary'}
          aria-pressed={action?.selected}
          size={action?.size || 'sm'}
          className={cn(buttonClassName, action?.className)}
          disabled={Boolean(action?.disabled)}
          onClick={action?.onClick}
        >
          {action?.label}
        </AppButton>
      ))}
    </div>
  )
}

export default QuickActionButtons

