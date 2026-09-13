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

/**
 * Setting other people's passwords, for whoever is entitled to.
 *
 * Kept apart from the profile facts above it on the Profile screen, and from the
 * Employees and Mentors screens that maintain the same people's names and
 * addresses. Editing somebody's job title and handing out their credentials are
 * different kinds of act, and a screen that offers both in one row invites the
 * second while somebody is doing the first.
 *
 * ## What it shows, and to whom
 *
 * An administrator sees every employee and every mentor. A mentor sees the
 * employees assigned to them and nobody else — not other mentors, not employees
 * belonging to a colleague. A developer never renders this at all.
 *
 * None of that is the protection. `public.may_reset_password` is asked by the
 * Edge Function on every attempt, so a mentor who reaches past this screen with a
 * session token and a terminal is refused by the database rather than by the
 * absence of a button. This is the usability layer, and says so.
 *
 * People with no login yet are listed but have no control, because leaving them
 * out would read as somebody having gone missing from a mentor's own list. The
 * fix for those is Create login on the Employees screen, which issues a password
 * of its own.
 */

/** One person, flattened to what both the decision and the list need. */
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

/**
 * Whether this deployment can reset a password at all.
 *
 * The same condition the provisioning controls use: the Edge Function holding the
 * service-role key exists only for the Supabase project, and on any other data
 * source there is no account to change. Offering the panel there would be
 * offering a button that cannot work.
 */
const CAN_MANAGE_PASSWORDS = appConfig.dataSource === 'supabase'

/**
 * The gate, kept apart from the panel so that the two roster queries below are
 * never issued for somebody who manages nobody.
 *
 * A developer opening Settings would otherwise fetch both rosters — answered by
 * row-level security with their own row and nothing else — to build a list this
 * would then decline to draw. Putting the queries one component further in means
 * they are mounted only when there is something to ask about.
 */
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
        // `Panel` puts no gap between its children, so the stack is this
        // component's own — the same shape `NotificationPreferences` uses.
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

                {/* Which record this person is here through, since the same name
                    can appear as both an employee and a mentor and the two lead
                    to different accounts. */}
                <span className="password-management__role">
                  {candidate.kind === 'mentor'
                    ? 'Mentor record'
                    : USER_ROLE_LABELS[candidate.accessRole ?? 'developer']}
                </span>

                {/* Asked of the permission function per row rather than read off
                    `hasLogin`, so the control appears exactly when the rule says
                    it may. For a candidate, the missing login is the only thing
                    that can still refuse — which is what the text says. */}
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
                  // Not a disabled button: there is nothing to enable it, and a
                  // control that can never be pressed is worse than a sentence
                  // saying why.
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

/**
 * Both rosters, as one list.
 *
 * Mentors are included for everybody and filtered afterwards by the permission
 * check, rather than being left out here for a mentor. One list and one rule is
 * what keeps the two from disagreeing.
 *
 * `isAlsoMentor` is resolved by matching profile ids across the two rosters,
 * which is the only way to see it from here: an employee record does not say that
 * the same person also mentors. It matters because the database refuses a mentor
 * against anybody holding a mentor record, whatever their profile role says.
 */
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

/**
 * The form, and the question asked before it takes effect.
 *
 * Two fields rather than one, because nobody can read what they are typing: a
 * mistyped password here is not a failed sign-in for the person who typed it, it
 * is somebody else unable to get in and no way to find out why. The eye control on
 * each field is the other half of that — see `PasswordField`.
 *
 * Validation is `buildPasswordSchema`, shared with the screen where people choose
 * their own, so the minimum and the match rule cannot differ between the two. It
 * is given the person's name, which is what makes it refuse the temporary password
 * derived from that name: setting exactly that would leave the account held on the
 * change-password screen, unable to satisfy `complete_password_change`.
 *
 * The confirmation is not a formality. Nothing about this is undoable — whatever
 * they had is gone the moment it succeeds — and the person typing it is not the
 * person it happens to. It carries the `action`, so the dialog stays open with the
 * control busy until the write settles, which is what stops a second press setting
 * a second password.
 */
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
    // Held here rather than read from `confirm`, which answers only whether the
    // action succeeded. The server's own words are worth repeating when it
    // reports the one partial success it can have.
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

    // False covers both answers that are not "yes, and it worked": cancelled, or
    // rejected — and a rejection has already been reported by the mutation.
    if (!isDone || outcome === null) return

    onDone()

    const result: ResetPasswordResult = outcome

    if (result.warning === undefined) {
      snackbar.success(
        `The password for ${result.name} was set. They will be asked to replace it the next time they sign in.`,
      )
    } else {
      // The password did change, so this is not an error — but it is not the
      // whole of what was asked for either, and it needs an instruction rather
      // than a tick.
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
