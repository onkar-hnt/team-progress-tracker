/** First and last initial, for the avatar badges beside a name. */
export function initialsOf(name: string, fallback = ''): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((word) => word !== '')

  const first = words[0]?.[0] ?? fallback.trim()[0] ?? '-'
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''

  return `${first}${last}`.toUpperCase()
}
