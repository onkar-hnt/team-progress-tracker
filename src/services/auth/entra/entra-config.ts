import { appConfig } from '@config/app.config'

export function isEntraConfigured(): boolean {
  return appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''
}

/** Sign-in only: the app reads the person's identity and nothing else from Microsoft. */
export const SIGN_IN_SCOPES = ['User.Read']
