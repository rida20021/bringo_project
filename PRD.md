# Bringo Project — Product Requirements Document (PRD)

| | |
|---|---|
| **Version** | 2.2 |
| **Last updated** | 2026-11-09 |
| **Owner** | Rida (Admin) |
| **Stack** | React + TypeScript + Vite + Tailwind · Convex · Vitest |

## 1. Vision

A single operational platform for Bringo's delivery business that:

- **Reconciles cash flow** between riders, supervisors, and the bank.
- **Automates salary computation** from attendance and discrepancies.
- Gives the admin a **God View** to investigate, correct, and conclude — without Excel.

**Core principle:** every event (order, deposit, attendance, deduction) is captured once and reused everywhere. Every value is admin-editable, every edit audited, everything soft-deleted (never lost).

---

## 2. Roles

| Role | Access |
|---|---|
| Admin | Everything: riders, markets, deposits, salaries, attendance, settings, audit, imports/exports, general search. |
| Supervisor | Cash collection + deposits for their markets; rider cash view. No salary, no settings, no audit. |
| Rider | Live entry, own orders, own cash-due banner. No salary, no attendance, no deposit info. |

---

## 3. Authentication & Users

- Convex Auth (email/password).
- `userProfiles.role` = `admin` | `supervisor` | `rider`.
- Riders linked to `riders._id` and one or more markets.

---

## 4. Orders & Live Entries

- Orders come from **TikTak Excel imports** (audit mode) and **rider live entries** (live mode).
- Fields: `commandId`, `riderId`, `marketId`, `city`, `amount`, `paymentMethod` (`cash` | `carte` | `en_ligne`), `deliveryDate`, `eligibilityStatus`.
- Live entries reconciled against orders → **exact match / mismatch / missing-live / live-only**.

---

## 5. Cash Flow

### 5.1 Cash Collections

`cashCollections`: `riderId`, `marketId`, `amount`, `collectedAt`, `supervisorId`.

### 5.2 Deposits (per Market per Day)

```ts
deposits: {
  marketId,
  date,                    // primary date
  cumulFromDate?,          // set when status = "cumul"
  cumulToDate?,            // set when status = "cumul"
  expectedAmount,          // sum of expected cash over [cumulFromDate ?? date, cumulToDate ?? date]
  depositedAmount,
  status: "effectue" | "cumul" | "non_effectue",
  discrepancy,             // depositedAmount − expectedAmount (auto, admin-overridable)
  riderId?,                // fuzzy-matched from SV Excel, admin-adjustable
  comment?,
  resolvedBy?, resolvedAt?,
}
```

### 5.3 Discrepancy Lifecycle

```text
open ──▶ assigned (to rider) ──▶ deducted (in payslip) ──▶ resolved
   │
   ├──▶ absorbed (company loss)
   │
   └──▶ corrected (manual edit, audit-logged)
```

### 5.4 Payment Method Correction (any direction)

From the Global View, admin can change any order's `paymentMethod` to **any** of `cash | carte | en_ligne`. The system then:

1. Recomputes **cash due / carte due / online** for the order.
2. Recomputes **deposit expectations** for affected markets.
3. Adds / removes **discrepancies**.
4. Logs the change in `auditLogs`.

> **Example:** rider selected `carte` in the app but the customer paid cash → admin switches to `cash` → cash due rises, carte due falls, market deposit expectation rises accordingly.

---

## 6. Global View (God View)

### 6.1 Location

`/admin/riders` — under **Équipe → Livreurs** toggle.

### 6.2 Advanced Filters

| Filter | Options |
|---|---|
| Date range | — |
| Rider | multi-select |
| Market | multi-select |
| City | multi-select |
| Payment method | — |
| Status | `payé` \| `en_attente` \| `écart` |

### 6.3 Table Columns

`Command ID` · `Date` · `Rider` · `Market` · `City` · `Payment method` *(editable)* · `Cash dû` · `Carte due` · `Encaissé` · `Reste cash` · `Statut`

### 6.4 Inline Editing

| Action | Effect |
|---|---|
| Payment method | Recomputes all downstream math. |
| Rider assignment | For unlinked orders. |
| Discrepancy resolution | Link / absorb / correct. |

### 6.5 Audit

- Every edit → `auditLogs` (`{ userId, table, docId, field, oldValue, newValue, timestamp }`).
- **Soft-deletes only.**
- Visible in `/admin/settings/audit`.
- **Retention: forever.**

---

## 7. Global Reconciliation

- Merges **Excel orders + Live entries** without double-counting.
- Returns `CA Réel`, `CA Excel`, `CA Live`, `Encaissé` + sections `mismatches`, `missingLive`, `liveOnly`.

---

## 8. Rider Management

### 8.1 Rider Profile (all admin-editable)

| Field | Type | Notes |
|---|---|---|
| `fullName` | string | **required** |
| `phone`, `cin`, `cie`, `address` | strings | |
| `vehicleType` | enum | `moto` \| `vélo` \| `voiture` |
| `vehiclePlate` | string | |
| `vehiclePhotos[]`, `licensePhoto` | files | |
| `dailyRate` | number (MAD) | default rate; admin-overridable per period |
| `zoneId` | ref | |
| `marketIds` | ref[] | **allowed markets** |
| `rib` | string | |
| `paymentMethod` | enum | `cash` \| `virement` \| `espece` |
| `status` | enum | `active` \| `suspended` \| `left` |
| `startDate` | date | = first `IN` in JO |
| `endDate?` | date | = first `OUT` in JO |
| `provisioning` | object | onboarding checklist (see §8.4) |

### 8.2 Market Assignment

- Live Entry market dropdown is **restricted to `marketIds`**.
- Admin changes assignments in `/admin/team` at any time.
- Rider access to markets is determined by their Home Market assignment, PLUS any active renfort (reinforcement) or meal_box shifts for the current day. Admin can always override market access.

### 8.3 Zones

- `zones` group one or more markets (e.g., `VILLE VERTE / PROMENADE`).
- Used for reporting and optional rate overrides.

### 8.4 Provisioning Checklist (on `IN` status) — FIXED LIST

When attendance marks a rider as `IN` (first day), the system creates a `provisioning` record:

```ts
{
  riderId,
  startedAt,
  items: {
    contractSigned:    boolean,
    cinCollected:      boolean,
    cieCollected:      boolean,
    ribCollected:      boolean,
    vehiclePhotos:     boolean,
    licensePhoto:      boolean,
    appAccountCreated: boolean,
    marketsAssigned:   boolean,
  },
  completedAt?, completedBy?,
}
```

| Rule | Detail |
|---|---|
| Fixed list | The 8 checklist items are fixed in code — they cannot be added to or removed. |
| Manual control | Admin can tick / untick each item manually (source of truth = admin). |
| Display | Items shown on the Rider 360 page; pending items are highlighted. |
| Never blocks pay | `startDate` and `status = active` are set on `IN` regardless of checklist completion. |

### 8.5 Sidebar Behaviour

- **Équipe** menu item is clickable → team management.
- A toggle chevron on the left of **Équipe** opens the sub-menu:

| Sub-menu item | Routes to |
|---|---|
| Livreurs | Global View |
| Équipe | Team management (profiles, assignments, payroll) |

---

## 9. Attendance & Rest Days

### 9.1 Data Model

```ts
attendance: {
  riderId,
  date: "YYYY-MM-DD",
  status: "worked" | "off" | "in" | "out" | "cumul",
  note?: string,
}
```

### 9.2 Rules

| Status | Meaning | Effect |
|---|---|---|
| `worked` | Blank cell in JO Excel. | Counted as worked. |
| `in` | First day of work. | Sets `rider.startDate`, `status = active`, creates provisioning record. |
| `out` | Last day of work. | Sets `rider.endDate`, `status = left`. |
| `off` | Rest day. | Not counted as worked. |
| `cumul` | Catch-up day. | Counted as worked. |

### 9.3 UI
- **Calendar view (default):** month grid — one row per rider, one column per day. Click a cell to cycle `worked → off → in → out`. Colors: green / grey / blue / red.
- **Auto-Generate:** A button to populate the entire month based on the Planning Grid (Shifts).
- **Manage Exceptions:** Admin only manually clicks to override the baseline (e.g., marking a sick day).
- **Table view** (toggle).
- Bulk edit across riders × date range.

---

## 10. Salary Management

### 10.1 Period Rules

| Rule | Detail |
|---|---|
| First payslip | From `startDate` (first `IN`) to end of that calendar month. *Example: rider starts 15 Jan → first payslip covers 15 Jan → 31 Jan.* |
| Subsequent payslips | From the 1st to the end of each calendar month. |
| Monthly rate normalization | `dailyRate × 30`. Actual pay = `dailyRate × actualDaysWorked` (28, 29, 30, or 31 days). Pay = daysWorked × dailyRate. (First month anchored to startDate). |
| Configurability | Period boundaries and normalization configurable in Settings; admin can override per rider. |

### 10.2 Data Model

```ts
salaryPeriods: {
  riderId,
  periodStart,
  periodEnd,
  daysWorked,           // auto from attendance
  dailyRate,            // from rider, admin-overridable
  grossSalary,          // daysWorked × dailyRate
  deductions: [{ type, amount, note, sourceRef? }],
  bonus: number,
  netSalary,            // gross + bonus − Σ deductions
  status: "draft" | "approved" | "paid",
  approvedAt?,
  approvedBy?,
  paidAt?,
  paymentMethod?,
  carryOverFrom?: ref,  // if previous period net < 0
  debtId?: ref,        // if consecutive negative → formal debt
}

riderDebts: {
  riderId,
  amount,
  originPeriodId,
  createdAt,
  status: "open" | "settled" | "forgiven",
  note?,
}
```

### 10.3 Deduction Categories

Settings-managed: `ecart_versement`, `ecart_tpe`, `avance`, `reparation`, `carburant`, `amende`, `telephone`, `autre`.

Each deduction: `type`, `amount`, `note`, optional `sourceRef` (link to deposit / order / audit).

### 10.4 Computation Flow

1. On period start, the system generates a **draft payslip per active rider**:
   - `daysWorked` from attendance.
   - `grossSalary = daysWorked × dailyRate`.
   - Deductions auto-filled from unresolved discrepancies within the period.
2. Admin reviews in `/admin/salaries` — can adjust days, rate, deductions, bonus.
3. **Approuver** → `approved`.
4. **Marquer payé** → `paid`. Every field remains editable by the admin (payslips are never hard-locked). All edits after `paid` are audit-logged.

### 10.5 Negative Net Salary — Hybrid Policy

When `netSalary < 0`, apply the hybrid rule:

| Case | Action |
|---|---|
| **1st consecutive negative** (previous period net ≥ 0) | Carry over the negative amount to the next period (`carryOverFrom`). Notify admin. |
| **2nd consecutive negative** (previous period was carried over and net still < 0) | Convert cumulative negative into a **formal debt record** on the rider (`riderDebts`). Notify admin (critical). Debt shows on Rider 360 and can be settled manually (deducted from future payslips when the rider earns enough). |
| **3rd+ consecutive negative** | Same as 2nd — debt accumulates. Admin can flag the rider for review or terminate (`status = suspended`). |

### 10.6 Views

- `/admin/salaries` — list, filterable by rider / period / status.
- `/admin/salaries/:id` — detail with line items + source links.
- Export CSV / Excel per period.
- Riders **cannot** view salaries from the mobile app.

---

## 11. Deposit Tracking

### 11.1 Import from SV Excel

Upload `SV-2026.xlsx` → parse each market/day row:

| Excel column | Maps to |
|---|---|
| Versement | `status` |
| Mt à verser | `expectedAmount` |
| Mt versé | `depositedAmount` |
| Mt d'écart | `discrepancy` |
| Livreur concerné | Fuzzy auto-suggest + "à lier" fallback (see §11.4) |
| Commentaire | `comment` |

### 11.2 Cumulative Deposits

When `status = cumul`:

1. Admin confirms `cumulFromDate` (parsed from comment, or prompted).
2. System sums expected amounts for `[cumulFromDate, date]` → `expectedAmount`.
3. `discrepancy = depositedAmount − expectedAmount`.
4. Admin assigns, absorbs, or corrects.

### 11.3 Discrepancy Resolution

Assign to rider (creates a payslip deduction), absorb, or correct (audit-logged).

### 11.4 "Livreur concerné" Matching — Fuzzy + Fallback

On import, the system runs a fuzzy match against `riders.fullName` (Levenshtein + token overlap):

| Confidence | Outcome |
|---|---|
| ≥ 85 % | Auto-linked, shown as "suggestion" (admin can override). |
| 50–85 % | Suggested but flagged **amber**; admin confirms. |
| < 50 % or ambiguous | Marked **`to_link`** (orange badge); admin links manually in the import review panel. |

Nothing blocks the import; admin can fix at any time.

---

## 12. Dashboard (Tableau de Bord)

### 12.1 Structure

```text
/admin/dashboard                ← overview (clickable KPIs + charts + insight panel)
   /admin/dashboard/cash       ← cash flow drill-down
   /admin/dashboard/riders     ← rider performance
   /admin/dashboard/markets    ← market performance
   /admin/dashboard/salaries   ← payroll overview
```

### 12.2 KPI Cards (all clickable)

| Card | Metric | Routes to |
|---|---|---|
| CA Réel | Σ order amounts (period) | `/admin/dashboard/markets` |
| Cash dû | Σ (cash orders − cash collected) | `/admin/dashboard/cash` |
| Encaissé | Σ cash collections | `/admin/dashboard/cash` |
| Déposé | Σ deposits | `/admin/dashboard/cash` |
| Écarts | Count + total MAD | `/admin/reports/reconciliation` |
| Salaires à payer | Σ draft + approved payslips | `/admin/dashboard/salaries` |
| Livreurs actifs | Count | `/admin/riders` |

### 12.3 Charts

| Chart | Content |
|---|---|
| Line | CA trend (last 30 days) |
| Bar | Top 10 marchés par CA |
| Bar | Top 10 livreurs par écart cumulé |
| Heatmap | Cash dû par marché × jour |
| Donut | Cash / carte / en ligne split |
| Sparkline | Inside each KPI card (7-day trend) |

### 12.4 Insight Panel — "Où concentrer votre attention aujourd'hui"

- 🔴 Marchés avec écart en attente (clickable).
- 🟡 Livreurs avec solde cash > seuil (Settings).
- 🟢 Meilleur livreur (least écarts, most orders).
- ⚪ Salaires en attente d'approbation.

---

## 13. General Search (Omnibox)

### 13.1 Location

Header bar, right of the brand. Keyboard shortcut: `⌘K` / `Ctrl+K`.

### 13.2 Query Auto-Detection

| Pattern | Detected as | Result |
|---|---|---|
| `CMD-12345` or bare number | Command ID | Order detail / Global View filtered |
| Fuzzy text vs rider names | Rider | Rider 360 |
| Fuzzy text vs market names | Market | Global View filtered on this market |
| Fuzzy text vs city names | City | Global View filtered on this city |
| Free text | Mixed | All categories, ranked by relevance |

### 13.3 Results Layout (categorized)

```text
COMMANDS
  CMD-123456 — 350 MAD — Achraf Jaoui — Velodrome — 04/11/2026
  ...
RIDERS
  Achraf Jaoui — Velodrome / Anfa — Active
  ...
MARKETS
  Carrefour Market Velodrome — Zone Vélodrome
  ...
CITIES
  Casablanca — 12 markets
  ...
```

Max **5 results per category**. Every row fully clickable.

**Click routing:**

| Result type | Destination |
|---|---|
| Command | Order detail (drawer or page) |
| Rider | Rider 360 |
| Market | Global View filtered on that market |
| City | Global View filtered on that city |

### 13.4 Behaviours

| Behaviour | Detail |
|---|---|
| Recents | Last 5 queries shown when omnibox focused with no input. |
| Keyboard | `↑`/`↓` navigate, `Enter` open, `Esc` dismiss. |
| Backend | Convex `searchIndex` on `orders.commandId`, `riders.fullName`, `markets.name`, `zones.name`. |
| Privacy | No search logging — queries are not persisted. |

---

## 14. Settings (`/admin/settings`) — Admin-only

| Group | Settings |
|---|---|
| Rates | Default daily rate per zone / role; override history |
| Payroll | Period type (default: calendar month, first month anchored to `startDate`); 30-day normalization toggle; hybrid negative-net rules |
| Reconciliation | TPE closure threshold; discrepancy tolerance; auto-close days |
| Deposits | Expected-cash rule; cumul defaults; fuzzy-match confidence thresholds |
| Deductions | Categories CRUD |
| Markets | CRUD; assign zones |
| Zones | CRUD |
| Users | Roles & permissions |
| Notifications | Event → channel matrix (in-app / digest); digest time (default 08:00 Africa/Casablanca) |
| Audit | Retention = forever; soft-delete = on; viewer permissions |
| Search | Enable / disable categories; confidence thresholds |

---

## 15. Import / Export & Opening Balances

### 15.1 Go-Live Strategy (No Historical Imports)
We are bypassing the historical 10-month Excel imports for Attendance, Deposits, and Salaries. The system goes live with a clean slate. The Admin uses the Web App UI to manage daily operations. TikTak (Orders) imports will still function as normal.

### 15.2 Opening Balances
To handle historical debts or mid-month starts, the Admin uses the "Opening Balance" form in the Rider 360 page to manually input:
- The rider's actual `startDate`.
- Any current outstanding debt (`riderDebts`) owed to the company.
- Any current advance payments (`salaryDeductions`).

### 15.3 Export
- CSV / Excel: deposits, payslips, reconciliation, dashboard data.
- UTF-8 BOM preserved.

---

## 16. Notifications

### Channel Policy

| Channel | Events |
|---|---|
| **Critical** (real-time in-app bell) | • New discrepancy detected • Deposit marked `non_effectue` • Salary draft ready for approval • Negative net salary (hybrid → carry-over or debt) • Rider `OUT` (termination) • Import failure / conflict requires admin decision |
| **Informational** (daily digest — default 08:00 Africa/Casablanca, configurable) | • Daily cash-due summary per market • Riders with cash due > threshold • Low-priority discrepancies • Weekly trends (CA, écarts, payroll) |

- Critical items persist as **banners until acknowledged**.
- Digest is opt-in / opt-out per admin in Settings.

---

## 17. Non-Goals

- Riders do not see salary, attendance, or deposit records.
- Supervisors do not approve salaries or edit settings.
- No real-time bank integration (deposits recorded manually or via SV import).
- No search logging.

---

## 18. Success Metrics

| Metric | Target |
|---|---|
| Excel files needed for daily operations | **Zero** |
| Monthly payroll time | **< 15 min** (vs. hours in Excel) |
| Top-3 cash discrepancies identified | **< 2 min** each morning |
| Audit trail completeness for admin edits | **100 %** |
| General search lookup | **< 3 s and < 2 clicks** |

---

## 19. Planning & Workforce Management (Shifts)

### 19.1 Concept

- The system replaces the weekly `Planning_Casablanca.xlsx` and `Planning_Marrakech.xlsx` files. The Admin creates the schedule directly in the web app, and Riders can view it on their mobile dashboard.

### 19.2 Data Model

```ts
shifts: {
  riderId: Id<'users'>,
  date: number, // Start of Casablanca day
  status: "present" | "off" | "renfort" | "meal_box",
  targetMarketId?: Id<'markets'>, // Required if status = "renfort" or "meal_box"
  createdBy: Id<'users'>,
  updatedAt: number,
}