/** Prefixes that make Excel treat a cell as a formula; neutralised with a leading apostrophe. */
const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

const MUST_QUOTE = /["\n\r,]/u

function escapeCell(value: string): string {
  const guarded = FORMULA_PREFIXES.some((prefix) => value.startsWith(prefix)) ? `'${value}` : value

  if (!MUST_QUOTE.test(guarded)) return guarded

  // A quote inside a quoted field is written twice. RFC 4180.
  return `"${guarded.replaceAll('"', '""')}"`
}

/** CRLF line endings per RFC 4180. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')
}

export function toFilenameSlug(text: string): string {
  return (
    text
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, '-')
      .replaceAll(/^-+|-+$/gu, '') || 'report'
  )
}

/** UTF-8 BOM helps Excel on Windows read accented characters. Revoke the object URL after click. */
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
