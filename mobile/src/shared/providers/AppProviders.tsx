import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { proposalOverviewQueryKey, subscribeProposalChanges } from '../../features/proposals/changes'
import { AuthProvider } from '../auth/AuthProvider'
import { ThemeProvider } from '../ui/ThemeProvider'
import { AppLockProvider } from '../auth/AppLockProvider'

export const AppProviders = ({ children }: PropsWithChildren) => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
          mutations: { retry: 0 },
        },
      })
  )
  useEffect(() => subscribeProposalChanges((identity) => {
    const filter = { queryKey: [proposalOverviewQueryKey, identity] }
    void queryClient.cancelQueries(filter).then(() => queryClient.invalidateQueries(filter))
  }), [queryClient])

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider><AppLockProvider>{children}</AppLockProvider></AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
