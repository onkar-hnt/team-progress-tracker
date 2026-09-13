import { z } from 'zod'

import { initialPasswordFor } from './initial-password'

/**
 * What counts as an acceptable password, in one place.
 *
 * Three screens set a password now — somebody choosing their own, an
 * administrator resetting anybody's, and a mentor resetting one of their own
 * developers' — and a rule that lives at a call site is a rule the other two
 * call sites do not have. The schema below is the whole rule; the number is
 * exported separately only so a hint can say it without restating it.
 *
 * ## Eight characters
 *
 * Twelve was the previous figure, chosen on the reasoning that this is the one
 * moment the application gets to insist. Eight is the requirement now.
 *
 * The frontend is not the authority on it, and cannot be: `auth.updateUser` and
 * the Admin API both go to GoTrue, which applies whatever minimum the project is
 * configured with and would accept a shorter password if this were the only
 * check. What is enforced beyond the browser is stated where it happens — the
 * reset Edge Function refuses under eight before it calls the Admin API, and the
 * project's own Auth setting governs the self-service path. See the
 * implementation report and `reset-user-password/index.ts`.
 */
export const PASSWORD_MIN_LENGTH = 8

export interface PasswordFormValues {
  password: string
  confirmation: string
}

/**
 * The schema, built around the name the temporary password was derived from.
 *
 * Taking the name as an argument rather than reading it inside keeps the
 * rejection a plain validation error shown under the field, instead of a round
 * trip that comes back as a database exception. `null` when the name is not
 * known or the rule does not apply, in which case the check is simply not made.
 *
 * Refusing the temporary password matters in both directions. Somebody choosing
 * their own must not re-enter the one they were handed, since that is the
 * password the change exists to get rid of. And an administrator must not set it
 * either — `complete_password_change` refuses to clear the change requirement
 * while the temporary password still opens the account, so an account reset to
 * exactly that password would be held on the change screen with no way past it.
 */
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
      // Compared case-insensitively. The rule preserves the capitalisation of
      // the name, so "shubham@123" is not the issued password — but it is the
      // same guess, and letting it through would defeat the point.
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
