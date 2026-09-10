import { appConfig } from '@config/app.config'

/**
 * Whether single sign-on is configured.
 *
 * Kept apart from `msal-client` so that asking the question does not pull the
 * MSAL library into the initial bundle. MSAL is around 200 kB, and a
 * deployment running on the workbook password fallback never needs it at all.
 */
export function isEntraConfigured(): boolean {
  return appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''
}

/**
 * Delegated Graph scopes.
 *
 * `Files.ReadWrite.All` is the narrowest scope that permits reading and
 * writing a workbook stored on a colleague's OneDrive or a team site; the
 * per-file scopes only cover files the app itself created. `User.Read` is what
 * supplies the signed-in address.
 */
export const GRAPH_SCOPES = ['Files.ReadWrite.All', 'User.Read']
