import { z } from 'zod'

import type { Mentor } from '@models/index'

export const mentorFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'Enter the mentor’s name' }),
  email: z.string().trim().email({ message: 'Enter a valid work email' }),
  active: z.boolean(),
})

export type MentorFormValues = z.infer<typeof mentorFormSchema>

export function toMentorFormValues(mentor: Mentor | undefined): MentorFormValues {
  return {
    name: mentor?.name ?? '',
    email: mentor?.email ?? '',
    active: mentor?.active ?? true,
  }
}
