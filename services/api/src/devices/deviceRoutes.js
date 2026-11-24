import express from 'express';
import { UserRole } from '@aipd/shared-types';
import { updateProtectionSchema } from '@aipd/validation';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import {
  getAuthorizedDevices,
  getDeviceStatus,
  recordHeartbeat,
  updateDeviceProtection,
} from './deviceService.js';

const router = express.Router();

/**
 * GET /api/devices - List accessible devices
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const devices = await getAuthorizedDevices(req.user);
    res.json({ devices });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/devices/parent-link-status - Check if authenticated student has active parent link
 */
router.get('/parent-link-status', authenticate, async (req, res) => {
  try {
    const { query: dbQuery } = await import('../db/index.js');
    const result = await dbQuery(
      `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
      [req.user.id]
    );
    res.json({ isLinked: result.rows.length > 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/devices/:id/status - Get status of a device
 */
router.get('/:id/status', authenticate, async (req, res) => {
  try {
    const status = await getDeviceStatus(req.params.id, req.user);
    res.json(status);
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * POST /api/devices/:id/heartbeat - Child device heartbeat
 */
router.post('/:id/heartbeat', authenticate, requireRole(UserRole.STUDENT), async (req, res) => {
  try {
    const result = await recordHeartbeat(req.params.id, req.user.id);
    res.json(result);
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * PATCH /api/devices/:id/protection - Parent toggles protection mode
 */
router.patch('/:id/protection', authenticate, requireRole(UserRole.PARENT), async (req, res) => {
  try {
    const validated = updateProtectionSchema.parse(req.body);
    const result = await updateDeviceProtection(
      req.params.id,
      req.user.id,
      validated.protectionEnabled,
      validated.pin,
      req
    );
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

export default router;
