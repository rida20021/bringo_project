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

### 6.3 Import Control (Imports Récents)
- [x] **Task 6.3.1:** Make rows expandable to show Conflict Details (e.g., "Row 5: Duplicate Command").
- [x] **Task 6.3.2:** Add a "Delete Import" button that cascades to delete all related orders and discrepancies.
- [x] **Task 6.3.3:** Add a "Download Original File" link for auditing.

### 6.4 Dashboard Date Controls (Sélecteur de date)
- [x] **Task 6.4.1:** Add a date picker to the Supervisor "Tableau de bord" and a start/end range picker to the Admin "Vue d'ensemble", persisted in the URL and resolved with Casablanca day boundaries.

### 6.5 Advanced Rider & Financial Edge Cases
- [ ] **Task 6.5.1:** Build the Admin "Rider 360 View" (dedicated page showing rider stats and password reset).
- [ ] **Task 6.5.2:** Implement "Write-Offs" (lost cash) with mandatory reason.
- [ ] **Task 6.5.3:** Implement "Short Deposit" approval flow.
- [ ] **Task 6.5.4:** Implement the Midnight Grace Period (00:00 - 03:00 AM counts for previous day).  
- [x] **Task 6.5.5: Searchable Rider Dropdown.** Replace the native `<select>` in the Supervisor's Bank Deposit form with a searchable dropdown so Supervisors can type a Rider's name instead of scrolling through a massive list.
- [ ] **Task 6.5.6: Supervisor Cash Collection.** Add a form to `SupervisorPage.tsx` so Supervisors can record physical cash collected from a Rider. Update `reconciliation.ts` so this counts towards the "Encaissé" KPI.

## Milestone 7: Automation & Final Polish (Previously Milestone 5)
- [ ] **Task 7.1: Gmail API.** Implement push notifications to auto-import the Excel files.
- [ ] **Task 7.2: End-to-End Testing.** Test the full flow with real data.
- [ ] **Task 7.3: Production Deployment.** Deploy to Convex and Vercel/Netlify.
