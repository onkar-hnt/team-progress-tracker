import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

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

export function AppLayout() {
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsed)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const { pathname } = useLocation()
  const contentRef = useRef<HTMLElement>(null)

  // __content is the scroller, not the document — reset on route change.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

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
      <a className="app-layout__skip" href="#main-content">
        Skip to main content
      </a>

      <Header onToggleDrawer={() => setIsDrawerOpen((open) => !open)} />

      <Sidebar
        isCollapsed={isCollapsed}
        isDrawerOpen={isDrawerOpen}
        onNavigate={() => setIsDrawerOpen(false)}
        onToggleSidebar={() => setIsCollapsed((collapsed) => !collapsed)}
      />

      <div
        aria-hidden="true"
        className="app-layout__scrim"
        onClick={() => setIsDrawerOpen(false)}
      />

      <main className="app-layout__content" id="main-content" ref={contentRef} tabIndex={-1}>
        <DataSourceNotice />

        {/* Keyed by path for enter animation and fresh screen state per route. */}
        <div className="app-layout__screen" key={pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
