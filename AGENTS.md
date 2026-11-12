# Bringo — Agent Instructions

## Quick Reference

| Area | Command / Path |
|---|---|
| **Typecheck** | `npm run typecheck` (runs `tsc --noEmit`) |
| **Lint** | `npm run lint` |
| **Test** | `npm run test` (Vitest, run once) |
| **Test Watch** | `npm run test:watch` |
| **Build** | `npm run build` |
| **Convex Dev** | `npm run convex:dev` (run manually in separate terminal) |
| **Convex Deploy** | `npm run convex:deploy` |

---
## Behavioral Guidelines (Karpathy-Inspired)

> These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask.
- Present multiple interpretations instead of silently picking one.
- Push back when a simpler approach exists.
- If something is unclear, stop. Name what is confusing. Ask.

### 2. Simplicity First
- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes
- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused.
- Do not remove pre-existing dead code unless asked.

### 4. Goal-Driven Execution
- Transform tasks into verifiable goals: "Add validation" → "Write tests for invalid inputs, then make them pass."
- For multi-step tasks, state a brief plan: `Step → verify: check`.
- Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
---

# ⚠️ CRITICAL SYSTEM SAFETY RULES (READ BEFORE ANY BUILD TASK)

You are working on a live production system. Breaking existing features is unacceptable. Before writing any code or making any schema changes, you MUST verify the following 5 Danger Zones:

## Danger 1: The Convex Schema Migration Trap
- **NEVER** add a new field to `schema.ts` without wrapping it in `v.optional(...)`.
- **Why:** If you make a new field required (e.g., `cin: v.string()`), every existing user in the database will instantly fail validation and the entire app will crash.
- **Action:** Always verify `npx convex dev` compiles without type errors after a schema change.

## Danger 2: Floating-Point Money Disasters
- **NEVER** use JavaScript decimals for financial math (e.g., `150.33 * 14`).
- **Why:** JavaScript will output `2104.6200000000003`. This will cause your bank deposits to mismatch your ledger.
- **Action:** All amounts must be stored and calculated as **Integer Centimes**. Use `15033` instead of `150.33`. Use the `formatMAD()` helper only for UI rendering.

## Danger 3: Timezone & Midnight Grace Period
- **NEVER** use `new Date()` or standard UTC boundaries for business logic.
- **Why:** A rider submitting an order at 01:00 AM should be attributed to the previous day (Grace Period), and the business runs on Casablanca time.
- **Action:** You MUST import and use `startOfDayCasablanca` and `endOfDayCasablanca` from `convex/lib/dates.ts` for all date filtering, queries, and midnight rollovers.

## Danger 4: The "Cumul" Double-Counting Bug
- **NEVER** sum expected cash from `deposits` without checking for cumulative ranges.
- **Why:** If a deposit has `status: "cumul"`, the `expectedAmount` already covers the previous days. If you sum the daily amounts AND the cumul amount, the system will flag a false discrepancy.
- **Action:** When calculating expected cash, skip any dates that fall within a `[cumulFromDate, cumulToDate]` range.

## Danger 5: Broken UI Dropdowns
- **NEVER** restrict UI dropdowns without a fallback.
- **Why:** If you filter the Rider Live Entry market dropdown to only show `getMyMarkets()`, and the Admin hasn't assigned markets yet, the dropdown will be empty. The Rider cannot submit orders.
- **Action:** Always provide a fallback. If `getMyMarkets()` returns empty, fallback to showing all markets until the Admin explicitly restricts them.

## Pre-Flight Checklist (The Agent Must Do This)
Before reporting "Task Complete", you MUST:
1. Run `npm run typecheck` and ensure zero errors.
2. Run `npm run test` and ensure all existing tests pass.
3. Manually verify you did not hard-delete any data (use `isArchived` or `status`).

## Critical Rules (Must Follow)

1. **DO NOT RUN SERVERS** — User runs `npm run dev`, `npm run convex:dev`, etc. in their own terminal tabs. Running them freezes the laptop.
2. **Convex Actions** — Cannot use `ctx.db`. Use `ctx.runQuery` and `ctx.runMutation` instead.
3. **Cron Jobs** — Use `crons.interval(...)` only. Never use `everyMinute`.
4. **Read PRD.md & TASKS.md** before starting any task.
5. **E2E Testing** — Use DevTools MCP to verify changes after significant edits.
6. **Money** — All amounts stored as **integer centimes** (no floating point).
7. **Timezone** — Business days use **Casablanca timezone (Africa/Casablanca)**. Use `startOfDayCasablanca` / `endOfDayCasablanca` from `convex/lib/dates.ts`.
8. **Midnight Grace Period** — Entries 00:00–03:00 count for previous day.
9. **Soft Deletes Only** — Never hard-delete; use `isArchived` / `status` fields.
10. **Audit Trail** — Every admin edit writes to `auditEvents`.

---

## Architecture

```
src/                    # Frontend (React + TypeScript + Vite + Tailwind)
├── components/         # Shared UI (Layout, LoadingSpinner, MoneyChain, etc.)
├── features/           # Feature-based modules
│   ├── auth/           # LoginPage, SetupPage
│   ├── rider/          # LiveEntryForm, MyEntries, CashStatusBanner, RiderHome
│   ├── supervisor/     # SupervisorDashboard, SupervisorPage, BulkDepositForm
│   └── admin/          # Dashboard, Reports, Markets, Riders, Imports
├── lib/                # Formatting utilities (currency, dates, text)
└── styles/global.css   # Bringo brand colors (#4a397e primary, #eab818 accent)

convex/                 # Backend (Convex: DB, Auth, File Storage, Real-time)
├── schema.ts           # Table definitions (source of truth)
├── lib/                # Shared utilities (auth, dates, parsers)
│   ├── auth.ts         # requireAdmin, requireSupervisor, requireRider, getAppUser
│   ├── dates.ts        # Casablanca timezone helpers
│   ├── tiktakValues.ts # parseAmountToCentimes, normalizeCommandKey
│   └── marketParser.ts # market import helpers
├── reconciliation.ts   # Dashboard KPI queries (admin + supervisor)
├── imports.ts          # Excel import actions (processImportBatch, deleteImportBatch)
├── discrepancies.ts    # Matching engine (runMatchingForDate, resolveDiscrepancy)
├── orders.ts           # Order mutations
├── collections.ts      # Cash collection mutations
├── evidence.ts         # Receipt upload/approval
├── crons.ts            # Background jobs
└── tests/              # Comprehensive test suite (convex-test)
```

### Key Data Model (from `convex/schema.ts`)

| Table | Purpose |
|---|---|
| `users` | Auth records (Convex Auth) |
| `userProfiles` | Roles (`admin`, `supervisor`, `rider`), `debtBalance`, `isArchived` |
| `riders` | Canonical rider names/aliases from Excel imports |
| `markets` | Store locations with `externalId` |
| `orders` | Imported Excel payment rows (`cash`, `card`, `online_payment`) |
| `liveEntries` | Rider-submitted commands (`cash`, `tpe`, `card`) |
| `liveEntryReceipts` | Rider uploads (TPE/bank deposit evidence) |
| `cashCollections` | Supervisor cash pickups from riders |
| `bankDeposits` | Supervisor bank deposits (bulk + single) |
| `discrepancies` | Mismatches between live entries & Excel |
| `importBatches` | Excel import metadata & stats |
| `auditEvents` | Comprehensive audit trail |

---

## Conventions

### Backend (Convex)

- **Queries** — Pure reads, no side effects. Use `query({ args, handler })`.
- **Mutations** — Writes. Use `mutation({ args, handler })`.
- **Internal** — `internalMutation` / `internalQuery` for trusted server-to-server calls.
- **Auth** — Always start with `await requireAdmin(ctx)` / `requireSupervisor(ctx)` / `requireRider(ctx)`.
- **Indexes** — Use `.withIndex('name', q => q.eq(...))` for performance. Check `schema.ts` for available indexes.
- **Date Ranges** — Always normalize with `startOfDayCasablanca(from)` / `endOfDayCasablanca(to)`.
- **Amounts** — Integer centimes everywhere. Use `parseAmountToCentimes()` from `tiktakValues.ts`.
- **Command Keys** — Normalize with `normalizeCommandKey()` for case-insensitive matching.
- **Audit** — Call `insertAuditEvent(ctx, { ... })` on every admin mutation.

### Frontend (React)

- **Path Aliases** — `@/*` → `src/*`, `@convex/*` → `convex/*`
- **Components** — Feature-based under `src/features/`. Shared under `src/components/`.
- **State** — Convex reactive queries via `useQuery(api.module.fn, args)`.
- **Mutations** — `useMutation(api.module.fn)`.
- **Routing** — `react-router-dom` with role guards in `App.tsx` (`ProtectedRoute`, `AdminRoute`, `SupervisorRoute`).
- **Icons** — `lucide-react` (see `DESIGN_SYSTEM.md` for sizing).
- **Toasts** — `sonner` (`toast.success`, `toast.error`, etc.).

### Testing

- **Backend** — `convex/tests/*.test.ts` using `convex-test` (`ConvexTest` world).
- **Frontend** — `src/**/*.test.{ts,tsx}` using Vitest + `@testing-library/react`.
- **Run** — `npm run test` (both suites). Watch: `npm run test:watch`.
- **Fixtures** — `tests/fixtures/` for sample Excel/JSON data.

---

## Common Patterns

### Adding a Convex Function

1. Define args/returns with `v` validators in the function file.
2. Start handler with `await requireAdmin(ctx)` (or appropriate role).
3. Use indexes for queries: `.withIndex('indexName', q => q.eq('field', value))`.
4. Normalize dates with `startOfDayCasablanca` / `endOfDayCasablanca`.
5. Write amounts as integer centimes.
6. Insert audit event on mutations: `await insertAuditEvent(ctx, { ... })`.
7. Run `npm run typecheck` after changes.

### Adding a Frontend Page

1. Create component under `src/features/<role>/<PageName>.tsx`.
2. Add route in `App.tsx` with appropriate guard (`AdminRoute`, `SupervisorRoute`, `RiderRoute`).
3. Add sidebar item in `Layout.tsx` `navItems` (role-gated).
4. Use `useQuery` for data, `useMutation` for actions.
5. Follow Bringo brand colors: `bg-primary` (`#4a397e`), `bg-accent` (`#eab818`).

### Excel Import Flow

1. Admin uploads file → `generateAdminUploadUrl` → `createImportBatch` → `processImportBatch`.
2. `processImportBatch` validates rows, creates `markets`, `riders`, `orders`, `sourceRows`.
3. `runMatchingForBatch` auto-runs after import to create `discrepancies`.
4. `deleteImportBatch` cascades deletes (orders, allocations, discrepancies, sourceRows, storage).

### Cash Chain of Custody

```
Rider (liveEntry cash) → owes cash (red banner)
    ↓ Supervisor collects (createCashCollection)
Rider banner → yellow (held_by_supervisor)
    ↓ Supervisor deposits (createBankDeposit bulk)
Admin approves deposit
Rider banner → green (cleared), Supervisor vault cleared
```

---

## Files to Check Before Changes

| Task | Files to Review |
|---|---|
| Schema change | `convex/schema.ts`, `convex/_generated/dataModel.d.ts` (after `npx convex dev`) |
| Dashboard KPIs | `convex/reconciliation.ts` |
| Import logic | `convex/imports.ts`, `convex/lib/tiktakParser.ts` |
| Discrepancy matching | `convex/discrepancies.ts` |
| Auth/roles | `convex/lib/auth.ts`, `src/App.tsx`, `src/components/Layout.tsx` |
| Date handling | `convex/lib/dates.ts`, `src/lib/format/dates.ts` |
| Money formatting | `src/lib/format/currency.ts`, `src/lib/money.ts` |
| Rider live entries | `convex/orders.ts`, `src/features/rider/LiveEntryForm.tsx` |

---

## Gotchas

- **Split Payments** — One `commandId` can have multiple `orders` rows (different `paymentMethod`). Matching engine sums legs.
- **Live vs Audit Mode** — `reconciliation.ts` checks `orders.length === 0` to decide. Live mode uses `liveEntries` as source of truth.
- **Payment Method Labels** — Excel: `cash` | `card` | `online_payment`. Live: `cash` | `tpe` | `card`. Mapping in `tiktakValues.ts` / `discrepancies.ts`.
- **Collection Allocations** — `cashCollectionAllocations` links collections to specific `orders`. Used for audit trail.
- **Bulk Deposits** — `bankDeposits.riderIds` + `collectionIds` arrays. `depositAllocations` links 1:1.
- **Rider Identity** — `riders` table (Excel canonical) vs `userProfiles.riderId` (auth link). Not 1:1 until admin links them.
- **Soft Archive** — `userProfiles.isArchived` hides from team page but preserves financial history.

---

## References

- **PRD.md** — Full product specification (v2.2)
- **TASKS.md** — Milestone tracking (current: Milestone 8/9/10 in progress)
- **DESIGN_SYSTEM.md** — Icons, colors, sizing
- **PROJECT_CONTEXT.md** — Recent changes summary
- **convex/_generated/ai/guidelines.md** — Convex-specific patterns