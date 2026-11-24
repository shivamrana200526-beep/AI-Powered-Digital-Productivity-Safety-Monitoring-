import express from 'express';
import { query } from '../db/index.js';
import { authenticate } from '../auth/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/reports - List authorized study reports
 */
router.get('/', authenticate, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'PARENT') {
      result = await query(
        `SELECT r.*, s.task_text, s.started_at, s.ended_at, u.name as student_name
         FROM study_reports r
         JOIN study_sessions s ON r.session_id = s.id
         JOIN users u ON r.student_id = u.id
         JOIN parent_student_links psl ON psl.student_id = u.id
         WHERE psl.parent_id = $1 AND psl.status = 'ACTIVE'
         ORDER BY r.created_at DESC`,
        [req.user.id]
      );
    } else {
      result = await query(
        `SELECT r.*, s.task_text, s.started_at, s.ended_at, u.name as student_name
         FROM study_reports r
         JOIN study_sessions s ON r.session_id = s.id
         JOIN users u ON r.student_id = u.id
         WHERE r.student_id = $1
         ORDER BY r.created_at DESC`,
        [req.user.id]
      );
    }
    res.json({ reports: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/reports/:id - Get detailed study report
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'PARENT') {
      result = await query(
        `SELECT r.*, s.task_text, s.started_at, s.ended_at, u.name as student_name
         FROM study_reports r
         JOIN study_sessions s ON r.session_id = s.id
         JOIN users u ON r.student_id = u.id
         JOIN parent_student_links psl ON psl.student_id = u.id
         WHERE r.id = $1 AND psl.parent_id = $2 AND psl.status = 'ACTIVE'`,
        [req.params.id, req.user.id]
      );
    } else {
      result = await query(
        `SELECT r.*, s.task_text, s.started_at, s.ended_at, u.name as student_name
         FROM study_reports r
         JOIN study_sessions s ON r.session_id = s.id
         JOIN users u ON r.student_id = u.id
         WHERE r.id = $1 AND r.student_id = $2`,
        [req.params.id, req.user.id]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found or unauthorized' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
