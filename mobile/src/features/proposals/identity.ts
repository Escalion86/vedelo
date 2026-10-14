import { useAuth } from '../../shared/auth/AuthProvider'
import {
  getAccessToken,
  getStoredUser,
  subscribeAuthSession,
} from '../../shared/auth/tokenStore'
import { api } from '../../shared/api/client'
import { env } from '../../shared/config/env'

type Identity = { _id: string; tenantId?: string } | null | undefined
export const proposalIdentity = (user: Identity) =>
  user ? JSON.stringify([user._id, user.tenantId || user._id]) : ''
export const useProposalIdentity = () => proposalIdentity(useAuth().user)
export type ProposalOperation = {
  expectedIdentity: string
  signal?: AbortSignal
}
type Options = Parameters<typeof api.request>[1]

// Public tokenStore notifications close the capture window even for callers that
// have no UI lifetime (e.g. the template library). Never retain a token globally.
let observedIdentity: string | undefined
let sessionRevision = 0
subscribeAuthSession((user) => {
  observedIdentity = proposalIdentity(user)
  sessionRevision++
})

export const captureProposalIdentity = async (
  operation?: ProposalOperation
) => {
  const revision = sessionRevision
  const expected = operation?.expectedIdentity ?? observedIdentity
  const controller = new AbortController()
  const cancel = () => controller.abort()
  const unsubscribe = subscribeAuthSession(cancel)
  operation?.signal?.addEventListener('abort', cancel, { once: true })
  const close = () => {
    unsubscribe()
    operation?.signal?.removeEventListener('abort', cancel)
  }
  const live = () => {
    if (
      controller.signal.aborted ||
      operation?.signal?.aborted ||
      revision !== sessionRevision
    )
      throw new Error('SESSION_CHANGED')
  }
  try {
    live()
    const identity = proposalIdentity(await getStoredUser())
    live()
    if (!identity || (expected !== undefined && identity !== expected))
      throw new Error('SESSION_CHANGED')
    const token = await getAccessToken()
    live()
    if (!token || proposalIdentity(await getStoredUser()) !== identity)
      throw new Error('SESSION_CHANGED')
    live()
    const check = async () => {
      live()
      if (proposalIdentity(await getStoredUser()) !== identity)
        throw new Error('SESSION_CHANGED')
      live()
      if ((await getAccessToken()) !== token) throw new Error('SESSION_CHANGED')
      live()
    }
    let dispatched = 0
    const bound = Object.assign(check, {
      identity,
      close,
      request: async <T>(path: string, options?: Options) => {
        await check()
        live()
        // skipAuth removes sharedclient's async token lookup before fetch.
        // The captured token stays in this closure and never reaches UI/cache.
        dispatched++
        const result = await api.request<T>(path, {
          ...options,
          headers: { ...options?.headers, Authorization: `Bearer ${token}` },
          skipAuth: true,
          skipRefresh: true,
          signal: controller.signal,
        })
        return result
      },
      upload: async <T>(path: string, form: FormData) => {
        await check()
        live()
        // sharedclient upload has no bound-header seam. Keep multipart feature
        // local with the same captured credentials and no refresh/replay.
        const response = await fetch(
          `${env.apiBaseUrl.replace(/\/$/, '')}${path}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form,
            signal: controller.signal,
          }
        )
        if (!response.ok) throw new Error('UPLOAD_FAILED')
        const result = (await response.json()) as T
        await check()
        return result
      },
    })
    return Object.defineProperty(bound, 'dispatched', {
      get: () => dispatched,
    }) as typeof bound & { readonly dispatched: number }
  } catch (cause) {
    close()
    throw cause
  }
}
export type BoundProposalOperation = Awaited<
  ReturnType<typeof captureProposalIdentity>
>
