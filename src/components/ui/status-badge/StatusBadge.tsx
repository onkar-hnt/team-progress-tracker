import type { TaskPriority, TaskStatus } from '@models/index'
import { getPriorityLabel, getStatusLabel } from '@utils/task.utils'

import './StatusBadge.scss'

interface StatusBadgeProps {
  status: TaskStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{getStatusLabel(status)}</span>
}

interface PriorityBadgeProps {
  priority: TaskPriority
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  return (
    <span className={`priority-badge priority-badge--${priority}`}>
      {getPriorityLabel(priority)}
    </span>
  )
}
