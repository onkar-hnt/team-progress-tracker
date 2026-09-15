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

/** Feature screens load on demand to keep chart libraries off the initial bundle. */
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
const TaskDetailsPage = lazy(async () => ({
  default: (await import('@features/tasks/pages/TaskDetailsPage')).TaskDetailsPage,
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
const AdminUsagePage = lazy(async () => ({
  default: (await import('@features/admin/pages/UsagePage')).UsagePage,
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

        {/* Eager load: invite tokens in the hash must be captured before routing. */}
        <Route element={<SetPasswordPage />} path="/set-password" />

        <Route element={<RequireAuth />}>
          <Route element={<RequirePasswordChange />}>
            <Route element={<RequireScope />}>
              <Route element={<AppLayout />}>
                <Route index element={<Navigate replace to="/dashboard" />} />

                <Route element={<RoutedScreen />} path="*" />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </HashRouter>
  )
}

function LazyRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="daily-update" element={<DailyUpdatePage />} />
      <Route path="my-tasks" element={<MyTasksPage />} />

      {/* Open route: the query refuses a task outside the reader's scope. */}
      <Route path="tasks/:taskId" element={<TaskDetailsPage />} />
      <Route path="developers/:developerId" element={<DeveloperDetailsPage />} />

      <Route path="profile" element={<ProfilePage />} />

      {/* Open route: developers can restore their own deleted entries. */}
      <Route path="recently-deleted" element={<RecycleBinPage />} />

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

      <Route element={<RequireAdmin />}>
        <Route path="admin/accounts" element={<AdminAccountsPage />} />
        <Route path="admin/usage" element={<AdminUsagePage />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  )
}
