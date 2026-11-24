process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { initDb } from '../src/db/index.js';
import { registerUser } from '../src/auth/authService.js';
import { createPairingCode, redeemPairingCode } from '../src/pairing/pairingService.js';
import { recordHeartbeat, getDeviceStatus } from '../src/devices/deviceService.js';
import { createSession, endSession, getSessionDetails, getActiveSessionForParent, getSessionCaptures } from '../src/sessions/sessionService.js';
import { processActivityEvent } from '../src/activity/activityService.js';
import { getUserNotifications } from '../src/notifications/notificationService.js';
import { UserRole, DecisionAction, AICategory } from '@aipd/shared-types';

test('End-to-End Study & Safety Coach Lifecycle Flow', async (t) => {
  await initDb();

  // Step 1: Users
  const parent = await registerUser({
    email: `e2e_parent_${Date.now()}@example.com`,
    password: 'ParentPassword123!',
    name: 'Eleanor Parent',
    role: UserRole.PARENT,
  });

  const student = await registerUser({
    email: `e2e_student_${Date.now()}@example.com`,
    password: 'StudentPassword123!',
    name: 'Leo Student',
    role: UserRole.STUDENT,
  });

  let deviceId;
  let sessionId;

  await t.test('1. Parent generates short-lived code & student redeems it', async () => {
    const { code } = await createPairingCode(parent.user.id);
    assert.equal(code.length, 6);

    const paired = await redeemPairingCode({
      code,
      studentId: student.user.id,
      deviceName: 'Leo Surface Pro',
      platform: 'Windows 11',
    });

    assert.equal(paired.success, true);
    assert.ok(paired.deviceId);
    deviceId = paired.deviceId;
  });

  await t.test('2. Child device reports heartbeat and status is ONLINE', async () => {
    const beat = await recordHeartbeat(deviceId, student.user.id);
    assert.equal(beat.status, 'ONLINE');

    const status = await getDeviceStatus(deviceId, parent.user);
    assert.equal(status.isOnline, true);
    assert.equal(status.calculatedStatus, 'ONLINE');
    assert.equal(status.protection_enabled, true);
  });

  await t.test('3. Student starts study session', async () => {
    const session = await createSession({
      studentId: student.user.id,
      deviceId,
      taskText: 'Complete Java binary tree traversal exercises.',
    });

    assert.ok(session.id);
    assert.equal(session.status, 'ACTIVE');
    assert.equal(session.taskText, 'Complete Java binary tree traversal exercises.');
    sessionId = session.id;
  });

  await t.test('4. Ingest RELEVANT event -> Decision is CONTINUE without warning', async () => {
    const res = await processActivityEvent(
      {
        sessionId,
        eventType: 'ACTIVE_WINDOW_CHANGE',
        timestamp: new Date().toISOString(),
        appName: 'Visual Studio Code',
        processName: 'code.exe',
        windowTitle: 'BinaryTree.java - Java Workspace',
        idleSeconds: 0,
      },
      student.user
    );

    assert.ok(res.decision);
    assert.equal(res.decision.action, DecisionAction.CONTINUE);
    assert.equal(res.decision.category, AICategory.RELEVANT);
    assert.equal(res.decision.parentAlertRequired, false);
  });

  await t.test('5. Ingest DISTRACTED event -> Decision is WARN_STUDENT', async () => {
    const res = await processActivityEvent(
      {
        sessionId,
        eventType: 'ACTIVE_WINDOW_CHANGE',
        timestamp: new Date().toISOString(),
        appName: 'Minecraft',
        processName: 'minecraft.exe',
        windowTitle: 'Minecraft 1.21 - Multi-player Server',
        idleSeconds: 0,
      },
      student.user
    );

    assert.ok(res.decision);
    assert.equal(res.decision.action, DecisionAction.WARN_STUDENT);
    assert.equal(res.decision.category, AICategory.DISTRACTED);
    assert.ok(res.decision.studentMessage.length > 0);
  });

  await t.test('6. Ingest POTENTIALLY_HARMFUL event -> Triggers parent safety alert', async () => {
    const res = await processActivityEvent(
      {
        sessionId,
        eventType: 'ACTIVE_WINDOW_CHANGE',
        timestamp: new Date().toISOString(),
        appName: 'Chrome',
        processName: 'chrome.exe',
        windowTitle: 'Self-harm online chat room',
        idleSeconds: 0,
      },
      student.user
    );

    assert.ok(res.decision);
    assert.equal(res.decision.action, DecisionAction.ALERT_PARENT);
    assert.equal(res.decision.category, AICategory.POTENTIALLY_HARMFUL);
    assert.equal(res.decision.parentAlertRequired, true);

    // Verify parent received persistent notification in database
    const parentNotifs = await getUserNotifications(parent.user.id);
    const safetyNotif = parentNotifs.find(n => n.type === 'SAFETY_ALERT');
    assert.ok(safetyNotif, 'Parent must have a persistent safety notification');
    assert.equal(safetyNotif.severity, 'CRITICAL');
  });

  await t.test('6b. Parent views active session with full task details & latest screenshot', async () => {
    // Ingest a 5-minute periodic screen context snapshot
    await processActivityEvent(
      {
        sessionId,
        eventType: 'CONTEXT_SNAPSHOT',
        timestamp: new Date().toISOString(),
        appName: 'Visual Studio Code',
        processName: 'code.exe',
        windowTitle: 'BinaryTree.java',
        idleSeconds: 0,
        visualContext: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        metadata: { periodic: true, intervalMinutes: 5 },
      },
      student.user
    );

    const activeForParent = await getActiveSessionForParent(parent.user);
    assert.ok(activeForParent);
    assert.equal(activeForParent.id, sessionId);
    assert.equal(activeForParent.task_text, 'Complete Java binary tree traversal exercises.');
    assert.equal(activeForParent.student_name, 'Leo Student');
    assert.ok(activeForParent.latestScreenshot);
    assert.ok(activeForParent.captureCount >= 1);

    // Parent inspects all session captures
    const captures = await getSessionCaptures(sessionId, parent.user);
    assert.ok(captures.length >= 1);
    assert.ok(captures[0].storage_ref.startsWith('data:image'));
  });

  await t.test('7. Student ends session -> Produces verified report and focus score', async () => {
    const report = await endSession(sessionId, student.user);

    assert.ok(report.reportId);
    assert.equal(typeof report.focusScore, 'number');
    assert.ok(report.focusScore >= 0 && report.focusScore <= 100);
    assert.ok(report.summary.timeline.length >= 3);
    assert.ok(report.summary.aiSummary.length > 0);
    assert.ok(report.summary.recommendations.length > 0);

    // Verify parent can access session details
    const parentView = await getSessionDetails(sessionId, parent.user);
    assert.equal(parentView.status, 'COMPLETED');
    assert.equal(Number(parentView.focus_score), report.focusScore);
  });
});
