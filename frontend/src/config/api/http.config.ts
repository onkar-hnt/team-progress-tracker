/**
 * How the API client behaves when a call does not come back cleanly.
 *
 * One place for the numbers, so retry and timeout cannot drift apart between
 * features. The mechanism that reads them lives in `@services/api/api-client`.
 */

/** Statuses worth sending again: the server said "not now", not "no". */
const RETRYABLE_STATUSES: readonly number[] = [
  408, // Request Timeout
  429, // Too Many Requests
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]

export const httpConfig = {
  /**
   * How long one attempt may take before it is abandoned as a timeout. Long
   * enough for a cold-started service to answer, short enough that a wedged
   * request does not leave a screen spinning.
   */
  timeoutMs: 20_000,

  retry: {
    /** Including the first try, so at most two retries. */
    maxAttempts: 3,

    /**
     * Waited before attempt 2 and attempt 3. The first attempt is immediate,
     * and the growing gap gives a restarting service time to come back rather
     * than spending all three tries inside the same outage.
     */
    backoffMs: [400, 1_600] as readonly number[],

    statuses: RETRYABLE_STATUSES,
  },
} as const

export function isRetryableStatus(status: number): boolean {
  return httpConfig.retry.statuses.includes(status)
}

/** The delay before the given attempt number (1-based); 0 for the first. */
export function retryDelayMs(attempt: number): number {
  return httpConfig.retry.backoffMs[attempt - 2] ?? 0
}
