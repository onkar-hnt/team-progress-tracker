import { useNavigate } from 'react-router-dom'

import { useAuth } from '@app/providers/auth-context'
import { Button } from '@components/ui/button/Button'
import { Panel } from '@components/ui/panel/Panel'
import { DATA_SOURCE_LABELS, appConfig } from '@config/app.config'
import { NotificationPreferences } from '@features/notifications/components/NotificationPreferences'
import { USER_ROLE_LABELS } from '@models/user.model'
import { resolveAuthMode } from '@services/auth/index'
import type { AuthMode } from '@services/auth/index'

import './SettingsPage.scss'

/**
 * Your account, what you want to be told about, and where records are kept.
 *
 * The middle one is the only thing on here that changes anything, which is why
 * it is a settings screen at all rather than a diagnostics screen. It comes from
 * the notifications feature; see `NotificationPreferences`.
 *
 * Deliberately short. This screen used to carry the workbook diagnostics — the
 * sheets and columns a file had to contain, whether one was connected, how to
 * register the application with Microsoft, and a control that repaired the
 * structure — from when the Excel workbook was the live database. Records are in
 * PostgreSQL now, so every one of those described a file nobody reads, and the
 * screen spent its length telling an administrator to fix something that was not
 * broken. Connecting a local workbook, where that is still the configured
 * source, is what `WorkbookGate` does at startup.
 *
 * Each fact below can say more than one thing, which is the test they had to
 * pass. A "connected?" row would fail it: reaching any screen means the provider
 * was built, and on the database source that throws rather than degrades. Rows
 * with one possible value read as reassurance and carry no information.
 */
export function SettingsPage() {
  const authMode = resolveAuthMode()
  const isDatabase = appConfig.dataSource === 'supabase'

  return (
    <div className="settings">
      <AccountPanel authMode={authMode} />

      {/* Hides itself where notifications do not exist, so there is nothing to
          decide here. */}
      <NotificationPreferences />

      <Panel
        description="Where the application is reading and writing records."
        title="Data source"
      >
        <dl className="settings__facts">
          <Fact label="Records" value={DATA_SOURCE_LABELS[appConfig.dataSource]} />

          {/* Only the database source has a project to name, and naming it is
              how one environment is told from another. */}
          {isDatabase ? (
            <Fact label="Project" value={describeProject(appConfig.supabase.url)} />
          ) : null}

          <Fact label="Sign-in" value={AUTH_MODE_LABELS[authMode]} />
        </dl>

        <p className="settings__note">
          {isDatabase
            ? 'Records are held in PostgreSQL, so there is nothing here to configure. What each person may read and write is decided by row-level security in the database, against the account they signed in with — so a screen with nothing on it means their own records or assignments are empty, rather than that the connection is wrong.'
            : 'Records are read from and written to the source named above, which is chosen by deployment configuration rather than from this screen.'}
        </p>
      </Panel>
    </div>
  )
}

/**
 * How each identity source reads to somebody who has to explain it.
 *
 * Local to this screen: `AUTH_MODES` is the vocabulary the auth layer decides
 * with, and this is only the wording one page puts on the answer.
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
 */
function AccountPanel({ authMode }: { authMode: AuthMode }) {
  const { user } = useAuth()
  const navigate = useNavigate()

  if (user === null) return null

  // Only Supabase Auth holds a password this application can replace. An Entra
  // password belongs to Microsoft, and the offline workbook password is derived
  // rather than stored.
  const canChangePassword = authMode === 'supabase'

  return (
    <Panel
      description="Your details come from the record an administrator keeps for you."
      isPageHeading
      title="Your account"
    >
      <dl className="settings__facts">
        <Fact label="Name" value={user.name} />
        <Fact label="Email" value={user.email} />
        <Fact label="Access" value={USER_ROLE_LABELS[user.role]} />
      </dl>

      {canChangePassword ? (
        <>
          <div className="settings__actions">
            <Button onClick={() => void navigate('/set-password')} variant="secondary">
              Change password
            </Button>
          </div>

          <p className="settings__note">
            You will be asked for a new password twice, and signed back in with it. Anything else
            about your account — your name, email or access level — is changed by an administrator
            on the Employees screen.
          </p>
        </>
      ) : (
        <p className="settings__note">
          Your password is held by whoever provides your{' '}
          {AUTH_MODE_LABELS[authMode].toLowerCase()}, so it cannot be changed here.
        </p>
      )}
    </Panel>
  )
}

/**
 * The project, as its host name.
 *
 * Enough to tell one environment from another, which is the question this
 * answers — and less to read than the whole URL, which carries nothing else.
 */
function describeProject(url: string): string {
  if (url === '') return 'Not set'

  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function Fact({
  label,
  tone = 'neutral',
  value,
}: {
  label: string
  tone?: 'attention' | 'neutral' | 'positive'
  value: string
}) {
  return (
    <div className="settings__fact">
      <dt>{label}</dt>
      <dd className={`settings__value settings__value--${tone}`}>{value}</dd>
    </div>
  )
}
