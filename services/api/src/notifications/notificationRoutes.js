import express from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { getUserNotifications, markNotificationAsRead } from './notificationService.js';

const router = express.Router();

/**
 * GET /api/notifications - List user's notifications
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const notifications = await getUserNotifications(req.user.id);
    res.json({ notifications });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/notifications/:id/read - Mark notification as read
 */
router.post('/:id/read', authenticate, async (req, res) => {
  try {
    const updated = await markNotificationAsRead(req.params.id, req.user.id);
    res.json({ success: true, notification: updated });
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

export default router;
