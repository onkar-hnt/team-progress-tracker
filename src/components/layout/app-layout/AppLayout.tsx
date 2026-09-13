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
 * The shell fills the viewport and never scrolls: the rail down the left and the
 * bar over the content stay put, and the content region is the only scroll
 * container of the three. That keeps long tables and reports reachable without the
 * bar sliding away. The rail's navigation scrolls within itself, which is a
 * separate matter handled there.
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
      {/* The bar keeps the application's name and the drawer toggle, which is the
          one control here that belongs only to a screen too narrow for the rail to
          be on. The collapse preference went to the rail, since that is what it
          acts on and where there is now room for it. */}
      <Header onToggleDrawer={() => setIsDrawerOpen((open) => !open)} />

      {/* On small screens the rail is a drawer over the content, so following
          a link has to dismiss it or it would cover the page just opened. */}
      <Sidebar
        isCollapsed={isCollapsed}
        isDrawerOpen={isDrawerOpen}
        onNavigate={() => setIsDrawerOpen(false)}
        onToggleSidebar={() => setIsCollapsed((collapsed) => !collapsed)}
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
