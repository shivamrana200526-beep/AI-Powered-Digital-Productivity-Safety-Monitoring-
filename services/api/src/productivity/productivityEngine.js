import config from '@aipd/config';

/**
 * Calculates transparent, reconstructable focus score and metric breakdown
 * Conforming strictly to Specification Section 13.2
 */
export function calculateFocusScore({
  sessionMinutes,
  distractionMinutes,
  idleMinutes,
  switchCount,
}) {
  const safeSessionMinutes = Math.max(sessionMinutes, 1); // prevent divide-by-zero

  const weights = config.focusScoreWeights;
  const distractionRatio = Math.min(distractionMinutes / safeSessionMinutes, 1);
  const idleRatio = Math.min(idleMinutes / safeSessionMinutes, 1);

  const distractionDeduction = Number((distractionRatio * weights.distractionWeight).toFixed(2));
  const idleDeduction = Number((idleRatio * weights.idleWeight).toFixed(2));

  // Excessive switch penalty
  // Expected max switches: e.g. 8 switches per 10 minutes
  const expectedMaxSwitches = Math.max(10, Math.ceil((safeSessionMinutes / 10) * weights.switchRateThresholdPer10Min));
  let excessiveSwitchPenalty = 0;
  if (switchCount > expectedMaxSwitches) {
    const excess = switchCount - expectedMaxSwitches;
    excessiveSwitchPenalty = Math.min(excess * 1.5, weights.excessiveSwitchPenaltyMax);
  }
  excessiveSwitchPenalty = Number(excessiveSwitchPenalty.toFixed(2));

  const rawScore = weights.baseScore - distractionDeduction - idleDeduction - excessiveSwitchPenalty;
  const focusScore = Math.max(0, Math.min(100, Number(rawScore.toFixed(1))));

  const productiveMinutes = Math.max(
    0,
    Number((safeSessionMinutes - distractionMinutes - idleMinutes).toFixed(2))
  );

  return {
    focusScore,
    sessionMinutes: Number(safeSessionMinutes.toFixed(2)),
    productiveMinutes,
    distractionMinutes: Number(distractionMinutes.toFixed(2)),
    idleMinutes: Number(idleMinutes.toFixed(2)),
    switchCount,
    excessiveSwitchPenalty,
    distractionDeduction,
    idleDeduction,
    formula: '100 - (distractionMin/sessionMin * 50) - (idleMin/sessionMin * 30) - switchPenalty',
  };
}

/**
 * Reconstructs timeline, durations, and metrics from raw activity events and AI analyses
 */
export function buildSessionSummary({ session, events = [], analyses = [] }) {
  const startedAt = new Date(session.started_at).getTime();
  const endedAt = session.ended_at ? new Date(session.ended_at).getTime() : Date.now();
  const durationMinutes = Math.max(0.5, (endedAt - startedAt) / (60 * 1000));

  let distractionMinutes = 0;
  let idleSecondsTotal = 0;
  let switchCount = 0;
  let safetyEventsCount = 0;
  const distractionExplanations = [];
  const safetyEvents = [];

  // Map analyses by eventId
  const analysisMap = new Map();
  for (const a of analyses) {
    analysisMap.set(a.activity_event_id, a);
  }

  // Chronological timeline items
  const timeline = [];

  timeline.push({
    timestamp: session.started_at,
    type: 'SESSION_START',
    title: 'Study session started',
    description: `Task: "${session.task_text}"`,
  });

  // Sort events chronologically
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (let i = 0; i < sortedEvents.length; i++) {
    const event = sortedEvents[i];
    const nextEvent = sortedEvents[i + 1];
    const eventTime = new Date(event.timestamp).getTime();
    const nextTime = nextEvent ? new Date(nextEvent.timestamp).getTime() : endedAt;
    const intervalMinutes = Math.max(0.1, (nextTime - eventTime) / (60 * 1000));

    const analysis = analysisMap.get(event.id);

    if (event.event_type === 'ACTIVE_WINDOW_CHANGE' || event.event_type === 'APP_SWITCH') {
      switchCount++;
    }

    if (event.event_type === 'IDLE_START') {
      idleSecondsTotal += (event.idle_seconds || (intervalMinutes * 60));
      timeline.push({
        timestamp: event.timestamp,
        type: 'IDLE_START',
        title: 'Idle period began',
        description: `No user input detected.`,
      });
    } else if (event.event_type === 'IDLE_END') {
      timeline.push({
        timestamp: event.timestamp,
        type: 'IDLE_END',
        title: 'Activity resumed',
        description: 'Input detected, idle ended.',
      });
    } else if (analysis) {
      if (analysis.category === 'DISTRACTED') {
        distractionMinutes += intervalMinutes;
        distractionExplanations.push({
          timestamp: event.timestamp,
          app: event.app_name,
          title: event.window_title,
          reason: analysis.reason,
        });
        timeline.push({
          timestamp: event.timestamp,
          type: 'DISTRACTION',
          title: `${event.app_name || 'App'}: Distraction detected`,
          description: analysis.reason,
          riskLevel: analysis.risk_level,
        });
      } else if (analysis.category === 'POTENTIALLY_HARMFUL') {
        safetyEventsCount++;
        safetyEvents.push({
          timestamp: event.timestamp,
          app: event.app_name,
          title: event.window_title,
          reason: analysis.reason,
          riskLevel: analysis.risk_level,
        });
        timeline.push({
          timestamp: event.timestamp,
          type: 'SAFETY_EVENT',
          title: `Safety alert: ${event.app_name || 'App'}`,
          description: analysis.reason,
          riskLevel: analysis.risk_level,
        });
      } else if (analysis.category === 'RELEVANT') {
        timeline.push({
          timestamp: event.timestamp,
          type: 'RELEVANT_ACTIVITY',
          title: `${event.app_name || 'App'}: Relevant study activity`,
          description: analysis.reason || 'Activity aligns with task.',
        });
      }
    }
  }

  if (session.ended_at) {
    timeline.push({
      timestamp: session.ended_at,
      type: 'SESSION_END',
      title: 'Study session ended',
      description: `Completed session duration: ${Math.round(durationMinutes)} mins.`,
    });
  }

  const idleMinutes = idleSecondsTotal / 60;
  const breakdown = calculateFocusScore({
    sessionMinutes: durationMinutes,
    distractionMinutes,
    idleMinutes,
    switchCount,
  });

  // Generate explainable AI summary and recommendations
  let summaryText = '';
  const recommendations = [];

  if (breakdown.focusScore >= 85) {
    summaryText = `Outstanding session! Alex maintained high focus on "${session.task_text}" with minimal interruptions.`;
    recommendations.push('Keep up this great study routine.');
  } else if (breakdown.focusScore >= 65) {
    summaryText = `Productive session with moderate focus on "${session.task_text}". Some distraction or task switching occurred.`;
    recommendations.push('Try closing background entertainment tabs before beginning study sessions.');
  } else {
    summaryText = `Focus was challenged during this session on "${session.task_text}". Significant time was spent outside the study material.`;
    recommendations.push('Consider using the Pomodoro technique (25 min study, 5 min break) to limit mid-task distractions.');
  }

  if (switchCount > 20) {
    recommendations.push('High frequency of application switching observed. Focus on one resource at a time.');
  }
  if (breakdown.idleMinutes > 15) {
    recommendations.push('Extended idle periods noted. Remember to end your session when stepping away from the desk.');
  }

  return {
    breakdown,
    timeline,
    distractionExplanations,
    safetyEvents,
    safetyEventsCount,
    aiSummary: summaryText,
    recommendations,
  };
}

export default {
  calculateFocusScore,
  buildSessionSummary,
};
