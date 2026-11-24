#!/usr/bin/env node
/**
 * Starts the complete AIPD stack:
 *  1. AIPD Express & Socket.IO API Server (port 4000)
 *  2. n8n Automation Engine (port 5678)
 *  3. Live Anti-Tamper Security Workflow
 */
import { execSync } from 'node:child_process';
import { startServer } from '../services/api/src/server.js';
import { ensureN8nLiveWorkflow } from '../services/api/src/n8n/n8nService.js';

function ensurePortAvailable(port) {
  if (process.platform !== 'win32') return;
  try {
    const output = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && pid !== `${process.pid}`) {
        console.log(`[Port Recovery] Reclaiming port ${port} from previous process (PID ${pid})...`);
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
        } catch {}
      }
    }
  } catch {
    // Port is free
  }
}

console.log('====================================================');
console.log('  AIPD — AI Productivity & Safety System (Windows)');
console.log('====================================================');

async function main() {
  ensurePortAvailable(4000);
  console.log('[1/2] Starting AIPD Core API & Real-time Server...');
  await startServer(4000);

  console.log('[2/2] Ensuring n8n and live security workflow...');
  const n8nResult = await ensureN8nLiveWorkflow();

  console.log('====================================================');
  console.log('  AIPD SERVICES ARE FULLY OPERATIONAL:');
  console.log('  • API & Realtime Server:   http://localhost:4000');
  console.log('  • Parent Supervision UI:  http://localhost:4000/parent/');
  console.log('  • Student Focus Studio:   http://localhost:4000/student/');
  console.log('  • n8n Automation Editor:  http://localhost:5678');
  console.log('  • Live Tamper Webhook:    http://localhost:5678/webhook/aipd-security-alert');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('[Startup Failure]', err);
  process.exit(1);
});
