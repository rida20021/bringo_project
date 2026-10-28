# Bringo Money Flow — Project Milestones

## M1: Project Setup & Foundation
- Initialize React + TypeScript + Vite frontend
- Set up Convex project (backend, database, file storage)
- Configure ESLint, Prettier, TypeScript, Vitest
- Establish CI/CD pipeline structure

## M2: Authentication & Authorization
- Integrate Better Auth with Convex
- Implement role-based access (Supervisor, Admin)
- Backend authorization middleware on all mutations/queries
- Login/logout, session management, protected routes

## M3: Convex Schema & Core Data Model
- Define all tables: users, userProfiles, riders, importBatches, sourceRows, orders, cashCollections, cashCollectionAllocations, bankDeposits, depositAllocations, tpeReceipts, tpeReceiptAllocations, evidenceFiles, auditEvents, importSettings
- Implement monetary math helpers (integer centimes / fixed-precision decimal)
- Time zone handling (Africa/Casablanca)

## M4: Gmail Integration & Automated Ingestion
- Gmail API OAuth setup with minimal scopes
- Google Cloud Pub/Sub push notifications for real-time detection
- Scheduled fallback sync (Convex cron) for missed/delayed emails
- Message/attachment fingerprinting (ID, hash, cursor) for idempotency
- Configurable sender allowlist, subject pattern, attachment filters

## M5: Excel Import, Validation & Idempotency
- XLSX parser with schema validation (required columns, types, enums)
- Row-level validation: order ID, amount, date, payment_method, rider name
- Quarantine invalid rows (never silently discard); track accepted/rejected/duplicate/conflict counts
- Order-level deduplication by command ID + report context
- Conflict detection: same ID, different values → flag for review
- Import batch status tracking and audit logging

## M6: Rider Management & Order Processing
- Stable rider records with alias mapping (preserve original shopper_name spelling)
- Order creation from validated rows with payment-method normalization
- online_payment exclusion from reconciliation totals (audit-only)
- Rider balance calculations (cash due, card/TPE due) per report date
- Order drill-down: rider → orders → source row → evidence

## M7: Cash Collection Workflow (Supervisor)
- Record partial/full cash collection against rider/orders
- Allocation logic: collection → order balances, prevent over-allocation
- Rider outstanding balance updates in real time
- Collection audit trail (amount, timestamp, actor, allocation, note)

## M8: Bank Deposit & Evidence Workflow (Supervisor)
- Register bank deposit for collected cash with reference, date, amount
- Upload deposit receipt (image/PDF) to Convex file storage
- Deposit state: submitted → pending_admin_review → approved/rejected
- Cash-in-hand calculation: collections − allocated deposits
- Deposit cannot exceed available collected cash without authorized exception

## M9: TPE/Card Receipt Workflow (Supervisor)
- Upload TPE receipt (image/PDF) and allocate across multiple card orders
- Track receipt amount, allocated amount, unallocated remainder, variance
- Support batch receipts spanning multiple orders/riders/dates (configurable)
- Receipt state: submitted → pending_admin_review → approved/rejected
- TPE evidence never reduces physical cash-in-hand

## M10: Admin Review & Approval System
- Admin dashboard: review queue for deposits and TPE receipts
- Approve/reject with mandatory reason; audit event generation
- Rejected evidence returns item to actionable state (no history rewrite)
- Discrepancy management: flag, investigate, resolve with documented reason
- User management (create, assign roles) and import settings configuration

## M11: Supervisor Dashboard
- Five distinct financial views: outstanding from riders, cash collected not deposited, deposited (pending/approved), TPE awaiting reconciliation, unreconciled/discrepant
- Rider table: name, owed, collected, remaining, cash/TPE split, evidence status, detail action
- Filters: business date, rider, payment method, status
- Inline actions: start collection, upload deposit receipt, upload TPE receipt

## M12: Admin Dashboard
- Import monitoring: reports by date/status, row counts (accepted/rejected/duplicate/conflict)
- Financial totals by payment method, rider balances, collection/deposit/evidence status
- Drill-down from every summary to source report, orders, transactions, evidence, audit events
- Export filtered reconciliation data (CSV/Excel) with audit trail references

## M13: Audit Logging & Operational Alerts
- Append-only audit events for all financially material actions
- Failed import alerts, missing report alerts (past expected 09:00 window), schema change alerts, discrepancy alerts
- Retryable failed jobs visible in admin dashboard
- Configurable alert recipients and channels

## M14: Testing, Hardening & Polish
- Unit tests: monetary calculations, normalization, allocation logic, status derivation
- Parser fixtures from real workbook samples
- Authorization tests (backend role checks)
- E2E tests: collection → deposit → approval, TPE upload → approval, conflict handling
- Performance validation for daily volume targets
- Responsive UI for mobile receipt capture

## M15: Deployment & Production Readiness
- Convex production deployment
- Environment secrets management (Gmail OAuth, Pub/Sub, etc.)
- Backup/recovery policy for source reports, ledger, evidence files
- Retention policy enforcement for attachments
- Operational runbooks: import recovery, manual re-sync, disaster recovery
- Sign-off on remaining open questions (PRD §14)