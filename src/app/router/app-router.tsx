import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@components/layout/app-layout/AppLayout'
import { Panel } from '@components/ui/panel/Panel'
import { Skeleton } from '@components/ui/feedback/Feedback'
import { LoginPage } from '@features/auth/pages/LoginPage'
import { SetPasswordPage } from '@features/auth/pages/SetPasswordPage'

import {
  RequireAdmin,
  RequireAuth,
  RequireFeedbackAccess,
  RequireScope,
  RequireTeamAccess,
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
const AdminProjectsPage = lazy(async () => ({
  default: (await import('@features/admin/pages/ProjectsPage')).ProjectsPage,
}))
const AdminTasksPage = lazy(async () => ({
  default: (await import('@features/admin/pages/TasksPage')).TasksPage,
}))
const ReportsPage = lazy(async () => ({
  default: (await import('@features/reports/pages/ReportsPage')).ReportsPage,
}))
const SettingsPage = lazy(async () => ({
  default: (await import('@features/settings/pages/SettingsPage')).SettingsPage,
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
          <Route element={<RequireScope />}>
            <Route element={<AppLayout />}>
              <Route index element={<Navigate replace to="/dashboard" />} />

              {/* One boundary inside the layout, so the shell stays on screen
                  while a screen's chunk is fetched. */}
              <Route
                element={
                  <Suspense fallback={<PageFallback />}>
                    <LazyRoutes />
                  </Suspense>
                }
                path="*"
              />
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

      <Route element={<RequireTeamAccess />}>
        <Route path="team-activity" element={<TeamActivityPage />} />
        <Route path="developers" element={<DevelopersPage />} />
        <Route path="reports" element={<ReportsPage />} />
      </Route>

      <Route element={<RequireFeedbackAccess />}>
        <Route path="feedback" element={<FeedbackPage />} />
      </Route>

      <Route element={<RequireAdmin />}>
        <Route path="admin/mentors" element={<AdminMentorsPage />} />
        <Route path="admin/employees" element={<AdminEmployeesPage />} />
        <Route path="admin/projects" element={<AdminProjectsPage />} />
        <Route path="admin/tasks" element={<AdminTasksPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  )
}
