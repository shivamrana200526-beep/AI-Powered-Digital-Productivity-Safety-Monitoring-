import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb, closeDb } from '../src/db/index.js';
import {
  registerUser,
  loginUser,
  generateToken,
  verifyToken,
} from '../src/auth/authService.js';
import { UserRole } from '@aipd/shared-types';

test('Auth Service Tests', async (t) => {
  await initDb();

  await t.test('Registers parent successfully', async () => {
    const parent = await registerUser({
      email: `parent_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      name: 'Test Parent',
      role: UserRole.PARENT,
    });

    assert.ok(parent.user.id);
    assert.equal(parent.user.role, UserRole.PARENT);
    assert.ok(parent.token);

    const decoded = verifyToken(parent.token);
    assert.equal(decoded.id, parent.user.id);
    assert.equal(decoded.role, UserRole.PARENT);
  });

  await t.test('Registers student successfully', async () => {
    const student = await registerUser({
      email: `student_${Date.now()}@example.com`,
      password: 'SecurePassword123!',
      name: 'Test Student',
      role: UserRole.STUDENT,
    });

    assert.ok(student.user.id);
    assert.equal(student.user.role, UserRole.STUDENT);
    assert.ok(student.token);
  });

  await t.test('Rejects duplicate email registration', async () => {
    const email = `dup_${Date.now()}@example.com`;
    await registerUser({
      email,
      password: 'SecurePassword123!',
      name: 'Original',
      role: UserRole.STUDENT,
    });

    await assert.rejects(
      async () => {
        await registerUser({
          email,
          password: 'AnotherPassword!',
          name: 'Duplicate',
          role: UserRole.STUDENT,
        });
      },
      { statusCode: 409 }
    );
  });

  await t.test('Logs in successfully with correct credentials', async () => {
    const email = `login_${Date.now()}@example.com`;
    const password = 'CorrectPassword123!';
    await registerUser({
      email,
      password,
      name: 'Login User',
      role: UserRole.PARENT,
    });

    const loginRes = await loginUser({ email, password });
    assert.ok(loginRes.token);
    assert.equal(loginRes.user.email, email);
  });

  await t.test('Fails login with incorrect password', async () => {
    const email = `wrongpass_${Date.now()}@example.com`;
    await registerUser({
      email,
      password: 'CorrectPassword123!',
      name: 'Login User',
      role: UserRole.STUDENT,
    });

    await assert.rejects(
      async () => {
        await loginUser({ email, password: 'WrongPassword!' });
      },
      { statusCode: 401 }
    );
  });
});
