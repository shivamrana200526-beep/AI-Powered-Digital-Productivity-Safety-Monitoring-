process.env.NODE_ENV = 'test';
import test from 'node:test';
import assert from 'node:assert/strict';
import { aiResponseSchema } from '@aipd/validation';
import { AICategory, AIRiskLevel } from '@aipd/shared-types';
import { mockAiAnalyze, analyzeContext } from '../src/ai/aiAdapter.js';

test('AI Adapter Tests', async (t) => {
  await t.test('Validates correct AI output schema', () => {
    const validOutput = {
      category: AICategory.RELEVANT,
      confidence: 0.95,
      reason: 'User is reading Java tutorial relevant to assignment.',
      taskRelevance: 0.96,
      riskLevel: AIRiskLevel.NONE,
      suggestedStudentMessage: '',
      requiresParentAlert: false,
    };

    const parsed = aiResponseSchema.parse(validOutput);
    assert.equal(parsed.category, AICategory.RELEVANT);
    assert.equal(parsed.confidence, 0.95);
  });

  await t.test('Rejects malformed AI output schema', () => {
    const invalidOutput = {
      category: 'INVALID_CATEGORY',
      confidence: 1.5, // > 1.0 invalid
      reason: '',
      taskRelevance: -0.2, // < 0 invalid
      riskLevel: 'UNKNOWN',
      requiresParentAlert: 'yes', // should be boolean
    };

    assert.throws(() => {
      aiResponseSchema.parse(invalidOutput);
    });
  });

  await t.test('Mock AI correctly classifies relevant coding activity', () => {
    const result = mockAiAnalyze({
      task: 'Complete Java binary tree traversal exercises.',
      appName: 'Google Chrome',
      processName: 'chrome.exe',
      windowTitle: 'Binary Tree Traversal Tutorial - YouTube',
      idleSeconds: 0,
    });

    assert.equal(result.category, AICategory.RELEVANT);
    assert.ok(result.confidence >= 0.7);
    assert.equal(result.riskLevel, AIRiskLevel.NONE);
    assert.equal(result.requiresParentAlert, false);
  });

  await t.test('Mock AI correctly classifies unrelated entertainment distraction', () => {
    const result = mockAiAnalyze({
      task: 'Complete Java binary tree traversal exercises.',
      appName: 'Minecraft',
      processName: 'minecraft.exe',
      windowTitle: 'Minecraft 1.21 Survival World',
      idleSeconds: 0,
    });

    assert.equal(result.category, AICategory.DISTRACTED);
    assert.ok(result.confidence >= 0.8);
    assert.ok(result.suggestedStudentMessage.length > 0);
  });

  await t.test('Mock AI flags harmful activity and requires parent alert', () => {
    const result = mockAiAnalyze({
      task: 'Math Homework',
      appName: 'Discord',
      processName: 'discord.exe',
      windowTitle: 'Self-harm forum chat',
      idleSeconds: 0,
    });

    assert.equal(result.category, AICategory.POTENTIALLY_HARMFUL);
    assert.equal(result.riskLevel, AIRiskLevel.HIGH);
    assert.equal(result.requiresParentAlert, true);
  });

  await t.test('analyzeContext handles workflow safely and validates schema', async () => {
    const res = await analyzeContext({
      task: 'Study chemistry periodic table',
      appName: 'Google Chrome',
      processName: 'chrome.exe',
      windowTitle: 'Periodic Table Elements and Symbols',
      idleSeconds: 5,
    });

    assert.equal(res.success, true);
    assert.ok(res.data);
    assert.ok(res.data.confidence > 0);
    assert.ok(typeof res.latencyMs === 'number');
  });
});
