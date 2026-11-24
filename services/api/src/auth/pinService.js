import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import config from '@aipd/config';
import { query } from '../db/index.js';
import { createNotification } from '../notifications/notificationService.js';
import { dispatchSecurityWebhook } from '../notifications/webhookService.js';

const DEFAULT_DEMO_PIN = '1234';

/**
 * Retrieves the current security PIN status for a parent
 */
export async function getParentPinStatus(parentId) {
  const res = await query(
    `SELECT id, name, email, security_pin_hash, pin_failed_attempts, pin_locked_until
     FROM users WHERE id = $1`,
    [parentId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Parent user not found.');
    err.statusCode = 404;
    throw err;
  }

  const user = res.rows[0];
  const now = new Date();
  const lockedUntil = user.pin_locked_until ? new Date(user.pin_locked_until) : null;
  const isLocked = Boolean(lockedUntil && lockedUntil > now);

  return {
    hasPin: Boolean(user.security_pin_hash),
    isLocked,
    lockedUntil: isLocked ? lockedUntil.toISOString() : null,
    remainingLockSeconds: isLocked ? Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000) : 0,
    failedAttempts: user.pin_failed_attempts || 0,
    maxAttempts: config.parentPinMaxAttempts || 5,
    autoLockMinutes: config.parentPinAutoLockMinutes || 5,
  };
}

/**
 * Verifies a parent's PIN for sensitive operations or session unlock
 */
export async function verifyParentPin(parentId, pin, req = null) {
  const res = await query(
    `SELECT id, name, email, security_pin_hash, pin_failed_attempts, pin_locked_until
     FROM users WHERE id = $1`,
    [parentId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Parent user not found.');
    err.statusCode = 404;
    throw err;
  }

  const user = res.rows[0];
  const now = new Date();
  const lockedUntil = user.pin_locked_until ? new Date(user.pin_locked_until) : null;

  // Check lockout
  if (lockedUntil && lockedUntil > now) {
    const remainingMin = Math.ceil((lockedUntil.getTime() - now.getTime()) / 60000);
    const err = new Error(`Security lockout active due to multiple failed attempts. Try again in ${remainingMin} minute(s).`);
    err.statusCode = 423; // Locked
    throw err;
  }

  // Determine if PIN matches
  let isValid = false;
  if (!user.security_pin_hash) {
    // If no PIN set, accept default demo PIN ('1234')
    isValid = pin === DEFAULT_DEMO_PIN;
  } else {
    isValid = await bcrypt.compare(pin, user.security_pin_hash);
  }

  if (isValid) {
    // Reset failed counter and lock state
    await query(
      `UPDATE users
       SET pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [parentId]
    );

    // Generate short-lived PIN authorization token (valid for auto-lock window)
    const pinToken = jwt.sign(
      {
        id: user.id,
        scope: 'PARENT_PIN_AUTH',
      },
      config.jwtSecret,
      { expiresIn: `${config.parentPinAutoLockMinutes || 5}m` }
    );

    // Audit log
    await dispatchSecurityWebhook({
      event: 'PARENT_PIN_VERIFIED',
      actorUserId: user.id,
      actorDetails: { name: user.name, email: user.email },
      severity: 'INFO',
      details: { action: 'Session unlocked or sensitive action authorized' },
      recommendedAction: 'None',
      req,
    });

    return {
      success: true,
      verified: true,
      pinToken,
      expiresInMinutes: config.parentPinAutoLockMinutes || 5,
    };
  }

  // Failed attempt handling
  const maxAttempts = config.parentPinMaxAttempts || 5;
  const currentAttempts = (user.pin_failed_attempts || 0) + 1;
  const remaining = Math.max(0, maxAttempts - currentAttempts);

  if (currentAttempts >= maxAttempts) {
    const lockMinutes = config.parentPinLockoutMinutes || 15;
    const lockExpiry = new Date(Date.now() + lockMinutes * 60 * 1000);

    await query(
      `UPDATE users
       SET pin_failed_attempts = $1, pin_locked_until = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [currentAttempts, lockExpiry.toISOString(), parentId]
    );

    // Create high-severity in-app notification
    await createNotification({
      recipientUserId: parentId,
      type: 'SECURITY_ALERT',
      title: 'Shield Alert: Multiple Failed PIN Attempts',
      body: `Someone entered the wrong PIN ${currentAttempts} times. The parent dashboard has been locked for ${lockMinutes} minutes to protect your controls.`,
      severity: 'CRITICAL',
    });

    // Fire n8n anti-tamper webhook
    await dispatchSecurityWebhook({
      event: 'TAMPER_LOCKOUT_TRIGGERED',
      actorUserId: user.id,
      actorDetails: { name: user.name, email: user.email },
      severity: 'CRITICAL',
      details: {
        attempts: currentAttempts,
        lockoutMinutes: lockMinutes,
        lockoutExpiry: lockExpiry.toISOString(),
      },
      recommendedAction: 'Check who currently has physical access to the parent device or tablet.',
      req,
    });

    const err = new Error(`Security Lockout: ${maxAttempts} consecutive failed attempts. Dashboard locked for ${lockMinutes} minutes. An alert was dispatched.`);
    err.statusCode = 423;
    throw err;
  }

  // Record failed attempt
  await query(
    `UPDATE users
     SET pin_failed_attempts = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [currentAttempts, parentId]
  );

  // Send warning notification on repeated failure
  if (currentAttempts >= 2) {
    await createNotification({
      recipientUserId: parentId,
      type: 'SECURITY_WARNING',
      title: 'Shield Warning: Incorrect PIN Attempt',
      body: `An incorrect parent security PIN was entered (${currentAttempts}/${maxAttempts} attempts).`,
      severity: 'WARNING',
    });

    await dispatchSecurityWebhook({
      event: 'TAMPER_SUSPECTED',
      actorUserId: user.id,
      actorDetails: { name: user.name, email: user.email },
      severity: 'HIGH',
      details: {
        attempts: currentAttempts,
        remainingAttempts: remaining,
      },
      recommendedAction: 'Verify that an unauthorized user or child is not trying to bypass controls on your device.',
      req,
    });
  }

  const err = new Error(`Incorrect Security PIN. ${remaining} attempt(s) remaining.`);
  err.statusCode = 401;
  throw err;
}

/**
 * Sets or updates the parent security PIN
 */
export async function setParentPin(parentId, newPin, currentPin = null, req = null) {
  const res = await query(
    `SELECT id, name, email, security_pin_hash FROM users WHERE id = $1`,
    [parentId]
  );

  if (res.rows.length === 0) {
    const err = new Error('Parent user not found.');
    err.statusCode = 404;
    throw err;
  }

  const user = res.rows[0];

  // If user already has a PIN, verify current PIN first
  if (user.security_pin_hash) {
    if (!currentPin) {
      const err = new Error('Current PIN is required to change your PIN.');
      err.statusCode = 400;
      throw err;
    }

    const isMatch = await bcrypt.compare(currentPin, user.security_pin_hash);
    if (!isMatch) {
      const err = new Error('Current PIN is incorrect.');
      err.statusCode = 401;
      throw err;
    }
  }

  const salt = await bcrypt.genSalt(10);
  const newPinHash = await bcrypt.hash(newPin, salt);

  await query(
    `UPDATE users
     SET security_pin_hash = $1, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [newPinHash, parentId]
  );

  // Notify parent
  await createNotification({
    recipientUserId: parentId,
    type: 'SECURITY_UPDATE',
    title: 'Parent PIN Updated',
    body: 'Your 4-digit Master Security PIN was updated successfully.',
    severity: 'INFO',
  });

  // Dispatch webhook
  await dispatchSecurityWebhook({
    event: 'PARENT_PIN_UPDATED',
    actorUserId: user.id,
    actorDetails: { name: user.name, email: user.email },
    severity: 'INFO',
    details: { action: 'Security PIN updated' },
    recommendedAction: 'Keep your new PIN confidential from children.',
    req,
  });

  return {
    success: true,
    message: 'Master Security PIN updated successfully.',
  };
}

export default {
  getParentPinStatus,
  verifyParentPin,
  setParentPin,
};
