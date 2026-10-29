# Bringo Money Flow — Decisions Log

> Created for **Milestone 0 — Task 0.3.5** (Business Rule Sign-off).
> Source: PRD §8.2 / §14, PLAN.md revised implementation plan.

## Confirmed Decisions

| ID | Decision | Source | Status |
|----|----------|--------|--------|
| D-01 | Payment methods: `cash` → rider collection → bank deposit (admin-approved receipt required); `card` → TPE receipt evidence (admin-approved); `online_payment` → excluded from reconciliation totals, preserved for audit only. | PRD §8.2 / PLAN §6 | **CONFIRMED** |
| D-02 | Excel `Total` = exact amount to settle per order under its payment method; no fee/commission calculation in MVP. | PRD §14 (confirmed) / PLAN revised | **CONFIRMED** |
| D-03 | Email provider = Gmail / Google Workspace; automated attachment processing via Gmail API + scheduled recovery sync. | PRD §14 (confirmed) / PLAN revised | **CONFIRMED** |
| D-04 | Admin approval mandatory before any receipt (bank deposit or TPE) satisfies reconciliation; upload alone is insufficient; rejected evidence leaves amount unreconciled. | PRD §14 (confirmed) / PLAN revised | **CONFIRMED** |
| D-05 | Reconciliation stages remain distinct: rider outstanding ≠ cash collected ≠ cash deposited ≠ TPE evidenced; no collapsing into a single total. | PRD §8.1 / PRD §14 | **CONFIRMED** |

## Open Questions (PRD §14 / PLAN §11) — status

| ID | Question | Status |
|----|----------|--------|
| 0.4.1 | Gmail message matching: sender(s), subject pattern, label/query, attachment naming convention. | OPEN — needs stakeholder input |
| 0.4.2 | Bank-deposit evidence fields to capture (bank reference, date/time, amount, account, note). | OPEN — needs stakeholder input |
| 0.4.3 | TPE receipt allocation: single receipt across multiple orders / riders / days? | OPEN — needs stakeholder input |
| 0.4.4 | Cross-day rules: rider paying previous day's balance; single deposit combining multiple riders/days. | OPEN — needs stakeholder input |
| 0.4.5 | Rider identity: trusted rider ID/roster vs admin-maintained aliases for `shopper_name` variants. | OPEN — needs stakeholder input |
| 0.4.6 | UI languages for v1: French, Arabic, English. | OPEN — needs stakeholder input |
| 0.4.7 | Upload limits: max file size, allowed MIME types, retention period. | OPEN — needs stakeholder input |
| 0.4.8 | Alert recipients: who gets notified on import failure / missing report / discrepancies. | OPEN — needs stakeholder input |
| 0.4.9 | Invalid-row policy: partial acceptance vs block full report. | OPEN — needs stakeholder input |
| 0.4.10 | Import SLA: max delay from Gmail message arrival to completed import. | OPEN — needs stakeholder input |
| 0.4.11 | Ibrahim example arithmetic: canonical acceptance fixture (2,000 MAD across 3 riders vs Ibrahim owing 2,000 MAD alone). | OPEN — needs stakeholder input |

## Sign-off

- Confirmed decisions above are transcribed from the verified PRD/PLAN revisions.
- Human sign-off (date, participants, links to PRD/PLAN sections) to be recorded here once stakeholders confirm.
- Gmail API integration consent path: non-production environment (see `docs/gmail-integration.md`, pending Task 0.5.x).
