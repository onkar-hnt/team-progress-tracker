import { useState } from 'react'

import { Modal } from '@components/ui/modal/Modal'
import { Tooltip } from '@components/ui/tooltip/Tooltip'

import './NameList.scss'

interface NameListProps {
  /** Names in the order they should read. */
  names: readonly string[]

  /**
   * Heading for the popup listing all of them. Should say whose they are —
   * "Developers assigned to Onkar Ingawale" — since the row is out of sight
   * once the dialog is open.
   */
  title: string

  /** How many are named before the rest are only counted. */
  visible?: number

  /** For when there are none at all. */
  emptyLabel?: string
}

/**
 * A few names, and a count of the rest.
 *
 * A table cell listing everybody assigned to a mentor or a project pushed its
 * row to two or three lines and made the column the widest one on the screen,
 * for a list nobody reads in full at a glance. Naming the first couple answers
 * "roughly who?" in one line; the count answers "how many?"; and the rest are a
 * click away for the one time in ten that the exact list matters.
 *
 * The dialog is mounted only while it is open. A closed `<dialog>` still
 * renders its own heading, and one per row would put dozens of elements
 * carrying the same id into the page.
 */
export function NameList({ emptyLabel = 'None', names, title, visible = 2 }: NameListProps) {
  const [isShowingAll, setIsShowingAll] = useState(false)

  if (names.length === 0) return <>{emptyLabel}</>

  const hidden = names.length - visible

  return (
    <>
      <span className="name-list">
        <span>{names.slice(0, visible).join(', ')}</span>

        {hidden <= 0 ? null : (
          <button
            className="name-list__more"
            onClick={() => setIsShowingAll(true)}
            type="button"
          >
            +{hidden} more
          </button>
        )}
      </span>

      {!isShowingAll ? null : (
        <Modal isOpen onClose={() => setIsShowingAll(false)} title={title}>
          {/* Keyed by position, since two people can share a name and the list
              is read-only for as long as it is open. */}
          <ul className="name-list__all">
            {names.map((name, index) => (
              <li key={index}>
                <Tooltip clips label={name}>
                  {name}
                </Tooltip>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  )
}
