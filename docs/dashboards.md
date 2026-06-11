# Dashboards

The dashboard surface — the report page at `/dashboards/<id>` — is built
on three layers: a typed spec model, a tile registry, and the
react-grid-layout canvas.

## Layers

```
data/dashboards/types.ts          spec types (BaseTile, KpiTileSpec, …)
data/dashboards/clients/<X>.ts    per-client dashboard composition
data/dashboards/builders.ts       reusable tile builders (kpi(), trend(), …)
components/dashboards/tiles/      tile renderers (registry + bodies + helpers)
components/dashboards/DashboardCanvas.tsx   grid + unified kebab + edit wiring
```

The renderer never knows about a specific client; clients never know
about the renderer. The bridge is the typed `DashboardTile` union — add
a tile shape there + register a renderer in `tiles/index.tsx` and every
client dashboard can use it.

## Adding or customizing a tile

See the in-folder guide:
[`components/dashboards/tiles/README.md`](../services/frontend/src/components/dashboards/tiles/README.md).
It covers adding a new tile type, customizing per dashboard via
`PresentationOverrides`, and the known footguns.

## Tile registry

[`tiles/index.tsx`](../services/frontend/src/components/dashboards/tiles/index.tsx)
exports `TILE_RENDERERS: { [type]: Renderer }`. `DashboardCanvas` calls
`renderTile(tile, ctx)` — one line of dispatch, no switch statement.
Adding a tile type touches the type union and this registry; the canvas
never changes.

## Presentation overrides

Three escape hatches for per-dashboard customization without forking
shared components, in priority order:

1. **Per-tile `presentation`** — title, subtitle, description,
   valueFormat, accent. Applied first.
2. **Dashboard-level `defaults`** — same fields, applied as fallbacks
   to every tile. Per-tile wins on conflict.
3. **New tile type via the registry** — last resort for genuinely-novel
   shapes. Never fork an existing tile component.

## The kebab

[`ChartActions`](../services/frontend/src/components/ChartActions.tsx)
is the single tile-level kebab. Same pixel position on every tile type;
menu adapts to what the tile supports:

- PNG screenshot — always.
- SVG export — only when the tile's spec is exposed.
- CSV export — only when the chart spec has inline `data.values`.
- Save to dashboard — chat surface only.
- Flag this visual — always.
- Delete visual — edit mode only (via `onDelete`).

The dropdown is portal'd to `document.body` so neither the tile's
`overflow:hidden` nor a sibling grid item's stacking context can clip it.

## Footguns

These are the bugs we keep hitting. They're called out at each site, but
collecting them here too:

- **`<div key={tile.id}>` MUST be the immediate child of `<GridLayout>`.**
  react-grid-layout uses `cloneElement` to apply `style`/`className`. If
  you wrap that `<div>` in a component that doesn't forward those props,
  positioning silently drops and every tile collapses to 0 height.
- **Don't pass `saveable` to the VegaChart inside a tile component.**
  The unified kebab in `DashboardCanvas` is the only kebab on a dashboard
  tile. `saveable` is for the chat surface (ChartBlock).
- **Tile presentation overrides are merged dashboard.defaults ←
  tile.presentation.** Read `overrides.title ?? tile.title`, not the
  other way around.
- **Don't add axis titles, x-tick rotation, or sort changes in a
  modify-chart turn unless the user asked.** This is documented in the
  VegaChartsAgent prompt; the failure mode is the agent regenerating a
  spec from scratch instead of diffing it. See
  [`adk_agents/.../vega_charts_agent.py`](../services/backend/agents/adk_agents/media_performance_agent/subagents/vega_charts_agent/prompts/vega_charts_agent.py).

## Editor agent integration

When `mode=edit`, the floating assistant routes to
`dashboard_editor_agent` instead of `media_performance_agent`. The
editor emits `action` blocks (`pin_chart`, `update_tile`, `remove_tile`,
`set_accent`, `rename_dashboard`); the frontend handlers in
[`lib/dashboards/actions.ts`](../services/frontend/src/lib/dashboards/actions.ts)
apply each one against `lib/dashboards/overrides.ts` (per-tile
presentation + soft-remove ids), `pinsApi` (server-side chart pins), or
`saveUserDashboard` (renames).

The dashboard-context preamble that gets prepended to every user
message is built by
[`lib/dashboards/context.ts`](../services/frontend/src/lib/dashboards/context.ts).
Each tile manifest line ends with `[id=<tile_id>]` — the agent must
copy these character-for-character into `update_tile` / `remove_tile`
actions.

## Grid metrics

| Constant | Value | Where |
|---|---|---|
| Cols | 12 | DashboardCanvas |
| Row height | 40px | DashboardCanvas |
| Margin | 16px | DashboardCanvas |
| Default min sizes | per-tile-spec `layout.minW` / `minH` | per builder |

The edit-mode `GridBackground` reads the same constants so the drop
zones line up with where tiles will actually land.
