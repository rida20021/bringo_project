User attachment
Rapport_TIKTAK_2026-10-25(2).xlsxSpreadsheet
act as a senior professional fullstack developer with over 12 years of experience, I want to create a web app for bringo.ma, let's breakdown the idea, I want to facilitation the operation of money flow, every morning at 9;00am bringo team receive this file uploaded (the shoper name is the rider and the total is the cash that not deposit to the bank yet the number is the command id ), the web app should have two page one for the responsible of collecting the owe money from the riders and deposit to the bank and take a photo or upload the virement recu this for cash when rider get paid from the customer with cash, when the riders get paid with tpe the responsible should take a picture or upload the picture of sushe tpe recu, the page of responsible let's give it a name (supervisor) when he login to supervisor page should see the total of owe cash that should deposit in the bank and should see the riders that owe money every (name of the rider and total that owe), the page of the admin should review the process that page should show all information,  
example : 
let's say that im the supervisor I login to the web app every morning I see that I have total of 2000mad that I have to deposit to the bank and I'm able to see the riders that owe money, let's say ibrahim cherki owe 1000mad and hamza alam owe 500mad and ettaibi errou owe 500mad, I have to collect this cash from them the total should be equals if not should be clear in the web app, like ibrahim cherki give just 1000mad he's still owe other 1000mad, if rider get paid by tpe should give me the recu so I upload it to the web app.
for the admin should review all this process from the dashbord.
note : when the bringo team receive the file on email should automaticlly be uploaded to the database off this webapp, the email and the web app should be tied so the process can be automated without intervetion from the admin or the team. create a PLAN.md for this project and PRD. 
ask if there is any ambiguity
…

I’ll structure this as a real production-ready project for Bringo, with two deliverables: PLAN.md for implementation and PRD.md for product requirements.

I also inspected your uploaded Excel report, Rapport_TIKTAK_2026-10-25(2).xlsx. It contains 298 rows including the header, with these columns:

    delivery_date_end — delivery date

    number — order/command ID

    payment_method — including cash, card, and online_payment

    shopper_name — the rider's name

    Total — order amount

    Store, company, and shipping information

This gives us a concrete starting point for designing the automatic email-to-database import rather than assuming a generic spreadsheet format.
Proposed workflow

1. Automatic report ingestion

Receive the daily Excel attachment at 09:00, validate it, and import eligible orders without manual intervention.

2. Outstanding balance ledger

Group orders by rider, calculate amounts owed, and preserve order-level traceability.

3. Supervisor

Collect money, record partial payments, reconcile totals, and upload bank-transfer or TPE receipts.

4. Admin

Review transactions, verify evidence, investigate discrepancies, and audit the complete history.

The central rule is that the system must distinguish the amount initially owed, the amount collected, the amount deposited or otherwise reconciled, and the remaining balance. A receipt upload alone must not silently mark an entire rider balance as settled.
User attachment
Rapport_TIKTAK_2026-10-25(3).xlsxSpreadsheet
act as a senior professional fullstack developer with over 12 years of experience, I want to create a web app for bringo.ma, let's breakdown the idea, I want to facilitation the operation of money flow, every morning at 9;00am bringo team receive this file uploaded (the shoper name is the rider and the total is the cash that not deposit to the bank yet the number is the command id ), the web app should have two page one for the responsible of collecting the owe money from the riders and deposit to the bank and take a photo or upload the virement recu this for cash when rider get paid from the customer with cash, when the riders get paid with tpe the responsible should take a picture or upload the picture of sushe tpe recu, the page of responsible let's give it a name (supervisor) when he login to supervisor page should see the total of owe cash that should deposit in the bank and should see the riders that owe money every (name of the rider and total that owe), the page of the admin should review the process that page should show all information,  
example : 
let's say that im the supervisor I login to the web app every morning I see that I have total of 2000mad that I have to deposit to the bank and I'm able to see the riders that owe money, let's say ibrahim cherki owe 1000mad and hamza alam owe 500mad and ettaibi errou owe 500mad, I have to collect this cash from them the total should be equals if not should be clear in the web app, like ibrahim cherki give just 1000mad he's still owe other 1000mad, if rider get paid by tpe should give me the recu so I upload it to the web app.
for the admin should review all this process from the dashbord.
note : when the bringo team receive the file on email should automaticlly be uploaded to the database off this webapp, the email and the web app should be tied so the process can be automated without intervetion from the admin or the team. create a PLAN.md for this project and PRD. 
ask if there is any ambiguity.
…

Created both Markdown files for the Bringo money-flow application.

PLAN.md

Implementation roadmap, architecture, database design, milestones, testing, and deployment.

Download PLAN.md

PRD.md

Product requirements, user roles, business rules, dashboard requirements, acceptance criteria, and open questions.

Download PRD.md
Key decisions incorporated

    Supervisor dashboard: rider balances, partial collections, bank deposits, TPE receipts, and discrepancies.

    Admin dashboard: complete transaction history, receipt review, automated import monitoring, and audit trail.

    Automatic email imports: attachment validation, duplicate prevention, error handling, and retry mechanisms.

    Proposed technology: React + TypeScript + Vite, Convex, and Better Auth, following the direction in your architecture sketch.

    Financial integrity: collecting cash from a rider and depositing that cash into the bank are tracked as two separate operations.

I also used your uploaded Excel report to identify its actual columns and payment methods.
Three important questions before implementation

The documents contain a full list of open questions. These three decisions are the most important to settle first.

1. Which payment methods must be reconciled?
Cash requires bank deposit; card requires TPE receipt; online payment is excluded.
All three payment methods must be reconciled.
Only cash payments are included.

2. What does the Excel Total represent?
The exact amount the rider must remit to Bringo.
The customer's full order value, requiring additional business rules.
Not yet confirmed.

3. Which email provider receives the daily report?
Gmail / Google Workspace
Microsoft 365 / Outlook
Another email provider

4. Should the admin approve receipts before a transaction is considered reconciled?
Yes, the admin must review and approve the evidence.
No, the supervisor records it and the admin audits afterward.

One additional inconsistency is documented: your example totals 2,000 MAD across the three riders, but Ibrahim's example suggests that he initially owes 2,000 MAD by himself. This should be corrected before testing the final financial calculations.
PLAN.mdDocument
PRD.mdDocument
For the Bringo money-flow app, my decisions are:
1. Payment method rule: Cash requires bank deposit; card requires TPE receipt; online_payment is excluded.
2. Meaning of Excel Total: Exact amount the rider must remit to Bringo.
3. Email provider: Gmail / Google Workspace
4. Receipt review: Admin approval required before reconciliation.
Update the Bringo PRD and PLAN to reflect these decisions and provide the revised files.

Updated both Bringo project documents to incorporate all four confirmed decisions. The revised files are ready to use in your project repository.
PLAN.md

Implementation plan · Updated

Includes Gmail integration, database and ledger logic, implementation milestones, receipt approval states, tests, and deployment requirements.
Download revised PLAN.md
PRD.md

Product requirements · Updated

Includes confirmed business rules, supervisor and admin workflows, financial calculations, acceptance criteria, and remaining operational questions.
Download revised PRD.md
What changed

    Payment methods: Cash requires collection and bank deposit; card payments require TPE receipt evidence; online_payment is excluded from reconciliation totals.

    Excel amounts: Total is the exact amount to settle for each eligible order under its payment method.

    Gmail automation: The plan specifies Gmail API integration, automatic XLSX processing, duplicate prevention, and scheduled recovery if email notifications are missed. Google's documented push-notification approach uses Cloud Pub/Sub, with fallback synchronization for reliability. Google Gmail API documentation.

    Mandatory admin approval: Bank-deposit and TPE receipts remain pending until an admin approves them. Rejected evidence does not complete reconciliation.

    Financial integrity: Partial rider collections, cash awaiting deposit, submitted deposits, and approved deposits are tracked separately.

The documents also retain the remaining questions that need operational decisions, including how to identify the daily report email, whether TPE receipts can cover multiple riders or days, and the inconsistent Ibrahim example.

Recommended next step: Place both files in the project root, inspect the existing repository, and start with the discovery and financial-calculation tests before building the dashboards.
PLAN.mdDocument
PRD.mdDocument
resend the files

Here are the revised Bringo project files again:

    Download PLAN.md — Implementation plan

    Download PRD.md — Product Requirements Document

Both files have been verified and include your confirmed decisions about Gmail automation, cash deposits, TPE receipts, excluding online_payment, and mandatory admin approval.
PLAN.mdDocument
PRD.mdDocument
couldn't load this files resend it
Worked for 28s

I’ve recreated both files under new filenames and verified that they exist and the ZIP archive opens correctly. Try these fresh links:

Both files in one ZIP

Recommended — download the two documents together.

Download Bringo project documents (ZIP)

Implementation plan
Download Bringo_PLAN_revised.md

Product requirements
Download Bringo_PRD_revised.md

The documents include all four confirmed decisions: Gmail automation, Total as the amount due, cash deposits versus TPE receipts, exclusion of online_payment, and mandatory admin approval before reconciliation is complete.
Bringo_PLAN_revised.mdDocument
Bringo_PRD_revised.mdDocument
Bringo Money Flow & Rider Reconciliation — Implementation Plan

Project status: Core business rules confirmed; ready for repository discovery and implementation planning
Related document:
`PRD.md`
Proposed stack: React + TypeScript + Vite, Convex backend/database/storage, Better Auth integration, Gmail API with push notifications and scheduled fallback sync
1. Engineering principles

    Plan before implementation. Confirm assumptions, inspect the repository and existing conventions, locate related files, identify ambiguities, then update the plan before editing code.
    Treat financial state as a ledger. Collections, deposits, TPE evidence allocations, reversals, and adjustments are explicit records; do not silently overwrite or delete monetary history.
    Separate distinct stages. Rider outstanding, cash collected by the supervisor, cash deposited in the bank, and card/TPE evidence are different balances.
    Automate safely. Email imports are idempotent, validated, observable, retryable, and never allowed to bypass authorization or reconciliation rules.
    Use least privilege. Every protected backend query/mutation verifies the authenticated user's role. Permissions are not skipped in development or production.
    Verify every planned change. Run targeted tests, static checks, type checks, and end-to-end checks. Review the final diff and create focused Git commits that correspond to completed plan items.

2. Repository discovery checklist

Before editing implementation code:

    Inspect the repository tree, package manager, existing app entry points, routes, styles, environment variables, and test tooling.
    Find current auth, data-access, storage, email, upload, and UI patterns; reuse existing patterns where sound.
    Inspect the real report file and record actual sheet names, headers, data types, payment methods, and representative edge cases.
    Identify any existing rider directory or canonical rider identifiers.
    Confirm where Convex, Vite, and Better Auth are already configured; avoid reinitializing working infrastructure.
    Confirm high-impact rules: cash is collected and deposited; card requires TPE receipt evidence; online_payment is excluded; Total is the amount to settle for each order under its payment method; Gmail/Google Workspace is the source mailbox; admin approval is required before receipt-based reconciliation is complete.
    Resolve remaining operational details in PRD.md Section 14 before production (sender/subject pattern, cross-day allocations, rider identity mapping, languages, retention, alert recipients, invalid-row policy, and example arithmetic).
    Add or update this plan if discovery reveals a material change in scope or architecture.

Milestone 0 — Repository discovery findings (logged 2026-10-28, Tasks 0.1–0.2)

    Repository root inspected during Milestone 0 discovery.

    - Vite + React + TypeScript scaffold present (`vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `eslint.config.js`, `index.html`); package manager npm (no lockfile committed at root).
    - Convex backend modules already scaffolded under `convex/` (auth, schema, users, riders, imports, orders, collections, deposits, evidence, reconciliation, audit, email, crons, settings); generated `convex/_generated/` output not yet generated.
    - `convex.json` not yet present at repository root.
    - Frontend feature areas present but empty (`src/app`, `src/components`, `src/features/{supervisor,admin,reconciliation}`, `src/lib`); `src/App.tsx` wires routes and components that are not yet implemented.
    - Test directories present but empty (`tests/{fixtures,unit,integration,e2e}`); Vitest/testing-library/jsdom dependencies declared, runner config not yet added.
    - No `.env.example` at root; `VITE_CONVEX_URL` consumed via `src/main.tsx` with localhost fallback; `.env*` gitignored.
    - No CI/CD or deployment configuration present; ESLint configured, no CI pipeline yet.
    - Report schema verified against real workbooks (`Rapport_TIKTAK_2026-10-25.xlsx`, `Rapport_TIKTAK_2026-10-24.xlsx`); findings and sanitized fixtures recorded in `tests/fixtures/report-schema.md`.

3. Proposed architecture
Bringo daily-report mailbox
        |
        v
Email webhook/API listener ---- scheduled fallback scan
        |
        v
Import job + source-file storage + validation log
        |
        v
Orders / rider mapping / import batches (Convex)
        |
        +--------------------+---------------------+
        |                    |                     |
        v                    v                     v
Supervisor UI          Admin dashboard       Append-only audit events
        |
        +--> cash collection ledger
        +--> bank deposit + transfer proof
        +--> TPE/card evidence + allocations
        |
        v
Reconciliation calculations and exception queue
Suggested directory layout

Adapt to the existing repo if different conventions already exist.
src/
  app/                 # app shell and role-based route guards
  components/          # shared tables, forms, status badges, upload components
  features/
    supervisor/        # supervisor dashboard, rider details, collection flows
    admin/             # admin overview, import monitoring, evidence review
    reconciliation/    # reusable balances, discrepancy and evidence UI
  lib/                 # formatters, client helpers, validation schemas
convex/
  schema.ts            # domain tables and indexes
  auth.ts              # Better Auth / caller identity helpers
  orders.ts            # order and rider queries
  imports.ts           # controlled import operations
  collections.ts       # cash collection ledger mutations
  deposits.ts          # bank deposit operations
  evidence.ts          # uploads, TPE allocations, reviews
  reconciliation.ts    # derived balances and exception queries
  audit.ts             # append-only audit creation/readers
  email/               # provider integration and import orchestration
  crons.ts              # reconciliation/polling safety net
 tests/
  fixtures/            # sanitized workbook fixtures
  unit/                # normalization and monetary calculation tests
  integration/         # import, permissions, and ledger behavior
  e2e/                 # complete supervisor/admin workflows
4. Data model plan

Use Convex tables or equivalent existing models. Final schemas should follow the actual installed versions and the repository's conventions.
Core entities

    users / auth identity: authentication provider data; keep business role/permissions under app control.
    userProfiles: display name, active status, role (supervisor or admin), and created/updated metadata.
    riders: stable rider ID, canonical display name, active status, aliases/raw names for import normalization, timestamps.
    importBatches: provider message ID, source email metadata, attachment name/hash, report date, started/completed times, status, counts (total/accepted/invalid/duplicate/conflict), error summary, storage ID.
    sourceRows: import batch ID, original row number, original row JSON, validation state, warnings/errors, linked order ID when accepted.
    orders: command/order ID, delivery date, rider ID, raw rider name, payment method, amount in MAD/minor units, store/company/shipping metadata, source row/batch, eligibility status, import status.
    cashCollections: rider ID, amount, collection timestamp, supervisor ID, allocation records, note, source date/report reference, reversal/adjustment reference if applicable.
    cashCollectionAllocations: collection ID, eligible cash order ID or approved rider-level bucket, allocated amount; allocations must not exceed available order balance.
    bankDeposits: deposit amount, bank reference, deposit date, created by, state (submitted, verified, rejected), attached evidence storage IDs, review metadata.
    depositAllocations: bank deposit ID linked to one or more cash collections/eligible collected-cash buckets with allocated amounts.
    tpeReceipts: receipt metadata, claimed amount, timestamp/date, uploader, storage IDs, review state, optional terminal/merchant/reference fields.
    tpeReceiptAllocations: receipt ID, card order IDs, allocated amounts, reviewer state; allow a receipt to cover multiple orders and calculate unallocated remainder/variance.
    evidenceFiles: storage ID, MIME type, original filename, size, checksum, uploader, uploaded time, linked entity, review state. If this duplicates provider metadata, keep one canonical source of truth.
    auditEvents: actor, action, target type/ID, event timestamp, reason/note, safe before/after summaries, request correlation ID. Application users cannot edit/delete these events.
    importSettings: approved sender(s), subject matching rules, provider configuration references, expected attachment and column mappings, time zone, alert recipients. Never store raw provider credentials in ordinary table fields.

Monetary integrity

    Represent amounts as integer minor units or a fixed-precision decimal type.
    Calculate balances from accepted orders and posted ledger events, not from editable total fields.
    Use transactional mutations for posting allocations and changing ledger state.
    Enforce that allocations cannot exceed the relevant available balance, except through a separately authorized and audited adjustment path.
    Prefer reversals/new correcting entries over deleting a posted monetary record.
    Keep source amounts and calculated amounts separately identifiable.

5. Import pipeline plan
5.1 Mail connection

    Connect the designated Bringo Gmail/Google Workspace mailbox through the Gmail API using OAuth and the narrowest permissions that support reading qualifying messages and attachments.
    Use Gmail mailbox watch notifications delivered through Google Cloud Pub/Sub where deployment supports it; track message/history IDs and renew the watch as required by Gmail.
    Add scheduled fallback synchronization because push notifications can be delayed or missed; use the Gmail history/sync mechanism to recover changes since the last stored cursor.
    Restrict ingestion to a configured sender allowlist, subject/query pattern, and allowed attachment types. Process a qualifying report as soon as received; 09:00 Africa/Casablanca is the expected delivery time, not a hard-coded requirement to delay processing.
    Store OAuth credentials/tokens in deployment secret storage, define revocation/rotation procedures, and never place credentials in ordinary database records or source control.

5.2 Attachment validation

    Accept the agreed workbook format(s), starting with .xlsx.
    Store the original attachment in protected file storage before parsing, with hash and source metadata.
    Verify expected sheet/header names and required columns: delivery_date_end, number, payment_method, shopper_name, Total.
    Normalize header whitespace/case only where explicitly allowed; avoid guessing columns from a changed report.
    Validate order IDs, rider names, dates, numeric non-negative totals, and known payment methods.
    Normalize payment-method labels through a controlled mapping: cash is physical cash due from the rider and must flow through collection and bank deposit; card is a card/TPE amount that requires receipt evidence; online_payment is excluded from rider cash/TPE liability and reconciliation totals. Preserve excluded source rows for traceability and label them excluded_payment_method rather than dropping them silently.
    Validate each report row independently and preserve invalid rows with a clear error state.

5.3 Idempotency and conflicts

    Idempotency keys: provider message ID, attachment checksum, and command/order ID within the approved business namespace.
    Same message/file retry: reuse the import batch or mark as duplicate without re-creating orders or ledger events.
    Same order ID with the same normalized material fields: flag as duplicate/repeated source record and do not add it twice.
    Same order ID with a different amount, rider, date, or method: create a conflict requiring admin review; do not silently replace existing financial data.
    Track import-level and row-level statuses and expose them on the admin dashboard.

5.4 Import timing

    Process immediately after the qualifying email is received, even if delivery is typically around 09:00.
    Configure local time zone as Africa/Casablanca for business-date grouping and “missing report” checks.
    Run a periodic reconciliation/poll job to find qualifying messages not marked processed and retry transient failures.
    Alert if no valid report has arrived by a configured deadline; exact deadline to be confirmed.

6. Reconciliation rules to implement
Cash orders

    An accepted cash order creates an initial cash amount due from the rider, equal to the imported Total amount for that order. No extra fee/commission transformation is applied by this MVP.
    A supervisor collection entry reduces the rider outstanding balance by the posted/allocated amount, including partial collections, and records the same amount as physical cash received by the supervisor.
    Collected cash remains a separate balance until assigned to a bank-deposit record. When the supervisor submits a deposit and uploads its transfer/deposit receipt, the deposit enters pending_admin_review; it does not count as reconciled yet.
    Only admin approval of the deposit evidence changes the deposit to approved/reconciled and completes the bank-deposit stage. A rejected deposit receipt returns to an actionable state, preserves history, and leaves the related amount unreconciled.
    Missing proof, unallocated cash, over-allocation, or a mismatch between claimed deposit amount and evidence creates an exception. A bank deposit never changes the rider balance, because that balance changes when cash is collected from the rider.

Card/TPE orders

    An accepted card order creates a TPE evidence obligation equal to its imported Total; it does not create physical cash-in-hand or a bank-deposit obligation.
    The supervisor uploads a TPE receipt (image or PDF) and allocates its amount to eligible card orders.
    The evidence is pending_admin_review until an admin approves or rejects it. Attaching a receipt alone must never mark the order reconciled.
    Receipt amount minus allocated amount, and order amount minus admin-approved allocations, are displayed as variance/remainder.
    A batch receipt may span multiple orders; implementation should support multiple allocation rows. Whether allocations may cross riders/days remains a configuration/business question.
    Rejected evidence remains in history, cannot satisfy the reconciliation obligation, and returns affected orders to an attention state.

Online-payment orders

online_payment is explicitly excluded from this MVP’s rider cash and TPE reconciliation totals. Preserve the source row and imported order metadata for traceability, but mark it excluded_payment_method and do not treat its Total as an amount due for the supervisor to collect or evidence. Any future support requires an approved, separate settlement rule.
Example invariant

If 2,000 MAD of cash is owed, the supervisor records 1,300 MAD collected, and 1,000 MAD of that cash is deposited:

    Rider outstanding: 700 MAD.
    Cash collected: 1,300 MAD.
    Cash deposited: 1,000 MAD.
    Cash awaiting deposit: 300 MAD.

These values describe different stages and must not be collapsed into one status or total.
7. Implementation milestones
Milestone 0 — Discovery and business-rule sign-off

    Inspect codebase, dependencies, existing app patterns and deployment assumptions.
    Verify the report schema using representative real workbooks, including missing/duplicate rows.
    Sign off payment-method rules, Total meaning, Gmail/Google Workspace source, and admin approval as a prerequisite for receipt-based reconciliation.
    Confirm remaining settings: Gmail sender/subject query, admin/supervisor access matrix and bootstrap owner, cross-day and multi-rider allocations, languages, evidence size/retention, alert recipients, import SLA, and invalid-row policy.
    Configure and authorize the Gmail API integration in a non-production environment.
    Exit criteria: confirmed finance rules, documented remaining operational decisions, and an approved integration/consent path.

Milestone 1 — Project foundation and authorization

    Set up or confirm React/TypeScript/Vite frontend.
    Set up or confirm Convex schema/backend and environments.
    Integrate Better Auth (or the selected auth provider) following current provider documentation.
    Implement roles, protected routes, backend authorization helpers, and seed/admin bootstrap procedure.
    Build app shell, navigation, MAD formatting, date/time formatting, and responsive layout.
    Add authorization tests for all privileged operations.
    Exit criteria: Admin/Supervisor access is correctly enforced in UI and backend; unauthorized requests fail tests.

Milestone 2 — Report import and order ledger

    Build workbook parser, required-column validation, method normalization, and structured error reporting.
    Build import batch/source-row records and idempotency keys.
    Add initial order and rider records, rider alias resolution, and import conflict queue.
    Build admin import monitoring, accepted/rejected/duplicate row counts, and import retry action.
    Add fixture-based tests using the uploaded report structure and synthetic malformed/duplicate cases.
    Exit criteria: a report can be processed repeatedly without double-counting; every imported amount can be traced to its source row.

Milestone 3 — Email integration and unattended automation

    Authorize the designated Gmail/Google Workspace mailbox with least-privilege OAuth access.
    Implement Gmail API message search/history synchronization and mailbox watch notifications through Google Cloud Pub/Sub where supported.
    Renew mailbox watch before expiry and persist sync cursors/message IDs to recover from missed notifications.
    Download qualifying attachments and call the same idempotent import pipeline used in tests/manual replay.
    Add scheduled fallback scan, retry/backoff, missing-report alert, and failure visibility.
    Add operational logging without leaking email tokens or sensitive attachment contents.
    Run a staging test using an actual inbound report email.
    Exit criteria: the report imports from email without human upload and a missed event/retry does not create duplicates.

Milestone 4 — Supervisor workflow

    Build supervisor KPI cards with separate amounts: rider outstanding, cash awaiting deposit, deposited cash, TPE evidence pending, discrepancies.
    Build rider table, filters, order drill-down, and rider-level balance breakdown.
    Add collection entry form with validation, optional order allocation, partial collection support, and transaction summary.
    Add bank deposit form and secure receipt upload; submitted proof remains pending until admin approval.
    Add TPE/card receipt upload, order/batch allocation, pending-review/approved/rejected states, and mismatch display.
    Ensure order/report reconciliation is blocked while required deposit or TPE evidence is pending or rejected.
    Ensure receipt uploads support phone camera/file picker where the browser permits it.
    Exit criteria: supervisor can complete the example cash flow and a TPE receipt flow; balances update correctly after every transaction.

Milestone 5 — Admin oversight and audit

    Build admin KPI/dashboard and filters by date, rider, method, status, report, and user.
    Build evidence detail/review actions (approve/reject with reason); only approved evidence can satisfy the related reconciliation obligation.
    Build discrepancy queue with source values, expected values, calculated variance, and resolution note.
    Add activity timeline and append-only financial audit events.
    Add role management and import settings UI only for approved admins.
    Add CSV/XLSX export according to agreed policy, with audit events for exports.
    Exit criteria: admin can follow a dashboard total down to the source order, collection/deposit/TPE records, proof, and actor history.

Milestone 6 — Quality, security, and launch readiness

    Unit-test all balance calculations, rounding, allocation limits, refunds/corrections if supported, and status transitions.
    Integration-test imports, duplicate handling, email retries, evidence upload/review, and authorization.
    End-to-end test supervisor and admin workflows, including partial collection and receipt variance.
    Test invalid/oversized uploads, forbidden MIME types, inaccessible evidence, and unauthenticated API requests.
    Verify time-zone boundaries, DST assumptions if any, report-date grouping, and missing-report alerts.
    Check performance on a production-like dataset and ensure indexes support rider/date/status views.
    Configure production secrets, backups/recovery, retention, monitoring, and support runbook.
    Perform a finance/user acceptance test using a known day and independently check all totals.
    Review full diff and commit each coherent, tested unit of work using a message that states the actual change.
    Exit criteria: documented UAT sign-off; no known critical/high-severity data integrity, auth, or reconciliation issue.

8. Test plan
Unit tests

    Payment method normalization and eligibility mapping.
    Monetary conversion, rounding and display.
    Rider/order aggregation.
    Partial collection and balance calculations.
    Cash-in-hand versus deposit calculations.
    TPE receipt allocation, under-allocation and over-allocation.
    Import checksums, duplicate handling, and conflicting order IDs.
    Rider alias resolution and unresolved rider behavior.

Integration tests

    Import a valid workbook and verify rows/orders/totals.
    Import the same workbook twice and confirm one liability per order.
    Import a schema-changed workbook and confirm it is rejected/quarantined with a useful reason.
    Verify card and online-payment rows follow the approved mappings.
    Record collection, then deposit part of it, and verify balances remain distinct.
    Upload a receipt, allocate across several orders, reject it, and verify the audit history persists.
    Confirm supervisor cannot manage users/review privileged settings and admin can.

End-to-end scenario

Given initial cash due of 2,000 MAD:

    Riders owe 1,000, 500, and 500 MAD.
    Supervisor records collections of 1,000, 300, and 0 MAD.
    App shows 700 MAD remaining from riders and 1,300 MAD collected awaiting deposit.
    Supervisor records a 1,000 MAD bank deposit and attaches proof; its state is pending admin review.
    App shows 300 MAD not yet allocated to a submitted deposit, while also showing the 1,000 MAD deposit as pending review; rider outstanding remains 700 MAD. The deposit does not become reconciled until admin approval.
    Admin approves or rejects the deposit proof and sees a complete timeline; rejection leaves the deposit obligation unreconciled and actionable.
    Separately, a 500 MAD card batch with only 400 MAD allocated and admin-approved shows a 100 MAD variance and cannot be silently marked fully reconciled.

9. Delivery and Git workflow

For each milestone:

    Identify the relevant source files and exact acceptance criteria before editing.
    Split independent work into small tasks; parallelize only when tasks do not modify the same files or depend on unresolved schema decisions.
    Implement one coherent slice at a time and keep changes in scope.
    Run focused tests, lint/type checks, and relevant integration tests after changes.
    Review the diff for accidental changes, authorization gaps, data-loss paths, and unplanned schema migration effects.
    Update docs when behavior/schema changes.
    Commit only verified changes, with a message matching what actually changed. Do not claim a planned change is done until the code and tests confirm it.

Suggested commit sequence (adapt to actual work; do not create empty placeholder commits):

    docs: define Bringo reconciliation requirements and implementation plan
    feat(auth): add supervisor and admin authorization
    feat(import): add validated idempotent report ingestion
    feat(email): automate daily report attachment processing
    feat(reconciliation): track cash collections and bank deposits
    feat(evidence): add TPE receipt allocation and review
    feat(admin): add audit dashboard and discrepancy queue
    test: cover reconciliation and import edge cases

10. Deployment and operations checklist

    Separate development, staging, and production environments.
    Store auth, mail-provider, and app secrets using deployment secret storage.
    Use Gmail API OAuth least-privilege scopes and document how to rotate/revoke credentials.
    Restrict access to uploaded spreadsheets and receipts; do not expose public asset URLs.
    Configure Gmail Pub/Sub push notifications when available, scheduled fallback sync, retry policy, mailbox-watch renewal, logs, and error alerts.
    Create the initial admin through a secure bootstrap path; disable public admin sign-up.
    Confirm backup/restore behavior for database records and files.
    Set data retention and deletion/archival policy after finance approval.
    Document how to replay a failed import safely and investigate a duplicate/conflict.
    Run a first-day supervised parallel reconciliation against the current manual process.

11. Key delivery risks / blockers

    Gmail integration setup is still required. Bringo has selected Gmail/Google Workspace, but the actual mailbox, OAuth authorization, sender allowlist, subject/query pattern, and Google Cloud Pub/Sub configuration must be supplied during setup.
    TPE receipt aggregation rules remain open. Support multiple-order allocations, then confirm whether a receipt can span riders and/or dates.
    Rider names may vary. Stable rider IDs or a reviewed alias mapping will prevent split balances.
    Operational policies remain open. Confirm UI languages, evidence upload limits/retention, alert recipients, import SLA, and policy for reports with invalid rows.
    Example arithmetic remains inconsistent. The requested 2,000 MAD example lists three rider balances totaling 2,000 MAD, but a separate Ibrahim example implies his initial balance was 2,000 MAD. Confirm before using the Ibrahim example as an acceptance-test fixture.
    Gmail push delivery can be delayed or missed. Keep a scheduled sync/recovery path and renew Gmail mailbox watch according to Google’s current requirements.

12. First implementation task

Start with Milestone 0 and repository discovery, then implement the import parser and financial calculation tests before building the dashboards. This reduces the risk of polishing UI around an incorrect interpretation of the spreadsheet or money movement rules.


