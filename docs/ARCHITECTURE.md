# System Architecture & Technical Specifications

The **AI Study & Safety Coach** is a task-aware digital productivity and parent safety supervision platform designed with a Windows-first desktop agent, a real-time Express and PostgreSQL cloud backend, and a parent dashboard.

---

## 1. System Topology

```
+-------------------------------------------------------------+
|                      Student PC (Windows)                   |
|                                                             |
|   +-----------------------------------------------------+   |
|   |         Electron Desktop Main Process               |   |
|   |  - Active Window Bridge (Native Win32/PowerShell)   |   |
|   |  - Privacy Input Tracker (Aggregate counts only)    |   |
|   |  - Context Capture Engine (5s cooldown debounce)    |   |
|   |  - Offline Queue & Periodic Heartbeat               |   |
|   +--------------------------+--------------------------+   |
|                              | ContextBridge IPC            |
|   +--------------------------v--------------------------+   |
|   |       Isolated Renderer UI (Task Entry & Toast)     |   |
|   +-----------------------------------------------------+   |
+------------------------------+------------------------------+
                               | REST & WebSocket
                               v
+-------------------------------------------------------------+
|               Node.js / Express API Backend                 |
|                                                             |
|   [ Auth & RBAC ]  <--->  [ Pairing Engine (One-time code) ]|
|   [ Device Service ]<---> [ Study Sessions & Timelines ]    |
|   [ Activity Ingestion ] <-> [ Decision Engine ]            |
|         ^                         |                         |
|         |                         v                         |
|   [ Multimodal AI Adapter ]  [ Notification & Socket.IO ]   |
|   (Gemini / OpenAI / Mock)        |                         |
+-----------------+-----------------+-------------------------+
                  |                 |
                  v                 v Socket.IO Real-time
+-----------------------+     +-------------------------------+
| PostgreSQL / PGlite   |     |    Parent Web Dashboard       |
| (11 Normalized Tables)|     |  - Device Online Status       |
+-----------------------+     |  - Instant Safety Alerts      |
                              |  - Study Reports & Timelines  |
                              |  - Protection Mode Controls   |
                              +-------------------------------+
```

---

## 2. Event Ingestion to Decision Engine Pipeline

1. **Activity Trigger**: Active window title or foreground process changes.
2. **Context Capture**: Checks 5-second cooldown debounce. If allowed, captures thumbnail context.
3. **Ingestion**: Event posted to `/api/activity/events`.
4. **Context Construction**:
   ```json
   {
     "task": "Complete Java binary tree traversal exercises.",
     "application": "Google Chrome",
     "windowTitle": "Binary Tree Traversal Tutorial",
     "recentActivity": ["VS Code foreground", "active for 42 seconds"],
     "idleSeconds": 0
   }
   ```
5. **AI Semantic Analysis**: Multimodal model validates against task and returns strict JSON output:
   - `category`: `RELEVANT` | `DISTRACTED` | `POTENTIALLY_HARMFUL`
   - `confidence`: 0.0 – 1.0
   - `reason`: short factual explanation
   - `taskRelevance`: 0.0 – 1.0
   - `riskLevel`: `NONE` | `LOW` | `MEDIUM` | `HIGH`
   - `requiresParentAlert`: boolean
6. **Deterministic Decision Engine**:
   - `RELEVANT`: Continue session without interruptions.
   - `DISTRACTED` (confidence >= 0.70): Dispatches non-blocking desktop toast to student (`WARN_STUDENT`). Deduplicated for 60s against identical apps.
   - `POTENTIALLY_HARMFUL` (confidence >= 0.80 & protection enabled): Emits real-time Socket.IO alert to parent room and stores persistent CRITICAL notification (`ALERT_PARENT`).
   - `UNCERTAIN`: Recorded neutrally without penalizing the student.
7. **Productivity Calculation & Report**:
   - Transparent focus score:
     $$\text{focusScore} = \text{clamp}\left(100 - \frac{\text{distractionMinutes}}{\text{sessionMinutes}}\times 50 - \frac{\text{idleMinutes}}{\text{sessionMinutes}}\times 30 - \text{excessiveSwitchPenalty}, 0, 100\right)$$
   - Chronological timeline generated with start, relevant periods, distractions, and end times.
