# 3D Normal Distribution — Sigma Plugin

A Sigma Computing workbook plugin that renders a 3D bivariate normal
distribution surface with Three.js.

- **Drag** to rotate the surface. When idle for ~2.5s, it slowly auto-rotates.
- Pick a **source element** and **two numeric columns**: the plugin fits the
  means, standard deviations, and Pearson correlation from the data. The
  legend shows the fitted parameters in real units.
- **The surface adapts to the data.** The default mode is an empirical
  density (fast binned KDE, Scott's-rule bandwidth) — skewed or multi-cluster
  data shows its real shape, e.g. two humps for bimodal data. Switch the
  **Surface** option in the editor panel to "Normal fit" for the idealized
  parametric bell (shape driven by ρ alone).
- Every data point renders as a scatter beneath the surface (in the same
  standardized coordinates), with the bell drawn as tinted glass so the cloud
  reads through it. Points outside the plotted ±3σ range are counted in the
  legend. Toggle via **Show data points** in the editor panel.
- Named axes with value markers: the X and Y column names label their axes,
  and tick markers along each show the real data values at μ, μ±σ, μ±2σ, μ±3σ
  (a vertical "Relative density" axis marks 50% / 100% of the peak). Toggle via
  **Show axes** in the editor panel.
- With nothing configured, a synthetic standard normal renders — the chart is
  never blank.
- Zoom and pan are intentionally disabled so mouse-wheel scrolling of the
  workbook is never hijacked.

## Development

```sh
npm install
npm run dev        # http://localhost:5173
```

Standalone test URLs (no Sigma needed). Test params go in the URL **hash** —
the Sigma SDK JSON-parses regular query params and logs errors for non-JSON
values:

- `http://localhost:5173/` — fallback standard normal (ρ = 0)
- `http://localhost:5173/#mock=0.7` — 2,000 seeded correlated pairs, ρ ≈ 0.7
- `http://localhost:5173/#mock=-0.9` — strong negative correlation
- `http://localhost:5173/#mock=bimodal` — two clusters; the KDE surface shows two humps
- add `&surface=fit` (or `surface=kde`) to force a surface mode, e.g.
  `#mock=bimodal&surface=fit`

`npm run build` type-checks and bundles to `dist/`; `npm run preview` serves
the production build.

## Using it in Sigma

1. In Sigma: **Administration > Account > Plugins** (org admin) → **Add** →
   register the plugin with URL `http://localhost:5173` (dev) or your hosted
   URL (production).
2. In a workbook, add a **Plugin** element and choose this plugin.
3. In the editor panel, select a **source** element, then an **X Column** and
   **Y Column** (numeric columns only are offered).

Notes:

- For local dev, use **Chrome**: it treats `http://localhost` as a trustworthy
  origin inside https Sigma. Safari blocks mixed content — if you need Safari,
  serve the dev server over https (e.g. `@vitejs/plugin-basic-ssl`) and
  register the https URL.
- Production hosting: any static host (Vercel, Netlify, S3+CloudFront, GitHub
  Pages). Deploy `dist/` and update the registered plugin URL.

## Degenerate data handling

| Situation                          | Behavior                                        |
| ---------------------------------- | ----------------------------------------------- |
| Fewer than 2 valid paired rows     | Fallback surface + note                         |
| A column with zero variance        | Fallback surface + note                         |
| ρ ≈ ±1 (e.g. same column twice)    | Density mode shows the actual ridge; normal-fit mode clamps ρ to ±0.99 — noted either way |
| Nulls / non-numeric values         | Row dropped as a pair (keeps X/Y aligned for ρ) |
| Tables above 25,000 rows           | Auto-paginates (Sigma delivers 25k chunks) up to 500k rows, then notes the cap in the legend |

The surface is always evaluated in standardized coordinates (μ ± 3σ mapped to
a fixed footprint, peak height constant), so wildly different column scales
can never flatten or explode the geometry — real units appear only in the
legend.
