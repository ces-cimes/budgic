# Budgic Design Bible
*Version 1.0 — March 2026*

---

## 1. Identity

### What Budgic Is
A personal finance app that treats you like an adult who has taste. It doesn't hide complexity behind clumsy wizards, and it doesn't celebrate every button tap with confetti. Budgic is intelligent, opinionated, and occasionally delightful — in the way that **precision** is delightful, not the way that confetti is.

### Closest Design Analogues
Linear's interface precision × Revolut Premium's dark warmth × Monzo's honest, direct voice.

### What Budgic Is NOT
- A corporate banking app (cold, formal, blue everywhere)
- A gamification machine (XP bars, streaks, streaks for streaks)
- A spreadsheet replacement (no visible ledger rows, no grid aesthetic)

### The Unforgettable Thing
**The amber number.** When you open the app, the total balance or safe-to-spend figure is rendered in a beautiful large number — warm amber in dark mode, rich and deep — that looks like it was *designed*, not just computed. That number is the soul of the interface.

---

## 2. Aesthetic Direction: "Warm Dark Precision"

Dark-mode first. The app breathes in a warm near-black environment where amber glows and sage green signals health. Surfaces are layered with subtle depth — not flashy glass, but honest material: elevated, muted, present.

Light mode is a clean warm-white inversion. The amber stays.

**Keywords in order of application:**
1. **Minimal** — restraint above all. Show what matters. Hide complexity behind progressive disclosure.
2. **Premium** — nothing cheap. Quality spacing, rich typography, meticulous consistency.
3. **Fun** — personality in the data. Micro-celebrations, witty empty states, numbers that feel alive.
4. **Glass** — conditional, not pervasive. Reserved for overlays, floating elements, and navigation bars.

---

## 3. Typography

### Font Trio

| Role | Font | Usage |
|------|------|-------|
| **Display** | Instrument Serif | Hero financial numbers only (balance, allowance totals) |
| **Interface** | Manrope | All UI text: labels, buttons, body, nav |
| **Data** | JetBrains Mono | Transaction amounts in lists, inline financial figures |

### Why This Combination
Instrument Serif on a large balance number creates immediate gravitas — it signals "this number was designed, not computed." Manrope is clean and modern without being Inter. JetBrains Mono gives transaction amounts tabular precision without looking like code.

### Classes
```css
.font-display  → Instrument Serif, serif
.font-sans     → Manrope, sans-serif  (body default)
.font-mono     → JetBrains Mono, monospace
```

### Type Scale

| Context | Size | Weight | Font |
|---------|------|--------|------|
| Hero balance (home) | 3.5rem–5rem | 400 | Display |
| Secondary hero (allowance total) | 2.5rem | 400 | Display |
| Section title | 1rem | 600 | Sans |
| Body | 0.875rem | 400 | Sans |
| Label / caption | 0.75rem | 400–500 | Sans |
| Transaction amount (list) | 0.875rem | 500 | Mono |
| Transaction amount (large) | 1.125rem | 500 | Mono |

### Numeric Principles
- All monetary amounts use `font-variant-numeric: tabular-nums` — digits always align.
- Hero numbers have `letter-spacing: -0.02em` for optical tightness at large sizes.
- Currency symbols (`$`, `€`) are rendered slightly smaller than the number (`.85em`) to avoid visual noise.

---

## 4. Color System

### Dark Mode (Primary Experience)

```
Layer 0 — Base black:    oklch(0.09 0.006 285)   ← almost black
Layer 1 — Sidebar/nav:   oklch(0.13 0.005 285)   ← navigation surfaces  
Layer 2 — Card bg:       oklch(0.17 0.005 285)   ← content cards
Layer 3 — Elevated:      oklch(0.22 0.006 285)   ← hover, dropdowns, inputs
Layer 4 — High surface:  oklch(0.27 0.006 285)   ← selected, active states
```

### Light Mode

```
Base:     oklch(0.99 0.002 85)    ← warm white, not sterile
Card:     oklch(1 0 0)            ← pure white cards
Surface:  oklch(0.96 0.003 85)    ← warm off-white
Elevated: oklch(0.93 0.004 85)    ← inputs, hover
```

### Brand — Budgic Amber

The soul of the app. Used for:
- Hero financial numbers (dark mode)
- Primary CTA buttons
- Active navigation indicator
- Progress bar fill (at moderate usage)
- Key metric labels and highlights

```
--color-amber:          oklch(0.78 0.16 85)        ← main brand amber
--color-amber-muted:    oklch(0.58 0.13 85)        ← secondary uses
--color-amber-subtle:   oklch(0.78 0.16 85 / 0.12) ← tinted backgrounds
--color-amber-glow:     oklch(0.78 0.16 85 / 0.25) ← glow/focus rings
```

In light mode, amber darkens for contrast:
```
--color-amber:          oklch(0.52 0.14 85)        ← readable on white
```

### Semantic Palette

| Semantic | Color | Dark OKLCH | Usage |
|----------|-------|-----------|-------|
| Income/Success | Sage green | `oklch(0.70 0.14 145)` | Income amounts, goal completion |
| Expense | Foreground | (standard) | Most transactions — normalized |
| Warning | Amber | `oklch(0.78 0.16 85)` | Budget approaching limit |
| Danger/Alert | Warm coral | `oklch(0.65 0.18 25)` | Over budget, fee risk, urgent |
| Info/Analytics | Soft indigo | `oklch(0.62 0.15 260)` | Insights, predictions, data |

### The Hero Number Color

```css
:root {
  --color-hero-number: oklch(0.32 0.08 85);   /* warm dark for light mode */
}
.dark {
  --color-hero-number: oklch(0.78 0.16 85);   /* bright amber for dark mode */
}
```

### Color Usage Rules
- **Expenses are not red.** Expenses are normal. Only *problematic* financial states (over budget, fee risk, negative allowance) use coral.
- **Income is green.** A positive flow always stands out.
- **Amber is aspirational.** It signals "good standing", "available money", "action" — not warning.
- **Never use pure hue-saturated blues or purples.** That's corporate banking. Our blues are indigo-leaning and muted.

---

## 5. Glass

Glass is a finishing touch, not a base texture. Use `backdrop-blur` only for elements that **float above content**.

### Use Glass For
- Mobile bottom navigation bar
- Page header when content scrolls beneath it
- Modal/sheet overlays
- Sidebar footer cards (balance, allowance info)
- Floating FAB background when over scrolled content
- Dropdown menus and popovers

### Do NOT Use Glass For
- Content cards in the main area
- Form inputs
- Transaction list items
- The sidebar navigation itself

### Glass Recipe

```css
.glass {
  background: oklch(0.17 0.005 285 / 0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid oklch(1 0 0 / 0.08);
  box-shadow:
    0 0 0 1px oklch(1 0 0 / 0.04) inset,
    0 1px 0 oklch(1 0 0 / 0.07) inset,
    0 8px 32px oklch(0 0 0 / 0.4);
}
```

Light mode glass:
```css
:root .glass {
  background: oklch(1 0 0 / 0.80);
  border-color: oklch(0 0 0 / 0.08);
  box-shadow:
    0 1px 0 oklch(1 0 0 / 0.9) inset,
    0 4px 24px oklch(0 0 0 / 0.12);
}
```

---

## 6. Motion & Animation

### Philosophy
**Purposeful, not decorative.** Every animation communicates information or confirms an action. None exist purely for spectacle.

### Count-Up for Financial Numbers
The single most impactful animation in the app. Balance and allowance numbers count up on first mount.

```
Duration: 600ms
Easing: cubic-bezier(0.16, 1, 0.3, 1)  ← fast start, gentle ease-out
Steps: proportional to magnitude (100ms intervals at $100 increments)
```

### Card Entrance
```
opacity: 0 → 1
translateY: 10px → 0
Duration: 250ms per card
Stagger: 60ms between cards
Easing: ease-out
```

### Progress Bar Fill
```
width: 0 → final%
Duration: 700ms
Easing: ease-out
Trigger: on element entering viewport
```

### Tab Transitions
Crossfade only. 120ms. No slides — they cause layout jitter on tab-heavy pages.

### Celebration (Goal completion, badge earned)
A brief amber shimmer: a ring of amber light that expands from the element center and fades at 0.6 opacity. Duration 400ms. Not confetti — more like a satisfying resonance.

### Loading Skeleton
Subtle pulse on a muted background swatch. No spinner unless loading is action-triggered (user pressed a button).

### Reduced Motion
All animations instant on `prefers-reduced-motion: reduce`. This is non-negotiable.

---

## 7. Spatial System

### Spacing Philosophy
More breathing room than feels necessary. Finance data is already dense — the layout fights this.

### Key Values
```
Card padding:          1.5rem  (24px)
Section gap:           2rem    (32px)  
List item padding:     0.875rem 1rem
Page horizontal:       1.25rem (mobile), 1.5rem (sm+)
Hero section top:      2.5rem  (40px)
```

### Max-Width Tiers
```
Home hero:     max-w-sm  (384px)  — tight, focused, nothing else competes
Content pages: max-w-2xl (672px)  — single-column reading width
Data pages:    max-w-4xl (896px)  — transactions, accounts list
```

### Grid System
Mobile-first single column. Two columns only when both items are genuinely parallel (account cards, goal cards). Never three columns on mobile.

---

## 8. Shape Language

### Why Squircles

Standard CSS `border-radius` applies a circular arc that starts and ends abruptly at the corner tangent. A squircle (superellipse) begins its curve earlier and resolves it later, producing a corner that reads as **continuous and designed** rather than clipped. It is the shape Apple uses for app icons — the reason they feel like discrete, crafted objects rather than boxes with corners removed.

Budgic uses squircles for all significant content containers. Finance data is intrinsically dense and utilitarian; the shape language is one of the few places to add craft without adding noise.

### The Core Rule

> **Squircles are for containers. Circles and pills are for classifiers.**

A **container** holds content — text, numbers, actions. Squircle it.  
A **classifier** identifies or labels a thing — a badge, a status tag, an avatar, a progress bar, a toggle. Keep it circular or pill-shaped.

### Usage Reference

| Element | Class |
|---------|-------|
| Page-level card / content panel | `squircle-4xl squircle-border` |
| Form section / input group container | `squircle-4xl squircle-border` |
| Inline alert / banner / notice | `squircle-2xl squircle-border` |
| Stat tile / compact data card | `squircle-2xl squircle-border` |
| Icon container 32–44px | `squircle-xl` + colored `bg-*` |
| Icon container 24–28px | `squircle-lg` + colored `bg-*` |
| Button (any variant) | `rounded-xl` — not squircled |
| Badge / status pill / tag chip | `rounded-full` |
| Progress bar | `rounded-full` |
| Toggle, switch, radio | `rounded-full` |
| Input, textarea, select | `rounded-lg` |
| Tooltip, popover, dropdown | `rounded-lg` |
| Avatar / user photo | `rounded-full` |
| Skeleton loader | `rounded-lg` |
| Navigation active indicator | `rounded-full` |

### Why Buttons Stay `rounded-xl`

A button at 36–44px height doesn't have enough surface area for the squircle curvature to read distinctly — the visual difference over `rounded-xl` is imperceptible. Meanwhile, `clip-path` removes native focus-ring rendering, which must be carefully compensated. `rounded-xl` achieves the same intent at button scale with none of the complexity. This is a firm rule, not a case-by-case judgment.

### Size Selection

Choose the squircle class so the corner radius is roughly **1/5 of the element's shortest dimension**, up to `squircle-4xl`.

| Element height | Squircle size |
|----------------|---------------|
| 24–32px (small icon container) | `squircle-lg` |
| 32–44px (medium icon container) | `squircle-xl` |
| 44–72px (compact card row, banner) | `squircle-2xl` |
| 80px+ (card, panel, section container) | `squircle-4xl` |

Don't interpolate between these. Use the table. Consistency matters more than mathematical precision.

### Squircle Borders

`clip-path` clips CSS `border` properties entirely. Use the `.squircle-border` companion class, which renders a border via a `::before` pseudo-element painted with the squircle path.

```html
<!-- Standard card -->
<div class="squircle-4xl squircle-border bg-card p-5">…</div>

<!-- Semantic alert — coral -->
<div class="squircle-2xl squircle-border px-4 py-3"
  style="--squircle-border-color: color-mix(in oklch, var(--color-warm-coral) 30%, transparent);
         --squircle-fill: color-mix(in oklch, var(--color-warm-coral) 8%, transparent);">
  …
</div>

<!-- Semantic alert — sage (success/positive) -->
<div class="squircle-2xl squircle-border px-4 py-3"
  style="--squircle-border-color: color-mix(in oklch, var(--color-sage-green) 30%, transparent);
         --squircle-fill: color-mix(in oklch, var(--color-sage-green) 8%, transparent);">
  …
</div>
```

CSS variables: `--squircle-border-color` (default: `var(--border)`) and `--squircle-fill` (default: `var(--card)`).  
Convenience fill classes: `.squircle-fill-tertiary`, `.squircle-fill-surface`.

### Semantic Border Colors

Squircle borders communicate state when tinted. Follow this convention consistently:

| State | Border | Fill |
|-------|--------|------|
| Default | `var(--border)` | `var(--card)` |
| Elevated / grouped | `var(--border)` | `var(--color-bg-tertiary)` |
| Warning / amber | `color-mix(in oklch, var(--color-amber) 30%, transparent)` | `var(--color-amber-subtle)` |
| Danger / coral | `color-mix(in oklch, var(--color-warm-coral) 30%, transparent)` | `color-mix(in oklch, var(--color-warm-coral) 8%, transparent)` |
| Success / green | `color-mix(in oklch, var(--color-sage-green) 30%, transparent)` | `color-mix(in oklch, var(--color-sage-green) 8%, transparent)` |

### What Must Not Be Squircled

- **`rounded-full` shapes** — squircling a circle produces a slightly-wrong not-quite-circle
- **Elements under 24px in their shortest dimension** — the curve is invisible; don't waste the clip-path cost
- **`<input>`, `<textarea>`, `<select>`** — browser inset-shadow and focus-ring conventions read better with standard `border-radius`
- **`.glass` elements** — `backdrop-filter` does not reliably respect `clip-path` across browsers; glass surfaces use `border-radius` + `overflow-hidden` exclusively
- **Skeleton loaders** — ephemeral and purposely generic; `rounded-lg` or `rounded-full` is sufficient

---

## 9. Component System

### Cards
Three levels of card:
1. **Base** — `squircle-4xl squircle-border bg-card` — standard content container
2. **Elevated** — Base + `shadow-sm` — calls to action, important data
3. **Hero** — Elevated + amber `--squircle-border-color` — balance card, allowance card

See §8 Shape Language for the full squircle border API and semantic color conventions.

### Buttons
```
Primary:      Amber fill, dark text, rounded-xl
Secondary:    Card background fill, border, rounded-xl
Ghost:        No background, foreground text, hover shows fill
Destructive:  Coral fill, white text
```

Buttons use `rounded-xl`, not squircles. See §8 for why.

CTA labels: sentence case, direct, no ellipsis. "Add transaction" not "Add Transaction..."

### Page header (`Header`)
Sticky top bar on full-screen routes inside `PageLayout`.

| Screen | Back arrow |
|--------|------------|
| Hub (own nav entry) | Hidden |
| Drill-in | Shown — navigates to parent hub |

Implementation: set `backButtonLink` + `backButtonLabel` on drill-ins; omit on hubs. Header auto-shows back when link is set. Icon-only back button uses `backButtonLabel` as `aria-label`. Full rule and settings table: [`UX_SPEC.md` §9.5](./UX_SPEC.md#95--page-header-back-navigation).

### Overlay patterns

Secondary flows use one of four overlay primitives (`Dialog`, `DialogDrawer`, `ResponsivePanel`, raw `Drawer`). Naming suffixes apply to **overlay wrapper components** only — not inline page sections named `*Panel` (e.g. `FeeAvoidancePanel`).

Full decision table, breakpoints, and May 2026 inventory: [`overlay-patterns.md`](./overlay-patterns.md) · UX_SPEC summary: [§9.6](./UX_SPEC.md#96--overlay-patterns).

### Progress Bars
Always pill-shaped. Fill color follows budget state:
- 0–60%: sage green
- 60–85%: amber
- 85–100%: coral

```css
.budget-progress-fill {
  background: linear-gradient(
    to right,
    var(--color-sage-green) 0%,
    var(--color-amber) 60%,
    var(--color-warm-coral) 85%
  );
  background-size: 100vw 100%;
  background-position: calc((100% - var(--fill)) * -1) 0;
}
```

### Transaction List Items
- Description: body font, regular weight, foreground
- Date + category: caption size, muted
- Amount: **mono font**, tabular-nums
  - Income: `text-[var(--color-sage-green)]`
  - Expense: `text-foreground` (NOT coral — expenses are normal)
  - Flagged/alert: `text-[var(--color-warm-coral)]`

### Empty States
All empty states use a shared pattern:
- Centered vertically and horizontally in their container
- 1-line message in body size, muted
- Optional 1-line subtext, caption size, more muted
- Optional CTA button (ghost or outline)

Examples of good empty state copy:
- No transactions: *"Nothing yet. Add your first transaction."*
- No accounts: *"No accounts added."*
- No goals: *"No goals set."*

NOT: *"You haven't added any transactions yet! Get started by adding your first one 🎉"*

### Navigation — Desktop Sidebar
Active item: amber `background-color` on the button + slightly brighter text. No borders.

### Navigation — Mobile Bottom Bar
Active item: amber pill indicator centered below the icon. The icon itself uses amber color. Label uses amber. No box/border approach.

---

## 10. Voice & Tone

### Principles
- **Direct.** "You're over budget by $142." Not "It looks like you may have exceeded your planned spending this period."
- **Warm.** Acknowledge the human behind the number. "Good week" not "All metrics within acceptable parameters."
- **Intelligent.** Explain *why* something matters, not just that it happened.
- **Restrained wit.** Dry, not silly. Empty states and loading messages can have subtle personality without being trying-too-hard.

### Label Examples

| Avoid | Use Instead |
|-------|------------|
| Spending Allowance | Safe to spend |
| Total Balance | Total balance (lowercase fine) |
| Financial Goals | Goals |
| No transactions found | Nothing here yet |
| Transaction added successfully! | Saved |
| Please enter a valid amount | Enter an amount |

### Numbers in Copy
- Always use the user's currency symbol + number: `$142`, not "142 dollars"
- Negative balances: show minus sign, no parentheses
- Large numbers: `$12,432` not `$12432` — always use locale separators
- Percentages: `72%` not `72.0%` — trim insignificant decimals

---

## 11. Route & Navigation Architecture

### Primary Navigation (6 items)
```
Home          /                   — Daily snapshot
Transactions  /transactions       — Full transaction list
Plan          /plan               — Budget | Allowance | Goals | Categories
Accounts      /accounts           — Account cards and detail
Insights      /insights           — Alerts | Savings | Patterns | Optimize | Badges
Reports       /reports            — Overview | Trends | Categories | Compare
Settings      /settings           — All preferences (footer/bottom)
```

### Insights vs Reports Distinction
- **Insights** = live, behavioral, forward-looking. "You're about to overspend." "Fee risk detected." "Badge earned." Proactive, intelligent, push.
- **Reports** = historical, analytical, backward-looking. Last month's breakdown. Year-over-year trends. Pull.

### Mobile Navigation Priority
Visible (first 4): Home, Transactions, Plan, Insights  
Overflow drawer: Accounts, Reports, Settings

### Stub Routes (Keep — They Are Correct Redirects)
These already exist and redirect to their canonical locations:
- `/budget` → `/plan?tab=budget`
- `/goals` → `/plan?tab=goals`
- `/categories` → `/plan?tab=categories`
- `/analyze` → `/reports`
- `/reconciliation` → `/data?tab=reconcile` (legacy `/accounts/reconciliation` may still redirect until Milestone E route cleanup)
- `/optimization` → `/insights?tab=optimize`

---

## 12. Implementation Priority

### Phase 1 — Foundation (Do First)
1. Fonts: app.html + app.css
2. Amber tokens: app.css
3. Home page hero balance
4. Mobile nav active state as amber pill
5. AllowanceSummary visual tightening

### Phase 2 — Component Polish
6. Account cards: display-font balances, elevated styling
7. Transaction amounts: mono font throughout
8. Progress bars: gradient fill system
9. Budget category cards: waterfall visualization (survival → security → growth → lifestyle)
10. Onboarding: full visual rework

### Phase 3 — Experience
11. Count-up animation for balance numbers
12. Card entrance stagger animations
13. Celebration animation for goal/badge moments
14. Empty states: personality + consistency
15. Loading skeletons replacing spinners

### Phase 4 — Detail
16. Header component: metric-aware variants
17. Settings page: Lucide icons replace emojis
18. Onboarding: full viewport, dark background, polished flow
19. Toast/notification styling aligned to design system
20. Dark mode sidebar footer cards: glass treatment

---

## 13. What Not To Do

- **No Inter, Roboto, or system-ui as primary font.** Ever.
- **No purple-gradient-on-white.** That's the AI-slop hallmark.
- **No border-radius under 8px on interactive elements.** Sharp corners feel hostile.
- **No squircle on pills, badges, toggles, or anything intrinsically circular.** Squircles are containers. Classifiers stay `rounded-full`.
- **No CSS `border` on squircle elements.** `clip-path` clips borders completely. Always use `.squircle-border` for bordered squircle shapes.
- **No squircle on `<input>`, `<textarea>`, or `<select>`.** Browser inset shadows and focus rings don't play well with `clip-path`. Use `rounded-lg`.
- **No squircle on `.glass` elements.** `backdrop-filter` does not respect `clip-path` reliably. Glass surfaces use `border-radius` + `overflow-hidden`.
- **No more than 2 accent colors visible at once** on a single card or section.
- **No emojis as UI icons** in production components. Use Lucide.
- **No toast notifications for every micro-action.** Only for async results the user might miss.
- **No spinning loader as the only loading state.** Skeleton screens or inline text for data loads.
- **No sentence-case → Title Case inconsistency.** Pick sentence case and stay there.
