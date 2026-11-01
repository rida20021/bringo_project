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
- [x] **Task 2.1: Rider Dashboard UI.** Mobile-responsive form for Riders.
- [x] **Task 2.2: Receipt Uploads.** Convex file storage for TPE and Bank receipts.
- [x] **Task 2.3: Rider Backend Mutations.** `orders.createLiveOrder`, `receipts.uploadReceipt`.
- [x] **Task 2.4: Rider "My Entries" View.** List of the rider's entries for the current day.

## Milestone 3: Admin & Supervisor Verification (Complete)
- [x] **Closed registration.** Rider accounts are created by admins only.
- [x] **Task 3.1: Admin Review Queue.** UI for Admin to see uploaded receipts.
- [x] **Task 3.2: Backend Review Mutations.** `approveReceipt`, `rejectReceipt`. 
- [x] **Task 3.3: Supervisor Dashboard.** Dedicated page for Supervisors to make deposits and view specific KPIs.

## Milestone 4: Excel Ingestion & Next-Day Matching Engine (Complete)
- [x] **Task 4.1: Excel Import.** Admin UI to upload the TikTak Excel file. Backend parser using `xlsx`.
- [x] **Task 4.2: Discrepancy Engine.** Logic to compare Rider Live Entries against Imported Excel.
- [x] **Task 4.3: Admin Discrepancy Dashboard.** View showing flagged mismatches. Admin can mark them as "Resolved".

## Milestone 4.5: Production Polish (Critical)
- [ ] **Task 4.5.1: Toast Notifications.** Replace inline text with modern popup toasts (e.g., `sonner`).
- [ ] **Task 4.5.2: Confirm Modals.** Add popups for destructive actions (Rejecting receipts, Deleting markets).
- [ ] **Task 4.5.3: Pagination.** Add "Load More" buttons to the Discrepancies and Review queues.
- [ ] **Task 4.5.4: Audit Logs.** Write to the `auditLogs` table on approvals, rejections, and imports.
- [ ] **Task 4.5.5: Orphaned File Cleanup.** Add a Cron job to delete rejected receipts from Convex storage.
- [ ] **Task 4.5.6: Collapsible Lists.** Convert Discrepancy cards and Pending Receipt cards to Accordions. Show only the header (Command, Rider, Amount) by default. Expand on click to show the resolution textarea or receipt image.

## Milestone 5: Automation & Final Polish
- [ ] **Task 5.1: Gmail API.** Implement push notifications to auto-import the Excel files.
- [ ] **Task 5.2: End-to-End Testing.** Test the full flow: Rider enters -> Admin approves -> Excel imports -> Match succeeds/fails.

## Milestone 6: Admin Intelligence & Efficiency
- [ ] **Task 6.1: Rider 360 View.** Build a dedicated Admin page to view a rider's full daily stats and reset their password.
- [ ] **Task 6.2: Smart Onboarding.** Add a dropdown to select an imported rider from the Excel file to create their account. Add bulk upload for markets.
- [ ] **Task 6.3: City Filtering.** Add a `city` field to Markets and Riders. Add a city filter to the Admin dashboard.