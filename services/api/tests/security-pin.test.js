import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/index.js';
import { registerUser } from '../src/auth/authService.js';
import {
  getParentPinStatus,
  verifyParentPin,
  setParentPin,
} from '../src/auth/pinService.js';
import { dispatchSecurityWebhook } from '../src/notifications/webhookService.js';
import { UserRole } from '@aipd/shared-types';

test('Parent Security PIN & Tamper Shield Tests', async (t) => {
  await initDb();

  let parentUser;

  await t.test('Registers a test parent for security tests', async () => {
    const parent = await registerUser({
      email: `security_parent_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      name: 'Security Shield Parent',
      role: UserRole.PARENT,
    });
    parentUser = parent.user;
    assert.ok(parentUser.id);
  });

  await t.test('Retrieves default PIN status for newly created parent', async () => {
    const status = await getParentPinStatus(parentUser.id);
    assert.equal(status.isLocked, false);
    assert.equal(status.failedAttempts, 0);
    assert.equal(status.autoLockMinutes, 5);
  });

  await t.test('Verifies default setup PIN (1234) successfully', async () => {
    const result = await verifyParentPin(parentUser.id, '1234');
    assert.equal(result.success, true);
    assert.equal(result.verified, true);
    assert.ok(result.pinToken);
  });

  await t.test('Sets a new 4-digit master PIN (8899)', async () => {
    const setResult = await setParentPin(parentUser.id, '8899');
    assert.equal(setResult.success, true);

    // Old PIN 1234 should now fail
    await assert.rejects(
      async () => {
        await verifyParentPin(parentUser.id, '1234');
      },
      (err) => {
        assert.equal(err.statusCode, 401);
        return true;
      }
    );

    // New PIN 8899 should succeed
    const newVerify = await verifyParentPin(parentUser.id, '8899');
    assert.equal(newVerify.success, true);
    assert.equal(newVerify.verified, true);
  });

  await t.test('Detects repeated failed attempts and triggers security lockout', async () => {
    // Attempt wrong PIN 4 times
    for (let i = 0; i < 4; i++) {
      await assert.rejects(
        async () => {
          await verifyParentPin(parentUser.id, '0000');
        },
        (err) => {
          assert.equal(err.statusCode, 401);
          return true;
        }
      );
    }

    // 5th failed attempt should trigger lockout (423 Locked)
    await assert.rejects(
      async () => {
        await verifyParentPin(parentUser.id, '0000');
      },
      (err) => {
        assert.equal(err.statusCode, 423);
        assert.match(err.message, /lockout|locked/i);
        return true;
      }
    );

    // Check status reflects locked state
    const status = await getParentPinStatus(parentUser.id);
    assert.equal(status.isLocked, true);
    assert.ok(status.lockedUntil);
  });

  await t.test('Dispatches security webhook safely without crashing when unconfigured', async () => {
    const dispatch = await dispatchSecurityWebhook({
      event: 'TAMPER_SUSPECTED',
      actorUserId: parentUser.id,
      severity: 'HIGH',
      details: { test: true },
    });

    assert.ok(dispatch.payload);
    assert.equal(dispatch.payload.event, 'TAMPER_SUSPECTED');
    assert.equal(dispatch.payload.source, 'AIPD-Parent-Tamper-Shield');
  });

  t.after(async () => {
    await closeDb();
  });
});
