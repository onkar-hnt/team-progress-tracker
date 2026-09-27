import { describe, expect, it } from 'vitest'

import { projectFormSchema, toProjectFormValues, toProjectRequest } from './project.schema'

const values = {
  ...toProjectFormValues(undefined, undefined),
  name: 'Invoicing',
  client: 'Smith & Sons',
}

describe('the project description', () => {
  it('takes the formatting it was written with', () => {
    const result = projectFormSchema.safeParse({
      ...values,
      description: '<p>Replacing the <strong>old</strong> billing run.</p>',
    })

    expect(result.success).toBe(true)
  })

  // The markup would otherwise spend the allowance the writer is counting in words.
  it('is measured by the words rather than the markup around them', () => {
    const bolded = `<p><strong>${'a'.repeat(500)}</strong></p>`

    expect(projectFormSchema.safeParse({ ...values, description: bolded }).success).toBe(true)

    const tooLong = projectFormSchema.safeParse({
      ...values,
      description: `<p>${'a'.repeat(501)}</p>`,
    })

    expect(tooLong.success).toBe(false)
    expect(tooLong.error?.issues[0]?.message).toBe('Keep this under 500 characters')
  })

  it('stores what the editor reported, without its trailing paragraph', () => {
    expect(
      toProjectRequest({ ...values, description: '<p>The billing run</p><p></p>' }).description,
    ).toBe('<p>The billing run</p>')
  })

  // Sent rather than omitted, so clearing the box clears the stored description
  // instead of leaving the previous one in the record.
  it('sends an emptied description, so saving clears it', () => {
    expect(toProjectRequest({ ...values, description: '<p><br></p>' }).description).toBe('')
    expect(toProjectRequest({ ...values, description: '' }).description).toBe('')
  })
})
