/** null means unfiltered; empty array means none (handled before RPC). */
export function filterList(values: readonly string[] | undefined): string[] | null {
  return values === undefined ? null : [...values]
}
