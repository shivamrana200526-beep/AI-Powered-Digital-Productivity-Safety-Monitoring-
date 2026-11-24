import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDecision, clearDeduplicationCache } from '../src/decision/decisionEngine.js';
import { AICategory, DecisionAction, AIRiskLevel } from '@aipd/shared-types';

test('Decision Engine Tests', async (t) => {
  t.beforeEach(() => {
    clearDeduplicationCache();
  });

  await t.test('Inactive session results in no study classification', () => {
    const res = evaluateDecision({
      sessionActive: false,
      aiResult: { category: AICategory.DISTRACTED, confidence: 0.95 },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Minecraft',
    });

    assert.equal(res.action, DecisionAction.RECORD_ONLY);
    assert.equal(res.category, AICategory.UNCERTAIN);
  });

  await t.test('AI error results in AI_ERROR action', () => {
    const res = evaluateDecision({
      sessionActive: true,
      aiResult: { success: false, reason: 'Timeout' },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Chrome',
    });

    assert.equal(res.action, DecisionAction.AI_ERROR);
  });

  await t.test('Relevant activity continues without warning', () => {
    const res = evaluateDecision({
      sessionActive: true,
      aiResult: {
        category: AICategory.RELEVANT,
        confidence: 0.95,
        reason: 'Valid study website',
        riskLevel: AIRiskLevel.NONE,
      },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Chrome',
    });

    assert.equal(res.action, DecisionAction.CONTINUE);
    assert.equal(res.parentAlertRequired, false);
  });

  await t.test('Distraction above threshold warns student', () => {
    const res = evaluateDecision({
      sessionActive: true,
      aiResult: {
        category: AICategory.DISTRACTED,
        confidence: 0.85, // > default 0.70 threshold
        reason: 'Gaming website',
        riskLevel: AIRiskLevel.NONE,
        suggestedStudentMessage: 'Please return to your homework.',
      },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Steam',
    });

    assert.equal(res.action, DecisionAction.WARN_STUDENT);
    assert.equal(res.studentMessage, 'Please return to your homework.');
    assert.equal(res.parentAlertRequired, false);
    assert.equal(res.isDeduplicated, false);
  });

  await t.test('Distraction alert is deduplicated within cooldown window', () => {
    // First alert
    const first = evaluateDecision({
      sessionActive: true,
      aiResult: {
        category: AICategory.DISTRACTED,
        confidence: 0.85,
        reason: 'Gaming website',
      },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Steam',
    });
    assert.equal(first.action, DecisionAction.WARN_STUDENT);

    // Second immediate identical alert should be deduplicated
    const second = evaluateDecision({
      sessionActive: true,
      aiResult: {
        category: AICategory.DISTRACTED,
        confidence: 0.85,
        reason: 'Gaming website',
      },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Steam',
    });
    assert.equal(second.action, DecisionAction.RECORD_ONLY);
    assert.equal(second.isDeduplicated, true);
  });

  await t.test('Potentially harmful activity with protection enabled alerts parent', () => {
    const res = evaluateDecision({
      sessionActive: true,
      aiResult: {
        category: AICategory.POTENTIALLY_HARMFUL,
        confidence: 0.95, // > 0.80 threshold
        reason: 'Self-harm forum',
        riskLevel: AIRiskLevel.HIGH,
        requiresParentAlert: true,
      },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Discord',
    });

    assert.equal(res.action, DecisionAction.ALERT_PARENT);
    assert.equal(res.parentAlertRequired, true);
  });

  await t.test('Potentially harmful activity with protection disabled suppresses parent alert', () => {
    const res = evaluateDecision({
      sessionActive: true,
      aiResult: {
        category: AICategory.POTENTIALLY_HARMFUL,
        confidence: 0.95,
        reason: 'Flagged content',
        riskLevel: AIRiskLevel.HIGH,
      },
      parentProtectionEnabled: false,
      sessionId: 'sess-1',
      appName: 'Discord',
    });

    assert.equal(res.action, DecisionAction.RECORD_ONLY);
    assert.equal(res.parentAlertRequired, false);
  });

  await t.test('Low confidence falls back to UNCERTAIN', () => {
    const res = evaluateDecision({
      sessionActive: true,
      aiResult: {
        category: AICategory.DISTRACTED,
        confidence: 0.40, // < 0.70 threshold
        reason: 'Ambiguous window',
      },
      parentProtectionEnabled: true,
      sessionId: 'sess-1',
      appName: 'Explorer',
    });

    assert.equal(res.action, DecisionAction.UNCERTAIN);
    assert.equal(res.parentAlertRequired, false);
  });
});
