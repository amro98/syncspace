import { Monitor, Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ThemePreference } from '@/lib/theme'
import { useThemeStore } from '@/stores/theme-store'

const NEXT_THEME: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const Icon = ICONS[theme]
  const next = NEXT_THEME[theme]

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => {
        setTheme(next)
      }}
      aria-label={`Theme: ${theme}. Switch to ${next}.`}
      title={`Theme: ${theme}`}
    >
      <Icon aria-hidden />
    </Button>
  )
}
