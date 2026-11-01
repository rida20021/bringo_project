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
- Audits Rider live entries.
- Can record cash received from riders (if the rider hands over physical cash).
- Can make bank deposits and upload receipts.
- Reviews Rider-uploaded receipts.

### 4.3 Admin
- Full oversight.
- Imports the TikTak Excel files.
- Reviews the "Next-Day Reconciliation" dashboard to see discrepancies between Rider live entries and the Excel file.
- Approves/rejects all bank-deposit and TPE receipts.
- Manages the `markets` database and user roles.
- Can reset Rider passwords.

## 5. Scope
### In Scope
- Secure role-based access control (Rider, Supervisor, Admin).
- Rider live-entry mobile UI.
- Market database (CRUD for admin, dropdown for riders).
- TikTak Excel ingestion.
- Next-day reconciliation matching engine (flags missing/mismatched commands).
- Cash collection and bank deposit tracking.
- TPE receipt tracking.
- Admin/Supervisor dashboards.
- Bringo brand UI (#eab818, #4a397e).

### Out of Scope
- Rider delivery routing app (handled by TikTak's separate app).
- Automated bank integrations.

## 6. Daily Workflow
1. **Live Entry (Today):** Rider completes a delivery. Opens Bringo web app, inputs Command #, selects Market, inputs Amount, selects Method. Uploads TPE receipt if applicable.
2. **Cash Deposit (Today/Next Day):** Rider deposits cash and uploads the bank receipt. Admin reviews it directly.
3. **Excel Arrival (Tomorrow Morning):** TikTak sends the Excel file. Admin imports it.
4. **Reconciliation (Tomorrow):** System matches Rider live entries to Excel. 
   - Match = OK.
   - Missing in Excel = Flag for Admin (Rider typo?).
   - Amount mismatch = Flag for Admin.
5. **Final Audit:** Admin approves all evidence and reconciles the day.

## 7. Dashboard Requirements
### 7.1 Rider Dashboard
- Simple form to enter Command #, Market, Amount, Method.
- View of "My Entries Today".
- Status of uploaded receipts (Pending, Approved, Rejected).

### 7.2 Admin Dashboard
- **Next-Day Reconciliation Alerts:** Shows rider entries not found in the Excel file, or amount mismatches.
- **Review Queue:** Pending TPE receipts and Bank Deposits.
- **Totals:** Cash in hand, Deposited, TPE pending.
- **Excel Import Status:** Logs of parsed files.
- **Rider 360 View:** A dedicated page to view a specific Rider's daily performance (Commands, Cash collected, TPE receipts, Discrepancies) and reset their password.
- **Smart Onboarding:** Admin can create an account by selecting an unverified Rider from the imported Excel data. Bulk upload for markets and team members.
- **City Filtering:** Admin can assign a City to a Market and a Rider. Dashboards can be filtered by City.

## 8. Business Rules & Calculations
### 8.1 Payment Methods
- `cash`: Physical cash. Requires deposit receipt eventually.
- `tpe`: Card terminal at the door. Requires TPE receipt upload.
- `card` (Online): Paid via Bringo app. No receipt required. Excluded from cash/TPE totals.
- Unknown methods = quarantined.

### 8.2 Reconciliation Logic
- All calculations use integer minor units (centimes).
- Rider live amount vs. Excel amount must match exactly.
- Partial deposits do not resolve the full cash obligation until Admin approval.

## 9. Technical Direction & Branding
- **Frontend:** React + TypeScript + Vite + Tailwind CSS.
- **Brand Colors:** 
  - Primary: `#4a397e` (Deep Purple)
  - Accent/Buttons: `#eab818` (Gold/Yellow)
- **Backend:** Convex.
- **Database Tables:** `users`, `userProfiles`, `markets`, `orders`, `collections`, `deposits`, `tpeReceipts`, `discrepancies`, `auditLogs`.
- **Email Ingestion:** Gmail API via Convex HTTP actions.

## 10. Acceptance Criteria
- A Rider can submit a command and upload a TPE receipt from a mobile browser.
- The UI reflects the Bringo brand colors.
- Admin can import an Excel file. The system automatically flags a discrepancy if the Rider entered an order that isn't in the file, or if the amounts differ.