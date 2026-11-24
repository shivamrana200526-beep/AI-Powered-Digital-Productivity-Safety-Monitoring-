import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Windows Service & Supervision Adapter
 * Conforming strictly to Specification Section 18
 * 
 * SECURITY & ETHICS NOTICE:
 * - Does NOT use stealth persistence or antivirus evasion.
 * - Recognizes that a Windows Local Administrator can terminate processes.
 * - Implements application-level supervised watchdog and records tamper logs.
 */
export class ServiceAdapter {
  constructor(options = {}) {
    this.isProtected = options.protectionEnabled || false;
    this.agentProcess = null;
    this.watchdogTimer = null;
    this.logFile = options.logFile || path.resolve(process.cwd(), 'supervision.log');
  }

  setProtection(enabled) {
    this.isProtected = enabled;
    this.log(`Supervised Protection mode changed: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [ServiceSupervisor] ${message}\n`;
    try {
      fs.appendFileSync(this.logFile, entry);
    } catch (e) {
      // ignore
    }
  }

  /**
   * Watchdog supervisor to restart the desktop agent if closed unexpectedly when protected
   */
  startWatchdog(targetScript) {
    if (!this.isProtected) return;

    this.log('Watchdog supervisor active.');
    // Check heartbeat/process status
    this.watchdogTimer = setInterval(() => {
      if (this.isProtected && this.agentProcess && this.agentProcess.killed) {
        this.log('Desktop agent terminated unexpectedly. Restarting supervisor...');
        this.agentProcess = spawn(process.execPath, [targetScript], {
          detached: true,
          stdio: 'ignore',
        });
        this.agentProcess.unref();
      }
    }, 10000);
    this.watchdogTimer.unref();
  }

  stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    this.log('Watchdog supervisor stopped.');
  }
}

export default ServiceAdapter;
