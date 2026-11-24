import { query } from '../db/index.js';
import config from '@aipd/config';
import { getSocketServer } from '../websocket/index.js';
import { v4 as uuidv4 } from 'uuid';
import { dispatchSecurityWebhook } from '../notifications/webhookService.js';
import { verifyParentPin } from '../auth/pinService.js';

/**
 * Lists devices accessible by the user (parents see linked students' devices, students see their own)
 */
export async function getAuthorizedDevices(user) {
  if (user.role === 'PARENT') {
    const res = await query(
      `SELECT d.*, u.name as student_name, u.email as student_email
       FROM devices d
       JOIN users u ON d.student_id = u.id
       JOIN parent_student_links psl ON psl.student_id = u.id
       WHERE psl.parent_id = $1 AND psl.status = 'ACTIVE'
       ORDER BY d.created_at DESC`,
      [user.id]
    );
    return res.rows;
  } else {
    const res = await query(
      `SELECT d.*, u.name as student_name, u.email as student_email
       FROM devices d
       JOIN users u ON d.student_id = u.id
       WHERE d.student_id = $1
       ORDER BY d.created_at DESC`,
      [user.id]
    );
    return res.rows;
  }
}

/**
 * Gets status for a specific device, ensuring authorization
 */
export async function getDeviceStatus(deviceId, user) {
  let res;
  if (user.role === 'PARENT') {
    res = await query(
      `SELECT d.*, u.name as student_name
       FROM devices d
       JOIN users u ON d.student_id = u.id
       JOIN parent_student_links psl ON psl.student_id = u.id
       WHERE d.id = $1 AND psl.parent_id = $2 AND psl.status = 'ACTIVE'`,
      [deviceId, user.id]
    );
  } else {
    res = await query(
      `SELECT d.*, u.name as student_name
       FROM devices d
       JOIN users u ON d.student_id = u.id
       WHERE d.id = $1 AND d.student_id = $2`,
      [deviceId, user.id]
    );
  }

  if (res.rows.length === 0) {
    const err = new Error('Device not found or unauthorized.');
    err.statusCode = 404;
    throw err;
  }

  const device = res.rows[0];
  const now = Date.now();
  const lastBeat = device.last_heartbeat ? new Date(device.last_heartbeat).getTime() : 0;
  const isOnline = (now - lastBeat) <= config.heartbeatTimeoutMs;

  return {
    ...device,
    isOnline,
    calculatedStatus: isOnline ? 'ONLINE' : 'OFFLINE',
  };
}

/**
 * Heartbeat recording from child device
 */
export async function recordHeartbeat(deviceId, studentId) {
  const now = new Date().toISOString();
  const res = await query(
    `UPDATE devices
     SET last_heartbeat = $1, status = 'ONLINE', updated_at = $1
     WHERE id = $2 AND student_id = $3
     RETURNING *`,
    [now, deviceId, studentId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Device not found or not owned by student.');
    err.statusCode = 404;
    throw err;
  }

  const device = res.rows[0];

  // Notify linked parents in realtime
  const parentRes = await query(
    `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
    [studentId]
  );

  const io = getSocketServer();
  if (io) {
    parentRes.rows.forEach(({ parent_id }) => {
      io.to(`parent:${parent_id}`).emit('device:heartbeat', {
        deviceId,
        status: 'ONLINE',
        lastHeartbeat: now,
      });
    });
  }

  return { success: true, lastHeartbeat: now, status: 'ONLINE' };
}

/**
 * Updates parental protection policy
 */
export async function updateDeviceProtection(deviceId, parentId, protectionEnabled, pin = null, req = null) {
  // If PIN is provided, verify it first
  if (pin) {
    await verifyParentPin(parentId, pin, req);
  }

  // Verify parent is linked to device's student
  const check = await query(
    `SELECT d.id, d.student_id, d.device_name
     FROM devices d
     JOIN parent_student_links psl ON psl.student_id = d.student_id
     WHERE d.id = $1 AND psl.parent_id = $2 AND psl.status = 'ACTIVE'`,
    [deviceId, parentId]
  );

  if (check.rows.length === 0) {
    const err = new Error('Device not found or parent not authorized.');
    err.statusCode = 403;
    throw err;
  }

  const now = new Date().toISOString();
  await query(
    `UPDATE devices SET protection_enabled = $1, updated_at = $2 WHERE id = $3`,
    [protectionEnabled, now, deviceId]
  );

  // Audit log
  const auditId = uuidv4();
  await query(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, timestamp, metadata_json)
     VALUES ($1, $2, 'PROTECTION_MODE_UPDATED', 'DEVICE', $3, $4, $5)`,
    [auditId, parentId, deviceId, now, JSON.stringify({ protectionEnabled })]
  );

  // Dispatch security & tamper webhook to n8n
  await dispatchSecurityWebhook({
    event: 'PROTECTION_MODE_CHANGED',
    actorUserId: parentId,
    device: { id: deviceId, name: check.rows[0].device_name },
    severity: protectionEnabled ? 'INFO' : 'HIGH',
    details: {
      protectionEnabled,
      action: protectionEnabled ? 'Supervised Protection ENABLED' : 'Supervised Protection DISABLED',
    },
    recommendedAction: protectionEnabled
      ? 'Protection active on student device.'
      : 'If you did not intentionally disable protection mode on your child device, review physical access to your device immediately.',
    req,
  });

  // Notify child device / student via Socket
  const io = getSocketServer();
  if (io) {
    io.to(`student:${check.rows[0].student_id}`).emit('device:protection_updated', {
      deviceId,
      protectionEnabled,
    });
  }

  return { success: true, deviceId, protectionEnabled };
}

/**
 * Background checker for offline devices
 */
export async function sweepOfflineDevices() {
  const timeoutThreshold = new Date(Date.now() - config.heartbeatTimeoutMs).toISOString();
  const res = await query(
    `UPDATE devices
     SET status = 'OFFLINE'
     WHERE status = 'ONLINE' AND (last_heartbeat IS NULL OR last_heartbeat < $1)
     RETURNING id, student_id`,
    [timeoutThreshold]
  );

  if (res.rows.length > 0) {
    const io = getSocketServer();
    for (const dev of res.rows) {
      if (io) {
        const parents = await query(
          `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
          [dev.student_id]
        );
        parents.rows.forEach(({ parent_id }) => {
          io.to(`parent:${parent_id}`).emit('device:status', {
            deviceId: dev.id,
            status: 'OFFLINE',
          });
        });
      }
    }
  }
}
