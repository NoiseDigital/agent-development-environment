# NoiseOS architecture docs

The README explains *what* the platform is and how to run it. These docs
explain *how it's wired together* — the contracts and conventions a new
contributor needs to be productive.

- [**agents.md**](./agents.md) — agent catalog, envelope contract, action
  contract, how agents delegate to each other.
- [**genui.md**](./genui.md) — `{ text, ui }` envelope, every block type's
  props, parser failure modes the platform tolerates.
- [**dashboards.md**](./dashboards.md) — tile registry, presentation
  overrides, the grid wiring, footguns.

Codebase-local docs that ARE deliberately not here (they live where the
code does, so they can't drift):

- [`services/frontend/src/components/dashboards/tiles/README.md`](../services/frontend/src/components/dashboards/tiles/README.md)
  — how to add a tile type, customize per dashboard.
- [`services/backend/agents/tests/README.md`](../services/backend/agents/tests/README.md)
  — how the agents.yaml behavior harness works.
