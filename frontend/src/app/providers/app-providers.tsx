import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { AuthSessionProvider } from './AuthSessionProvider'
import { ConfirmProvider } from './ConfirmProvider'
import { GlobalApiFeedback } from './GlobalApiFeedback'
import { SnackbarProvider } from './SnackbarProvider'

/** Records change in the database, but rarely enough that refetching on focus is noise. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000,

      /**
       * Retrying is the API client's job, which already sends a transient
       * failure up to three times with a growing gap and refuses to repeat a
       * refusal such as 403 or 404. Leaving React Query's own three attempts on
       * as well would turn one failed screen into nine requests.
       */
      retry: false,
    },
  },
})

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <SnackbarProvider>
      {/* Speaks the failures the API layer owns; renders nothing itself. */}
      <GlobalApiFeedback />
      <ConfirmProvider>
        <QueryClientProvider client={queryClient}>
          {/* Inside QueryClient so sign-out can clear cached data. */}
          <AuthSessionProvider>{children}</AuthSessionProvider>
        </QueryClientProvider>
      </ConfirmProvider>
    </SnackbarProvider>
  )
}
