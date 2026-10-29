# Milestone 1 — Project Foundation & Authorization

## Overview
Confirm the React/TypeScript/Vite frontend and Convex backend, wire an authentication
provider, implement role-based access control in both the UI and backend, build the
application shell and formatting helpers, and cover privileged operations with automated
authorization tests.

**Status**: complete for the M1 scope. Remaining follow-ups are listed at the end.

**Exit criteria**: Admin/Supervisor access is enforced in the UI and on the backend;
unauthorized requests fail tests.

---

## Task List

### 1.1 Frontend Foundation
- [x] **1.1.1** Confirm Vite + React + TypeScript project structure and npm scripts
- [x] **1.1.2** Configure path aliases (`@/`, `@convex/`) in `vite.config.ts` and `tsconfig.json`
- [x] **1.1.3** Verify strict TypeScript build (`npm run build`)
- [x] **1.1.4** Add ESLint 9 flat config with zero-warning policy (`npm run lint`)
- [x] **1.1.5** Add Vitest test runner (`vitest.config.ts`, edge-runtime environment for Convex tests)

### 1.2 Backend Foundation (Convex)
- [x] **1.2.1** Confirm dev deployment and generated client in `convex/_generated/`
- [x] **1.2.2** Define application schema in `convex/schema.ts` (users, profiles, riders, imports, orders, collections, deposits, TPE receipts, audit)
- [x] **1.2.3** Include Convex Auth `authTables` in the schema (required for accounts/sessions)
- [x] **1.2.4** Add indexes used by authorization and lookups (`userProfiles.userId`, `users.email`, `attachmentHash`, `gmailMessageId`)
- [x] **1.2.5** Verify backend typecheck and deployment with `npx convex dev --once`
- [x] **1.2.6** Export HTTP router in `convex/http.ts` and auth config in `convex/auth.config.ts`

### 1.3 Authentication
- [x] **1.3.1** Integrate Convex Auth with the Password provider (`convex/auth.ts`)
- [x] **1.3.2** Keep auth tables and password sign-up/sign-in on the same Convex deployment
- [x] **1.3.3** Generate and set `JWT_PRIVATE_KEY`, `JWKS`, and `SITE_URL` on the deployment
- [x] **1.3.4** Resolve the application user with `getAuthUserId(ctx)` rather than the raw JWT subject
- [x] **1.3.5** Build sign-in / sign-up UI (`src/features/auth/LoginPage.tsx`)
- [x] **1.3.6** Remove the Anonymous provider; v1 uses Password only

### 1.4 Roles, Protected Routes & Bootstrap
- [x] **1.4.1** Add `supervisor` and `admin` profile roles with `isActive` flag (`userProfiles` table)
- [x] **1.4.2** Add backend helpers `getAppUser`, `requireAppUser`, `requireRole`, `requireAdmin`, `requireSupervisor` (`convex/lib/auth.ts`)
- [x] **1.4.3** Enforce admin-only queries/mutations (user directory, imports, settings, audit, evidence review)
- [x] **1.4.4** Enforce supervisor-or-admin access for supervisor dashboards and shared read queries
- [x] **1.4.5** Add client route guards (`ProtectedRoute`, `SupervisorRoute`, `AdminRoute`) with role redirects (`src/App.tsx`)
- [x] **1.4.6** Add first-admin bootstrap (`users.seedAdmin`) that only succeeds while no admin exists
- [x] **1.4.7** Add setup page for an authenticated account without a role (`src/features/auth/SetupPage.tsx`)
- [x] **1.4.8** Add sign-out and role-aware navigation in the app shell
- [x] **1.4.9** Add `getCurrentUser` display-name fallback to email

### 1.5 App Shell, Formatting & Responsive Layout
- [x] **1.5.1** Build the application shell (`src/components/Layout.tsx`) with role-aware nav
- [x] **1.5.2** Build admin and supervisor dashboards with placeholder KPI/chain data for M2+
- [x] **1.5.3** Add reusable `MoneyChain` and `StatusBadge` components
- [x] **1.5.4** Add MAD formatting using integer centimes (`src/lib/format.ts`)
- [x] **1.5.5** Add French date/time, initials, and role formatting
- [x] **1.5.6** Apply French UI copy and the Archivo + IBM Plex Mono design system
- [x] **1.5.7** Verify responsive layouts at desktop and 390 px width
- [x] **1.5.8** Add loading, not-found, and unauthorized states

### 1.6 Authorization Tests
- [x] **1.6.1** Test unauthenticated access is rejected
- [x] **1.6.2** Test a supervisor cannot read the admin user directory
- [x] **1.6.3** Test an admin can read the user directory
- [x] **1.6.4** Test deactivated users and users without profiles are rejected
- [x] **1.6.5** Test only admins can update import settings
- [x] **1.6.6** Test only admins can approve/reject deposits and TPE receipts
- [x] **1.6.7** Test only admins can access import and audit data
- [x] **1.6.8** Keep unit tests for MAD formatting and date helpers

### 1.7 Documentation & Verification
- [x] **1.7.1** Document environment variables (`.env.example`)
- [x] **1.7.2** Document the first-admin bootstrap procedure (below)
- [x] **1.7.3** Run `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npx convex dev --once`, and `npm run build`

---

## Environment Variables

### Frontend (`.env.local`)
```
CONVEX_DEPLOYMENT=dev:<deployment-name>
VITE_CONVEX_URL=https://<deployment>.convex.cloud
VITE_CONVEX_SITE_URL=https://<deployment>.convex.site
```

### Convex deployment secrets
Set with `npx convex env set KEY value` (never commit real values):
```
SITE_URL=http://localhost:5173        # production: the deployed frontend origin
JWT_PRIVATE_KEY=<PKCS8 PEM, newline-escaped>
JWKS=<public JWKS JSON>
GOOGLE_CLIENT_ID=<set when Milestone 3 starts>
GOOGLE_CLIENT_SECRET=<set when Milestone 3 starts>
```

`JWT_PRIVATE_KEY` and `JWKS` can be generated with the `jose` package:

```js
import { generateKeyPair, exportPKCS8, exportJWK } from 'jose';

const { publicKey, privateKey } = await generateKeyPair('RS256');
const pkcs8 = await exportPKCS8(privateKey);
const jwk = await exportJWK(publicKey);
const jwks = JSON.stringify({ keys: [{ use: 'sig', ...jwk }] });
```

---

## First-Admin Bootstrap

1. Sign up through `/login` (Password provider).
2. The account is authenticated but has no role, so the app redirects to `/setup`.
3. Submit the setup form. `users.seedAdmin` creates an active `admin` profile **only if no
   admin exists yet**.
4. All later roles are assigned by an existing admin; `seedAdmin` then refuses to run.

Bootstrap is intentionally one-time. If the first admin is lost, recover it directly in the
Convex dashboard rather than weakening the guard.

---

## Verification Commands
```bash
npm run lint
npx tsc --noEmit
npx vitest run
npx convex dev --once
npm run build
```

Expected: 0 lint warnings, clean typecheck, 20 passing tests, successful Convex deploy,
successful production build.

---

## Remaining Follow-ups (outside the M1 exit criteria)
- Manually exercise the supervisor dashboard with a real supervisor account. Backend
  supervisor authorization is covered by tests; the visual check used the admin account.
- Set a production `SITE_URL` and rotate the dev JWT key pair before deploying.
- Replace dashboard placeholder data with the M2 ledger queries.
- Gmail OAuth credentials and mailbox authorization belong to Milestone 3.
