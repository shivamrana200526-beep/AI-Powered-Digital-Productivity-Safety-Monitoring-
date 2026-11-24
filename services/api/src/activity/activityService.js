import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import { analyzeContext } from '../ai/aiAdapter.js';
import { evaluateDecision } from '../decision/decisionEngine.js';
import { createNotification } from '../notifications/notificationService.js';
import { dispatchSecurityWebhook } from '../notifications/webhookService.js';
import { getSocketServer } from '../websocket/index.js';

/**
 * Ingests an activity event, performs AI analysis if appropriate, applies Decision Engine, and triggers alerts
 */
export async function processActivityEvent(eventData, user) {
  const {
    sessionId,
    eventType,
    timestamp,
    appName = '',
    processName = '',
    windowTitle = '',
    idleSeconds = 0,
    metadata = {},
    visualContext = null,
  } = eventData;

  // 1. Verify session exists and belongs to user (or linked device)
  const sessionRes = await query(
    `SELECT s.*, d.protection_enabled, d.device_name
     FROM study_sessions s
     JOIN devices d ON s.device_id = d.id
     WHERE s.id = $1 AND s.student_id = $2`,
    [sessionId, user.id]
  );

  if (sessionRes.rows.length === 0) {
    const err = new Error('Session not found or unauthorized.');
    err.statusCode = 404;
    throw err;
  }

  const session = sessionRes.rows[0];
  const isSessionActive = session.status === 'ACTIVE';

  // 2. Insert activity event
  const eventId = uuidv4();
  const eventTime = timestamp || new Date().toISOString();

  await query(
    `INSERT INTO activity_events (id, session_id, event_type, timestamp, app_name, process_name, window_title, idle_seconds, metadata_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      eventId,
      sessionId,
      eventType,
      eventTime,
      appName,
      processName,
      windowTitle,
      idleSeconds,
      JSON.stringify(metadata),
      new Date().toISOString(),
    ]
  );

  // 3. Store visual context capture if present (with 7-day retention)
  let captureId = null;
  if (visualContext) {
    captureId = uuidv4();
    const now = new Date();
    const retentionDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await query(
      `INSERT INTO context_captures (id, session_id, activity_event_id, storage_ref, captured_at, retention_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [captureId, sessionId, eventId, visualContext, now.toISOString(), retentionDate]
    );

    // Notify linked parents in realtime of new screen capture
    const parentRes = await query(
      `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
      [user.id]
    );
    const io = getSocketServer();
    if (io && parentRes.rows.length > 0) {
      parentRes.rows.forEach(({ parent_id }) => {
        io.to(`parent:${parent_id}`).emit('session:capture_taken', {
          sessionId,
          captureId,
          capturedAt: now.toISOString(),
          storageRef: visualContext,
          appName,
          windowTitle,
          eventType,
        });
      });
    }
  }

  // 4. Determine if contextual AI analysis is warranted
  // Windows foreground changes, uncertainty review, or explicit baseline
  let aiResult = null;
  let decision = null;

  if (isSessionActive && (eventType === 'ACTIVE_WINDOW_CHANGE' || eventType === 'APP_SWITCH' || visualContext)) {
    // Fetch recent 3 events for context building
    const recentEventsRes = await query(
      `SELECT app_name, window_title, event_type, timestamp
       FROM activity_events
       WHERE session_id = $1 AND id != $2
       ORDER BY timestamp DESC
       LIMIT 3`,
      [sessionId, eventId]
    );

    const recentActivity = recentEventsRes.rows.map(
      r => `${r.app_name} ("${r.window_title}") [${r.event_type}]`
    );

    const contextPayload = {
      task: session.task_text,
      appName,
      processName,
      windowTitle,
      idleSeconds,
      recentActivity,
      visualContext,
    };

    aiResult = await analyzeContext(contextPayload);

    // Record AI analysis in DB
    const aiAnalysisId = uuidv4();
    const category = aiResult.data?.category || aiResult.category;
    const confidence = aiResult.data?.confidence ?? aiResult.confidence ?? 0;
    const taskRelevance = aiResult.data?.taskRelevance ?? aiResult.taskRelevance ?? 0;
    const riskLevel = aiResult.data?.riskLevel || aiResult.riskLevel || 'NONE';
    const reason = aiResult.data?.reason || aiResult.reason || '';

    await query(
      `INSERT INTO ai_analyses (id, activity_event_id, category, confidence, task_relevance, risk_level, reason, model_name, latency_ms, raw_response_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        aiAnalysisId,
        eventId,
        category,
        confidence,
        taskRelevance,
        riskLevel,
        reason,
        aiResult.model || 'unknown',
        aiResult.latencyMs || 0,
        JSON.stringify(aiResult.raw || {}),
        new Date().toISOString(),
      ]
    );

    // 5. Evaluate Decision Engine
    decision = evaluateDecision({
      sessionActive: isSessionActive,
      aiResult,
      parentProtectionEnabled: session.protection_enabled,
      sessionId,
      appName,
    });

    const io = getSocketServer();

    // 6. Action: WARN_STUDENT
    if (decision.action === 'WARN_STUDENT') {
      const studentMsg = decision.studentMessage || 'Distraction detected. Refocus on your study task!';
      if (io) {
        io.to(`user:${user.id}`).emit('student:distraction_warning', {
          sessionId,
          eventId,
          appName,
          windowTitle,
          reason,
          message: studentMsg,
          timestamp: eventTime,
        });
      }
    }

    // 7. Action: ALERT_PARENT (Explicit / Harmful Safety Violations)
    if (decision.action === 'ALERT_PARENT') {
      // Find linked parents
      const parentsRes = await query(
        `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
        [user.id]
      );

      for (const { parent_id } of parentsRes.rows) {
        await createNotification({
          recipientUserId: parent_id,
          type: 'SAFETY_ALERT',
          title: `Explicit Safety Alert on ${session.device_name}`,
          body: `Potentially harmful/explicit content detected in "${appName}" (${windowTitle}): ${reason}`,
          severity: 'CRITICAL',
          relatedEventId: eventId,
        });

        if (io) {
          io.to(`parent:${parent_id}`).emit('parent:safety_alert', {
            sessionId,
            deviceId: session.device_id,
            studentName: user.name,
            appName,
            windowTitle,
            riskLevel,
            reason,
            timestamp: eventTime,
            screenshot: visualContext || null,
          });
        }
      }

      // Instant dispatch to n8n external automation webhook (Telegram, SMS, Smartwatch)
      await dispatchSecurityWebhook({
        event: 'EXPLICIT_SAFETY_ALERT',
        severity: 'CRITICAL',
        actor: { id: user.id, name: user.name, role: 'STUDENT' },
        device: { id: session.device_id, name: session.device_name },
        details: {
          sessionId,
          appName,
          windowTitle,
          reason,
          riskLevel,
          hasScreenshot: !!visualContext,
        },
        recommendedAction: 'Immediate parental check required: explicit or harmful content detected on child screen.',
      });
    }

    // 8. Always emit live activity feed to parent (every event with AI context)
    const ioFeed = getSocketServer();
    const feedParentsRes = await query(
      `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
      [user.id]
    );
    if (ioFeed && feedParentsRes.rows.length > 0) {
      const feedCategory = aiResult ? (aiResult.data?.category || aiResult.category) : null;
      const feedConfidence = aiResult ? (aiResult.data?.confidence ?? aiResult.confidence ?? 0) : 0;
      const feedReason = aiResult ? (aiResult.data?.reason || aiResult.reason || '') : '';
      feedParentsRes.rows.forEach(({ parent_id }) => {
        ioFeed.to(`parent:${parent_id}`).emit('parent:activity_update', {
          sessionId,
          eventId,
          eventType,
          appName,
          windowTitle,
          processName,
          idleSeconds,
          timestamp: eventTime,
          studentName: user.name,
          aiCategory: feedCategory,
          aiConfidence: feedConfidence,
          aiReason: feedReason,
          decisionAction: decision?.action || null,
          hasScreenshot: !!visualContext,
          captureId: captureId || null,
        });
      });
    }
  } else {
    // For non-AI events (IDLE, INTERACTION_METRIC) still send basic live feed
    const ioBasic = getSocketServer();
    const basicParentsRes = await query(
      `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
      [user.id]
    );
    if (ioBasic && basicParentsRes.rows.length > 0) {
      basicParentsRes.rows.forEach(({ parent_id }) => {
        ioBasic.to(`parent:${parent_id}`).emit('parent:activity_update', {
          sessionId,
          eventId,
          eventType,
          appName: appName || '',
          windowTitle: windowTitle || '',
          processName: processName || '',
          idleSeconds,
          timestamp: eventTime,
          studentName: user.name,
          aiCategory: null,
          aiConfidence: null,
          aiReason: null,
          decisionAction: null,
          hasScreenshot: false,
          captureId: null,
        });
      });
    }
  }

  return {
    eventId,
    sessionId,
    eventType,
    timestamp: eventTime,
    aiResult: aiResult ? {
      category: aiResult.data?.category || aiResult.category,
      confidence: aiResult.data?.confidence ?? aiResult.confidence,
      reason: aiResult.data?.reason || aiResult.reason,
      taskRelevance: aiResult.data?.taskRelevance ?? aiResult.taskRelevance,
      riskLevel: aiResult.data?.riskLevel || aiResult.riskLevel,
    } : null,
    decision,
  };
}

/**
 * Batch activity events processor (for offline sync)
 */
export async function processBatchEvents(events, user) {
  const results = [];
  for (const ev of events) {
    const res = await processActivityEvent(ev, user);
    results.push(res);
  }
  return results;
}
