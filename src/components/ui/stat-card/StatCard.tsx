import { Link } from 'react-router-dom'

import { Icon, type IconName } from '@components/ui/icons/Icon'

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
}

/**
 * A single headline metric.
 *
 * Tone is a hint, not the message: the label always states what the number
 * means, so the card is still readable without colour.
 */
export function StatCard({ detail, icon, label, to, tone = 'neutral', value }: StatCardProps) {
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
      <span className="stat-card__value">{value}</span>
      {detail === undefined ? null : <span className="stat-card__detail">{detail}</span>}
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
