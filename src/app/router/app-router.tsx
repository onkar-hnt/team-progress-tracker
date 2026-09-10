import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@components/layout/app-layout/AppLayout'
import { Panel } from '@components/ui/panel/Panel'
import { Skeleton } from '@components/ui/feedback/Feedback'
import { LoginPage } from '@features/auth/pages/LoginPage'

import { RequireAdmin, RequireAuth } from './route-guards'

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

        <Route element={<RequireAuth />}>
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
      </Routes>
    </HashRouter>
  )
}

function LazyRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="daily-update" element={<DailyUpdatePage />} />
      <Route path="team-activity" element={<TeamActivityPage />} />
      <Route path="developers" element={<DevelopersPage />} />
      <Route path="developers/:developerId" element={<DeveloperDetailsPage />} />
      <Route path="reports" element={<ReportsPage />} />

      <Route element={<RequireAdmin />}>
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate replace to="/dashboard" />} />
    </Routes>
  )
}
