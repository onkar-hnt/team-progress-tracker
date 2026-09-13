import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import './Tooltip.scss'

type TooltipSide = 'right' | 'top'

interface TooltipProps {
  /** Empty label keeps the tooltip off without changing markup. */
  label: string

  side?: TooltipSide

  /** Open only when clipped text overflows; also enables ellipsis clipping. */
  clips?: boolean

  children: ReactNode
}

const GAP = 6

interface Position {
  top: number
  left: number
}

export function Tooltip({ children, clips = false, label, side = 'top' }: TooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<Position | null>(null)

  const open = useCallback(() => {
    const anchor = anchorRef.current
    if (anchor === null || label === '') return

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

  useEffect(() => {
    if (!isOpen) return

    // Fixed bubble does not follow scroll; dismiss instead.
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
