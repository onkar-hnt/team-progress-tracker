import { describe, expect, it } from 'vitest'

import { PASSWORD_MIN_LENGTH, buildPasswordSchema } from '@services/auth/password-policy'

/** Every message raised against a field, so a test can name the one it expects. */
function messagesFor(
  schema: ReturnType<typeof buildPasswordSchema>,
  values: { password: string; confirmation: string },
  field: 'confirmation' | 'password',
): string[] {
  const result = schema.safeParse(values)
  if (result.success) return []

  return result.error.issues
    .filter((issue) => issue.path[0] === field)
    .map((issue) => issue.message)
}

describe('buildPasswordSchema', () => {
  const anonymous = buildPasswordSchema(null)

  it('accepts a long enough password entered twice', () => {
    expect(
      anonymous.safeParse({ password: 'correct horse', confirmation: 'correct horse' }).success,
    ).toBe(true)
  })

  it('says how many characters are needed when the password is too short', () => {
    expect(messagesFor(anonymous, { password: 'short', confirmation: 'short' }, 'password')).toContain(
      `Use at least ${String(PASSWORD_MIN_LENGTH)} characters`,
    )
  })

  it('accepts a password of exactly the minimum length', () => {
    const atMinimum = 'a'.repeat(PASSWORD_MIN_LENGTH)

    expect(anonymous.safeParse({ password: atMinimum, confirmation: atMinimum }).success).toBe(true)
  })

  it('reports a mismatch against the confirmation, which is the field to correct', () => {
    expect(
      messagesFor(
        anonymous,
        { password: 'correct horse', confirmation: 'correct hose' },
        'confirmation',
      ),
    ).toStrictEqual(['Both entries must match'])
  })

  /**
   * The temporary password is derived from the name, so anybody who knows the
   * name knows it. Keeping it is the one choice the form refuses.
   */
  it('refuses the temporary password derived from the person’s own name', () => {
    const schema = buildPasswordSchema('Asha Deshmukh')

    expect(messagesFor(schema, { password: 'Asha@123', confirmation: 'Asha@123' }, 'password'))
      .toStrictEqual([
        'Choose something other than the temporary password derived from the name',
      ])
  })

  it('refuses the temporary password however it is capitalised', () => {
    const schema = buildPasswordSchema('Asha Deshmukh')

    expect(
      messagesFor(schema, { password: 'ASHA@123', confirmation: 'ASHA@123' }, 'password'),
    ).toHaveLength(1)
  })

  it('accepts anything else from somebody whose name it knows', () => {
    const schema = buildPasswordSchema('Asha Deshmukh')

    expect(
      schema.safeParse({ password: 'correct horse', confirmation: 'correct horse' }).success,
    ).toBe(true)
  })

  /** Without a name there is no temporary password to compare against. */
  it('has no temporary password to refuse when the name is not known', () => {
    expect(anonymous.safeParse({ password: 'Asha@123', confirmation: 'Asha@123' }).success).toBe(
      true,
    )
  })

  it('reports both a short password and a mismatch together', () => {
    const result = anonymous.safeParse({ password: 'short', confirmation: 'other' })

    expect(result.success).toBe(false)
    expect(messagesFor(anonymous, { password: 'short', confirmation: 'other' }, 'password'))
      .toHaveLength(1)
    expect(messagesFor(anonymous, { password: 'short', confirmation: 'other' }, 'confirmation'))
      .toHaveLength(1)
  })
})
