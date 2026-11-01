import type { ValidationIssue } from '@syncspace/shared'
import type { z } from 'zod'

/** Flattens Zod issues into the API's `{ path, message }` validation-issue shape. */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}

/** Treats empty or whitespace-only strings as "not set" (clears optional text fields). */
export function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}
