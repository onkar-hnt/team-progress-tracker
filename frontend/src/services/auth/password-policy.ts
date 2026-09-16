import { z } from 'zod'

import { initialPasswordFor } from './initial-password'

export const PASSWORD_MIN_LENGTH = 8

export interface PasswordFormValues {
  password: string
  confirmation: string
}

export function buildPasswordSchema(name: string | null) {
  const temporary = name === null ? null : initialPasswordFor(name)

  return z
    .object({
      password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, {
          message: `Use at least ${String(PASSWORD_MIN_LENGTH)} characters`,
        }),
      confirmation: z.string(),
    })
    .superRefine((values, ctx) => {
      if (temporary !== null && values.password.toLowerCase() === temporary.toLowerCase()) {
        ctx.addIssue({
          code: 'custom',
          path: ['password'],
          message: 'Choose something other than the temporary password derived from the name',
        })
      }

      if (values.password !== values.confirmation) {
        ctx.addIssue({
          code: 'custom',
          path: ['confirmation'],
          message: 'Both entries must match',
        })
      }
    })
}
