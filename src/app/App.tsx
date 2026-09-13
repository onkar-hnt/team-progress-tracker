import { ErrorBoundary } from '@app/ErrorBoundary'
import { AppProviders } from '@app/providers/app-providers'
import { AppRouter } from '@app/router/app-router'

/**
 * Outside the providers on purpose.
 *
 * A boundary inside them would not catch the thing most worth catching: a failure
 * while the providers themselves are being set up — the query client, the session
 * restore, the workbook gate — which is exactly when there is no screen yet to
 * report from. The fallback it renders is deliberately made of nothing but a
 * `Button` and static text, so it cannot need the providers it stands in for.
 *
 * There is a second, narrower boundary around the routed screen inside the shell.
 * This one is the backstop.
 */
export function App() {
  return (
    <ErrorBoundary scope="application">
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  )
}
