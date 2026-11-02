# Bringo Money Flow & Rider Reconciliation — Product Requirements Document (PRD)

## 1. Executive Summary
Bringo requires a reliable system to reconcile money collected by riders, money received by the supervisor, cash deposited into the bank, and TPE/card payments. The system must ingest daily TikTak Excel reports via email, but also allow Riders to input their delivery data live. The application must strictly separate physical cash from electronic payments and provide Admin/Supervisor audit dashboards.

## 2. Problem Statement
Manual interpretation of daily spreadsheets leads to delayed deposits, missing receipts, and uncertainty about rider balances. Riders currently have no way to report their daily collections live, causing a "blackout" period until the next-day Excel file arrives. We need a system that tracks live rider inputs and reconciles them against the next-day Excel report to catch discrepancies immediately.

## 3. Goals
- Provide a Rider mobile-friendly web interface to log commands, markets, amounts, and payment methods live.
- Automatically ingest the next-day TikTak Excel report.
- Cross-reference Rider live entries against the Excel file to flag discrepancies (missing commands or mismatched amounts).
- Track cash from rider collection through bank deposit, supported by deposit evidence.
- Verify TPE receipts.
- Apply Bringo brand colors for a professional UI.

## 4. Users and Permissions
### 4.1 Rider
- Can log in via mobile web.
- Can manually input: Command Number, Market (selected from a database), Amount, and Payment Method (`cash`, `tpe`, `card`).
- Can upload evidence: TPE receipt (immediate) or Bank Deposit receipt (when depositing cash).
- Cannot see the TikTak Excel files or other riders' data.

### 4.2 Supervisor
- Can view daily cash flow KPIs for a selected date.
- Can record cash physically received from Riders using a searchable dropdown form.
- Can record bank deposits and upload supporting receipts.
- Can review Rider-uploaded receipts (read-only view).

### 4.3 Admin
- Full oversight and audit capabilities.
- Imports the TikTak Excel files and manages bad imports (cascade delete).
- Reviews the "Next-Day Reconciliation" dashboard to see discrepancies.
- Approves/rejects all bank-deposit and TPE receipts (evidence).
- Manages the `markets` database, user roles, and bulk onboardings.
- Can reset Rider passwords and view the Rider 360 profile.
- Can write-off lost cash or approve short deposits.

## 5. Scope
### In Scope
- Secure role-based access control (Rider, Supervisor, Admin).
- Rider live-entry mobile UI.
- Market database (CRUD for admin, dropdown for riders).
- TikTak Excel ingestion with conflict/error handling.
- Next-day reconciliation matching engine (flags missing/mismatched commands).
- Cash collection and bank deposit tracking with evidence approval.
- TPE receipt tracking and approval.
- Admin/Supervisor dashboards with date filtering and CSV export.
- Bringo brand UI (#eab818, #4a397e).

### Out of Scope
- Rider delivery routing app (handled by TikTak's separate app).
- Automated bank integrations.

## 6. Daily Workflow
1. **Live Entry (Today):** Rider completes a delivery. Opens Bringo web app, inputs Command #, selects Market, inputs Amount, selects Method. Uploads TPE receipt if applicable.
2. **Cash Collection & Deposit (Today/Next Day):** The Supervisor physically collects cash from the Rider and logs it in the web app. When the Supervisor goes to the bank, they record the deposit and upload the receipt. The Admin reviews and approves it.
3. **Excel Arrival (Tomorrow Morning):** TikTak sends the Excel file. Admin imports it.
4. **Reconciliation (Tomorrow):** System matches Rider live entries to the Excel file. 
   - Match = OK.
   - Missing in Excel = Flag for Admin (Rider typo?).
   - Amount mismatch = Flag for Admin.
5. **Final Audit:** Admin approves all evidence, resolves discrepancies, and reconciles the day.

## 7. Dashboard Requirements
### 7.1 Rider Dashboard
- Simple form to enter Command #, Market, Amount, Method.
- View of "My Entries Today".
- Status of uploaded receipts (Pending, Approved, Rejected).

### 7.2 Admin Dashboard
- **Date Filtering:** Ability to view historical data via a date range picker.
- **Next-Day Reconciliation Alerts:** Shows rider entries not found in the Excel file, or amount mismatches.
- **Review Queues:** Pending TPE receipts, pending Bank Deposits (from Supervisors), and pending Discrepancies.
- **Import Control:** Ability to expand rows to see errors, download the original file, and cascade-delete a bad import.
- **Totals:** Cash in hand, Deposited, TPE pending. Exportable to CSV.
- **Rider 360 View:** A dedicated page to view a specific Rider's daily performance and reset their password.
- **Smart Onboarding:** Admin can create an account by selecting an unverified Rider from the imported Excel data. Bulk upload for markets.
- **City Filtering:** Admin can assign a City to a Market and a Rider. Dashboards can be filtered by City.

### 7.3 Supervisor Dashboard
- **Date Filtering:** Single date picker to view daily KPIs.
- **Cash Collection Form:** Searchable dropdown to select a Rider and log cash collected.
- **Bank Deposit Form:** Searchable dropdown to select a Rider and upload a bank deposit receipt.
- **Live Tracking:** A feed of what Riders are entering live.

## 8. Business Rules & Calculations
### 8.1 Payment Methods
- `cash`: Physical cash. Requires deposit receipt eventually.
- `tpe`: Card terminal at the door. Requires TPE receipt upload.
- `card` (Online): Paid via Bringo app. No receipt required. Excluded from cash/TPE totals.
- Unknown methods = quarantined.

### 8.2 Reconciliation Logic
- All calculations use integer minor units (centimes) and Africa/Casablanca timezone boundaries.
- Rider live amount vs. Excel amount must match exactly.
- Partial deposits do not resolve the full cash obligation until Admin approval.

### 8.3 Financial Edge Cases & Debt Tracking
- **Rider Loss (Formerly Write-Off):** If a Rider loses cash or absconds, the Admin records the missing amount as a `debtBalance` against the Rider's profile. This clears the rider's daily cash obligation but tracks that the Rider owes the company. The system must log an audit event with the reason.
- **Supervisor Short Deposit:** If a Supervisor deposits 4,000 MAD but the receipts show 5,000 MAD, the Admin approves the 4,000 MAD and the system creates a 1,000 MAD `debtBalance` against the Supervisor's profile. The deposit is reconciled, but the Supervisor owes the company 1,000 MAD.
- **Debt Visibility:** The Admin must be able to see every Rider's and Supervisor's current `debtBalance` in the Team (Équipe) page and the upcoming Rider 360 view.
- **Midnight Grace Period:** Live entries submitted between 00:00 and 03:00 AM are automatically assigned to the previous day's `entryDate` to prevent timezone discrepancy errors.

## 9. Technical Direction & Branding
- **Frontend:** React + TypeScript + Vite + Tailwind CSS.
- **Brand Colors:** 
  - Primary: `#4a397e` (Deep Purple)
  - Accent/Buttons: `#eab818` (Gold/Yellow)
- **Backend:** Convex (DB, Auth, File Storage).
- **Database Tables:** `users`, `userProfiles`, `markets`, `orders`, `liveEntries`, `liveEntryReceipts`, `cashCollections`, `bankDeposits`, `discrepancies`, `importBatches`, `auditEvents`.
- **Email Ingestion:** Gmail API via Convex HTTP actions.

## 10. Acceptance Criteria
- A Rider can submit a command and upload a TPE receipt from a mobile browser.
- The UI reflects the Bringo brand colors.
- Admin can import an Excel file. The system automatically flags a discrepancy if the Rider entered an order that isn't in the file, or if the amounts differ.
- Supervisor can log collected cash and bank deposits.
- Admin can approve deposits and see the KPIs update immediately.
- Admin can delete a bad Excel import and see the totals revert.