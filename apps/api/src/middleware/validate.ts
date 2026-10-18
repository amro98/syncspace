import type { Request, RequestHandler } from 'express'
import type { ParamsDictionary } from 'express-serve-static-core'
import type { z } from 'zod'

interface RequestSchemas<TParams, TQuery, TBody> {
  params?: TParams
  query?: TQuery
  body?: TBody
}

/**
 * Validates and coerces `params`, `query` and `body` with Zod. Failures throw a
 * ZodError, which the central error handler turns into a 400 VALIDATION_ERROR.
 *
 * The parsed types flow into the next handler on the same route:
 *
 *   router.post('/', validate({ body: createThingSchema }), (req, res) => {
 *     req.body // typed as z.output<typeof createThingSchema>
 *   })
 */
export function validate<
  TParams extends z.ZodType = z.ZodType<ParamsDictionary>,
  TQuery extends z.ZodType = z.ZodType<Request['query']>,
  TBody extends z.ZodType = z.ZodType,
>(
  schemas: RequestSchemas<TParams, TQuery, TBody>,
): RequestHandler<z.output<TParams>, unknown, z.output<TBody>, z.output<TQuery>> {
  return (req, _res, next) => {
    if (schemas.params) {
      req.params = schemas.params.parse(req.params)
    }
    if (schemas.query) {
      // Express 5 exposes `req.query` as a getter, so it must be redefined.
      Object.defineProperty(req, 'query', {
        value: schemas.query.parse(req.query),
        writable: true,
        enumerable: true,
        configurable: true,
      })
    }
    if (schemas.body) {
      req.body = schemas.body.parse(req.body)
    }
    next()
  }
}
