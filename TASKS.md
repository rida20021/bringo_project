# Bringo Project Milestones & Tasks

## Milestone 1: Foundation, Auth & Branding (Status: Complete)
- [x] Confirm Vite + React + TypeScript foundation.
- [x] Convex schema definition (users, profiles, auth).
- [x] Auth provider integration (Password).
- [x] Roles: Admin, Supervisor.
- [x] **Task 1.1: Add `rider` role** to schema, auth helpers, and protected routes.
- [x] **Task 1.2: Apply Bringo Branding.** Update Tailwind/CSS with `#4a397e` (primary) and `#eab818` (accent).
- [x] **Task 1.3: Create `markets` table** and Admin CRUD page.

## Milestone 2: Rider Live Entry (Complete)
- [x] **Task 2.1: Rider Dashboard UI.**
- [x] **Task 2.2: Receipt Uploads.**
- [x] **Task 2.3: Rider Backend Mutations.**
- [x] **Task 2.4: Rider "My Entries" View.**

## Milestone 3: Admin & Supervisor Verification (Complete)
- [x] **Closed registration.**
- [x] **Task 3.1: Admin Review Queue.**
- [x] **Task 3.2: Backend Review Mutations.**
- [x] **Task 3.3: Supervisor Dashboard.**

## Milestone 4: Excel Ingestion & Next-Day Matching Engine (Complete)
- [x] **Task 4.1: Excel Import.**
- [x] **Task 4.2: Discrepancy Engine.**
- [x] **Task 4.3: Admin Discrepancy Dashboard.**

## Milestone 4.5: Production Polish (Complete)
- [x] **Task 4.5.1: Toast Notifications.**
- [x] **Task 4.5.2: Confirm Modals.**
- [x] **Task 4.5.3: Pagination (Discrepancies/Receipts).**
- [x] **Task 4.5.4: Audit Logs.**
- [x] **Task 4.5.5: Orphaned File Cleanup.**
- [x] **Task 4.5.6: Collapsible Cards.**
- [x] **Task 4.5.7: "Collapse All" Button.**
- [x] **Task 4.5.8: Discrepancy Search Box.**
- [x] **Task 4.5.9: Collapsible Panel Sections.**

## Milestone 6: Admin Intelligence & Internal Operations
### 6.1 Team Management (Équipe)
- [x] **Task 6.1.1:** Add a Search Box (filter by Name or Email).
- [x] **Task 6.1.2:** Add Pagination ("Charger plus" button, 20 per page).
- [x] **Task 6.1.3:** Add an "Edit Role" feature to promote a Rider to Supervisor.
- [x] **Task 6.1.4:** Add Checkboxes for Bulk Actions (e.g., select 5 users and click "Désactiver").
- [x] **Task 6.1.5:** Change "Delete" to "Archive" (soft delete) so financial history is preserved.

### 6.2 Markets Management (Marchés)
- [x] **Task 6.2.1:** Add a Search Box (filter by Name or External ID).
- [x] **Task 6.2.2:** Add an "Edit" button to fix market names/IDs.
- [x] **Task 6.2.3:** Add a "City" dropdown to the creation form and the table.
- [x] **Task 6.2.4:** Add an "Import Excel/CSV" button to bulk-create 50+ markets.
- [x] **Task 6.2.5:** Add Pagination ("Charger plus").
- [x] **Task 6.2.6: Excel Rider Sync.** Add a button on the Équipe page to view Riders imported from the Excel file who do not yet have Auth accounts. Allow the Admin to create accounts for them to link the `riders` table to `userProfiles`.
- [x] **Task 6.2.7: Auto-provision Markets.** During Excel import, create missing `markets` from `store_internal_name` / `store_external_id`, dedupe with an in-memory Map, leave `city` empty, and link orders via `orders.marketId`.
- [x] **Task 6.2.8: Scale the Unlinked Riders table.** Add a local search box (name/alias) and "Charger plus" pagination (20 per page) to the Équipe page.
- [x] **Task 6.2.9: Split Payments Support.** Update the Excel import logic to allow the same Command ID to have multiple rows if the payment method is different (e.g., half cash, half card). Update the matching engine to sum split amounts.
- [x] **Task 6.2.10: Split Payment UI Visibility.** Update `convex/imports.ts` to tag split payments in `sourceRows`, and update `ImportsPanel.tsx` to display a "Paiement Partagé" (Split Payment) info badge so the Admin can see it.
- [x] **Task 6.2.11: Split Payment Visibility Fix.** Update the warning string to explicitly state `Cmd #ID : split payment (method1/method2)` and fix `ImportsPanel.tsx` so warning-only batches can be expanded to show the blue info badges.

### 6.3 Import Control (Imports Récents)
- [x] **Task 6.3.1:** Make rows expandable to show Conflict Details (e.g., "Row 5: Duplicate Command").
- [x] **Task 6.3.2:** Add a "Delete Import" button that cascades to delete all related orders and discrepancies.
- [x] **Task 6.3.3:** Add a "Download Original File" link for auditing.

### 6.4 Dashboard Date Controls (Sélecteur de date)
- [x] **Task 6.4.1:** Add a date picker to the Supervisor "Tableau de bord" and a start/end range picker to the Admin "Vue d'ensemble", persisted in the URL and resolved with Casablanca day boundaries.

### 6.5 Advanced Rider & Financial Edge Cases
- [x] **Task 6.5.1:** Build the Admin "Rider 360 View" (dedicated page showing rider stats and password reset).
- [x] **Task 6.5.2:** Implement Rider Debt Tracking. Admin can record lost cash as a debt against the Rider.
- [x] **Task 6.5.3:** Implement Supervisor Debt Tracking. Approving a short deposit creates a debt against the Supervisor.
- [x] **Task 6.5.4:** Implement the Midnight Grace Period (00:00 - 03:00 AM counts for previous day).
- [x] **Task 6.5.5: Searchable Rider Dropdown.** Replace the native `<select>` in the Supervisor's Bank Deposit form with a searchable dropdown so Supervisors can type a Rider's name instead of scrolling through a massive list.
- [x] **Task 6.5.6: Supervisor Cash Collection.** Add a form to `SupervisorPage.tsx` so Supervisors can record physical cash collected from a Rider. Update `reconciliation.ts` so this counts towards the "Encaissé" KPI.
- [x] **Task 6.5.7: Admin Deposit Approval UI.** Build the Admin panel to review, approve, and reject Supervisor bank deposits.
- [x] **Task 6.5.8: Fix KPI Range Bug.** Fix the timestamp equality bug in `reconciliation.ts` so approved deposits show up correctly in the dashboard.

## Milestone 6.6: Live Operations & Cash Chain of Custody (Status: Complete)
- [x] **Task 6.6.1: Live Mode Dashboard.** Update `reconciliation.ts` so that if no Excel file (`orders`) exists for the selected date, the Dashboard KPIs fall back to calculating totals from `liveEntries` (Live Forecasts). Add a UI badge to distinguish "Live Mode" from "Audit Mode".
- [x] **Task 6.6.2: Rider 360 Live Feed.** Ensure the Rider 360 View includes a live feed of the Rider's `liveEntries` and `liveEntryReceipts` for today, so the Admin can track their progress in real-time.
- [x] **Task 6.6.3: Rider "Owe" Banner.** Add a dynamic banner on the Rider's home page. 
  - 🔴 Red: Rider owes cash to the company (amount displayed).
  - 🟡 Yellow: Cash handed to Supervisor, waiting for Admin bank approval.
  - 🟢 Green (Hidden): Cleared.
- [x] **Task 6.6.4: Supervisor "Vault" & Collection.** Update the Supervisor collection form. When a Supervisor collects cash from a Rider, the Rider's debt is cleared (turns Yellow), but the debt transfers to the Supervisor's "Vault". Supervisors should see a rich log (Rider name, Time, Amount, Remaining Rider Balance).
- [x] **Task 6.6.5: Supervisor Bulk Bank Deposit.** Allow Supervisors to make one large bank deposit (e.g., 15,000 MAD) and check off multiple Riders it covers. Upload one bank receipt for the whole batch.
- [x] **Task 6.6.6: Admin Bulk Approval.** When the Admin reviews a Supervisor's bulk deposit, show the Chain of Custody (Supervisor -> Riders -> Collections). Clicking "Approve" clears the Supervisor's Vault AND clears all the Riders' Yellow banners simultaneously.
- [x] **Task 6.6.7: Midnight Grace Period Sync.** Ensure that the Midnight Grace Period logic applies to the Live Mode Dashboard so late-night entries show up on the correct day's Live Feed.
- [x] **Task 6.6.8: Grand Total in Dashboard.** Add a "Total importé (TikTak)" line at the bottom of the "Contrôle des montants" panel on the Admin Dashboard to show the sum of Cash + Card + Online payments.
- [x] **Task 6.6.9: Collapsible Imports Récents.** Add a toggle chevron to the "Imports récents" panel so it can be collapsed by default, matching the behavior of the other dashboard panels.
- [x] **Task 6.6.10: UI Cleanup - Hide Zero TPE Metrics.** Remove "TPE approuvé" and "TPE en attente" from the "Circuit carte" panel on both Admin and Supervisor dashboards, as they currently show 0 and add confusion until the automated API is built. Keep only "Carte due" and "Écart carte".

## Milestone 6.7: Rider Correction & Re-upload
- [x] **Task 6.7.1: Re-upload Rejected Receipts.** Add a "Remplacer le reçu" button on the Rider's "My Entries" page. This button should only appear if the receipt status is `rejected`. It should open a file picker, upload the new image, and reset the receipt status to `pending_review`.
- [x] **Task 6.7.2: Rejection Notification UI.** Ensure the Rider sees the Admin's exact rejection reason (e.g., "Image is blurry") on their dashboard so they know what to fix.

## Milestone 6.8: Rider Work History
- [x] **Task 6.8.1: Rider History Date Picker.** Add a date range picker (Du / Au) to the Rider's "Mes entrées" page. Update the backend query `getMyLiveEntries` to accept `fromDate` and `toDate`. The UI must dynamically update the daily totals (Cash, TPE, Card) based on the selected date range.
- [x] **Task 6.8.2: Rider Markets Filter.** Add a dropdown/pill filter on the Rider page to filter entries by a specific market.
- [x] **Task 6.8.3: Rider Classic Pagination.** Replace "Charger plus" with classic pagination (Previous / Next, Page X of Y) to make navigation predictable.
- [x] **Task 6.8.4: Group Rider Entries by Date.** Group the entries list by day (e.g., "Aujourd'hui", "Hier", "03 Nov 2026") with sticky headers.
- [x] **Task 6.8.5: Rider CSV Export.** Add a "Télécharger CSV" button so the Rider can download their own history for their records.

## Milestone 6.9: TPE Cash Fallback & Rejection Management
- [ ] **Task 6.9.1: Schema & Receipt Freshness.** Add `submittedAt` and `replacementCount` to `liveEntryReceipts`. Create `tpeCashSettlements` table.
- [ ] **Task 6.9.2: Rejected Receipts UI.** Add `listRejectedReceipts` backend query. Add "Rejetés" tab to `PendingReceipts.tsx`.
- [ ] **Task 6.9.3: Cash Fallback Backend.** Create `convertRejectedTpeToCash` mutation. Update `reconciliation.ts` math to move amounts from Card Due to Cash Due.
- [ ] **Task 6.9.4: Cash Fallback UI.** Add "Régler en espèces" button to the Rejected tab.
- [ ] **Task 6.9.5: Supervisor Allocation.** Update `createCashCollection` to accept `settlementAllocations`.

## Milestone 6.10: Admin Dashboard Enhancements
- [x] **Task 6.10.1: Clickable Rider Names.** Make the Rider names in the Dashboard "Livreurs" table clickable, routing the Admin directly to the Rider 360 View.
- [x] **Task 6.10.2: Riders Table Pagination.** Add Classic Pagination (Prev/Next, Page X of Y) to the "Livreurs" table on the Admin and Supervisor dashboards.
- [x] **Task 6.10.3: Global Command Search.** Add a global search bar in the Admin header to instantly look up a Command ID and see its Excel, Live Entry, and Receipt status

## Milestone 6.11: Markets Page Optimization
- [x] **Task 6.11.1: Smart City Autocomplete.** Upgrade the City `<select>` to a Combobox on the Markets page. Allow the Admin to type a new city and hit Enter to save it.
- [x] **Task 6.11.2: Bulk City Assignment.** Allow the Admin to select multiple markets from the table and assign a city to all of them at once.
- [x] **Task 6.11.3: Market Riders Count.** Show the number of assigned Riders for each market in the table.
- [x] **Task 6.11.4: Market Revenue Aggregation (Phase 1).** 
  Add a "Volume Total" (Chiffre d'Affaires) column to the Markets page. Update the backend query to aggregate the `Total` amount from the `orders` table per market using a proper index for performance. Update the frontend table to display the formatted revenue.

## Milestone 6.12: Dashboard Import Insights & Dynamic Navigation
- [x] **Task 6.12.1: Backend Import Breakdown.** Update the `getImportBatches` query to return the calculated totals (total, cash, card, online) for each batch.
- [x] **Task 6.12.2: Card Dropdown Selector.** Add a dropdown to the subtitle of the "Contrôle des montants" card to select a specific TikTak file. Update the card KPIs to dynamically reflect the selected file's data.
- [x] **Task 6.12.3: Grand Total Footer.** Add a footer row to the bottom of the "Contrôle des montants" card that displays the sum of all imported files (Grand Total).
- [ ] **Task 6.12.4: CSV Export for Dashboard Reports.** Add a "Télécharger CSV" button to the "Contrôle des montants" panel and the "Livreurs" table. Generate a UTF-8 BOM CSV file containing the aggregated data for the selected date range.

## Milestone 7: Automation & Final Polish (Previously Milestone 5)
- [ ] **Task 7.1: Gmail API.** Implement push notifications to auto-import the Excel files.
- [ ] **Task 7.2: End-to-End Testing.** Test the full flow with real data.
- [ ] **Task 7.3: Production Deployment.** Deploy to Convex and Vercel/Netlify.

## Milestone 8: Rider Management & Command Rescue (Sprint 1)
- [ ] **Task 8.1: Extended Rider Info.** Add `phone`, `cin`, `ice`, `motoPaperStorageId`, `rib`, `salaryPaymentMethod`, `dailyRate` to `userProfiles`. Build `<RiderInfoForm>` and `<MotoPaperUpload>`.
- [ ] **Task 8.2: Admin Market Assignment.** Create `riderMarkets` table. Add `assignMarketsToRider`, `getRiderMarkets`, `getMyMarkets`. Build `<RiderMarketPicker>` in Équipe/Rider 360. Filter Rider live-entry dropdown by `getMyMarkets()`.
- [ ] **Task 8.3: Command Rescue Backend.** Create `commandRescueRequests` and `riderNotifications` tables. Build `sendCommandRescue`, `acceptCommandRescue`, `cancelCommandRescue`.
- [ ] **Task 8.4: Command Rescue UI.** Build `/admin/command-rescue` panel. Build `<NotificationBell>` in Rider sidebar and `/rider/notifications` page.

## Milestone 9: HR & Payroll Engine (Sprint 2)
- [ ] **Task 9.1: Payroll Schema.** Create `salaryPeriods` and `salaryDeductions` tables.
- [ ] **Task 9.2: Payroll Generation.** Build `generateSalaryPeriod` (calculates unique days worked, applies `dailyRate`, auto-pulls unresolved `debtBalance`). Build `addDeduction`, `updateDeduction`, `removeDeduction`, `approveSalaryPeriod`.
- [ ] **Task 9.3: Payroll UI.** Build `/admin/salaires` page with month/rider filters, status pills, and detail drawer for deduction editing.

## Milestone 10: Excel Replacement & Financial Settings (Sprint 3)
- [ ] **Task 10.1: Cross-Market Settlements.** Create `settlements` table. Build `createSettlement`, `reverseSettlement`, `listSettlements`, `getMarketBalance`. Build UI on Markets page.
- [ ] **Task 10.2: Settings Page.** Create `systemSettings` table. Build `/admin/settings` for `salaryCycleStartDay`, `autoApprovalThresholdMad`, `midnightGracePeriodHours`.
- [ ] **Task 10.3: Smart Auto-Approval.** Build background job (cron) to auto-approve discrepancies `< threshold` and matching receipts. Tag `autoApproved: true`.
- [ ] **Task 10.4: Discrepancy Upgrades.** Add `type` (surplus/deficit), `cumulative`, `cumulativeSince` to `discrepancies`. Update UI badges and add "En attente de règlement" panel.

## Milestone 11: Strategic Insights & Roles (Sprint 4)
- [ ] **Task 11.1: Dispatcher Role.** Add `dispatcher` to `userProfiles.role`. Build `/dispatcher` route (Live entries + Command Rescue only).
- [ ] **Task 11.2: Bringo Pulse Dashboard.** Build `/admin/pulse` with Recharts (time-series, heatmaps, rider performance, revenue).

## Milestone 12: AI Copilot & Advanced Ops (Sprint 5 & 6)
- [ ] **Task 12.1: Bringo Copilot.** Convex action to OpenAI/DeepSeek. Chat interface on Admin pages to query DB (e.g., "Why is Velodrome showing a 300 MAD discrepancy?").
- [ ] **Task 12.2: Outbound Notifications.** Twilio/WhatsApp integration for rejected receipts and debt reminders.
- [ ] **Task 12.3: Zones & Commission.** Add `zones` table and `commissionRate` fields.
- [ ] **Task 12.4: Shift Scheduling.** Add `shifts` and `shiftBookings` tables for rider market bidding.