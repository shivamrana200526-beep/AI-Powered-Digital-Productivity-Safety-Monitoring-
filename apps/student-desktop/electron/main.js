import { app, BrowserWindow, ipcMain, desktopCapturer } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '@aipd/config';
import { ActiveWindowMonitor } from './active-window-monitor.js';
import { InputTracker } from './input-tracker.js';
import { ContextCapture } from './context-capture.js';
import { ServiceAdapter } from './service-adapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let currentSession = null;
let deviceId = null;
let authToken = null;
let apiBaseUrl = `http://localhost:${config.port}`;
const offlineQueue = [];
let periodicCaptureTimer = null;

// Initialize sub-engines
const windowMonitor = new ActiveWindowMonitor({ intervalMs: 2000 });
const inputTracker = new InputTracker({ idleThresholdSeconds: config.idleThresholdSeconds });
const contextCapture = new ContextCapture({ desktopCapturer, cooldownMs: config.contextCaptureCooldownMs });
const serviceAdapter = new ServiceAdapter();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    title: 'AI Study & Safety Coach - Student Desktop',
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
    },
  });

  // Load the student UI
  const uiPath = path.join(__dirname, '../src/index.html');
  mainWindow.loadFile(uiPath);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * Syncs queued offline activity events to backend
 */
async function flushOfflineQueue() {
  if (offlineQueue.length === 0 || !authToken) return;

  const batch = [...offlineQueue];
  offlineQueue.length = 0;

  try {
    await fetch(`${apiBaseUrl}/api/activity/events/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ events: batch }),
    });
  } catch (err) {
    // Re-queue on failure
    offlineQueue.unshift(...batch);
  }
}

/**
 * Dispatches activity event to API or stores in offline queue
 */
async function recordActivityEvent(eventData) {
  if (!currentSession || !authToken) return;

  const payload = {
    sessionId: currentSession.id,
    timestamp: new Date().toISOString(),
    ...eventData,
  };

  try {
    const res = await fetch(`${apiBaseUrl}/api/activity/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.decision?.action === 'WARN_STUDENT' && mainWindow) {
        mainWindow.webContents.send('student:distraction_warning', {
          appName: payload.appName,
          reason: data.decision.reason,
          message: data.decision.studentMessage,
        });
      }
      // Also flush any pending offline events
      await flushOfflineQueue();
    } else {
      offlineQueue.push(payload);
    }
  } catch (err) {
    offlineQueue.push(payload);
  }
}

// Window Monitor event hook
windowMonitor.on('window-changed', async (event) => {
  if (!currentSession) return;

  // Immediate screenshot capture on window/app switch without cooldown suppression
  const visualContext = await contextCapture.captureScreenContext('WINDOW_SWITCH');

  await recordActivityEvent({
    eventType: 'ACTIVE_WINDOW_CHANGE',
    appName: event.applicationName,
    processName: event.processName,
    windowTitle: event.windowTitle,
    idleSeconds: 0,
    visualContext,
  });
});

// Idle tracking hooks
inputTracker.on('idle-start', async (event) => {
  await recordActivityEvent({
    eventType: 'IDLE_START',
    idleSeconds: event.idleSeconds,
  });
});

inputTracker.on('idle-end', async (event) => {
  await recordActivityEvent({
    eventType: 'IDLE_END',
    idleSeconds: event.idleSeconds,
  });
});

// Setup IPC handlers
ipcMain.handle('session:start', async (event, data) => {
  const { taskText, token, devId } = data;
  authToken = token;
  deviceId = devId;

  try {
    const res = await fetch(`${apiBaseUrl}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ deviceId, taskText }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to start session');
    }

    currentSession = await res.json();
    windowMonitor.start();
    inputTracker.start();

    // Baseline capture
    const baseline = await contextCapture.captureScreenContext('BASELINE');
    await recordActivityEvent({
      eventType: 'SESSION_BASELINE',
      appName: 'Session Start',
      windowTitle: taskText,
      visualContext: baseline,
    });

    // Start 2-minute periodic screenshot timer during active study session
    if (periodicCaptureTimer) clearInterval(periodicCaptureTimer);
    periodicCaptureTimer = setInterval(async () => {
      if (!currentSession) return;
      try {
        const visualContext = await contextCapture.captureScreenContext('PERIODIC_2MIN');
        const win = await windowMonitor.getActiveWindow();
        await recordActivityEvent({
          eventType: 'CONTEXT_SNAPSHOT',
          appName: win.applicationName || 'Active App',
          processName: win.processName || '',
          windowTitle: win.windowTitle || '',
          idleSeconds: inputTracker.getMetrics().idleSecondsCurrent,
          visualContext,
          metadata: { periodic: true, intervalMinutes: 2 },
        });
      } catch (err) {
        console.warn('[Periodic SS] Error taking periodic screenshot:', err.message);
      }
    }, config.periodicCaptureIntervalMs);
    periodicCaptureTimer.unref();

    return { success: true, session: currentSession };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('session:end', async () => {
  if (!currentSession || !authToken) {
    return { success: false, error: 'No active session' };
  }

  try {
    if (periodicCaptureTimer) {
      clearInterval(periodicCaptureTimer);
      periodicCaptureTimer = null;
    }

    const res = await fetch(`${apiBaseUrl}/api/sessions/${currentSession.id}/end`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to end session (${res.status})`);
    }

    const report = await res.json();
    windowMonitor.stop();
    inputTracker.stop();
    currentSession = null;

    return { success: true, report };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('session:getState', () => {
  return {
    isActive: !!currentSession,
    session: currentSession,
    metrics: inputTracker.getMetrics(),
  };
});

ipcMain.handle('screen:capture', async () => {
  try {
    return await contextCapture.captureScreenContext('ON_DEMAND');
  } catch (err) {
    console.warn('[ScreenCapture] On-demand capture failed:', err.message);
    return null;
  }
});

ipcMain.handle('pairing:redeem', async (event, data) => {
  const { code, token, deviceName, deviceType } = data || {};
  if (!token) return { success: false, error: 'Authentication required' };
  try {
    const res = await fetch(`${apiBaseUrl}/api/pairing/redeem`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        code,
        deviceName: deviceName || 'Student Desktop',
        deviceType: deviceType || 'DESKTOP',
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Pairing failed');
    }
    const result = await res.json();
    deviceId = result.deviceId || result.device?.id || null;
    authToken = token;
    return { success: true, deviceId, device: result.device };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('device:getStatus', async () => {
  return {
    deviceId,
    isPaired: !!deviceId,
    isMonitoring: !!currentSession,
  };
});

ipcMain.on('input:interaction', () => {
  inputTracker.recordInteraction();
});

// Periodic heartbeat
setInterval(async () => {
  if (deviceId && authToken) {
    try {
      await fetch(`${apiBaseUrl}/api/devices/${deviceId}/heartbeat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch (e) {
      // Offline
    }
  }
}, config.heartbeatIntervalMs).unref();

// App lifecycle
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
