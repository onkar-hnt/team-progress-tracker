import { useState } from 'react'
import type { ComponentPropsWithRef, ReactNode } from 'react'

import { Icon } from '@components/ui/icons/Icon'

interface FieldProps {
  label: string

  /** Given, the label is a real `<label>`; omitted for checkbox groups. */
  htmlFor?: string

  hint?: string

  /** Absent means valid; wires aria-invalid and aria-describedby when set. */
  error?: string

  /** Spans every column of a multi-column form grid. */
  isWide?: boolean

  children: ReactNode
}

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

export function TextField({ error, hint, id, isWide, label, ...input }: TextFieldProps) {
  return (
    <Field error={error} hint={hint} htmlFor={id} isWide={isWide} label={label}>
      <input id={id} {...invalidProps(id, error)} {...input} />
    </Field>
  )
}

type PasswordFieldProps = ControlOwnProps &
  Omit<
    ComponentPropsWithRef<'input'>,
    'aria-describedby' | 'aria-invalid' | 'className' | 'id' | 'type'
  >

export function PasswordField({ error, hint, id, isWide, label, ...input }: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <Field error={error} hint={hint} htmlFor={id} isWide={isWide} label={label}>
      <div className="form__password">
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          {...invalidProps(id, error)}
          {...input}
        />

        <button
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          className="form__password-toggle"
          onClick={() => {
            setIsVisible(!isVisible)
          }}
          type="button"
        >
          <Icon name={isVisible ? 'eye-off' : 'eye'} size={18} />
        </button>
      </div>
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
  /** Ids that stay ticked and cannot be cleared. */
  disabledIds?: readonly string[]
}

export function ChecklistField({
  disabledIds = [],
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
              disabled={disabledIds.includes(option.id)}
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
