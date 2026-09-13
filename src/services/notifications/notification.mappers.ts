import { z } from 'zod'

import { NOTIFICATION_TYPES, type AppNotification } from '@models/index'

export const NOTIFICATION_COLUMNS =
  'id, type, title, message, entity_type, entity_id, is_read, created_at'

export const notificationRowSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  message: z.string(),
  entity_type: z.enum(['daily_update', 'feedback', 'task']).nullable(),
  entity_id: z.string().nullable(),
  is_read: z.boolean(),
  created_at: z.string(),
})

type NotificationRow = z.infer<typeof notificationRowSchema>

export function toAppNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    ...(row.entity_type === null ? {} : { entityType: row.entity_type }),
    ...(row.entity_id === null ? {} : { entityId: row.entity_id }),
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}
