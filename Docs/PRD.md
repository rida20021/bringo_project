
Bringo Money Flow & Rider Reconciliation — Product Requirements Document (PRD)

Status: Core business rules confirmed; implementation specification
Product: Internal Bringo.ma operations web application
Primary users: Supervisor (cash/TPE reconciliation) and Admin (oversight and audit)
Currency: MAD (Moroccan dirham)
Daily operating time assumption: 09:00 Africa/Casablanca
1. Executive summary

Bringo needs a reliable way to reconcile money collected by riders, money received by the supervisor, cash deposited into the bank, and TPE/card payments supported by receipt evidence. The current daily Excel report arrives by email. The application should ingest that attachment automatically, create order-level liabilities, aggregate them by rider, and provide a supervisor workspace plus an admin audit dashboard.

The application must not equate “cash collected from a rider” with “cash deposited in the bank.” These are separate stages. It must also distinguish physical cash from electronic/card transactions and ensure that every amount can be traced back to its source order and supporting evidence.
2. Problem statement

Today, the team has to interpret the daily spreadsheet, identify the rider and amount associated with each order, collect any outstanding money, collect the appropriate transfer or TPE receipt, and determine whether totals reconcile. Manual steps can lead to delayed deposits, partial collections being overlooked, duplicate processing of the same report, missing receipts, and uncertainty about the amount still owed by each rider or still held by the supervisor.
3. Goals and success measures
Product goals

    Automatically ingest the daily email attachment without requiring the supervisor or admin to upload it manually.
    Present a clear, live view of the amounts owed by each rider, at order level and in aggregate.
    Record partial and full rider collections without losing the remaining balance.
    Track cash from rider collection through bank deposit, supported by transfer/deposit evidence.
    Verify card/TPE orders with receipt evidence without counting them as physical cash.
    Give admins a complete, searchable audit trail and a clear exception queue.
    Prevent duplicate imports and prevent incorrect totals from being silently marked as reconciled.

Suggested measurable acceptance targets

    Every valid report attachment is processed automatically, with an import status recorded.
    Reprocessing the same email or order does not duplicate orders or balances.
    Every displayed aggregate can be drilled down to source order records and reconciliation events.
    Partial collection leaves the precise residual outstanding balance.
    The app visibly flags mismatches, missing evidence, duplicate/invalid rows, and unreviewed imports.
    Every create/update/review action records the acting user and timestamp.

The operational SLA (maximum delay from Gmail message arrival to completed import) remains to be set before launch.
4. Users and permissions
4.1 Supervisor

The supervisor manages daily reconciliation. The supervisor can:

    See daily total amounts awaiting reconciliation.
    See each rider, the rider's total outstanding balance, payment-method split, and linked order IDs.
    Record cash received from a rider, including partial amounts.
    Record a bank deposit for cash already collected and attach a transfer/deposit receipt.
    Attach a TPE/card receipt to the relevant card orders or a receipt batch allocated across several orders.
    See what remains outstanding from riders, what cash is being held pending bank deposit, what is awaiting TPE evidence, and what is fully reconciled.
    Add notes to discrepancies and view prior actions.

The supervisor cannot delete audit history, override import idempotency, or silently mark an amount reconciled without the applicable evidence and checks.
4.2 Admin

The admin oversees the complete process. The admin can:

    See dashboard totals by day, rider, payment method, collection status, deposit status, and evidence status.
    Inspect imported source reports, import logs, source rows, orders, all reconciliation events, attachments, and user activity.
    Review and approve/reject every bank-deposit receipt and TPE/card receipt; admin approval is mandatory before the related amount can be considered reconciled.
    Investigate discrepancies and flag them as resolved only with a documented reason.
    Manage users and assign Supervisor/Admin roles.
    Configure import rules, sender allowlists, file format mappings, time zone, and alert settings.
    Export filtered reconciliation data for finance/audit.

Any admin correction to financial records must be represented as a logged adjustment or reversal, not as an untraceable overwrite.
5. Scope
In scope for the first release (MVP)

    Secure login and role-based access control.
    Two primary role workspaces: /supervisor and /admin.
    Automatic email attachment ingestion and import monitoring.
    Excel/XLSX parsing using the agreed schema and validation rules.
    Duplicate-safe order import and rider grouping.
    Rider balances and order-level detail.
    Partial/full cash collection recording.
    Cash-in-hand and bank-deposit reconciliation with uploaded evidence.
    TPE/card evidence upload and order/batch allocation.
    Admin review, discrepancy management, audit history, and exports.
    Basic operational notifications for failed imports and outstanding evidence.

Out of scope unless explicitly approved

    Rider self-service accounts or mobile app.
    Direct bank-account integration or automated bank statement matching.
    Automatic OCR-based extraction of amounts from transfer/TPE receipts.
    Initiating transfers or payments from the app.
    Accounting/ERP integration.
    Automated payroll deductions or rider debt recovery.
    Multi-company / multi-currency support beyond Bringo's confirmed operating requirements.

6. Daily workflow

    Email arrives: The designated Bringo Gmail/Google Workspace mailbox receives the daily report, normally around 09:00 Africa/Casablanca.
    Automatic import: A Gmail API integration detects the qualifying message, downloads its XLSX attachment, stores the original file and metadata, validates the workbook, and creates an import record. Use Gmail push notifications via Google Cloud Pub/Sub where configured, plus scheduled fallback synchronization to recover missed or delayed notifications.
    Validation: The importer checks required columns, usable order IDs, amounts, dates, payment methods, and rider names. Invalid rows are quarantined or marked as exceptions; the system must not silently discard them.
    Deduplication: Email/report fingerprints and order IDs are checked so retries do not add the same order or debt twice. Conflicting duplicates are flagged for review.
    Supervisor review: The supervisor sees eligible amounts grouped by rider and split by payment method. Each rider row links to order IDs and the imported source report. online_payment rows are retained for traceability but excluded from the cash/TPE totals.
    Cash collection: When cash is received from a rider for cash orders, the supervisor records the amount, time, rider, and optional note. A partial collection decreases the rider’s outstanding cash balance by only the amount received.
    Bank deposit: When collected cash is deposited, the supervisor records the deposit amount/date/reference and uploads the bank transfer/deposit receipt. The deposit enters pending_admin_review; uploading proof does not complete reconciliation.
    TPE/card proof: For card orders, the supervisor uploads a TPE receipt image/PDF and allocates it to one or more applicable orders. The evidence amount and allocated amount are compared, with any difference flagged. The evidence remains pending until the admin reviews it.
    Admin review: The admin approves or rejects bank-deposit and TPE receipts, with a reason for rejection. The admin also reviews totals, missing proof, unmatched amounts, invalid imports, and the audit trail.
    Close/reconcile: A cash deposit or card/TPE obligation is considered reconciled only after its applicable evidence is approved by an admin and all amount/allocation checks pass, or an explicitly authorized exception is documented. Rejected evidence never satisfies the obligation.

7. Dashboard requirements
7.1 Supervisor dashboard

The first screen should show separate financial concepts, not a single ambiguous “total”:

    Outstanding from riders: total uncollected amount still owed by riders.
    Cash collected, not yet deposited: physical cash recorded as collected but not linked to a confirmed bank deposit.
    Deposited to bank: submitted deposit amount and its admin-review status; distinguish pending review from approved deposits.
    TPE/card awaiting reconciliation: card amount with missing, pending-review, rejected, or under-allocated TPE evidence.
    Unreconciled/discrepant amount: any amount whose expected and recorded/evidenced values differ, including evidence awaiting admin approval.

The rider table should include rider name, amount owed, collected so far, remaining balance, cash amount, TPE/card amount, evidence status, and a detail action. Filters include business date/report, rider, payment method, and status. The supervisor should be able to start collection or receipt-upload flows without leaving the dashboard.
7.2 Admin dashboard

The admin dashboard should show:

    Imported reports by date and status.
    Report row count, accepted rows, rejected rows, and duplicate rows.
    Total eligible amount by payment method.
    Amount still owed by riders.
    Cash collected and cash awaiting bank deposit.
    Deposits awaiting admin review, approved/rejected deposit evidence, TPE receipts awaiting review, completed reconciliations, and rejected evidence requiring action.
    Discrepancy count and amount.
    Recent activity and actions requiring review.

Every summary must drill down to the source report, order IDs, transactions, evidence attachments, and audit events used in the calculation.
8. Business rules and calculations

All calculations should use integer minor units (centimes) internally or a fixed-precision decimal type; do not use binary floating-point arithmetic for monetary balances. Display amounts in MAD with an agreed decimal policy.
8.1 Order-level source data

The uploaded workbook currently includes these columns:
Source column	Proposed meaning	Import behavior
delivery_date_end	Delivery/end date	Parse as a real date; retain original value if parsing fails
number	Bringo command/order ID	Required; use as the principal business deduplication key, with source/report context
payment_method	cash, card, online_payment observed in sample	Normalize to a controlled enum; unknown values become exceptions
shopper_name	Rider name	Required for rider aggregation; preserve original spelling and map to a stable rider record
Total	Exact amount to settle with Bringo for the order under its payment method	Required numeric non-negative amount in MAD; do not apply an additional fee/commission transformation in the MVP
Other columns	Store/company/shipping metadata	Preserve in source row for traceability; not required for balance formulas unless business rules require them

The sample file has 297 data rows, 297 distinct command IDs, 53 distinct nonblank rider-name strings, and payment-method counts of 94 cash, 86 card, and 117 online_payment. The sample's amounts sum to 24,843.81 for cash, 30,827.18 for card, and 38,506.98 for online_payment. These figures describe the uploaded sample only and are not a confirmed liability calculation.
8.2 Confirmed payment-method rules

    cash: Total is the exact amount due from the rider as physical cash. When the supervisor receives it, it enters the cash-in-hand ledger; it must subsequently be deposited and the deposit receipt approved by an admin before the bank-deposit stage is considered reconciled.
    card: Total is the exact amount to reconcile against TPE receipt evidence. It is not physical cash and must never be added to cash collected or cash awaiting bank deposit. Admin approval of the TPE receipt is required before the card amount is considered reconciled.
    online_payment: excluded from the rider cash and TPE reconciliation totals. Preserve the source row/order metadata for audit and traceability, but mark it excluded_payment_method; do not create a collection or TPE evidence obligation for it in the MVP.

The Total field is authoritative for the amount to settle for each eligible order under its payment method. The MVP does not recalculate this amount using commissions, fees, or other transformations. Unknown payment method values must be quarantined/flagged, not guessed.
8.3 Rider balance

For each rider and applicable report, calculate the initial amount due from eligible source orders using the approved payment-method rules. For cash orders:

Remaining rider cash balance = eligible cash amount due − posted cash collections allocated to that rider/order set ± approved adjustments

A partial collection reduces the rider balance only by the posted collection amount. Collection recording does not itself satisfy the bank-deposit requirement: the bank-deposit receipt must be approved by an admin before the deposit stage is reconciled. Example: if Ibrahim's cash amount due is 2,000 MAD and the supervisor records 1,000 MAD collected, the balance remains 1,000 MAD.

For card/TPE orders:

TPE evidence variance = eligible card amount − admin-approved amount allocated from TPE receipts

A submitted or pending-review TPE receipt does not count as verified evidence. Do not subtract TPE receipt allocations from physical cash-in-hand.
8.4 Cash-in-hand and bank deposit balance

Cash awaiting deposit = posted cash collections − cash allocated to submitted bank deposits ± approved adjustments

Also show submitted deposits awaiting admin approval separately from approved deposits. The deposit may be reflected as submitted/claimed in the cash-in-hand calculation, but its reconciliation status remains pending until an admin approves the supporting evidence. A deposit cannot exceed available collected cash unless an explicitly authorized correction/exception is recorded. Store amount, date, reference, uploader, evidence, review decision, reviewer, and timestamps.
8.5 Reconciliation statuses

Suggested statuses include:

    imported — accepted into the system but not yet reconciled.
    cash_outstanding — cash remains owed by rider(s).
    partially_collected — some cash received, rider balance still positive.
    cash_pending_deposit — cash collected and still held by supervisor.
    deposit_pending_admin_review — deposit amount and evidence submitted; reconciliation is not complete.
    deposit_approved — admin approved the deposit proof and related checks passed.
    tpe_evidence_pending — card/TPE amount lacks evidence or evidence remains under review.
    tpe_evidence_rejected — admin rejected the receipt; the obligation remains open until corrected/approved evidence is supplied.
    needs_attention — invalid row, duplicate conflict, missing evidence, amount mismatch, or rejected evidence.
    reconciled — all applicable amounts/evidence have passed validation and the required admin approval, or an authorized, documented exception is accepted.

Status is derived from underlying ledger entries/evidence wherever possible rather than manually toggled.
9. Functional requirements
FR-01 — Secure authentication and authorization

The app shall authenticate named users, assign roles, and enforce role checks in backend functions. Hiding UI controls is not sufficient. Only admins can manage users and configuration. All sensitive queries and mutations must verify the caller's role.
FR-02 — Automated email ingestion

The application shall connect to the designated Gmail/Google Workspace mailbox through the Gmail API, detect qualifying incoming messages, and automatically import supported XLSX attachments. Use Gmail push notifications through Google Cloud Pub/Sub when configured, with scheduled fallback synchronization. Sender allowlist, Gmail query/label, subject/pattern, attachment extension, and report date rules must be configurable. Record Gmail message ID, sync/history cursor, attachment name, received timestamp, file hash, and processing outcome. Request the narrowest Gmail permissions that support reading the configured messages and attachments.
FR-03 — Import validation and idempotency

The application shall validate headers, rows, numeric amounts, dates, payment methods, rider identity, and order IDs. A retry of the same attachment or email shall not duplicate orders or events. A repeated command ID with different material values shall produce a conflict requiring review rather than overwriting the earlier record.
FR-04 — Rider balances and order drill-down

The supervisor shall see rider totals and open every total to the underlying command IDs, amounts, payment method, report date, and processing status.
FR-05 — Cash collection entry

The supervisor shall record a cash collection against a rider and, where feasible, allocate it to order balances. Entries shall include amount, timestamp, actor, allocation, and optional note. The app shall reject negative values, over-allocation, and unsupported over-collection, or require an explicit authorized exception.
FR-06 — Bank deposit and proof

The supervisor shall register a bank deposit for previously collected cash and upload supporting proof (image or PDF). The application shall compare the deposit amount to the cash allocated to it and set the state to pending_admin_review. Only an admin may approve/reject the evidence; approval is required before the deposit can satisfy the reconciliation obligation. Rejected evidence must return the item to an actionable state without deleting or rewriting audit history.
FR-07 — TPE/card receipt evidence

The supervisor shall upload a TPE/card receipt as an image or PDF and link it to one or multiple eligible card orders. The system shall track receipt amount, allocated amount, unallocated remainder, and variance. The receipt remains pending until an admin approves or rejects it. Only admin-approved allocated amounts count toward reconciliation. Batch receipts spanning multiple orders must be supported; cross-rider and cross-day allocation details remain to be confirmed.
FR-08 — Admin review and discrepancy resolution

The admin shall search/filter reports, orders, rider balances, collections, deposits, TPE receipts, and audit events. The admin must approve or reject every bank-deposit and TPE receipt before the corresponding reconciliation can complete. Rejection requires a reason; discrepancy resolutions and evidence decisions must generate audit events.
FR-09 — File and evidence management

Original reports and receipt attachments shall be stored securely with metadata. Access must be authorized. The app shall enforce allowed types and size limits, avoid public storage URLs, and retain attachments for the agreed retention period.
FR-10 — Audit logging

The system shall log sign-ins (where appropriate), imports, collections, deposits, allocations, receipt uploads, reviews, adjustments, role changes, exports, and other financially material actions. Audit records shall be append-only to normal application users.
FR-11 — Alerts and failure handling

The system shall notify the designated operational contact when an import fails, a report is missing beyond the configured time window, an unknown schema is detected, or discrepancies need attention. Failed jobs shall be retryable and visible from the admin dashboard.
FR-12 — Reporting/export

The admin shall export filtered orders and reconciliation records with IDs, timestamps, rider, method, due/collected/deposited/evidenced amounts, status, and references to attached proof. Exports must respect role authorization and be auditable.
10. Non-functional requirements

    Security: least-privilege access, backend authorization, secure secrets, restricted upload access, and no public receipt links.
    Integrity: idempotent ingestion, transactional balance updates, immutable event history, and deterministic calculations.
    Reliability: retryable import jobs, visible failures, alerts, and a reconciliation process for missed emails.
    Auditability: each calculated balance must be explainable from source rows and ledger entries.
    Usability: fast desktop-first dashboard; responsive enough for a supervisor using a phone to capture receipts.
    Performance: common dashboards should load quickly for the expected daily volume; final targets to be agreed after confirming data growth.
    Localization: MAD currency and Africa/Casablanca time zone; French and/or Arabic UI language can be added once confirmed.
    Privacy/retention: access to financial evidence limited by role; retention period and authorized export policy to be approved.
    Backups/recovery: define and test a backup/recovery policy for source reports, ledger data, and evidence files before production.

11. Proposed technical direction

This follows the stack cues in the supplied architecture sketch, pending confirmation:

    Frontend: React + TypeScript + Vite.
    Backend/database: Convex functions and database, with Convex file storage for original reports and receipt evidence.
    Authentication: Better Auth with its Convex integration, or an alternative selected after confirming user lifecycle and deployment requirements.
    Email ingestion: Gmail API for the selected Gmail/Google Workspace mailbox; use Gmail watch notifications delivered through Google Cloud Pub/Sub when configured, plus scheduled fallback synchronization using Gmail message/history APIs. Do not depend on a browser session or manual forwarding. Google documents both the push-notification and OAuth-scope requirements: Gmail push notifications and Gmail API OAuth scopes.
    Validation: schema validation for imported files and backend request arguments.
    Tests: unit tests for calculations/normalization, import parser fixtures from real workbook files, authorization tests, and end-to-end tests for collection/deposit/TPE flows.

Architecture references to review during implementation:

    Convex cron jobs
    Better Auth + Convex integration
    Convex + Better Auth React/Vite guide

12. Acceptance criteria / example scenario

Suppose the approved eligible cash ledger shows:
Rider	Initial cash due	Cash collected	Remaining rider balance
Ibrahim Cherki	1,000 MAD	1,000 MAD	0 MAD
Hamza Alam	500 MAD	300 MAD	200 MAD
Ettaibi Errou	500 MAD	0 MAD	500 MAD
Total	2,000 MAD	1,300 MAD	700 MAD

The supervisor dashboard must show 700 MAD still owed by riders. It must separately show 1,300 MAD collected and awaiting deposit (if none has been submitted for deposit). After a 1,000 MAD bank deposit is submitted with evidence, the remaining amount not allocated to a submitted deposit is 300 MAD, and the 1,000 MAD deposit must appear as pending admin review. It is not reconciled until the admin approves the evidence. The remaining rider balances do not change when a bank deposit is recorded because those riders already paid the supervisor.

For card/TPE orders, uploading a receipt does not by itself verify the allocated amount. The receipt must be approved by an admin; only the admin-approved allocated amount counts toward reconciliation. It must not increase or reduce physical cash awaiting deposit. If only 400 MAD of a 500 MAD card batch is allocated and approved, the system must show the remaining 100 MAD variance or missing-evidence amount.

The illustrative rider figures in the original request include Ibrahim owing 1,000 MAD and then giving 1,000 MAD while still owing another 1,000 MAD. That example implies an initial due of 2,000 MAD for Ibrahim; the UI should calculate the remaining 1,000 MAD, not assume the initial amount was 1,000 MAD.
13. Risks and mitigations

    Email format changes: maintain versioned parser mappings, quarantine unexpected headers, and notify admins.
    Duplicate reports/retries: unique mail/attachment fingerprints plus command-level idempotency and conflict handling.
    Rider name variants: maintain stable rider IDs and a reviewed mapping from raw source names to canonical rider records.
    Payment-method handling: implement the confirmed mapping explicitly; never include online_payment in rider cash/TPE reconciliation or add card amounts to cash-deposit totals.
    Missing or wrong receipt: evidence states, amount comparison, review workflow, and clear exception queue.
    Unauthorized edits: backend role checks, append-only audit trail, logged reversals/adjustments.
    One receipt covers multiple orders: receipt-batch allocation model with total-vs-allocated reconciliation.

14. Confirmed decisions and remaining questions
Confirmed decisions

    Payment methods: cash enters the rider collection and bank-deposit flow; card requires TPE receipt evidence; online_payment is excluded from rider cash/TPE reconciliation.
    Total meaning: the imported Total is the exact amount to settle with Bringo for that order under its payment method. The MVP does not apply an additional fee/commission calculation.
    Email provider: Gmail / Google Workspace. The application automatically processes qualifying report attachments through the Gmail API, with a scheduled recovery sync.
    Evidence approval: admin approval is mandatory before a bank deposit or TPE/card amount can be considered reconciled. Uploading a receipt alone is insufficient. A supervisor-recorded cash collection reduces the rider balance, while the later bank-deposit stage remains open until its evidence is approved.

Remaining questions before production

    Gmail message matching: Which sending email address(es), subject pattern, Gmail label/query, and attachment naming convention identify the daily report? Should the app process every qualifying message immediately upon arrival (recommended), with 09:00 treated as the expected delivery time?
    Bank-deposit evidence: Which exact “virement reçu” fields must be captured (bank reference, date/time, amount, account, optional note)? Is image/PDF upload sufficient for approval?
    TPE receipt allocation: Can a single TPE slip cover multiple orders, multiple riders, and/or multiple business dates? MVP supports allocating one receipt across multiple orders; confirm cross-rider/cross-day use.
    Cross-day collection/deposit rules: Can a rider pay a previous day’s balance today? Can a single bank deposit combine collections from multiple riders/days?
    Rider identity: Is there a trusted rider ID/roster to map shopper_name values to, or should an admin maintain aliases for spelling/capitalization variants?
    Operational settings: Which languages are required for the first release (French, Arabic, English)? What upload size/retention policy and alert recipients should be configured?
    Invalid report rows: Recommended default is partial acceptance: import valid rows, quarantine invalid rows, and mark the import as needing attention until reviewed. Confirm whether any invalid row should block the full report.
    Example arithmetic: The overall example states 2,000 MAD (Ibrahim 1,000 + Hamza 500 + Ettaibi 500), while another example says Ibrahim gives 1,000 MAD and still owes another 1,000 MAD, implying an initial Ibrahim balance of 2,000 MAD. Confirm which scenario should be the canonical acceptance-test fixture.

15. Definition of done

The MVP is ready for pilot when all MVP requirements are implemented, real report attachments parse successfully, retries do not duplicate financial records, authorization is tested, the sample scenario above passes end-to-end, missing/invalid evidence is visible, all material actions are auditable, and Bringo has signed off the remaining operational questions in Section 14.
