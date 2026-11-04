import {
  idSchema,
  markNotificationInputSchema,
  type Notification,
  notificationListQuerySchema,
  type NotificationPage,
} from '@syncspace/shared'
import { Router } from 'express'

import { requireAuth } from '@/middleware/require-auth'
import { validate } from '@/middleware/validate'

import {
  listNotifications,
  markAllNotificationsRead,
  markNotification,
  unreadCount,
} from './notifications.service'

/** The signed-in user's notification inbox (across workspaces). */
export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', validate({ query: notificationListQuerySchema }), async (req, res) => {
  const body: NotificationPage = await listNotifications(req.auth?.userId ?? '', req.query)
  res.json(body)
})

notificationsRouter.get('/unread-count', async (req, res) => {
  res.json({ unreadCount: await unreadCount(req.auth?.userId ?? '') })
})

notificationsRouter.post('/read-all', async (req, res) => {
  res.json(await markAllNotificationsRead(req.auth?.userId ?? ''))
})

notificationsRouter.post(
  '/:notificationId/read',
  validate({ body: markNotificationInputSchema }),
  async (req, res) => {
    const body: Notification = await markNotification(
      req.auth?.userId ?? '',
      idSchema.parse(req.params.notificationId),
      req.body.read,
    )
    res.json(body)
  },
)
