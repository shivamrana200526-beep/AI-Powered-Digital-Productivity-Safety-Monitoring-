import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import { buildSessionSummary } from '../productivity/productivityEngine.js';
import { getSocketServer } from '../websocket/index.js';

/**
 * Creates and immediately starts a new study session
 */
export async function createSession({ studentId, deviceId, taskText }) {
  // Validate device belongs to student
  const devCheck = await query(
    `SELECT id FROM devices WHERE id = $1 AND student_id = $2`,
    [deviceId, studentId]
  );
  if (devCheck.rows.length === 0) {
    const err = new Error('Device not found or does not belong to student.');
    err.statusCode = 404;
    throw err;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO study_sessions (id, student_id, device_id, task_text, started_at, ended_at, status, focus_score, created_at)
     VALUES ($1, $2, $3, $4, $5, NULL, 'ACTIVE', NULL, $5)`,
    [id, studentId, deviceId, taskText, now]
  );

  const session = {
    id,
    studentId,
    deviceId,
    taskText,
    startedAt: now,
    endedAt: null,
    status: 'ACTIVE',
    focusScore: null,
  };

  // Notify parent in realtime
  const parentRes = await query(
    `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
    [studentId]
  );
  const io = getSocketServer();
  if (io) {
    parentRes.rows.forEach(({ parent_id }) => {
      io.to(`parent:${parent_id}`).emit('session:started', {
        sessionId: id,
        studentId,
        deviceId,
        taskText,
        startedAt: now,
      });
    });
  }

  return session;
}

/**
 * Ends a study session and computes final report
 */
export async function endSession(sessionId, user) {
  // Fetch session
  const sessionRes = await query(
    `SELECT * FROM study_sessions WHERE id = $1 AND student_id = $2`,
    [sessionId, user.id]
  );

  if (sessionRes.rows.length === 0) {
    const err = new Error('Session not found or unauthorized.');
    err.statusCode = 404;
    throw err;
  }

  const session = sessionRes.rows[0];
  if (session.status === 'COMPLETED') {
    return getSessionDetails(sessionId, user);
  }

  const now = new Date().toISOString();

  // Fetch all events and analyses
  const eventsRes = await query(
    `SELECT * FROM activity_events WHERE session_id = $1 ORDER BY timestamp ASC`,
    [sessionId]
  );

  const analysesRes = await query(
    `SELECT a.* FROM ai_analyses a
     JOIN activity_events e ON a.activity_event_id = e.id
     WHERE e.session_id = $1`,
    [sessionId]
  );

  const summary = buildSessionSummary({
    session: { ...session, ended_at: now },
    events: eventsRes.rows,
    analyses: analysesRes.rows,
  });

  const finalFocusScore = summary.breakdown.focusScore;

  // Update session status and score
  await query(
    `UPDATE study_sessions
     SET ended_at = $1, status = 'COMPLETED', focus_score = $2
     WHERE id = $3`,
    [now, finalFocusScore, sessionId]
  );

  // Link to parent and create study_reports record
  const parentRes = await query(
    `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
    [user.id]
  );

  const parentId = parentRes.rows[0]?.parent_id || user.id; // fallback if unlinked
  const reportId = uuidv4();

  await query(
    `INSERT INTO study_reports (id, session_id, student_id, parent_id, focus_score, productive_minutes, distraction_minutes, idle_minutes, summary_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (session_id) DO UPDATE SET
       focus_score = $5,
       productive_minutes = $6,
       distraction_minutes = $7,
       idle_minutes = $8,
       summary_json = $9`,
    [
      reportId,
      sessionId,
      user.id,
      parentId,
      finalFocusScore,
      summary.breakdown.productiveMinutes,
      summary.breakdown.distractionMinutes,
      summary.breakdown.idleMinutes,
      JSON.stringify(summary),
      now,
    ]
  );

  const io = getSocketServer();
  if (io && parentRes.rows.length > 0) {
    parentRes.rows.forEach(({ parent_id }) => {
      io.to(`parent:${parent_id}`).emit('session:ended', {
        sessionId,
        reportId,
        studentId: user.id,
        focusScore: finalFocusScore,
        taskText: session.task_text,
        breakdown: summary.breakdown,
        endedAt: now,
      });
    });
  }

  return {
    reportId,
    sessionId,
    taskText: session.task_text,
    startedAt: session.started_at,
    endedAt: now,
    focusScore: finalFocusScore,
    summary,
  };
}

/**
 * Gets session details along with current metrics
 */
export async function getSessionDetails(sessionId, user) {
  let res;
  if (user.role === 'PARENT') {
    res = await query(
      `SELECT s.*, u.name as student_name, d.device_name
       FROM study_sessions s
       JOIN users u ON s.student_id = u.id
       JOIN devices d ON s.device_id = d.id
       JOIN parent_student_links psl ON psl.student_id = u.id
       WHERE s.id = $1 AND psl.parent_id = $2 AND psl.status = 'ACTIVE'`,
      [sessionId, user.id]
    );
  } else {
    res = await query(
      `SELECT s.*, u.name as student_name, d.device_name
       FROM study_sessions s
       JOIN users u ON s.student_id = u.id
       JOIN devices d ON s.device_id = d.id
       WHERE s.id = $1 AND s.student_id = $2`,
      [sessionId, user.id]
    );
  }

  if (res.rows.length === 0) {
    const err = new Error('Session not found or unauthorized.');
    err.statusCode = 404;
    throw err;
  }

  const session = res.rows[0];

  // Fetch events & analyses
  const events = await query(
    `SELECT * FROM activity_events WHERE session_id = $1 ORDER BY timestamp ASC`,
    [sessionId]
  );
  const analyses = await query(
    `SELECT a.* FROM ai_analyses a
     JOIN activity_events e ON a.activity_event_id = e.id
     WHERE e.session_id = $1`,
    [sessionId]
  );

  const summary = buildSessionSummary({
    session,
    events: events.rows,
    analyses: analyses.rows,
  });

  return {
    ...session,
    summary,
  };
}

/**
 * Lists study sessions for the authenticated user
 */
export async function listSessions(user) {
  if (user.role === 'PARENT') {
    const res = await query(
      `SELECT s.*, u.name as student_name, d.device_name
       FROM study_sessions s
       JOIN users u ON s.student_id = u.id
       JOIN devices d ON s.device_id = d.id
       JOIN parent_student_links psl ON psl.student_id = u.id
       WHERE psl.parent_id = $1 AND psl.status = 'ACTIVE'
       ORDER BY s.started_at DESC
       LIMIT 50`,
      [user.id]
    );
    return res.rows;
  } else {
    const res = await query(
      `SELECT s.*, u.name as student_name, d.device_name
       FROM study_sessions s
       JOIN users u ON s.student_id = u.id
       JOIN devices d ON s.device_id = d.id
       WHERE s.student_id = $1
       ORDER BY s.started_at DESC
       LIMIT 50`,
      [user.id]
    );
    return res.rows;
  }
}

/**
 * Gets all screen captures for a session (for authorized parent/student)
 */
export async function getSessionCaptures(sessionId, user) {
  // Check authorization
  await getSessionDetails(sessionId, user);

  const res = await query(
    `SELECT c.id, c.session_id, c.captured_at, c.storage_ref,
            e.app_name, e.window_title, e.event_type
     FROM context_captures c
     LEFT JOIN activity_events e ON c.activity_event_id = e.id
     WHERE c.session_id = $1
     ORDER BY c.captured_at ASC`,
    [sessionId]
  );

  return res.rows;
}

/**
 * Gets currently active study session for a parent with full task details,
 * latest screen capture, and current foreground app
 */
export async function getActiveSessionForParent(parentUser) {
  const res = await query(
    `SELECT s.*, u.name as student_name, u.email as student_email,
            d.device_name, d.platform, d.protection_enabled, d.status as device_status
     FROM study_sessions s
     JOIN users u ON s.student_id = u.id
     JOIN devices d ON s.device_id = d.id
     JOIN parent_student_links psl ON psl.student_id = u.id
     WHERE psl.parent_id = $1 AND psl.status = 'ACTIVE' AND s.status = 'ACTIVE'
     ORDER BY s.started_at DESC
     LIMIT 1`,
    [parentUser.id]
  );

  if (res.rows.length === 0) {
    return null;
  }

  const session = res.rows[0];

  // Fetch latest event
  const latestEvent = await query(
    `SELECT * FROM activity_events
     WHERE session_id = $1
     ORDER BY timestamp DESC
     LIMIT 1`,
    [session.id]
  );

  // Fetch recent events with AI analysis for live feed (up to 25)
  const recentEvents = await query(
    `SELECT e.id as event_id, e.session_id, e.event_type, e.timestamp,
            e.app_name, e.process_name, e.window_title, e.idle_seconds,
            a.category as ai_category, a.confidence as ai_confidence, a.reason as ai_reason
     FROM activity_events e
     LEFT JOIN ai_analyses a ON a.activity_event_id = e.id
     WHERE e.session_id = $1
     ORDER BY e.timestamp DESC
     LIMIT 25`,
    [session.id]
  );

  // Fetch latest screen capture
  const latestCapture = await query(
    `SELECT * FROM context_captures
     WHERE session_id = $1
     ORDER BY captured_at DESC
     LIMIT 1`,
    [session.id]
  );

  // Fetch all captures count
  const captureCountRes = await query(
    `SELECT COUNT(*) as count FROM context_captures WHERE session_id = $1`,
    [session.id]
  );

  return {
    ...session,
    latestActivity: latestEvent.rows[0] || null,
    recentEvents: recentEvents.rows,
    latestScreenshot: latestCapture.rows[0] ? latestCapture.rows[0].storage_ref : null,
    latestCaptureTime: latestCapture.rows[0] ? latestCapture.rows[0].captured_at : null,
    captureCount: parseInt(captureCountRes.rows[0]?.count || '0', 10),
  };
}

