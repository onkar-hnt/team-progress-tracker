import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

import { Icon } from '@components/ui/icons/Icon'

import './Dropdown.scss'

// Native select cannot style options or cap list height; this keeps keyboard and type-ahead.
// List is position: fixed to escape modal/table overflow but stays inside the dialog subtree.

export interface DropdownOption {
  readonly value: string
  readonly label: string

  /** Heading this option sits under, mirroring `<optgroup>`. */
  readonly group?: string

  readonly disabled?: boolean
}

interface DropdownProps {
  /** Include the empty choice in options when clearing is allowed. */
  options: readonly DropdownOption[]

  value: string
  onChange: (value: string) => void

  /** Points a `<label for>` at the control. */
  id?: string

  disabled?: boolean
  isInvalid?: boolean

  /** Smaller variant for table rows and list items. */
  isCompact?: boolean

  /** For react-hook-form's touched tracking. */
  onBlur?: () => void

  /** An accessible name, where no visible label points at this. */
  ariaLabel?: string
}

// Must match 2.25rem row height in Dropdown.scss.
const OPTION_HEIGHT = 36

const LIST_PADDING = 8

const VISIBLE_OPTIONS = 6

const MAX_LIST_HEIGHT = OPTION_HEIGHT * VISIBLE_OPTIONS + LIST_PADDING

const GAP = 4

interface Placement {
  left: number
  width: number
  maxHeight: number

  /** Set when the list opens downwards. */
  top?: number

  /** Set instead when it opens upwards, measured from the viewport bottom. */
  bottom?: number
}

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

  const [activeIndex, setActiveIndex] = useState(-1)

  const searchRef = useRef({ term: '', at: 0 })

  const selectedIndex = options.findIndex((option) => option.value === value)
  const selected = selectedIndex === -1 ? undefined : options[selectedIndex]

  const widestLabel = useMemo(
    () =>
      options.reduce(
        (widest, option) => (option.label.length > widest.length ? option.label : widest),
        '',
      ),
    [options],
  )

  const optionId = (index: number) => `${generatedId}-option-${String(index)}`

  const place = useCallback(() => {
    const trigger = triggerRef.current
    if (trigger === null) return

    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - GAP * 2
    const above = rect.top - GAP * 2

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

    // capture: modal body scroll; passive: read-only layout.
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    window.addEventListener('resize', reposition)

    return () => {
      window.removeEventListener('scroll', reposition, { capture: true })
      window.removeEventListener('resize', reposition)
    }
  }, [isOpen, place])

  useEffect(() => {
    if (!isOpen) return

    // pointerdown dismisses before the element underneath receives click.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && containerRef.current?.contains(target) === true) return

      close()
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [close, isOpen])

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
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1

        if (!isOpen) {
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

        // stopPropagation so Escape closes the list, not the parent dialog.
        event.preventDefault()
        event.stopPropagation()
        close()
        return
      }

      case 'Tab': {
        if (isOpen) close()
        return
      }

      default: {
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

        // Type-ahead highlights only; native select would commit on each keystroke.
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

          {/* Hidden sizer reserves width for the longest option. */}
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
          // Trigger keeps focus; aria-activedescendant drives keyboard selection.
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
                onClick={(event) => {
                  // preventDefault stops implicit label activation from re-opening the list.
                  event.preventDefault()
                  commit(index)
                }}
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
