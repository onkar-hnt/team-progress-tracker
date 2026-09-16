import { useEffect, useRef } from 'react'

import { isOnline, onApiFailure, onApiUnauthorized, onNetworkStatusChange } from '@services/api'

import { useSnackbar } from './snackbar-context'

/**
 * Turns the failures the API layer owns into snackbars, once each.
 *
 * Mounted once, inside `SnackbarProvider`. Which failures reach here — and
 * which stay with the feature that made the call — is decided in
 * `@services/api/api-failure`; this component only speaks them.
 */

const OFFLINE_MESSAGE = 'You are currently offline. Some actions may be unavailable.'
const RESTORED_MESSAGE = 'Your internet connection has been restored.'
const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.'

/** A repeat of the same sentence within this window is the same event. */
const REPEAT_WINDOW_MS = 5_000

/**
 * A flapping connection settles before anything is said, so switching between
 * hotspots produces one message rather than six.
 */
const NETWORK_SETTLE_MS = 1_000

export function GlobalApiFeedback() {
  const snackbar = useSnackbar()

  const lastSpoken = useRef(new Map<string, number>())

  useEffect(() => {
    const spoken = lastSpoken.current

    const speak = (message: string, show: (message: string) => void) => {
      const now = Date.now()
      const previous = spoken.get(message)

      if (previous !== undefined && now - previous < REPEAT_WINDOW_MS) return

      spoken.set(message, now)
      show(message)
    }

    const stopListeningToFailures = onApiFailure((failure) => {
      // While there is no connection the offline notice already explains every
      // failed call; repeating it per request would be noise.
      if (failure.kind === 'offline' || !isOnline()) return

      speak(failure.message, (message) => snackbar.error(message))
    })

    const stopListeningToSession = onApiUnauthorized(() => {
      speak(SESSION_EXPIRED_MESSAGE, (message) => snackbar.warning(message))
    })

    let settleTimer: number | null = null
    let announcedOnline = isOnline()

    const stopListeningToNetwork = onNetworkStatusChange((online) => {
      if (settleTimer !== null) clearTimeout(settleTimer)

      settleTimer = window.setTimeout(() => {
        settleTimer = null

        if (online === announcedOnline) return
        announcedOnline = online

        if (online) {
          snackbar.info(RESTORED_MESSAGE)
          return
        }

        snackbar.warning(OFFLINE_MESSAGE)
      }, NETWORK_SETTLE_MS)
    })

    return () => {
      if (settleTimer !== null) clearTimeout(settleTimer)

      stopListeningToFailures()
      stopListeningToSession()
      stopListeningToNetwork()
    }
  }, [snackbar])

  return null
}
