import type { AnchorHTMLAttributes, ComponentPropsWithRef, ReactNode } from 'react'

import { Icon } from '@components/ui/icons/Icon'
import type { IconName } from '@components/ui/icons/Icon'

import './Button.scss'

/**
 * The one button in the application.
 *
 * Before this, thirty-five call sites wrote `className="button button--ghost
 * button--small"` by hand, and the header carried four bespoke controls that
 * were the same button drawn four times. The class names still exist — they are
 * what `Button.scss` styles — but nobody types them any more, so a variant
 * cannot be misspelled into a button with no styling at all.
 *
 * `className` is deliberately not accepted. The five variants are the whole
 * vocabulary, and a call site reaching past them is how the vocabulary stops
 * being true. Something that genuinely looks different belongs in the
 * stylesheet as a sixth variant.
 */

export type ButtonVariant = 'danger' | 'ghost' | 'inverse' | 'primary' | 'secondary'
export type ButtonSize = 'medium' | 'small'

interface ButtonAppearance {
  variant?: ButtonVariant
  size?: ButtonSize

  /** Drawn before the label. */
  icon?: IconName

  /**
   * Renders the icon alone, in a square control.
   *
   * `children` is still required and still reaches the accessibility tree — it
   * is hidden visually rather than dropped, which is what makes an icon-only
   * control legible to a screen reader without a separate `aria-label` that
   * somebody has to remember to write.
   */
  isIconOnly?: boolean

  /**
   * Drops the label on a narrow screen, leaving the icon.
   *
   * Only meaningful alongside `icon`: a button that collapsed to nothing would
   * still take up space and say nothing.
   */
  collapsesLabel?: boolean
}

/** Icons sit at 22px alone and 18px beside text, so the control keeps its height. */
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
}

function ButtonContent({
  children,
  collapsesLabel = false,
  icon,
  isIconOnly = false,
}: ButtonContentProps) {
  return (
    <>
      {icon === undefined ? null : <Icon name={icon} size={iconSize(isIconOnly)} />}
      <span className={labelClass(isIconOnly, collapsesLabel)}>{children}</span>
    </>
  )
}

/**
 * `ComponentPropsWithRef` rather than `ButtonHTMLAttributes`, so `ref` is among
 * the props. The notification bell needs it: closing the popover has to put
 * focus back on the control that opened it, and a control the caller cannot
 * reach is a control the caller cannot focus.
 */
type ButtonProps = ButtonAppearance &
  Omit<ComponentPropsWithRef<'button'>, 'className'> & { children: ReactNode }

/**
 * `type` defaults to `button` rather than to the HTML default of `submit`.
 *
 * A control inside a form that submits it by accident is the classic version of
 * this bug, and it used to be prevented by every call site remembering to write
 * `type="button"`. A submit button says so.
 */
export function Button({
  children,
  collapsesLabel = false,
  icon,
  isIconOnly = false,
  size = 'medium',
  type = 'button',
  variant = 'secondary',
  ...rest
}: ButtonProps) {
  return (
    <button className={buttonClass({ isIconOnly, size, variant })} type={type} {...rest}>
      <ButtonContent collapsesLabel={collapsesLabel} isIconOnly={isIconOnly} {...{ icon }}>
        {children}
      </ButtonContent>
    </button>
  )
}

type ButtonLinkProps = ButtonAppearance &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> & { children: ReactNode }

/**
 * The same control as a link, for a destination rather than an action.
 *
 * Separate rather than a polymorphic `as` prop, so each one accepts only the
 * attributes its element actually has — `href` and `target` here, `disabled`
 * and `type` there — instead of a union that permits both and honours neither.
 */
export function ButtonLink({
  children,
  collapsesLabel = false,
  icon,
  isIconOnly = false,
  size = 'medium',
  variant = 'secondary',
  ...rest
}: ButtonLinkProps) {
  return (
    <a className={buttonClass({ isIconOnly, size, variant })} {...rest}>
      <ButtonContent collapsesLabel={collapsesLabel} isIconOnly={isIconOnly} {...{ icon }}>
        {children}
      </ButtonContent>
    </a>
  )
}
