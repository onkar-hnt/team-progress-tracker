import { z } from 'zod'

import { NOTIFICATION_TYPES, type AppNotification } from '@models/index'

export const notificationDtoSchema = z.object({
  id: z.string().min(1),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  message: z.string(),
  entityType: z.enum(['daily_update', 'feedback', 'task']).nullable(),
  entityId: z.string().nullable(),
  isRead: z.boolean(),
  createdAt: z.string(),
})

type NotificationDto = z.infer<typeof notificationDtoSchema>

export function toAppNotification(row: NotificationDto): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    ...(row.entityType === null ? {} : { entityType: row.entityType }),
    ...(row.entityId === null ? {} : { entityId: row.entityId }),
    isRead: row.isRead,
    createdAt: row.createdAt,
  }
}
