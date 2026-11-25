import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import config from '@aipd/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { initDb, seedDb } from './db/index.js';
import { initSocketServer } from './websocket/index.js';
import { sweepOfflineDevices } from './devices/deviceService.js';
import { ensureN8nLiveWorkflow, stopN8nProcess } from './n8n/n8nService.js';

import authRoutes from './auth/authRoutes.js';
import pairingRoutes from './pairing/pairingRoutes.js';
import deviceRoutes from './devices/deviceRoutes.js';
import sessionRoutes from './sessions/sessionRoutes.js';
import activityRoutes from './activity/activityRoutes.js';
import aiRoutes from './ai/aiRoutes.js';
import reportRoutes from './reports/reportRoutes.js';
import notificationRoutes from './notifications/notificationRoutes.js';
import taskRoutes from './tasks/taskRoutes.js';

dotenv.config();

export const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' })); // Support base64 screen context

// Ensure DB is initialized and seeded in serverless environments (e.g., Vercel)
let dbInitPromise = null;
function ensureDbReady() {
  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      await initDb();
      await seedDb();
    })().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

app.use('/api', async (req, res, next) => {
  try {
    await ensureDbReady();
    next();
  } catch (err) {
    next(err);
  }
});

// Serve Landing page, Assets, Parent Dashboard & Student Desktop static web views
const landingDist = path.resolve(__dirname, '../../../apps/landing');
const assetsDist = path.resolve(__dirname, '../../../apps/assets');
const parentDist = path.resolve(__dirname, '../../../apps/parent-dashboard');
const studentDist = path.resolve(__dirname, '../../../apps/student-desktop/src');

app.use('/assets', express.static(assetsDist));
app.use('/parent', express.static(parentDist));
app.use('/student', express.static(studentDist));
app.use('/', express.static(landingDist));

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.resolve(assetsDist, 'logo_badge.png'));
});


// Health check
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'AI Study & Safety Coach API',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes conforming to Specification Section 15
app.use('/api/auth', authRoutes);
app.use('/api/pairing', pairingRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tasks', taskRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('[API Error]', err);
  const status = err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
  });
});

export const server = http.createServer(app);

// Setup Socket.IO
initSocketServer(server);

// Background sweeper for offline devices (every 30s)
let sweeperInterval = null;

export async function startServer(port = config.port) {
  await initDb();
  await seedDb();

  sweeperInterval = setInterval(() => {
    sweepOfflineDevices().catch(err => console.error('[Sweeper Error]', err));
  }, 30000);
  sweeperInterval.unref();

  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      reject(err);
    });
    server.listen(port, () => {
      console.log(`[API Server] Running at http://localhost:${port}`);

      // Automatically launch and activate n8n security workflow on server start (outside test mode)
      if (config.n8nAutoStart) {
        ensureN8nLiveWorkflow().catch((err) => {
          console.warn('[n8n Service] Auto-start notice:', err.message);
        });
      }

      resolve(server);
    });
  });
}

export function stopServer() {
  if (sweeperInterval) clearInterval(sweeperInterval);
  stopN8nProcess();
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// Start automatically if run directly
if (process.argv[1]?.endsWith('server.js')) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
