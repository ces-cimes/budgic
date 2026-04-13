# Budgic

> **Personal finance management** — offline-first, category- and plan-driven.

Budgic helps you track accounts and transactions, run a **unified budget (waterfall tiers)** and **goals inside Plan**, and review insights locally on your device.

![SvelteKit](https://img.shields.io/badge/SvelteKit-2.0-FF3E00?logo=svelte)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38B2AC?logo=tailwind-css)

## MVP-ready (what the app is built for today)

These are the **core flows** you can ship to testers on **Android (Capacitor)** and validate end-to-end:

- **Accounts** — create, edit, balances (multiple account types).
- **Transactions** — income, expense, transfer, adjustments; categorization; splits where implemented.
- **Plan** — single `/plan` area with **Allowance**, **Budget** (categories + waterfall tiers), and **Goals**.
- **Home** — dashboard snapshot, navigation to deep links.
- **Insights & reports** — present in-app; depth varies by screen (treat as **iterating**, not “finished analytics product”).
- **Settings** — profile, display, currency, plan preferences, data **export / reset**.
- **Onboarding** — `/onboarding` flow; completion stored in preferences (first-run polish still tracked in docs).
- **Offline-first data** — **IndexedDB** (Dexie); optional network for **exchange rates** when configured.
- **Native Android build** — Capacitor wraps the production frontend build; see [docs/actionable/MVP_READY.md](./docs/actionable/MVP_READY.md).

## Aspirations (roadmap, not MVP promises)

Longer-horizon or partially implemented directions—**do not** treat README bullets here as guaranteed in any given build:

- **Tauri** packaging for **desktop + mobile** (migration target from Capacitor-only Android).
- **Deeper predictive / behavioral** analytics and richer “financial health” storytelling.
- **Full UX spec parity** (global FAB patterns, desktop sidebar widgets, alerts panel spec, first-run checklist)—working checklist [docs/actionable/MVP_READY.md](./docs/actionable/MVP_READY.md); detail in [docs/00_legacy/DISCREPANCY_QUICK_REF.md](./docs/00_legacy/DISCREPANCY_QUICK_REF.md) and [docs/00_legacy/UX_MIGRATION_TASKS.md](./docs/00_legacy/UX_MIGRATION_TASKS.md).
- **Progressive maturity** of the UI (hide or reveal advanced surfaces by user level) where not fully wired.
- **Bank linking / cloud sync** — not in scope for current architecture (local-first).

## Documentation

| Type                                              | Location                                                                                                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Index (actionable vs informational vs legacy)** | [docs/README.md](./docs/README.md)                                                                                                                             |
| **User-test MVP, Android checklist**              | [docs/actionable/MVP_READY.md](./docs/actionable/MVP_READY.md) · archived narrative [docs/00_legacy/MVP_USER_TESTING.md](./docs/00_legacy/MVP_USER_TESTING.md) |
| **Design Bible (canonical)**                      | [docs/informational/DESIGN_BIBLE.md](./docs/informational/DESIGN_BIBLE.md)                                                                                     |
| **UX spec**                                       | [docs/informational/UX_SPEC.md](./docs/informational/UX_SPEC.md)                                                                                               |
| **Service architecture**                          | [docs/informational/architecture/](docs/informational/architecture/) (see README in that folder)                                                               |
| **Archived roadmaps & old analyses**              | [docs/00_legacy/README.md](./docs/00_legacy/README.md)                                                                                                         |

## Getting started (development)

### Prerequisites

- **Node.js** 18+
- **npm** (or compatible package manager)
- A modern Chromium-based browser or device emulator for local UI work

### Install and dev server

```bash
git clone <repository-url>
cd budgic
npm install
npm run dev
```

Use the URL printed in the terminal (Vite defaults apply). This is for **development**; **tester-facing builds** are Android (Capacitor) with a production `npm run build` pipeline as described in the MVP doc.

### Production frontend build (feeds Capacitor / future Tauri)

```bash
npm run build
npm run preview   # optional: smoke the built assets locally
```

Frontend output is consumed by the **native** project (e.g. Capacitor `www` / `dist` per your config)—not deployed as a Budgic “public website” product today.

## Project structure (high level)

```
budgic/
├── src/
│   ├── lib/
│   │   ├── core/           # db.ts, services/
│   │   ├── components/     # UI + features
│   │   ├── paraglide/      # i18n (generated)
│   │   └── …
│   └── routes/             # SvelteKit routes (+page, +layout)
├── docs/
│   ├── actionable/         # MVP, discrepancies, tasks/, bulk-edit/
│   ├── informational/      # Design Bible, UX spec, architecture/
│   └── 00_legacy/          # Archived material + active_dev_done/
├── android/                # Capacitor Android (if present)
└── package.json
```

**Routes (actual):** Home (`/`); **Accounts**; **Transactions**; **Plan** (`/plan` — allowance, budget, goals); **Insights**; **Reports**; **Settings** (multiple subpages); **Onboarding**. There is no top-level `/budget` or `/goals` route—those live under **Plan**.

## Technology stack

- **[SvelteKit 2](https://kit.svelte.dev/)**, **[Svelte 5](https://svelte.dev/)** (runes), **TypeScript**
- **[Dexie.js](https://dexie.org/)** (IndexedDB), **[Zod](https://zod.dev/)**
- **Tailwind CSS 4**, **shadcn-svelte** / **bits-ui**, **Lucide**
- **[Capacitor](https://capacitorjs.com/)** (Android)
- **Target:** **[Tauri](https://tauri.app/)** for desktop + mobile shells (see MVP doc)

## Scripts

```bash
npm run dev          # Dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run check        # svelte-check + sync
npm run lint         # Prettier check + ESLint
npm run format       # Prettier write
```

## Key concepts

### Waterfall budgeting

Four tiers (survival → security → growth → lifestyle) drive category priority inside the unified budget system.

### Unified categories

Categories serve both **ledger categorization** and **budget envelopes** in Plan.

## Contributing

Follow existing patterns in `src/lib/core/services/` and Svelte 5 runes in components. For documentation, use [docs/README.md](./docs/README.md): **actionable/** (MVP, discrepancies, [`tasks/`](./docs/actionable/tasks/), [`bulk-edit/`](./docs/actionable/bulk-edit/)), **informational/** (Design Bible, UX spec, **architecture/**), **00_legacy/** for archives.

## License

MIT — see [LICENSE](./LICENSE).
