import { z } from 'zod'

import { richTextToPlainText } from './rich-text.utils'

/**
 * A limit on a written field, with the message it is refused with.
 *
 * A minimum comes with its own wording: what is too short reads differently
 * field by field, and a count of characters is not what somebody was doing.
 */
type RichTextLimits =
  | { max: number; min?: never; tooShort?: never }
  | { max: number; min: number; tooShort: string }

/**
 * A field written in the editor, measured by what somebody wrote.
 *
 * The markup is not counted towards the limit: a sentence in bold is still a
 * sentence, and nobody writing one is counting tags. Whether a blank field is a
 * problem is left to the form around it, which is the only thing that knows —
 * an editor left alone still reports a paragraph.
 */
export function richTextSchema({ max, min, tooShort }: RichTextLimits) {
  return z
    .string()
    .trim()
    .superRefine((value, ctx) => {
      const length = richTextToPlainText(value).length

      if (min !== undefined && length < min) {
        ctx.addIssue({ code: 'custom', message: tooShort })
        return
      }

      if (length > max) {
        ctx.addIssue({ code: 'custom', message: `Keep this under ${max} characters` })
      }
    })
}
