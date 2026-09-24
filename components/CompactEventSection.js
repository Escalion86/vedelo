import { useEffect, useId, useRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronRight } from '@fortawesome/free-solid-svg-icons/faChevronRight'

const Section = ({
  title,
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
}) => {
  const ref = useRef(null)
  const id = useId()
  useEffect(() => {
    if (invalid && ref.current) ref.current.open = true
  }, [invalid])
  return (
    <details
      ref={ref}
      open={initiallyOpen || undefined}
      className={`compact-event-section${highlighted ? ' compact-event-section--highlighted' : ''}`}
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
        <FontAwesomeIcon
          icon={faChevronRight}
          className="compact-event-chevron"
        />
      </summary>
      <div id={id} className="compact-event-section-body">
        {children}
      </div>
    </details>
  )
}

export default Section
