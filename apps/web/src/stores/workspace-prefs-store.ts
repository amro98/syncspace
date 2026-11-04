import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI preferences only: the last workspace opened (used by /app to pick a
 * default) and the last board opened per workspace (used by the Tasks entry).
 * Access is always re-validated against the server's data.
 */
interface WorkspacePrefsState {
  lastWorkspaceId: string | null
  lastBoardIds: Record<string, string>
  setLastWorkspaceId: (workspaceId: string | null) => void
  setLastBoardId: (workspaceId: string, boardId: string) => void
}

export const useWorkspacePrefsStore = create<WorkspacePrefsState>()(
  persist(
    (set) => ({
      lastWorkspaceId: null,
      lastBoardIds: {},
      setLastWorkspaceId: (lastWorkspaceId) => {
        set({ lastWorkspaceId })
      },
      setLastBoardId: (workspaceId, boardId) => {
        set((state) => ({ lastBoardIds: { ...state.lastBoardIds, [workspaceId]: boardId } }))
      },
    }),
    { name: 'syncspace-workspace-prefs' },
  ),
)
