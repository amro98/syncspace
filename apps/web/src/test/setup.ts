import '@testing-library/jest-dom/vitest'

import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

import { useChatStore } from '@/stores/chat-store'
import { useRealtimeStore } from '@/stores/realtime-store'
import { useThemeStore } from '@/stores/theme-store'
import { useToastStore } from '@/stores/toast-store'
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
    // Legacy members are still part of the MediaQueryList interface.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    addListener: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-deprecated
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

/**
 * jsdom has no layout, so the virtualized timeline gets a deterministic one:
 * its scroller ([data-virtual-scroller]) is 600px tall and every measured row
 * ([data-index]) is 48px (virtual-core reads clientHeight / offsetHeight). Scroll metrics follow the virtual content height.
 */
export const VIRTUAL_VIEWPORT = 600
export const VIRTUAL_ROW = 48
const rect = (height: number) =>
  ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: height,
    right: 800,
    width: 800,
    height,
    toJSON: () => ({}),
  }) as DOMRect
const originalRect = Object.getOwnPropertyDescriptor(Element.prototype, 'getBoundingClientRect')
  ?.value as (this: Element) => DOMRect
Element.prototype.getBoundingClientRect = function getBoundingClientRect(this: Element) {
  if (this.hasAttribute('data-virtual-scroller')) return rect(VIRTUAL_VIEWPORT)
  if (this.hasAttribute('data-index')) return rect(VIRTUAL_ROW)
  return originalRect.call(this)
}
const scrollTops = new WeakMap<Element, number>()
const isScroller = (element: Element) => element.hasAttribute('data-virtual-scroller')
const contentHeight = (element: Element) =>
  Number.parseFloat((element.firstElementChild as HTMLElement | null)?.style.height ?? '') || 0
Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
  configurable: true,
  get(this: HTMLElement) {
    return scrollTops.get(this) ?? 0
  },
  set(this: HTMLElement, value: number) {
    const max = isScroller(this) ? Math.max(0, contentHeight(this) - VIRTUAL_VIEWPORT) : Infinity
    scrollTops.set(this, Math.max(0, Math.min(value, max)))
  },
})
Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return isScroller(this) ? contentHeight(this) : 0
  },
})
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement) {
    if (this.hasAttribute('data-index')) return VIRTUAL_ROW
    return isScroller(this) ? VIRTUAL_VIEWPORT : 0
  },
})
Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
  configurable: true,
  get(this: HTMLElement) {
    return isScroller(this) ? VIRTUAL_VIEWPORT : 0
  },
})
Element.prototype.scrollTo = function scrollTo(
  this: HTMLElement,
  ...args: [ScrollToOptions?] | [number, number]
) {
  const [first, second] = args
  const top = typeof first === 'number' ? second : first?.top
  if (top !== undefined) this.scrollTop = top
  this.dispatchEvent(new Event('scroll'))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  // Zustand stores are module singletons; reset them so tests stay independent.
  useThemeStore.setState({ theme: 'system' })
  useUiStore.setState({ mobileNavOpen: false, sessionExpired: false, signedOut: false })
  useWorkspacePrefsStore.setState({ lastWorkspaceId: null, lastBoardIds: {} })
  useRealtimeStore.setState({ connection: 'idle', joinedWorkspaceId: null })
  useChatStore.setState({ typing: {}, drafts: {}, readingKey: null })
  useToastStore.setState({ toasts: [] })
  resetFakeSocket()
  document.documentElement.className = ''
})
