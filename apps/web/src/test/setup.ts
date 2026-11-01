import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { useChatStore } from '@/stores/chat-store'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useThemeStore } from '@/stores/theme-store'
import { useUiStore } from '@/stores/ui-store'
import { useWorkspacePrefsStore } from '@/stores/workspace-prefs-store'

import { fakeSocket, resetFakeSocket } from './fake-socket'

// Route modules are lazy: the first render of the signed-in area compiles a large
// chunk under jsdom, which can exceed the default 1s wait.
configure({ asyncUtilTimeout: 5000 })

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

// jsdom has no layout: no IntersectionObserver (infinite scroll) or scrollIntoView.
class NoopIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
  takeRecords = vi.fn(() => [])
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: NoopIntersectionObserver,
})
Element.prototype.scrollIntoView = vi.fn()

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
  useChatStore.setState({ typing: {}, drafts: {}, readingKey: null })
  resetFakeSocket()
  document.documentElement.className = ''
})
