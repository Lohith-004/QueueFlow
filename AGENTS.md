# AGENTS.md — Implementation Instructions for AI Agents & Developers

## QueueFlow — Intelligent Appointment & Real-Time Queue Management System

This document outlines mandatory operational standards and engineering rules for all AI agents and engineers contributing to the QueueFlow codebase. QueueFlow is built as a high-reliability, portfolio-grade system. Quality, readability, security, and verification take precedence over speed.

---

## 1. Source of Truth & Pre-Milestone Preparation

Before initiating work on any major milestone:
1. **Mandatory Documentation Review:** Read the four planning documents in `docs/`:
   - `docs/PRD.md` — Product scope, user personas, functional and non-functional requirements.
   - `docs/ARCHITECTURE.md` — System architecture, data models, state machines, concurrency guards, and API contracts.
   - `docs/IMPLEMENTATION_PLAN.md` — Milestone roadmap, key deliverables, and verification procedures.
   - `docs/ACCEPTANCE_CRITERIA.md` — Gherkin scenarios, automated verification matrix, and manual QA checks.
2. **Preserve Approved Design Decisions:** Adhere strictly to the approved stack (React + Vite + Tailwind CSS on the client; Node.js + Express + TypeScript on the server; MongoDB + Mongoose for persistence; Socket.IO for real-time events).
3. **No Speculative Extensions:** Do not introduce unapproved third-party dependencies, premature abstractions, or out-of-scope features (e.g., Stripe payments, Twilio SMS, multi-tenancy). If a requirement is ambiguous, document the assumption explicitly rather than inventing new behavior.

---

## 2. Milestone Execution Workflow

- **One Milestone at a Time:** Deliver work strictly in sequence according to `docs/IMPLEMENTATION_PLAN.md` (M0 through M9). Do not jump ahead or blend milestones.
- **Explain Intent & Architecture:** In each step, clearly explain:
  - The purpose of newly created or modified files and modules.
  - Database schema definitions, indexes, and constraints.
  - API endpoint contracts (request/response envelopes and status codes).
  - Important concurrency, security, and architectural decisions.
- **Update Documentation on Contract Changes:** If implementation details require refining an approved API route, schema field, or architectural contract, update `docs/` immediately to maintain synchronization.

---

## 3. Code Architecture & Separation of Concerns

Maintain a clean, layered architectural boundary:
- **`shared/`:** Shared TypeScript types, enums (`UserRole`, `TicketStatus`, `AppointmentStatus`), DTO interfaces, and shared Zod validation schemas. Never duplicate types between client and server.
- **`server/src/models/`:** Mongoose schemas, compound unique indexes, partial indexes, and model hooks.
- **`server/src/services/`:** Pure business logic and domain invariants (e.g., slot calculation, ticket number sequencing, atomic state transitions). Keep services decoupled from Express HTTP objects (`req`, `res`).
- **`server/src/controllers/`:** Request parsing, calling service methods, mapping results to standardized `ApiResponse<T>` envelopes.
- **`server/src/middleware/`:** Authentication guards, role-based authorization, Zod schema validation, error handling, and rate limiting.
- **`server/src/sockets/`:** Socket.IO connection handling, handshake authentication, room subscription guards, and transactional broadcast emitters.
- **`client/`:** Clean presentation components, hooks, React Context (`AuthContext`, `SocketContext`), and Axios API clients.
- **Simplicity & Anti-Bloat:**
  - Avoid premature generalized abstractions and unnecessary wrapper layers.
  - Avoid duplicated logic across files.
  - Keep files focused and appropriately sized (split files exceeding ~300 lines into logical submodules).

---

## 4. Security & Privacy Mandates

- **Strict Server-Side Input Validation:** Validate every incoming request payload (body, query parameters, URL params) using Zod schemas before executing business logic. Strip unrecognized fields.
- **Role Escalation Protection:** Never trust client-supplied privilege fields (e.g., `role`). The public registration route must unconditionally assign `UserRole.CUSTOMER`. Administrative accounts are seeded exclusively via secure CLI commands (`npm run seed:admin`).
- **Secret & Credential Hygiene:**
  - Never commit `.env` files, production secrets, or private keys to version control.
  - Never log passwords, password hashes, JWT tokens, or session secrets.
  - Validate environment variables at server boot using Zod (`server/src/config/env.ts`). Abort startup immediately if required variables are missing or invalid.
- **Privacy Guard & PII Elimination:**
  - Public display endpoints (`/api/v1/queue/public-status`) and public WebSocket broadcasts (`queue:public-summary`) must contain **zero PII**.
  - Never transmit customer names, phone numbers, email addresses, or user IDs across public feeds.
- **Server-Verifiable Session Revocation & Cookie Protection:**
  - Store JWTs exclusively in `HttpOnly`, `SameSite=Lax` cookies (`Secure=true` in production) containing a server-side `sessionId`.
  - On logout (`POST /api/v1/auth/logout`), atomically revoke the session in MongoDB (`isValid: false`) in addition to clearing the cookie with identical attributes.
  - Never rely solely on client-side cookie deletion for logout; verify session validity in MongoDB on every protected route to ensure copied or intercepted JWTs cannot be reused. Reject revoked sessions with HTTP 401 `SESSION_REVOKED` and expired tokens with HTTP 401 `TOKEN_EXPIRED`.
  - Enforce CORS origin verification and preflight checks on all state-changing endpoints.

---

## 5. Testing, Verification & Quality Gates

- **Test-Driven Invariants:** Write automated tests covering:
  - Core domain logic (discrete slot availability calculation, monotonic ticket numbering).
  - Security rules (unauthenticated 401, unauthorized 403, registration privilege escalation prevention).
  - Concurrency-sensitive operations (parallel slot booking race conditions, multi-operator ticket claiming conflicts, duplicate check-in prevention).
  - Failure cases and boundary conditions (off-grid start times, weekend queries, expired check-in windows).
- **Execution Truthfulness:**
  - **Never claim a test passed unless it was actually executed and passed.**
  - If a test or build fails, diagnose and explain the root cause. Fix the underlying issue rather than suppressing lint rules, bypassing assertions, or commenting out tests.
- **Milestone Exit Gate:**
  Before declaring any milestone complete, run and verify:
  1. Unit and integration tests (`npm run test`).
  2. Strict TypeScript type check (`tsc --noEmit`).
  3. Linter (`npm run lint`).
  4. Build verification (`npm run build`).

---

## 6. Git Conventions & Reviewable Delivery

- **Small, Reviewable Changes:** Keep changes atomic and well-scoped.
- **Conventional Commits:** Suggest meaningful commit messages adhering to the Conventional Commits specification:
  - `feat: <milestone or feature description>`
  - `fix: <bug or issue description>`
  - `test: <test suite addition or update>`
  - `docs: <documentation updates>`
  - `refactor: <structural cleanup without functional change>`
  - `chore: <tooling, dependencies, or configuration updates>`
- **No Automatic Commits Without Approval:** Do not commit changes automatically unless explicitly requested by the developer.
- **Clean Working Tree:** Never commit unreviewed code, temporary scratch files, or sensitive configuration files.
