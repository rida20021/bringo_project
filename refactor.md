### Phase 1: Kill the Convex Barrel File
- [x] Search codebase for imports from `./index` or `convex/index`.
- [x] Rewrite imports to point directly to specific backend files.
- [x] Delete `convex/index.ts`.
- [x] Run `npm run typecheck`.

### Phase 2: Split `src/lib/format.ts`
- [x] Create `src/lib/format/` directory.
- [x] Extract `currency.ts`, `dates.ts`, `labels.ts`, `text.ts`.
- [x] Create `index.ts` to re-export everything.
- [x] Delete old `format.ts`.
- [x] Run `npm run typecheck` & `npm run lint`.

### Phase 3: DRY Convex Test Fixtures
- [x] Create `convex/tests/_helpers/world.ts`.
- [x] Move `seedWorld`, `makeT`, `addOrder`, `createProfile`, etc., into the helper.
- [x] Update `reconciliation.test.ts` and `discrepancies.test.ts` to import from helpers.
- [x] Run `npm run test`.

### Phase 4: Decompose `AdminDashboard.tsx`
- [x] Extract `useDateRangeFilter.ts` hook to `src/lib/hooks/`.
- [x] Extract `AmountControlCard.tsx` to `src/features/admin/dashboard/`.
- [x] Extract `DashboardKpis.tsx`.
- [x] Extract `RiderBalancesTable.tsx`.
- [x] Update `AdminDashboard.tsx` to use the new hook and components.
- [x] Run `npm run typecheck` & `npm run lint`.

### Phase 5: Final Review & Graph Re-run
- [ ] Run OpenCode `reviewer` agent on the diffs.
- [ ] Run Graphify again.
- [ ] Verify community cohesion has improved.
