// @ts-nocheck
// Generated from helpers/suggestWorkStatus.mjs by generate-pwa-domain.cjs.
export function suggestWorkStatus(event, now = Date.now()) {
  if (event.status === 'draft') return 'active'
  const end = Date.parse(event.dateEnd ?? event.eventDate ?? '')
  if (event.status === 'active' && end < now) return 'closed'
  return event.status
}
