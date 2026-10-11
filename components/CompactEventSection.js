import FieldHelp from './FieldHelp'
import { useEffect, useId, useRef } from 'react'
import cn from 'classnames'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'

const Section = ({
  title,
  help,
  summary,
  icon,
  iconClassName = '',
  iconStyle,
  children,
  initiallyOpen = false,
  invalid = false,
  wrapSummary = false,
  noDivider = false,
  highlighted = false,
  aiHighlighted = false,
}) => {
  const ref = useRef(null)
  const id = useId()
  useEffect(() => {
    if (invalid && ref.current) ref.current.open = true
  }, [invalid])
  return (
    <div className="relative">
    <details
      ref={ref}
      open={initiallyOpen || undefined}
      className={cn('compact-event-section', {
        'compact-event-section--highlighted': highlighted,
        'compact-event-section--ai-highlighted': aiHighlighted,
      })}
      data-ai-filled={aiHighlighted ? 'true' : undefined}
      style={noDivider ? { borderBottom: 'none' } : undefined}
    >
      <summary aria-controls={id}>
        {icon ? (
          <FontAwesomeIcon icon={icon} className={`compact-event-section-icon ${iconClassName}`} style={iconStyle} />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {summary ? (
            <span className={`mt-0.5 block text-xs text-gray-500 ${wrapSummary ? 'whitespace-normal' : 'truncate'}`}>
              {summary}
            </span>
          ) : null}
        </span>
        {help ? <span aria-hidden="true" className="h-6 w-6 shrink-0" /> : null}
        <FontAwesomeIcon
          icon={faChevronRight}
          className="compact-event-chevron shrink-0"
        />
      </summary>
      <div id={id} className="compact-event-section-body">
        {children}
      </div>
    </details>
    {help ? (
      <div className={cn('absolute top-5', highlighted || aiHighlighted ? 'right-9' : 'right-6')}>
        <FieldHelp text={help} label={title} />
      </div>
    ) : null}
    </div>
  )
}

export default Section
