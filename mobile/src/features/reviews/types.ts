export type ReviewStatus = 'created' | 'sent' | 'received' | 'expired' | 'revoked'
export type ClientReview = {
  _id: string; eventId: string; clientId: string; status: ReviewStatus
  createdAt: string; expiresAt: string; sentAt?: string | null; submittedAt?: string | null; readAt?: string | null
  rating?: number | null; comment: string; note: string
  clientName?: string; eventTitle?: string; eventDate?: string | null
}
export type ReviewList = { items: ClientReview[]; total: number; allowClientReviews: boolean }
export type ReviewFilters = { eventId?: string; clientId?: string; rating?: string; unread?: string; from?: string; to?: string; page?: number }
export type ReviewAction = 'link' | 'renew' | 'sent' | 'revoke' | 'read' | 'note'
export type ReviewResult = ClientReview & { url?: string | null }
export type ReviewEvent = { _id: string; clientId?: string | null; status?: string; eventDate?: string | null; dateEnd?: string | null; isDemo?: boolean }
export type ReviewAppearance = { publicName: string; specialization: string; greeting: string; accent: 'sand' | 'terracotta' | 'emerald' | 'sky' | 'violet'; cover: 'plain' | 'warm' | 'deep'; logoUrl: string }
export type ReviewPageData = { reviewPage: ReviewAppearance; allowClientReviews: boolean; origin: string }
export type ReviewNavigation = { onOpenEvent?: (eventId: string) => void; onOpenClient?: (clientId: string) => void; onPlanContact?: (eventId: string) => void }
