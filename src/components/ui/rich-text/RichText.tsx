import { Fragment, createElement, useMemo } from 'react'
import type { ReactNode } from 'react'

import { isMarkup } from '@utils/rich-text.utils'

import './RichText.scss'

interface RichTextProps {
  /** Stored description markup, or text from before the editor existed. */
  value: string
}

/**
 * The elements a description may render as, and what each stored tag becomes.
 *
 * This is the whole of it. An element that is not named here contributes its
 * text and nothing else, so markup from anywhere — a paste the editor missed, a
 * row written straight into the database — cannot bring behaviour with it. No
 * attribute is carried over either, which is what rules out a script, an event
 * handler or a styled overlay.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  B: 'strong',
  BR: 'br',
  DEL: 's',
  EM: 'em',
  H1: 'h2',
  H2: 'h2',
  H3: 'h3',
  H4: 'h4',
  H5: 'h4',
  H6: 'h4',
  I: 'em',
  LI: 'li',
  OL: 'ol',
  P: 'p',
  S: 's',
  STRIKE: 's',
  STRONG: 'strong',
  U: 'u',
  UL: 'ul',
}

const VOID_ELEMENTS: readonly string[] = ['br']

/// Dropped whole rather than unwrapped: the text inside these is instruction,
/// not writing, and reading it out would put a script's source on the screen.
const DROPPED: readonly string[] = [
  'EMBED',
  'HEAD',
  'IFRAME',
  'LINK',
  'META',
  'NOSCRIPT',
  'OBJECT',
  'SCRIPT',
  'STYLE',
  'TEMPLATE',
  'TITLE',
]

function renderNodes(nodes: NodeListOf<ChildNode>): ReactNode[] {
  return [...nodes].map((node, index) => {
    const key = String(index)

    if (node.nodeType === Node.TEXT_NODE) {
      return <Fragment key={key}>{node.textContent}</Fragment>
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return null
    if (DROPPED.includes(node.nodeName)) return null

    const tag = ALLOWED[node.nodeName]
    const children = renderNodes(node.childNodes)

    if (tag === undefined) return <Fragment key={key}>{children}</Fragment>
    if (VOID_ELEMENTS.includes(tag)) return createElement(tag, { key })

    return createElement(tag, { key }, children)
  })
}

/**
 * A description with its formatting shown.
 *
 * Takes its size and colour from around it, so the same text reads as a table
 * cell in one place and as a paragraph in another.
 */
export function RichText({ value }: RichTextProps) {
  const content = useMemo<ReactNode>(() => {
    if (value.trim() === '') return null

    // Text typed before the editor existed is text, line breaks and all.
    if (!isMarkup(value)) return <p className="rich-text__plain">{value}</p>

    const parsed = new DOMParser().parseFromString(value, 'text/html')

    return renderNodes(parsed.body.childNodes)
  }, [value])

  if (content === null) return null

  return <div className="rich-text">{content}</div>
}
