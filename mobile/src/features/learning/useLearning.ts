import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../shared/auth/AuthProvider'
import { api } from '../../shared/api/client'

export type LearningArticle = { id: string; title: string; category: string; summary: string; steps: string[]; href: string; action: string; access: { available: boolean; label: string | null } }
export type LearningProgress = { enabled: boolean; readIds: string[]; knownIds: string[]; tipId: string | null; tipDismissed: boolean; revision: number }
type Command = { action: 'visit' | 'present' } | { action: 'read' | 'known' | 'dismiss'; articleId: string } | { action: 'preference'; enabled: boolean }
export const useLearning = (activity: 'visit' | 'present', enabled = true) => {
  const { user, authenticated } = useAuth()
  const queryClient = useQueryClient()
  const key = ['learning', user?.tenantId, user?._id]
  const catalog = useQuery({ queryKey: [...key, 'catalog'], enabled: enabled && authenticated, staleTime: 60_000,
    queryFn: async ({ signal }) => (await api.request<{ data: { articles: LearningArticle[] } }>('/mobile/v1/learning', { signal })).data.articles })
  const progress = useQuery({ queryKey: [...key, activity], enabled: enabled && authenticated,
    queryFn: async ({ signal }) => {
      const result = (await api.request<{ data: LearningProgress }>('/learning', { method: 'POST', body: { action: activity }, signal })).data
      const cached = queryClient.getQueryData<LearningProgress>([...key, activity])
      return cached && cached.revision > result.revision ? cached : result
    } })
  // Mutation context belongs to the submitting account; a late result cannot enter another user's query.
  const mutation = useMutation({ mutationFn: async (body: Command) => ({ key, data: (await api.request<{ data: LearningProgress }>('/learning', { method: 'POST', body })).data }),
    onSuccess: ({ key: submitted, data }) => {
      for (const action of ['visit', 'present']) queryClient.setQueryData<LearningProgress>([...submitted, action], previous => !previous || data.revision >= previous.revision ? data : previous)
    } })
  return { catalog, progress, mutation }
}

const routes: Record<string, string> = {
  '/cabinet/eventsUpcoming': '/(tabs)/events', '/cabinet/clients': '/(tabs)/clients',
  '/cabinet/documents': '/more/documents', '/cabinet/integrations': '/more/integrations',
  '/cabinet/services': '/more/services', '/cabinet/import': '/more/import', '/cabinet/settings': '/more/settings',
}
export const learningRoute = (href: string) => routes[href] || '/(tabs)/more'
