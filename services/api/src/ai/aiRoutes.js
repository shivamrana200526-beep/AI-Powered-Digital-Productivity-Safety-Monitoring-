import express from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { analyzeContext } from './aiAdapter.js';

const router = express.Router();

/**
 * POST /api/ai/analyze - Server-side AI orchestration
 */
router.post('/analyze', authenticate, async (req, res) => {
  try {
    const { task, appName, processName, windowTitle, idleSeconds, visualContext, recentActivity } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'task is required for AI contextual analysis.' });
    }

    const result = await analyzeContext({
      task,
      appName: appName || '',
      processName: processName || '',
      windowTitle: windowTitle || '',
      idleSeconds: idleSeconds || 0,
      visualContext,
      recentActivity,
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
