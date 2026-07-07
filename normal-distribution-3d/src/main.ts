import './style.css';
import { Viewer } from './scene';
import { Surface } from './surface';
import { DataPoints } from './points';
import { Axes } from './axes';
import { createControls } from './interaction';
import { Overlay, type SurfaceInfo } from './overlay';
import { fitBivariate } from './stats';
import { computeKde } from './density';
import { initSigma, type PluginConfig, type PartialState } from './sigma';
import { mockSpec, generateMockData, urlParam } from './mock';
import type { ColumnMap, ElementData, FitResult } from './types';

const app = document.getElementById('app')!;
const overlayEl = document.getElementById('overlay')!;

const viewer = new Viewer(app);
const surface = new Surface();
viewer.scene.add(surface.mesh);
const points = new DataPoints();
viewer.scene.add(points.points);
const axes = new Axes();
viewer.scene.add(axes.group);
const controls = createControls(viewer.camera, viewer.renderer.domElement);
const overlay = new Overlay(overlayEl);

viewer.start((dt) => controls.update(dt));

if (import.meta.env.DEV) {
  // Dev-only handle for e2e checks (rotation state, camera angle).
  (window as unknown as Record<string, unknown>).__nd3d = {
    controls,
    camera: viewer.camera,
    scene: viewer.scene,
    axes,
    viewer,
    surface,
    points,
  };
}

let lastConfig: PluginConfig = {};
let lastData: ElementData = {};
let lastColumns: ColumnMap = {};
let lastPartial: PartialState = null;
let dataEpoch = 0;
// Which source|xColumn|yColumn combination the on-screen fit belongs to —
// lets recompute() distinguish "data still loading for what's configured"
// from "showing exactly what's configured".
let displayedKey: string | null = null;

const mock = mockSpec();

// 'kde' (default): the surface is an empirical density that follows the
// data's actual shape. 'fit': the idealized parametric normal. Standalone
// testing can force either via ?surface=fit|kde.
function surfaceMode(): 'kde' | 'fit' {
  const urlMode = urlParam('surface');
  if (urlMode === 'fit' || urlMode === 'kde') return urlMode;
  return lastConfig.surfaceMode === 'Normal fit' ? 'fit' : 'kde';
}

function apply(
  fit: FitResult,
  xName: string,
  yName: string,
  key: string | null,
  xs?: readonly unknown[],
  ys?: readonly unknown[],
): void {
  let f = fit;
  const showPoints = lastConfig.showPoints !== false; // undefined (standalone) → on

  let clippedPoints = 0;
  if (f.kind === 'fit' && showPoints && xs && ys) {
    const { plotted, clipped } = points.update(xs, ys, f);
    surface.setTranslucent(plotted > 0);
    clippedPoints = clipped;
  } else {
    points.clear();
    surface.setTranslucent(false);
  }

  let info: SurfaceInfo = { kind: 'fit' };
  let kdeExcluded = 0;
  if (f.kind === 'fit' && surfaceMode() === 'kde' && xs && ys) {
    const kde = computeKde(xs, ys, f);
    if (kde) {
      surface.setField(kde.sampler, kde.max);
      info = { kind: 'kde', h: kde.h };
      kdeExcluded = f.n - kde.n;
    } else {
      surface.update(f.rho);
    }
  } else {
    surface.update(f.kind === 'fit' ? f.rho : 0);
  }

  if (f.kind === 'fit') {
    const notes: string[] = [];
    if (f.clamped) {
      // The KDE isn't clamped — it renders the data's actual ridge.
      notes.push(
        info.kind === 'kde'
          ? 'Correlation ≈ ±1 — density shows the actual ridge'
          : 'Correlation ≈ ±1 — showing clamped surface',
      );
    }
    if (f.note) notes.push(f.note); // partial-load note composed in recompute()
    // Disclose ±3σ exclusions whether they came from the visible scatter or
    // from the density input (points hidden). The counts agree when both run.
    const clipped = Math.max(clippedPoints, kdeExcluded);
    if (clipped > 0) {
      notes.push(`${clipped.toLocaleString()} point${clipped === 1 ? '' : 's'} beyond ±3σ not shown`);
    }
    if (notes.length > 0) f = { ...f, note: notes.join(' — ') };
  }

  axes.update(fit, xName, yName); // tick values from the raw fit (μ/σ), not the note-annotated copy
  axes.setVisible(lastConfig.showAxes !== false); // undefined (standalone) → on
  overlay.update(f, xName, yName, info);
  displayedKey = key;
}

// Every config/data/columns event funnels through here. Idempotent and cheap
// (~14.6k vertices), so Sigma's repeated data callbacks (initial load, filter
// changes, pagination, refreshes) are safe.
function recompute(): void {
  if (mock !== null) {
    const { xs, ys } = generateMockData(mock);
    apply(fitBivariate(xs, ys), 'Mock X', 'Mock Y', 'mock', xs, ys);
    return;
  }

  const { source, xColumn, yColumn } = lastConfig;
  if (!source || !xColumn || !yColumn) {
    apply({ kind: 'fallback', reason: 'Select a source and two numeric columns' }, 'X', 'Y', null);
    return;
  }

  const key = `${source}|${xColumn}|${yColumn}`;
  const xName = lastColumns[xColumn]?.name ?? 'X';
  const yName = lastColumns[yColumn]?.name ?? 'Y';

  const xs = lastData[xColumn];
  const ys = lastData[yColumn];
  if (!xs || !ys) {
    // Data for this exact column combination hasn't arrived (initial load,
    // mid source-switch payload, or a column that no longer exists). Keep
    // the surface, but never let the legend claim a fit it isn't showing —
    // and never keep a different dataset's point cloud (or a toggled-off
    // one) on screen.
    if (lastConfig.showPoints === false || displayedKey !== key) {
      points.clear();
      surface.setTranslucent(false);
    }
    if (displayedKey !== key) {
      overlay.update({ kind: 'fallback', reason: 'Loading data…' }, xName, yName);
      // Reset the axes to the new columns' names and neutral (standardized)
      // ticks — otherwise they keep asserting the previous dataset's real
      // units and column names while the legend says "Loading data…".
      axes.update({ kind: 'fallback', reason: 'loading' }, xName, yName);
      axes.setVisible(lastConfig.showAxes !== false);
      displayedKey = null;
    }
    return;
  }

  let fit = fitBivariate(xs, ys);
  if (fit.kind === 'fit' && lastPartial) {
    const msg =
      lastPartial === 'capped'
        ? `Fit limited to the first ${fit.n.toLocaleString()} rows`
        : 'Loading more rows — fit may update';
    fit = { ...fit, note: fit.note ? `${fit.note} — ${msg}` : msg };
  }
  apply(fit, xName, yName, key, xs, ys);
}

// Initial render — outside Sigma no subscription ever fires, and inside an
// unconfigured element this guarantees the chart is never blank.
recompute();

initSigma({
  onConfig: (config) => {
    lastConfig = config;
    recompute();
  },
  onData: (data, partial) => {
    lastData = data;
    lastPartial = partial;
    dataEpoch++;
    if (partial === 'loading') {
      // Tables with exactly 25k·m rows never deliver a final off-boundary
      // chunk; clear the "loading more" note if no new data follows.
      const epoch = dataEpoch;
      window.setTimeout(() => {
        if (dataEpoch === epoch && lastPartial === 'loading') {
          lastPartial = null;
          recompute();
        }
      }, 4000);
    }
    recompute();
  },
  onColumns: (columns) => {
    lastColumns = columns;
    recompute();
  },
});
