# Product Requirements Document (PRD)
## QueueFlow â€” Intelligent Appointment & Real-Time Queue Management System

**Document Version:** 1.1.0
**Status:** Approved for Planning (Consistency & Correctness Revision)
**Target Delivery:** Phased Portfolio MVP

---

## 1. Executive Summary & Vision

QueueFlow is a modern, high-reliability web application engineered to bridge the gap between scheduled appointments and physical walk-in queues. Traditional booking systems fail when appointments run late, walk-ins disrupt schedules, or customers wait without visibility into their actual queue standing.

QueueFlow solves this by unifying:
1. **Time-slotted appointment scheduling** (advance reservations on discrete, conflict-free time slots).
2. **Dynamic real-time virtual queue management** (live ticket status, queue progression, estimated wait times, and staff counter controls).

The project is designed with production-grade engineering principles: end-to-end type safety (TypeScript across frontend and backend), strict server-side validation, role-based authorization, race-condition-safe scheduling, and low-latency WebSocket synchronization via Socket.IO.

---

## 2. Target Personas & Core Problems

| Persona | Role | Core Pain Point | QueueFlow Solution |
| :--- | :--- | :--- | :--- |
| **Customer** (Elena) | End user seeking services (e.g., clinic, salon, service desk) | Unpredictable wait times, crowded waiting rooms, lack of visibility into actual delay. | Books verified discrete slots, receives a digital ticket on check-in, tracks live position in queue on mobile device in real time. |
| **Staff / Desk Operator** (Marcus) | Front-desk or service counter personnel | Manual paper logs, agitated waiting customers, chaotic transitions between scheduled bookings and walk-ins. | Dedicated operational dashboard to call the next customer, mark in-service, handle no-shows, and view upcoming daily appointments with atomic multi-operator conflict protection. |
| **Business Administrator** (Sarah) | Manager / System Owner | Disorganized service menus, inflexible operating hours, inability to regulate appointment slots and staff access. | Centralized management of service offerings, durations, buffer times, user roles, and service metrics. |

---

## 3. Scope Definition

### 3.1 In-Scope for Initial MVP
The MVP focuses on delivering a robust, end-to-end vertical slice that can be demonstrated live, inspected, and verified:

1. **Authentication & Authorization**
   - User registration and login with email/password.
   - Secure session handling via server-verifiable sessions in MongoDB paired with signed JSON Web Tokens (JWT) containing `sessionId`, transmitted via HTTP-only, `SameSite=Lax` cookies with atomic server-side revocation on logout.
   - Role-Based Access Control (RBAC) with three distinct roles: `CUSTOMER`, `STAFF`, `ADMIN`.
   - Strict server-side resource ownership validation on all user resources.

2. **Service Catalog & Operating Boundaries**
   - CRUD management of services (Admin).
   - Configurable duration (in minutes, snapped to grid intervals), buffer turnaround times, and active flags.
   - Deterministic business calendar: explicit operating hours (default 09:00 â€“ 17:00), closed days (weekends), and business timezone (`BUSINESS_TIMEZONE`).

3. **Discrete Appointment Booking Engine**
   - Generation of immutable, discrete slot boundaries anchored to service durations and operating hours.
   - Atomic reservation flow preventing concurrent double-booking of identical slots via database-enforced unique constraints.
   - Validation preventing arbitrary, off-grid start times.
   - Customer view of upcoming and past appointments with cancellation capability (releasing the slot for others).

4. **Virtual Queue & Check-In System**
   - Idempotent check-in mechanism converting scheduled appointments into active queue tickets on the service day.
   - Monotonic atomic daily sequence generator producing standardized ticket codes (e.g., `A-001`, `A-002`) reset per business day.
   - Strict, decoupled ticket lifecycle state machine (`WAITING` $\rightarrow$ `CALLED` $\rightarrow$ `SERVING` $\rightarrow$ `COMPLETED`, with abort branches to `CANCELLED` and `NO_SHOW`).
   - Atomic staff counter actions preventing two operators from claiming the same ticket simultaneously.

5. **Staff Operational Dashboard**
   - Live queue board showing waiting, serving, and completed tickets for the shift.
   - One-click actions: "Call Next", "Begin Serving", "Mark Complete", "Mark No-Show".
   - Direct walk-in ticket generation.

6. **Live Queue Synchronization & Public Display**
   - Real-time updates pushed via Socket.IO with room-based privacy isolation.
   - Disconnection handling and authoritative REST snapshot recovery.
   - Privacy-compliant Public Display view (`/queue/display`) displaying ticket numbers and counter numbers with zero personally identifiable information (PII).

7. **Production Engineering Quality**
   - Strict TypeScript contracts shared between client and server.
   - Runtime request validation using Zod.
   - Unified API envelope and standardized machine-readable error codes.
   - Unit tests, API integration tests with concurrency simulation, and Playwright end-to-end test flows.

---

### 3.2 Deferred & Out-of-Scope Features (Post-MVP Roadmap)

To ensure the portfolio MVP is delivered incrementally without scope creep, the following items are deliberately deferred to v1.1+:

| Deferred Feature | Reason for Deferral | Recommended Future Phase |
| :--- | :--- | :--- |
| **Multi-Tenancy / Organization Partitioning** | Adds complex tenant isolation, database routing, and domain partitioning. | v2.0 |
| **Paid Bookings & Payment Gateway (Stripe/PayPal)** | Adds webhook synchronization, refund state machines, and payment compliance overhead. | v1.2 |
| **SMS / WhatsApp Alerts (Twilio)** | Requires paid external third-party API credentials, delivery webhook reconcilers, and carrier compliance. | v1.1 |
| **Arbitrary-Duration Multi-Slot Intervals** | Requires interval-tree / continuous range locking; replaced in MVP by discrete uniform grid slots. | v1.2 |
| **Complex Multi-Staff Shift Rostering & Custom Holidays** | Adds multi-calendar intersection math; replaced in MVP by standard operating hours and closed weekend rules. | v1.3 |
| **Physical Kiosk Hardware Integration (Thermal Printers)** | Hardware-dependent drivers; replaced by mobile web links in MVP. | v2.0 |
| **Machine Learning Dynamic Wait Time Prediction** | MVP utilizes deterministic calculation ($\text{tickets ahead} \times \text{service duration}$). | v2.0 |

---

## 4. Detailed Functional Requirements (FR)

### Module 1: Auth & User Identity
- **FR1.1**: The system shall allow new customers to register with `name`, `email`, `phone`, and a secure `password` (minimum 8 characters, requiring at least one number and one symbol).
- **FR1.2**: Client registration payloads must strictly prohibit setting privilege roles. Any supplied `role` field must be stripped by Zod or rejected; the backend shall unconditionally assign `CUSTOMER` role upon registration.
- **FR1.3**: Initial administrative credentials (`ADMIN`) and staff accounts (`STAFF`) must be provisioned exclusively via a secure CLI seed command (`npm run seed:admin`) reading from server environment secrets, or created by an authenticated Administrator via `POST /api/v1/admin/users`.
- **FR1.4**: Passwords must be hashed using `bcrypt` (work factor 10+) before persistence. Plaintext passwords must never be logged or stored.
- **FR1.5**: Upon successful login or registration, the server creates an active `Session` document in MongoDB with a 24-hour expiration and issues a signed JWT containing `userId`, `email`, `role`, and `sessionId`. The token is transmitted via an `HttpOnly`, `SameSite=Lax` cookie (`Secure=true` in production, `Secure=false` on local HTTP).
- **FR1.6**: Session invalidation (`POST /api/v1/auth/logout`) atomically revokes the session in MongoDB (`isValid: false`) and clears the authentication cookie with identical security flags. Any subsequent request presenting a revoked or copied session token is strictly rejected with HTTP `401 Unauthorized` (`SESSION_REVOKED`).
- **FR1.7**: The system provides `GET /api/v1/auth/me` to validate the active session in MongoDB on client refresh. Requests with naturally expired tokens are rejected with HTTP `401 Unauthorized` (`TOKEN_EXPIRED`), and expired session documents are cleaned up via a MongoDB TTL index.
- **FR1.8**: Role-based access control and strict resource ownership checks must be enforced at both route middleware and service layer.

### Module 2: Service Catalog & Business Operating Boundaries
- **FR2.1**: Admins can define services with attributes: `name`, `description`, `durationMinutes` (must be a positive multiple of the grid interval, e.g., 15, 30, 60), `bufferMinutes`, and `isActive`. Service modifications apply exclusively to future unbooked intervals.
- **FR2.2**: The system operates under a defined business timezone (`BUSINESS_TIMEZONE`, e.g., `UTC` or `America/New_York`), standard operating hours (09:00 â€“ 17:00), and designated closed days (Saturday and Sunday).
- **FR2.3**: Customers can view a public catalog of active services with duration, descriptions, and operational details.
- **FR2.4**: Deactivating a service with future active bookings soft-sets `isActive: false` without destroying historic appointment records.

### Module 3: Booking Engine & Discrete Slot Reservation
- **FR3.1**: The system shall compute available booking slots dynamically for a selected date and service:
  - All slots are calculated within standard operating hours (09:00 â€“ 17:00) in the business timezone.
  - Slot step interval is defined as $\Delta t = \text{durationMinutes} + \text{bufferMinutes}$. Discrete start times snap to $t_{\text{start}} = 09:00 + k \times \Delta t$ where $t_{\text{start}} + \text{durationMinutes} + \text{bufferMinutes} \le 17:00$.
  - Each appointment occupies the service window $[t_{\text{start}}, t_{\text{start}} + \text{durationMinutes}]$, and the buffer $[t_{\text{start}} + \text{durationMinutes}, t_{\text{start}} + \Delta t]$ serves as operational turnaround before the next slot.
  - Queries for past dates or closed days (weekends) return an empty array.
  - For today's date, slots whose start time has already passed in the business timezone are excluded.
  - Slots already occupied by confirmed appointments (`BOOKED` or `CHECKED_IN`) are excluded.
- **FR3.2**: All bookings must snap to the server's discrete slot grid. Off-grid start times (e.g., 09:17) are rejected with a 400 validation error.
- **FR3.3**: The database enforces a compound partial unique index on `{ serviceId, scheduledDate, startTime }` where `status IN ['BOOKED', 'CHECKED_IN']`.
- **FR3.4**: If two concurrent booking requests target the same slot, exactly one transaction succeeds (201 Created) and the other fails with HTTP 409 Conflict (`SLOT_ALREADY_BOOKED`).
- **FR3.5**: Customers can view their appointment history partitioned into "Upcoming" and "Past/Cancelled".
- **FR3.6**: Customers can cancel an appointment up to 2 hours before the scheduled start time, which transitions the status to `CANCELLED` and immediately releases the slot for re-booking.
- **FR3.7**: Customers can only view and cancel their own appointments; unauthorized attempts are rejected with 403 Forbidden.

### Module 4: Queue Management & Check-In
- **FR4.1**: On the day of the appointment (evaluated in `BUSINESS_TIMEZONE`), a customer can check in within a window of 30 minutes before up to 15 minutes after scheduled start time.
- **FR4.2**: Check-in is idempotent and race-condition protected: a sparse unique index on `{ appointmentId: 1 }` in the queue ticket collection ensures that concurrent or duplicate check-in requests result in exactly one ticket. Re-submitting check-in for an active appointment returns the existing ticket (HTTP 200); attempts to check in an appointment that is already processed or terminal return HTTP 400 (`APPOINTMENT_ALREADY_CHECKED_IN`).
- **FR4.3**: Staff can manually issue walk-in queue tickets directly from the dashboard.
- **FR4.4**: Ticket numbers are generated monotonically per business day (e.g., `A-001`, `A-002`) using an atomic counter (`DailySequence`) reset per calendar date.
- **FR4.5**: Queue ticket statuses follow a strict state machine:
  - `WAITING` $\rightarrow$ `CALLED` (Staff calls customer to counter)
  - `WAITING` $\rightarrow$ `CANCELLED` (Customer leaves queue)
  - `CALLED` $\rightarrow$ `SERVING` (Customer arrives at counter)
  - `CALLED` $\rightarrow$ `NO_SHOW` (Customer does not respond)
  - `CALLED` $\rightarrow$ `WAITING` (Accidental call undo / re-queue)
  - `SERVING` $\rightarrow$ `COMPLETED` (Service completed)
  - `SERVING` $\rightarrow$ `CANCELLED` (Service aborted)
  - Terminal states (`COMPLETED`, `NO_SHOW`, `CANCELLED`) reject further modifications.
- **FR4.6**: Multi-operator conflict resolution: Staff state updates require matching the expected prior status (e.g., updating to `CALLED` requires prior status `WAITING`). If another operator calls or modifies the ticket first, the server rejects the conflicting request with HTTP 409 Conflict (`TICKET_ALREADY_CLAIMED`).

### Module 5: Real-Time Synchronization & Privacy-Safe Public Display
- **FR5.1**: State changes committed to the database are broadcast to relevant Socket.IO rooms.
- **FR5.2**: WebSocket connections must authenticate via session cookies upon handshake. Clients are prohibited from joining private user rooms (`ticket:user:${userId}`) or staff rooms (`queue:staff`) unless their authenticated credentials permit it. Public displays subscribe to `queue:public:${date}`. Attempts to join unauthorized rooms are rejected.
- **FR5.3**: Under stable local test network conditions, 99% of queue events are received by connected clients within 200ms of database commit.
- **FR5.4**: Reconnecting clients must fetch an authoritative REST snapshot to restore any missed events.
- **FR5.5**: The Public Display screen (`/queue/display`) and its associated public Socket.IO payloads (`queue:public-summary`) must contain **zero PII**: only ticket numbers (e.g., `A-003`), service names, counter names, and status are transmitted.

---

## 5. Non-Functional Requirements (NFR)

### 5.1 Performance & Scalability
- **NFR1.1**: Server response time for standard REST endpoints must remain $< 150\text{ ms}$ at 95th percentile under normal single-instance loads.
- **NFR1.2**: Socket event broadcast latency must remain $< 200\text{ ms}$ from database transaction commit to client receipt under local/staging test conditions.
- **NFR1.3**: Indexed collections must cover all frequent queries: `{ email: 1 }`, `{ serviceId: 1, scheduledDate: 1, startTime: 1 }`, `{ queueDate: 1, sequenceNumber: 1 }`, and `{ appointmentId: 1 }`.

### 5.2 Security & Compliance
- **NFR2.1**: **CORS:** Restrict cross-origin requests to configured client origin (`CLIENT_URL`) with `credentials: true`.
- **NFR2.2**: **Rate Limiting:** Protect public and auth endpoints (`express-rate-limit`) against brute-force attacks (max 5 login attempts per 15 min per IP; max 100 general requests per 15 min per IP).
- **NFR2.3**: **Input Validation:** All incoming payloads (body, query, params) must be validated via Zod schemas before business logic execution. Unrecognized fields are stripped.
- **NFR2.4**: **Security Headers:** Protect Express via `helmet` (CSP, HSTS, frameguard, XSS protection).
- **NFR2.5**: **Data Sanitization & Privacy:** Passwords and internal hashes must never be exposed. Public display feeds must exclude customer names, phones, and emails.
- **NFR2.6**: **CSRF Protection:** State-changing requests are guarded via `SameSite=Lax` cookies and custom header validation / origin checks.

### 5.3 Reliability & Consistency
- **NFR3.1**: Database persistence must precede any HTTP success acknowledgement or WebSocket event emission.
- **NFR3.2**: Socket server reconnection handling with exponential backoff on the client and automatic REST snapshot recovery.
- **NFR3.3**: Graceful server shutdown on `SIGINT` / `SIGTERM` ensuring active MongoDB and Socket connections drain cleanly.

### 5.4 Usability & Accessibility
- **NFR4.1**: Fully responsive layout optimized for mobile screens (320px+), tablets, desktop, and large public displays (1080p/4K).
- **NFR4.2**: Accessible markup adhering to WCAG 2.1 AA standards (contrast ratios $\ge 4.5:1$, keyboard navigability, clear error and empty states).

---

## 6. Success Metrics & Verification Targets

| Metric | Target | Measurement Method |
| :--- | :--- | :--- |
| Double-Booking Rate | **0%** | Concurrency test suite attempting parallel bookings on identical slot. |
| Test Coverage | **$\ge 80\%$** on core domain logic | Vitest coverage reports for controllers, services, and utils. |
| Real-time Synchronization Latency | **$< 200\text{ ms}$ (99th percentile)** | Measured from DB write commit to client event receipt in local test harness. |
| Accessibility Compliance | **0 Critical Violations** | Axe-core automated accessibility checks in Playwright test suite. |
| Type Safety | **Zero TypeScript compilation errors** | `tsc --noEmit` across both client and server codebases. |
