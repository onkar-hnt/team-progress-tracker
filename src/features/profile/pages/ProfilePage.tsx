import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { NameList } from '@components/ui/name-list/NameList'
import { Panel } from '@components/ui/panel/Panel'
import { NotificationPreferences } from '@features/notifications/components/NotificationPreferences'
import { PasswordManagement } from '@features/profile/components/PasswordManagement'
import { useDevelopers, useProjects } from '@hooks/use-work-tracker'
import { USER_ROLE_LABELS } from '@models/user.model'
import { resolveAuthMode } from '@services/auth/index'
import type { AuthMode } from '@services/auth/index'

import './ProfilePage.scss'

/**
 * Who you are, what you want to be told about, and — for the people responsible
 * for others — their passwords.
 *
 * This was the Settings screen, reachable only by administrators and mentors and
 * carrying nothing but workbook diagnostics. It is a profile now, and the rename
 * is not cosmetic: what is on it is mostly a person's own account, so the sidebar
 * reaches it through their own initials at the foot of the rail rather than
 * through a gear under Administration.
 *
 * What each role sees is decided by the panels themselves, each of which renders
 * nothing where it does not apply, rather than by three variants of this file.
 *
 * Everything here is about the person reading it. A "Data source" panel — which
 * source records were held in, which Supabase project, how sign-in worked — was
 * the last of the old diagnostics to go: it told somebody their own deployment
 * configuration back, which is a thing they cannot act on from a screen and which
 * nothing on this page depends on. Where the records live is a deployment answer,
 * held in `app.config`; what a person may read of them is a row-level security
 * answer, held in the database.
 */
export function ProfilePage() {
  return (
    <div className="profile">
      <AccountPanel />

      {/* Both hide themselves where they do not apply — notifications on a
          deployment without them, passwords for anybody who manages nobody — so
          this page has no role branching of its own. */}
      <PasswordManagement />

      <NotificationPreferences />
    </div>
  )
}

/**
 * How each identity source reads to somebody who has to explain it.
 *
 * Local to this screen: `AUTH_MODES` is the vocabulary the auth layer decides
 * with, and this is only the wording one page puts on the answer. Read now by the
 * one sentence that has to name a password's keeper when it is not this
 * application.
 */
const AUTH_MODE_LABELS: Readonly<Record<AuthMode, string>> = {
  entra: 'Microsoft work account',
  local: 'Workbook password (offline fallback)',
  supabase: 'Email and password, through Supabase Auth',
}

/**
 * Who is signed in, and the one thing they can change about it.
 *
 * The password screen has always accepted a signed-in session — `updateUser`
 * works against any live one, which is what lets it double as the
 * change-password form — but nothing in the application linked to it. The only
 * ways in were the invitation email and the route guard that holds an account
 * until it replaces the password it was issued, so somebody who simply wanted a
 * new password had no route at all. This is that route.
 *
 * Name, email and access level are read rather than edited on purpose: they come
 * from the employee or mentor record an administrator maintains, and a second
 * place to change them would be a second answer to who somebody is.
 *
 * The employee facts below it are shown to anybody who has an employee record,
 * whatever their role, and each one only when the record carries it — a screen
 * listing "Location: —" three times has spent three rows saying nothing. They are
 * read from the queries the rest of the application already uses, so a developer
 * sees exactly their own row and their own projects: the access scope narrows both
 * before either is fetched.
 */
function AccountPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const authMode = resolveAuthMode()

  // Ahead of the early return, as hooks have to be. Both are already cached by
  // the screens that list them, so this usually costs nothing.
  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()

  if (user === null) return null

  // Only Supabase Auth holds a password this application can replace. An Entra
  // password belongs to Microsoft, and the offline workbook password is derived
  // rather than stored.
  const canChangePassword = authMode === 'supabase'

  const { developerId } = user

  const record =
    developerId === undefined
      ? undefined
      : developersQuery.data?.find((developer) => developer.id === developerId)

  // The authoritative assignment is the list on each project, not
  // `primaryProjectId` — people work on several, and that column is a reporting
  // convenience.
  const projects =
    developerId === undefined
      ? []
      : (projectsQuery.data ?? [])
          .filter((project) => project.assignedDeveloperIds.includes(developerId))
          .map((project) => project.name)

  return (
    <Panel
      description="Your details come from the record an administrator keeps for you."
      isPageHeading
      title="Your profile"
    >
      <dl className="profile__facts">
        <Fact label="Name" value={user.name} />
        <Fact label="Email" value={user.email} />
        <Fact label="Access" value={USER_ROLE_LABELS[user.role]} />

        {record?.role === undefined ? null : <Fact label="Job title" value={record.role} />}
        {record?.location === undefined ? null : (
          <Fact label="Location" value={record.location} />
        )}
        {record?.employeeId === undefined ? null : (
          <Fact label="Employee reference" value={record.employeeId} />
        )}

        {/* Shown for anybody with an employee record, including when the list is
            empty: "none" is an answer somebody may need to query, where a missing
            row looks like the screen forgot to ask. */}
        {developerId === undefined ? null : (
          <div className="profile__fact">
            <dt>Projects</dt>

            {/* Not a `Fact`, which takes a string: the list needs `NameList` so a
                developer on nine projects does not stretch this row down the
                page. */}
            <dd className="profile__value">
              {projectsQuery.isPending ? (
                'Loading…'
              ) : (
                <NameList
                  emptyLabel="None assigned"
                  names={projects}
                  title={`Projects assigned to ${user.name}`}
                />
              )}
            </dd>
          </div>
        )}
      </dl>

      {canChangePassword ? (
        <>
          <div className="profile__actions">
            <Button onClick={() => void navigate('/set-password')} variant="secondary">
              Change password
            </Button>
          </div>

          <p className="profile__note">
            You will be asked for a new password twice, and signed back in with it. Anything else
            about your account — your name, email or access level — is changed by an administrator
            on the Employees screen.
          </p>
        </>
      ) : (
        <p className="profile__note">
          Your password is held by whoever provides your{' '}
          {AUTH_MODE_LABELS[authMode].toLowerCase()}, so it cannot be changed here.
        </p>
      )}
    </Panel>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="profile__fact">
      <dt>{label}</dt>
      <dd className="profile__value">{value}</dd>
    </div>
  )
}
