import { z } from 'zod'

import { PROJECT_STATUSES } from '@models/project.model'
import type { Project } from '@models/index'
import { richTextSchema } from '@utils/rich-text.schema'
import { normaliseRichText } from '@utils/rich-text.utils'

const DESCRIPTION_MAX = 500

export const projectFormSchema = z
  .object({
    name: z.string().trim().min(2, { message: 'Enter the project name' }),
    client: z.string().trim().min(1, { message: 'Enter the client' }),
    description: richTextSchema({ max: DESCRIPTION_MAX }).optional(),
    status: z.enum(PROJECT_STATUSES),
    startDate: z.string(),
    endDate: z.string(),
    mentorIds: z.array(z.string()),
    assignedDeveloperIds: z.array(z.string()),
    active: z.boolean(),
  })
  .refine(
    (values) =>
      values.startDate === '' || values.endDate === '' || values.startDate <= values.endDate,
    { message: 'The end date cannot be before the start date', path: ['endDate'] },
  )

export type ProjectFormValues = z.infer<typeof projectFormSchema>

export function toProjectFormValues(
  project: Project | undefined,
  lockedMentorId: string | undefined,
): ProjectFormValues {
  return {
    name: project?.name ?? '',
    client: project?.client ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'planned',
    startDate: project?.startDate ?? '',
    endDate: project?.endDate ?? '',
    mentorIds: initialMentorIds(project, lockedMentorId),
    assignedDeveloperIds: [...(project?.assignedDeveloperIds ?? [])],
    active: project?.active ?? true,
  }
}

export function toProjectRequest(values: ProjectFormValues) {
  const mentorIds = [...new Set(values.mentorIds)]

  return {
    name: values.name,
    client: values.client,
    status: values.status,
    active: values.active,
    assignedDeveloperIds: values.assignedDeveloperIds,
    mentorIds,
    ...(mentorIds[0] === undefined ? {} : { mentorId: mentorIds[0] }),

    // Sent rather than omitted, so emptying the box on an edit clears the
    // stored description instead of leaving the previous one in place. An
    // editor left alone reports a paragraph, which is not a description.
    description: normaliseRichText(values.description ?? ''),

    ...(values.startDate === '' ? {} : { startDate: values.startDate }),
    ...(values.endDate === '' ? {} : { endDate: values.endDate }),
  }
}

function initialMentorIds(project: Project | undefined, lockedMentorId: string | undefined) {
  // The primary mentor leads, so saving the form keeps `mentorId` as the first of `mentorIds`.
  return [
    ...new Set([
      ...(project?.mentorId === undefined ? [] : [project.mentorId]),
      ...(project?.mentorIds ?? []),
      ...(lockedMentorId === undefined ? [] : [lockedMentorId]),
    ]),
  ]
}
