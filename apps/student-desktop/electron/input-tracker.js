import { EventEmitter } from 'node:events';
import config from '@aipd/config';

/**
 * Privacy-Preserving Input & Idle Tracker
 * 
 * STRICT PRIVACY COMPLIANCE (Section 6.2, 19):
 * - Records ONLY aggregate interaction counts and timestamps.
 * - NEVER captures or stores literal key codes, typed text, passwords, or clipboard contents.
 */
export class InputTracker extends EventEmitter {
  constructor(options = {}) {
    super();
    this.idleThresholdMs = (options.idleThresholdSeconds || config.idleThresholdSeconds) * 1000;
    this.lastActivityTime = Date.now();
    this.isIdle = false;
    this.interactionCount = 0;
    this.checkInterval = null;
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastActivityTime = Date.now();
    this.isIdle = false;

    // Periodically inspect idle duration
    this.checkInterval = setInterval(() => {
      this.evaluateIdleState();
    }, 5000);
    this.checkInterval.unref();

    console.log(`[InputTracker] Started privacy-preserving interaction tracker (idle threshold: ${this.idleThresholdMs / 1000}s).`);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.checkInterval) clearInterval(this.checkInterval);
    console.log('[InputTracker] Stopped input tracker.');
  }

  /**
   * Registers an aggregate interaction event (e.g. mouse move, click, or keystroke count increment)
   * Notice: No content or key data is passed or saved.
   */
  recordInteraction() {
    this.interactionCount++;
    const now = Date.now();

    if (this.isIdle) {
      this.isIdle = false;
      const idleDurationSeconds = Math.round((now - this.lastActivityTime) / 1000);
      this.emit('idle-end', {
        eventType: 'IDLE_END',
        timestamp: new Date().toISOString(),
        idleSeconds: idleDurationSeconds,
      });
    }

    this.lastActivityTime = now;
  }

  /**
   * Periodically checks if the elapsed time without activity exceeds threshold
   */
  evaluateIdleState() {
    if (!this.isRunning) return;
    const now = Date.now();
    const elapsed = now - this.lastActivityTime;

    if (!this.isIdle && elapsed >= this.idleThresholdMs) {
      this.isIdle = true;
      this.emit('idle-start', {
        eventType: 'IDLE_START',
        timestamp: new Date().toISOString(),
        idleSeconds: Math.round(elapsed / 1000),
      });
    }
  }

  getMetrics() {
    const elapsedSinceActivity = Math.round((Date.now() - this.lastActivityTime) / 1000);
    return {
      interactionCount: this.interactionCount,
      isIdle: this.isIdle,
      idleSecondsCurrent: this.isIdle ? elapsedSinceActivity : 0,
    };
  }
}

export default InputTracker;
