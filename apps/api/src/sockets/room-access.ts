/**
 * Authorization seam for joining realtime rooms. Joining a room grants read
 * access to everything broadcast into it, so it must be checked against
 * persistent membership — never trusted from the client.
 *
 * The real implementation is provided by the members/channels modules once
 * they exist. Until then the server denies every join (secure by default).
 */
export interface RoomAccessPolicy {
  canJoinWorkspace(userId: string, workspaceId: string): Promise<boolean>
  canJoinChannel(userId: string, workspaceId: string, channelId: string): Promise<boolean>
}

export const denyAllRoomAccess: RoomAccessPolicy = {
  canJoinWorkspace: () => Promise.resolve(false),
  canJoinChannel: () => Promise.resolve(false),
}
