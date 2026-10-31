import { create } from 'zustand'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected'

/**
 * Ephemeral realtime UI state (connection + which workspace room is joined).
 * Never holds server data.
 */
interface RealtimeState {
  connection: ConnectionStatus
  joinedWorkspaceId: string | null
  setConnection: (status: ConnectionStatus) => void
  setJoinedWorkspace: (workspaceId: string | null) => void
}

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  connection: 'idle',
  joinedWorkspaceId: null,
  setConnection: (connection) => {
    set(connection === 'connected' ? { connection } : { connection, joinedWorkspaceId: null })
  },
  setJoinedWorkspace: (joinedWorkspaceId) => {
    set({ joinedWorkspaceId })
  },
}))
