import { useEffect } from 'react'

export const APP_NAME = 'SyncSpace'

/**
 * Sets the browser tab title ("#general — SyncSpace") while a page is mounted
 * and restores the plain app name when it unmounts, so titles never go stale.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME
    return () => {
      document.title = APP_NAME
    }
  }, [title])
}
