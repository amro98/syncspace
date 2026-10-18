import { create } from 'zustand'

/**
 * Ephemeral, client-only UI state. Server data never lives here (that is
 * TanStack Query's job), and neither does anything the URL already encodes
 * (the active workspace/channel comes from route params).
 */
interface UiState {
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  toggleMobileNav: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  mobileNavOpen: false,
  setMobileNavOpen: (open) => {
    set({ mobileNavOpen: open })
  },
  toggleMobileNav: () => {
    set((state) => ({ mobileNavOpen: !state.mobileNavOpen }))
  },
}))
