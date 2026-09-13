import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { AuthSessionProvider } from './AuthSessionProvider'
import { ConfirmProvider } from './ConfirmProvider'
import { SnackbarProvider } from './SnackbarProvider'

/** Records change in the database, but rarely enough that refetching on focus is noise. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SnackbarProvider>
      <ConfirmProvider>
        <QueryClientProvider client={queryClient}>
          {/* Inside QueryClient so sign-out can clear cached data. */}
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </QueryClientProvider>
      </ConfirmProvider>
    </SnackbarProvider>
  )
}
