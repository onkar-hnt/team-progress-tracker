import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { isAdmin } from '@services/auth/index'
import { isUsageAvailable, readResourceUsage } from '@services/usage/usage.service'
import type { ResourceUsage } from '@services/usage/usage.service'

import { queryKeys } from './query-keys'

/**
 * What the project is using of its plan.
 *
 * Asked only where there is an answer and only by somebody entitled to it: the
 * function refuses anybody else, and a request that exists to be refused is a request
 * not worth making. Both conditions are repeated in the sidebar, which hides the link
 * on the same terms.
 *
 * Held for five minutes, longer than anything else in the application. Measuring means
 * a count over every table in the schema, and a figure capped at 500 MB does not move
 * perceptibly in five minutes — the screen has a Refresh for the one case where
 * somebody has just deleted something and wants to watch it come back down.
 */
export function useResourceUsage(): UseQueryResult<ResourceUsage> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.resourceUsage(),
    queryFn: readResourceUsage,
    enabled: !isRestoring && isUsageAvailable() && isAdmin(user),
    staleTime: 5 * 60_000,
  })
}
