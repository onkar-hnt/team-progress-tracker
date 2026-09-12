import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { appConfig } from '@config/app.config'

import { AuthSessionProvider } from './AuthSessionProvider'
import { WorkbookGate } from './WorkbookGate'

/**
 * Only a real workbook can be edited behind the application's back.
 *
 * For those two sources, returning to the tab is exactly when somebody has
 * finished editing in Excel, so that is the moment to re-read, and freshness
 * is worth measuring in seconds. None of it applies elsewhere: Supabase has
 * this application as its only writer and every write already invalidates
 * what it touched, the in-memory workbook lives inside this process, and
 * fixtures cannot change at all.
 *
 * This used to read `!== 'mock'`, which quietly handed Supabase the workbook's
 * settings — a five-second freshness window, and a refetch of every mounted
 * query each time the tab regained focus, against a database nobody else was
 * touching.
 */
const isSharedWorkbook =
  appConfig.dataSource === 'local-excel' || appConfig.dataSource === 'sharepoint-excel'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: isSharedWorkbook,
      staleTime: isSharedWorkbook ? 5_000 : 30_000,
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
