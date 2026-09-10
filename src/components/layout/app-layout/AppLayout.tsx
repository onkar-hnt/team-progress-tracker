import { Outlet } from 'react-router-dom'
import { Header } from '@components/layout/header/Header'
import { Sidebar } from '@components/layout/sidebar/Sidebar'
import './AppLayout.scss'

export function AppLayout() {
  return (
    <div className="app-layout">
      <Header />
      <Sidebar />
      <main className="app-layout__content"><Outlet /></main>
    </div>
  )
}
