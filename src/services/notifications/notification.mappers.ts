import { z } from 'zod'

import { NOTIFICATION_TYPES, type AppNotification } from '@models/index'

/**
 * The columns read, named once.
 *
 * Listed rather than `*` for the same reason as every other read here: a column
 * added later should not silently start crossing the wire, and the schema below
 * would reject the row if it did not know about it.
 */
export const NOTIFICATION_COLUMNS =
  'id, type, title, message, entity_type, entity_id, is_read, created_at'

/**
 * Validated rather than cast, because the client is not generated from the
 * schema. A renamed column then surfaces here, naming itself, instead of as
 * `undefined` somewhere in the panel.
 *
 * A plain object rather than `.strict()`: unknown keys are stripped, which is
 * what lets the column list above grow without this becoming a second place to
 * change.
 */
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
    // Dropped rather than carried as null, matching how every other model here
    // represents "not set". The pair is all-or-nothing in the database.
    ...(row.entity_type === null ? {} : { entityType: row.entity_type }),
    ...(row.entity_id === null ? {} : { entityId: row.entity_id }),
    isRead: row.is_read,
    createdAt: row.created_at,
  }
}
