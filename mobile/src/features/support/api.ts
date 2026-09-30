import { api } from '../../shared/api/client'
import { getAuthSession } from '../../shared/auth/tokenStore'
import { canUseUserSupport, SUPPORT_UNAVAILABLE_MESSAGE } from './userAccess'
import type { SelectedSupportImage, SupportCategory, SupportMessage, SupportTicket } from './types'

type ListResponse = { success: true; data: SupportTicket[]; meta: { hasMore: boolean; nextCursor: string | null } }
type DetailResponse = { success: true; data: { ticket: SupportTicket; messages: SupportMessage[] }; meta: { hasMore: boolean; nextCursor: string | null } }

const requireUserSupport = async () => {
  const session = await getAuthSession()
  if (!canUseUserSupport(session?.user)) {
    throw new Error(session?.user.role === 'dev'
      ? SUPPORT_UNAVAILABLE_MESSAGE
      : 'Для обращения в поддержку войдите в пользовательский аккаунт.')
  }
}

const appendImages = (form: FormData, images: SelectedSupportImage[]) => {
  images.forEach((image) => form.append('files', {
    uri: image.uri,
    name: image.name,
    type: image.mimeType,
  } as unknown as Blob))
}

export const listSupportTickets = async (params: { status?: string; category?: string; cursor?: string } = {}) => {
  await requireUserSupport()
  const query = new URLSearchParams()
  if (params.status) query.set('status', params.status)
  if (params.category) query.set('category', params.category)
  if (params.cursor) query.set('cursor', params.cursor)
  query.set('limit', '30')
  return api.get<ListResponse>(`/support-tickets?${query.toString()}`)
}

export const getSupportTicket = async (ticketId: string, cursor?: string) => {
  await requireUserSupport()
  return api.get<DetailResponse>(`/support-tickets/${ticketId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
}

export const createSupportTicket = async (input: { category: SupportCategory; title: string; message: string; images: SelectedSupportImage[] }) => {
  await requireUserSupport()
  const form = new FormData()
  form.append('category', input.category)
  form.append('title', input.title)
  form.append('message', input.message)
  appendImages(form, input.images)
  return api.upload<{ success: true; data: { ticket: SupportTicket; message: SupportMessage } }>('/support-tickets', form)
}

export const replySupportTicket = async (ticketId: string, message: string, images: SelectedSupportImage[]) => {
  await requireUserSupport()
  const form = new FormData()
  form.append('message', message)
  appendImages(form, images)
  return api.upload<{ success: true; data: { ticket: SupportTicket; message: SupportMessage } }>(`/support-tickets/${ticketId}/messages`, form)
}

export const markSupportTicketRead = async (ticketId: string) => {
  await requireUserSupport()
  return api.post<{ success: true; data: SupportTicket }>(`/support-tickets/${ticketId}/read`)
}

export const getSupportUnreadCount = async () => {
  await requireUserSupport()
  return api.get<{ success: true; data: { unreadCount: number } }>('/support-tickets/summary')
}
