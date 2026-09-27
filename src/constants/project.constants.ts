import { PROJECT_STATUSES } from '@models/project.model'
import type { ProjectStatus } from '@models/project.model'

import type { SelectOption } from './task.constants'

/** UI labels only; the values stored in the database are the model's own. */
export const PROJECT_STATUS_LABELS: Readonly<Record<ProjectStatus, string>> = {
  planned: 'Planned',
  active: 'Active',
  'on-hold': 'On hold',
  completed: 'Completed',
}

export const PROJECT_STATUS_OPTIONS: readonly SelectOption<ProjectStatus>[] = PROJECT_STATUSES.map(
  (status) => ({ label: PROJECT_STATUS_LABELS[status], value: status }),
)
