/**
 * A written description is stored as a small subset of HTML: paragraphs, bold,
 * italic, underline, strikethrough, headings and lists. The editor writes it
 * and `RichText` reads it back, both against the same subset.
 *
 * Everything here is a plain string transform with no DOM, so the same rules
 * hold in the form, in a test and in the CSV export.
 */

// Only the tags this subset is written with. Anything else in an entry is
// somebody describing a tag rather than using one, and reads as the text it is.
const MARKUP = /<\/?(?:p|br|strong|b|em|i|u|s|del|strike|h[1-6]|ul|ol|li)\b[^>]*>/iu

// Either edge of a block, or a break, is where a line ends in the plain
// reading. Both edges, so a list nested inside an item starts its own line.
const LINE_BREAK = /<\/?(?:p|h[1-6]|li|ul|ol|div|blockquote)\b[^>]*>|<br\s*\/?>/giu

const ANY_TAG = /<[^>]*>/gu

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/giu, (whole, body: string) => {
    const named = NAMED_ENTITIES[body.toLowerCase()]
    if (named !== undefined) return named

    if (!body.startsWith('#')) return whole

    const code = body.startsWith('#x') || body.startsWith('#X')
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10)

    return Number.isNaN(code) ? whole : String.fromCodePoint(code)
  })
}

/** Whether the value carries formatting, or is text typed before the editor existed. */
export function isMarkup(value: string): boolean {
  return MARKUP.test(value)
}

/**
 * Every tag off, whatever it is. For reading a fragment that is known to be
 * markup, such as the bullet Word drew, where no guess has to be made.
 */
function stripTags(html: string): string {
  return decodeEntities(html.replace(ANY_TAG, '')).replace(/\s+/gu, ' ').trim()
}

/**
 * The words without the markup, for a CSV cell, a search and a length check.
 * Text written before the editor existed passes through as it is.
 */
export function richTextToPlainText(value: string): string {
  if (!isMarkup(value)) return value.trim()

  return decodeEntities(value.replace(LINE_BREAK, '\n').replace(ANY_TAG, ''))
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    // One line per block: the markup says where a line ends, not how many.
    .replace(/\n+/gu, '\n')
    .trim()
}

/** An editor left alone still reports a paragraph, which is nothing written. */
export function isRichTextEmpty(value: string): boolean {
  return richTextToPlainText(value) === ''
}

const EMPTY_PARAGRAPH = String.raw`<p[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>`

const LEADING_BLANKS = new RegExp(`^(?:\\s*${EMPTY_PARAGRAPH})+`, 'giu')

const TRAILING_BLANKS = new RegExp(`(?:${EMPTY_PARAGRAPH}\\s*)+$`, 'giu')

/**
 * What is worth storing.
 *
 * The editor keeps an empty paragraph after a list so there is somewhere to
 * click below it, and reports it along with everything else. It is furniture,
 * not writing, so it does not reach the database.
 */
export function normaliseRichText(value: string): string {
  if (isRichTextEmpty(value)) return ''
  if (!isMarkup(value)) return value.trim()

  return value.replace(LEADING_BLANKS, '').replace(TRAILING_BLANKS, '').trim()
}

function escapeText(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}

/**
 * What the editor should open a stored value with.
 *
 * Entries written before the editor existed are plain text with line breaks in
 * them. Handed over as they are, the editor would read the whole thing as one
 * paragraph and the breaks would be lost on the next save, so the lines are
 * made into paragraphs first. Text is escaped on the way, since a description
 * that happens to mention a tag is describing one, not carrying one.
 */
export function toEditorContent(value: string): string {
  if (isMarkup(value)) return value
  if (value.trim() === '') return ''

  return value
    .split(/\n/u)
    .map((line) => `<p>${escapeText(line)}</p>`)
    .join('')
}

// Word and Outlook wrap the bullet or number it drew in a conditional comment.
const WORD_MARKER = /<!--\[if !supportLists\]-->([\s\S]*?)<!\[endif\]-->/giu

const WORD_IGNORED_SPAN = /<span[^>]*mso-list:\s*ignore[^>]*>([\s\S]*?)<\/span>/giu

// The same two without /g, for reading one marker rather than clearing them all.
const ONE_WORD_MARKER = /<!--\[if !supportLists\]-->([\s\S]*?)<!\[endif\]-->/iu

const ONE_IGNORED_SPAN = /<span[^>]*mso-list:\s*ignore[^>]*>([\s\S]*?)<\/span>/iu

const REMOVED_BLOCKS = /<(script|style|xml|title)\b[^>]*>[\s\S]*?<\/\1\s*>/giu

const REMOVED_TAGS = /<(?:meta|link)\b[^>]*>/giu

const COMMENTS = /<!--[\s\S]*?-->/gu

const OFFICE_TAGS = /<\/?[a-z]+:[a-z]+[^>]*>/giu

// A Word list item is a paragraph that only says it is one, in its style.
const WORD_LIST_PARAGRAPH = /<p\b[^>]*mso-list:\s*l\d+\s+level(\d+)[^>]*>([\s\S]*?)<\/p>/giu

const ORDERED_MARKER = /^\s*(?:[0-9]+|[a-z]+|[ivxlcdm]+)\s*[.)]/iu

interface WordItem {
  level: number
  ordered: boolean
  html: string
}

function isOrderedMarker(marker: string): boolean {
  const text = stripTags(marker)

  // A single letter bullet is Word's Symbol font, not a lettered list.
  if (['o', '§', '·', '•', '-'].includes(text)) return false

  return ORDERED_MARKER.test(text)
}

function openTag(ordered: boolean): string {
  return ordered ? '<ol>' : '<ul>'
}

function closeTag(ordered: boolean | undefined): string {
  return ordered === true ? '</ol>' : '</ul>'
}

/** Nests the flat run of Word paragraphs by the level each one declares. */
function toNestedList(items: readonly WordItem[]): string {
  // One entry per open list, innermost last, holding whether it is numbered.
  const open: boolean[] = []
  let html = ''

  for (const item of items) {
    // A jump of several levels nests once: a child was meant, not four of them.
    const level = Math.min(item.level, open.length + 1)

    while (open.length > level) html += `</li>${closeTag(open.pop())}`

    if (open.length === level) {
      html += '</li>'

      if (open.at(-1) !== item.ordered) {
        html += closeTag(open.pop()) + openTag(item.ordered)
        open.push(item.ordered)
      }
    }

    while (open.length < level) {
      html += openTag(item.ordered)
      open.push(item.ordered)
    }

    html += `<li>${item.html}`
  }

  while (open.length > 0) html += `</li>${closeTag(open.pop())}`

  return html
}

/**
 * Makes pasted content into the subset the editor keeps.
 *
 * Word does not paste lists as lists: it pastes paragraphs that name a list
 * level in their style and draw the bullet themselves. Those are rebuilt here,
 * because everything the editor does not recognise is dropped, and a list that
 * arrives as paragraphs arrives as paragraphs for good.
 *
 * Styles are deliberately left in place. Google Docs says bold with
 * `font-weight: 700` rather than a tag, and the editor reads that itself;
 * whatever it does not read, it discards.
 */
export function cleanPastedRichText(html: string): string {
  const withoutNoise = html.replace(REMOVED_BLOCKS, '').replace(REMOVED_TAGS, '')

  const items: WordItem[] = []
  let cleaned = ''
  let cursor = 0

  const flush = (): void => {
    if (items.length === 0) return

    cleaned += toNestedList(items)
    items.length = 0
  }

  for (const match of withoutNoise.matchAll(WORD_LIST_PARAGRAPH)) {
    const between = withoutNoise.slice(cursor, match.index)

    // Only whitespace between two list paragraphs keeps the run going.
    if (stripTags(between) !== '') {
      flush()
      cleaned += between
    }

    const inner = match[2] ?? ''
    const marker = ONE_WORD_MARKER.exec(inner)?.[1] ?? ONE_IGNORED_SPAN.exec(inner)?.[1] ?? ''

    items.push({
      level: Math.max(1, Number.parseInt(match[1] ?? '1', 10) || 1),
      ordered: isOrderedMarker(marker === '' ? inner : marker),
      html: inner.replace(WORD_MARKER, '').replace(WORD_IGNORED_SPAN, ''),
    })

    cursor = match.index + match[0].length
  }

  flush()
  cleaned += withoutNoise.slice(cursor)

  return cleaned
    .replace(WORD_MARKER, '')
    .replace(WORD_IGNORED_SPAN, '')
    .replace(COMMENTS, '')
    .replace(OFFICE_TAGS, '')
    .replace(/<p\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/giu, '')
}
