# Bringo Project Refactoring Plan

## Context
This refactoring is driven by the Graphify dependency graph analysis. The current graph shows several bottlenecks, high-cohesion monoliths, and duplicated logic.

## Current Graph Metrics (Baseline)
- **God Node 1:** `convex/index.ts` (66 edges) - Anti-pattern barrel file.
- **God Node 2:** `src/lib/format.ts` (30 edges) - Mixed responsibilities.
- **God Node 3:** `src/features/admin/AdminDashboard.tsx` (32 edges) - Handling data, state, and UI.
- **High Duplication:** `convex/tests/*.test.ts` duplicate `seedWorld` and `makeT` logic.

## Goals
1. Delete `convex/index.ts` to improve backend cold-start times.
2. Split `format.ts` into deep modules (currency, dates, labels).
3. DRY the Convex test fixtures.
4. Decompose `AdminDashboard` into smaller components and hooks.
5. **Verify via Graphify:** Re-run Graphify after Phase 4 to ensure god nodes are broken up.

---

## Execution Phases

### Phase 1: Kill the Convex Barrel File
- [ ] Search codebase for imports from `./index` or `convex/index`.
- [ ] Rewrite imports to point directly to specific backend files.
- [ ] Delete `convex/index.ts`.
- [ ] Run `npm run typecheck`.
- *Graphify Check:* Node `convex/index.ts` should vanish.

### Phase 2: Split `src/lib/format.ts`
- [ ] Create `src/lib/format/` directory.
- [ ] Extract `currency.ts`, `dates.ts`, `labels.ts`, `text.ts`.
- [ ] Create `index.ts` to re-export everything (backward compatibility).
- [ ] Delete old `format.ts`.
- [ ] Run `npm run typecheck` & `npm run lint`.
- *Graphify Check:* `format.ts` edge count should drop, replaced by smaller modules.

### Phase 3: DRY Convex Test Fixtures
- [ ] Create `convex/tests/_helpers/world.ts`.
- [ ] Move `seedWorld`, `makeT`, `addOrder`, `createProfile`, etc., into the helper.
- [ ] Update `reconciliation.test.ts` and `discrepancies.test.ts` to import from helpers.
- [ ] Run `npm run test`.
- *Graphify Check:* Test files should have fewer outgoing edges.

### Phase 4: Decompose `AdminDashboard.tsx`
- [ ] Extract `useDateRangeFilter.ts` hook to `src/lib/hooks/`.
- [ ] Extract `AmountControlCard.tsx` to `src/features/admin/dashboard/`.
- [ ] Extract `DashboardKpis.tsx`.
- [ ] Extract `RiderBalancesTable.tsx`.
- [ ] Run `npm run typecheck` & `npm run lint`.
- *Graphify Check:* `AdminDashboard` degree should drop from 32 to <15.

### Phase 5: Final Review & Graph Re-run
- [ ] Run OpenCode `reviewer` agent on the diffs.
- [ ] Run Graphify again.
- [ ] Verify community cohesion has improved (e.g., "Deposit & Discrepancy Matching" split into smaller domains).
