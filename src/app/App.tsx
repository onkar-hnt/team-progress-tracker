import { ErrorBoundary } from '@app/ErrorBoundary'
import { AppProviders } from '@app/providers/app-providers'
import { AppRouter } from '@app/router/app-router'

/** Catches provider setup failures; fallback uses only static UI. */
export function App() {
  return (
    <ErrorBoundary scope="application">
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  )
}
