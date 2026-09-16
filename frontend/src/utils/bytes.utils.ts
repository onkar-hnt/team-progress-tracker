const KILOBYTE = 1024
const MEGABYTE = KILOBYTE * 1024
const GIGABYTE = MEGABYTE * 1024

export { GIGABYTE, MEGABYTE }

/** Binary units, labelled the way database size limits are quoted. */
export function formatBytes(bytes: number): string {
  if (bytes < KILOBYTE) return `${String(bytes)} B`
  if (bytes < MEGABYTE) return `${String(Math.round(bytes / KILOBYTE))} KB`
  if (bytes < GIGABYTE) return `${(bytes / MEGABYTE).toFixed(1)} MB`

  return `${(bytes / GIGABYTE).toFixed(2)} GB`
}
