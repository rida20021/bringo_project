I have successfully completed Task 6.17.6: Clarify Global Reconciliation Labels.
Summary of Changes:
1. Task Tracking (TASKS.md):
- Marked - [x] **Task 6.17.6: Clarify Global Reconciliation Labels.** as completed under Milestone 6.17.
2. Reconciliation Page UI (src/features/admin/reports/ReconciliationPage.tsx):
- Updated the KPI Summary Cards to accurately reflect Revenue (Chiffre d'Affaires) metrics instead of Cash Debt metrics:
- Changed "Cash Réel" to "CA Réel".
- Changed "Cash Excel" to "CA Excel".
- Changed "Cash Live (Non matché)" to "CA Live (Non matché)".
- Retained "Encaissé" for actual physical cash collected.
- Updated the page header subtitle to: "Fusion unifiée du Chiffre d'Affaires (CA) Excel et des saisies Live sans double compte."
3. Verification & Checks:
- Ran npx tsc --noEmit successfully (zero compilation errors).
- Ran the full Vitest test suite (173 tests passed).
Build · OmniRoute Combo · 1m 31s · 67.4 tok/s
Switched agent from Build to Project-Guide
◈Instructions updated: core/codemode, core/instructions
Use the project-guide agent to explain the architecture, setup process, data flow, and important coding conventions.

+Thought · 1.6s
│General Subagent — Project overview and architecture guide · openrouter/deepseek-ai/deepseek-chat-v3-0324
+Thought · 2.2s
│Project-Guide Subagent — Project overview and architecture guide · openrouter/deepseek-ai/deepseek-chat-v3-0324
+Thought · 1.3s
✓execute
›opencode.models [limit=20]
+Thought · 5.7s
✓Project-Guide Subagent — Project overview and architecture guide · OmniRoute Combo
+Thought · 10.5s
Bringo Project Overview
Purpose
Bringo is a money flow and rider reconciliation system that tracks cash collected by riders, money received by supervisors, bank deposits, and electronic payments (TPE/card). It automates the reconciliation between real-time rider live entries and next-day Excel reports from the TikTak delivery service.
Technology Stack
Layer	Technologies
Frontend	React 18, TypeScript, Vite, Tailwind CSS, React Router DOM
Backend	Convex 1.15 (DB, Auth, File Storage, Real-time)
Auth	@convex-dev/auth with Password provider
Icons	Lucide React
Notifications	Sonner (toasts)
Testing	Vitest + @testing-library/react
Date Handling	date-fns + date-fns-tz (Casablanca timezone)
Excel Processing	xlsx parser for TikTak files
Architecture
Frontend Structure (src/)
src/
├── components/           # Shared UI (Layout, LoadingSpinner, etc.)
├── features/             # Feature-based organization
│   ├── auth/            # Login, Setup pages
│   ├── rider/           # Rider dashboard & entries
│   ├── supervisor/      # Collection & deposit forms
│   └── admin/           # Dashboard, Reports, Markets, Riders
├── lib/                 # Formatting utilities (currency, dates)
└── styles/              # Global CSS with Bringo branding
Backend Structure (convex/)
convex/
├── schema.ts            # Database table definitions
├── lib/                 # Shared utilities (auth, dates, parsers)
├── tests/               # Comprehensive test suite
├── reconciliation.ts    # Dashboard & reconciliation queries
├── imports.ts           # Excel import actions
├── orders.ts            # Order management
├── discrepancies.ts     # Matching engine
└── _generated/          # Auto-generated TypeScript types
Application Flow
Authentication & Role-Based Routing
- Riders → /rider (submit live entries, upload receipts)
- Supervisors → /supervisor/dashboard (collect cash, make deposits)
- Admins → /admin/* (full oversight, Excel imports, approvals)
Daily Workflow
1. Today: Riders submit live entries with command details and TPE receipt uploads
2. Tomorrow: Admin imports TikTak Excel file → system auto-reconciles against live entries
3. Cash Chain: Riders owe cash → Supervisor collects → Deposits to bank → Admin approves
Data Sources (Mode Toggle)
- Audit Mode: Uses imported orders from Excel
- Live Mode: Falls back to liveEntries when no Excel exists for the day
- Global Reconciliation: Merges both sources without double-counting
Key Data Model
Table	Purpose
users	Authentication records
userProfiles	Roles, display names, debt balances
riders	Canonical rider names/aliases from Excel
markets	Store locations with external IDs
orders	Imported Excel payment rows (cash, card, online)
liveEntries	Rider-submitted command entries
liveEntryReceipts	Receipt uploads (TPE/bank evidence)
cashCollections	Supervisor cash collection records
bankDeposits	Bank deposit records with status
discrepancies	Mismatches between live & Excel data
importBatches	Excel import metadata & statistics
auditEvents	Comprehensive audit trail
Coding Conventions
Critical Rules (from AGENTS.md)
1. DO NOT RUN SERVERS - User runs dev servers in their own terminal tabs
2. Use crons.interval(...) - Never use everyMinute
3. Actions cannot use ctx.db - Must use ctx.runQuery and ctx.runMutation
4. Read PRD.md and TASKS.md before starting any task
5. E2E Testing - Use DevTools MCP to verify changes
Money & Dates
- All amounts stored as integer centimes (no floating point)
- Business days use Casablanca timezone (Africa/Casablanca)
- Midnight grace period: 00:00–03:00 entries count for previous day
Brand Colors
- Primary: #4a397e (Deep Purple) - sidebars, headers
- Accent: #eab818 (Gold) - buttons, highlights
Development Commands
# Build & Type Checking
npm run typecheck     # TypeScript validation
npm run lint          # ESLint checking
npm run build         # Production build

# Testing
npm run test          # Run all tests
npm run test:watch    # Watch mode

# Deployment
npm run convex:deploy # Deploy to Convex
Important Notes for AI Assistants
- Never modify existing queries like getAdminDashboardData or getSupervisorDashboardData unless explicitly instructed
- All backend code goes in convex/
- All frontend components go in src/features/ or src/components/
- Check TASKS.md for milestone progress and task tracking
- Use Graphify to restrict context when exploring the codebase
- Run typecheck and tests after any changes