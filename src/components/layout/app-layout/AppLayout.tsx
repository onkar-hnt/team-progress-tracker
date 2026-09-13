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

  const { pathname } = useLocation()
  const contentRef = useRef<HTMLElement>(null)

  /**
   * A new screen starts at the top of itself.
   *
   * The browser does this for a document that scrolls, and this application's document
   * does not: the shell owns the viewport and `__content` is the scroller, which the
   * router knows nothing about. So leaving a report two thousand pixels down and
   * opening the dashboard used to arrive halfway through it, on a screen whose heading
   * and filters were above the fold — reliably read as the page having loaded wrong.
   *
   * `instant` rather than the default, which would defer to the `scroll-behavior:
   * smooth` below and animate a long way up through content being replaced underneath.
   * Smooth belongs to a jump somebody asked for, not to arriving somewhere.
   */
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
      {/* The first thing in the tab order, and invisible until it has focus.
          `#main-content` was already on the content region, waiting for something to
          point at it: without this, reaching the page on a keyboard meant tabbing past
          the whole navigation rail — ten or more stops — on every single screen. */}
      <a className="app-layout__skip" href="#main-content">
        Skip to main content
      </a>

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

      {/* `tabIndex={-1}` is what makes the skip link land somewhere: following a fragment
          moves focus only if the target can hold it. It also lets the region be focused
          for arrow-key scrolling, which a scroll container that is not a form control
          otherwise cannot be. It adds no tab stop. */}
      <main className="app-layout__content" id="main-content" ref={contentRef} tabIndex={-1}>
        <DataSourceNotice />

        {/* Keyed by the path so the entrance animation plays again on each navigation:
            a `key` that changes is what makes React mount a new element, and an
            animation only runs on one that is new. It also means a screen addressed by
            id — a developer's history — starts fresh when the id changes rather than
            keeping the previous person's search box and open rows, which is the
            behaviour somebody switching people would expect anyway.

            The notice above stays outside, because it is the shell's rather than the
            screen's and should not flicker on every navigation. */}
        <div className="app-layout__screen" key={pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
