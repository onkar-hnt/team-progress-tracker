import { useSyncExternalStore } from 'react'

/**
 * Whether this person has asked for less movement.
 *
 * The stylesheets answer this question for themselves — every animation in the
 * application is written inside a `no-preference` query — so this exists only for
 * movement that CSS cannot express: a number counting up, which is a series of
 * different strings rather than one element in transit, and the chart library's own
 * animations, which are turned on and off through props.
 *
 * `useSyncExternalStore` rather than an effect that reads the query and stores the
 * answer. The preference is exactly what that hook is for — a value owned by something
 * outside React that can change on its own — and it removes the gap the effect version
 * had, where the first render used a value read before the subscription existed.
 *
 * Subscribed rather than read once because the preference can change while the
 * application is open: it follows a system setting on every platform that has one, and
 * somebody turning it on mid-session means it now, not at the next reload.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  const query = matchMedia(QUERY)
  query.addEventListener('change', onChange)

  return () => {
    query.removeEventListener('change', onChange)
  }
}

function getSnapshot(): boolean {
  return matchMedia(QUERY).matches
}
