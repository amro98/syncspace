import { CLIENT_EVENTS } from '@syncspace/shared'
import { useEffect } from 'react'

import { getSocket } from '@/lib/socket'
import { useRealtimeStore } from '@/stores/realtime-store'

/**
 * Owns the Socket.IO connection for a signed-in user (mounted by the auth
 * guard). The socket authenticates with the same httpOnly session cookie.
 */
export function useRealtimeConnection(userId: string): void {
  const setConnection = useRealtimeStore((state) => state.setConnection)

  useEffect(() => {
    const socket = getSocket()
    const onConnect = () => {
      setConnection('connected')
    }
    const onDisconnect = () => {
      setConnection('disconnected')
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onDisconnect)

    setConnection('connecting')
    socket.connect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onDisconnect)
      socket.disconnect()
      setConnection('idle')
    }
  }, [userId, setConnection])
}

/**
 * Subscribes to `workspace:<id>` while a workspace route is open. The server
 * checks membership before joining; re-joins automatically after reconnects.
 */
export function useWorkspaceRoom(workspaceId: string): void {
  const connected = useRealtimeStore((state) => state.connection === 'connected')
  const setJoinedWorkspace = useRealtimeStore((state) => state.setJoinedWorkspace)

  useEffect(() => {
    if (!connected) return
    const socket = getSocket()
    let active = true

    void socket
      .emitWithAck(CLIENT_EVENTS.WORKSPACE_JOIN, { workspaceId })
      .then((ack) => {
        if (active) setJoinedWorkspace(ack.ok ? workspaceId : null)
      })
      .catch(() => {
        if (active) setJoinedWorkspace(null)
      })

    return () => {
      active = false
      setJoinedWorkspace(null)
      if (socket.connected) {
        void socket
          .emitWithAck(CLIENT_EVENTS.WORKSPACE_LEAVE, { workspaceId })
          .catch(() => undefined)
      }
    }
  }, [connected, workspaceId, setJoinedWorkspace])
}
