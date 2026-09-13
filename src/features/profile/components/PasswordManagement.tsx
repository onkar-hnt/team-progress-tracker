import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { useAuth } from '@app/providers/auth-context'
import { useConfirm } from '@app/providers/confirm-context'
import { useSnackbar } from '@app/providers/snackbar-context'
import { Button } from '@components/ui/button/Button'
import { PasswordField } from '@components/ui/field/Field'
import { EmptyState, ErrorState, Skeleton } from '@components/ui/feedback/Feedback'
import { Modal } from '@components/ui/modal/Modal'
import { Panel } from '@components/ui/panel/Panel'
import { appConfig } from '@config/app.config'
import { useAccessScope } from '@hooks/use-access-scope'
import { useResetUserPassword } from '@hooks/use-password-reset'
import { useRosterDevelopers, useRosterMentors } from '@hooks/use-work-tracker'
import type { AppUser, Developer, Mentor, UserRole } from '@models/index'
import { USER_ROLE_LABELS } from '@models/user.model'
import {
  canManagePasswords,
  canResetPasswordFor,
  isPasswordResetCandidate,
} from '@services/auth/index'
import { PASSWORD_MIN_LENGTH, buildPasswordSchema } from '@services/auth/password-policy'
import type { PasswordFormValues } from '@services/auth/password-policy'
import type { ResetPasswordResult } from '@services/provisioning/reset-password'
import { toUserMessage } from '@services/errors/error-message'

import './PasswordManagement.scss'

interface Candidate {
  kind: 'developer' | 'mentor'
  id: string
  name: string
  email: string | undefined
  accessRole: UserRole | undefined
  profileId: string | undefined
  isAlsoMentor: boolean
  hasLogin: boolean
}

// Password reset requires Supabase Auth.
const CAN_MANAGE_PASSWORDS = appConfig.dataSource === 'supabase'

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

      <Modal
        isOpen={chosen !== null}
        onClose={() => {
          setChosen(null)
        }}
        title={chosen === null ? '' : `Set a password for ${chosen.name}`}
      >
        {chosen === null ? null : (
          <ResetPasswordForm
            candidate={chosen}
            onDone={() => {
              setChosen(null)
            }}
          />
        )}
      </Modal>
    </Panel>
  )
}

function buildCandidates(
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

function ResetPasswordForm({
  candidate,
  onDone,
}: {
  candidate: Candidate
  onDone: () => void
}) {
  const confirm = useConfirm()
  const snackbar = useSnackbar()
  const reset = useResetUserPassword()

  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<PasswordFormValues>({
    resolver: zodResolver(buildPasswordSchema(candidate.name)),
    defaultValues: { password: '', confirmation: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    let outcome: ResetPasswordResult | null = null

    const isDone = await confirm({
      title: 'Set this password?',
      message: `${candidate.name} will be able to sign in with the password you have typed, and will be asked to replace it. Whatever password they had stops working, and it cannot be recovered.`,
      confirmLabel: 'Set password',
      isDestructive: true,
      action: async () => {
        outcome = await reset.mutateAsync({
          target: candidate.kind,
          rowId: candidate.id,
          password: values.password,
        })
      },
    })

    if (!isDone || outcome === null) return

    onDone()

    const result: ResetPasswordResult = outcome

    if (result.warning === undefined) {
      snackbar.success(
        `The password for ${result.name} was set. They will be asked to replace it the next time they sign in.`,
      )
    } else {
      snackbar.warning(result.warning, { duration: 0 })
    }
  })

  return (
    <form className="form" noValidate onSubmit={onSubmit}>
      <p className="password-management__note">
        You are choosing this password on behalf of {candidate.name}, so tell them what it is.
        Nothing here can read it back afterwards — if it is lost, the only way forward is to set
        another one.
      </p>

      <PasswordField
        autoComplete="new-password"
        error={errors.password?.message}
        hint={`At least ${String(PASSWORD_MIN_LENGTH)} characters.`}
        id="reset-password"
        label="New password"
        {...register('password')}
      />

      <PasswordField
        autoComplete="new-password"
        error={errors.confirmation?.message}
        id="reset-password-confirm"
        label="Confirm password"
        {...register('confirmation')}
      />

      <div className="form__actions">
        <Button disabled={isSubmitting} onClick={onDone} variant="secondary">
          Cancel
        </Button>

        <Button isLoading={isSubmitting} type="submit" variant="primary">
          {isSubmitting ? 'Working…' : 'Set password'}
        </Button>
      </div>
    </form>
  )
}
