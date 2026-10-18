/**
 * Dedupe key for DIRECT conversations: the two participant ids, sorted and
 * joined with ':'. Stored in `conversations.direct_key`, which is unique per
 * workspace, so a second DM between the same pair is rejected by the database
 * even under concurrent requests ("find or create" = insert, and on a unique
 * violation read the existing row).
 *
 * A self-DM (notes to self) uses the same id twice.
 */
export function directConversationKey(userIdA: string, userIdB: string): string {
  if (!userIdA || !userIdB) throw new Error('Both participant ids are required')
  return [userIdA, userIdB].sort().join(':')
}
