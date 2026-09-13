const KILOBYTE = 1024
const MEGABYTE = KILOBYTE * 1024
const GIGABYTE = MEGABYTE * 1024

export { GIGABYTE, MEGABYTE }

/**
 * Bytes as somebody would say them: "4 KB", "1.2 MB", "1.40 GB".
 *
 * A decimal place from a megabyte upwards and none below, which is where the digit
 * starts carrying information: the difference between 4 KB and 4.2 KB is nothing
 * anybody acts on, and the difference between 480 MB and 500 MB is a full database.
 *
 * Binary units throughout, and labelled the way the rest of the industry mislabels
 * them, because these numbers are read against Supabase's own — and its plan limits
 * are powers of two written as "500 MB" and "1 GB".
 */
export function formatBytes(bytes: number): string {
  if (bytes < KILOBYTE) return `${String(bytes)} B`
  if (bytes < MEGABYTE) return `${String(Math.round(bytes / KILOBYTE))} KB`
  if (bytes < GIGABYTE) return `${(bytes / MEGABYTE).toFixed(1)} MB`

  return `${(bytes / GIGABYTE).toFixed(2)} GB`
}
