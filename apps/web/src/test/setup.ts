import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { useRealtimeStore } from '@/stores/realtime-store'
import { useThemeStore } from '@/stores/theme-store'
import { useUiStore } from '@/stores/ui-store'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'

import { fakeSocket, resetFakeSocket } from './fake-socket'

// Tests never open real Socket.IO connections.
vi.mock('@/lib/socket', () => ({
  getSocket: () => fakeSocket,
  disconnectSocket: () => fakeSocket.disconnect(),
}))

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
  useWorkspacePrefsStore.setState({ lastWorkspaceId: null })
  useRealtimeStore.setState({ connection: 'idle', joinedWorkspaceId: null })
  resetFakeSocket()
  document.documentElement.className = ''
})
