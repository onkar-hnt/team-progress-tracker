import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'

import { appConfig } from '@config/app.config'

import { AuthSessionProvider } from './AuthSessionProvider'
import { ConfirmProvider } from './ConfirmProvider'
import { SnackbarProvider } from './SnackbarProvider'
import { WorkbookGate } from './WorkbookGate'

/** Refetch on focus only when the workbook can change outside the app. */
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
    <SnackbarProvider>
      <ConfirmProvider>
        <QueryClientProvider client={queryClient}>
          {/* Workbook before auth: sign-in reads accounts from it. */}
          <WorkbookGate>
            {/* Inside QueryClient so sign-out can clear cached data. */}
            <AuthSessionProvider>{children}</AuthSessionProvider>
          </WorkbookGate>
        </QueryClientProvider>
      </ConfirmProvider>
    </SnackbarProvider>
  )
}
