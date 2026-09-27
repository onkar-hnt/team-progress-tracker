import { describe, expect, it } from 'vitest'

import { commentTextSchema, emptyFeedbackValues, toCreateCommentRequest } from './feedback.schema'

const values = {
  ...emptyFeedbackValues('dev-1'),
  comment: '<p>Good progress on the connector.</p>',
}

describe('what counts as a comment', () => {
  it('accepts a sentence that carries formatting', () => {
    expect(commentTextSchema.safeParse('<p>Nicely <strong>done</strong>.</p>').success).toBe(true)

    expect(
      commentTextSchema.safeParse('<ul><li>Naming</li><li>Error handling</li></ul>').success,
    ).toBe(true)
  })

  it('still accepts a comment written before the editor existed', () => {
    expect(commentTextSchema.safeParse('Nicely done.').success).toBe(true)
  })

  // The editor reports a paragraph whether or not anything was written in it.
  it('does not take an emptied editor for a comment', () => {
    expect(commentTextSchema.safeParse('<p><br></p>').success).toBe(false)
    expect(commentTextSchema.safeParse('').success).toBe(false)
  })

  // The markup would otherwise spend the allowance the writer is counting in words.
  it('measures the words rather than the markup around them', () => {
    const long = `<p><strong>${'a'.repeat(2000)}</strong></p>`

    expect(commentTextSchema.safeParse(long).success).toBe(true)
    expect(commentTextSchema.safeParse(`<p>${'a'.repeat(2001)}</p>`).success).toBe(false)
  })
})

describe('recording a comment', () => {
  it('stores the formatting it was written with', () => {
    expect(toCreateCommentRequest(values, 'mentor-1').comment).toBe(
      '<p>Good progress on the connector.</p>',
    )
  })

  // The editor keeps a paragraph below the writing so there is somewhere to click.
  it('leaves the editor’s trailing paragraph out of what is stored', () => {
    expect(
      toCreateCommentRequest({ ...values, comment: '<p>Looks right.</p><p></p>' }, 'mentor-1')
        .comment,
    ).toBe('<p>Looks right.</p>')
  })
})
