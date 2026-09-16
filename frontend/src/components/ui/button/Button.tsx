import type { ComponentPropsWithRef, ReactNode } from 'react'

import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'

import './Button.scss'

export type ButtonVariant =
  | 'danger'
  | 'destructive'
  | 'ghost'
  | 'inverse'
  | 'primary'
  | 'secondary'
export type ButtonSize = 'medium' | 'small'

interface ButtonAppearance {
  variant?: ButtonVariant
  size?: ButtonSize

  /** Drawn before the label. */
  icon?: IconName

  /** Icon-only: children stay in the a11y tree via visually hidden label. */
  isIconOnly?: boolean

  /** Drops the label on narrow screens; only meaningful with icon. */
  collapsesLabel?: boolean
}

function iconSize(isIconOnly: boolean): number {
  return isIconOnly ? 22 : 18
}

function buttonClass({
  isIconOnly = false,
  size = 'medium',
  variant = 'secondary',
}: ButtonAppearance): string {
  return [
    'button',
    `button--${variant}`,
    size === 'small' ? 'button--small' : '',
    isIconOnly ? 'button--icon' : '',
  ]
    .filter((name) => name !== '')
    .join(' ')
}

function labelClass(isIconOnly: boolean, collapsesLabel: boolean): string {
  if (isIconOnly) return 'button__label button__label--hidden'
  if (collapsesLabel) return 'button__label button__label--collapses'
  return 'button__label'
}

interface ButtonContentProps extends ButtonAppearance {
  children: ReactNode
  isLoading?: boolean
}

function ButtonContent({
  children,
  collapsesLabel = false,
  icon,
  isIconOnly = false,
  isLoading = false,
}: ButtonContentProps) {
  return (
    <>
      {isLoading ? (
        <span aria-hidden="true" className="button__spinner" />
      ) : icon === undefined ? null : (
        <Icon name={icon} size={iconSize(isIconOnly)} />
      )}
      <span className={labelClass(isIconOnly, collapsesLabel)}>{children}</span>
    </>
  )
}

type ButtonProps = ButtonAppearance &
  Omit<ComponentPropsWithRef<'button'>, 'className'> & {
    children: ReactNode

    /** Disables during mutation to prevent duplicate writes. */
    isLoading?: boolean
  }

export function Button({
  children,
  collapsesLabel = false,
  disabled = false,
  icon,
  isIconOnly = false,
  isLoading = false,
  size = 'medium',
  type = 'button',
  variant = 'secondary',
  ...rest
}: ButtonProps) {
  return (
    <button
      aria-busy={isLoading ? true : undefined}
      className={buttonClass({ isIconOnly, size, variant })}
      disabled={disabled || isLoading}
      type={type}
      {...rest}
    >
      <ButtonContent
        collapsesLabel={collapsesLabel}
        isIconOnly={isIconOnly}
        isLoading={isLoading}
        {...{ icon }}
      >
        {children}
      </ButtonContent>
    </button>
  )
}
