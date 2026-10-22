# Informational references

Stable product and engineering docs — consult while building. For shipped history see [`../CHANGELOG.md`](../../CHANGELOG.md).

---

## Product & UX

| Doc                                          | Purpose                                                                                   | Notes                                                                                                                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [DESIGN_BIBLE.md](./DESIGN_BIBLE.md)         | Visual language — typography, color, motion, components                                   | Canonical (v1.0, March 2026). Supersedes the early `design-bible` shards.                                                                          |
| [UX_SPEC.md](./UX_SPEC.md)                   | IA, routes, screens, flows, widgets, alerts                                               | Canonical spec (March 2026). Route tree may lag code — cross-check [architecture/STRATEGIC_SYSTEM_MAP.md](./architecture/STRATEGIC_SYSTEM_MAP.md). |
| [overlay-patterns.md](./overlay-patterns.md) | Overlay primitive choice (`Dialog`, `DialogDrawer`, `ResponsivePanel`, `Drawer`) + naming | May 2026; summary in UX_SPEC §9.6.                                                                                                                 |

---

## Data quality (strategy + UX)

| Doc                                                | Purpose                                             | Notes                                                                                                    |
| -------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [dirty-data-strategy.md](./dirty-data-strategy.md) | Import vs infer philosophy, layer-by-layer analysis | Strategy reference; Phases 0–4 **shipped** (see [`../CHANGELOG.md`](../../CHANGELOG.md)).                |
| [data-quality-ux.md](./data-quality-ux.md)         | Ambient signals, `/data` hub, route-level tensions  | UX reference; most signals and `/data` tabs **shipped**; remaining gaps are open items noted in the doc. |

---

## Architecture

| Doc                                                                                            | Purpose                                                                                                   |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [architecture/README.md](./architecture/README.md)                                             | Index for service docs                                                                                    |
| [architecture/STRATEGIC_SYSTEM_MAP.md](./architecture/STRATEGIC_SYSTEM_MAP.md)                 | Routes → services → Dexie; doc drift table — **prefer over older architecture prose when code disagrees** |
| [architecture/SERVICE_ARCHITECTURE.md](./architecture/SERVICE_ARCHITECTURE.md)                 | Service categories, patterns, responsibilities                                                            |
| [architecture/SERVICE_INTERACTION_DIAGRAMS.md](./architecture/SERVICE_INTERACTION_DIAGRAMS.md) | Mermaid dependency graphs                                                                                 |
