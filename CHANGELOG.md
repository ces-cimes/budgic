# Changelog

Completed work from the features and data-integrity tracks. Most recent at top. Deep data-handling rationale lives in [`docs/informational/dirty-data-strategy.md`](./docs/informational/dirty-data-strategy.md).

---

## July 2026 — V1 scope decisions

- [x] **V1 scope analysis** — feature audit, market analysis, and simplification decisions documented.
- [x] **Recovery mode detached** — auto-classifier disabled, suppression rules removed, dedicated UI removed. Manual toggle replaces auto-detection. Code kept, not deleted.
- [x] **Fees & Accounts narrowed** — stripped optimization/recommendation logic, narrowed to display-only (fee risks, utilisation, interest paid).
- [x] **Import restructured** — restructured as extensible import path (Money Manager is one source among future possibilities).
- [x] **Alert escalation rule** — added rule for repeated Low alerts to surface beyond inline-only placement.
- [x] **V1 scope expanded** — pulled in: alert snooze (FEAT-7), periodic auto-generated reports (FEAT-13), dependency system UI (FEAT-14). AI integration scoped as V1 (FEAT-15/16/17): BYO API key, chat surface with read-only analysis, local model path.
- [x] **AI integration added to V1** — minimal scope: BYO API key setup, chat surface (read-only), local model path. Tool-calling and proactive nudges deferred to post-V1.
- [x] **Checklists updated** — 3_FEATURES.md and 2_FOUNDATIONS.md reorganized around V1 scope. New features: Allowance explainer, Debt payoff simulator, Backup verification, Global search, AI integration (3 items). New foundation: FD-13 (AI service layer and kill switch).
- [x] **Monetization decision** — donation-only, ungated, no AI monetization.

---

## June 2026 — Feature completion (Milestone G, partial)

- [x] **Insights: rename Optimize tab → Fees & Accounts** — tab label, header copy, `?tab=fees-accounts`; update deep links and nav config.
- [x] **Fees & Accounts: reframe optimization simulator** — explicit copy that schedule does not change the plan until user applies.
- [x] **Fees & Accounts tab: credit utilisation card** — `creditUtilizationService` wired; utilisation vs target, colour-coded.
- [x] **Fees & Accounts tab: interest opportunities card** — `interestOptimizationService` wired; estimated annual gain.
- [x] **Fees & Accounts tab: spending vs budget suggestions** — categories with room to redirect to goals/savings.

---

## May 2026 — Milestone F: Recovery arc (complete)

**Gate:** recovery-arc milestone review signed off.

- [x] **Financial state classifier** — `financial-state-classifier.ts`: evaluates data → `{ state: 'normal' | 'tense' | 'recovery', signals: string[] }`.
- [x] **State persistence and manual toggle** — `recoveryModeActive` / `recoveryModeDeclined` on `UserPreferences`; Settings toggle.
- [x] **Prompted activation UI** — `RecoveryModePrompt.svelte`: dismissable prompt on first recovery detection.
- [x] **Home: recovery horizon card** — weekly surplus, projected clearance date, visual progress bar.
- [x] **Plan → Allowance: recovery section** — active obligations, weekly surplus, trade-off line, tier-lock visualisation.
- [x] **Feature suppression in Recovery mode** — lifestyle hints suppressed, non-essential cards hidden, badge notifications filtered.

## May 2026 — Milestone E: Polish, consistency, home alignment (complete)

### Behaviour fixes & MVP-adjacent

- [x] **Route-level error boundary** — `+error.svelte` + `RouteErrorDisplay.svelte`; inline errors on Insights and Reports.
- [x] **Alert badge count groups by cluster** — badge matches panel grouped view, not raw insight count.
- [x] **Autocomplete: filter by transaction type and status** — suggestions scoped to matching type/status.
- [x] **Reconciliation UX overhaul** — auto-reconcile on creation, skip-for-now, history in DialogDrawer, discrepancy copy tightened.
- [x] **Transaction form: auto-fill date as `now()`** — default date on new entries.
- [x] **Bell panel: viewport-dwell auto-read** — IntersectionObserver marks read on dwell.
- [x] **Fix duplicate bell icon in nav store** — insights → `sparkles`, alerts stays `bell`.
- [x] **Alerts pass: panel-tier CTA audit** — missing action URLs, human-readable fee titles, deep link updates.
- [x] **Home: Needs attention — Critical + High (grouped)** — panel-tier unread, grouped rows.
- [x] **Week start preference** — `userPreferences.weekStartsOn`; wired to Plan, spending pace, analytics.
- [x] **Home: spending pace widget** — week spent vs planned status line.
- [x] **Home: goals snapshot sorted at-risk first** — `sortGoalsForHomeSnapshot`.
- [x] **Transactions: month filter vs Home "Recent"** — auto-snap to latest month with activity.
- [x] **TransactionList fills viewport height** — flex layout fix.
- [x] **Transaction list: dynamic left label** — full date in multi-day groups.
- [x] **Fix grouped split row double border** — single border treatment.

### Visual & structural polish

- [x] **Remove legacy redirect routes** — settings/occasions, sidebar, security, data; accounts/reconciliation.
- [x] **Standardise loading states on Skeleton** — 22+ files migrated.
- [x] **Shared EmptyState component** — 32 call sites migrated.
- [x] **Settings: consistent back-button behaviour** — all drill-in pages have back affordance.
- [x] **Document overlay decision rule** — Dialog vs DialogDrawer vs ResponsivePanel vs Drawer.
- [x] **Patterns tab tier buttons on mobile** — min-h-11, text-xs, 2-col grid.
- [x] **Accounts list: compact mode** — collapsible type headers, auto-compact at 6+ accounts.

### Home allowance visual

- [x] **Home: tier-coloured segmented allowance bar** — `AllowanceSummary.svelte` + `TierSegmentedAllowanceBar.svelte`.

### Product coherence — guidance, onboarding, checklist

- [x] **Guidance + detail preferences** — `guidanceTone`, `explanationDetail` on `UserPreferences`; onboarding + Settings.
- [x] **Remove maturity-based feature gating** — all users see same nav/tabs.
- [x] **Onboarding vs Home checklist — task split** — onboarding: identity/currency/theme/guidance/import; checklist: account/transactions/budget/allowance review.
- [x] **Home checklist → post-complete suggestions** — non-blocking suggestions keyed off guidance/detail.
- [x] **Guidance prefs: wire remaining coachmarks & nudges** — critical alerts coachmark, Plan classify nudge.
- [x] **Guidance prefs: split nudges** — goal-precision and post-add split wired to presentation prefs.
- [x] **Guidance prefs: decouple behavior maturity score** — analytics-only scoring separated from user-facing prefs.
- [x] **Remove deprecated `userMaturityLevel` pref** — db v33 migration.

## May 2026 — Milestone D: Allowance rewrite (complete)

- [x] **`computeDailyAllowance`** — tier-attributed, household-level daily spending number; replaces 60/30/10 buckets.
- [x] **Remove 60/30/10 buckets** — `AllowanceVisualization` rewritten with lifestyle remaining + pace indicator; per-category rollover/envelope/negative allowance.
- [x] **Scope allowance card to Plan page / Overview** — account detail gets `AccountPaceCard` instead.
- [x] **Fix `projectedBalance` understatement** — actual spend used when overspent.
- [x] **Fix per-account FX currency label** — returns main currency, not account currency.
- [x] **Wire savings hint context** — `getSavingsHintAllowanceContext` suppresses lifestyle hints when at floor.
- [x] **Golden tests** — multi-account FX, lifestyle-at-floor, mixed periods, split attribution parity.
- [x] **Performance on large DBs** — single-pass `aggregateSpendingForCategoryIds`; synthetic 5000-tx bench under 2s.

## May 2026 — Milestone C: Person ledger accounts (complete)

- [x] **Phase A: Schema and prefs** — `people` store, `reimbursement.personId`, `Account.ledgerRole`, `defaultReimbursementAnchorAccountId`, automation tags, `personMigrationBatches`.
- [x] **Phase B: Close person ledger** — `migration-apply.ts` / `migration-rollback.ts`, `PersonLedgerMigrationWizard` (single total + forgive modes).
- [x] **Phase C: Guided history rewrite** — migration inference proposals, guided review UI, Plan reimbursement display, wizard UX polish.
- [x] **Phase D: Automatic mode** — threshold config, pre-commit summary, same batch manifest + apply/rollback.
- [x] **Phase E: Import surfaces** — post-import close wizard on `/data`, import account review, importer flag rename, interim person ledger accounts, currency review create missing currencies.
- [x] **Phase F: Import without durable person wallet** — direct-route to anchor + reimbursements, re-import via `externalKeys`.

## May 2026 — Milestone B-Split: Transaction split unification (complete)

- [x] **Phase 1: Canonical read model** — `transaction-split.ts` resolver, golden tests, `category-utils.ts` delegation.
- [x] **Phase 2: Learning & totals correctness** — merchant one-observation-per-split, `deduplicateForSpendTotals`, prediction multi-category attribution.
- [x] **Phase 3: Write model & unified UI** — `persistSplit` + hydration, `SplitEditor.svelte`, list split affordance, retrospective apply.
- [x] **Phase 4: Import & proactive linking** — import boundary docs, post-add split suggestion modal.
- [x] **Phase 5: Hardening** — prediction attribution after dedup, `persistPartitionedUpdate` sync, rounding drift fix, exact→approximate confirm.

## May 2026 — Milestone B: Patterns intelligence (complete)

- [x] **Fix spurious recurring group detection** — `TransactionSimilarityEngine` multi-dim clustering via `clusterTransactions`; cache key `canonical:v2`.

## May 2026 — Milestone A: Quality, tests & CI (complete)

- [x] **Vitest + component testing setup** — `happy-dom`, `@testing-library/svelte`, coverage v8, smoke tests, CI workflow.
- [x] **Merchant profile test infrastructure** — pure Welford module + tests.
- [x] **Expanded passive-account-service tests** — anchor projection, compounding, sheet opening balance.
- [x] **Update Balance classification tests** — pure helper extracted.
- [x] **`npm run lint` / Prettier clean** — 58 files formatted, ESLint fix.
- [x] **`npm run check` clean** — 17 errors in 7 files fixed (recurring cache type, person-ledger typing, declaration order, typing fixes).
- [x] **Vitest stabilization** — dependency-tracking, fee-avoidance, behavioral-analysis, autocomplete tests stabilized.
- [x] **`vitest run` in CI** — full suite 293 passed.

---

## May 2026 — Features

### May 22, 2026 — Close person account (Dexie)

- [x] **Person ledger migration apply/rollback** — Confirming _Close person account_ no longer throws Dexie “Transaction committed too early”: apply and rollback use direct `db.*` writes inside the transaction (not `transactionService` / `accountService`, which touch other stores and async side effects); account balance recalculation runs after the transaction commits.  
       → [`migration-apply.ts`](src/lib/core/services/person-ledger/migration-apply.ts) · [`migration-rollback.ts`](src/lib/core/services/person-ledger/migration-rollback.ts) · [`migration-apply.test.ts`](src/lib/core/services/person-ledger/migration-apply.test.ts)

### May 21, 2026 — Server backup restore (PWA)

- [x] **Restore prompt loop fix** — `restoreFromServerIfEmpty` runs once per page load; Cancel persists `budgic_server_restore_declined`; interrupted dialog (reload during `confirm`) treated as decline; at most one post-restore `location.reload()` per session.  
       → [`backup-sync-service.ts`](src/lib/core/services/import-export/backup-sync-service.ts) · [`+layout.svelte`](src/routes/+layout.svelte)

- [x] **Server backup read** — `GET /api/backup/latest` scans all `*.json` per device folder (not only `latest.json`); prefers newest backup with accounts or transactions; cross-device fallback under `BACKUP_DIR`; **404** includes `diagnostics` (`filesScanned`, `maxAccounts`, `maxTransactions`).  
       → [`backup-read.ts`](src/lib/server/backup-read.ts) · [`api/backup/latest/+server.ts`](src/routes/api/backup/latest/+server.ts) · [`backup-payload-utils.ts`](src/lib/backup/backup-payload-utils.ts)

- [x] **Empty backup guards** — client `pushBackupToServer` no-op when local DB empty; server `POST /api/backup` skips overwriting a good backup with an empty payload; restore only offered when `backupHasUserData`.  
       → [`backup-sync-service.ts`](src/lib/core/services/import-export/backup-sync-service.ts) · [`api/backup/+server.ts`](src/routes/api/backup/+server.ts)

- [x] **Full reset + restore state** — `resetAutoRestorePromptState()` after Data → _Full reset_ so restore can be offered again after intentional wipe.  
       → [`data/+page.svelte`](src/routes/data/+page.svelte)

- [x] **Backup sync init** — `initBackupSyncOnce()` registers Dexie hooks once (avoids duplicate hooks on remount).  
       → [`backup-sync-service.ts`](src/lib/core/services/import-export/backup-sync-service.ts)

- [x] **Tests** — `backup-sync-service.test.ts`, `backup-read.test.ts`, `backup-payload-utils.test.ts`.

### May 21, 2026 — B-Split Phase 5 (hardening)

- [x] **B-Split Phase 5** — Post-review fixes before Milestone C: `expandForCategoryAttribution` + prediction multi-category regression; `persistPartitionedUpdate` member sync (create/delete rows); `allocateSignedAmounts` primary absorbs drift; Exact→Approximate confirm on partitioned edit; optional ReviewSession/goal-precision via `persistSplit`.  
       → [`transaction-split.ts`](src/lib/utils/transaction-split.ts) · [`prediction-service.ts`](src/lib/core/services/analytics/prediction-service.ts) · [`split-persist.ts`](src/lib/utils/split-persist.ts) · [`SplitEditor.svelte`](src/lib/components/transactions/SplitEditor.svelte)

### May 18, 2026 — Import

- [x] **Import: split detection** — Post-MM-import: flag same-account rows within ~10 min with similar description (Jaccard ≥0.5) or same category; tag `importQuality.splitCandidateGroupId`. Review at `/data?tab=review`: picker card (±10 min pool, checkboxes, live %), confirm → in-place hard split (`groupId`, exact multi-category when needed); dismiss sets `reviewDismissed`. Perf: single `getImportReviewSnapshot()` scan + indexed account pools; local queue patch on action (no full reload). List/edit: group click opens master member id; add page shows all parts; expanded list categories + `Split (N categories)` label. Hardened undefined-tx guards in autocomplete/budget snapshots.  
       → `import-split-detect.ts` · `import-split-link-service.ts` · `data-quality-service.ts` · `money-manager-importer.ts` · `ImportSplitReviewCard.svelte` · `data/+page.svelte` · `transactions/+page.svelte` · `transactions/add/[...id]/+page.svelte` · `TransactionItem.svelte` · `TransactionList.svelte` · `autocomplete-service.ts` · `budget-service.ts`

- [x] **SQLite file import** — accept a raw `.sqlite` file; fingerprint schema on open; if recognized as Money Manager schema, route through existing MM importer pipeline; surface as alternative to JSON export flow on `/data`.  
       → `src/routes/data/+page.svelte` · `money-manager-importer.ts` · `mm-sqlite-reader.ts` · `import-source-detector.ts`

- [x] **Import: account type inference** — pre-import accounts review (after optional currency review): infer type from `ASSETS.account_type` / `ZDATA` + name heuristics; shadcn type Select + person-account checkbox per new account; user overrides before import; wizard merges pre-flagged person names with post-import activity detection.  
       → `mm-account-type-inference.ts` · `person-account-heuristics.ts` · `money-manager-importer.ts` · `ImportAccountsReviewDialog.svelte` · `data/+page.svelte` · `ImportSummaryScreen.svelte`

### Plan, patterns, import & performance

- [x] **Allowance binding / consistency — analysis complete** — root causes identified, reframe decided; implementation tracked in Milestone D (allowance rewrite).

- [x] **Savings hints from variability** — pure util [`category-savings-variability.ts`](src/lib/utils/category-savings-variability.ts) (CV + headroom, ≥3 months, divergence skip); `predictionService.getSavingsVariabilityCategoryRows()` + `insightsService` emits `savings_opportunity` insights (per-category for Budget inline badges + overview); floor v1 = survival excluded + headroom/prefs slack + `predicted > budget×1.15` excluded.  
       → [`category-savings-variability.ts`](src/lib/utils/category-savings-variability.ts) · [`prediction-service.ts`](src/lib/core/services/analytics/prediction-service.ts) · [`insights-service.ts`](src/lib/core/services/analytics/insights-service.ts) · [`BudgetTab.svelte`](src/lib/components/budget/tabs/BudgetTab.svelte)

- [x] **Patterns tab + Allowance: performance on large DBs** — **Instrumentation (dev):** [`plan-perf-debug.ts`](src/lib/utils/plan-perf-debug.ts) — `planAllowanceCache` hit/miss, week-annotation lookup + `detectPatterns(365,3)` ms, `transactions:snapshot` hit/miss (prediction + autocomplete), recurring canonical tier (memory / IndexedDB / cold / coalesced). **Queries:** `analyzeSpendingPatternsAsync` uses indexed `clearedDate` range; Phase8 metrics use ~4-month `clearedDate` slice; Patterns tab drops `getAllTransactions()` in favour of `getTransactionsByDateRange` + earliest-cleared `orderBy('clearedDate').first()`; `getPhase8PatternsSurfaceMetrics` avoids duplicate `detectPatterns(120,3)`; recurring RTI unchanged.  
       → [`plan-perf-debug.ts`](src/lib/utils/plan-perf-debug.ts) · [`plan/+page.svelte`](src/routes/plan/+page.svelte) · [`prediction-service.ts`](src/lib/core/services/analytics/prediction-service.ts)

- [x] **Patterns tab: mobile UX** — List: one tappable row per pattern (opens sheet); tier as small badge via [`recurring-tier-presets.ts`](src/lib/insights/recurring-tier-presets.ts); direction glyphs `aria-hidden` + `sr-only`. Sheet: budget tier = shadcn `Button` (`variant="outline"`, `size="sm"`) with tier colours; writes through [`apply-recurring-pattern-waterfall-tier.ts`](src/lib/core/services/analytics/apply-recurring-pattern-waterfall-tier.ts).  
       → [`PatternsTabContent.svelte`](src/lib/components/insights/PatternsTabContent.svelte) · `RecurringPatternSheet.svelte`

- [x] **Reconciliation: badge instead of inline alert** — Data nav badge via `accountNeedsReconciliationAttention`; account detail row replaced with neutral "Open in Data"; Data tab: auto-reconcile shortcut `performAutomaticReconciliation` using `getLedgerBalance`.  
       → [`navigation-store.svelte.ts`](src/lib/stores/navigation-store.svelte.ts) · [`accounts/[id]/+page.svelte`](src/routes/accounts/[id]/+page.svelte) · [`DataReconciliationTab.svelte`](src/lib/components/data/DataReconciliationTab.svelte)

- [x] **Import: currency detection in wizard** — Pre-import heuristic maps MM currency UIDs to Budgic currencies; `ImportCurrencyReviewDialog.svelte`; import wizard gated by ≥3 unclassified txs and unclassified spend share > 20%.  
       → [`mm-currency-review-detect.ts`](src/lib/core/services/import-export/mm-currency-review-detect.ts) · [`money-manager-importer.ts`](src/lib/core/services/import-export/money-manager-importer.ts) · [`src/routes/data/+page.svelte`](src/routes/data/+page.svelte)

- [x] **Import: reimport merge strategy** — `skip | replace | merge` branch on `mmUid` match; merge policy: import owns amount/date/FX; user owns category/notes/tags/status; optional conflict list in import report.  
       → `money-manager-importer.ts` ~line 698

- [x] **Import: partial data clear** — _Clear transaction data_ and _Full reset_ presets on `/data`; shared logic in [`data-reset-presets.ts`](src/lib/core/data-reset-presets.ts); dev `clearAllData()` delegates to full reset + reseed.  
       → [`src/routes/data/+page.svelte`](src/routes/data/+page.svelte) · [`data-reset-presets.ts`](src/lib/core/data-reset-presets.ts)

---

## April 2026 — Data integrity

### Import wizard & automation (data-handling phase 4)

- [x] **Import Wizard** — post-import flow for > 20% unclassified spend; 4 screens: summary → essential candidates → uncertain patterns → payoff

- [x] **Essential detection classification candidates** — ranked by allowance impact; uses `TransactionSimilarityEngine`

- [x] **Person account migration prompt** — post-import: surface transactions from person accounts for reimbursement tagging or gift classification

- [x] **Automation noise heuristics** — round-up pair detection + daily micro-interest aggregation at import

### Data hub & review queue (data-handling phase 3)

- [x] **`/data` route** — promoted from `settings/data`; nav `group: 'more'`; sections: Import, Review Queue, Corrections Log, Export  
       → [`data-quality-ux.md §A /data Route`](docs/informational/data-quality-ux.md)

- [x] **Review queue** — Edit / Confirm / Dismiss actions on `importQuality`-flagged rows  
       → [`data-quality-ux.md §A /data Route`](docs/informational/data-quality-ux.md)

- [x] **Post-import summary screen** — count of clean / inferred / zero-amount rows; link to review queue

- [x] **Move reconciliation to `/data`** — nav badge via `countKey: 'reconciliation'`; coral banner removed from accounts; double-counting bug fixed  
       → [`data-quality-ux.md §Route-Level Tensions`](docs/informational/data-quality-ux.md)

- [x] **`DataCorrection` record type** — Dexie table + immutable audit log; wired from transaction updates, reconciliation, automation

### Allowance confidence & ambient UX (data-handling phase 2)

- [x] **Allowance confidence score + range display** — `AllowanceConfidence` tiers in `getBudgetSummary()`; range band in `AllowanceVisualization.svelte` when not high confidence  
       → `budget-service.ts` · `AllowanceVisualization.svelte`

- [x] **Temporal boundary on Plan week view + cash flow chart** — today→future seam; solid historical + dashed projected segments  
       → [`data-quality-ux.md §Route-Level Tensions`](docs/informational/data-quality-ux.md)

- [x] **Distinguish predicted vs manual budget amounts** — allowance vs planned-transaction copy clarified on Home/Plan  
       → [`data-quality-ux.md §Route-Level Tensions`](docs/informational/data-quality-ux.md)

- [x] **Ambient quality dot on transaction rows** — `importQuality` dot + inline notes on edit; banner links to `/transactions?quality=flagged`

- [x] **"Suggested" chip on autocomplete fields** — muted pill across description, amount, category, date, transfer, notes, tags, merchant split  
       → [`data-quality-ux.md §Ambient Signals`](docs/informational/data-quality-ux.md) · `transactions/add/[...id]/+page.svelte`

- [x] **Patterns tab: confidence progress bar** — `% classified` block; tap opens classification flow  
       → `PatternsTabContent.svelte`

- [x] **Pattern tier assignment from patterns tab** — `applyPatternTier` sets `waterfallTier` on category + pattern  
       → `PatternsTabContent.svelte`

- [x] **Per-card confidence dots on recurring patterns** — 1/2/3 dots by `calculatePatternConfidence`; capped/omitted on unconfirmed data  
       → [`data-quality-ux.md §Ambient Signals`](docs/informational/data-quality-ux.md) · `recurring-transaction-intelligence-service.ts`

- [x] **Suppress low-data insights labels** — trend direction gated on data volume; Reports Highlights footnote weight  
       → [`data-quality-ux.md §Ambient Signals`](docs/informational/data-quality-ux.md)

### Foundational data model (data-handling phase 1)

- [x] **Add `unclassified` waterfall tier** — excluded from analytics tiers; tier chips in Patterns tab  
       → `db.ts`

- [x] **Change importer default: Lifestyle → Unclassified** — MM import + manual add use uncategorized categories  
       → `money-manager-importer.ts` · `category-utils.ts` · `transactions/add/[...id]/+page.svelte`

- [x] **Add `importQuality` metadata tagging** — `amountInferred`, `dateInferred`, `currencyFallback` on import  
       → `db.ts` · `money-manager-mapper.ts`

- [x] **Add `automation` tag infrastructure** — enum + DO_TYPE 7/8 routing + post-import `automation-detector`  
       → `db.ts` · `money-manager-importer.ts`

- [x] **Unify outlier/duplicate detection** — shared `DataQualityUtils` across insights, learning, recurring, reconciliation

### Before MVP (Phase 0)

- [x] **Fix insights trend sort** — `amounts` reordered with `sortedDates`  
       → [`dirty-data-strategy.md §4`](docs/informational/dirty-data-strategy.md) · `insights-service.ts`

- [x] **Fix `autoResolveSmallDiscrepancy`** — direct balance update + `balanceAdjustmentApplied`; no adjustment transaction  
       → `reconciliation-service.ts`

- [x] **Remove `suggestedAction: 'create_transaction'`** — schema allows only review/adjust/modify/ignore/investigate  
       → `db.ts`

---

## April 2026 — Features

### Currency, budgets & allowance semantics

- [x] **Retire `allowance-utils.ts`** — logic moved to `allowance-calculation.ts`; re-exported from `budget-service.ts`; file deleted.  
       → `src/lib/core/services/core/allowance-calculation.ts`

- [x] **Remove Occasions model** — v29 drops `occasions` table; removed service, `OccasionsCard`, analytics export, planning-service adjustment; `OverviewTab` updated.  
       → `db.ts` v29

- [x] **Plan page: loading/refreshing UX** — Budget and Goals tabs gated by `isPlanDataLoading` skeletons.  
       → `plan/+page.svelte`

- [x] **Reimbursement netting in category spend** — `calculateCategorySpending` takes `reimbursementMode`; optimistic proportional netting matches confidence loop.  
       → `budget-service.ts`

- [x] **Category spend vs budget period** — `Category.budgetPeriod` (`monthly`|`weekly`|`biweekly`); v29 migration; `getCategoryBudgetPeriodStart` + per-category window in `calculateCategorySpending`.  
       → `budget-service.ts`

- [x] **Missing FX pairs** — `exchange-rate-service.convertAmountWithQuality` + stale DB fallback; category rows show `~` + tooltip; raw pair shows amber badge.  
       → `exchange-rate-service.ts` · `budget-service.ts`

---

## Early 2026 — Features

### Category splits & UX

- [x] **Sheet audit** — `DialogDrawer` extended (`sheetSideDesktop`, `sheetContentClass`); migrated: `FilterSheet`, `CurrencySelectionSheet`, `UpdateBalanceSheet`, `AutomationAggregationCard`, add-transaction currency, `settings/currency` drawers.  
       → [`UX_SPEC.md`](docs/informational/UX_SPEC.md)

- [x] **Category picker in quick-add** — unified `SearchableSelect` (blend-score ranked, budget chips); `CategoryTreePicker` removed; soft-split picker via `DialogDrawer` (was previously broken).

- [x] **Transaction form: audit soft split + exact split flows** — "+ add another category" opens picker sheet; presets enlarged; custom split uses ±5% steppers; split block under description with sticky bottom.

- [x] **Goal-relative precision nudge after save** — Part 5: `Goal.linkedCategoryIds` + `DialogDrawer` nudge after single-category cleared expense; composite dismissal key; `merchantProfileService.applyNegativeCategoryHint` on No.

### Deferred items shipped early (splits, calculator)

- [x] **3- and 4-way category splits** — `splitExtras: { categoryId, weight }[]`; primary weight is residual; slider for two categories, ±5% steppers for three–four; cap four total; helpers in [`soft-split-extras.ts`](src/lib/utils/soft-split-extras.ts).

- [x] **Calculator dialog** — mobile amount entry.
