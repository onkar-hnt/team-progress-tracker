import { useState } from 'react'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Panel } from '@components/ui/panel/Panel'
import { useAccessScope } from '@hooks/use-access-scope'
import { useRosterDevelopers, useRosterMentors } from '@hooks/use-work-tracker'
import type { AppUser } from '@models/index'
import { USER_ROLE_LABELS } from '@models/user.model'
import {
  canManagePasswords,
  canResetPasswordFor,
  isPasswordResetCandidate,
} from '@services/auth/index'
import { isSupabaseConfigured } from '@services/supabase/index'
import { toUserMessage } from '@services/errors/error-message'

import { buildCandidates } from '../utils/password-candidates'
import type { Candidate } from '../utils/password-candidates'

import { ResetPasswordModal } from './ResetPasswordModal'

import './PasswordManagement.scss'

// Password reset requires Supabase Auth.
const CAN_MANAGE_PASSWORDS = isSupabaseConfigured()

export function PasswordManagement() {
  const { user } = useAuth()

  if (user === null || !CAN_MANAGE_PASSWORDS || !canManagePasswords(user)) return null

  return <PasswordPanel user={user} />
}

function PasswordPanel({ user }: { user: AppUser }) {
  const { scope } = useAccessScope()
  const [chosen, setChosen] = useState<Candidate | null>(null)

  const developersQuery = useRosterDevelopers()
  const mentorsQuery = useRosterMentors()

  const isPending = developersQuery.isPending || mentorsQuery.isPending
  const error = developersQuery.error ?? mentorsQuery.error

  const candidates = buildCandidates(developersQuery.data ?? [], mentorsQuery.data ?? []).filter(
    (candidate) => isPasswordResetCandidate(user, scope, candidate),
  )

  const withoutLogin = candidates.filter((candidate) => !candidate.hasLogin).length

  return (
    <Panel
      description={
        user.role === 'admin'
          ? 'Set a new password for an employee or a mentor. They will be asked to replace it the next time they sign in.'
          : 'Set a new password for an employee assigned to you. They will be asked to replace it the next time they sign in.'
      }
      title="Passwords"
    >
      {isPending ? (
        <Skeleton label="Loading the people you can manage…" rows={3} />
      ) : error !== null ? (
        <ErrorState
          message={toUserMessage(error, 'The list of people could not be loaded.')}
          onRetry={() => {
            void developersQuery.refetch()
            void mentorsQuery.refetch()
          }}
        />
      ) : candidates.length === 0 ? (
        <EmptyState
          message={
            user.role === 'admin'
              ? 'There are no employees or mentors on the roster yet. Add them on the Employees and Mentors screens.'
              : 'No employees are assigned to you, so there are no passwords for you to manage. Assignments are maintained on the Mentors screen.'
          }
          title="Nobody to manage"
        />
      ) : (
        <div className="password-management">
          <ul className="password-management__list">
            {candidates.map((candidate) => (
              <li className="password-management__row" key={`${candidate.kind}-${candidate.id}`}>
                <div className="password-management__person">
                  <span className="password-management__name">{candidate.name}</span>
                  <span className="password-management__detail">
                    {candidate.email ?? 'No work email recorded'}
                  </span>
                </div>

                <span className="password-management__role">
                  {candidate.kind === 'mentor'
                    ? 'Mentor record'
                    : USER_ROLE_LABELS[candidate.accessRole ?? 'developer']}
                </span>

                {canResetPasswordFor(user, scope, candidate) ? (
                  <Button
                    onClick={() => {
                      setChosen(candidate)
                    }}
                    size="small"
                    variant="secondary"
                  >
                    Set password
                  </Button>
                ) : (
                  <span className="password-management__detail">No login yet</span>
                )}
              </li>
            ))}
          </ul>

          {withoutLogin > 0 ? (
            <p className="password-management__note">
              {withoutLogin === 1
                ? 'One person here has no login yet, so there is no password to set.'
                : `${String(withoutLogin)} people here have no login yet, so there is no password to set.`}{' '}
              Use <strong>Create login</strong> on the Employees or Mentors screen, which issues a
              temporary password of its own.
            </p>
          ) : null}
        </div>
      )}

      <ResetPasswordModal
        candidate={chosen}
        onClose={() => {
          setChosen(null)
        }}
      />
    </Panel>
  )
}
