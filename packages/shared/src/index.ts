/**
 * @syncspace/shared — the single source of truth for contracts shared by the
 * web client and the API. This package must stay dependency-light (zod only),
 * environment-agnostic (no DOM, no Node APIs) and must never import from apps.
 */
export * from './constants'
export * from './schemas'
export * from './socket'
export type * from './types'
