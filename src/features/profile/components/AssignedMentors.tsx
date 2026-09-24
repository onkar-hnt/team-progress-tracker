import { useMemo } from 'react'

import { NameList } from '@components/ui/name-list/NameList'
import { useAuth } from '@app/providers/auth-context'
import { useMentorAssignments } from '@hooks/use-access-scope'
import { useMentors } from '@hooks/use-work-tracker'
import { assignedMentorIds } from '@services/auth/index'

/** Mentors assigned to the signed-in developer, read from mentor assignments. */
function useAssignedMentorNames(): {
  names: readonly string[]
  isPending: boolean
  error: Error | null
} {
  const { user } = useAuth()
  const developerId = user?.developerId
  const assignmentsQuery = useMentorAssignments()
  const mentorsQuery = useMentors()

  const names = useMemo(() => {
    if (developerId === undefined) return []

    const ids = new Set(assignedMentorIds(assignmentsQuery.data ?? [], developerId))
    return (mentorsQuery.data ?? [])
      .filter((mentor) => ids.has(mentor.id))
      .map((mentor) => mentor.name)
      .sort((left, right) => left.localeCompare(right))
  }, [assignmentsQuery.data, developerId, mentorsQuery.data])

  return {
    names,
    isPending: developerId !== undefined && (assignmentsQuery.isPending || mentorsQuery.isPending),
    error: assignmentsQuery.error ?? mentorsQuery.error,
  }
}

export function AssignedMentorNames({ title }: { title: string }) {
  const { error, isPending, names } = useAssignedMentorNames()

  if (isPending) return <>Loading…</>
  if (error !== null) return <>Could not be loaded</>

  return <NameList emptyLabel="None assigned" names={names} title={title} />
}
