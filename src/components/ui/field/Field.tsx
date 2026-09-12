import type { ComponentPropsWithRef, ReactNode } from 'react'

/**
 * A labelled form control.
 *
 * There were five copies of this before: `.form__field`, and then again as
 * `.daily-update-form__field`, `.login__field`, `.activity-filters__field` and
 * `.reports-page__field`, each with its own `__error` and `__hint` beside it and
 * each having drifted a little from the others. Forty-two blocks of markup
 * repeated the label, the control, the `aria-invalid` and the error paragraph by
 * hand, and only the login screen also wired up `aria-describedby` — so on
 * every other screen a screen reader announced an invalid field without saying
 * why.
 *
 * Passing `error` now does all three things at once: it marks the control
 * invalid, renders the message, and points the control at it. They cannot
 * disagree, because they are one prop.
 */

interface FieldProps {
  label: string

  /**
   * The `id` of the control inside.
   *
   * Given, the label is a real `<label>` and clicking it focuses the control.
   * Left out — for a group of checkboxes, say, where there is no single control
   * to point at — the label is rendered as plain text instead.
   */
  htmlFor?: string

  /** Guidance shown under the control, whether or not anything is wrong. */
  hint?: string

  /** The validation message. Absent means valid. */
  error?: string

  /** Spans every column of a multi-column form grid. */
  isWide?: boolean

  children: ReactNode
}

/** The id the error paragraph is given, so a control can point `aria-describedby` at it. */
function errorId(htmlFor: string): string {
  return `${htmlFor}-error`
}

export function Field({ children, error, hint, htmlFor, isWide = false, label }: FieldProps) {
  return (
    <div className={isWide ? 'form__field form__field--wide' : 'form__field'}>
      {htmlFor === undefined ? <span>{label}</span> : <label htmlFor={htmlFor}>{label}</label>}

      {children}

      {error === undefined ? null : (
        <p className="form__error" id={htmlFor === undefined ? undefined : errorId(htmlFor)}>
          {error}
        </p>
      )}

      {hint === undefined ? null : <p className="form__hint">{hint}</p>}
    </div>
  )
}

/** The accessibility wiring every control in a `Field` needs. */
function invalidProps(
  id: string,
  error: string | undefined,
): { 'aria-describedby': string | undefined; 'aria-invalid': 'true' | undefined } {
  return {
    'aria-describedby': error === undefined ? undefined : errorId(id),
    'aria-invalid': error === undefined ? undefined : 'true',
  }
}

type ControlOwnProps = Omit<FieldProps, 'children' | 'htmlFor'> & { id: string }

type TextFieldProps = ControlOwnProps &
  Omit<ComponentPropsWithRef<'input'>, 'aria-describedby' | 'aria-invalid' | 'className' | 'id'>

/**
 * A single-line input.
 *
 * Spread `register('name')` onto it as you would onto a bare `<input>`: the
 * name, handlers and ref pass straight through.
 */
export function TextField({ error, hint, id, isWide, label, ...input }: TextFieldProps) {
  return (
    <Field error={error} hint={hint} htmlFor={id} isWide={isWide} label={label}>
      <input id={id} {...invalidProps(id, error)} {...input} />
    </Field>
  )
}

type TextAreaFieldProps = ControlOwnProps &
  Omit<ComponentPropsWithRef<'textarea'>, 'aria-describedby' | 'aria-invalid' | 'className' | 'id'>

export function TextAreaField({ error, hint, id, isWide, label, ...textarea }: TextAreaFieldProps) {
  return (
    <Field error={error} hint={hint} htmlFor={id} isWide={isWide} label={label}>
      <textarea id={id} {...invalidProps(id, error)} {...textarea} />
    </Field>
  )
}

type CheckboxFieldProps = Omit<ControlOwnProps, 'error' | 'isWide'> &
  Omit<ComponentPropsWithRef<'input'>, 'className' | 'id' | 'type'>

/**
 * A single tickbox with its label beside it rather than above.
 *
 * No `error`: every one of these is a yes-or-no with a default, so there is
 * nothing for a validator to reject.
 */
export function CheckboxField({ hint, id, label, ...input }: CheckboxFieldProps) {
  return (
    <div className="form__field">
      <label className="form__checkbox" htmlFor={id}>
        <input id={id} type="checkbox" {...input} />
        {label}
      </label>

      {hint === undefined ? null : <p className="form__hint">{hint}</p>}
    </div>
  )
}

interface FilterFieldProps {
  label: string

  /** Takes two columns of the filter grid, for a control that needs the room. */
  isWide?: boolean

  /** Caption beside the control rather than above it, for a filter on its own. */
  isInline?: boolean

  children: ReactNode
}

/**
 * A filter control, captioned rather than labelled.
 *
 * Separate from `Field` because a filter narrows what is shown and cannot be
 * wrong: there is no error to report, nothing to describe, and it is drawn
 * smaller because a row of these sits above the content rather than being it.
 */
export function FilterField({
  children,
  isInline = false,
  isWide = false,
  label,
}: FilterFieldProps) {
  const layout = [isWide ? 'filter-field--wide' : '', isInline ? 'filter-field--inline' : '']
    .filter((name) => name !== '')
    .join(' ')

  return (
    <label className={layout === '' ? 'filter-field' : `filter-field ${layout}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

interface ChecklistOption {
  id: string
  name: string
}

interface ChecklistFieldProps {
  label: string
  options: readonly ChecklistOption[]
  /** The ids currently ticked. */
  selected: readonly string[]
  onToggle: (id: string) => void
  hint?: string
}

/**
 * A scrolling list of tickboxes, for choosing several of many.
 *
 * The two places that needed one — a mentor's employees and a project's team —
 * had written the same map over the same shape twice.
 */
export function ChecklistField({
  hint,
  label,
  onToggle,
  options,
  selected,
}: ChecklistFieldProps) {
  return (
    <Field hint={hint} label={label}>
      <div className="form__checklist">
        {options.map((option) => (
          <label className="form__checkbox" key={option.id}>
            <input
              checked={selected.includes(option.id)}
              onChange={() => onToggle(option.id)}
              type="checkbox"
            />
            {option.name}
          </label>
        ))}
      </div>
    </Field>
  )
}
