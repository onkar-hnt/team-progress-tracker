import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@components/layout/app-layout/AppLayout'
import { DailyUpdatePage } from '@features/daily-update/pages/DailyUpdatePage'
import { DashboardPage } from '@features/dashboard/pages/DashboardPage'
import { DevelopersPage } from '@features/developers/pages/DevelopersPage'
import { ReportsPage } from '@features/reports/pages/ReportsPage'
import { TeamActivityPage } from '@features/team-activity/pages/TeamActivityPage'

export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate replace to="/dashboard" />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="daily-update" element={<DailyUpdatePage />} />
          <Route path="team-activity" element={<TeamActivityPage />} />
          <Route path="developers" element={<DevelopersPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="*" element={<Navigate replace to="/dashboard" />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
