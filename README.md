# AI-Powered Digital Productivity & Safety Monitoring System
### (AI Study & Safety Coach)

A Windows-first desktop and cloud platform that contextually analyzes whether a student's current computer activity is relevant to their assigned study task, while providing connected parents with real-time device supervision, safety alerts, and explainable study reports.

---

## Architecture Overview

- **Student Desktop Client (`apps/student-desktop`)**:
  - Electron application with strict process isolation (`contextIsolation: true`, `nodeIntegration: false`).
  - Active Window Monitor (PowerShell/Win32 user32 bridge detecting foreground apps and window titles).
  - Privacy-preserving Input Tracker (aggregate interactions only, zero keystroke logging, idle detection).
  - Context Capture Engine (event-driven with a 5-second cooldown debounce).
  - Windows Service supervision adapter.
  - Student UI for entering study tasks, tracking session status, and receiving non-blocking distraction reminders.

- **Parent Dashboard (`apps/parent-dashboard`)**:
  - Web dashboard with real-time Socket.IO alerts and device heartbeat monitors.
  - Generates short-lived, single-use 6-character pairing codes.
  - Supervised protection mode toggles.
  - Reconstructable focus score breakdowns and chronological study session timelines.

- **Backend Services (`services/api`)**:
  - Node.js & Express REST API with Socket.IO realtime server.
  - Authentication and RBAC (`PARENT`, `STUDENT`) with JWT and bcrypt.
  - Deterministic Decision Engine (conforming strictly to Specification Section 9).
  - Productivity Engine calculating explainable focus scores:
    $$\text{focusScore} = \text{clamp}\left(100 - \frac{\text{distractionMin}}{\text{sessionMin}}\times 50 - \frac{\text{idleMin}}{\text{sessionMin}}\times 30 - \text{switchPenalty}, 0, 100\right)$$
  - Provider-agnostic Multimodal AI Adapter supporting **Google Gemini**, **OpenAI**, and deterministic **Mock** mode.
  - PostgreSQL persistence supporting both native PostgreSQL (`DATABASE_URL`) and embedded `@electric-sql/pglite` for zero-dependency local runs.

---

## Quick Start Guide

### 1. Prerequisites
- Node.js 18+ (tested on Node.js v24.13.0)
- npm 9+ (tested on npm 11.19.1)

### 2. Installation
Clone the repository and install all dependencies:
```bash
cd d:/AIPD
npm install
```

### 3. Environment Configuration
Copy the template configuration:
```bash
cp .env.example .env
```

Key environment variables:
- `PORT=4000`: Backend API port.
- `DATABASE_URL`: Optional PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/aipd`). If left empty, embedded PGlite runs automatically with zero configuration!
- `AI_PROVIDER=mock`: Set to `gemini` or `openai` to use live multimodal AI providers.
- `GEMINI_API_KEY`: Required when `AI_PROVIDER=gemini`.
- `OPENAI_API_KEY`: Required when `AI_PROVIDER=openai`.

### 4. Running the Application

#### Start Backend API & Web Dashboards
```bash
npm run start:api
```
Once started:
- API Server: `http://localhost:4000`
- Parent Dashboard: `http://localhost:4000/parent` (or run standalone via `npm run start:parent` on port 3000)
- Student Desktop Web View: `http://localhost:4000/student`

#### Launch Student Desktop in Electron
```bash
npm run start:student
```

---

## Running the Automated Test Suite

The project includes unit and end-to-end integration tests covering authentication, pairing, AI schema validation, the deterministic decision engine, productivity scoring, desktop components, and complete session lifecycles.

Execute all tests across all workspaces:
```bash
npm test
```

Execute backend tests specifically:
```bash
npm test -w @aipd/api
```

Execute desktop component tests:
```bash
npm test -w @aipd/student-desktop
```

---

## Database Entities & Schema

The database consists of 11 normalized tables defined in `database/migrations/001_initial_schema.sql`:
1. `users`: Authentication records with role constraint (`PARENT`, `STUDENT`).
2. `devices`: Student computers, platform, online state, last heartbeat, protection mode.
3. `parent_student_links`: Authorized relationships between parents and students.
4. `pairing_codes`: Short-lived hashes (10-minute expiry) for device pairing.
5. `study_sessions`: Student sessions, assigned task text, start/end timestamps, focus score.
6. `activity_events`: Active window transitions, app names, window titles, idle events.
7. `context_captures`: Screen capture metadata and storage references with retention limits.
8. `ai_analyses`: Multimodal classification results (`RELEVANT`, `DISTRACTED`, `POTENTIALLY_HARMFUL`), confidence, risk level, factual reason.
9. `notifications`: Persistent alerts for parents and students with severity levels.
10. `study_reports`: Final session reports with reconstructable focus scores and breakdown metrics.
11. `audit_logs`: Immutable audit trails for pairing, protection changes, and safety events.

---

## Pre-seeded Demo Accounts

When starting the application with `SEED_DEMO_DATA=true` (or via `database/seed/seed.sql`), the following accounts are available:
- **Parent Account**:
  - Email: `parent@example.com`
  - Password: `Password123!`
- **Student Account**:
  - Email: `student@example.com`
  - Password: `Password123!`
  - Linked Device: `Alex-Surface-Laptop`

---

## Privacy & Ethical Monitoring Principles

1. **No Keylogging**: Literal keystrokes are never intercepted, stored, or inspected. Only aggregate interaction counts are tracked.
2. **Event-Driven Capture**: Continuous video streaming is prohibited. Captures only occur on foreground window switches with a 5-second cooldown debounce.
3. **Transparent Reporting**: Every focus score deduction is explainable and reconstructable directly from the chronological event timeline.
4. **Local Administrator Realism**: Application documentation explicitly acknowledges that Windows local administrators have operating system privileges to terminate user-space processes. Ethical application-level supervision and audit logging are implemented in place of unsafe malware techniques.
