import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import { getSocketServer } from '../websocket/index.js';

/**
 * Creates persistent notification and pushes realtime Socket.IO event
 */
export async function createNotification({
  recipientUserId,
  type,
  title,
  body,
  severity = 'INFO',
  relatedEventId = null,
}) {
  const id = uuidv4();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO notifications (id, recipient_user_id, type, title, body, severity, related_event_id, read_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, $8)`,
    [id, recipientUserId, type, title, body, severity, relatedEventId, now]
  );

  const notification = {
    id,
    recipientUserId,
    type,
    title,
    body,
    severity,
    relatedEventId,
    readAt: null,
    createdAt: now,
  };

  // Push realtime via Socket.IO
  const io = getSocketServer();
  if (io) {
    io.to(`user:${recipientUserId}`).emit('notification:new', notification);
    io.to(`parent:${recipientUserId}`).emit('notification:new', notification);
  }

  return notification;
}

/**
 * Gets notifications for a user
 */
export async function getUserNotifications(userId) {
  const res = await query(
    `SELECT * FROM notifications
     WHERE recipient_user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );
  return res.rows;
}

/**
 * Marks a notification as read
 */
export async function markNotificationAsRead(notificationId, userId) {
  const now = new Date().toISOString();
  const res = await query(
    `UPDATE notifications
     SET read_at = $1
     WHERE id = $2 AND recipient_user_id = $3
     RETURNING *`,
    [now, notificationId, userId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Notification not found or unauthorized.');
    err.statusCode = 404;
    throw err;
  }

  return res.rows[0];
}
