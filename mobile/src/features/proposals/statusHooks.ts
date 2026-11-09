import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useProposalIdentity } from './identity'
import { proposalsApi } from './api'
import { subscribeProposalChanges } from './changes'

export function useProposalOverview<K extends 'statuses' | 'expired'>(kind: K, enabled = true) {
  const identity = useProposalIdentity()
  const cache = useQueryClient()
  const key = 'native-proposal-overview'
  useEffect(() => subscribeProposalChanges(() => {
    void cache.invalidateQueries({ queryKey: [key, identity, kind] })
  }), [cache, identity, kind])
  type Data = Awaited<ReturnType<typeof proposalsApi[K]>>
  return useQuery<Data>({
    queryKey: [key, identity, kind],
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
