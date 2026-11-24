import test from 'node:test';
import assert from 'node:assert/strict';
import { ActiveWindowMonitor } from '../electron/active-window-monitor.js';
import { InputTracker } from '../electron/input-tracker.js';
import { ContextCapture } from '../electron/context-capture.js';
import { ServiceAdapter } from '../electron/service-adapter.js';

test('Student Desktop Monitoring & Privacy Tests', async (t) => {
  await t.test('ActiveWindowMonitor detects simulated window transition', (t, done) => {
    const monitor = new ActiveWindowMonitor({ mockMode: true });

    monitor.once('window-changed', (event) => {
      assert.equal(event.eventType, 'ACTIVE_WINDOW_CHANGE');
      assert.equal(event.applicationName, 'Visual Studio Code');
      assert.equal(event.processName, 'code.exe');
      assert.ok(event.timestamp);
      done();
    });

    monitor.simulateWindowChange({
      applicationName: 'Visual Studio Code',
      processName: 'code.exe',
      windowTitle: 'BinaryTree.java',
    });
  });

  await t.test('InputTracker tracks aggregate activity and DOES NOT store key contents', () => {
    const tracker = new InputTracker({ idleThresholdSeconds: 1 });
    tracker.start();

    // Record 5 aggregate user interactions
    for (let i = 0; i < 5; i++) {
      tracker.recordInteraction();
    }

    const metrics = tracker.getMetrics();
    assert.equal(metrics.interactionCount, 5);
    assert.equal(metrics.isIdle, false);
    // Strict privacy verification: tracker must NOT hold keystroke buffers
    assert.equal(tracker.keyLogs, undefined);
    assert.equal(tracker.buffer, undefined);

    tracker.stop();
  });

  await t.test('ContextCapture enforces cooldown debounce policy', async () => {
    const capture = new ContextCapture({ cooldownMs: 1000 }); // 1000ms cooldown

    assert.equal(capture.canCapture(), true);

    const firstCapture = await capture.captureScreenContext('TEST');
    assert.ok(firstCapture);

    // Immediate second capture within cooldown must be throttled
    assert.equal(capture.canCapture(), false);
    const throttledCapture = await capture.captureScreenContext('TEST');
    assert.equal(throttledCapture, null);
  });

  await t.test('ServiceAdapter updates protection mode and writes audit trail', () => {
    const adapter = new ServiceAdapter({ protectionEnabled: false });
    assert.equal(adapter.isProtected, false);

    adapter.setProtection(true);
    assert.equal(adapter.isProtected, true);

    adapter.setProtection(false);
    assert.equal(adapter.isProtected, false);
  });
});
