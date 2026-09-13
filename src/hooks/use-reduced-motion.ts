import { useSyncExternalStore } from 'react'

/** For count-up and chart props; CSS animations use media queries instead. */
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
