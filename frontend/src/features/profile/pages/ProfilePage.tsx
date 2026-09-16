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

export function ProfilePage() {
  return (
    <div className="profile">
      <AccountPanel />

      <PasswordManagement />

      <NotificationPreferences />
    </div>
  )
}

const AUTH_MODE_LABELS: Readonly<Record<AuthMode, string>> = {
  api: 'Email and password',
  entra: 'Microsoft work account',
  local: 'Roster password (offline fallback)',
}

function AccountPanel() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const authMode = resolveAuthMode()

  const developersQuery = useDevelopers()
  const projectsQuery = useProjects()

  if (user === null) return null

  const canChangePassword = authMode === 'api'

  const { developerId } = user

  const record =
    developerId === undefined
      ? undefined
      : developersQuery.data?.find((developer) => developer.id === developerId)

  // Project assignments come from each project's developer list, not primaryProjectId.
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

        {developerId === undefined ? null : (
          <div className="profile__fact">
            <dt>Projects</dt>

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
