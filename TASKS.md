# Bringo Project Milestones & Tasks

## Milestone 1: Foundation, Auth & Branding (Status: In Progress)
- [x] Confirm Vite + React + TypeScript foundation.
- [x] Convex schema definition (users, profiles, auth).
- [x] Auth provider integration (Password).
- [x] Roles: Admin, Supervisor.
- [x] **Task 1.1: Add `rider` role** to schema, auth helpers, and protected routes.
- [x] **Task 1.2: Apply Bringo Branding.** Update Tailwind/CSS with `#4a397e` (primary) and `#eab818` (accent). Update app shell and buttons.
- [x] **Task 1.3: Create `markets` table** in Convex schema. Add an Admin page to CRUD (create, read, update, delete) markets.

## Milestone 2: Rider Live Entry (New)
- [ ] **Task 2.1: Rider Dashboard UI.** Mobile-responsive form for Riders to enter Command #, select Market, enter Amount, select Payment Method.
- [ ] **Task 2.2: Receipt Uploads.** Add Convex file storage for TPE receipts and Bank deposit receipts.
- [ ] **Task 2.3: Rider Backend Mutations.** `orders.createLiveOrder`, `receipts.uploadReceipt`. Ensure only the logged-in rider can see their own entries.
- [ ] **Task 2.4: Rider "My Entries" View.** A list of the rider's entries for the current day, with status of their receipts.

## Milestone 3: Admin & Supervisor Verification
- [ ] **Task 3.1: Admin Review Queue.** UI for Admin to see uploaded TPE and Bank receipts. Action buttons to Approve/Reject.
- [ ] **Task 3.2: Backend Review Mutations.** `receipts.approveReceipt`, `receipts.rejectReceipt`. 
- [ ] **Task 3.3: Supervisor Dashboard.** Dashboard for Supervisor to view rider cash collections and initiate deposits if needed.

## Milestone 4: Excel Ingestion & Next-Day Matching Engine (Critical)
- [ ] **Task 4.1: Excel Import.** Admin UI to upload the TikTak Excel file. Backend parser using `xlsx` library.
- [ ] **Task 4.2: Discrepancy Engine.** Logic to compare Rider Live Entries (today) against the Imported Excel (tomorrow).
  - Check: Command ID exists in Excel?
  - Check: Amount matches?
- [ ] **Task 4.3: Admin Discrepancy Dashboard.** A view showing flagged mismatches and missing commands. Admin can mark them as "Resolved" with a note.

## Milestone 5: Automation & Final Polish
- [ ] **Task 5.1: Gmail API.** Implement push notifications to auto-import the Excel files.
- [ ] **Task 5.2: Audit Logs.** Ensure every status change and approval is tracked.
- [ ] **Task 5.3: End-to-End Testing.** Test the full flow: Rider enters -> Admin approves -> Excel imports -> Match succeeds/fails.
