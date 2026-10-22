# Data Quality: UX & Route Architecture

**Status**: Living UX reference (core surfaces shipped — May 2026)  
**Companion to**: [`dirty-data-strategy.md`](./dirty-data-strategy.md)  
**Date**: April 2026  
**Shipped work:** [`CHANGELOG.md`](../../CHANGELOG.md)

---

## The Idea

The data boundary concept (stored fact vs inferred output vs corrected record) shouldn't exist only in the service layer. It should be quietly legible throughout the UI — not with heavy labels or alarming badges, but through _texture_. The user should develop an ambient sense of "the app is confident about this" vs "the app is making its best guess here" without ever being made to feel anxious about it.

Two related observations:

1. **A dedicated `/data` route** would make the boundary between _managing your records_ and _viewing your finances_ a first-class thing — instead of import/export being an awkward tab buried in settings.

2. **Small, ambient signals** across existing routes (transactions, insights, plan) can communicate data quality without interrupting flow.

---

## A `/data` Route (shipped)

**Primary hub:** `/data` with tabs `import` · `export` · `review` · `reconcile` · `corrections` (see [`src/routes/data/+page.svelte`](../../src/routes/data/+page.svelte)). `settings/data` redirects here.

Data management is separate from settings — it curates the records the app reasons from. Sections:

### Import

The MM CSV wizard, extended with the post-import summary described in the strategy doc: rows that came in clean, rows that had fallbacks applied, and a direct link to the flagged review queue.

### Review Queue

Transactions that arrived with low confidence values — inferred dates, zero amounts, ambiguous currencies, suspected duplicates. The user doesn't have to review these before the import completes; they land here and can be addressed whenever. Each item shows: what was inferred, what the original source value was, and a simple action (confirm / correct / dismiss).

This is the UI manifestation of the `importQuality` metadata concept. The queue badge on the route nav can show count, but only if items are there — it shouldn't nag.

### Corrections Log

An audit trail of every programmatic mutation: reconciliation adjustments, user corrections from the review queue, any future automation. Shows the before/after and the source. This is the UI surface for the `DataCorrection` record type proposed in the strategy doc. Mostly a reference — you'd only look here if something looked wrong and you wanted to understand why.

### Export

Unchanged.

---

## Ambient Signals Across the App

These should feel like the app being quietly honest, not defensive. The analogy is a weather app: it shows "72°" not "72° ± 5°", but it does show a partly-cloudy icon when it isn't certain — you just absorb it.

### On transaction entries (list + detail)

A **small quality indicator** on the transaction row — maybe a single dot or a slight muting of the amount text — for transactions where one or more fields were inferred during import. Tap/hover reveals a tooltip: _"Date estimated from import time. Tap to review."_

On the transaction detail/edit page itself: a subdued inline note beneath the relevant field. Not an error state — more like a footnote. _"Amount was recorded as 0 — may be a transfer leg or parse failure."_ With a link to the corrections flow.

Transactions entered manually by the user should have no indicator at all — they're clean by definition.

### On the add/edit transaction page

When the system autofills a field (category, description, date) from patterns: a subtle _suggested_ visual — maybe the field value is slightly muted until the user interacts with it, or a small chip that says "suggested" which disappears on edit. This makes the inference visible without requiring the user to do anything about it.

This is different from the import quality case — here the user is actively creating a record, so making suggestions feel like _suggestions_ (not silent assumptions) is important.

### On the patterns tab (`/insights?tab=patterns`)

Each recurring pattern already has a confidence concept internally (amount variance, cadence consistency, history length). This could surface as a simple **confidence bar or dots** (three dots: one lit = tentative, three lit = well-established) beneath each pattern card.

Patterns built from fewer transactions, or with high amount variance, get fewer dots. Patterns with years of clean consistent data get three. No number, no percentage — just a qualitative signal the user can build intuition about over time.

A pattern that includes transactions with quality flags could show a small icon indicating "some source data was uncertain."

### On insights charts and summaries

A **footnote-style disclosure** at the section level, not the element level. Something like: _"3 transactions in this period had low-confidence data and were weighted accordingly."_ Not a warning — just an honest accounting, tucked below the chart. The user can tap it to see which ones if curious.

For **shadow category redistribution** (where the app infers a different category breakdown from merchant profiles): a small label on the affected breakdown — _"includes merchant-inferred splits"_ — with an option to toggle it off. Currently this is a feature flag with no UI surface; making it visible aligns with the "honest uncertainty" philosophy.

### On the plan / budget route

When a budget category's predicted spend is based on sparse or noisy history, the forecast bar or number could be rendered with a slightly less saturated color + an info icon. Hovering: _"Limited history — prediction less certain."_ Categories with rich clean history render in full confidence.

For per-category budget divergence (when predicted spend exceeds budget by >15%): surface as a gentle annotation on the budget line — _"typically ₽X — ₽Y over your budget"_ — rather than the budget showing a spike the user has to mentally explain. Captured as an idea — not yet implemented.

---

## The Underlying Principle

The app knows things at different levels of certainty. It should express that honestly but lightly:

- **High certainty** → display normally, no indicator
- **Inferred / estimated** → display normally, subtle texture (muted tone, footnote, info dot)
- **Flagged / needs review** → display normally, accessible review path (queue, not inline alarm)
- **User-confirmed** → display normally, possibly a small "verified" marker in corrections log

The goal is that after a few weeks of use, the user has developed an intuitive feel for where the app is confident and where it's guessing — without ever being confronted with it.

---

## Related checklist items

Open work that extends this doc:

- **Autocomplete filter by transaction type and status** (Milestone E) — suggestion-confidence; "suggested" chip less authoritative when match is weak
- **Patterns tab tier buttons on mobile** (Milestone E) — compact cards + confidence dots
- **Patterns + Allowance performance verification** (Milestone D) — large-DB load targets; skeleton/"refreshing" pattern where still heavy

---

## Route-Level Tensions

Most routes don't need restructuring — they need the ambient signal layer described above. But three structural clashes exist where the current route organization actively works against the clear-boundaries concept.

### 1. Reconciliation (shipped May 2026)

**Primary surface:** `/data?tab=reconcile` — reconciliation is a data-integrity activity (verify stored records vs external reality), grouped with review queue and corrections log.

**Legacy:** `/accounts/reconciliation` may still exist as a compat route; removal tracked in Milestone E. Account detail and nav entry points deep-link to Data.

**Bootstrap:** New accounts and MM-imported accounts without a prior session get an automatic 0-delta baseline record (`reconciliationType: automatic`) so they do not immediately count as stale. A 7-day grace fallback (`NEW_ACCOUNT_RECON_GRACE_MS`) applies only when bootstrap did not run (never reconciled + recently created).

**Attention split (do not conflate in copy or badges):**

| Term               | Meaning                                                                                                              | Surface                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Balance gap**    | Statement vs cleared-ledger preview in the reconcile form                                                            | Form preview only                                                                                   |
| **Open issues**    | Unresolved `ReconciliationDiscrepancy` rows and/or material gap between ledger balance and `currentBalance`          | Data nav badge count; “Open issues” stat card                                                       |
| **Needs check-up** | No reconciliation session within user cadence (`reconciliationCheckupIntervalDays`, default 30; Settings → Accounts) | Informational stat card; bell insight `reconciliation_due` (severity `warning`), not the Data badge |

**Actions:** Full reconcile · **Skip for now** (0-delta record, `reconciliationType: skipped`) · **Balance matches ledger — mark reconciled** · history in a `DialogDrawer` (embedded list, no duplicate page header).

**Record types:** `manual` · `automatic` · `skipped`.

### 2. Plan mixes fact and inference (partially shipped)

**Shipped:** Allowance week view marks today→future seam; cash flow chart uses solid historical + dashed projected segments with a today boundary marker; predicted vs manual budget copy clarified on Plan.

**Open:** Further tier-coloured allowance bar and recovery-mode transforms (Milestones D, E, F). Per-category divergence callouts (Milestone I).

### 3. Insights conflates confident observations with weak inferences (partially shipped)

**Shipped:** Patterns tab confidence dots and progress bar; suppressed low-data trend labels; Reports Highlights footnote weight; `~` on recurring amounts.

**Open:** Spending pulse card confidence gating; broader extension of confidence signals to Reports/Trends.

### Routes that are fine as-is

- `/transactions` — flat list is correct; ambient quality signals on rows are sufficient
- `/reports` structural tabs — Overview / Trends / Categories / Compare is the right decomposition; the tensions are within sections, not at route level
- `/accounts/[id]` — viewing stored facts about an account; correct home
- `/home` — the mixing of actual + predicted in "This Week" and the cash flow widget is a visual boundary problem, not a structural one; same fix applies as Plan
- Transaction form — structurally correct; the "suggested" chip concept is a signal layer, not a restructure

This is not a "data quality dashboard" with scores, grades, or percentage meters. That framing makes the user responsible for the data quality in a way that feels like work. The framing here is closer to: _the app is honest with you about what it knows, and it makes it easy to fill in what it doesn't — but only when you want to._

The review queue exists, but there's no pressure to empty it. The footnotes exist, but they don't block you from reading the chart. The confidence dots exist, but you don't need to understand them to use the patterns tab.

Uncertainty is ambient, not alarming.
