import express from 'express';
import { UserRole } from '@aipd/shared-types';
import { redeemPairingCodeSchema } from '@aipd/validation';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { createPairingCode, redeemPairingCode } from './pairingService.js';

const router = express.Router();

/**
 * POST /api/pairing/code - Parent generates pairing code
 */
router.post('/code', authenticate, requireRole(UserRole.PARENT), async (req, res) => {
  try {
    const result = await createPairingCode(req.user.id);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/pairing/redeem - Student redeems code
 */
router.post('/redeem', authenticate, requireRole(UserRole.STUDENT), async (req, res) => {
  try {
    const validated = redeemPairingCodeSchema.parse(req.body);
    const result = await redeemPairingCode({
      code: validated.code,
      studentId: req.user.id,
      deviceName: validated.deviceName,
      platform: validated.platform,
    });
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
