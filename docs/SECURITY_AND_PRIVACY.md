# Security, Privacy, and Supervised Protection Policy

This document outlines the strict privacy and security boundaries of the **AI Study & Safety Coach** platform, conforming to Specification Sections 17, 18, and 19.

---

## 1. Electron Process Security Model

- **Context Isolation**: `contextIsolation: true` is strictly enforced on all browser windows.
- **Node Integration Disabled**: `nodeIntegration: false` prevents any renderer script or injected content from executing native Node.js APIs or shell commands.
- **Locked-Down IPC Allowlist**: Communication between the UI and native layer uses `contextBridge.exposeInMainWorld('electronAPI', ...)` exposing only explicit, validated functions.
- **Sanitized AI Output**: The AI outputs semantic classifications (`RELEVANT`, `DISTRACTED`, `POTENTIALLY_HARMFUL`), reasons, and encouraging messages. Under no circumstances is AI output passed to shell commands, `eval()`, or OS execution APIs.

---

## 2. Privacy and Data Minimization

- **Zero Keystroke Logging**: The desktop agent **never** registers keyboard hooks to capture raw keys, characters, passwords, or clipboard contents.
- **Aggregate Interaction Metrics**: Only monotonic counts of interaction events (e.g., total inputs, elapsed seconds since last interaction) are maintained for idle state detection.
- **No Continuous Video Capture**: Screen context is captured only on significant event triggers (e.g. window change, explicit baseline) with an enforced **5-second cooldown debounce** to prevent resource exhaustion and visual over-collection.
- **Short Retention for Visual Context**: Any thumbnail captures stored in the database include a mandatory `retention_expires_at` timestamp (default 7 days) and are accessible only to authenticated session participants.

---

## 3. Supervised Parental Protection Policy

### Windows Local Administrator Disclaimer
> **Notice**: Under Windows security architecture, a user with local administrator privileges (`nt authority\system` or elevated admin) can terminate any user-mode process via Task Manager or `taskkill`. The application does not falsely claim to be completely unkillable against a local administrator.

### Architecture Controls
1. **Role Boundary**: Students cannot disable supervised protection from the student UI. The setting is stored on the backend in the `devices` table under parent authorization.
2. **Supervision Watchdog**: The `ServiceAdapter` can run as a background service/watchdog to restart the desktop monitoring agent upon unexpected termination.
3. **Audit Trail**: Any attempt to modify protection modes, terminate monitoring, or pair/unpair devices produces an immutable record in `audit_logs`.
4. **Ethical Compliance**: The system uses zero malware techniques, zero rootkit hooks, and zero stealth persistence.
