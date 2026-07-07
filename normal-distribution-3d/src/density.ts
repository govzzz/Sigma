import { STD_RANGE } from './types';
import { toNum } from './stats';

const GRID = 128; // KDE grid nodes per axis, independent of mesh resolution

export interface KdeResult {
  /** Bilinear sampler over standardized coords u,v ∈ [−3,3]. */
  sampler: (u: number, v: number) => number;
  /** Peak density value, for height normalization. */
  max: number;
  /** Bandwidth actually used, in σ units (Scott's rule). */
  h: number;
  /** Points that landed inside the ±3σ window. */
  n: number;
}

/**
 * Fast binned kernel density estimate in standardized coordinates: histogram
 * the pairs onto a fixed grid, then apply a separable Gaussian blur with
 * Scott's-rule bandwidth (h = n^(−1/6); the per-axis σ standardization has
 * already whitened the data). O(n + grid²·kernel) — fine at the 500k cap.
 *
 * Same pairing/coercion semantics as fitBivariate, with one extra exclusion:
 * rows beyond the ±3σ window are dropped (the returned n counts what was
 * actually binned — the caller discloses fit.n − kde.n as clipped).
 */
export function computeKde(
  xs: readonly unknown[],
  ys: readonly unknown[],
  fit: { muX: number; muY: number; sigmaX: number; sigmaY: number },
): KdeResult | null {
  const len = Math.min(xs.length, ys.length);
  const R = STD_RANGE;
  const toGrid = (GRID - 1) / (2 * R);
  const grid = new Float32Array(GRID * GRID);

  let n = 0;
  for (let i = 0; i < len; i++) {
    const x = toNum(xs[i]);
    const y = toNum(ys[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const u = (x - fit.muX) / fit.sigmaX;
    const v = (y - fit.muY) / fit.sigmaY;
    if (Math.abs(u) > R || Math.abs(v) > R) continue;
    const gx = Math.round((u + R) * toGrid);
    const gy = Math.round((v + R) * toGrid);
    grid[gy * GRID + gx] += 1;
    n++;
  }
  if (n < 2) return null;

  const h = Math.pow(n, -1 / 6); // Scott's rule in standardized units
  const cell = (2 * R) / (GRID - 1);
  blurSeparable(grid, GRID, Math.max(h / cell, 0.5));

  let max = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] > max) max = grid[i];
  if (!(max > 0)) return null;

  const sampler = (u: number, v: number): number => {
    const fx = Math.min(Math.max((u + R) * toGrid, 0), GRID - 1);
    const fy = Math.min(Math.max((v + R) * toGrid, 0), GRID - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, GRID - 1);
    const y1 = Math.min(y0 + 1, GRID - 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = grid[y0 * GRID + x0] * (1 - tx) + grid[y0 * GRID + x1] * tx;
    const b = grid[y1 * GRID + x0] * (1 - tx) + grid[y1 * GRID + x1] * tx;
    return a * (1 - ty) + b * ty;
  };

  return { sampler, max, h, n };
}

/** In-place separable Gaussian blur; kernel truncated at 3σ (edges dim slightly). */
function blurSeparable(data: Float32Array, size: number, sigmaCells: number): void {
  const radius = Math.max(1, Math.ceil(3 * sigmaCells));
  const kernel = new Float32Array(2 * radius + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-0.5 * (i / sigmaCells) ** 2);
    kernel[i + radius] = w;
    sum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(size * size);
  // Horizontal pass
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < size) acc += data[y * size + xx] * kernel[k + radius];
      }
      tmp[y * size + x] = acc;
    }
  }
  // Vertical pass
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < size) acc += tmp[yy * size + x] * kernel[k + radius];
      }
      data[y * size + x] = acc;
    }
  }
}
