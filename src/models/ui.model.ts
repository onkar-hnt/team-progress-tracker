/**
 * Shapes the interface components agree on, kept here rather than in the
 * component that happens to render them.
 *
 * These are the vocabulary of the UI rather than of the domain, so they stay in
 * their own model file: a screen asking for an icon or a tone should not have to
 * import from the button it is not using.
 */

export type IconName =
  | 'activity'
  | 'alert'
  | 'bell'
  | 'bold'
  | 'calendar'
  | 'chart'
  | 'check'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
  | 'close'
  | 'comments'
  | 'dashboard'
  | 'database'
  | 'download'
  | 'eye'
  | 'eye-off'
  | 'filter'
  | 'heading'
  | 'inbox'
  | 'indent'
  | 'history'
  | 'info'
  | 'italic'
  | 'key'
  | 'list-bulleted'
  | 'list-numbered'
  | 'menu'
  | 'mentors'
  | 'outdent'
  | 'projects'
  | 'refresh'
  | 'sign-out'
  | 'table'
  | 'tasks'
  | 'trash'
  | 'underline'
  | 'users'
  | 'warning'

export type ButtonVariant =
  | 'danger'
  | 'destructive'
  | 'ghost'
  | 'inverse'
  | 'primary'
  | 'secondary'

export type ButtonSize = 'medium' | 'small'

export interface DropdownOption {
  readonly value: string
  readonly label: string

  /** Heading this option sits under, mirroring `<optgroup>`. */
  readonly group?: string

  readonly disabled?: boolean
}

export type StatCardTone = 'attention' | 'neutral' | 'positive' | 'progress'

export type SnackbarTone = 'error' | 'info' | 'success' | 'warning'

export interface ActiveSnackbar {
  id: string
  tone: SnackbarTone
  message: string
  title?: string

  /** Milliseconds on screen. `0` stays until dismissed. */
  duration: number
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string

  /** Destructive styling and initial focus on Cancel. */
  isDestructive?: boolean

  /** When given, dialog stays open until this settles; rejection closes silently. */
  action?: () => Promise<unknown>
}
