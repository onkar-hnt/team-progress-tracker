import { Link, type To } from 'react-router-dom'

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

  /** Decorative; label already states meaning. */
  icon?: IconName

  to?: To

  /** Rate out of 100 only — not for raw counts. */
  progress?: number
}

export function StatCard({
  detail,
  icon,
  label,
  progress,
  to,
  tone = 'neutral',
  value,
}: StatCardProps) {
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
