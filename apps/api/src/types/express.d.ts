import 'express-serve-static-core'

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `requireAuth` middleware once the access token is verified. */
    auth?: {
      userId: string
    }
  }
}
