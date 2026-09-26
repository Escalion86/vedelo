import cn from 'classnames'
import FieldHelp from './FieldHelp'

const LabeledContainer = ({
  label,
  help,
  children,
  className,
  contentClassName,
  noMargin = false,
}) => {
  return (
    <div
      className={cn(
        'flex w-full flex-col gap-1',
        noMargin ? '' : 'mt-2 mb-1',
        className
      )}
    >
      {label ? (
        <div className="input-label flex items-center gap-1 px-1 text-xs font-semibold select-none">
          {label}
          {help ? <FieldHelp text={help} label={label} /> : null}
        </div>
      ) : null}
      <div className="border-input w-full rounded border-2 bg-white px-2 pt-2 pb-2">
        <div className={cn('w-full', contentClassName)}>{children}</div>
      </div>
    </div>
  )
}

export default LabeledContainer
