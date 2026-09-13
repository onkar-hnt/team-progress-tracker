import type { ReactNode } from 'react'

import './PagePlaceholder.scss'

interface PagePlaceholderProps {
  description: string
  title: string
  /**
   * A way out, for placeholders that stand in for a screen rather than
   * explaining a permanent limit. The shell's refresh sits above the routed
   * screen, so a placeholder shown in place of the shell itself has to carry
   * its own.
   */
  action?: ReactNode
}

/**
 * A screen that has nothing to show, saying why.
 *
 * Two elements rather than one: the outer takes the whole of whatever it is
 * dropped into and centres the card in it. A card sitting in the top-left corner
 * of an otherwise empty screen reads as the first item of a list that failed to
 * load — centred, with room around it, it reads as the answer.
 *
 * Which is why the height is `min-height` and not `height`: this is the only thing
 * on the screen when it renders, so filling the area is right, but the card must
 * still be able to push past it on a short window rather than be cut off.
 */
export function PagePlaceholder({ action, description, title }: PagePlaceholderProps) {
  return (
    <div className="page-placeholder">
      <section className="page-placeholder__card">
        <h1>{title}</h1>
        <p>{description}</p>
        {action === undefined ? null : <div className="page-placeholder__action">{action}</div>}
      </section>
    </div>
  )
}
