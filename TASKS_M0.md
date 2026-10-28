# Milestone 0 — Discovery & Business-Rule Sign-off Tasks

## Overview
Inspect the repository, verify the report schema using real workbooks, sign off confirmed business rules, resolve remaining operational decisions, and authorize Gmail API integration in a non-production environment.

**Exit Criteria**: Confirmed finance rules, documented remaining operational decisions, and an approved integration/consent path.

---

## Task List

### 0.1 Repository Discovery
- [ ] **0.1.1** Clone/inspect the repository root; list top-level directories and configuration files
- [ ] **0.1.2** Identify package manager (npm/yarn/pnpm) and review `package.json` scripts, dependencies, and devDependencies
- [ ] **0.1.3** Check for existing Vite/React/TypeScript configuration (`vite.config.ts`, `tsconfig.json`, `eslint.config.*`)
- [ ] **0.1.4** Check for existing Convex configuration (`convex.json`, `convex/` directory structure)
- [ ] **0.1.5** Check for existing Better Auth or other auth integration
- [ ] **0.1.6** Review existing folder structure against PLAN.md §3 proposed layout; note deviations
- [ ] **0.1.7** Document any existing CI/CD, linting, testing, or deployment configs
- [ ] **0.1.8** Record environment variable patterns (`.env.example`, `.env.local`, Convex dashboard secrets)

### 0.2 Report Schema Verification
- [ ] **0.2.1** Locate the sample Excel files (`Rapport_TIKTAK_2026-10-25(2).xlsx`, `Rapport_TIKTAK_2026-10-25(3).xlsx`)
- [ ] **0.2.2** Open each workbook; record sheet names, exact header row values, column order, data types
- [ ] **0.2.3** Count rows per sheet; note any merged cells, hidden rows, or formatting quirks
- [ ] **0.2.4** Extract unique values for `payment_method` column; verify only `cash`, `card`, `online_payment` appear (or note others)
- [ ] **0.2.5** Extract unique `shopper_name` values; count distinct riders; note spelling/case variations for same rider
- [ ] **0.2.6** Validate `number` (command ID) uniqueness within each file and across files
- [ ] **0.2.7** Parse `delivery_date_end` formats; confirm timezone interpretation (Africa/Casablanca)
- [ ] **0.2.8** Verify `Total` column: numeric, non-negative, decimal precision (centimes vs dirhams)
- [ ] **0.2.9** Create a Markdown fixture document (`tests/fixtures/report-schema.md`) documenting all findings
- [ ] **0.2.10** Create sanitized JSON/CSV fixtures for unit tests (strip PII, keep structure)

### 0.3 Business Rule Sign-off (Confirmed Decisions)
- [ ] **0.3.1** Confirm and document: Payment method rules (PRD §8.2 / PLAN §6)
  - `cash` → rider collection → bank deposit (admin-approved receipt required)
  - `card` → TPE receipt evidence (admin-approved)
  - `online_payment` → excluded from reconciliation totals, preserved for audit
- [ ] **0.3.2** Confirm and document: `Total` = exact amount to settle per order under its payment method; no fee/commission calc in MVP
- [ ] **0.3.3** Confirm and document: Email provider = Gmail / Google Workspace
- [ ] **0.3.4** Confirm and document: Admin approval mandatory before any receipt (deposit or TPE) satisfies reconciliation
- [ ] **0.3.5** Record sign-off in `DECISIONS.md` with date, participants, and links to PRD/PLAN sections

### 0.4 Remaining Operational Decisions (PRD §14 / PLAN §11)
*For each item below: document the decision, rationale, and owner. If undecided, mark as "BLOCKED — needs stakeholder input"*

- [ ] **0.4.1** Gmail message matching: sender email(s), subject pattern, Gmail label/query, attachment naming convention
- [ ] **0.4.2** Bank-deposit evidence fields: which "virement reçu" fields to capture (bank reference, date/time, amount, account, note)
- [ ] **0.4.3** TPE receipt allocation: can a single receipt cover multiple orders / multiple riders / multiple business dates?
- [ ] **0.4.4** Cross-day rules: can a rider pay a previous day's balance today? Can a single deposit combine collections from multiple riders/days?
- [ ] **0.4.5** Rider identity: trusted rider ID/roster source, or admin-maintained aliases for `shopper_name` variants?
- [ ] **0.4.6** UI languages for v1: French, Arabic, English — which are required?
- [ ] **0.4.7** Upload limits: max file size, allowed MIME types, retention period for evidence files
- [ ] **0.4.8** Alert recipients: who gets notified on import failure, missing report, discrepancies?
- [ ] **0.4.9** Invalid-row policy: partial acceptance (import valid, quarantine invalid) vs block full report?
- [ ] **0.4.10** Import SLA: maximum delay from Gmail message arrival to completed import
- [ ] **0.4.11** Ibrahim example arithmetic: confirm canonical acceptance-test fixture (2,000 MAD total across 3 riders vs Ibrahim alone owing 2,000 MAD)

### 0.5 Gmail API Integration Setup (Non-Production)
- [ ] **0.5.1** Create a Google Cloud project for development/staging (separate from production)
- [ ] **0.5.2** Enable Gmail API and Google Cloud Pub/Sub API
- [ ] **0.5.3** Configure OAuth 2.0 credentials (client ID/secret) for the designated Bringo mailbox
- [ ] **0.5.4** Define least-privilege OAuth scopes: `gmail.readonly`, `gmail.labels`, `pubsub.topics.publish` (or similar)
- [ ] **0.5.5** Set up Pub/Sub topic for Gmail push notifications; configure subscription for Convex/webhook endpoint
- [ ] **0.5.6** Register Gmail mailbox watch ( `users.watch` ) with the Pub/Sub topic; record expiration/renewal procedure
- [ ] **0.5.7** Store OAuth credentials and Pub/Sub config in development secret storage (not in repo)
- [ ] **0.5.8** Document the authorization flow and token refresh procedure in `docs/gmail-integration.md`
- [ ] **0.5.9** Test: send a test email with XLSX attachment to the mailbox; verify push notification arrives and attachment can be downloaded via Gmail API

### 0.6 Documentation & Handoff
- [ ] **0.6.1** Update `PLAN.md` with any discoveries that change scope/architecture (repository structure, existing patterns, schema deviations)
- [ ] **0.6.2** Create `DECISIONS.md` consolidating all confirmed rules and open questions with status
- [ ] **0.6.3** Create `docs/gmail-integration.md` with setup steps, scopes, Pub/Sub config, renewal procedure
- [ ] **0.6.4** Create `tests/fixtures/report-schema.md` with workbook analysis
- [ ] **0.6.5** Brief the team/stakeholders: present findings, open decisions, and integration readiness

---

## Dependencies & Blockers
| Task | Blocked By | Blocks |
|------|------------|--------|
| 0.2.* | 0.1.1 (repo access) | 0.3.*, 0.5.9 |
| 0.3.* | 0.2.* (schema confirmed) | All Milestone 1+ tasks |
| 0.4.* | Stakeholder availability | Milestone 1 (auth roles), Milestone 2 (import validation), Milestone 4 (UI) |
| 0.5.* | Google Cloud access, Bringo mailbox access | Milestone 3 (email integration) |

---

## Estimated Effort
| Area | Tasks | Est. Days |
|------|-------|-----------|
| Repository Discovery | 8 | 0.5–1 |
| Report Schema Verification | 10 | 1–1.5 |
| Business Rule Sign-off | 5 | 0.5 |
| Operational Decisions | 11 | 1–2 (depends on stakeholder availability) |
| Gmail API Setup | 9 | 1–2 |
| Documentation | 5 | 0.5 |
| **Total** | **48** | **4.5–7.5** |

---

## Definition of Done for Milestone 0
- [ ] All tasks in sections 0.1–0.6 completed or explicitly deferred with owner/timeline
- [ ] `DECISIONS.md` exists with every PRD §14 item resolved or tracked
- [ ] Gmail push notification test passes in dev environment
- [ ] Team sign-off recorded (Slack/email thread link in `DECISIONS.md`)
- [ ] No blocker remains for Milestone 1 start