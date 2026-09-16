import { useEffect, useRef, useState } from 'react'

import { usePrefersReducedMotion } from './use-reduced-motion'

/** Count-up for dashboard headline metrics; skipped when reduced motion is preferred. */
export function useCountUp(target: number, duration = 600): number {
  const prefersReducedMotion = usePrefersReducedMotion()

  const [counted, setCounted] = useState(0)

  const paintedRef = useRef(0)

  useEffect(() => {
    if (prefersReducedMotion) return

    const from = paintedRef.current
    if (from === target) return

    const decimals = decimalPlaces(target)
    const factor = 10 ** decimals

    const startedAt = performance.now()
    let frame = 0

    const step = (now: number) => {
      const elapsed = Math.min(1, (now - startedAt) / duration)
      const eased = 1 - (1 - elapsed) ** 3

      const next = Math.round((from + (target - from) * eased) * factor) / factor

      paintedRef.current = next
      setCounted(next)

      if (elapsed < 1) frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [duration, prefersReducedMotion, target])

  return prefersReducedMotion ? target : counted
}

function decimalPlaces(value: number): number {
  if (Number.isInteger(value)) return 0

  return Math.min(2, (String(value).split('.')[1] ?? '').length)
}
