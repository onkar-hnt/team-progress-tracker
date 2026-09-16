import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'

import { useAuth } from '@app/providers/auth-context'
import { isAdmin } from '@services/auth/index'
import { isUsageAvailable, readResourceUsage } from '@services/usage/usage.service'
import type { ResourceUsage } from '@services/usage/usage.service'

import { queryKeys } from './query-keys'

/** Schema-wide size scan; five-minute staleTime because usage changes slowly. */
export function useResourceUsage(): UseQueryResult<ResourceUsage> {
  const { isRestoring, user } = useAuth()

  return useQuery({
    queryKey: queryKeys.resourceUsage(),
    queryFn: readResourceUsage,
    enabled: !isRestoring && isUsageAvailable() && isAdmin(user),
    staleTime: 5 * 60_000,
  })
}
