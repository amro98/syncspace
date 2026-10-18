/**
 * Authorization policy — pure functions over normalised contexts.
 *
 * The API enforces these (apps/api/src/lib/permissions); the web client uses
 * the same functions to decide which controls to show. Rules are documented
 * in docs/PERMISSIONS.md — keep both in sync.
 */
export * from './boards'
export * from './channels'
export type * from './context'
export * from './conversations'
export * from './invites'
export * from './messages'
export * from './roles'
export * from './workspace'
