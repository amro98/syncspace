import 'express-serve-static-core'

import type { IncomingFile } from '@/modules/attachments/files'
import type { WorkspaceAccess } from '@/modules/workspaces/workspace-access'

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `requireAuth` middleware once the session is verified. */
    auth?: {
      userId: string
    }
    /** Set by `requireWorkspaceMember` for /workspaces/:workspaceId/* routes. */
    workspaceAccess?: WorkspaceAccess
    /** Files of a multipart request (`parseMultipart`), buffered within the upload limits. */
    files?: IncomingFile[]
  }
}
