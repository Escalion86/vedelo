import { signIn } from 'next-auth/react'
import {
  IMPERSONATION_DESTINATION,
  getImpersonationNavigationTarget,
} from '@helpers/impersonationNavigation.mjs'

const readErrorMessage = (payload) =>
  payload?.error?.message || 'Не удалось переключить учётную запись'

const switchImpersonation = async ({ targetUserId, restore = false }) => {
  const response = await fetch('/api/impersonation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify(
      restore ? { action: 'restore' } : { action: 'start', targetUserId }
    ),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.ticket) {
    throw new Error(readErrorMessage(payload))
  }

  const result = await signIn('impersonation', {
    ticket: payload.ticket,
    redirect: false,
    callbackUrl: IMPERSONATION_DESTINATION,
  })
  if (!result?.ok) {
    throw new Error('Не удалось создать сессию пользователя')
  }

  // NextAuth may return an absolute URL based on NEXTAUTH_URL. Following it
  // from the legacy installed PWA would cross origin and lose the new cookie.
  window.location.assign(getImpersonationNavigationTarget(result.url))
}

export default switchImpersonation
