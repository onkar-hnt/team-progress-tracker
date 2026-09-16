import { useEffect } from 'react'

const SITE_NAME = 'Team Progress Tracker'

export function useDocumentTitle(page: string | undefined): void {
  useEffect(() => {
    document.title = page === undefined ? SITE_NAME : `${page} · ${SITE_NAME}`
  }, [page])
}
