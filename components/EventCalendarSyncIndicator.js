import { faCalendar } from '@fortawesome/free-regular-svg-icons'
import { faArrowsRotate, faCalendarXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

const labels = {
  pending: 'Синхронизация с Google Календарём…',
  calendar_sync_connection_required: 'Переподключите Google Календарь в разделе «Интеграции»',
  calendar_sync_unavailable: 'Синхронизация с Google Календарём недоступна',
  failed: 'Синхронизация с календарем не выполнена',
}

export default function EventCalendarSyncIndicator({ pending, failed, errorCode, indicatorRef }) {
  if (!pending && !failed) return null

  const label = pending ? labels.pending : labels[errorCode] || labels.failed
  return (
    <span
      ref={indicatorRef}
      className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center"
      role="img"
      title={label}
      aria-label={label}
    >
      {pending ? (
        <>
          <FontAwesomeIcon icon={faCalendar} className="h-4 w-4 text-blue-600 [.theme-dark_&]:text-blue-400" />
          <span
            aria-hidden="true"
            className="absolute start-1 top-1.5 flex h-2 w-2 text-blue-600 motion-safe:animate-spin [.theme-dark_&]:text-blue-400"
          >
            <FontAwesomeIcon icon={faArrowsRotate} style={{ width: '100%', height: '100%' }} />
          </span>
        </>
      ) : (
        <FontAwesomeIcon icon={faCalendarXmark} className="h-4 w-4 text-red-500" />
      )}
    </span>
  )
}
