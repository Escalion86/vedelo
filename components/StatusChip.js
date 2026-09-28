import cn from 'classnames'

const normalizeTone = (tone) => {
  if (
    tone === 'success' ||
    tone === 'info' ||
    tone === 'overdue' ||
    tone === 'today' ||
    tone === 'tomorrow' ||
    tone === 'upcoming' ||
    tone === 'neutral'
  ) {
    return tone
  }
  return 'neutral'
}

const StatusChip = ({ tone = 'neutral', className, children }) => (
  <div
    className={cn('status-chip', `status-chip--${normalizeTone(tone)}`, className)}
  >
    {children}
  </div>
)

export default StatusChip

