import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import config from '@aipd/config';
import { isN8nResponding, activateLiveWorkflow } from './n8nActivator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../../../');
const n8nUserFolder = path.resolve(projectRoot, '.n8n');

let n8nProcess = null;
let activeEnsurePromise = null;

export function findN8nBin() {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const npxCache = path.join(localAppData, 'npm-cache', '_npx');

  if (fs.existsSync(npxCache)) {
    try {
      const dirs = fs.readdirSync(npxCache);
      for (const d of dirs) {
        const binCandidate = path.join(npxCache, d, 'node_modules', 'n8n', 'bin', 'n8n');
        if (fs.existsSync(binCandidate)) {
          return binCandidate;
        }
      }
    } catch {
      // Ignore directory read errors
    }
  }
  return null;
}

export async function ensureN8nLiveWorkflow(options = {}) {
  if (activeEnsurePromise) return activeEnsurePromise;
  activeEnsurePromise = _ensureN8nLiveWorkflowInternal(options)
    .finally(() => {
      activeEnsurePromise = null;
    });
  return activeEnsurePromise;
}

async function _ensureN8nLiveWorkflowInternal(options = {}) {
  const baseUrl = options.baseUrl || config.n8nBaseUrl || 'http://localhost:5678';
  console.log(`[n8n Orchestrator] Ensuring n8n service and live workflow on ${baseUrl}...`);

  const alreadyUp = await isN8nResponding(baseUrl);

  if (alreadyUp) {
    console.log('[n8n Orchestrator] n8n is already active and responsive.');
  } else {
    console.log('[n8n Orchestrator] Starting n8n background process...');
    const binPath = findN8nBin();

    const n8nEnv = {
      ...process.env,
      N8N_USER_FOLDER: n8nUserFolder,
      N8N_PORT: '5678',
      N8N_DIAGNOSTICS_ENABLED: 'false',
      N8N_VERSION_NOTIFICATIONS_ENABLED: 'false',
      N8N_TEMPLATES_ENABLED: 'false',
      N8N_HIRING_BANNER_ENABLED: 'false',
      N8N_PERSONALIZATION_ENABLED: 'false',
      N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS: 'true'
    };

    if (binPath) {
      n8nProcess = spawn('node', [binPath, 'start'], {
        env: n8nEnv,
        cwd: projectRoot,
        stdio: 'ignore',
        windowsHide: true,
        detached: false
      });
    } else {
      n8nProcess = spawn('npx', ['--yes', 'n8n', 'start'], {
        env: n8nEnv,
        cwd: projectRoot,
        shell: true,
        stdio: 'ignore',
        windowsHide: true,
        detached: false
      });
    }

    n8nProcess.on('error', (err) => {
      console.warn('[n8n Orchestrator] n8n process error:', err.message);
    });

    // Wait up to 30 seconds for n8n to respond
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await isN8nResponding(baseUrl)) {
        ready = true;
        break;
      }
    }

    if (!ready) {
      throw new Error(`n8n failed to respond on ${baseUrl} within 30 seconds`);
    }

    console.log('[n8n Orchestrator] n8n background server is ready.');
  }

  // Activate and verify live workflow
  try {
    const result = await activateLiveWorkflow(baseUrl);
    if (result.success) {
      console.log(`[n8n Orchestrator] SUCCESS: Anti-Tamper Shield workflow is LIVE at: ${result.webhookUrl}`);
    }
    return result;
  } catch (err) {
    console.warn('[n8n Orchestrator] Workflow activation notice:', err.message);
    return { success: false, error: err.message };
  }
}

export function stopN8nProcess() {
  if (n8nProcess && !n8nProcess.killed) {
    try {
      n8nProcess.kill('SIGTERM');
      console.log('[n8n Orchestrator] n8n process terminated.');
    } catch (e) {
      // Ignore termination error
    }
  }
}
