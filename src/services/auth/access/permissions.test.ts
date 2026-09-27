import { describe, expect, it } from 'vitest'

import type { AppUser, AssignedTask, DailyWorkEntry, MentorComment } from '@models/index'
import { buildAccessScope } from '@services/auth/access/access-scope'
import type { AccessScope } from '@services/auth/access/access-scope'
import {
  canCommentOnTask,
  canDeleteEntry,
  canDeleteRecords,
  canEditComment,
  canEditEntry,
  canLogWorkFor,
  canManageMentorAssignments,
  canManagePasswords,
  canManageTeam,
  canReadFeedback,
  canResetPasswordFor,
  canSubmitDailyUpdate,
  canUpdateTaskStatus,
  canViewDeveloperProfile,
  canViewTeamData,
  canWriteFeedback,
  isAdmin,
  isMentor,
  isPasswordResetCandidate,
} from '@services/auth/access/permissions'

const developerA = 'developer-a'
const developerB = 'developer-b'
const mentor1 = 'mentor-1'
const mentor2 = 'mentor-2'
const projectX = 'project-x'
const projectY = 'project-y'

function user(partial: Pick<AppUser, 'role'> & Partial<AppUser>): AppUser {
  return {
    email: `${partial.role}@example.com`,
    name: partial.role,
    ...partial,
  }
}

const admin = user({ role: 'admin' })
const mentorOne = user({ role: 'mentor', mentorId: mentor1 })
const employee = user({ role: 'developer', developerId: developerA })

/** Mentor one mentors developer A, on project X only. */
function mentorScope(): AccessScope {
  return buildAccessScope(
    mentorOne,
    [{ mentorId: mentor1, developerId: developerA, active: true }],
    [projectX],
  )!
}

function adminScope(): AccessScope {
  return buildAccessScope(admin, [], [])!
}

function employeeScope(): AccessScope {
  return buildAccessScope(employee, [{ mentorId: mentor1, developerId: developerA, active: true }])!
}

function task(partial: Partial<AssignedTask> = {}): AssignedTask {
  return {
    id: 'task-1',
    name: 'Build the invoice export',
    developerId: developerA,
    projectId: projectX,
    priority: 'medium',
    status: 'in-progress',
    createdDate: '2026-09-21',
    workedDays: 1,
    actualHours: 8,
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...partial,
  }
}

function entry(developerId: string): DailyWorkEntry {
  return {
    id: `${developerId}-entry`,
    date: '2026-09-21',
    developerId,
    projectId: projectX,
    taskTitle: 'Something',
    status: 'in-progress',
    priority: 'medium',
    progress: 50,
    isBlocked: false,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
  }
}

function comment(partial: Partial<MentorComment> = {}): MentorComment {
  return {
    id: 'comment-1',
    developerId: developerA,
    date: '2026-09-21',
    comment: 'Looks good',
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...partial,
  }
}

describe('reading a role', () => {
  it('recognises an administrator and a mentor', () => {
    expect(isAdmin(admin)).toBe(true)
    expect(isMentor(mentorOne)).toBe(true)
  })

  it('does not mistake one role for another', () => {
    expect(isAdmin(mentorOne)).toBe(false)
    expect(isAdmin(employee)).toBe(false)
    expect(isMentor(admin)).toBe(false)
    expect(isMentor(employee)).toBe(false)
  })

  it('answers no to everything when nobody is signed in', () => {
    expect(isAdmin(null)).toBe(false)
    expect(isMentor(null)).toBe(false)
    expect(canManageTeam(null)).toBe(false)
    expect(canViewTeamData(null)).toBe(false)
    expect(canWriteFeedback(null)).toBe(false)
    expect(canReadFeedback(null)).toBe(false)
    expect(canDeleteRecords(null)).toBe(false)
    expect(canManagePasswords(null)).toBe(false)
    expect(canSubmitDailyUpdate(null)).toBe(false)
  })
})

describe('managing the team', () => {
  it('lets administrators and mentors manage, and developers not', () => {
    for (const may of [canManageTeam, canViewTeamData, canDeleteRecords, canManagePasswords]) {
      expect(may(admin)).toBe(true)
      expect(may(mentorOne)).toBe(true)
      expect(may(employee)).toBe(false)
    }
  })

  it('lets a mentor edit only their own assignment list', () => {
    expect(canManageMentorAssignments(mentorOne, mentor1)).toBe(true)
    expect(canManageMentorAssignments(mentorOne, mentor2)).toBe(false)
  })

  it('lets an administrator edit anybody’s assignment list', () => {
    expect(canManageMentorAssignments(admin, mentor1)).toBe(true)
    expect(canManageMentorAssignments(admin, mentor2)).toBe(true)
  })

  it('does not let a developer edit an assignment list', () => {
    expect(canManageMentorAssignments(employee, mentor1)).toBe(false)
    expect(canManageMentorAssignments(null, mentor1)).toBe(false)
  })
})

describe('feedback', () => {
  it('lets administrators and mentors write it', () => {
    expect(canWriteFeedback(admin)).toBe(true)
    expect(canWriteFeedback(mentorOne)).toBe(true)
    expect(canWriteFeedback(employee)).toBe(false)
  })

  // Developers read feedback on the same screen they are given it.
  it('lets a developer read their own', () => {
    expect(canReadFeedback(employee)).toBe(true)
  })

  it('does not let somebody with no employee record read it', () => {
    expect(canReadFeedback(user({ role: 'developer' }))).toBe(false)
  })
})

describe('logging daily work', () => {
  it('lets a developer log only against themselves', () => {
    expect(canLogWorkFor(employee, developerA)).toBe(true)
    expect(canLogWorkFor(employee, developerB)).toBe(false)
  })

  it('lets an administrator log for anybody', () => {
    expect(canLogWorkFor(admin, developerA)).toBe(true)
    expect(canLogWorkFor(admin, developerB)).toBe(true)
  })

  // A mentor reviews work; they do not write it on somebody's behalf.
  it('does not let a mentor log for the developers they mentor', () => {
    expect(canLogWorkFor(mentorOne, developerA)).toBe(false)
  })

  it('lets a mentor who is also an employee log their own work', () => {
    const both = user({ role: 'mentor', mentorId: mentor1, developerId: 'mentor-as-developer' })

    expect(canLogWorkFor(both, 'mentor-as-developer')).toBe(true)
    expect(canLogWorkFor(both, developerA)).toBe(false)
  })

  it('decides editing and deleting an entry the same way as writing one', () => {
    expect(canEditEntry(employee, entry(developerA))).toBe(true)
    expect(canEditEntry(employee, entry(developerB))).toBe(false)
    expect(canDeleteEntry(employee, entry(developerA))).toBe(true)
    expect(canDeleteEntry(mentorOne, entry(developerA))).toBe(false)
  })

  it('asks for an update from anybody with an employee record, and from administrators', () => {
    expect(canSubmitDailyUpdate(employee)).toBe(true)
    expect(canSubmitDailyUpdate(admin)).toBe(true)
    expect(canSubmitDailyUpdate(mentorOne)).toBe(false)
  })
})

describe('a task', () => {
  it('lets a developer change only their own', () => {
    expect(canUpdateTaskStatus(employee, employeeScope(), task())).toBe(true)
    expect(canUpdateTaskStatus(employee, employeeScope(), task({ developerId: developerB }))).toBe(
      false,
    )
  })

  it('lets a mentor change one for a developer on a project they are responsible for', () => {
    expect(canUpdateTaskStatus(mentorOne, mentorScope(), task())).toBe(true)
  })

  it('does not let a mentor change one on a project they are not responsible for', () => {
    expect(canUpdateTaskStatus(mentorOne, mentorScope(), task({ projectId: projectY }))).toBe(false)
  })

  it('does not let a mentor change one for a developer who is not theirs', () => {
    expect(canUpdateTaskStatus(mentorOne, mentorScope(), task({ developerId: developerB }))).toBe(
      false,
    )
  })

  it('lets an administrator change any', () => {
    expect(
      canUpdateTaskStatus(admin, adminScope(), task({ developerId: developerB, projectId: projectY })),
    ).toBe(true)
  })

  it('refuses everybody before the scope has been worked out', () => {
    expect(canUpdateTaskStatus(admin, null, task())).toBe(false)
    expect(canUpdateTaskStatus(null, adminScope(), task())).toBe(false)
  })

  it('decides commenting the same way as changing status', () => {
    expect(canCommentOnTask(employee, employeeScope(), task())).toBe(true)
    expect(canCommentOnTask(employee, employeeScope(), task({ developerId: developerB }))).toBe(
      false,
    )
    expect(canCommentOnTask(mentorOne, mentorScope(), task())).toBe(true)
    expect(canCommentOnTask(mentorOne, mentorScope(), task({ projectId: projectY }))).toBe(false)
    expect(canCommentOnTask(admin, adminScope(), task({ projectId: projectY }))).toBe(true)
    expect(canCommentOnTask(null, adminScope(), task())).toBe(false)
  })
})

describe('editing a comment', () => {
  it('lets a mentor edit the entries attributed to them', () => {
    expect(canEditComment(mentorOne, comment({ mentorId: mentor1 }))).toBe(true)
  })

  it('does not let a mentor edit another mentor’s entry', () => {
    expect(canEditComment(mentorOne, comment({ mentorId: mentor2 }))).toBe(false)
  })

  // A developer's own reply carries no mentor id, so there is nobody to match.
  it('does not let a mentor edit an entry attributed to nobody', () => {
    expect(canEditComment(mentorOne, comment())).toBe(false)
  })

  it('lets an administrator edit any entry', () => {
    expect(canEditComment(admin, comment({ mentorId: mentor2 }))).toBe(true)
    expect(canEditComment(admin, comment())).toBe(true)
  })

  it('does not let a developer edit an entry', () => {
    expect(canEditComment(employee, comment({ mentorId: mentor1 }))).toBe(false)
    expect(canEditComment(null, comment())).toBe(false)
  })
})

describe('opening a colleague’s profile', () => {
  it('lets a mentor open a developer assigned to them', () => {
    expect(canViewDeveloperProfile(mentorScope(), developerA)).toBe(true)
  })

  it('refuses a developer id that was typed into the route', () => {
    expect(canViewDeveloperProfile(mentorScope(), developerB)).toBe(false)
    expect(canViewDeveloperProfile(employeeScope(), developerB)).toBe(false)
  })

  it('refuses before the scope has been worked out', () => {
    expect(canViewDeveloperProfile(null, developerA)).toBe(false)
  })
})

describe('setting somebody else’s password', () => {
  const target = { kind: 'developer' as const, id: developerA, profileId: 'profile-a' }

  it('needs the person to have a login already', () => {
    expect(canResetPasswordFor(admin, adminScope(), { kind: 'developer', id: developerA })).toBe(
      false,
    )
    expect(canResetPasswordFor(admin, adminScope(), target)).toBe(true)
  })

  it('lets an administrator set one for a developer or a mentor', () => {
    expect(canResetPasswordFor(admin, adminScope(), target)).toBe(true)
    expect(
      canResetPasswordFor(admin, adminScope(), {
        kind: 'mentor',
        id: mentor1,
        profileId: 'profile-m',
      }),
    ).toBe(true)
  })

  it('never lets anybody set their own', () => {
    const self = user({ role: 'admin', developerId: developerA })

    expect(canResetPasswordFor(self, adminScope(), target)).toBe(false)
    expect(
      canResetPasswordFor(mentorOne, mentorScope(), {
        kind: 'mentor',
        id: mentor1,
        profileId: 'profile-m',
      }),
    ).toBe(false)
  })

  it('never lets anybody set an administrator’s', () => {
    expect(canResetPasswordFor(admin, adminScope(), { ...target, accessRole: 'admin' })).toBe(false)
  })

  it('lets a mentor set one for a developer assigned to them', () => {
    expect(canResetPasswordFor(mentorOne, mentorScope(), target)).toBe(true)
  })

  it('does not let a mentor set one for a developer who is not theirs', () => {
    expect(
      canResetPasswordFor(mentorOne, mentorScope(), {
        kind: 'developer',
        id: developerB,
        profileId: 'profile-b',
      }),
    ).toBe(false)
  })

  it('does not let a mentor set another mentor’s', () => {
    expect(
      canResetPasswordFor(mentorOne, mentorScope(), {
        kind: 'mentor',
        id: mentor2,
        profileId: 'profile-m2',
      }),
    ).toBe(false)
  })

  // The database refuses this too: the mentor record is the other half of it.
  it('does not let a mentor set one for a developer who is also a mentor', () => {
    expect(
      canResetPasswordFor(mentorOne, mentorScope(), { ...target, isAlsoMentor: true }),
    ).toBe(false)
  })

  it('does not let a mentor set one for a developer who is really a mentor or admin', () => {
    expect(canResetPasswordFor(mentorOne, mentorScope(), { ...target, accessRole: 'mentor' })).toBe(
      false,
    )
  })

  it('refuses a developer outright', () => {
    expect(canResetPasswordFor(employee, employeeScope(), target)).toBe(false)
    expect(canResetPasswordFor(null, adminScope(), target)).toBe(false)
  })

  // The list is built before logins are known, so it asks without a profile id.
  it('lists somebody with no login as a candidate, even though the button is refused', () => {
    const noLogin = { kind: 'developer' as const, id: developerA }

    expect(isPasswordResetCandidate(admin, adminScope(), noLogin)).toBe(true)
    expect(canResetPasswordFor(admin, adminScope(), noLogin)).toBe(false)
  })
})
