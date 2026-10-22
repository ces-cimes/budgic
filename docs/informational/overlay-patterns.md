# Overlay patterns

**May 2026** — Canonical decision table for Budgic overlay primitives. Product spec summary: [`UX_SPEC.md` §9.6](./UX_SPEC.md#96--overlay-patterns).

Do not add a fifth overlay pattern without updating this doc and [`UX_SPEC.md` §9.6](./UX_SPEC.md#96--overlay-patterns).

## Decision table

| Primitive                | Use when                                                                              | Breakpoint / behaviour                                              | Examples                                                    |
| :----------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------ | :---------------------------------------------------------- |
| `Dialog` / `AlertDialog` | Confirm/cancel, ≤3 fields, blocking decision                                          | Centered modal                                                      | `DeleteConfirmationDialog`, currency reset                  |
| `DialogDrawer`           | Secondary **edit/filter/history** flows; multi-field forms; user may return to parent | md+: Sheet; mobile: bottom Drawer (768px)                           | `FilterSheet`, `UpdateBalanceSheet`, reconciliation history |
| `ResponsivePanel`        | Read-heavy **contextual detail**; light inline actions; parent page stays visible     | Drawer: bottom (mobile) / right (desktop); max ~70vh mobile (640px) | Recurring pattern drill-in (`RecurringPatternPanel`)        |
| Raw `Drawer`             | Full-height or custom-direction panels when shared wrappers don't fit                 | Per call site                                                       | `AlertsPanel`                                               |

## Naming convention

Applies to **overlay wrapper components** only — not inline page sections (e.g. `FeeAvoidancePanel`, `OutstandingReimbursementsPanel` are Card/list regions on a page, not overlays).

| Suffix   | Primitive                                                              |
| :------- | :--------------------------------------------------------------------- |
| `*Panel` | `ResponsivePanel` (read-heavy contextual detail overlay)               |
| `*Sheet` | `DialogDrawer` (edit/filter/history flows) unless documented exception |

Raw `Drawer` overlays may use `*Panel` when the name reflects product language (e.g. `AlertsPanel`) — document in the inventory below.

## Inventory (May 2026 audit)

### `*Sheet` — all use `DialogDrawer` ✓

| Component                     | Primitive      | Rename needed? |
| :---------------------------- | :------------- | :------------- |
| `FilterSheet`                 | `DialogDrawer` | No             |
| `UpdateBalanceSheet`          | `DialogDrawer` | No             |
| `CurrencySelectionSheet`      | `DialogDrawer` | No             |
| `PostAddSplitSuggestionSheet` | `DialogDrawer` | No             |

### `ResponsivePanel` overlays

| Component               | Primitive         | Notes                                           |
| :---------------------- | :---------------- | :---------------------------------------------- |
| `RecurringPatternPanel` | `ResponsivePanel` | Renamed from `RecurringPatternSheet` (May 2026) |

### Raw `Drawer` overlays

| Component     | Primitive    | Notes                                             |
| :------------ | :----------- | :------------------------------------------------ |
| `AlertsPanel` | Raw `Drawer` | Full-height alerts; name matches product language |

### Inline `DialogDrawer` (no dedicated `*Sheet` file)

| Location                             | Flow                   | Optional follow-up                             |
| :----------------------------------- | :--------------------- | :--------------------------------------------- |
| `DataReconciliationTab.svelte`       | Reconciliation history | Extract `ReconciliationHistorySheet` if reused |
| `AutomationAggregationCard.svelte`   | Automation run history | Extract if pattern repeats                     |
| `PersonLedgerMigrationWizard.svelte` | Migration wizard       | `*Wizard` name appropriate — keep              |

### Not overlays — do not rename

`FeeAvoidancePanel`, `LearningAdaptationPanel`, `NextOutflowPanel`, `GoalTradeoffPanel`, `OutstandingReimbursementsPanel`, `TabPanel` — inline page/tab content, not overlay primitives.

### Optional micro-cleanup

- ~~`PatternsTabContent`: `recurringSheetOpen` → `recurringPanelOpen`~~ — done May 2026
- shadcn `ui/sheet/*` — low-level primitive for `DialogDrawer`; not feature-level naming

## Sweep verdict

**No repo-wide `*Sheet` renames required** — four feature sheets already match `DialogDrawer`. Only misname was `RecurringPatternSheet` (fixed). Future work: extract inline `DialogDrawer` blocks only when a second call site appears; avoid renaming inline `*Panel` page sections.

## Implementation references

- [`DialogDrawer.svelte`](../../src/lib/components/shared/DialogDrawer.svelte) — Sheet on md+, bottom Drawer on mobile
- [`responsive-panel.svelte`](../../src/lib/components/ui/responsive-panel/responsive-panel.svelte) — Drawer-only; direction bottom (mobile) / right (desktop)

## Related

- UX principle: context, not context-switch — secondary flows open as sheets/modals rather than navigating away ([`UX_SPEC.md` §1.2](./UX_SPEC.md#12--design-principles))
- Dev heuristic §3 (overlay choice): prefer the lightest primitive that fits the flow.
