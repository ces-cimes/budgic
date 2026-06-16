

**BUDGIC**

UX & Information Architecture Specification

Version 1.0  ·  March 2026

> **May 2026:** Canonical UX spec. Route and surface drift vs code: prefer [`architecture/STRATEGIC_SYSTEM_MAP.md`](./architecture/STRATEGIC_SYSTEM_MAP.md). Shipped data-quality UX: [`data-quality-ux.md`](./data-quality-ux.md) + [`../actionable/CHANGELOG.md`](../actionable/CHANGELOG.md). Page-header back navigation: §9.5. Overlay patterns: §9.6.
>
> **Product decisions (May 21, 2026):** Present zone = **Home only**; allowance three-tier glance model; Insights Patterns = advisory/Past; Optimize tab → **Fees & Accounts**; alerts = **attention-worthy** (Critical+High on Home); ex-maturity → **guidance + detail** (presentation-only, no gating). Full record: [`../analysis/product-coherence-2026-05.md`](../analysis/product-coherence-2026-05.md).

This document captures the complete information architecture, navigation structure, page layouts, component behaviour, and design decisions for Budgic — a unified personal finance application covering past spending, present status, and future planning in a single coherent experience.

**The document is structured as follows:**

* Section 1 — Product Vision & Principles

* Section 2 — Navigation Architecture

* Section 3 — Main Pages (Home, Plan, Transactions, Insights, Reports)

* Section 4 — Transaction Form

* Section 5 — Desktop Layout & Sidebar

* Section 6 — Widget System

* Section 7 — Alerts System

* Section 8 — Onboarding & First-Run Experience

* Section 9 — Global Patterns & Shared State

* Section 10 — Deferred & Open Items

# **1 · Product Vision & Principles**

Budgic exists to replace the two-app setup that financially-aware users currently tolerate: a mobile app for logging past transactions and a spreadsheet for planning future ones. The core promise is that past, present, and future financial data live in one place and actively influence each other.

## **1.1  The Three Temporal Zones**

| Zone | What it answers |
| :---- | :---- |
| Past | What happened? (Transactions, Reports) |
| Present | Am I okay right now? (**Home** — allowance glance, spending pace, urgent alerts) |
| Future | Where is my money going? (Plan) |

Every page in the app belongs primarily to one of these zones. Navigation is designed so the user always knows which zone they are in.

## **1.2  Design Principles**

**Progressive disclosure:** Show the minimum needed. Reveal complexity on demand. The 90% case should never be slowed down by the 10% case.

**Temporal coherence:** Shared date state across pages. The month you are reviewing in Transactions is the same month shown in Reports.

**One bar, not five:** Prefer unified visualisations for things that are parts of a whole. Use parallel bars only when comparing separate things.

**Attention-worthy alerts:** Critical and High alerts (bell and Home) must have one honest next step — in-app deep link when possible, or explicit external instruction (e.g. pay at your bank). Observations that need no attention stay inline (Low tier), not in the bell panel.

**Thumb-first on mobile:** Most-used actions sit at the bottom of the screen. Least-used at the top.

**Context, not context-switch:** Secondary flows (add transaction, filter, edit category) open as sheets or modals rather than navigating away. The user keeps their place.

## **1.3  Target Audience & Guidance (ex-maturity)**

The primary target audience is financially-aware users who want real control. **Guidance** and **detail** preferences (set at onboarding, editable in settings) control **presentation only** — tooltip density, helper copy length, and post-checklist **suggestions**. They do **not** hide tabs, routes, or form fields.

| Preference | Controls (examples) | Does not control |
| :---- | :---- | :---- |
| **Guidance** (tone) | Coachmark frequency, suggestion phrasing | Feature access |
| **Detail** (density) | Tooltips, inline explanations, collapsed sections | Nav items or tabs |

**Implementation note (May 2026):** Shipped May 25, 2026 — `guidanceTone` + `explanationDetail` on `UserPreferences` (db v32); onboarding step 5 + Profile; legacy `userMaturityLevel` mapped on read/upgrade. **No tab or route gating** (Optimize / Fees & Accounts visible to all). Remaining coachmarks/nudges not yet wired to prefs — see [`../actionable/CHECKLIST_FEATURES.md`](../actionable/CHECKLIST_FEATURES.md) Milestone E · **Guidance prefs: wire remaining coachmarks & nudges**.

# **2 · Navigation Architecture**

## **2.1  Route Map**

The complete route hierarchy, annotated with where each destination lives in the navigation system.

/ (Root Layout)

├── /                       Home

├── /transactions            Transactions

│   └── /transactions/add/\[...id\]    Add / Edit (full-screen page)

├── /plan                   Plan

│   Tabs: Allowance | Budget | Goals

├── /insights               Insights

│   Tabs: Patterns | Fees & Accounts (legacy tab id: optimize) | Badges

│

│   \[More drawer / sidebar\]

├── /accounts               Accounts

│   ├── /accounts/\[id\]      Account detail

│   ├── /accounts/add/\[...id\]  Add / Edit account

│   └── /accounts/reconciliation  Legacy compat → /data?tab=reconcile

├── /data                   Data hub (import, review, reconcile, export, corrections)

│   Tabs: import | export | review | reconcile | corrections

├── /reports                Reports

│   Tabs: Overview | Trends | Categories | Compare | Saved

│

│   \[Settings\]

└── /settings

    ├── /settings/profile

    ├── /settings/display

    ├── /settings/currency

    ├── /settings/plan      Allowance rules, waterfall config

    ├── /settings/navigation  Sidebar order, widget rotation

    ├── /settings/notifications

    └── /settings/data

\[Utility routes — no nav chrome, sheet/modal style\]

/accounts/add/\[...id\]

/accounts/reconciliation   (legacy compat → /data?tab=reconcile)

/data?tab=reconcile        (canonical reconcile surface; history in drawer)

/plan/goals/add

/plan/budget/categories/\[id\]

### **Reconcile tab (`/data?tab=reconcile`) — May 2026**

Canonical reconciliation surface (not `/accounts/reconciliation`). Stat cards: **Needs check-up** (cadence informational) vs **Open issues** (actionable). **Data** nav badge counts **open issues only**; overdue check-up surfaces as a **bell** alert (`reconciliation_due`, High/warning tier → `/data?tab=reconcile`). User cadence: Settings → Accounts → reconciliation check-up interval (days, default 30).

| UI term | Meaning |
| :---- | :---- |
| Balance gap | Statement vs ledger in the reconcile form (session preview) |
| Open issues | Unresolved discrepancy records or material ledger vs stored balance gap |
| Needs check-up | No session within cadence — reminder, not a badge driver |

**Skip for now** writes a 0-delta record (`reconciliationType: skipped`). New/imported accounts receive an automatic baseline reconcile so they do not false-trigger attention. Reconciliation history opens in a **drawer** (embedded list; no duplicate page title).

## **2.2  Mobile Bottom Navigation**

Five slots. The fifth slot is always More — a bottom drawer for lower-frequency destinations. The FAB floats above the nav bar, overlapping it, and is not a nav slot.

| Slot | Destination |
| :---- | :---- |
| 1 | Home |
| 2 | Transactions |
| 3 | Plan |
| 4 | Insights |
| 5 | More (drawer) |
| FAB (floating) | Add transaction — opens type picker popover |

### **More Drawer Contents**

| Item | Behaviour |
| :---- | :---- |
| Accounts (tile) | Navigates to /accounts |
| Data (tile) | Navigates to /data (import, review, reconcile, export) |
| Reports (tile) | Navigates to /reports |
| Alerts (row) | Opens alerts panel (does not navigate away) |
| Settings (row) | Navigates to /settings |

**Note:** Profile is not a More drawer item. It is accessible via the avatar in the Home TopBar only.

## **2.3  Desktop Sidebar**

The sidebar replaces the bottom nav on desktop. It has three zones: nav items (top), persistent widget (middle), utility actions (bottom). Default expanded width is 240px. Collapses to icon-only at \~60px.

### **Nav Item Behaviour**

* Top-level items with sub-items (Plan, Insights) are section headers with a chevron on the right. They are not tappable links themselves.

* The chevron toggles sub-item visibility independently.

* Sub-items are the actual navigation targets. Active sub-item is highlighted.

* More is collapsed by default; Accounts and Reports live inside it.

### **Tabs vs Sidebar Sub-items on Desktop**

On desktop, sidebar sub-items and in-page tab bars coexist. They are both views of the same URL-derived state and stay in sync automatically. The tab bar on desktop is styled as a compact pill group in the TopBar of the content area, rather than a full-width tab bar.

## **2.4  FAB & Transaction Entry Point**

The FAB (floating action button) lives bottom-right, overlapping the nav bar on mobile, and bottom-right of the content area on desktop. Tapping it opens a type picker popover before the form.

### **Type Picker Layout (mobile — thumb-optimised, bottom to top)**

| Row (bottom → top) | Contents |
| :---- | :---- |
| Row 3 (bottom, closest to thumb) | Expense (solid red border) | Income (solid green border) |
| Row 2 (middle) | Planned expense (dashed red) | Planned income (dashed green) |
| Row 1 (top, furthest) | Transfer (full width, dotted neutral border) |

Visual encoding: border colour \= transaction type (red \= expense, green \= income, neutral \= transfer). Border style \= status (solid \= cleared, dashed \= planned). Adjustment is not in the picker — it is accessible inside the form via the type dropdown.

# **3 · Main Pages**

## **3.1  Home — "How am I doing right now?"**

The daily anchor. Serves three visit modes: quick glance (30 seconds, no scroll), morning check-in (1–2 minutes, light scroll), post-transaction confirmation (navigated to after logging something).

### **Layout — top to bottom**

▌ **TOPBAR**

* Left: App name / logo

* Right: Avatar (taps to Profile) \+ Bell icon (opens alerts panel)

▌ **HERO CARD (ABOVE FOLD)**

* Greeting with time-aware label (Good morning / afternoon / evening, \[name\])

* Total balance — large number, taps through to /accounts

* Allowance bar — segmented, one bar, tier colours filled left to right, muted remainder. See Section 3.1.1 for bar states.

* Allowance label: "£X remaining · £Y daily allowance"

▌ **NEEDS ATTENTION (CONDITIONAL)**

* Only rendered if Critical or High alerts exist

* Maximum 2–3 items shown inline

* Each item: icon \+ one-line summary \+ one tappable CTA that deep-links to the relevant page

* If no alerts: block does not render at all

▌ **THIS WEEK**

* Single progress bar: spent vs. planned for current week

* Plain-language status line: "3 days left · on track" or "running hot"

* No category breakdown here — that belongs in Plan \> Budget

▌ **RECENT TRANSACTIONS**

* Grouped by date (Today, Yesterday, date labels for older)

* 6–8 entries maximum before "View all transactions →" link

* Each row: emoji/icon \+ description \+ category \+ amount (colour-coded)

* Tapping a row opens edit sheet for that transaction

▌ **GOALS SNAPSHOT (CONDITIONAL)**

* Only rendered if active goals exist

* Maximum 2–3 goals shown as compact progress bars

* Taps through to /plan on Goals tab

* Shows most at-risk goal first; if all on track, shows closest deadline

▌ **FIRST-RUN CHECKLIST (CONDITIONAL)**

* Only shown until all three steps are complete, then permanently hidden

* Step 1: Add your first account

* Step 2: Add a transaction or import data

* Step 3: Set a budget amount for at least one category

**3.1.1  Allowance Bar States**

| State | Visual treatment |
| :---- | :---- |
| Normal | Tier-coloured filled segments \+ muted remainder. One continuous bar. |
| Overspent | All tier segments fill completely. Red overflow extends beyond the bar's right boundary. Red stroke appears around the entire bar (signals the whole bar is in alarm, not just the overflow). Overflow segment is coral/desaturated red to avoid clashing with the survival tier red. |

## **3.2  Plan — "Where is my money going?"**

Three tabs with distinct visit rhythms. Tab order reflects a temporal progression: now → this month → the future. A settings cog in the TopBar links directly to /settings/plan.

| Tab | Visit rhythm |
| :---- | :---- |
| Allowance | Daily — "can I spend this?" |
| Budget | Weekly / monthly — configuration |
| Goals | When something changes — progress, milestones, at-risk |

### **Allowance Tab**

* Today card: large remaining amount, segmented allowance bar, tier breakdown list with status (covered / at risk / over) per tier

* Week view: 7 mini bars Mon–Sun. Mon–today \= actual spent data. Tomorrow–Sun \= projected from planned/recurring transactions. Today highlighted. This is the core "past meets future" visualisation.

* Recovery block: only shown when overspent. Contains overspend amount, plain-language suggestion, link to recovery suggestions.

* Cash flow chart: 30-day projected balance line chart. Buffer zones as background colour bands (critical / warning / comfort / optimal). Payday markers. Large planned expense dots (tappable → that transaction). Lives here, not on Home.

**Note:** Allowance tab is always "right now" — it does not support historical date navigation. Historical allowance data belongs in Reports.

### **Budget Tab**

* Monthly summary card: planned income, planned expenses, net projection (read-only numbers, no chart)

* Categories grouped by waterfall tier (Survival / Security / Growth / Lifestyle)

* Each tier section is collapsible. Expanded by default.

* Each category row: name \+ spent amount \+ budget amount \+ inline progress bar

* Tapping a category row opens an edit sheet (name, budget amount, tier, colour) — no separate route needed for most edits

* "+ Add category" CTA at the bottom of the list opens /plan/budget/categories/add as a sheet

**Empty tier state:** When a tier has no categories, show: "No categories yet" \+ contextual "+ Add a \[Tier\] category" CTA within that tier section.

### **Goals Tab**

* Sub-tabs inside Goals: Overview | Active | Completed

* Overview sub-tab: rolled-up summary (count active/completed, total target, total saved %, on-track count, at-risk count)

* Active sub-tab: goal cards with progress bar, required monthly contribution, target date, on-track/at-risk status

* At-risk goal cards surface the most direct fix inline (e.g. "Extend deadline to Mar 2026") without leaving the page

* Completed sub-tab: achieved goals with completion date

* "+ New goal" CTA opens /plan/goals/add

## **3.3  Transactions — "What has happened / log something new"**

The complete ledger. High-frequency data-entry surface. Adding a transaction is always one FAB tap away from any page.

### **Main List**

* TopBar: page title left, search icon \+ filter icon right

* Search icon expands an inline search bar on tap

* Filter icon opens a filter bottom sheet

* Summary bar below TopBar: contextual to active filters. Shows period label, total spent, total income, net, entry count.

* Month navigation: ← prev | current | next →, swipeable

* Transactions grouped by date (Today / Yesterday / date labels)

* Each row: icon \+ description \+ category \+ account \+ amount (colour-coded)

* Tapping a row opens the edit form

* "Load earlier transactions" pagination at the bottom — loads one month at a time, not infinite scroll

### **Filter Sheet**

* Date range (preset or custom)

* Type: All / Expenses / Income

* Category: multi-select chips

* Account: multi-select

* Amount range: dual-handle slider

* Active filters: filter icon gets a badge dot. Summary bar updates to reflect filtered view.

* "Reset" clears all filters in one tap

## **3.4  Insights — "What has the app noticed? What should I do?"**

The intelligence layer. Three tabs serving different user modes. Alerts are not a tab here — they live in the bell icon system (see Section 7).

### **Patterns Tab**

* Spending pulse card: one human-readable observation at the top, rotates weekly with the most interesting finding. Falls back to a neutral summary if nothing notable. New users (\<2 weeks data) see a "building your picture" placeholder.

* Recurring transactions: detected recurring items with inferred amounts and next expected dates. "\~" prefix signals inferred, not manually set.

* Anomalies: only shown if anomalies exist. Plain-language description of what changed and by how much.

* Your patterns: compact stat cards (peak spending day/time, biggest category, most frequent category, average transaction amount)

* Upcoming (predicted): one-line summary of expected spending this week based on patterns. Not a full list.

### **Optimize Tab**

* Potential savings summary card at top: total saveable amount across all recommendations. If nothing to optimise: "You're in good shape — nothing to optimise right now."

* If no accounts have APR/credit limit metadata: prompt to set up account details to unlock fee and interest insights.

* Fee risks: urgent items first, with estimated fee amount, trigger condition, and one concrete action CTA

* Credit utilisation: per-card utilisation bar, target (30%), specific payoff amount to reach target

* Interest: monthly interest paid, projected annual saving from balance transfer or payoff

* Spending optimisations: lower-urgency lifestyle suggestions based on budget vs. actual

**Note:** Every recommendation card must have exactly one concrete action. Vague advice is not permitted. CTA labels are honest: "Do this →" for in-app actions, "Learn →" for actions requiring external steps.

**Note:** Optimize tab is hidden for Beginner maturity level by default.

### **Badges Tab**

* Most recently earned badge: shown prominently with earned date

* "Almost there" section: 2–3 in-progress badges with progress bars. Motivating, not overwhelming.

* "All earned" section: collapsed gallery of all earned badges, expandable on tap

* Locked badges are not shown. Earning them is the reveal.

## **3.5  Reports — "Show me the full picture over time"**

The reflective, sit-down session. Higher information density is appropriate here. A global period selector sits below the TopBar and persists across all five tabs.

**Note:** The period selected in Reports shares state with the month navigation in Transactions. Changing one updates the other. This is intentional global state.

### **Overview Tab**

* Four headline numbers: income, expenses, net, savings rate (with vs-last-month indicator)

* Donut chart: spending by waterfall tier (not by category — tier level is the right altitude for overview)

* Highlights: 3 plain-language observations generated from the data (e.g. "Stayed within budget", "Dining out up from last month")

* Top transactions: 5 largest transactions for the period

### **Trends Tab**

* Bar chart: one bar per month, last 6 months by default. Income shown as line overlay on same chart.

* Range selector below chart: 3M / 6M / 1Y / All

* Savings rate trend: separate smaller line chart

* Category trends: compact sparkline per category with one-word direction label (stable / rising / easing / down)

### **Categories Tab**

* Sort control: by spending, budget variance, or name

* Each category row is expandable in-place

* Collapsed: name \+ progress bar \+ spent/budget amounts

* Expanded: 6-month history inline \+ transaction list for the period \+ "See all in \[Category\] →" deep-link to /transactions with that category pre-filtered

### **Compare Tab**

* Two independent period selectors (global selector controls the left; right is independent)

* On mobile: period selectors stack vertically (full width each)

* Side-by-side metrics table: spent, saved, savings rate per period

* Plain-language delta summary below table

* Category deltas list: colour-coded green/red based on proximity to budget target, not raw spend direction

### **Saved Tab**

* Auto-generated monthly summaries (Phase 6 — space reserved, not yet implemented)

* Manual report generation: period selector, format (PDF/CSV), content checkboxes (Summary, Categories, Trends, All transactions)

# **4 · Transaction Form**

The most important data-entry surface in the app. Designed around progressive disclosure: starts minimal (6 fields for a standard expense), reveals complexity on demand. Full-screen page on mobile, centered modal (\~480px) on desktop.

## **4.1  Form Structure**

| Section | Contents |
| :---- | :---- |
| Amount (hero) | Large centred amount. Tapping opens numeric keypad (mobile) or number input (desktop). Currency button shows current currency — only prominent when transaction currency differs from account currency. |
| Type \+ Status row | Two inline dropdowns: \[type ▾\] \[status ▾\]. Subtle, below the amount. Defaults: type \= from picker selection, status \= cleared (or planned if entered via "Plan ahead" picker option). |
| Details | Description (required), Category \+ Date side by side, Account (full width) |
| More options (collapsed) | Notes, Recurring toggle \+ recurrence rule select, Grouped transaction toggle \+ group name, Reference, Advanced fields (Priority, Flexibility, Constraint) |
| Edit-only: Dependencies | Dependency Manager and Dependency Graph, collapsed at bottom of form. Only rendered when transaction has an ID (edit mode). Backend and UI handling to be reviewed. |

## **4.2  Type-Aware Behaviour**

| Type | Title | Key differences |
| :---- | :---- | :---- |
| Expense | New expense | Category visible (optional). Account \= "Account". |
| Income | New income | Category hidden. Account \= "Into account". |
| Transfer | New transfer | Account \= "From account". Destination account field appears (required). Category hidden. "Add transfer fee" toggle in More options. |
| Planned expense/income | New planned \[type\] | Status locked to "planned". Date label \= "Planned date". Otherwise same as cleared equivalent. |
| Adjustment | Balance adjustment | Description pre-filled as "Manual adjustment" (editable). Category hidden. Status locked to "cleared". Brief explanation line shown. |

## **4.3  Key Behaviours**

**Account → currency sync:** When the user selects an account, the transaction currency silently updates to match that account's currency. The currency button is only visually prominent when the currencies differ (imported transactions, foreign spending).

**Over-allowance dialog:** Fires on submission when the transaction's allowance impact causes remaining allowance to go negative, regardless of transaction type or status. Logic lives in the service layer — the UI reacts to what the service returns, not to type-checking in the form.

**Delete in edit mode:** Destructive "Delete" appears as a text link in the BottomBar left slot (not a button — deliberate, to avoid accidental taps). If the transaction has dependencies, the confirmation dialog warns: "X transactions depend on this. Deleting it may affect their status and calculations."

**Save button placement:** TopBar right slot on mobile (always visible above keyboard). BottomBar primary CTA on desktop modal.

## **4.4  Shared Component: Sheet vs Modal**

The transaction form is one component that renders differently by viewport:

| Surface | Mobile |
| :---- | :---- |
| Transaction form | Full-screen page |
| Filter controls | Bottom sheet |
| Category edit | Bottom sheet |
| Currency picker | Bottom sheet |
| Alerts panel | Bottom sheet (\~70% height, draggable to full) |
| More drawer | Bottom sheet |

# **5 · Desktop Layout & Sidebar**

## **5.1  Overall Layout**

Sidebar (240px expanded, 60px collapsed) \+ content area (flex-1, rounded-2xl, shadow-md, m-2 spacing all around). No bottom navigation on desktop. The BottomBar on desktop is used only for form action buttons, never for navigation.

**Content area max-width:** max-w-4xl for most pages. max-w-lg for forms (transaction add, account add, category add). max-w-6xl for Reports charts and tables. Content is centred within the content area at wide viewports.

## **5.2  Sidebar Zones**

| Zone | Contents |
| :---- | :---- |
| Top | Logo (taps to Home) \+ nav items with sub-items |
| Middle | Persistent widget (Slot A, swappable) \+ quick-add button (Slot B, fixed) |
| Bottom | Alerts bell (with unread count badge) \+ Settings link |

## **5.3  Collapsed Sidebar (60px)**

* Nav items: icon only, tooltip on hover. Hovering a parent with sub-items shows a flyout menu.

* Widget slot: single icon reflecting current widget (arc progress for allowance, £ for balance, calendar for upcoming bills). Hover tooltip shows the key number.

* Quick-add: ╋ icon

* Alerts: bell icon with count badge

* Settings: gear icon

## **5.4  Desktop-Specific Interactions**

**Hover states:** Nav items, transaction rows, category cards, and all interactive elements require hover states (background tint, cursor pointer). Audit systematically — these do not exist on mobile.

**Modals vs sheets:** See Section 4.4 for the full mapping. Build as one shared component, not two separate implementations.

**FAB position:** Bottom-right of the content area (not over the sidebar).

# **6 · Widget System**

The sidebar widget area has two slots. Slot B (quick-add button) is fixed and never changes. Slot A is a swappable info widget. The user cycles through available widgets via swipe gesture or always-visible ‹ › arrow controls.

## **6.1  Available Widgets (Slot A)**

| Widget | Content |
| :---- | :---- |
| Daily allowance (default) | Remaining amount, segmented progress bar, "of £X daily" label. Taps to Plan \> Allowance. |
| Total balance | Total across all accounts, account count, month-over-month change. Taps to /accounts. |
| Goals snapshot | Most at-risk active goal with progress bar, required monthly contribution, target date. Falls back to closest-deadline goal if all on track. Taps to Plan \> Goals. |
| Upcoming bills | Next 3 planned/recurring transactions with name, amount, and date. Taps to Plan \> Allowance. |
| Savings rate | Current month savings rate %, progress bar, vs-last-month comparison. Taps to /reports. |
| Net worth change | Month-over-month net worth delta with trend direction. Taps to /reports. |

## **6.2  Hotswap Interaction**

* ‹ and › arrow controls are always visible at the left and right edges of the widget, in muted colour. Not hidden behind hover.

* Swipe left/right on the widget also cycles (consistent with tab swipe gesture).

* Dot indicators at the bottom of the widget show current position in the rotation cycle.

* The cycle only includes widgets the user has enabled in Settings \> Navigation.

## **6.3  Settings \> Navigation — Widget Configuration**

* A dedicated section in Settings \> Navigation lists all available widgets.

* Each widget has a drag handle (to reorder) and a show/hide toggle.

* The first enabled widget in the list is always the default shown on load.

* Reordering changes the cycle sequence.

# **7 · Alerts System**

Alerts are triaged into three tiers. The tier determines where and how an alert surfaces. The goal is maximum signal, minimum noise.

## **7.1  Alert Tiers**

| Tier | Definition | Where it surfaces |
| :---- | :---- | :---- |
| Critical | Requires immediate action, time-sensitive (e.g. overdraft risk in 2 days, monthly budget exceeded) | Bell panel AND inline on Home "Needs attention" block |
| High | Important but not urgent (e.g. credit utilisation at 74%, goal falling behind) | Bell panel only |
| Low | Informational, no action needed (e.g. spending less than usual, badge almost earned) | Inline contextual flags on relevant pages only. Never in the bell panel. |

**Note:** Low-tier alerts are observations, not alerts. Moving them out of the panel is the primary fix for alert fatigue.

## **7.2  Bell Icon Badge**

* Badge count \= unread Critical \+ High alerts only. Low tier never increments the badge.

| State | Visual |
| :---- | :---- |
| No alerts | Plain bell, no badge |
| Has High alerts | Badge with count, muted amber |
| Has Critical alerts | Badge with count, red |
| All read | Plain bell (badge clears) |

## **7.3  Read State**

* An alert is marked read when it has been in the viewport for ≥1 second (IntersectionObserver).

* The badge decrements in real-time as alerts scroll into view.

* Closing the panel before scrolling to all alerts preserves the remaining unread count.

* Tall alert cards are marked read when the top of the card has been visible for 1 second.

## **7.4  Alert States**

| State | Behaviour |
| :---- | :---- |
| Dismissed | Manual user action. Critical alerts ask for confirmation before dismissing: "This alert will reappear if the risk persists." |
| Auto-resolved | Underlying condition clears. Alert disappears from active panel silently. A trace remains in the "Earlier" collapsed section: e.g. "Overdraft risk resolved — 18 Mar passed safely." |
| Snoozed | Planned (Phase 5). Not yet designed. |

## **7.5  Panel Layout**

### **Structure (both mobile and desktop)**

* Active alerts grouped by tier: CRITICAL section first, then HIGH section

* Each alert card: icon \+ title \+ one-line explanation \+ one CTA ("Take action →" or "View in X →") \+ Dismiss button

* "Mark all read" control in panel header

* "Earlier (read)" collapsed section at the bottom for previously seen alerts

* Empty state: "You're all caught up — nothing needs attention" with Earlier section still accessible

### **Mobile vs Desktop container**

* Mobile: bottom sheet, \~70% screen height, draggable to full screen

* Desktop: right-side panel, \~320px wide, slides in from right edge of content area (not from sidebar). Semi-transparent backdrop over content. Close on backdrop tap, Escape key, or ✕ button.

## **7.6  Inline Flags (Low Tier)**

* Small contextual indicator on the relevant UI element (e.g. amber dot \+ one word on a category row in Budget, "● rising")

* Tapping the element reveals the full observation

* Dismissible: small ✕ on hover (desktop) or swipe-to-dismiss (mobile)

# **8 · Onboarding & First-Run Experience**

## **8.1  Onboarding Steps**

| Step | Content |
| :---- | :---- |
| 1 | Welcome |
| 2 | Username |
| 3 | Currency (system currencies listed first) |
| 4 | Theme (dark/light) + language |
| 5 | **Guidance & detail** — `guidanceTone` (supportive / balanced / minimal) + `explanationDetail` (full / standard / brief); presentation-only, not feature gating |
| 6 | **Import offer** (optional) — primary CTA → `/data?tab=import`; secondary “Skip for now” → Home |

Financial goals are **not** collected in onboarding; **Set a financial goal** appears as a post-checklist suggestion on Home after the first-run checklist completes.

Guidance and detail remain editable anytime via Settings → Profile.

## **8.2  First-Run Checklist (Post-Onboarding)**

After onboarding the user may have no accounts or transactions. A passive checklist on Home tracks four setup steps. When all four complete, the checklist is replaced by **post-complete suggestions** (non-blocking, dismissible, keyed off guidance/detail prefs). Dismissed suggestions remain rediscoverable under Settings → **Setup**.

| Step | Action | Done when |
| :---- | :---- | :---- |
| 1 | Add your first account | ≥1 account |
| 2 | Add a transaction or import data | ≥1 non-deleted transaction |
| 3 | Set a budget on a category | category `budgetAmount > 0` |
| 4 | Review your allowance on Plan | user opened `/plan?tab=allowance` once (`allowanceTabReviewed`) |

**Deduping:** Onboarding step 6 is an optional import **offer** only. Checklist step 2 is “transaction **or** import” — the same action is not required in both flows as a hard gate.

**Note:** Not a forced wizard. Each incomplete step has a direct CTA. Post-complete suggestions (e.g. classify spending, review Fees & Accounts, set a goal) are optional and respect guidance/detail density.

# **9 · Global Patterns & Shared State**

## **9.1  Shared Date State**

The month selected in Transactions (month navigation control) and the period selected in Reports (period selector) are the same piece of global state. Changing one updates the other. Both default to the current month on first load.

## **9.2  Empty States**

Every data-driven section must have an explicit empty state. Guidelines:

* New user / no data: neutral, encouraging. Example: "Keep logging transactions and we'll start spotting patterns in about 2 weeks."

* No alerts: positive. "You're all caught up."

* No goals: inviting. "No goals yet — add one to start tracking your progress."

* No matching filter results: helpful. "No transactions match these filters. Try adjusting the date range or clearing some filters."

* Feature requires setup: actionable. "Add interest rates and credit limits to your accounts to unlock fee and interest insights. \[Set up accounts →\]"

## **9.3  Data Visualisation Conventions**

| Convention | Rule |
| :---- | :---- |
| Segmented bar | Use for parts of a single whole (allowance tiers, spending breakdown). One bar, coloured sections. |
| Parallel bars | Use for comparing separate discrete things (days of the week, months side by side). |
| Line chart | Use for continuous values over time (balance projection, savings rate trend, spending trend). |
| Donut chart | Use for proportional breakdowns at a point in time (tier breakdown in Reports Overview). |
| Sparklines | Use for directional trend indication only — not for precise values (category trends in Reports). |

## **9.4  Colour Coding**

| Colour | Meaning |
| :---- | :---- |
| Red / coral (solid border) | Expense — cleared |
| Green (solid border) | Income — cleared |
| Red dashed border | Expense — planned |
| Green dashed border | Income — planned |
| Neutral dotted border | Transfer |
| Red (alert) | Critical alert, overspent, negative balance |
| Amber | High alert, at-risk, warning state |
| Green (status) | On track, covered, positive delta |
| Muted / greyed | Remaining allowance, locked badges, inactive state |

## **9.5  Page header back navigation**

Full-screen pages use the shared `Header` component in `PageLayout`. When present, the back affordance is an icon-only ghost button (arrow left) to the left of the title.

### **Rule**

| Screen type | Back arrow | Back target |
| :---- | :---- | :---- |
| **Hub** — top-level destination with its own nav entry | No | — |
| **Drill-in** — full screen opened from a hub | Yes | Parent hub route |

**Hub examples:** `/settings`, `/accounts`, `/reports`, Home, Transactions, Plan, Insights.

**Drill-in examples:** `/settings/profile`, `/settings/currency`, `/accounts/[id]`, `/transactions/add/...`.

**Exception:** `/data` is a More-drawer hub but shows back → `/` with label **Home** (utility hub, not nested under Settings).

### **Settings**

| Route | Back? | Props |
| :---- | :---- | :---- |
| `/settings` (hub) | No | Omit back props |
| `/settings/*` drill-ins (profile, display, currency, plan, navigation, accounts, notifications, roundup, …) | Yes | `backButtonLink="/settings"` · `backButtonLabel="Back to settings"` |

### **Implementation (`Header.svelte`)**

| Prop | Purpose |
| :---- | :---- |
| `backButtonLink` | Route navigated on back tap. When set, back arrow shows automatically — do not also require `showBackButton`. |
| `backButtonLabel` | Meaningful label for the icon-only button; wired as `aria-label`. |
| `showBackButton` | Optional explicit show. When true with no link, falls back to `history.back()`. |

Reference: [`../../src/lib/components/Header.svelte`](../../src/lib/components/Header.svelte) · account detail pattern in [`../../src/routes/accounts/[id]/+page.svelte`](../../src/routes/accounts/[id]/+page.svelte).

## **9.6  Overlay patterns**

Secondary flows (filters, drill-in detail, confirmations) use one of four overlay primitives. Pick by flow type, not by screen size alone.

| Primitive | Use when |
| :---- | :---- |
| `Dialog` / `AlertDialog` | Confirm/cancel, ≤3 fields, blocking decision |
| `DialogDrawer` | Edit/filter/history; multi-field forms; user may return to parent |
| `ResponsivePanel` | Read-heavy contextual detail; light inline actions; parent stays visible |
| Raw `Drawer` | Full-height or custom-direction panels when shared wrappers don't fit |

**Naming:** `*Panel` → `ResponsivePanel` overlay wrappers; `*Sheet` → `DialogDrawer`. Inline page sections also use `*Panel` — see [`overlay-patterns.md`](./overlay-patterns.md) naming scope.

Full decision table, breakpoints, and examples: [`overlay-patterns.md`](./overlay-patterns.md).

# **10 · Deferred & Open Items**

## **10.1  Deferred Design Work**

| Item | Notes |
| :---- | :---- |
| Dependency system (edit mode) | Dependency Manager and Dependency Graph exist in the codebase. Full UI design deferred pending review of backend handling. Confirm correct behaviour when a transaction with dependents is deleted. |
| Periodic reports (Phase 6\) | Auto-generated weekly, monthly, annual summaries. Space reserved in Reports \> Saved tab. Design deferred until backend generation logic is implemented. |
| Allowance ↔ Goals ↔ Optimizer triangle (Phases 3 & 4\) | The surfaces are designed (Plan \> Allowance shows goal contributions; Insights \> Optimize shows allowance impact). The bidirectional communication UI is deferred pending backend completion. |
| Alert snooze (Phase 5\) | Mentioned in roadmap. Not yet designed. Will extend the alerts panel with snooze options and smart defaults. |
| Guidance prefs — remaining coachmarks & nudges | **Shipped May 25, 2026** — Alerts critical coachmark + Plan classify nudge show/copy wired via `guidance-presentation.ts`. Functional nudges (goal-precision, post-add split) remain domain-specific. |

## **10.2  Implementation Notes**

* Viewport-based alert read tracking requires IntersectionObserver on each alert card with a 1-second threshold.

* The transaction form type picker popover (FAB tap) and the form itself are two separate components, not one.

* Overlay primitives: four patterns (`Dialog`, `DialogDrawer`, `ResponsivePanel`, raw `Drawer`) — see §9.6 and [`overlay-patterns.md`](./overlay-patterns.md). Do not add a fifth without updating those docs.

* Sidebar sub-item active state and in-page tab bar active state both derive from the URL — no separate sync logic needed.

* Over-allowance dialog logic lives in the service layer. The form UI only reacts to what the service returns — no type-checking in the form itself.

## **10.3  Decisions Made**

| Decision | Resolution |
| :---- | :---- |
| Shared month state (Transactions ↔ Reports) | Yes — global state, intentional. |
| Guidance + detail preferences | Replaces ex-maturity **presentation** prefs (`guidanceTone`, `explanationDetail`). Controls tooltip density, helper copy, post-checklist suggestion count — **not** nav/tab/field visibility. Shipped May 25, 2026. |
| First-run checklist | Passive checklist on Home, **4** steps; on completion → post-complete suggestions (not permanent hide). Settings → Setup for rediscovery. |
| Desktop top-level nav items (Plan, Insights) | Section headers only — not tappable links. Navigation via sub-items exclusively. |
| Alerts "read" definition | In-viewport for ≥1 second per card (IntersectionObserver). |
| Profile page | No separate nav item. Accessible via avatar tap on Home TopBar only. |
| Adjustment in FAB picker | Not in picker. Accessible inside form via type dropdown. |
| Planned transactions in FAB picker | "Plan ahead" option in picker leads directly to planned expense/income buttons — no second picker screen. |
| Page header back navigation | Hub = no back arrow; drill-in = always back to parent hub via `Header` `backButtonLink` + `backButtonLabel` (§9.5). `/data` → Home exception. |

