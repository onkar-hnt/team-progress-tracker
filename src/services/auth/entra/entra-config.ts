import { appConfig } from '@config/app.config'

export function isEntraConfigured(): boolean {
  return appConfig.entra.clientId !== '' && appConfig.entra.tenantId !== ''
}

export const GRAPH_SCOPES = ['Files.ReadWrite.All', 'User.Read']
