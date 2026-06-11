# Dashboard tile architecture

The dashboard grid is a thin renderer over a declarative model. Three layers:

```
data/dashboards/types.ts          spec types (BaseTile, KpiTileSpec, …)
data/dashboards/clients/<X>.ts    per-client dashboard composition
components/dashboards/tiles/      tile renderers (this folder)
components/dashboards/DashboardCanvas.tsx   grid + dispatch
```

Adding or customizing a tile should not require touching the grid wiring
(DashboardCanvas) — that's the contract this folder enforces.

## Adding a new tile type

1. **Type** — in `src/data/dashboards/types.ts`:
   ```ts
   export type TileType = … | 'sparkline';
   export interface SparklineTileSpec extends BaseTile {
     type: 'sparkline';
     title: string;
     metric: MetricKey;
   }
   export type DashboardTile = … | SparklineTileSpec;
   ```
2. **Renderer** — write `components/dashboards/SparklineTile.tsx`.
3. **Register** — add the entry to `TILE_RENDERERS` in `tiles/index.tsx`:
   ```ts
   sparkline: (tile, { overrides }) => (
     <SparklineTile title={overrides.title ?? tile.title} metric={tile.metric} />
   ),
   ```
4. **Compose** — drop one in a client dashboard with
   `sparkline({ title: 'Spend pulse', metric: 'total_spend' })` (add the
   builder helper in `data/dashboards/builders.ts` if you'll reuse the
   shape).

You did not touch `DashboardCanvas.tsx`. That's the point.

## Customizing a tile for one dashboard (without forking)

Three escape hatches, ordered from "do this first" to "last resort":

### 1. Per-tile `presentation` overrides

Any tile carries an optional `presentation` field — read by the renderer
before falling back to the tile's own fields. Use it when one dashboard
wants a different title / format / accent than the seed default:

```ts
{
  ...trend({ title: 'Weekly spend', metric: 'total_spend' }),
  presentation: { title: 'Investment over time', accent: '#06b6d4' },
}
```

The override fields currently honored:
- `title`, `subtitle`, `description` — display strings
- `valueFormat` — number / axis format token
- `accent` — primary chart color

Add a new override field by extending `PresentationOverrides` in
`types.ts` AND threading it through the renderer in `tiles/index.tsx`.

### 2. Dashboard-level `defaults`

For cross-tile theming on one dashboard (e.g., "all charts here use the
emerald accent"), set `Dashboard.defaults`. Per-tile `presentation` still
wins where both specify the same field — defaults are fallbacks.

```ts
export const noi: Dashboard = {
  …,
  defaults: { accent: '#10b981', valueFormat: 'usdCompact' },
  tabs: […],
};
```

### 3. A bespoke tile component (last resort)

If a dashboard genuinely needs a one-off layout that doesn't fit any
existing tile type, add a new tile type for it (see "Adding a new tile
type" above). Don't fork an existing tile component — the registry is
strict about which renderer owns which `tile.type`, and a fork creates
two sources of truth for the same shape.

## What lives where

| Concern | File |
|---|---|
| Tile shape | `data/dashboards/types.ts` |
| Per-client composition | `data/dashboards/clients/*.ts` |
| Renderer for a type | `components/dashboards/<X>Tile.tsx` |
| Type → renderer mapping | `components/dashboards/tiles/index.tsx` |
| Grid layout + kebab + edit-mode wiring | `components/dashboards/DashboardCanvas.tsx` |
| Per-tile kebab actions | `components/ChartActions.tsx` |

## Footguns

- **Don't extract `<div key={tile.id}>` into a component.** react-grid-layout
  positions its IMMEDIATE child via `cloneElement(style/className)`. Wrapping
  the literal `<div>` in a component (that doesn't forward `style`/`className`)
  silently drops grid positioning and every tile collapses to 0 height.
  See `DashboardCanvas.tsx` for the comment marking this contract.
- **Don't pass `saveable` to VegaChart inside a dashboard tile.** The
  unified kebab in `DashboardCanvas` is the only kebab on a tile; the
  internal `saveable` flag is for the chat surface (ChartBlock).
