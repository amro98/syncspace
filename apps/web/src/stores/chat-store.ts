import { create } from 'zustand'

/**
 * Ephemeral chat UI state only — never server data (that lives in TanStack
 * Query) and never the selected destination (that is the URL).
 */
interface ChatUiState {
  /** Who is typing where: destinationKey -> userIds (from typing:updated). */
  typing: Record<string, string[]>
  /** Unsent composer text per destination (and per thread: `thread:<id>`). */
  drafts: Record<string, string>
  /**
   * The destination whose latest messages are on screen right now (open, scrolled
   * to the bottom, tab visible). Incoming messages there are not counted unread.
   */
  readingKey: string | null
  setTyping: (key: string, userIds: string[]) => void
  setDraft: (key: string, text: string) => void
  setReadingKey: (key: string | null) => void
}

export const useChatStore = create<ChatUiState>()((set) => ({
  typing: {},
  drafts: {},
  readingKey: null,
  setTyping: (key, userIds) => {
    set((state) => ({ typing: { ...state.typing, [key]: userIds } }))
  },
  setDraft: (key, text) => {
    set((state) => ({ drafts: { ...state.drafts, [key]: text } }))
  },
  setReadingKey: (readingKey) => {
    set({ readingKey })
  },
}))
