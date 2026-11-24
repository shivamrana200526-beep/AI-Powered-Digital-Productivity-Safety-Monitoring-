import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateFocusScore, buildSessionSummary } from '../src/productivity/productivityEngine.js';

test('Productivity Engine Tests', async (t) => {
  await t.test('Perfect focus produces score of 100', () => {
    const result = calculateFocusScore({
      sessionMinutes: 60,
      distractionMinutes: 0,
      idleMinutes: 0,
      switchCount: 5,
    });

    assert.equal(result.focusScore, 100);
    assert.equal(result.distractionDeduction, 0);
    assert.equal(result.idleDeduction, 0);
    assert.equal(result.excessiveSwitchPenalty, 0);
    assert.equal(result.productiveMinutes, 60);
  });

  await t.test('Deducts distraction and idle accurately', () => {
    // 60 min session, 30 min distraction (50% -> 25 pt deduction), 12 min idle (20% -> 6 pt deduction)
    const result = calculateFocusScore({
      sessionMinutes: 60,
      distractionMinutes: 30,
      idleMinutes: 12,
      switchCount: 10,
    });

    // 100 - 25 - 6 = 69
    assert.equal(result.focusScore, 69);
    assert.equal(result.distractionDeduction, 25);
    assert.equal(result.idleDeduction, 6);
  });

  await t.test('Applies excessive switch penalty when switching frequency is abnormal', () => {
    const result = calculateFocusScore({
      sessionMinutes: 30,
      distractionMinutes: 0,
      idleMinutes: 0,
      switchCount: 60, // Very high switches for 30 min
    });

    assert.ok(result.excessiveSwitchPenalty > 0);
    assert.ok(result.focusScore < 100);
  });

  await t.test('Clamps score between 0 and 100 under extreme penalties', () => {
    const result = calculateFocusScore({
      sessionMinutes: 60,
      distractionMinutes: 60,
      idleMinutes: 60,
      switchCount: 200,
    });

    assert.equal(result.focusScore, 0);
    assert.ok(result.focusScore >= 0 && result.focusScore <= 100);
  });

  await t.test('buildSessionSummary builds chronological timeline and explainable metrics', () => {
    const session = {
      id: 'sess-123',
      task_text: 'Complete Java binary tree exercises',
      started_at: '2026-09-16T09:00:00.000Z',
      ended_at: '2026-09-16T10:00:00.000Z',
    };

    const events = [
      {
        id: 'ev-1',
        session_id: 'sess-123',
        event_type: 'ACTIVE_WINDOW_CHANGE',
        timestamp: '2026-09-16T09:05:00.000Z',
        app_name: 'Visual Studio Code',
        window_title: 'BinaryTree.java',
      },
      {
        id: 'ev-2',
        session_id: 'sess-123',
        event_type: 'ACTIVE_WINDOW_CHANGE',
        timestamp: '2026-09-16T09:25:00.000Z',
        app_name: 'Minecraft',
        window_title: 'Minecraft 1.21',
      },
      {
        id: 'ev-3',
        session_id: 'sess-123',
        event_type: 'IDLE_START',
        timestamp: '2026-09-16T09:40:00.000Z',
        idle_seconds: 300,
      },
    ];

    const analyses = [
      {
        activity_event_id: 'ev-1',
        category: 'RELEVANT',
        confidence: 0.95,
        task_relevance: 0.95,
        risk_level: 'NONE',
        reason: 'Coding Java tree implementation',
      },
      {
        activity_event_id: 'ev-2',
        category: 'DISTRACTED',
        confidence: 0.90,
        task_relevance: 0.05,
        risk_level: 'NONE',
        reason: 'Playing Minecraft game',
      },
    ];

    const summary = buildSessionSummary({ session, events, analyses });

    assert.ok(summary.breakdown);
    assert.ok(summary.timeline.length >= 4);
    assert.equal(summary.timeline[0].type, 'SESSION_START');
    assert.equal(summary.timeline[summary.timeline.length - 1].type, 'SESSION_END');
    assert.ok(summary.aiSummary.length > 0);
    assert.ok(summary.recommendations.length > 0);
    assert.equal(summary.distractionExplanations.length, 1);
  });
});
