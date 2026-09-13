import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

import { Button } from '@components/ui/button/Button'
import { PagePlaceholder } from '@components/ui/page-placeholder/PagePlaceholder'
import { logFailure } from '@services/errors/error-message'

import './ErrorBoundary.scss'
type BoundaryScope = 'application' | 'screen'

interface ErrorBoundaryProps {
  children: ReactNode
  scope: BoundaryScope
}

interface ErrorBoundaryState {
  hasFailed: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasFailed: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasFailed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {

    logFailure(`render: ${this.props.scope}`, error)
    console.error(info.componentStack)
  }

  render(): ReactNode {
    const { children, scope } = this.props

    if (!this.state.hasFailed) return children

    if (scope === 'screen') {
      return (
        <PagePlaceholder
          action={
            <Button
              icon="refresh"
              onClick={() => {
                this.setState({ hasFailed: false })
              }}
              variant="primary"
            >
              Try again
            </Button>
          }
          description="Something in it failed while it was being drawn. Nothing has been lost, and the rest of the application still works — try again, or pick another screen from the navigation."
          title="This screen could not be shown"
        />
      )
    }

    return (
      <div className="error-boundary">
        <PagePlaceholder
          action={
            <Button
              icon="refresh"
              onClick={() => {
                window.location.reload()
              }}
              variant="primary"
            >
              Reload the application
            </Button>
          }
          description="An unexpected error interrupted the application before it could finish. Reloading starts it again from the address you are on; if the same thing happens, the details are in the browser console."
          title="Something went wrong"
        />
      </div>
    )
  }
}
