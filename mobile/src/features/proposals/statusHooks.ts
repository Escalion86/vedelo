import { useQuery } from '@tanstack/react-query'
import { useProposalIdentity } from './identity'
import { proposalsApi } from './api'
import { proposalOverviewQueryKey } from './changes'

export function useProposalOverview<K extends 'statuses' | 'expired'>(kind: K, enabled = true) {
  const identity = useProposalIdentity()
  type Data = Awaited<ReturnType<typeof proposalsApi[K]>>
  return useQuery<Data>({
    queryKey: [proposalOverviewQueryKey, identity, kind],
    enabled: Boolean(identity && enabled),
    queryFn: ({ signal }) => proposalsApi[kind]({ expectedIdentity: identity, signal }) as Promise<Data>,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = (query.state.error as { status?: number } | null)?.status
      return status === 401 || status === 403 ? false : 30_000
    },
    retry: false,
  })
}
