# Bringo Project Milestones & Tasks

## PART 1: Historical Context (Completed)
*The foundational application, live entry, Excel matching, and cash chain of custody are fully built and tested.*

- [x] **Milestone 1: Foundation & Auth** (Vite, Convex, Auth, Roles, Markets).
- [x] **Milestone 2: Rider Live Entry** (UI, Receipt Uploads, Mutations, History).
- [x] **Milestone 3: Admin & Supervisor Verification** (Review Queues, Dashboards).
- [x] **Milestone 4: Excel Ingestion & Matching** (Import, Discrepancy Engine).
- [x] **Milestone 5: Production Polish** (Toasts, Modals, Pagination, Audit Logs).
- [x] **Milestone 6: Admin Intelligence** (Team/Market Search, Date Controls, Rider 360, Supervisor Vault, Split Payments, Route Guards).
- [x] **Milestone 7: Global Reconciliation** (Merged Excel + Live data, CA Réel, Missing Live, Mismatches).

---

## PART 2: The HR, Payroll & Workforce Expansion (The Plan)
*The following phases are strictly ordered from the database foundation up to the UI.*

### Phase 1: Database & Backend Foundation (Schema)
**Goal:** Expand the database safely before writing any logic or UI. All new fields MUST be `v.optional()` to prevent breaking existing users.

- [x] **Task 1.1: Extended Rider Profile Schema.** Add `phone`, `cin`, `cie`, `address`, `vehicleType`, `vehiclePlate`, `vehiclePhotos[]`, `licensePhoto`, `dailyRate`, `zoneId`, `marketIds[]`, `rib`, `paymentMethod`, `status`, `startDate`, `endDate` to `userProfiles`.
- [x] **Task 1.2: Provisioning Schema.** Add `provisioning` object to rider profile (8 fixed boolean items: contract, cin, cie, rib, vehicle photos, license, app account, markets assigned).
- [x] **Task 1.3: Zones Table.** Create `zones` table (name, marketIds[]).
- [x] **Task 1.4: Rider-Markets Join Table.** Create `riderMarkets` table (riderId, marketId) and basic mutations (`assignMarketsToRider`, `getMyMarkets`).
- [x] **Task 1.5: Attendance Table.** Create `attendance` table (riderId, date, status: worked/off/in/out/cumul, note). Index on riderId+date.
- [x] **Task 1.6: Salary Tables.** Create `salaryPeriods`, `salaryDeductions`, and `riderDebts` tables per PRD §10.2.
- [x] **Task 1.7: Deposits Table.** Create `deposits` table: marketId, date, cumulFromDate, cumulToDate, expectedAmount, depositedAmount, status, discrepancy, riderId, comment.
- [x] **Task 1.8: Shifts Table.** Create `shifts` table (riderId, date, status: present/off/renfort/meal_box, targetMarketId). Index on riderId+date.

### Phase 2: The Financial Engine & Business Logic
**Goal:** Build the math for payroll, hybrid negative debt, cumulative deposits, and shift access.

- [ ] **Task 2.1: Period Boundaries.** First payslip: startDate → end of month. Subsequent: 1st → end of month. Configurable in Settings.
- [ ] **Task 2.2: Generate Payslips.** `generateSalaryPeriod` mutation: calculates daysWorked from attendance, applies dailyRate (×30 normalization), auto-pulls unresolved discrepancies as deductions.
- [ ] **Task 2.3: Deduction Mutations.** `addDeduction`, `updateDeduction`, `removeDeduction` with optional `sourceRef`.
- [ ] **Task 2.4: Approve/Pay Flow.** `approveSalaryPeriod` → `markSalaryPaid`. All fields remain editable (audit-logged).
- [ ] **Task 2.5: Negative Net Policy (Hybrid).** 1st negative = carry over. 2nd negative = formal `riderDebts`. 3rd = flag rider.
- [ ] **Task 2.6: Cumulative Deposits (Cumul).** Detect `cumul`, prompt for `cumulFromDate`, sum expected amounts across the range, compute discrepancy.
- [ ] **Task 2.7: Discrepancy Resolution.** Backend actions to Assign to rider (creates payslip deduction), Absorb (company loss), or Correct.
- [ ] **Task 2.8: Renfort Access Logic.** Update the `getMyMarkets` backend query. If a rider has a `renfort` or `meal_box` shift for the current day, dynamically append the `targetMarketId` to their allowed markets for Live Entry.

### Phase 3: Core UI & Operations
**Goal:** Build the frontend screens for the Admin to manage HR, Payroll, Attendance, and Planning.

- [ ] **Task 3.1: Opening Balances UI.** Add an "Opening Balance" form in Rider 360 to manually set initial debts, start dates, and advances (replacing historical Excel imports).
- [ ] **Task 3.2: Auto-Generate Attendance from Planning.** Add a button in the Attendance Calendar to auto-populate the month's attendance based on the Planning Grid shifts. Admin only manages exceptions (sick days, etc.).
- [ ] **Task 3.3: Rider Info Form.** Build the UI form in Rider 360/Équipe for Admin to edit phone, address, vehicle, CIN, CIE, RIB, daily rate.
- [ ] **Task 3.4: Moto Paper Upload.** Build `<MotoPaperUpload>` for vehicle photos and license photo (Convex file storage).
- [ ] **Task 3.5: Provisioning Checklist UI.** Display checklist on Rider 360. Admin can tick/untick manually. Pending items highlighted.
- [ ] **Task 3.6: Rider Market & Zone Assignment.** Build `<RiderMarketPicker>`. Update Live Entry dropdown to only show `getMyMarkets()`. Show zone on Markets page.
- [ ] **Task 3.7: Attendance Calendar UI.** Month grid: one row per rider, one column per day. Click cell to cycle worked → off → in → out. Colors: green/grey/blue/red.
- [ ] **Task 3.8: Payroll UI List.** `/admin/salaries` list, filterable by rider/period/status.
- [ ] **Task 3.9: Payslip Detail UI.** `/admin/salaries/:id` detail with inline editing (daysWorked, dailyRate, deductions, bonus).
- [ ] **Task 3.10: Deposit Review UI.** Admin panel to review cumulative deposits, link `to_link` riders, and resolve discrepancies.
- [ ] **Task 3.11: Payment Method Correction UI.** Inline dropdown in Global View to change `cash`/`carte`/`en_ligne`. Recalculates downstream math.
- [ ] **Task 3.12: Admin Planning Grid UI.** Build `/admin/planning` with a weekly grid (rows = riders, columns = days). Allow inline editing of status (Present/Off/Renfort/Meal Box) and target markets for Renfort.
- [ ] **Task 3.13: Rider Schedule View.** Add a "Mon Planning" tab to the Rider Mobile UI to show their weekly schedule (read-only for riders).

### Phase 4: Dashboards & Global Search
**Goal:** Bring all the new data together into the visual dashboards and search.

- [ ] **Task 4.1: Dashboard KPIs.** 7 clickable cards (CA Réel, Cash dû, Encaissé, Déposé, Écarts, Salaires à payer, Livreurs actifs).
- [ ] **Task 4.2: Dashboard Charts.** Recharts (Line for CA, Bar for Top Marchés, Heatmap for Cash dû, Donut for methods).
- [ ] **Task 4.3: Insight Panel.** 🔴 Marchés avec écart, 🟡 Livreurs solde > seuil, 🟢 Meilleur livreur, ⚪ Salaires à approuver.
- [ ] **Task 4.4: General Search (Omnibox).** `⌘K` shortcut. Auto-detects Command/Rider/Market/City. Routes to filtered Global View.
- [ ] **Task 4.5: Global View Advanced Filters.** Multi-select (Rider, Market, City, Payment Method, Status). URL-synced.
- [ ] **Task 4.6: Global View Inline Editing.** Edit payment method, rider assignment, and discrepancy resolution directly from the table.

### Phase 5: Admin Settings & Notifications
**Goal:** Make the system configurable and automated.

- [ ] **Task 5.1: Settings Backend.** `systemSettings` table, `getSettings`, `updateSettings`.
- [ ] **Task 5.2: Settings UI.** `/admin/settings` tabs for Rates, Payroll rules, Reconciliation tolerance, Deposits (fuzzy thresholds), Deductions categories.
- [ ] **Task 5.3: Notifications Schema.** `notifications` table, user preferences (in-app vs digest).
- [ ] **Task 5.4: Critical Notifications.** In-App Bell. Triggers: New discrepancy, deposit non_effectue, salary draft ready, negative net salary.
- [ ] **Task 5.5: Daily Digest.** Cron job at 08:00 Casablanca. Content: Cash-due summary, riders > threshold, low-priority discrepancies.
- [ ] **Task 5.6: Export Engine.** CSV/Excel for deposits, payslips, reconciliation, dashboard data. UTF-8 BOM.

### Phase 6: Automation & Deployment
**Goal:** Final automation and production launch.

- [ ] **Task 6.1: Gmail API.** Implement push notifications to auto-import the Excel files.
- [ ] **Task 6.2: End-to-End Testing.** Test the full flow with real data.
- [ ] **Task 6.3: Production Deployment.** Deploy to Convex and Vercel/Netlify.