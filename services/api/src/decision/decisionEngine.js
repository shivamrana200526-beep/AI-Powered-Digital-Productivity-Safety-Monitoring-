import config from '@aipd/config';
import { AICategory, DecisionAction } from '@aipd/shared-types';

/**
 * In-memory deduplication cache: key -> timestamp of last notification
 */
const recentAlerts = new Map();

/**
 * Clean up old entries from deduplication cache periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of recentAlerts.entries()) {
    if (now - timestamp > config.alertDeduplicationCooldownMs * 2) {
      recentAlerts.delete(key);
    }
  }
}, 60000).unref();

export function clearDeduplicationCache() {
  recentAlerts.clear();
}

/**
 * Deterministic Decision Engine conforming strictly to Specification Section 9
 *
 * @param {Object} params
 * @param {boolean} params.sessionActive - Whether study session is currently ACTIVE
 * @param {Object} params.aiResult - Output from AI Adapter ({ category, confidence, reason, riskLevel, suggestedStudentMessage, requiresParentAlert })
 * @param {boolean} params.parentProtectionEnabled - Whether supervised protection policy is on for child device
 * @param {string} params.sessionId - Current session UUID
 * @param {string} params.appName - Active app name (used for deduplication)
 * @returns {Object} DecisionResult
 */
export function evaluateDecision({
  sessionActive,
  aiResult,
  parentProtectionEnabled = true,
  sessionId = '',
  appName = '',
}) {
  // 1. Inactive session
  if (!sessionActive) {
    return {
      action: DecisionAction.RECORD_ONLY,
      category: AICategory.UNCERTAIN,
      confidence: 1.0,
      reason: 'Session is inactive; no study classification applied.',
      studentMessage: '',
      parentAlertRequired: false,
      isDeduplicated: false,
    };
  }

  // 2. AI Error / Unsuccessful evaluation
  if (!aiResult || aiResult.success === false || aiResult.category === AICategory.AI_ERROR) {
    return {
      action: DecisionAction.AI_ERROR,
      category: AICategory.AI_ERROR,
      confidence: 0.0,
      reason: aiResult?.reason || 'AI evaluation error.',
      studentMessage: '',
      parentAlertRequired: false,
      isDeduplicated: false,
    };
  }

  const category = aiResult.data?.category || aiResult.category;
  const confidence = aiResult.data?.confidence ?? aiResult.confidence ?? 0;
  const reason = aiResult.data?.reason || aiResult.reason || '';
  const suggestedStudentMessage = aiResult.data?.suggestedStudentMessage || aiResult.suggestedStudentMessage || '';

  // 3. Relevant Activity
  if (category === AICategory.RELEVANT) {
    return {
      action: DecisionAction.CONTINUE,
      category: AICategory.RELEVANT,
      confidence,
      reason,
      studentMessage: '',
      parentAlertRequired: false,
      isDeduplicated: false,
    };
  }

  // 4. Potentially Harmful Activity (Checked before standard distraction)
  if (category === AICategory.POTENTIALLY_HARMFUL && confidence >= config.safetyConfidenceThreshold) {
    const dedupKey = `harmful:${sessionId}:${appName}`;
    const lastAlert = recentAlerts.get(dedupKey) || 0;
    const isDedup = (Date.now() - lastAlert) < config.alertDeduplicationCooldownMs;

    if (!isDedup) {
      recentAlerts.set(dedupKey, Date.now());
    }

    return {
      action: parentProtectionEnabled && !isDedup ? DecisionAction.ALERT_PARENT : DecisionAction.RECORD_ONLY,
      category: AICategory.POTENTIALLY_HARMFUL,
      confidence,
      reason,
      studentMessage: suggestedStudentMessage || 'This activity has been recorded for review.',
      parentAlertRequired: parentProtectionEnabled && !isDedup,
      isDeduplicated: isDedup,
    };
  }

  // 5. Distracted Activity
  if (category === AICategory.DISTRACTED && confidence >= config.distractionConfidenceThreshold) {
    const dedupKey = `distracted:${sessionId}:${appName}`;
    const lastAlert = recentAlerts.get(dedupKey) || 0;
    const isDedup = (Date.now() - lastAlert) < config.alertDeduplicationCooldownMs;

    if (!isDedup) {
      recentAlerts.set(dedupKey, Date.now());
    }

    return {
      action: !isDedup ? DecisionAction.WARN_STUDENT : DecisionAction.RECORD_ONLY,
      category: AICategory.DISTRACTED,
      confidence,
      reason,
      studentMessage: suggestedStudentMessage || 'Let\'s refocus on your study task!',
      parentAlertRequired: false,
      isDeduplicated: isDedup,
    };
  }

  // 6. Uncertain fallback
  return {
    action: DecisionAction.UNCERTAIN,
    category: AICategory.UNCERTAIN,
    confidence,
    reason: `Confidence below threshold or ambiguous context (${reason})`,
    studentMessage: '',
    parentAlertRequired: false,
    isDeduplicated: false,
  };
}

export default {
  evaluateDecision,
  clearDeduplicationCache,
};
