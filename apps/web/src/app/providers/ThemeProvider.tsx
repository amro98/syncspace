import { type ReactNode, useEffect } from 'react'

import { applyTheme, DARK_SCHEME_QUERY, resolveTheme } from '@/lib/theme'
import { useThemeStore } from '@/stores/theme-store'

/** Keeps the `dark` class on <html> in sync with the preference and the OS setting. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    applyTheme(resolveTheme(theme))
    if (theme !== 'system') return

    const media = window.matchMedia(DARK_SCHEME_QUERY)
    const onChange = () => {
      applyTheme(resolveTheme('system'))
    }
    media.addEventListener('change', onChange)
    return () => {
      media.removeEventListener('change', onChange)
    }
  }, [theme])

  return children
}
