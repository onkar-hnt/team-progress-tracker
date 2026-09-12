import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import './Tooltip.scss'

type TooltipSide = 'right' | 'top'

interface TooltipProps {
  /**
   * What to show.
   *
   * Nothing opens when this is empty, which is how a caller turns the tooltip
   * off for one case without changing the markup around it.
   */
  label: string

  /** Which side of the thing it describes it sits on. */
  side?: TooltipSide

  /**
   * Only open when the text inside is actually cut off.
   *
   * For text that ellipsizes only sometimes — a name that fits on a wide window
   * and not on a narrow one — a tooltip repeating what is already fully on
   * screen is noise. Setting this also does the clipping, because the box that
   * decides whether the text fits has to be the box that can be measured.
   */
  clips?: boolean

  children: ReactNode
}

/** Distance from the thing being described. */
const GAP = 6

interface Position {
  top: number
  left: number
}

/**
 * A styled replacement for the browser's own `title` tooltip.
 *
 * `title` cannot be styled, appears after a delay the browser decides, sits
 * wherever the cursor happens to be rather than against what it describes, and
 * never appears for anyone navigating by keyboard.
 *
 * The bubble is `position: fixed` and placed from measurements for the same
 * reason the dropdown list is: the places that need a tooltip most are the ones
 * that clip their content — scrolling tables, the collapsed sidebar rail, a
 * modal body — and anything positioned inside those is cut off at their edge.
 *
 * It is `aria-hidden`. Truncation is visual only, so the full text is already in
 * the page for a screen reader to read; where it is not, the thing being
 * described carries its own `aria-label`. Either way, announcing this as well
 * would say it twice.
 */
export function Tooltip({ children, clips = false, label, side = 'top' }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  const open = useCallback(() => {
    const anchor = anchorRef.current
    if (anchor === null || label === '') return

    // All of it is on screen already, so there is nothing to reveal.
    if (clips && anchor.scrollWidth <= anchor.clientWidth) return

    const rect = anchor.getBoundingClientRect()

    setPosition(
      side === 'right'
        ? { top: rect.top + rect.height / 2, left: rect.right + GAP }
        : { top: rect.top - GAP, left: rect.left + rect.width / 2 },
    )
  }, [clips, label, side])

  const close = useCallback(() => setPosition(null), [])

  const isOpen = position !== null

  // Dismissed rather than followed. A fixed bubble is placed against the
  // viewport, so a table scrolling under a still cursor would leave it pointing
  // at whatever moved into that spot.
  useEffect(() => {
    if (!isOpen) return

    // Captured so an inner scroller — a table, a modal body — counts too, since
    // those events do not reach the window on their own.
    window.addEventListener('scroll', close, { capture: true, passive: true })
    window.addEventListener('resize', close)

    return () => {
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [close, isOpen])

  return (
    <span
      className={`tooltip${clips ? ' tooltip--clips' : ''}`}
      onBlur={close}
      onFocus={open}
      onPointerEnter={open}
      onPointerLeave={close}
      ref={anchorRef}
    >
      {children}

      {position === null ? null : (
        <span
          aria-hidden="true"
          className={`tooltip__bubble tooltip__bubble--${side}`}
          style={{ left: position.left, top: position.top }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
