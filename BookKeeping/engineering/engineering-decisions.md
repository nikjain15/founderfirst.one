# Penny — Engineering Decisions & Implementation Plan
**Version 0 · April 2026 — PLACEHOLDER**

> This document captures every *how* decision — technology choices, infrastructure, deployment, and implementation details. The *what* and *why* live in `penny-architecture.md`. This document translates architecture into buildable engineering.
>
> No section should be populated until the corresponding architecture decision is settled.

---

## 1. Technology Stack

### 1.1 Backend Language & Framework
*To be decided.*

### 1.2 Database
*To be decided.*

### 1.3 Event Bus / Message Queue
*To be decided.*

### 1.4 Mobile App Framework
*To be decided.*

### 1.5 Web App Framework
*To be decided.*

### 1.6 AI Model Provider & Integration
*To be decided.*

### 1.7 Real-Time Communication (Push)
*To be decided.*

### 1.8 Cloud Provider & Hosting
*To be decided.*

---

## 2. Database Schema & Data Model

### 2.1 Entity Definitions
*Translate the conceptual data model from `penny-architecture.md` into actual table/collection definitions.*

### 2.2 Event Schema Definitions
*Define the shape of every event type in the event log, with versioning strategy.*

### 2.3 Read Projection Schemas
*Define the pre-computed views for P&L, category totals, vendor memory, conversation thread.*

### 2.4 Migration Strategy
*How database schema changes are applied safely in production.*

### 2.5 Indexing Strategy
*Which queries are performance-critical, and what indexes support them.*

---

## 3. Authentication & Identity Implementation

> The architecture defines the trust model: Alex authenticates, sessions persist across devices, bank credentials are never stored, and the system enforces per-business data isolation. This section defines how that trust model is implemented.

### 3.1 Auth Provider & Method
*To be decided. Key considerations:*
- *Magic link (passwordless): simplest UX, no password to remember or leak. Requires reliable email delivery. Common in modern mobile-first products.*
- *Email + password: traditional, understood by all users. Requires password hashing, reset flow, breach monitoring.*
- *Social sign-in (Apple, Google): fastest onboarding on mobile. Depends on third-party identity provider. Apple Sign-In is required by App Store if any social sign-in is offered.*
- *Biometric (Face ID, Touch ID): device-level authentication for returning sessions. Not a primary auth method — supplements one of the above.*
- *Recommendation to evaluate: magic link as primary, biometric for returning sessions, Apple/Google sign-in as optional accelerator.*

### 3.2 Session Management
*To be decided. Must address:*
- *Token format and lifetime (short-lived access + long-lived refresh, or session-based)*
- *Multi-device: Alex logged in on phone and web simultaneously — how are sessions coordinated?*
- *Session revocation: if Alex loses her phone, can she revoke all sessions from the web? From email?*
- *Device trust: first login on a new device — is there a verification step?*

### 3.3 Sensitive Action Re-Authentication
*To be decided. Must define which actions require step-up authentication:*
- *Exporting financial data (CPA export)*
- *Connecting or disconnecting a bank account*
- *Changing notification preferences*
- *Closing account or requesting data deletion*
- *Granting accountant access (when this feature exists)*

---

## 4. Infrastructure & Deployment

### 4.1 Environment Definitions
*Development, staging, production — what exists in each, how they differ.*

### 4.2 Containerisation Strategy
*Docker, container orchestration, local development setup.*

### 4.3 CI/CD Pipeline
*Build, test, lint, deploy — the full pipeline from commit to production.*

### 4.4 Infrastructure as Code
*How infrastructure is defined, versioned, and reproducible.*

### 4.5 Secret Management
*Where secrets live, how they are rotated, who has access.*

---

## 5. Monitoring, Observability & Alerting

### 5.1 Application Logging
*Log format, retention, what is logged, what is never logged (PII).*

### 5.2 Metrics & Dashboards
*Key health metrics, SLA dashboards, performance tracking.*

### 5.3 Error Tracking
*How errors are captured, deduplicated, and triaged.*

### 5.4 Alerting Rules
*What triggers a page/alert, severity levels, escalation paths.*

### 5.5 Uptime Monitoring
*External health checks, synthetic monitoring, status page.*

---

## 6. Resilience Implementation

### 6.1 Circuit Breakers & Retry Policies
*Per-dependency retry configuration, backoff strategy, failure thresholds.*

### 6.2 Dead Letter Queues
*Where unprocessable messages go, how they are reviewed and replayed.*

### 6.3 Graceful Degradation Implementation
*How each degraded mode (defined in architecture) is implemented technically.*

### 6.4 Disaster Recovery Runbook
*Step-by-step restore procedure, tested quarterly.*

### 6.5 Backup Implementation
*Backup frequency, storage location, encryption, restore testing.*

---

## 7. Security Implementation

### 7.1 Penetration Testing
*Cadence, scope, who performs it, how findings are tracked.*

### 7.2 Dependency Vulnerability Scanning
*Automated scanning of dependencies, update policy.*

### 7.3 SOC 2 Roadmap
*Timeline, scope, audit preparation.*

### 7.4 Incident Response Plan
*Detection → triage → containment → resolution → post-mortem.*

### 7.5 Rate Limiting Implementation
*Per-endpoint limits, per-user limits, abuse detection thresholds.*
*Must address:*
- *Per-user rate limits (normal usage patterns for a sole proprietor — how many API calls per minute is reasonable?)*
- *Per-IP rate limits (brute-force login prevention)*
- *Per-endpoint limits (export generation is expensive — different limit than thread reads)*
- *What Alex sees when rate-limited (never a raw 429 — Penny says something calm)*
- *Abuse detection: patterns that indicate scraping, credential stuffing, or automated access*

---

## 8. Mobile App Architecture

### 8.1 State Management
*How application state is managed on-device.*

### 8.2 Offline Queue Implementation
*How offline actions are queued, persisted, and replayed.*

### 8.3 Push Notification Plumbing
*APNs / FCM integration, token management, delivery tracking.*

### 8.4 Image Capture Pipeline
*Camera integration, image quality checks, compression, upload.*

### 8.5 Local Storage & Caching
*What is cached on-device, cache invalidation, storage limits.*

---

## 9. Third-Party Integration Implementation

### 9.1 Plaid Integration
*Connection flow, token management, webhook handling, error recovery.*

### 9.2 Stripe Integration
*OAuth flow, webhook events consumed, reconciliation logic.*

### 9.3 Other Payment Processors
*PayPal, Square — integration details as they are added.*

### 9.4 CPA Export Generation
*PDF/CSV generation library, template design, Schedule C mapping.*

---

## 10. Testing Strategy

### 10.1 Unit Testing
*Coverage targets, what must be unit tested, testing framework.*

### 10.2 Integration Testing
*Service boundary tests, database tests, API contract tests.*

### 10.3 End-to-End Testing
*Full user journey tests, mobile testing, cross-device testing.*

### 10.4 Performance Testing
*Load testing targets (from architecture), tools, cadence.*

### 10.5 AI Model Testing
*Eval suite runner, CI integration, regression detection.*

---

## 11. Development Workflow

### 11.1 Repository Structure
*Monorepo vs multi-repo, directory layout, naming conventions.*

### 11.2 Branch Strategy
*Main, feature branches, release process.*

### 11.3 Code Review Process
*Given solo development with Claude Code — what review process exists?*

### 11.4 Documentation Standards
*What must be documented, where it lives, how it stays current.*

---

*Penny · Engineering Decisions · Placeholder · April 2026*
*No section should be populated until the corresponding architecture decision is settled.*
