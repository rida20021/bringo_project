# Report Schema — TikTak Express Daily Workbook

> Fixture document created for **Milestone 0 — Task 0.2.9** (Report Schema Verification).
> Source workbooks analyzed: `Rapport_TIKTAK_2026-10-25.xlsx`, `Rapport_TIKTAK_2026-10-24.xlsx`.

## 0.2.1 — Files located

- Primary: `/home/ader/bringo-cash-recon/data/Rapport_TIKTAK_2026-10-25.xlsx`
- Copy: `/home/ader/Downloads/Rapport_TIKTAK_2026-10-25.xlsx` (identical content)
- Secondary: `/home/ader/Downloads/Rapport_TIKTAK_2026-10-24.xlsx`

## 0.2.2 — Sheet & header structure

- Single worksheet named `Sheet1` in all analyzed files.
- 9 columns, exact header row (row 1, plain strings):

| # | Header | Observed cell type (exceljs) |
|---|--------|------------------------------|
| 1 | `delivery_date_end` | date |
| 2 | `number` | number (integer, e.g. `458523`) |
| 3 | `payment_method` | string (`cash` / `card` / `online_payment`) |
| 4 | `store_internal_name` | string |
| 5 | `store_external_id` | number (integer, e.g. `63`) |
| 6 | `company` | string (`TikTak Express`) |
| 7 | `shipping_method` | string (`bringo`) |
| 8 | `shopper_name` | string (rider name) |
| 9 | `Total` | number (decimal, e.g. `375.04`) |

- All required headers present; no missing columns in either file.
- Column order is fixed and must not be guessed from changed reports.

## 0.2.3 — Dimensions, rows, quirks

- `Rapport_TIKTAK_2026-10-25.xlsx`: max row `298`, max column `9`; **297 data rows** (row 1 = headers).
- `Rapport_TIKTAK_2026-10-24.xlsx`: max row `299`, max column `9`; **298 data rows`.
- No merged cells, no auto-filter, no hidden rows detected in the parsed models.

## 0.2.4 — `payment_method` values

Only the three approved values were observed (file `2026-10-25`):

- `cash`: 94 rows
- `card`: 86 rows
- `online_payment`: 117 rows

## 0.2.5 — Rider names (`shopper_name`)

- Distinct `shopper_name` values: **53** in `2026-10-25` (297 orders).
- Names are inconsistently cased/spaced (e.g. `Ibrahim CHERKI`, `knine Idris`, `Aymane bouhaddou`, `AYMEN DOUIEB`) — canonicalization/alias handling required.
- Store names also show encoding artifacts (e.g. `Carrefour Gourmet VÃ©lodrome`, `Carrefour Market Sable dâor`) that require normalization.

## 0.2.6 — Command ID (`number`) uniqueness

- Unique within each file (297 unique / 297 rows in `2026-10-25`; 298 unique / 298 rows in `2026-10-24`).
- No cross-file overlaps observed.

## 0.2.7 — `delivery_date_end` formats & timezone

- Single delivery date per file: `2026-10-25` and `2026-10-24` respectively (Excel date cells).
- Interpreted by exceljs as UTC midnight of the reported date.
- Business timezone: **Africa/Casablanca** (UTC+1) — delivery dates must be grouped in local time.

## 0.2.8 — `Total` column

- Numeric, finite, non-negative; max 2-decimal precision (e.g. `40.85`, `1705.99`).
- Floating-point summation artifacts observed (e.g. `24843.81000000001`) — use integer centimes / fixed-precision math.

## 0.2.10 — Sanitized fixtures

- `tests/fixtures/report-2026-10-25.sanitized.json`
- `tests/fixtures/report-2026-10-25.sanitized.csv`

Both contain the original column structure with `shopper_name` replaced by stable
sanitized rider keys (`rider_1`, `rider_2`, …) and dates normalized to `YYYY-MM-DD`.
