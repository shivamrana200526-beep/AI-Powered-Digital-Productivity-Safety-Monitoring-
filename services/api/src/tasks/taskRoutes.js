import express from 'express';
import { authenticate } from '../auth/authMiddleware.js';
import { createTask, listTasks, updateTaskStatus } from './taskService.js';

const router = express.Router();

/**
 * GET /api/tasks - List tasks for authenticated parent or student
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const tasks = await listTasks(req.user);
    res.json({ tasks });
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * POST /api/tasks - Create/Assign a task (Parent assigns to child, or Student proposes to parent)
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, subject, studentId } = req.body;
    const task = await createTask({
      user: req.user,
      studentId,
      title,
      description,
      subject,
    });
    res.status(201).json({ task });
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

/**
 * PATCH /api/tasks/:id/status - Update task status (APPROVED, IN_PROGRESS, COMPLETED)
 */
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }
    const task = await updateTaskStatus(req.params.id, status, req.user);
    res.json({ task });
  } catch (err) {
    const code = err.statusCode || 500;
    res.status(code).json({ error: err.message });
  }
});

export default router;
