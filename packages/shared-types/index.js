/**
 * Core Enums and Constants for AI Study & Safety Coach
 */

export const UserRole = {
  PARENT: 'PARENT',
  STUDENT: 'STUDENT',
};

export const DeviceStatus = {
  ONLINE: 'ONLINE',
  OFFLINE: 'OFFLINE',
};

export const SessionStatus = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

export const ActivityEventType = {
  ACTIVE_WINDOW_CHANGE: 'ACTIVE_WINDOW_CHANGE',
  IDLE_START: 'IDLE_START',
  IDLE_END: 'IDLE_END',
  INTERACTION_METRIC: 'INTERACTION_METRIC',
  APP_SWITCH: 'APP_SWITCH',
  SESSION_BASELINE: 'SESSION_BASELINE',
  CONTEXT_SNAPSHOT: 'CONTEXT_SNAPSHOT', // Periodic 5-minute automated screen capture
};

export const AICategory = {
  RELEVANT: 'RELEVANT',
  DISTRACTED: 'DISTRACTED',
  POTENTIALLY_HARMFUL: 'POTENTIALLY_HARMFUL',
  UNCERTAIN: 'UNCERTAIN',
  AI_ERROR: 'AI_ERROR',
};

export const AIRiskLevel = {
  NONE: 'NONE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
};

export const NotificationSeverity = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
};

export const NotificationType = {
  DISTRACTION_WARNING: 'DISTRACTION_WARNING',
  SAFETY_ALERT: 'SAFETY_ALERT',
  DEVICE_STATUS: 'DEVICE_STATUS',
  SESSION_STATUS: 'SESSION_STATUS',
};

export const DecisionAction = {
  CONTINUE: 'CONTINUE',
  WARN_STUDENT: 'WARN_STUDENT',
  ALERT_PARENT: 'ALERT_PARENT',
  RECORD_ONLY: 'RECORD_ONLY',
  UNCERTAIN: 'UNCERTAIN',
  AI_ERROR: 'AI_ERROR',
};

export default {
  UserRole,
  DeviceStatus,
  SessionStatus,
  ActivityEventType,
  AICategory,
  AIRiskLevel,
  NotificationSeverity,
  NotificationType,
  DecisionAction,
};
