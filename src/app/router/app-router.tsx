import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { ErrorBoundary } from '@app/ErrorBoundary'
import { AppLayout } from '@components/layout/app-layout/AppLayout'
import { Panel } from '@components/ui/panel/Panel'
import { Skeleton } from '@components/ui/feedback/Feedback'
import { LoginPage } from '@features/auth/pages/LoginPage'
import { SetPasswordPage } from '@features/auth/pages/SetPasswordPage'

import {
  RequireAdmin,
  RequireAuth,
  RequireFeedbackAccess,
  RequirePasswordChange,
  RequireScope,
  RequireTeamAccess,
  RequireTeamManagement,
} from './route-guards'

/**
 * Feature screens are loaded on demand.
 *
 * The charting library is a large dependency that only the analytical screens
 * need, so route-level splitting keeps the initial download to the shell, the
 * login page and whichever screen the user actually opened.
 */
const DailyUpdatePage = lazy(async () => ({
  default: (await import('@features/daily-update/pages/DailyUpdatePage')).DailyUpdatePage,
}))
const DashboardPage = lazy(async () => ({
  default: (await import('@features/dashboard/pages/DashboardPage')).DashboardPage,
}))
const DeveloperDetailsPage = lazy(async () => ({
  default: (await import('@features/developers/pages/DeveloperDetailsPage')).DeveloperDetailsPage,
}))
const DevelopersPage = lazy(async () => ({
  default: (await import('@features/developers/pages/DevelopersPage')).DevelopersPage,
}))
const FeedbackPage = lazy(async () => ({
  default: (await import('@features/feedback/pages/FeedbackPage')).FeedbackPage,
}))
const MyTasksPage = lazy(async () => ({
  default: (await import('@features/tasks/pages/MyTasksPage')).MyTasksPage,
}))
const AdminMentorsPage = lazy(async () => ({
  default: (await import('@features/admin/pages/MentorsPage')).MentorsPage,
}))
const AdminEmployeesPage = lazy(async () => ({
  default: (await import('@features/admin/pages/EmployeesPage')).EmployeesPage,
}))
const AdminAccountsPage = lazy(async () => ({
  default: (await import('@features/admin/pages/AccountsPage')).AccountsPage,
}))
const AdminProjectsPage = lazy(async () => ({
  default: (await import('@features/admin/pages/ProjectsPage')).ProjectsPage,
}))
const AdminTasksPage = lazy(async () => ({
  default: (await import('@features/admin/pages/TasksPage')).TasksPage,
}))
const ReportsPage = lazy(async () => ({
  default: (await import('@features/reports/pages/ReportsPage')).ReportsPage,
}))
const ProfilePage = lazy(async () => ({
  default: (await import('@features/profile/pages/ProfilePage')).ProfilePage,
}))
const RecycleBinPage = lazy(async () => ({
  default: (await import('@features/recycle-bin/pages/RecycleBinPage')).RecycleBinPage,
}))
const ChangeLogPage = lazy(async () => ({
  default: (await import('@features/history/pages/ChangeLogPage')).ChangeLogPage,
}))
const TeamActivityPage = lazy(async () => ({
  default: (await import('@features/team-activity/pages/TeamActivityPage')).TeamActivityPage,
}))

function PageFallback() {
  return (
    <Panel title="Loading">
      <Skeleton label="Loading this screen…" rows={5} />
    </Panel>
  )
}

function RoutedScreen() {
  const { pathname } = useLocation()

  return (
    <ErrorBoundary key={pathname} scope="screen">
      <Suspense fallback={<PageFallback />}>
        <LazyRoutes />
      </Suspense>
    </ErrorBoundary>
  )
}

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<LoginPage />} path="/login" />

        {/* Public for the same reason as the login screen: somebody following
            an invitation has no password yet. Not lazily loaded, because the
            tokens it needs are held in memory and waiting on a chunk download
            is the one thing that should not sit between arriving and using
            them. */}
        <Route element={<SetPasswordPage />} path="/set-password" />

        {/* Authentication, then the access scope: no screen renders before the
            limits on what it may show are known. */}
        <Route element={<RequireAuth />}>
          {/* Ahead of the scope, so somebody still using a handed-out
              password is moved along before any data is fetched for them. */}
          <Route element={<RequirePasswordChange />}>
            <Route element={<RequireScope />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate replace to="/dashboard" />} />

                {/* Inside the layout, so the shell stays on screen both while a
                    screen's chunk is fetched and if the screen then fails. */}
                <Route element={<RoutedScreen />} path="*" />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}

/**
 * Route-level access rules.
 *
 * Screens that only ever show the signed-in person's own records are open to
 * everybody; screens that list several people sit behind a role guard. The
 * guards decide which areas exist, while the access scope inside the data
 * hooks decides which records appear — including on `developers/:developerId`,
 * where the id comes from the URL and is checked against the scope before
 * anything is rendered.
 */
function LazyRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="daily-update" element={<DailyUpdatePage />} />
      <Route path="my-tasks" element={<MyTasksPage />} />
      <Route path="developers/:developerId" element={<DeveloperDetailsPage />} />

      {/* Open to everybody, because it holds each person's own account and their
          own notification choices. It was `settings`, behind
          `RequireTeamManagement`, while all it held was workbook diagnostics. The
          panel that manages other people's passwords decides for itself whether to
          render, and the Edge Function behind it asks the database rather than
          trusting either. */}
      <Route path="profile" element={<ProfilePage />} />

      {/* Open to everybody too, and for a similar reason: the bin holds what the
          person may see, and the three select policies decide that rather than a
          guard here. A developer restoring their own deleted entry is the case
          this exists for, so putting it behind a role would defeat it. */}
      <Route path="recently-deleted" element={<RecycleBinPage />} />

      {/* And the log, on the same argument: `record_history_select` returns the
          history of the work the person may see, which for a developer is their
          own. "Who moved my task to blocked" is the question it answers, and it
          is a developer's question as much as a mentor's. */}
      <Route path="change-log" element={<ChangeLogPage />} />

      <Route element={<RequireTeamAccess />}>
        <Route path="team-activity" element={<TeamActivityPage />} />
        <Route path="developers" element={<DevelopersPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>

      <Route element={<RequireFeedbackAccess />}>
        <Route path="feedback" element={<FeedbackPage />} />
      </Route>

      <Route element={<RequireTeamManagement />}>
        <Route path="admin/mentors" element={<AdminMentorsPage />} />
        <Route path="admin/employees" element={<AdminEmployeesPage />} />
        <Route path="admin/projects" element={<AdminProjectsPage />} />
        <Route path="admin/tasks" element={<AdminTasksPage />} />
      </Route>

      {/* Inside the administration area but not inside `RequireTeamManagement`:
          disabling a login is the one thing there that mentors do not do. */}
      <Route element={<RequireAdmin />}>
        <Route path="admin/accounts" element={<AdminAccountsPage />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  )
}
