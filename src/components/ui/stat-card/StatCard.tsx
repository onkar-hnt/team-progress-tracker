import { Link } from 'react-router-dom'

import { Icon, type IconName } from '@components/ui/icons/Icon'
import { useCountUp } from '@hooks/use-count-up'

import './StatCard.scss'

export type StatCardTone = 'attention' | 'neutral' | 'positive' | 'progress'

interface StatCardProps {
  label: string
  value: number | string
  /** Short qualifier such as "of 12 tasks". */
  detail?: string
  tone?: StatCardTone

  /**
   * Sits beside the label to give the metric a subject at a glance.
   *
   * Decorative: the label already states what the number means, so the icon is
   * hidden from assistive technology rather than described.
   */
  icon?: IconName

  /**
   * Where the card leads, for a metric the reader can drill into.
   *
   * Supplying it turns the card into a link — so only supply it when there is
   * somewhere useful to go. A card that lifts under the cursor and then does
   * nothing is worse than one that never moved.
   */
  to?: string

  /**
   * A proportion out of a hundred, drawn as a bar across the foot of the card.
   *
   * For a metric that *is* a proportion — a completion rate, the share of expected
   * updates that arrived. Not for a count: "14 tasks" has no denominator, and a bar
   * under it would invent one.
   *
   * The bar carries no information the card does not already state in words, so it is
   * hidden from assistive technology rather than given a `meter` role. It is there to
   * make a rate comparable across a row of cards at a glance, which is a visual job.
   */
  progress?: number
}

/**
 * A single headline metric.
 *
 * Tone is a hint, not the message: the label always states what the number
 * means, so the card is still readable without colour.
 */
export function StatCard({
  detail,
  icon,
  label,
  progress,
  to,
  tone = 'neutral',
  value,
}: StatCardProps) {
  /**
   * Counted only when the value is a number.
   *
   * The hook runs either way, because hooks must, and a target it is already at is a
   * run it declines to start. So a card whose value is "Submitted" or "84%" costs
   * nothing and shows its text unaltered — counting through the digits of a string
   * would mean parsing it, and a card that guesses which part of its own label is a
   * number is a card that will one day count the 7 in "Sprint 7".
   */
  const counted = useCountUp(typeof value === 'number' ? value : 0)

  const body = (
    <>
      <span className="stat-card__head">
        {icon === undefined ? null : (
          <span aria-hidden="true" className="stat-card__icon">
            <Icon name={icon} size={16} />
          </span>
        )}
        <span className="stat-card__label">{label}</span>
        {to === undefined ? null : (
          <span aria-hidden="true" className="stat-card__chevron">
            <Icon name="chevron-right" size={16} />
          </span>
        )}
      </span>

      <span className="stat-card__value">{typeof value === 'number' ? counted : value}</span>
      {detail === undefined ? null : <span className="stat-card__detail">{detail}</span>}

      {progress === undefined ? null : (
        <span aria-hidden="true" className="stat-card__meter">
          {/* Clamped, because a rate can exceed a hundred honestly — more updates than
              expected, if somebody logs twice — and a bar wider than its track would
              paint over the card's corner radius. */}
          <span
            className="stat-card__meter-fill"
            style={{ width: `${String(Math.max(0, Math.min(100, progress)))}%` }}
          />
        </span>
      )}
    </>
  )

  if (to !== undefined) {
    return (
      <Link className={`stat-card stat-card--${tone} stat-card--link`} to={to}>
        {body}
      </Link>
    )
  }

  return <div className={`stat-card stat-card--${tone}`}>{body}</div>
}
