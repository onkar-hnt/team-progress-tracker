import './StatCard.scss'

export type StatCardTone = 'attention' | 'neutral' | 'positive' | 'progress'

interface StatCardProps {
  label: string
  value: number | string
  /** Short qualifier such as "of 12 tasks". */
  detail?: string
  tone?: StatCardTone
}

/**
 * A single headline metric.
 *
 * Tone is a hint, not the message: the label always states what the number
 * means, so the card is still readable without colour.
 */
export function StatCard({ detail, label, tone = 'neutral', value }: StatCardProps) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <p className="stat-card__label">{label}</p>
      <p className="stat-card__value">{value}</p>
      {detail === undefined ? null : <p className="stat-card__detail">{detail}</p>}
    </div>
  )
}
