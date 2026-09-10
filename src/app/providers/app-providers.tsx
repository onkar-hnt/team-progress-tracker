import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { appConfig } from '@config/app.config'

import { AuthSessionProvider } from './AuthSessionProvider'
import { WorkbookGate } from './WorkbookGate'

const isExcelBacked = appConfig.dataSource !== 'mock'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * Against a live workbook, returning to the tab is the moment somebody
       * has just finished editing in Excel, so that is when a refetch is most
       * useful. Fixtures never change underneath the app, so the same refetch
       * would only add noise.
       */
      refetchOnWindowFocus: isExcelBacked,
      staleTime: isExcelBacked ? 5_000 : 30_000,
    },
  },
})

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* The workbook is checked before authentication, because signing in
          reads the accounts out of it. */}
      <WorkbookGate>
        {/* Nested inside the query client so signing out can clear cached team data. */}
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </WorkbookGate>
    </QueryClientProvider>
  )
}
