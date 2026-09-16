import { appConfig } from '@config/app.config'

/** Where the API Gateway answers. */
export interface ApiConfig {
  /**
   * Absolute origin, or a same-origin prefix beginning with `/` when the app
   * is served behind the same host as the gateway. Never has a trailing
   * slash, so paths can be appended directly.
   */
  readonly baseUrl: string
}

export interface ApiConfigProblem {
  readonly variable: string
  readonly message: string
}

const BASE_URL_VARIABLE = 'VITE_API_BASE_URL'

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

export function getApiConfig(): ApiConfig {
  return { baseUrl: appConfig.api.baseUrl.replace(/\/+$/, '') }
}

export function inspectApiConfig(config: ApiConfig): ApiConfigProblem[] {
  if (config.baseUrl === '') {
    return [
      {
        variable: BASE_URL_VARIABLE,
        message:
          'Not set. Point it at the API Gateway, such as http://localhost:5100, or at a ' +
          'same-origin prefix such as /api when the gateway is reverse-proxied.',
      },
    ]
  }

  if (config.baseUrl.startsWith('/') || isAbsoluteHttpUrl(config.baseUrl)) return []

  return [
    {
      variable: BASE_URL_VARIABLE,
      message:
        `"${config.baseUrl}" is neither an absolute http(s) URL nor a path beginning with "/". ` +
        'It should look like http://localhost:5100.',
    },
  ]
}

export function isApiConfigured(): boolean {
  return inspectApiConfig(getApiConfig()).length === 0
}

/** A one-line summary for the UI, or `null` when configuration is sound. */
export function describeApiConfigProblem(): string | null {
  const problems = inspectApiConfig(getApiConfig())
  if (problems.length === 0) return null

  return problems.map((problem) => `${problem.variable}: ${problem.message}`).join(' ')
}

/** Joins the configured base with an API path, keeping exactly one slash. */
export function apiUrl(path: string): string {
  const { baseUrl } = getApiConfig()
  return `${baseUrl}/${path.replace(/^\/+/, '')}`
}
