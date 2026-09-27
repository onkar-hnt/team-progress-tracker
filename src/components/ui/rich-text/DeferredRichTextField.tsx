import { Suspense, lazy } from 'react'

import { Skeleton } from '@components/ui/feedback/Feedback'

import type { RichTextFieldProps } from './RichTextField'

const Editor = lazy(async () => {
  const module = await import('./RichTextField')
  return { default: module.RichTextField }
})

/**
 * The same editor, fetched when the field is first shown rather than with the
 * screen around it.
 *
 * For a field behind a modal: the editor is a few hundred kilobytes of editing
 * machinery, and somebody who opened the screen to read the table should not
 * wait for it. Everywhere the field is the screen's own content, import
 * `RichTextField` directly — deferring it there only adds a flicker.
 */
export function DeferredRichTextField(props: RichTextFieldProps) {
  return (
    <Suspense fallback={<Skeleton label="Opening the editor…" rows={3} />}>
      <Editor {...props} />
    </Suspense>
  )
}
