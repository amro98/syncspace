import type { ValidationIssue } from '@syncspace/shared'
import type { z } from 'zod'

/** Flattens Zod issues into the API's `{ path, message }` validation-issue shape. */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }))
}
