import { useEffect, useRef } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extensions'

import { Field } from '@components/ui/field/Field'
import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@models/ui.model'
import { cleanPastedRichText, toEditorContent } from '@utils/rich-text/rich-text.utils'

import './RichTextField.scss'

export interface RichTextFieldProps {
  id: string
  label: string
  hint?: string
  error?: string
  isWide?: boolean
  placeholder?: string
  value: string

  /** Omitted where the value is held in state rather than by a form. */
  onBlur?: () => void

  onChange: (next: string) => void
}

interface ToolProps {
  icon: IconName
  label: string
  isActive?: boolean
  isDisabled?: boolean
  onApply: () => void
}

function Tool({ icon, isActive = false, isDisabled = false, label, onApply }: ToolProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={isActive}
      className="rich-text-field__tool"
      disabled={isDisabled}
      onClick={onApply}
      title={label}
      type="button"
    >
      <Icon name={icon} size={16} />
    </button>
  )
}

/**
 * The extensions are the whole of what a description may hold. Anything outside
 * them is dropped on the way in, whether it was typed, pasted or pushed at the
 * editor by hand, which is also what keeps pasted markup from carrying
 * behaviour with it.
 */
function extensionsFor(placeholder: string | undefined) {
  return [
    StarterKit.configure({
      blockquote: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,

      // A description says what was done; a link in one has nowhere to go.
      link: false,

      // Levels below the page's own headings, so a description cannot outrank it.
      heading: { levels: [2, 3, 4] },
    }),
    Placeholder.configure({ placeholder: placeholder ?? '' }),
  ]
}

function editorPropsFor(options: { error: string | undefined; id: string; label: string }) {
  return {
    attributes: {
      'aria-label': options.label,
      'aria-multiline': 'true',
      class: 'rich-text-field__area',
      id: options.id,
      role: 'textbox',
      ...(options.error === undefined
        ? {}
        : { 'aria-describedby': `${options.id}-error`, 'aria-invalid': 'true' }),
    },
    transformPastedHTML: cleanPastedRichText,
  }
}

/**
 * The description box: formatting as it is typed, and the same markup back out.
 *
 * Held as markup rather than as marks somebody has to remember — the toolbar
 * and its shortcuts write what `RichText` reads wherever the entry is shown
 * afterwards.
 */
export function RichTextField({
  error,
  hint,
  id,
  isWide,
  label,
  onBlur,
  onChange,
  placeholder,
  value,
}: RichTextFieldProps) {
  // The value as this field last wrote or read it, so a change from the form
  // around it can be told from the editor's own typing.
  const settled = useRef(value)

  const editor = useEditor({
    extensions: extensionsFor(placeholder),
    content: toEditorContent(value),
    editorProps: editorPropsFor({ error, id, label }),
    onBlur: () => {
      onBlur?.()
    },
    onUpdate: ({ editor: instance }) => {
      const written = instance.getHTML()

      settled.current = written
      onChange(written)
    },
  })

  // Only for a value the editor did not write itself, such as the form being
  // reset after a save. Writing back what it already holds would move the caret.
  useEffect(() => {
    if (value === settled.current) return

    settled.current = value
    editor.commands.setContent(toEditorContent(value), { emitUpdate: false })
  }, [editor, value])

  // Set after mount as well: an error arrives on submit, by which time the
  // editor exists and its props are no longer being read from above.
  useEffect(() => {
    editor.setOptions({ editorProps: editorPropsFor({ error, id, label }) })
  }, [editor, error, id, label])

  const state = useEditorState({
    editor,
    selector: ({ editor: instance }: { editor: Editor }) => ({
      isBold: instance.isActive('bold'),
      isBulleted: instance.isActive('bulletList'),
      isHeading: instance.isActive('heading', { level: 3 }),
      isItalic: instance.isActive('italic'),
      isNumbered: instance.isActive('orderedList'),
      isUnderlined: instance.isActive('underline'),
      isInList: instance.isActive('listItem'),
    }),
  })

  return (
    <Field
      error={error}
      hint={hint}
      htmlFor={id}
      isWide={isWide}
      label={label}
      onLabelClick={() => {
        // The element itself rather than `commands.focus()`, which defers to an
        // animation frame: clicking a caption should land the caret at once,
        // the same as it does for an input.
        editor.view.dom.focus()
      }}
    >
      <div className="rich-text-field">
        <div className="rich-text-field__toolbar">
          <Tool
            icon="bold"
            isActive={state.isBold}
            label="Bold (Ctrl+B)"
            onApply={() => {
              editor.chain().focus().toggleBold().run()
            }}
          />
          <Tool
            icon="italic"
            isActive={state.isItalic}
            label="Italic (Ctrl+I)"
            onApply={() => {
              editor.chain().focus().toggleItalic().run()
            }}
          />
          <Tool
            icon="underline"
            isActive={state.isUnderlined}
            label="Underline (Ctrl+U)"
            onApply={() => {
              editor.chain().focus().toggleUnderline().run()
            }}
          />
          <Tool
            icon="heading"
            isActive={state.isHeading}
            label="Heading"
            onApply={() => {
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }}
          />

          <span className="rich-text-field__divider" />

          <Tool
            icon="list-bulleted"
            isActive={state.isBulleted}
            label="Bulleted list"
            onApply={() => {
              editor.chain().focus().toggleBulletList().run()
            }}
          />
          <Tool
            icon="list-numbered"
            isActive={state.isNumbered}
            label="Numbered list"
            onApply={() => {
              editor.chain().focus().toggleOrderedList().run()
            }}
          />

          <span className="rich-text-field__divider" />

          <Tool
            icon="outdent"
            isDisabled={!state.isInList}
            label="Move out one level (Shift+Tab)"
            onApply={() => {
              editor.chain().focus().liftListItem('listItem').run()
            }}
          />
          <Tool
            icon="indent"
            isDisabled={!state.isInList}
            label="Nest one level (Tab)"
            onApply={() => {
              editor.chain().focus().sinkListItem('listItem').run()
            }}
          />
        </div>

        <EditorContent className="rich-text-field__content" editor={editor} />
      </div>
    </Field>
  )
}
