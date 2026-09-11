import { serveProvisioning } from '../_shared/provisioning.ts'

/**
 * Gives an existing `public.developers` row a login.
 *
 * The flow lives in `_shared/provisioning.ts`, which the mentor entry point
 * also uses. Only the differences are here, so the two cannot drift apart.
 */
serveProvisioning({
  functionName: 'provision-developer-user',
  table: 'developers',
  role: 'developer',
  idField: 'developerId',
  noun: 'employee',
})
