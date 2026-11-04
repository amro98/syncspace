import { create } from 'zustand'

/**
 * Ephemeral, client-only UI state. Server data never lives here (that is
 * TanStack Query's job), and neither does anything the URL already encodes
 * (the active workspace/channel comes from route params).
 */
interface UiState {
  mobileNavOpen: boolean
  /** Set when an authenticated session ends with a 401 (expired/revoked), for the sign-in notice. */
  sessionExpired: boolean
  /** Set by an explicit "Sign out": /login must not offer a way back to the old account's page. */
  signedOut: boolean
  setSignedOut: (signedOut: boolean) => void
  setMobileNavOpen: (open: boolean) => void
  toggleMobileNav: () => void
  setSessionExpired: (expired: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  mobileNavOpen: false,
  sessionExpired: false,
  signedOut: false,
  setSignedOut: (signedOut) => {
    set({ signedOut })
  },
  setSessionExpired: (sessionExpired) => {
    set({ sessionExpired })
  },
  setMobileNavOpen: (open) => {
    set({ mobileNavOpen: open })
  },
  toggleMobileNav: () => {
    set((state) => ({ mobileNavOpen: !state.mobileNavOpen }))
  },
}))
