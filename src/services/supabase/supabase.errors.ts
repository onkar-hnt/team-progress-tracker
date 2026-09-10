/**
 * One thing wrong with the Supabase environment configuration.
 *
 * Carries the variable name so the message can tell somebody exactly which
 * line of their `.env.local` to fix, rather than that "Supabase is not
 * configured".
 */
export interface SupabaseConfigProblem {
  /** The offending environment variable, as written in `.env.example`. */
  readonly variable: string

  /** What is wrong, and what to do about it. */
  readonly message: string
}

/**
 * Supabase cannot be reached because it was never configured correctly.
 *
 * Thrown when a client is first requested rather than when the module loads,
 * so a deployment with no Supabase project still starts and runs on the
 * in-memory workbook. The alternative — validating at import time — would
 * take the whole application down over configuration that the active data
 * source may not even need.
 *
 * Deliberately not a `DataProviderError`: sign-in needs to raise this too,
 * and the data layer owns the translation into its own error taxonomy.
 */
export class SupabaseConfigurationError extends Error {
  readonly problems: readonly SupabaseConfigProblem[]

  constructor(problems: readonly SupabaseConfigProblem[]) {
    const detail = problems.map((problem) => `  • ${problem.variable}: ${problem.message}`)

    super(
      [
        'Supabase is not configured.',
        ...detail,
        'Set these in `.env.local` for development, or in the deployment environment. See `.env.example`.',
      ].join('\n'),
    )

    this.name = 'SupabaseConfigurationError'
    this.problems = problems
  }
}
