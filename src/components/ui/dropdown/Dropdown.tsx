import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { Icon } from '@components/ui/icons/Icon'

import './Dropdown.scss'

/**
 * A dropdown built out of ordinary elements instead of `<select>`.
 *
 * A native `<select>` renders its list with the operating system, which is
 * why its options cannot be styled, cannot be grouped visually beyond
 * `<optgroup>`, and — the reason this exists — cannot be given a height. A
 * developer with thirty tasks got a list as tall as the screen, drawn outside
 * the page and looking nothing like the rest of it.
 *
 * What a native select does well is worth keeping, so this reproduces it
 * rather than settling for a styled box: full keyboard control, type-ahead,
 * and the list closing on Escape or a click elsewhere. Anything less is a
 * downgrade for whoever fills the form in without a mouse.
 *
 * The list is `position: fixed`, which is what lets it hang outside the modal
 * body and the scrolling admin tables. Both clip their overflow, and an
 * absolutely positioned list inside them would be cut off at the edge. It
 * stays in the DOM where it was written rather than being moved to the end of
 * the document, because the forms that use it are opened inside a `<dialog>`,
 * and anything rendered outside that dialog would sit behind its backdrop.
 */

export interface DropdownOption {
  readonly value: string
  readonly label: string

  /** Heading this option sits under, mirroring `<optgroup>`. */
  readonly group?: string

  readonly disabled?: boolean
}

interface DropdownProps {
  /**
   * Options in display order. Include the empty choice — `{ value: '', label:
   * 'Select a project' }` — rather than passing a placeholder separately, so
   * the caller decides whether clearing the field is allowed at all. An empty
   * value is styled as a placeholder automatically.
   */
  options: readonly DropdownOption[]

  value: string
  onChange: (value: string) => void

  /** Points a `<label for>` at the control. */
  id?: string

  disabled?: boolean
  isInvalid?: boolean

  /**
   * Smaller, for a control that sits inside a table row or a list item rather
   * than on a form. Here rather than left to each page's stylesheet, because
   * two screens wanted the same thing and were overriding the same properties
   * in two places.
   */
  isCompact?: boolean

  /** For react-hook-form's touched tracking. */
  onBlur?: () => void

  /** An accessible name, where no visible label points at this. */
  ariaLabel?: string
}

/**
 * The height of one row, in pixels, matching the `2.25rem` in `Dropdown.scss`.
 *
 * Every row is stated to be exactly this tall there, so this is a fact about
 * the list rather than a guess at it. Duplicated here because the list is cut
 * to a whole number of rows, and a height only the stylesheet knows cannot be
 * divided.
 */
const OPTION_HEIGHT = 36

/** The list's own padding, top and bottom together. Also from the stylesheet. */
const LIST_PADDING = 8

/**
 * How many rows are visible before the list scrolls instead of growing.
 *
 * Low on purpose. The list has to stop growing early enough that adding options
 * stops changing how tall it is — a list that only scrolls once it is most of
 * the screen tall has a limit in name only.
 */
const VISIBLE_OPTIONS = 6

/**
 * Cut to whole rows rather than a round number of pixels, so a list that
 * scrolls never opens with a half row at the bottom — which reads as the list
 * being clipped rather than as there being more to see.
 */
const MAX_LIST_HEIGHT = OPTION_HEIGHT * VISIBLE_OPTIONS + LIST_PADDING

/** Breathing room between the control and its list, and the viewport edge. */
const GAP = 4

interface Placement {
  left: number

  /**
   * The control's width, exactly.
   *
   * The list is not allowed to be wider than what opened it. Sized to its own
   * content it came out wider than the control and the two read as unrelated —
   * so the control reserves the width its options need instead, and the list
   * simply follows. See `dropdown__sizer`.
   */
  width: number

  maxHeight: number

  /** Set when the list opens downwards. */
  top?: number

  /** Set instead when it opens upwards, measured from the viewport bottom. */
  bottom?: number
}

/** The gap between two options that are not in the same group. */
function startsGroup(options: readonly DropdownOption[], index: number): boolean {
  const group = options[index]?.group
  if (group === undefined) return false

  return index === 0 || options[index - 1]?.group !== group
}

export function Dropdown({
  ariaLabel,
  disabled = false,
  id,
  isCompact = false,
  isInvalid = false,
  onBlur,
  onChange,
  options,
  value,
}: DropdownProps) {
  const generatedId = useId()
  const listId = `${generatedId}-list`

  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)

  /** Which option the keyboard is on, which is not yet which one is chosen. */
  const [activeIndex, setActiveIndex] = useState(-1)

  /** Accumulated type-ahead, and when it was last added to. */
  const searchRef = useRef({ term: '', at: 0 })

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex]

  // Measured by character count rather than by rendering each one: the point is
  // to reserve a sensible width, not an exact one, and laying out every option
  // to find the widest would cost a reflow on each render.
  const widestLabel = useMemo(
    () =>
      options.reduce(
        (widest, option) => (option.label.length > widest.length ? option.label : widest),
        '',
      ),
    [options],
  )

  const optionId = (index: number) => `${generatedId}-option-${String(index)}`

  /**
   * Measures the control and decides where the list goes.
   *
   * Re-run on scroll and resize while open rather than once: a fixed list is
   * placed against the viewport, so anything that moves the control leaves it
   * behind. Scroll is captured so an inner scroller — the modal body — counts
   * too, since those events do not bubble to the window.
   */
  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger === null) return

    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - GAP * 2
    const above = rect.top - GAP * 2

    // Downwards unless it genuinely does not fit and there is more room the
    // other way. Flipping as soon as the list is merely taller than the space
    // would send it upwards on a nearly full screen, which reads as a glitch.
    const opensUp = below < Math.min(MAX_LIST_HEIGHT, above) && above > below

    setPlacement({
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(Math.min(MAX_LIST_HEIGHT, opensUp ? above : below), 0),
      ...(opensUp ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
    })
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setActiveIndex(-1)
  }, [])

  const open = useCallback(
    (startAt: number) => {
      if (disabled) return

      place()
      setActiveIndex(startAt)
      setIsOpen(true)
    },
    [disabled, place],
  )

  useEffect(() => {
    if (!isOpen) return

    const reposition = () => place()

    // `capture` so scrolling inside the modal body reaches this, and `passive`
    // because it only reads layout.
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    window.addEventListener('resize', reposition)

    return () => {
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
    }
  }, [isOpen, place])

  useEffect(() => {
    if (!isOpen) return

    // `pointerdown` rather than `click`, so pressing outside dismisses the
    // list before the thing underneath reacts to being pressed.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target) === true) return

      close()
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close, isOpen])

  // Keeps the highlighted option inside the scrolling area. `nearest` so
  // stepping through the list moves it one row at a time instead of jumping
  // the highlighted option to the middle.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return

    listRef.current
      ?.querySelector(`[data-index="${String(activeIndex)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  const findEnabled = (from: number, direction: 1 | -1): number => {
    for (let offset = 1; offset <= options.length; offset += 1) {
      const next = from + direction * offset
      if (next < 0 || next >= options.length) break
      if (options[next]?.disabled !== true) return next
    }

    return from
  }

  const firstEnabled = (direction: 1 | -1): number =>
    findEnabled(direction === 1 ? -1 : options.length, direction)

  const commit = (index: number) => {
    const option = options[index]
    if (option === undefined || option.disabled === true) return

    onChange(option.value)
    close()

    // Focus never left the trigger — the list is driven by
    // `aria-activedescendant` — so there is nothing to restore.
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1

        if (!isOpen) {
          // Opening onto whatever is already chosen, so arrowing from a set
          // value continues from there rather than from the top.
          open(selectedIndex === -1 ? firstEnabled(direction) : selectedIndex)
          return
        }

        setActiveIndex((current) =>
          current === -1 ? firstEnabled(direction) : findEnabled(current, direction),
        )
        return
      }

      case 'Home':
      case 'End': {
        if (!isOpen) return
        event.preventDefault()
        setActiveIndex(firstEnabled(event.key === 'Home' ? 1 : -1))
        return
      }

      case 'Enter':
      case ' ': {
        event.preventDefault()

        if (!isOpen) {
          open(selectedIndex === -1 ? firstEnabled(1) : selectedIndex)
          return
        }

        commit(activeIndex)
        return
      }

      case 'Escape': {
        if (!isOpen) return

        // Stopped here so Escape closes the list and not the dialog the form
        // is sitting in.
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }

      case 'Tab': {
        // Not prevented: moving on should move on. The list is only dismissed.
        if (isOpen) close()
        return
      }

      default: {
        // Type-ahead. A single printable character, with modifiers excluded so
        // browser shortcuts still work.
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return

        event.preventDefault()

        const now = Date.now()
        const previous = searchRef.current
        const term =
          now - previous.at > 600
            ? event.key.toLowerCase()
            : previous.term + event.key.toLowerCase()

        searchRef.current = { term, at: now }

        const match = options.findIndex(
          (option) => option.disabled !== true && option.label.toLowerCase().startsWith(term),
        )

        if (match === -1) return

        // Highlighted rather than chosen, even when closed. A native select
        // changes the value as you type, which on a form that saves what it is
        // given is a change nobody asked for.
        if (!isOpen) open(match)
        else setActiveIndex(match)
      }
    }
  }

  return (
    <div className={`dropdown${isCompact ? ' dropdown--compact' : ''}`} ref={containerRef}>
      <button
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-controls={isOpen ? listId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={isInvalid ? 'true' : undefined}
        aria-label={ariaLabel}
        className="dropdown__trigger"
        disabled={disabled}
        id={id}
        onBlur={onBlur}
        onClick={() => {
          if (isOpen) close()
          else open(selectedIndex === -1 ? firstEnabled(1) : selectedIndex)
        }}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span className="dropdown__value">
          <span
            className={`dropdown__label${selected === undefined || selected.value === '' ? ' dropdown__label--placeholder' : ''}`}
          >
            {selected?.label ?? ''}
          </span>

          {/* Holds the control open to the width of its longest option, so the
              list — which is exactly as wide as the control — has room for all
              of them. Stacked behind the label rather than beside it, and zero
              height, so it takes part in width and in nothing else.

              Only has an effect where the control is free to grow. In a form
              field of a fixed width it is clipped and changes nothing. */}
          <span aria-hidden="true" className="dropdown__sizer">
            {widestLabel}
          </span>
        </span>
        <Icon name="chevron-down" size={18} />
      </button>

      {isOpen && placement !== null ? (
        <ul
          className="dropdown__list"
          id={listId}
          // Kept out of the tab order and off the focus path: the trigger keeps
          // focus and points at the active option instead, which is what makes
          // typing and arrowing work without a focus trap.
          onPointerDown={(event) => event.preventDefault()}
          ref={listRef}
          role="listbox"
          style={{
            bottom: placement.bottom,
            left: placement.left,
            maxHeight: placement.maxHeight,
            top: placement.top,
            width: placement.width,
          }}
        >
          {options.map((option, index) => (
            <Fragment key={option.value}>
              {startsGroup(options, index) ? (
                <li className="dropdown__group" role="presentation">
                  {option.group}
                </li>
              ) : null}

              <li
                aria-disabled={option.disabled === true ? 'true' : undefined}
                aria-selected={option.value === value}
                className="dropdown__option"
                data-active={index === activeIndex ? 'true' : undefined}
                data-index={index}
                id={optionId(index)}
                onClick={() => commit(index)}
                onPointerEnter={() => {
                  if (option.disabled !== true) setActiveIndex(index)
                }}
                role="option"
              >
                {option.label}
              </li>
            </Fragment>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
