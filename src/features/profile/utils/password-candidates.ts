import type { Developer, Mentor, UserRole } from '@models/index'

/** Somebody whose password an administrator or mentor might be able to set. */
export interface Candidate {
  kind: 'developer' | 'mentor'
  id: string
  name: string
  email: string | undefined
  accessRole: UserRole | undefined
  profileId: string | undefined
  isAlsoMentor: boolean
  hasLogin: boolean
}

export function buildCandidates(
  developers: readonly Developer[],
  mentors: readonly Mentor[],
): Candidate[] {
  const mentorProfileIds = new Set(
    mentors
      .map((mentor) => mentor.profileId)
      .filter((profileId): profileId is string => profileId !== undefined),
  )

  const developerRows = developers.map<Candidate>((developer) => ({
    kind: 'developer',
    id: developer.id,
    name: developer.name,
    email: developer.email,
    accessRole: developer.accessRole,
    profileId: developer.profileId,
    isAlsoMentor: developer.profileId !== undefined && mentorProfileIds.has(developer.profileId),
    hasLogin: developer.profileId !== undefined,
  }))

  const mentorRows = mentors.map<Candidate>((mentor) => ({
    kind: 'mentor',
    id: mentor.id,
    name: mentor.name,
    email: mentor.email,
    accessRole: undefined,
    profileId: mentor.profileId,
    isAlsoMentor: true,
    hasLogin: mentor.profileId !== undefined,
  }))

  return [...developerRows, ...mentorRows].sort((left, right) =>
    left.name.localeCompare(right.name),
  )
}
