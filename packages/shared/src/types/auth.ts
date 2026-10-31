import type { z } from 'zod'

import type {
  authProvidersResponseSchema,
  authSessionResponseSchema,
  authUserSchema,
  forgotPasswordInputSchema,
  loginInputSchema,
  messageResponseSchema,
  oauthConfirmResponseSchema,
  oauthPendingSchema,
  registerInputSchema,
  resetPasswordInputSchema,
} from '../schemas/auth'

/** Parsed (server-side) shapes. Forms use z.input<...> of the same schemas. */
export type RegisterInput = z.output<typeof registerInputSchema>
export type LoginInput = z.output<typeof loginInputSchema>
export type ForgotPasswordInput = z.output<typeof forgotPasswordInputSchema>
export type ResetPasswordInput = z.output<typeof resetPasswordInputSchema>

export type AuthUser = z.infer<typeof authUserSchema>
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>
export type AuthProvidersResponse = z.infer<typeof authProvidersResponseSchema>
export type MessageResponse = z.infer<typeof messageResponseSchema>
export type OAuthPending = z.infer<typeof oauthPendingSchema>
export type OAuthPendingMode = OAuthPending['mode']
export type OAuthConfirmResponse = z.infer<typeof oauthConfirmResponseSchema>
