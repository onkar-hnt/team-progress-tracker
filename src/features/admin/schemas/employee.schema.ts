import { z } from 'zod'

import { USER_ROLES } from '@models/user.model'
import type { Developer } from '@models/index'

export const employeeFormSchema = z.object({
  name: z.string().trim().min(2, { message: 'Enter the employee’s name' }),
  email: z.string().trim().email({ message: 'Enter a valid work email' }),
  role: z.string().trim(),
  location: z.string().trim(),
  accessRole: z.enum(USER_ROLES),
  active: z.boolean(),
})

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>

export function toEmployeeFormValues(developer: Developer | undefined): EmployeeFormValues {
  return {
    name: developer?.name ?? '',
    email: developer?.email ?? '',
    role: developer?.role ?? '',
    location: developer?.location ?? '',
    accessRole: developer?.accessRole ?? 'developer',
    active: developer?.active ?? true,
  }
}

/** Blank optional fields are omitted so the column stays null rather than empty. */
export function toEmployeeRequest(values: EmployeeFormValues) {
  return {
    name: values.name,
    email: values.email,
    active: values.active,
    accessRole: values.accessRole,
    ...(values.role === '' ? {} : { role: values.role }),
    ...(values.location === '' ? {} : { location: values.location }),
  }
}
