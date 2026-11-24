# AIPD — AI Study & Safety Coach: Agent Rules

## Project Context

**Name**: AI-Powered Digital Productivity & Safety Monitoring System  
**Type**: Windows-first, full-stack monorepo (Node/Express API + Electron desktop + web dashboard)  
**Workspace**: `D:\AIPD`  
**Stack**: Node.js v24, Express, Socket.IO, PostgreSQL / PGlite, Electron, Vanilla JS frontend, JWT auth  
**AI Providers**: Ollama (local, current), Gemini API, OpenAI (switchable via `AI_PROVIDER` env var)

---

## Monorepo Structure

```
D:\AIPD/
├── apps/
│   ├── landing/          # Static landing page (HTML/CSS/JS)
│   ├── parent-dashboard/ # Web dashboard (Vanilla JS + Socket.IO)
│   └── student-desktop/  # Electron app (Node integration disabled, contextIsolation: true)
├── services/
│   └── api/              # Node.js + Express REST + Socket.IO server (port 4000)
│       └── src/
│           ├── auth/     # JWT + bcrypt auth, RBAC (PARENT / STUDENT)
│           ├── db/       # PGlite / PostgreSQL pool
│           ├── decision/ # Deterministic decision engine (spec §9)
│           ├── ai/       # Provider-agnostic AI adapter (Ollama/Gemini/OpenAI/Mock)
│           ├── sessions/ # Study session lifecycle
│           ├── activity/ # Window events, idle detection
│           ├── devices/  # Heartbeat, device pairing
│           ├── productivity/ # Focus score engine
│           └── websocket/  # Socket.IO namespaces
├── packages/
│   ├── config/           # Shared configuration
│   ├── shared-types/     # Shared TypeScript-style type definitions
│   └── validation/       # Zod schemas (shared validators)
└── database/
    ├── migrations/       # 001_initial_schema.sql (11 tables)
    └── seed/             # seed.sql (demo parent + student accounts)
```

---

## MANDATORY: Before Modifying Any File

1. **Inspect** the file and its surrounding module
2. **Understand** the architecture and data flow (check `ARCHITECTURE.md` and `README.md`)
3. **Identify** entry points, existing APIs, and dependencies
4. **Explain** your intended approach before making major changes
5. **Preserve** existing architecture unless there is a compelling reason

---

## Coding Standards

### General
- Write **clean, maintainable, well-commented** code
- Follow **existing patterns** in the codebase — do not introduce new frameworks or paradigms without discussion
- Prefer `const` over `let`; never use `var`
- Use `async/await` — never raw Promise chains or callback hell
- Validate all user input (Zod schemas are in `packages/validation`)
- Handle errors properly — use structured error responses (`{ success: false, error: "..." }`)
- Never hardcode secrets — use environment variables via `dotenv`

### Backend (Node/Express)
- Routes live in `services/api/src/<module>/<module>Routes.js`
- Business logic lives in `services/api/src/<module>/<module>Service.js`
- Use the shared DB pool from `services/api/src/db/`
- Validate requests with Zod before processing
- Authenticate with `authMiddleware.js` — check roles (`PARENT`, `STUDENT`) appropriately
- Keep `server.js` clean — only mount routers and middleware there
- Use Socket.IO events for real-time — do not poll from clients
- Always test API changes against the existing test suite (`npm test -w @aipd/api`)

### Frontend / Electron
- No `nodeIntegration: true` in Electron — `contextIsolation: true` is non-negotiable
- Use the preload bridge for any Node capabilities needed in the renderer
- Keep UI logic in `apps/student-desktop/` separate from business logic
- Socket.IO client connects to `http://localhost:4000`

### Database
- Schema changes require a new migration file in `database/migrations/`
- **Never modify `001_initial_schema.sql` directly** — it is the authoritative baseline
- Use parameterized queries — never string-interpolate SQL
- PGlite auto-provisions when `DATABASE_URL` is empty — treat it as the default dev DB

### Security
- **Never expose JWT secrets, API keys, or passwords** in code or logs
- `.env` is gitignored — **never commit it**
- Always use bcrypt for passwords — never plain text or MD5
- Sanitize all user-facing error messages (do not leak stack traces to clients)
- Audit log safety events — immutable `audit_logs` table

---

## Environment Variables (Safe Reference)
```
PORT=4000                         # API server port
NODE_ENV=development|production   # Environment flag
JWT_SECRET=<secret>               # NEVER log or print
JWT_EXPIRES_IN=7d
DATABASE_URL=<postgres_url>       # Empty = PGlite auto-mode
PGLITE_DATA_DIR=./.pglite-data
SEED_DEMO_DATA=true|false
AI_PROVIDER=ollama|gemini|openai|mock
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:latest
GEMINI_API_KEY=<key>              # NEVER log or print
OPENAI_API_KEY=<key>              # NEVER log or print
```

---

## Testing

- Run all tests: `npm test`
- Run API tests only: `npm test -w @aipd/api`
- Run desktop tests: `npm test -w @aipd/student-desktop`
- Tests use Node's built-in `node:test` runner — no Jest or Mocha
- **Always run tests after modifying backend logic**

---

## Git Workflow

- **Inspect `git status` before making changes** — do not overwrite unrelated user changes
- Write clean, scoped commit messages (e.g., `feat(auth): add refresh token endpoint`)
- **Never commit `.env`, secrets, or `node_modules/`**
- Create feature branches for significant changes
- **Ask for explicit permission before pushing or creating PRs**

---

## Safety & Ethics Rules (Non-Negotiable)

1. **No keylogging** — never capture literal keystrokes
2. **Event-driven capture only** — no continuous screen recording
3. **Explainable scoring** — every focus deduction must be reconstructable
4. **No malware techniques** — no process hiding, registry persistence tricks, or privilege escalation
5. **Privacy by design** — capture metadata, not content

---

## Deployment Rules

- **Never deploy to production without explicit user approval**
- Verify build succeeds locally before any deployment step
- Verify all required environment variables are set in the target environment
- Test critical flows (auth, pairing, session tracking) after deployment
- Ask for confirmation: "Are you sure you want to deploy to production?"

---

## UI & UX Quality Standards

- **Anti-Vibecoding**: Never generate generic, low-effort "AI-styled" or placeholder interfaces.
- **Visual Hierarchy & Layout**: Establish deliberate visual hierarchy with consistent spatial grids (4px/8px), intentional typographic scales, and well-balanced contrast.
- **Figma as Source of Truth**: When Figma designs or tokens exist, match typography, colors, padding, borders, shadows, and responsive layouts precisely to the design specifications.
- **Component Reusability**: Build modular, self-contained, and reusable UI components. Avoid ad-hoc styling and bloated monolithic markup.
- **Accessibility & Interaction**: Maintain semantic HTML elements (`<main>`, `<nav>`, `<button>`, `<dialog>`), keyboard navigation, focus indicators, and proper ARIA labels.
- **Responsive & Resilient**: Validate UI across desktop and standard responsive breakpoints without horizontal scroll leaks or awkward element wrapping.

---

## Agent Behavior & Engineering Lifecycle

For every unfamiliar task or feature implementation:
1. **Inspect existing code**: Understand structure, call sites, entry points, and dependencies first.
2. **Understand architecture**: Confirm boundaries between client UI, background monitors, API services, and database.
3. **Identify affected files**: Map out the exact blast radius before writing code.
4. **Create concise plan**: Outline steps, components, and schema impacts.
5. **Explain major risks**: Highlight any breaking changes, permission requirements, or data migrations.
6. **Implement minimal safe change**: Prefer targeted, cohesive diffs over expansive rewrites.
7. **Run tests**: Execute relevant workspace test suites (`npm test -w <workspace>`).
8. **Run app & verify**: Check terminal, browser console, and API responses when functional verification is required.
9. **Inspect errors**: Trace root causes directly from stack traces and logs.
10. **Fix & retest**: Validate fixes and confirm zero regressions.
11. **Report clearly**: Document exact changes, verification output, and any required user actions.

Strict prohibitions:
- Never rewrite working code without explicit architectural justification.
- Never delete files or drop schema objects without explicit user consent.
- Never introduce unnecessary dependencies or bloated utility libraries.
- Never commit secrets or print credentials.
- Never modify production databases or deploy to production without explicit confirmation.

