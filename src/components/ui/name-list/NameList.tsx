import { useState } from 'react'

import { Modal } from '@components/ui/modal/Modal'
import { Tooltip } from '@components/ui/tooltip/Tooltip'

import './NameList.scss'

interface NameListProps {
  names: readonly string[]

  /** Dialog title — should name whose list this is. */
  title: string

  visible?: number

  emptyLabel?: string
}

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
