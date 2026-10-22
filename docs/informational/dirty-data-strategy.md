# Dirty Data: Strategy Analysis

**Status**: Canonical strategy reference (Phases 0–4 implemented — May 2026)  
**Scope**: Import pipeline, input validation, analytics layer  
**Date**: April 2026  
**Shipped work:** [`CHANGELOG.md`](../../CHANGELOG.md) (data integrity section) · UX surface: [`data-quality-ux.md`](./data-quality-ux.md)

---

## The Core Tension

There are two philosophically distinct ways to deal with imperfect financial data:

**Approach A — Infer**: Leave the data as-is; build analytics that are robust enough to produce correct insights despite the noise. The stored record is a faithful (even if dirty) copy of reality.

**Approach B — Fix**: Clean the data at the boundary (import or input) before it enters the database. The stored record is the canonical truth; analytics can be simple because the data is reliable.

The app currently does **both, inconsistently, across different layers** — and this is starting to create compounding problems. This document maps the current state honestly, then proposes a clear path forward.

---

## Current State: What Actually Happens

### Layer 1 — Import boundary (`src/lib/core/services/import-export/`)

The Money Manager CSV importer applies a **light Fix pass** on the way in:

| Dirty scenario                          | What happens                                                                                       |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Malformed CSV rows (wrong column count) | **Dropped silently** — not fixed, not flagged                                                      |
| `IS_DEL` rows                           | **Dropped**                                                                                        |
| Invalid `DO_TYPE`                       | **Defaults to `expense`**                                                                          |
| Unknown account type                    | **Defaults to `checking`**                                                                         |
| Invalid/unparseable amount              | **Defaults to `0`** — silent                                                                       |
| Unparseable date                        | Cascade fallback: `ZDATE → UTIME → WDATE → now()` — **silent**                                     |
| Missing currency                        | Extracted from UID string, then **defaults to `USD` with a warning**                               |
| Duplicate by MM UID                     | **Usually skipped** on re-import; person-ledger rows now have a route-aware exception in MM import |
| Reconciliation adjustments (type 7/8)   | Tags existing transaction as `automation: 'reconciliation-adjustment'` — **mutates stored data**   |

So at the import boundary: some things are silently defaulted (approach B, but lossy), some are skipped (approach B, destructive), and the rest arrive in the DB largely as-is.

**May 2026 update:** Money Manager person-ledger imports are no longer a pure "skip duplicates by MM UID" case. When a reviewed row is marked as a person ledger, re-import now resolves `externalKey -> Person` first; if the previous ledger is `archived_person`, new rows route to anchor-wallet transactions with reimbursements instead of recreating a live person wallet. The older temporary-wallet + later-close flow still exists as fallback when direct route is off or anchor resolution fails.

### Layer 2 — DB write hooks (`src/lib/core/db.ts`)

Dexie validation hooks apply **strict validation** before every write:

- `CurrencyUtils.validateAmount` — rejects invalid amounts (blocks, does not fix)
- `TransactionUtils.validateTransactionDate` — rejects bad date combos
- `TransactionSchema.parse` — Zod coercion is the final gate

This is a hard **Reject** strategy (not Fix, not Infer). Anything that sneaks past Layer 1 and fails here will throw, potentially breaking import mid-run silently.

### Layer 3 — Analytics / intelligence layer

This is where the **Infer** approach dominates — and it's the most complex layer:

| Service                                         | Dirty data handled                                                                           | How                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `recurring-transaction-intelligence-service.ts` | Split payments, noisy descriptions, transfer legs with zero amounts, single-occurrence noise | Synthetic merges (in-memory only), IQR outlier exclusion from averages, description normalization         |
| `insights-service.ts`                           | Miscategorised transactions, unusual amounts                                                 | Shadow category redistribution via merchant profiles (in-memory, not persisted); z-score anomaly flagging |
| `learning-adaptation-service.ts`                | Duplicates, per-category outliers, possibly mis-categorised                                  | Detection and reporting only — no automatic correction                                                    |
| `prediction-service.ts`                         | Sparse or noisy spend history                                                                | Blends forecast with historical average when prediction "looks too low"                                   |
| `autocomplete-service.ts`                       | Inconsistent descriptions                                                                    | Normalization, merchant key inference                                                                     |
| `transaction-similarity-engine.ts`              | Noisy descriptions                                                                           | Token normalization for clustering                                                                        |

All of these operate on **stored data without changing it**. They produce insights despite dirtiness. This is genuine Approach A — and when done well, it's valuable.

---

## The Problems With Mixing Both

### 1. Inconsistent outlier definitions

Three different outlier heuristics exist independently:

- `insights-service.ts` `detectAnomalies`: **global 2σ** across all expenses
- `learning-adaptation-service.ts` `detectOutliers`: **3σ per category**
- `recurring-transaction-intelligence-service.ts`: **IQR** per recurring group

The same transaction can be flagged as an anomaly in one place, a category outlier in another, and a normal data point in a third. There is no shared "data quality judgement" concept — each service invented its own.

### 2. Duplicate detection uses different keys

- `reconciliation-service.ts`: matches on `plannedDate` + `description` + `amount`
- `learning-adaptation-service.ts`: matches on `clearedDate` substring + `description` + `amount`

A transaction with `clearedDate` but no `plannedDate` (common for imported data) may be caught by one and missed by the other.

### 3. Silent defaults at import create invisible corruption

When an amount parses as `NaN` and becomes `0`, or a date falls through to `now()`, the stored record no longer reflects reality. Analytics then try to be "robust" to these values, but they're being robust to data the app itself corrupted during import. This is the worst case: Approach B (Fix) applied badly, then Approach A (Infer) applied on top of the damage.

### 4. Category trend sort fragility

In `insights-service.ts`, `sortedDates` sorts dates correctly but the corresponding `amounts` array is **not reordered** to match. First/second-half trend splits therefore analyse mismatched date–amount pairs when the input data is not already sorted. Noisy or unordered data triggers wrong trend direction conclusions.

### 5. The analytics layer carries too much weight

Because import is permissive (lots of defaulting, no repair), the analytics layer must compensate with increasing complexity: IQR filters, synthetic transaction merges, shadow category redistribution, EMA blending. Each new heuristic adds a new implicit assumption about what "normal" data looks like. Over time this becomes fragile and hard to reason about.

### 6. Reconciliation type 7/8 is the only true data mutation

This is actually an interesting precedent: when MM sends a reconciliation adjustment for an existing UID, the app **rewrites the stored transaction** with an `automation` tag. This is approach B done deliberately. But it's the only place the app does this post-import mutation; there's no consistent framework for "when is it okay to mutate stored data programmatically."

---

## Possible Solutions

### Option 1: Commit to Approach A (Infer Only) — "Faithful Archive"

**Principle**: The database stores exactly what came in; analytics are responsible for producing correct outputs regardless.

**What changes**:

- Import stops silently defaulting. Instead, it stores a `dataQuality` metadata field on each transaction (e.g. `{ amountInferred: true, dateInferred: true, currencyFallback: true }`).
- Analytics read `dataQuality` and exclude or weight those transactions differently.
- Outlier / duplicate detection is consolidated into a single shared utility used by all services.
- The trend sort bug is fixed.
- The user sees a "data quality" indicator on affected transactions rather than silent corruption.

**Pros**: The stored record is honest. You can always re-derive analytics differently. Imported data stays auditable.  
**Cons**: Analytics complexity stays high (or grows). The user has to tolerate seeing "uncertain" labels. Harder to build simple budget projections when the underlying data is noisy.

---

### Option 2: Commit to Approach B (Fix First) — "Clean Canonical Store"

**Principle**: Data entering the DB must be trustworthy. The import boundary is where you invest the cleaning effort.

**What changes**:

- Import becomes a two-phase flow: **parse → review → commit**. No silent defaults; instead, the import wizard surfaces ambiguous/defaulted rows and asks the user to confirm or correct.
- Silent `NaN → 0` and `date → now()` fallbacks are replaced with an **import queue** of flagged rows needing human review before commit.
- Duplicate detection is unified and run pre-commit, with the user presented a "these look like duplicates" UI step.
- Analytics layer can be simplified because it no longer needs to defensively handle corrupt values.

**Pros**: Analytics become reliable and easier to maintain. Insights can be trusted. Budget projections are stable.  
**Cons**: Import is slower and more interactive. Users coming from MM with thousands of rows will face a review step that could be overwhelming. The import wizard needs significant UX work.

---

### Option 3: Layered Approach (Recommended) — "Honest Boundaries"

Neither pure option is perfect for a personal finance app where users have years of historical data from messy sources. The recommendation is to **be explicit about which layer does what**, with clear rules:

#### Boundary: Import layer — Triage, not repair

- Parse faithfully. Do not silently default amounts or dates.
- Tag every inferred/fallback value with structured metadata (`importQuality` field).
- Surface a **post-import summary**: "X rows imported cleanly, Y rows had ambiguous dates (defaulted to import time), Z amounts were zero (possibly transfer legs) — review?"
- Provide a **flagged transaction queue** the user can review later, not blocking the import.

#### Boundary: DB write layer — Validate, never coerce

- Keep the strict Zod validation.
- But ensure the import layer never sends data that _needs_ coercion — i.e., import must resolve all ambiguities before hitting the DB hooks.

#### Boundary: Analytics layer — Infer, but with shared primitives

- Consolidate the three outlier definitions into a single `DataQualityUtils` module with one configurable outlier strategy.
- Duplicate detection uses a single canonical key scheme (agree on `clearedDate` vs `plannedDate` — probably both, with OR logic).
- Analytics Infer within the data it has, but can additionally **read `importQuality` metadata** to weight or exclude poor-quality records.
- Fix the category trend sort fragility.
- Document what each analytics service's "dirty data tolerance" assumptions are (currently undocumented).

#### Post-import mutation — Make it a first-class concept

- Generalise the reconciliation-adjustment pattern into an explicit `DataCorrection` record type: `{ transactionId, field, oldValue, newValue, source: 'reconciliation' | 'user' | 'automation', timestamp }`.
- This creates an audit trail for all programmatic mutations, instead of a single ad-hoc case.

---

## Priority / implementation order (historical)

The hybrid approach below was adopted and implemented through import wizard and automation work (April–May 2026). For completion status, see [`CHANGELOG.md`](../../CHANGELOG.md).

Original suggested order (all shipped):

1. Fix the category trend sort bug in `insights-service.ts`.
2. Replace silent `NaN → 0` and `date → now()` fallbacks with `importQuality` metadata tagging + post-import summary UI.
3. Unify outlier/duplicate detection into shared `DataQualityUtils`.
4. Import wizard for flagged rows; `DataCorrection` audit trail; `/data` hub (review, reconcile, corrections).

---

## Reference: Code Locations

| What                                                | File                                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Silent amount/date defaults                         | `src/lib/core/services/import-export/money-manager-mapper.ts`                                                                                                                     |
| Row skipping logic                                  | `src/lib/core/services/import-export/csv-parser.ts`                                                                                                                               |
| Duplicate skip / person-ledger reroute on re-import | `src/lib/core/services/import-export/money-manager-importer.ts`, `src/lib/core/services/person-ledger/import-routing.ts`, `src/lib/core/services/person-ledger/person-service.ts` |
| Reconciliation mutation                             | `src/lib/core/services/import-export/money-manager-importer.ts` (`importReconciliationAdjustment`)                                                                                |
| DB validation hooks                                 | `src/lib/core/db.ts` (`setupValidationHooks`)                                                                                                                                     |
| Global 2σ anomaly detection                         | `src/lib/core/services/analytics/insights-service.ts` (`detectAnomalies`)                                                                                                         |
| Per-category 3σ outlier                             | `src/lib/core/services/analytics/learning-adaptation-service.ts` (`detectOutliers`)                                                                                               |
| IQR per-group outlier                               | `src/lib/core/services/analytics/recurring-transaction-intelligence-service.ts` (`iqrFilter`)                                                                                     |
| Category trend sort bug                             | `src/lib/core/services/analytics/insights-service.ts` (amounts/dates ordering)                                                                                                    |
| Duplicate key: plannedDate                          | `src/lib/core/services/core/reconciliation-service.ts`                                                                                                                            |
| Duplicate key: clearedDate                          | `src/lib/core/services/analytics/learning-adaptation-service.ts`                                                                                                                  |
| Shadow category redistribution                      | `src/lib/core/services/analytics/insights-service.ts` (`applyShadowCategoryRedistribution`)                                                                                       |
| Prediction blending                                 | `src/lib/core/services/analytics/prediction-service.ts`                                                                                                                           |
