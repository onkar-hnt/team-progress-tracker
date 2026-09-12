/**
 * Turning a query object into arguments for the list functions.
 *
 * `list_daily_updates`, `list_tasks` and `list_feedback` each take one
 * parameter per predicate and treat null as "no filter on this column", which
 * is how the filter chains they replaced behaved when a key was absent. The
 * translation is one line per parameter and would be unremarkable except for
 * the distinction below, which is easy to lose and changes what comes back.
 */

/**
 * A filter list, or `null` for no filter at all.
 *
 * Absent and empty are opposite answers, not two spellings of one: no list
 * means every row the caller is allowed, an empty list means none. The
 * repositories answer the empty case themselves, without a request, so what
 * reaches here is either a real list or nothing — and `null` has to stand for
 * the second, because omitting the argument would leave the parameter at its
 * default and read as "unfiltered" to anybody comparing the two.
 *
 * Copied rather than passed through, so the readonly array a caller still
 * holds cannot be reached by the serialiser as something mutable.
 */
export function filterList(values: readonly string[] | undefined): string[] | null {
  return values === undefined ? null : [...values]
}
