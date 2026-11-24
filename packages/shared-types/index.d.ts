export type UserRoleType = 'PARENT' | 'STUDENT';
export type DeviceStatusType = 'ONLINE' | 'OFFLINE';
export type SessionStatusType = 'PENDING' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';
export type ActivityEventTypeType = 
  | 'ACTIVE_WINDOW_CHANGE' 
  | 'IDLE_START' 
  | 'IDLE_END' 
  | 'INTERACTION_METRIC' 
  | 'APP_SWITCH' 
  | 'SESSION_BASELINE';

export type AICategoryType = 'RELEVANT' | 'DISTRACTED' | 'POTENTIALLY_HARMFUL' | 'UNCERTAIN' | 'AI_ERROR';
export type AIRiskLevelType = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type NotificationSeverityType = 'INFO' | 'WARNING' | 'CRITICAL';
export type NotificationTypeType = 'DISTRACTION_WARNING' | 'SAFETY_ALERT' | 'DEVICE_STATUS' | 'SESSION_STATUS';
export type DecisionActionType = 'CONTINUE' | 'WARN_STUDENT' | 'ALERT_PARENT' | 'RECORD_ONLY' | 'UNCERTAIN' | 'AI_ERROR';

export interface AIAnalysisResult {
  category: AICategoryType;
  confidence: number;
  reason: string;
  taskRelevance: number;
  riskLevel: AIRiskLevelType;
  suggestedStudentMessage?: string;
  requiresParentAlert: boolean;
}

export interface ActivityEventPayload {
  sessionId: string;
  eventType: ActivityEventTypeType;
  timestamp: string;
  appName?: string;
  processName?: string;
  windowTitle?: string;
  idleSeconds?: number;
  metadata?: Record<string, unknown>;
  visualContext?: string;
}

export interface DecisionResult {
  action: DecisionActionType;
  category: AICategoryType;
  confidence: number;
  reason: string;
  studentMessage?: string;
  parentAlertRequired: boolean;
  isDeduplicated?: boolean;
}

export interface FocusScoreBreakdown {
  focusScore: number;
  sessionMinutes: number;
  productiveMinutes: number;
  distractionMinutes: number;
  idleMinutes: number;
  switchCount: number;
  excessiveSwitchPenalty: number;
  distractionDeduction: number;
  idleDeduction: number;
}
