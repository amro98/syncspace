import { apiErrorResponseSchema, type ErrorCode, type ValidationIssue } from '@syncspace/shared'
import type { z } from 'zod'

import { env } from '@/lib/env'

/** Server error codes plus failures that can only be detected client-side. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE'

/** The only error type thrown by the API client (besides AbortError on cancellation). */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode
  readonly issues: ValidationIssue[] | undefined
  readonly requestId: string | undefined

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    options: { issues?: ValidationIssue[]; requestId?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause })
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.issues = options.issues
    this.requestId = options.requestId
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  /** Appended as a query string; `null`/`undefined` values are omitted. */
  query?: Record<string, QueryValue>
  /** Serialised as JSON unless it is FormData (file uploads). */
  body?: unknown
  headers?: HeadersInit
  signal?: AbortSignal
}

const STATUS_FALLBACK_CODES: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  if (!path.startsWith('/')) throw new Error(`API paths must start with "/": ${path}`)
  const url = new URL(`${env.VITE_API_BASE_URL}${path}`)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

async function readBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined
  const text = await response.text()
  if (!text) return undefined
  if (!response.headers.get('content-type')?.includes('application/json')) return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function toApiError(response: Response, body: unknown): ApiError {
  const parsed = apiErrorResponseSchema.safeParse(body)
  if (parsed.success) {
    const { code, message, issues, requestId } = parsed.data.error
    return new ApiError(response.status, code, message, {
      ...(issues && { issues }),
      ...(requestId && { requestId }),
    })
  }
  const code = STATUS_FALLBACK_CODES[response.status] ?? 'INTERNAL_ERROR'
  return new ApiError(response.status, code, response.statusText || 'Request failed')
}

async function request(
  method: HttpMethod,
  path: string,
  { query, body, headers, signal }: RequestOptions,
  schema?: z.ZodType,
): Promise<unknown> {
  const requestHeaders = new Headers(headers)
  requestHeaders.set('Accept', 'application/json')

  let requestBody: BodyInit | undefined
  if (body instanceof FormData) {
    requestBody = body
  } else if (body !== undefined) {
    requestHeaders.set('Content-Type', 'application/json')
    requestBody = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: requestBody ?? null,
      credentials: 'include',
      signal: signal ?? null,
    })
  } catch (error) {
    // Let cancellation propagate untouched so TanStack Query can recognise it.
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server', { cause: error })
  }

  const responseBody = await readBody(response)
  if (!response.ok) throw toApiError(response, responseBody)
  if (!schema) return responseBody

  const parsed = schema.safeParse(responseBody)
  if (!parsed.success) {
    throw new ApiError(response.status, 'INVALID_RESPONSE', 'Unexpected response from server', {
      cause: parsed.error,
    })
  }
  return parsed.data
}

function createMethod(method: HttpMethod) {
  /** With `schema`, the response is validated at runtime and typed from the schema. */
  function call<TSchema extends z.ZodType>(
    path: string,
    options: RequestOptions & { schema: TSchema },
  ): Promise<z.output<TSchema>>
  /** Without `schema`, the caller asserts the response type. Prefer passing a schema. */
  function call<TResponse = unknown>(path: string, options?: RequestOptions): Promise<TResponse>
  function call(
    path: string,
    { schema, ...options }: RequestOptions & { schema?: z.ZodType } = {},
  ): Promise<unknown> {
    return request(method, path, options, schema)
  }
  return call
}

/**
 * Central HTTP client for the SyncSpace API. All server communication goes
 * through here (usually from TanStack Query `queryFn`/`mutationFn`) — features
 * never call `fetch` directly.
 */
export const apiClient = {
  get: createMethod('GET'),
  post: createMethod('POST'),
  put: createMethod('PUT'),
  patch: createMethod('PATCH'),
  delete: createMethod('DELETE'),
}
