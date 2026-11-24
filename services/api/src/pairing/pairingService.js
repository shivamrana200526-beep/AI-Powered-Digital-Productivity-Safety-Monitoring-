import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import config from '@aipd/config';
import { query } from '../db/index.js';
import { getSocketServer } from '../websocket/index.js';

/**
 * Generates an unpredictable 6-character alphanumeric pairing code
 */
export function generateRandomCode(length = config.pairingCodeLength) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit easily confused 0/O, 1/I
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

export function hashCode(code) {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

/**
 * Parent creates a short-lived pairing code
 */
export async function createPairingCode(parentId) {
  const code = generateRandomCode();
  const codeHash = hashCode(code);
  const id = uuidv4();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.pairingCodeExpiryMinutes * 60 * 1000).toISOString();

  await query(
    `INSERT INTO pairing_codes (id, parent_id, code_hash, expires_at, used_at)
     VALUES ($1, $2, $3, $4, NULL)`,
    [id, parentId, codeHash, expiresAt]
  );

  return {
    code,
    expiresAt,
    expiresInMinutes: config.pairingCodeExpiryMinutes,
  };
}

/**
 * Student redeems code to link device and parent
 */
export async function redeemPairingCode({ code, studentId, deviceName, platform = 'Windows' }) {
  const codeHash = hashCode(code);
  const now = new Date().toISOString();

  // Find valid, unexpired, unused code
  const res = await query(
    `SELECT * FROM pairing_codes
     WHERE code_hash = $1
       AND used_at IS NULL
       AND expires_at > $2`,
    [codeHash, now]
  );

  if (res.rows.length === 0) {
    const err = new Error('Invalid, expired, or already used pairing code.');
    err.statusCode = 400;
    throw err;
  }

  const pairingRecord = res.rows[0];
  const parentId = pairingRecord.parent_id;

  // 1. Mark code as used
  await query(
    `UPDATE pairing_codes SET used_at = $1 WHERE id = $2`,
    [now, pairingRecord.id]
  );

  // 2. Link parent and student
  const linkId = uuidv4();
  await query(
    `INSERT INTO parent_student_links (id, parent_id, student_id, status, created_at)
     VALUES ($1, $2, $3, 'ACTIVE', $4)
     ON CONFLICT (parent_id, student_id) DO UPDATE SET status = 'ACTIVE'`,
    [linkId, parentId, studentId, now]
  );

  // 3. Register or link child device
  const deviceId = uuidv4();
  await query(
    `INSERT INTO devices (id, student_id, device_name, platform, status, last_heartbeat, protection_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'ONLINE', $5, TRUE, $5, $5)`,
    [deviceId, studentId, deviceName, platform, now]
  );

  // 4. Audit log
  const auditId = uuidv4();
  await query(
    `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, timestamp, metadata_json)
     VALUES ($1, $2, 'DEVICE_PAIRED', 'DEVICE', $3, $4, $5)`,
    [auditId, studentId, deviceId, now, JSON.stringify({ parentId, deviceName, platform })]
  );

  // 5. Notify parent in realtime via Socket.IO
  const io = getSocketServer();
  if (io) {
    io.to(`parent:${parentId}`).emit('device:paired', {
      deviceId,
      studentId,
      deviceName,
      platform,
      pairedAt: now,
    });
  }

  return {
    success: true,
    deviceId,
    parentId,
    deviceName,
    platform,
    message: 'Device successfully paired with parent account.',
  };
}
