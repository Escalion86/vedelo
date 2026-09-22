'use client'

import { useAtomValue } from 'jotai'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { apiJson } from '@helpers/apiClient'

const latest = (old, next) => (old && old.revision > next.revision ? old : next)
const send = (command) =>
  apiJson('/api/learning', {
    method: 'POST',
    body: JSON.stringify(command),
  }).then((result) => result.data)

export const useLearning = ({ activity, enabled = true } = {}) => {
  const user = useAtomValue(loggedUserAtom)
  const client = useQueryClient()
  const scope = [
    String(user?.tenantId || user?._id || ''),
    String(user?._id || ''),
  ]
  const key = ['learning', ...scope]
  const ready = Boolean(user?._id) && enabled
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await apiJson('/api/learning')
      return latest(client.getQueryData(key), result.data)
    },
    enabled: ready,
    staleTime: 60_000,
  })
  const activityQuery = useQuery({
    queryKey: [
      'learning-activity',
      ...scope,
      activity || '',
      new Date().toISOString().slice(0, 10),
    ],
    queryFn: async () => {
      const result = await send({ action: activity })
      client.setQueryData(key, (old) => latest(old, result))
      return result
    },
    enabled: ready && Boolean(activity),
    staleTime: Infinity,
    retry: 1,
  })
  const mutation = useMutation({
    mutationFn: ({ command }) => send(command),
    onSuccess: (result, variables) =>
      client.setQueryData(variables.cacheKey, (old) => latest(old, result)),
  })
  return {
    ...query,
    activityQuery,
    mutation: {
      ...mutation,
      variables: mutation.variables?.command,
      // Capture the owner at submission, even if the account changes in flight.
      mutate: (command) => mutation.mutate({ command, cacheKey: key }),
    },
  }
}
