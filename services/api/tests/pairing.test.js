import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { registerUser } from '../src/auth/authService.js';
import {
  createPairingCode,
  redeemPairingCode,
  generateRandomCode,
} from '../src/pairing/pairingService.js';
import { UserRole } from '@aipd/shared-types';

test('Pairing Service Tests', async (t) => {
  await initDb();

  const parent = await registerUser({
    email: `pairing_parent_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Pairing Parent',
    role: UserRole.PARENT,
  });

  const student = await registerUser({
    email: `pairing_student_${Date.now()}@example.com`,
    password: 'Password123!',
    name: 'Pairing Student',
    role: UserRole.STUDENT,
  });

  await t.test('Generates random 6-character code', () => {
    const code = generateRandomCode(6);
    assert.equal(code.length, 6);
    assert.match(code, /^[A-Z0-9]{6}$/);
  });

  await t.test('Parent generates short-lived code', async () => {
    const result = await createPairingCode(parent.user.id);
    assert.ok(result.code);
    assert.equal(result.expiresInMinutes, 10);
    assert.ok(new Date(result.expiresAt) > new Date());
  });

  await t.test('Student redeems code and links device', async () => {
    const { code } = await createPairingCode(parent.user.id);

    const redeemRes = await redeemPairingCode({
      code,
      studentId: student.user.id,
      deviceName: 'Alex Surface Laptop',
      platform: 'Windows',
    });

    assert.equal(redeemRes.success, true);
    assert.ok(redeemRes.deviceId);
    assert.equal(redeemRes.parentId, parent.user.id);
  });

  await t.test('Rejects reusing the same pairing code (one-time use)', async () => {
    const { code } = await createPairingCode(parent.user.id);

    // First redemption succeeds
    await redeemPairingCode({
      code,
      studentId: student.user.id,
      deviceName: 'Alex Laptop 1',
      platform: 'Windows',
    });

    // Second redemption must fail
    await assert.rejects(
      async () => {
        await redeemPairingCode({
          code,
          studentId: student.user.id,
          deviceName: 'Alex Laptop 2',
          platform: 'Windows',
        });
      },
      { statusCode: 400 }
    );
  });

  await t.test('Rejects invalid code', async () => {
    await assert.rejects(
      async () => {
        await redeemPairingCode({
          code: 'INVALIDCODE123',
          studentId: student.user.id,
          deviceName: 'Device',
          platform: 'Windows',
        });
      },
      { statusCode: 400 }
    );
  });
});
