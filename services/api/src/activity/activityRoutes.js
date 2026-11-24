import express from 'express';
import { UserRole } from '@aipd/shared-types';
import { activityEventSchema, batchActivityEventsSchema } from '@aipd/validation';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { processActivityEvent, processBatchEvents } from './activityService.js';

const router = express.Router();

/**
 * POST /api/activity/events - Ingest single activity event
 */
router.post('/events', authenticate, requireRole(UserRole.STUDENT), async (req, res) => {
  try {
    const validated = activityEventSchema.parse(req.body);
    const result = await processActivityEvent(validated, req.user);
    res.status(201).json(result);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * POST /api/activity/events/batch - Ingest batch of offline events
 */
router.post('/events/batch', authenticate, requireRole(UserRole.STUDENT), async (req, res) => {
  try {
    const validated = batchActivityEventsSchema.parse(req.body);
    const results = await processBatchEvents(validated.events, req.user);
    res.status(201).json({ count: results.length, results });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation failed', details: err.errors });
    }
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

export default router;
