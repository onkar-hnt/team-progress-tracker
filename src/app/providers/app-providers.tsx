import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { AuthSessionProvider } from './AuthSessionProvider'

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 30_000 } },
})

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Nested inside the query client so signing out can clear cached team data. */}
      <AuthSessionProvider>{children}</AuthSessionProvider>
    </QueryClientProvider>
  )
}
