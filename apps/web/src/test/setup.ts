import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { useThemeStore } from '@/stores/theme-store'
import { useUiStore } from '@/stores/ui-store'

// jsdom does not implement matchMedia (used for the system theme preference).
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  }),
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  // Zustand stores are module singletons; reset them so tests stay independent.
  useThemeStore.setState({ theme: 'system' })
  useUiStore.setState({ mobileNavOpen: false })
  document.documentElement.className = ''
})
