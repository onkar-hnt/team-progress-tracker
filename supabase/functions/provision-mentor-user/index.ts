import { serveProvisioning } from '../_shared/provisioning.ts'

/**
 * Gives an existing `public.mentors` row a login.
 *
 * A separate entry point rather than a flag on the employee one, so that the
 * role a caller ends up with is decided by which URL they reached and not by
 * anything in the request body. The flow itself is shared.
 */
serveProvisioning({
  functionName: 'provision-mentor-user',
  table: 'mentors',
  role: 'mentor',
  idField: 'mentorId',
  noun: 'mentor',
})
