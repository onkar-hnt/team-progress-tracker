export interface SupabaseConfigProblem {
  /** The offending environment variable, as written in `.env.example`. */
  readonly variable: string

  /** What is wrong, and what to do about it. */
  readonly message: string
}

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
