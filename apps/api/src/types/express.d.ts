import 'express-serve-static-core'

import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `requireAuth` middleware once the session is verified. */
    auth?: {
      userId: string
    }
    /** Set by `requireWorkspaceMember` for /workspaces/:workspaceId/* routes. */
    workspaceAccess?: WorkspaceAccess
  }
}
