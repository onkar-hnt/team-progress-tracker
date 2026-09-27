import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Tooltip } from './Tooltip'

const COMMENT = '<h3>Completed Successfully</h3><p>Deployed to <strong>staging</strong>.</p>'

function hover(anchor: HTMLElement) {
  fireEvent.pointerEnter(anchor)
}

describe('Tooltip', () => {
  it('shows the label once pointed at, and not before', () => {
    render(<Tooltip label="The whole name">Clipped</Tooltip>)

    expect(screen.queryByText('The whole name')).not.toBeInTheDocument()

    hover(screen.getByText('Clipped'))

    expect(screen.getByText('The whole name')).toBeInTheDocument()
  })

  it('stays shut for an empty label, so a missing value shows no empty bubble', () => {
    render(<Tooltip label="">Nothing to say</Tooltip>)

    hover(screen.getByText('Nothing to say'))

    expect(document.querySelector('.tooltip__bubble')).toBeNull()
  })

  describe('rich markup', () => {
    it('shows the formatting the words were written with rather than the tags', () => {
      render(
        <Tooltip label="Completed Successfully Deployed to staging." markup={COMMENT}>
          Completed Successfully…
        </Tooltip>,
      )

      hover(screen.getByText('Completed Successfully…'))

      // Queried by text rather than by role: the bubble is aria-hidden, so a
      // screen reader is given the anchor's own words instead of these.
      expect(screen.getByText('Completed Successfully').tagName).toBe('H3')
      expect(screen.getByText('staging').tagName).toBe('STRONG')
      expect(screen.queryByText(/<h3>/u)).not.toBeInTheDocument()
    })

    it('reads as the words the label already holds, not as a second line of them', () => {
      render(
        <Tooltip label="Completed Successfully Deployed to staging." markup={COMMENT}>
          Completed Successfully…
        </Tooltip>,
      )

      hover(screen.getByText('Completed Successfully…'))

      // The plain label is the fallback, so showing both would say it twice.
      expect(screen.queryByText('Completed Successfully Deployed to staging.')).not.toBeInTheDocument()
    })

    /** The change log stores `left(markup, 120)`, which can land mid-tag. */
    it('drops a tag the stored value was cut off in the middle of', () => {
      render(
        <Tooltip
          label="Good work on the integration <str"
          markup="<p>Good work on the integration <str"
        >
          Good work…
        </Tooltip>,
      )

      hover(screen.getByText('Good work…'))

      expect(screen.getByText('Good work on the integration')).toBeInTheDocument()
      expect(screen.queryByText(/<str/u)).not.toBeInTheDocument()
    })

    it('falls back to the label where the markup holds no words', () => {
      render(
        <Tooltip label="Written before the editor existed" markup="<p></p>">
          Clipped
        </Tooltip>,
      )

      hover(screen.getByText('Clipped'))

      expect(screen.getByText('Written before the editor existed')).toBeInTheDocument()
    })
  })
})
