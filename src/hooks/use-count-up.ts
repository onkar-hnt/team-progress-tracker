import { useEffect, useRef, useState } from 'react'

import { usePrefersReducedMotion } from './use-reduced-motion'

/**
 * A number that travels to its value instead of jumping to it.
 *
 * On the headline metrics, and nowhere else. What it buys is not decoration: a
 * dashboard is a grid of numbers that all look alike, and a figure that moves is the
 * one thing on it that says *this changed*. Change the date on the dashboard and the
 * cards that actually differ are the ones that count, which is faster to see than to
 * work out by comparing what you remember of eight numbers.
 *
 * Which is also the argument for keeping it away from tables and forms. A value
 * somebody is reading to write it down elsewhere must be the value, immediately and
 * only — an invoice total that spins is a small cruelty.
 *
 * Counted rather than transitioned because CSS cannot: each frame is a different
 * string, and a string is not something the compositor can interpolate. That is why
 * the reduced-motion preference has to be read in script here, rather than being
 * handled by the query that covers everything in the stylesheets.
 *
 * @param target Where to end up. Changing it starts a new run from wherever the
 *   previous one had reached, so a fast sequence of filter changes does not queue up
 *   animations or snap backwards between them.
 * @param duration Long enough to read as counting, short enough that nobody waits for
 *   it. Past about 700ms it stops feeling like a number settling and starts feeling
 *   like a progress bar.
 */
export function useCountUp(target: number, duration = 600): number {
  const prefersReducedMotion = usePrefersReducedMotion()

  // Starts at zero, so the first run is the count somebody notices on arrival.
  const [counted, setCounted] = useState(0)

  /**
   * The last value painted.
   *
   * Written only by the animation, never during a render, and it is what makes an
   * interrupted run continue from where it was rather than from where the previous run
   * was supposed to end.
   */
  const paintedRef = useRef(0)

  useEffect(() => {
    // Nothing to schedule when the answer is the target itself. Returned as a value
    // below rather than pushed into state here: state written from an effect is a second
    // render for something already known during the first, and there would be a frame of
    // "0" on screen in between.
    if (prefersReducedMotion) return

    const from = paintedRef.current
    if (from === target) return

    // Whole numbers stay whole and 7.5 hours stays halved: the target says how precise
    // the count is, so no frame is ever more precise than the answer.
    const decimals = decimalPlaces(target)
    const factor = 10 ** decimals

    const startedAt = performance.now()
    let frame = 0

    const step = (now: number) => {
      // Cubic ease-out, the script counterpart of `$ease-out`: most of the distance is
      // covered early, so the number is legible for most of the time it is on screen
      // instead of blurring past and stopping abruptly.
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

/** How many decimals a number is written with, capped: no metric here needs a third. */
function decimalPlaces(value: number): number {
  if (Number.isInteger(value)) return 0

  return Math.min(2, (String(value).split('.')[1] ?? '').length)
}
