import { z } from 'zod';
import { AICategory, AIRiskLevel, UserRole, ActivityEventType } from '@aipd/shared-types';

/**
 * Strict AI Output Schema conforming to Specification Section 8.1
 */
export const aiResponseSchema = z.object({
  category: z.enum([
    AICategory.RELEVANT,
    AICategory.DISTRACTED,
    AICategory.POTENTIALLY_HARMFUL,
  ]),
  confidence: z.number().min(0).max(1),
  reason: z.string().min(1).max(500),
  taskRelevance: z.number().min(0).max(1),
  riskLevel: z.enum([
    AIRiskLevel.NONE,
    AIRiskLevel.LOW,
    AIRiskLevel.MEDIUM,
    AIRiskLevel.HIGH,
  ]),
  suggestedStudentMessage: z.string().optional(),
  requiresParentAlert: z.boolean(),
});

/**
 * Authentication Schemas
 */
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum([UserRole.PARENT, UserRole.STUDENT]),
});

export const loginSchema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Pairing Schemas
 */
export const generatePairingCodeSchema = z.object({
  studentEmail: z.string().email().optional(),
});

export const redeemPairingCodeSchema = z.object({
  code: z.string().min(4).max(12).transform(c => c.trim().toUpperCase()),
  deviceName: z.string().min(1).max(100),
  platform: z.string().default('Windows'),
});

/**
 * Parent Security PIN & Anti-Tamper Schemas
 */
export const verifyPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be between 4 and 6 digits'),
});

export const setPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be between 4 and 6 digits'),
  currentPin: z.string().optional(),
});

/**
 * Device Schemas
 */
export const updateProtectionSchema = z.object({
  protectionEnabled: z.boolean(),
  pin: z.string().optional(),
});

/**
 * Study Session Schemas
 */
export const createSessionSchema = z.object({
  deviceId: z.string().uuid(),
  taskText: z.string().min(3, 'Study task must be at least 3 characters long'),
});

/**
 * Activity Event Ingestion Schema
 */
export const activityEventSchema = z.object({
  sessionId: z.string().uuid(),
  eventType: z.enum([
    ActivityEventType.ACTIVE_WINDOW_CHANGE,
    ActivityEventType.IDLE_START,
    ActivityEventType.IDLE_END,
    ActivityEventType.INTERACTION_METRIC,
    ActivityEventType.APP_SWITCH,
    ActivityEventType.SESSION_BASELINE,
    ActivityEventType.CONTEXT_SNAPSHOT,
  ]),
  timestamp: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T/)),
  appName: z.string().max(255).optional().default(''),
  processName: z.string().max(255).optional().default(''),
  windowTitle: z.string().max(1000).optional().default(''),
  idleSeconds: z.number().int().nonnegative().optional().default(0),
  metadata: z.record(z.unknown()).optional().default({}),
  visualContext: z.string().optional(), // base64 encoded screenshot if triggered
});

export const batchActivityEventsSchema = z.object({
  events: z.array(activityEventSchema).min(1).max(100),
});
