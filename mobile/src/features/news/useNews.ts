import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../shared/auth/AuthProvider'
import { api } from '../../shared/api/client'
import { getAuthSessionEpoch } from '../../shared/auth/tokenStore'

export type NewsItem = { _id: string; title: string; version: string; publishedAt: string | null; contentHtml: string }
export type NewsData = { items: NewsItem[]; lastSeenNewsAt: string | null }
const date = (value: unknown): value is string | null => value === null || typeof value === 'string' && Number.isFinite(new Date(value).getTime())
export const readNews = (response: unknown): NewsData => {
  const result = response as { success?: unknown; data?: NewsData }
  const data = result?.data
  if (result?.success !== true || !data || !date(data.lastSeenNewsAt) || !Array.isArray(data.items) || data.items.length > 50) throw Error('INVALID_NEWS')
  const items = data.items.map(item => {
    if (!item || !/^[a-f\d]{24}$/i.test(item._id) || typeof item.title !== 'string' || item.title.length > 120 || typeof item.version !== 'string' || item.version.length > 20 || !date(item.publishedAt) || typeof item.contentHtml !== 'string' || item.contentHtml.length > 100_000) throw Error('INVALID_NEWS_ITEM')
    return { _id: item._id, title: item.title, version: item.version, publishedAt: item.publishedAt, contentHtml: item.contentHtml }
  })
  if (new Set(items.map(item => item._id)).size !== items.length) throw Error('DUPLICATE_NEWS')
  return { items, lastSeenNewsAt: data.lastSeenNewsAt }
}
export const unreadNews = (data?: NewsData) => data?.items.filter(item => new Date(item.publishedAt || 0).getTime() > new Date(data.lastSeenNewsAt || 0).getTime()) || []

export function useNews() {
  const { user, authenticated } = useAuth(), client = useQueryClient()
  const key = ['user-news', user?.tenantId, user?._id]
  const query = useQuery({ queryKey: key, enabled: authenticated, staleTime: 60_000,
    queryFn: async ({ signal }) => readNews(await api.request('/mobile/v1/news', { signal })) })
  const markSeen = async (seenAt: string) => {
    const epoch = getAuthSessionEpoch()
    const response = await api.post<{ success: boolean; data: { lastSeenNewsAt: string } }>('/news/seen', { seenAt })
    if (epoch !== getAuthSessionEpoch()) return
    const confirmed = response?.data?.lastSeenNewsAt
    if (!response?.success || typeof confirmed !== 'string' || !date(confirmed) || new Date(confirmed).getTime() < Math.min(Date.now(), new Date(seenAt).getTime())) throw Error('UNCONFIRMED_NEWS')
    client.setQueryData<NewsData>(key, previous => previous ? { ...previous, lastSeenNewsAt: new Date(previous.lastSeenNewsAt || 0).getTime() > new Date(confirmed).getTime() ? previous.lastSeenNewsAt : confirmed } : undefined)
  }
  return { query, markSeen }
}
