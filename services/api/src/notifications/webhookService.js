import { v4 as uuidv4 } from 'uuid';
import config from '@aipd/config';
import { query } from '../db/index.js';

/**
 * Dispatches security & safety events to n8n (or any configured webhook receiver)
 * and records an immutable audit log entry.
 */
export async function dispatchSecurityWebhook({
  event,
  actorUserId = null,
  actorDetails = {},
  device = null,
  severity = 'HIGH',
  details = {},
  recommendedAction = 'Verify physical possession of parent device.',
  req = null,
}) {
  const eventId = uuidv4();
  const timestamp = new Date().toISOString();
  const clientIp = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1') : 'internal';
  const userAgent = req ? (req.headers['user-agent'] || 'unknown') : 'AIPD Service';

  const payload = {
    eventId,
    event,
    severity,
    timestamp,
    source: 'AIPD-Parent-Tamper-Shield',
    actor: {
      userId: actorUserId,
      ...actorDetails,
    },
    device,
    details: {
      clientIp,
      userAgent,
      ...details,
    },
    recommendedAction,
  };

  // 1. Record in immutable audit_logs
  try {
    await query(
      `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, timestamp, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        eventId,
        actorUserId,
        event,
        device?.id ? 'DEVICE' : 'SECURITY_SHIELD',
        device?.id || actorUserId || 'SYSTEM',
        timestamp,
        JSON.stringify(payload),
      ]
    );
  } catch (err) {
    console.error('[AuditLog] Error recording security audit log:', err.message);
  }

  // 2. Dispatch to n8n webhook URL if configured
  const webhookUrl = config.n8nSecurityWebhookUrl || process.env.N8N_SECURITY_WEBHOOK_URL || process.env.N8N_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    return { dispatched: false, reason: 'N8N_SECURITY_WEBHOOK_URL not configured', payload };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-AIPD-Event': event,
        'X-AIPD-Severity': severity,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[n8n Webhook] Dispatched event ${event} to ${webhookUrl} (status: ${res.status})`);
    return { dispatched: true, status: res.status, payload };
  } catch (err) {
    console.warn(`[n8n Webhook] Failed to deliver event ${event} to ${webhookUrl}: ${err.message}`);
    return { dispatched: false, error: err.message, payload };
  }
}

export default {
  dispatchSecurityWebhook,
};
