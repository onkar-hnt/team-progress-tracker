/**
 * Building and downloading a CSV, in the browser.
 *
 * CSV rather than a spreadsheet or a PDF. A report of dated rows is exactly what
 * the format is for, it opens in Excel, Sheets and Numbers without asking, and
 * it needs nothing added to the bundle — the workbook library already in the
 * dependency tree belongs to the Excel data source and is not for this.
 */

/**
 * Characters that make a spreadsheet treat a cell as a formula rather than as
 * text.
 *
 * The cells here carry text somebody typed into a form — a remark, a blocker
 * description — so a cell beginning with one of these is a real possibility,
 * and in Excel it becomes something that runs when the file is opened.
 *
 * Neutralised with a leading apostrophe, which Excel and Sheets both read as
 * "this is text" and do not display. It is visible in a plain text editor, and
 * `-` is included even though it means a remark written as a bullet point
 * arrives with one: a report is read far more often in a spreadsheet than in a
 * text editor, and the alternative is leaving the hole open for cosmetics.
 */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

/** Quoting is only required for these, and quoting everything makes diffs noisy. */
const MUST_QUOTE = /["\n\r,]/u

function escapeCell(value: string): string {
  const guarded = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value

  if (!MUST_QUOTE.test(guarded)) return guarded

  // A quote inside a quoted field is written twice. RFC 4180.
  return `"${guarded.replaceAll('"', '""')}"`
}

/**
 * Joins rows into CSV text.
 *
 * CRLF line endings, per RFC 4180 — the one thing older spreadsheet importers
 * are consistently strict about.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

/**
 * Turns a name into something safe to put in a filename.
 *
 * Lower case, words joined by hyphens, everything else dropped: `Shubham
 * Deshmukh` becomes `shubham-deshmukh`. Not reversible, and not meant to be —
 * the filename is a label for a person, and the report says who it is about
 * inside as well.
 */
export function toFilenameSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '') || 'report'
  )
}

/**
 * Hands the file to the browser.
 *
 * A blob and a synthetic click, which is the only way to name a download from
 * the client. The byte-order mark is what makes Excel on Windows read the file
 * as UTF-8; without it a name with an accent in it arrives mangled.
 *
 * The object URL is revoked straight away. The click has already been
 * dispatched by then and the browser has taken its own reference to the blob, so
 * releasing ours does not cancel the download — and not releasing it leaks the
 * whole file until the tab closes.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'

  document.body.append(link)
  link.click()
  link.remove()

  URL.revokeObjectURL(url)
}
