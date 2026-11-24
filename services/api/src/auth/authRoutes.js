import express from 'express';
import { registerSchema, loginSchema, verifyPinSchema, setPinSchema } from '@aipd/validation';
import { UserRole } from '@aipd/shared-types';
import { registerUser, loginUser } from './authService.js';
import { authenticate, requireRole } from './authMiddleware.js';
import { getParentPinStatus, verifyParentPin, setParentPin } from './pinService.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const validated = registerSchema.parse(req.body);
    const result = await registerUser(validated);
    res.status(201).json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const validated = loginSchema.parse(req.body);
    const result = await loginUser(validated);
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    const status = err.statusCode || 500;
    res.status(status).json({ error: err.message });
  }
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

/**
 * GET /api/auth/pin/status - Check PIN configuration & lockout state
 */
router.get('/pin/status', authenticate, requireRole(UserRole.PARENT), async (req, res) => {
  try {
    const status = await getParentPinStatus(req.user.id);
    res.json(status);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/pin/verify - Verify PIN to authorize sensitive action or unlock session
 */
router.post('/pin/verify', authenticate, requireRole(UserRole.PARENT), async (req, res) => {
  try {
    const validated = verifyPinSchema.parse(req.body);
    const result = await verifyParentPin(req.user.id, validated.pin, req);
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

/**
 * POST /api/auth/pin/set - Create or update 4-6 digit parent PIN
 */
router.post('/pin/set', authenticate, requireRole(UserRole.PARENT), async (req, res) => {
  try {
    const validated = setPinSchema.parse(req.body);
    const result = await setParentPin(req.user.id, validated.pin, validated.currentPin, req);
    res.json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

export default router;
