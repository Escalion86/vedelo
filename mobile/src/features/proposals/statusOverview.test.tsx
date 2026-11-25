import React from 'react'
import { act, render, waitFor } from '@testing-library/react-native'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { AppProviders } from '../../shared/providers/AppProviders'
import { notifyProposalChanges, proposalOverviewQueryKey } from './changes'

jest.mock('expo-secure-store', () => ({ getItemAsync: async () => null }))
jest.mock('../../shared/auth/AuthProvider', () => ({
  AuthProvider: ({ children }: React.PropsWithChildren) => children,
  useAuth: () => ({ authenticated: false, user: null }),
}))

it('a proposal change refetches in-flight statuses and invalidates inactive expiry data for its identity', async () => {
  const statuses = [proposalOverviewQueryKey, 'owner', 'statuses']
  const expired = [proposalOverviewQueryKey, 'owner', 'expired']
  const other = [proposalOverviewQueryKey, 'other', 'expired']
  let finishInitialRequest!: (value: Record<string, string>) => void
  const loadStatuses = jest.fn()
    .mockImplementationOnce(() => new Promise<Record<string, string>>((resolve) => {
      finishInitialRequest = resolve
    }))
    .mockResolvedValueOnce({})
  let client: QueryClient | undefined

  function ReadCache() {
    client = useQueryClient()
    useQuery({ queryKey: statuses, queryFn: ({ signal }) => loadStatuses(signal) })
    return null
  }
  const screen = render(<AppProviders><ReadCache /></AppProviders>)

  try {
    await waitFor(() => expect(loadStatuses).toHaveBeenCalledTimes(1))
    client!.setQueryData(expired, [{ _id: 'p', eventId: 'order' }])
    client!.setQueryData(other, [])

    await act(async () => notifyProposalChanges('owner'))

    await waitFor(() => expect(client!.getQueryData(statuses)).toEqual({}))
    expect((loadStatuses.mock.calls[0][0] as AbortSignal).aborted).toBe(true)
    await act(async () => finishInitialRequest({ order: 'expired' }))
    expect(client!.getQueryData(statuses)).toEqual({})
    expect(client!.getQueryState(expired)?.isInvalidated).toBe(true)
    expect(client!.getQueryState(other)?.isInvalidated).toBe(false)
  } finally {
    screen.unmount()
    client?.clear()
  }
})
