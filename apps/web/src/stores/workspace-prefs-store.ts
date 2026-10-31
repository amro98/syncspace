import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * UI preference only: the id of the last workspace opened, used by /app to
 * pick a default. Access is always re-validated against the server's list.
 */
interface WorkspacePrefsState {
  lastWorkspaceId: string | null
  setLastWorkspaceId: (workspaceId: string | null) => void
}

export const useWorkspacePrefsStore = create<WorkspacePrefsState>()(
  persist(
    (set) => ({
      lastWorkspaceId: null,
      setLastWorkspaceId: (lastWorkspaceId) => {
        set({ lastWorkspaceId })
      },
    }),
    { name: 'syncspace-workspace-prefs' },
  ),
)
