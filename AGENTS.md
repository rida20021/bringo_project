# Bringo Money Flow — Agent Instructions

## Project Overview
Internal Bringo.ma operations web app for rider cash/TPE reconciliation. Two roles: **Supervisor** (collects cash, records deposits, uploads receipts) and **Admin** (reviews evidence, audits, manages config).

**Stack**: React + TypeScript + Vite | Convex (backend/db/storage) | Better Auth | Gmail API (auto-import)

## Key Business Rules (from PRD)
- **Payment methods**: `cash` → rider collection → bank deposit (admin-approved receipt required); `card` → TPE receipt evidence (admin-approved); `online_payment` → **excluded** from reconciliation totals, preserved for audit only
- **Excel `Total`** = exact amount to settle per order under its payment method. No fee/commission calc in MVP.
- **Stages are distinct**: rider outstanding ≠ cash collected ≠ cash deposited ≠ TPE evidenced. Never collapse into one total.
- **Admin approval mandatory** before any receipt (deposit or TPE) satisfies reconciliation. Upload alone ≠ reconciled.
- **Idempotent imports**: same email/attachment/order ID must not duplicate. Conflicts (same ID, different values) → flag for review.
- **Monetary math**: use integer centimes or fixed-precision decimal. No binary floating-point.
- **Time zone**: Africa/Casablanca. Report expected ~09:00 daily.

## Architecture Notes
- Convex schema: `users`, `userProfiles`, `riders`, `importBatches`, `sourceRows`, `orders`, `cashCollections`, `cashCollectionAllocations`, `bankDeposits`, `depositAllocations`, `tpeReceipts`, `tpeReceiptAllocations`, `evidenceFiles`, `auditEvents`, `importSettings`
- Gmail ingestion: push via Google Cloud Pub/Sub + scheduled fallback sync. Store message ID, cursor, attachment hash.
- File storage: Convex file storage for original reports + receipts. No public URLs.
- Auth: Better Auth with Convex integration. Role checks in **backend functions**, not just UI.

## Development Commands
*Project not yet initialized. When set up, expect:*
```bash
# Frontend
npm run dev          # Vite dev server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest/Jest

# Convex
npx convex dev       # Local Convex dev server
npx convex deploy    # Deploy functions
```

## Critical Conventions
- **Never overwrite financial records**. Use reversals/adjustments with audit trail.
- **Backend authorization required** on all mutations/queries. Hiding UI is insufficient.
- **Import validation**: quarantine invalid rows, never silently discard. Track `accepted/rejected/duplicate/conflict` counts per batch.
- **Rider identity**: map `shopper_name` to stable `rider` records via aliases. Preserve original spelling.
- **Evidence flow**: `submitted` → `pending_admin_review` → `approved`/`rejected`. Only `approved` counts toward reconciliation.
- **Statuses derived from ledger**, not manually toggled: `imported`, `cash_outstanding`, `partially_collected`, `cash_pending_deposit`, `deposit_pending_admin_review`, `deposit_approved`, `tpe_evidence_pending`, `tpe_evidence_rejected`, `needs_attention`, `reconciled`.

## Open Questions (resolve before production)
See PRD §14. Key items: Gmail sender/subject pattern, TPE cross-rider/cross-day allocation, rider roster source, UI languages, upload limits/retention, alert recipients, invalid-row policy (block vs partial accept), Ibrahim example arithmetic.

## Reference Docs
- `Docs/PRD.md` — Full product requirements, business rules, acceptance criteria
- `PLAN.md` — Implementation milestones, data model, test plan, deployment checklist