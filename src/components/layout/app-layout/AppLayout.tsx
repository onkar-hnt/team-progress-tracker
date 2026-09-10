import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { DataSourceNotice } from '@components/layout/data-source-notice/DataSourceNotice'
import { Header } from '@components/layout/header/Header'
import { Sidebar } from '@components/layout/sidebar/Sidebar'

import './AppLayout.scss'

const COLLAPSE_STORAGE_KEY = 'team-progress-tracker.sidebar-collapsed'

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true'
  } catch {
    // Private browsing modes can throw on storage access; the default is fine.
    return false
  }
}

/**
 * Fixed application shell.
 *
 * The shell fills the viewport and never scrolls: the header and sidebar stay
 * put, and the content region is the only scroll container. That keeps long
 * tables and reports reachable without the header sliding away.
 */
export function AppLayout() {
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsed)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(isCollapsed))
    } catch {
      // Persisting the preference is a nicety, not a requirement.
    }
  }, [isCollapsed])

  return (
    <div
      className={`app-layout${isCollapsed ? ' app-layout--collapsed' : ''}${
        isDrawerOpen ? ' app-layout--drawer-open' : ''
      }`}
    >
      <Header
        isSidebarCollapsed={isCollapsed}
        onToggleDrawer={() => setIsDrawerOpen((open) => !open)}
        onToggleSidebar={() => setIsCollapsed((collapsed) => !collapsed)}
      />

      {/* On small screens the rail is a drawer over the content, so following
          a link has to dismiss it or it would cover the page just opened. */}
      <Sidebar
        isCollapsed={isCollapsed}
        isDrawerOpen={isDrawerOpen}
        onNavigate={() => setIsDrawerOpen(false)}
      />

      {/* Tapping the dimmed content is the expected way to dismiss a drawer.
          It is hidden from assistive technology because the drawer's own close
          control is the accessible route. */}
      <div
        aria-hidden="true"
        className="app-layout__scrim"
        onClick={() => setIsDrawerOpen(false)}
      />

      <main className="app-layout__content" id="main-content">
        <DataSourceNotice />
        <Outlet />
      </main>
    </div>
  )
}
