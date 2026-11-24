import config from '@aipd/config';
import { aiResponseSchema } from '@aipd/validation';
import { AICategory, AIRiskLevel } from '@aipd/shared-types';

/**
 * Prompt instruction for Multimodal Vision-Language Model
 */
const SYSTEM_PROMPT = `
You are an expert AI Study & Safety Coach. Your responsibility is to contextually analyze whether a student's current computer activity is relevant to their assigned study task, or if it represents a distraction or potentially harmful activity.

Rules:
1. Judge relevance strictly against the student's assigned task.
2. Use visual context (if provided) and textual window/process context together.
3. Do NOT infer intent from the application name alone. For example, YouTube can be RELEVANT if watching a tutorial required for the task, but DISTRACTED if watching unrelated entertainment.
4. Do NOT overstate confidence.
5. If evidence is insufficient, classify with lower confidence or explain uncertainty.
6. Keep explanations short, neutral, and factual (1-2 sentences).
7. Flag POTENTIALLY_HARMFUL only if there is evidence of self-harm, severe cyberbullying, hate speech, or dangerous illegal activities.
8. Output MUST be valid JSON adhering strictly to this schema:
{
  "category": "RELEVANT" | "DISTRACTED" | "POTENTIALLY_HARMFUL",
  "confidence": number between 0.0 and 1.0,
  "reason": "short factual explanation",
  "taskRelevance": number between 0.0 and 1.0,
  "riskLevel": "NONE" | "LOW" | "MEDIUM" | "HIGH",
  "suggestedStudentMessage": "short gentle encouragement or reminder if distracted, otherwise omitted or empty",
  "requiresParentAlert": boolean
}
`;

/**
 * Mock / Rule-based AI Engine for testing and offline execution
 */
export function mockAiAnalyze(context) {
  const task = (context.task || '').toLowerCase();
  const windowTitle = (context.windowTitle || '').toLowerCase();
  const appName = (context.appName || '').toLowerCase();
  const processName = (context.processName || '').toLowerCase();

  // 1. Harmful & Explicit content check
  const harmfulKeywords = [
    'self-harm', 'suicide', 'kill yourself', 'bomb', 'weapons sale', 'hate speech',
    'explicit', 'porn', 'xxx', 'nsfw', 'adult content', 'nudity', 'erotic', 'casino', 'gambling'
  ];
  if (harmfulKeywords.some(kw => windowTitle.includes(kw) || appName.includes(kw) || task.includes(kw))) {
    return {
      category: AICategory.POTENTIALLY_HARMFUL,
      confidence: 0.98,
      reason: 'Detected explicit or harmful content violation on student screen.',
      taskRelevance: 0.0,
      riskLevel: AIRiskLevel.HIGH,
      suggestedStudentMessage: 'This activity has been blocked and flagged for parental safety review.',
      requiresParentAlert: true,
    };
  }

  // 2. Check relevance
  // Check if window title or app shares keywords with study task
  const taskWords = task.split(/\s+/).filter(w => w.length > 3 && !['complete', 'exercise', 'study', 'read', 'learn', 'watch'].includes(w));
  const isTitleRelevant = taskWords.some(w => windowTitle.includes(w) || appName.includes(w));

  const codingTools = ['vs code', 'code.exe', 'visual studio', 'intellij', 'pycharm', 'terminal', 'powershell', 'cmd.exe', 'eclipse'];
  const isCodingTask = task.includes('java') || task.includes('python') || task.includes('code') || task.includes('programming') || task.includes('tree');
  const isCodingApp = codingTools.some(tool => appName.includes(tool) || processName.includes(tool) || windowTitle.includes(tool));

  if (isTitleRelevant || (isCodingTask && isCodingApp)) {
    return {
      category: AICategory.RELEVANT,
      confidence: 0.92,
      reason: `Active window "${context.windowTitle || context.appName}" directly aligns with study task: "${context.task}".`,
      taskRelevance: 0.94,
      riskLevel: AIRiskLevel.NONE,
      suggestedStudentMessage: '',
      requiresParentAlert: false,
    };
  }

  // 3. Check obvious distractions
  const distractionApps = ['netflix', 'spotify', 'tiktok', 'instagram', 'discord', 'steam', 'minecraft', 'roblox', 'fortnite', 'twitch'];
  const isDistraction = distractionApps.some(d => windowTitle.includes(d) || appName.includes(d) || processName.includes(d));

  if (isDistraction || (windowTitle.includes('youtube') && !isTitleRelevant)) {
    return {
      category: AICategory.DISTRACTED,
      confidence: 0.88,
      reason: `Active window "${context.windowTitle || context.appName}" appears to be unrelated entertainment or social media.`,
      taskRelevance: 0.08,
      riskLevel: AIRiskLevel.NONE,
      suggestedStudentMessage: `Let's get back to your study task: "${context.task}".`,
      requiresParentAlert: false,
    };
  }

  // 4. Default: moderate relevance or uncertain
  return {
    category: AICategory.RELEVANT,
    confidence: 0.72,
    reason: `Window "${context.windowTitle || context.appName}" is open during study session without conflicting indicators.`,
    taskRelevance: 0.70,
    riskLevel: AIRiskLevel.NONE,
    suggestedStudentMessage: '',
    requiresParentAlert: false,
  };
}

/**
 * Calls OpenAI compatible API
 */
async function callOpenAI(context) {
  const promptText = `
Student Assigned Task: "${context.task}"
Current Application: "${context.appName}" (${context.processName})
Active Window Title: "${context.windowTitle}"
Idle State: ${context.idleSeconds} seconds idle
Recent Context: ${JSON.stringify(context.recentActivity || [])}
`;

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: context.visualContext
        ? [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: context.visualContext } },
          ]
        : promptText,
    },
  ];

  const res = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: config.openaiModel,
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.choices[0]?.message?.content;
  return JSON.parse(rawContent);
}

/**
 * Calls Google Gemini API
 */
async function callGemini(context) {
  const promptText = `${SYSTEM_PROMPT}

Analyze this desktop activity:
Student Task: "${context.task}"
Application: "${context.appName}" (${context.processName})
Window Title: "${context.windowTitle}"
Idle Seconds: ${context.idleSeconds}
`;

  const parts = [{ text: promptText }];
  if (context.visualContext && context.visualContext.startsWith('data:image')) {
    const [mimeInfo, base64Data] = context.visualContext.split(';base64,');
    const mimeType = mimeInfo.replace('data:', '') || 'image/png';
    parts.push({
      inlineData: {
        mimeType,
        data: base64Data,
      },
    });
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawContent);
}

/**
 * Calls local Ollama model (e.g. llama3.2:latest)
 */
async function callOllama(context) {
  const promptText = `
Student Assigned Study Task: "${context.task}"
Current Application: "${context.appName}" (${context.processName || ''})
Active Window Title: "${context.windowTitle}"
Idle State: ${context.idleSeconds || 0} seconds idle
Recent Context: ${JSON.stringify(context.recentActivity || [])}

Analyze this activity context against the student's study task. Determine category ('RELEVANT', 'DISTRACTED', or 'POTENTIALLY_HARMFUL'), confidence (0.0 to 1.0), short reason, taskRelevance (0.0 to 1.0), riskLevel ('NONE', 'LOW', 'MEDIUM', 'HIGH'), suggestedStudentMessage, and requiresParentAlert (boolean). Output strictly valid JSON conforming to the schema.
`;

  const baseUrl = config.ollamaBaseUrl || 'http://localhost:11434';
  const model = config.ollamaModel || 'llama3.2:latest';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: promptText },
        ],
        stream: false,
        format: 'json',
        options: {
          temperature: 0.1,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Ollama error ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    const rawContent = data.message?.content;
    const parsed = JSON.parse(rawContent);

    // Normalize category in case Ollama returned lowercase
    if (parsed.category) {
      parsed.category = parsed.category.toUpperCase();
    }
    if (parsed.riskLevel) {
      parsed.riskLevel = parsed.riskLevel.toUpperCase();
    }
    return parsed;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Main AI Analysis function with strict schema validation and 1x retry
 */
export async function analyzeContext(context) {
  const startTime = Date.now();
  let rawResult = null;
  let attempts = 0;
  const maxAttempts = 2; // initial + 1 retry on malformed output

  while (attempts < maxAttempts) {
    attempts++;
    try {
      if (process.env.NODE_ENV !== 'test' && config.aiProvider === 'ollama') {
        try {
          rawResult = await callOllama(context);
        } catch (ollamaErr) {
          console.warn(`[AI Adapter] Ollama call failed (${ollamaErr.message}), falling back to deterministic analyzer.`);
          rawResult = mockAiAnalyze(context);
        }
      } else if (config.aiProvider === 'gemini' && config.geminiApiKey) {
        rawResult = await callGemini(context);
      } else if (config.aiProvider === 'openai' && config.openaiApiKey) {
        rawResult = await callOpenAI(context);
      } else {
        // Mock provider (deterministic)
        rawResult = mockAiAnalyze(context);
      }

      // Strict validation against Zod schema
      const validated = aiResponseSchema.parse(rawResult);
      const latencyMs = Date.now() - startTime;

      return {
        success: true,
        data: validated,
        latencyMs,
        model: config.aiProvider === 'ollama' ? config.ollamaModel : config.aiProvider,
        raw: rawResult,
      };
    } catch (err) {
      console.warn(`[AI Adapter] Attempt ${attempts} failed: ${err.message}`);
      if (attempts >= maxAttempts) {
        return {
          success: false,
          category: AICategory.UNCERTAIN,
          confidence: 0.0,
          reason: `AI classification failed after retry: ${err.message}`,
          taskRelevance: 0.5,
          riskLevel: AIRiskLevel.NONE,
          requiresParentAlert: false,
          latencyMs: Date.now() - startTime,
          model: config.aiProvider,
          error: err.message,
        };
      }
    }
  }
}
