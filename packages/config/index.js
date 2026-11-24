/**
 * System configuration parameters for AI Study & Safety Coach
 */

export const config = {
  // Server
  port: parseInt(process.env.PORT || '4000', 10),
  jwtSecret: process.env.JWT_SECRET || 'aipd-super-secure-jwt-secret-dev-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',
  pgliteDataDir: process.env.PGLITE_DATA_DIR || './.pglite-data',

  // Idle tracking
  idleThresholdSeconds: parseInt(process.env.IDLE_THRESHOLD_SECONDS || '300', 10), // 5 minutes

  // Decision thresholds
  distractionConfidenceThreshold: parseFloat(process.env.DISTRACTION_CONFIDENCE_THRESHOLD || '0.70'),
  safetyConfidenceThreshold: parseFloat(process.env.SAFETY_CONFIDENCE_THRESHOLD || '0.80'),

  // Cooldown & Debounce & Periodic Captures
  contextCaptureCooldownMs: parseInt(process.env.CONTEXT_CAPTURE_COOLDOWN_MS || '5000', 10), // 5s cooldown
  periodicCaptureIntervalMs: parseInt(process.env.PERIODIC_CAPTURE_INTERVAL_MS || '120000', 10), // 2 minutes periodic SS
  alertDeduplicationCooldownMs: parseInt(process.env.ALERT_DEDUP_COOLDOWN_MS || '60000', 10), // 60s cooldown for same category/app

  // Pairing
  pairingCodeLength: 6,
  pairingCodeExpiryMinutes: 10,

  // Heartbeat
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10), // 30s
  heartbeatTimeoutMs: parseInt(process.env.HEARTBEAT_TIMEOUT_MS || '90000', 10), // 90s (device marked offline)

  // AI Provider
  aiProvider: process.env.NODE_ENV === 'test' ? 'mock' : (process.env.AI_PROVIDER || 'ollama'), // 'ollama' | 'gemini' | 'openai' | 'mock'
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.2:latest',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  // Focus score parameters
  focusScoreWeights: {
    baseScore: 100,
    distractionWeight: 50,
    idleWeight: 30,
    excessiveSwitchPenaltyMax: 20,
    switchRateThresholdPer10Min: 8, // More than 8 switches per 10 minutes starts incurring penalty
  },

  // n8n Automation & Anti-Tamper Security Webhook
  n8nSecurityWebhookUrl: process.env.N8N_SECURITY_WEBHOOK_URL || process.env.N8N_ALERT_WEBHOOK_URL || (process.env.NODE_ENV === 'test' ? '' : 'http://localhost:5678/webhook/aipd-security-alert'),
  n8nBaseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
  n8nAutoStart: process.env.NODE_ENV !== 'test' && process.env.N8N_AUTO_START !== 'false',
  parentPinAutoLockMinutes: parseInt(process.env.PARENT_PIN_AUTO_LOCK_MINUTES || '5', 10),
  parentPinMaxAttempts: parseInt(process.env.PARENT_PIN_MAX_ATTEMPTS || '5', 10),
  parentPinLockoutMinutes: parseInt(process.env.PARENT_PIN_LOCKOUT_MINUTES || '15', 10),
};

export default config;
