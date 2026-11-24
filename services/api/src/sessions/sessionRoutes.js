import express from 'express';
import { UserRole } from '@aipd/shared-types';
import { createSessionSchema } from '@aipd/validation';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import {
  createSession,
  endSession,
  getSessionDetails,
  listSessions,
  getActiveSessionForParent,
  getSessionCaptures,
} from './sessionService.js';

const router = express.Router();

/**
 * GET /api/sessions - List study sessions
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const sessions = await listSessions(req.user);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sessions - Create and start study session
 */
router.post('/', authenticate, requireRole(UserRole.STUDENT), async (req, res) => {
  try {
    const validated = createSessionSchema.parse(req.body);
    const session = await createSession({
      studentId: req.user.id,
      deviceId: validated.deviceId,
      taskText: validated.taskText,
    });
    res.status(201).json(session);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/active-for-parent & /api/sessions/active - Get active session for parent with full task details & latest screenshot
 * IMPORTANT: This MUST be defined BEFORE /:id to prevent Express treating "active" as an ID param.
 */
router.get(['/active-for-parent', '/active'], authenticate, requireRole(UserRole.PARENT), async (req, res) => {
  try {
    const active = await getActiveSessionForParent(req.user);
    res.json({ activeSession: active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/:id/captures - Get all 5-minute and event screen captures for a session
 * IMPORTANT: This MUST be defined BEFORE /:id (end) to prevent conflict with the generic param route.
 */
router.get('/:id/captures', authenticate, async (req, res) => {
  try {
    const captures = await getSessionCaptures(req.params.id, req.user);
    res.json({ captures });
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * GET /api/sessions/:id - Get session details and metrics
 */
router.get('/:id', authenticate, async (req, res) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(req.params.id)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  try {
    const session = await getSessionDetails(req.params.id, req.user);
    res.json(session);
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * POST /api/sessions/:id/end - End session and produce report
 */
router.post('/:id/end', authenticate, requireRole(UserRole.STUDENT), async (req, res) => {
  try {
    const report = await endSession(req.params.id, req.user);
    res.json(report);
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

export default router;
