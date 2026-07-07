import { RHO_MAX, type FitResult } from './types';

export function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

/**
 * Fit a bivariate normal (μx, μy, σx, σy, ρ) from two parallel column arrays.
 *
 * Rows where either value is null/non-numeric are dropped as a pair —
 * filtering the columns independently would misalign them and corrupt ρ.
 * Accumulation is Welford-style so huge magnitudes (e.g. unix timestamps)
 * don't lose precision to naive sum-of-products in float64.
 */
export function fitBivariate(xs: readonly unknown[], ys: readonly unknown[]): FitResult {
  const len = Math.min(xs.length, ys.length);
  let n = 0;
  let meanX = 0;
  let meanY = 0;
  let m2x = 0; // Σ(x−μx)²
  let m2y = 0; // Σ(y−μy)²
  let cxy = 0; // Σ(x−μx)(y−μy)

  for (let i = 0; i < len; i++) {
    const x = toNum(xs[i]);
    const y = toNum(ys[i]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++;
    const dx = x - meanX;
    meanX += dx / n;
    const dy = y - meanY;
    meanY += dy / n;
    m2x += dx * (x - meanX);
    cxy += dx * (y - meanY);
    m2y += dy * (y - meanY);
  }

  if (n < 2) return { kind: 'fallback', reason: 'Fewer than 2 valid data rows' };

  const sigmaX = Math.sqrt(m2x / (n - 1));
  const sigmaY = Math.sqrt(m2y / (n - 1));
  if (sigmaX < 1e-12 * Math.max(1, Math.abs(meanX))) {
    return { kind: 'fallback', reason: 'X column has zero variance' };
  }
  if (sigmaY < 1e-12 * Math.max(1, Math.abs(meanY))) {
    return { kind: 'fallback', reason: 'Y column has zero variance' };
  }

  const rho = cxy / (n - 1) / (sigmaX * sigmaY);
  if (!Number.isFinite(rho)) return { kind: 'fallback', reason: 'Correlation is undefined' };

  if (Math.abs(rho) > RHO_MAX) {
    // The caller knows which surface is rendered, so the user-facing message
    // is composed there — stats only flags the clamp.
    return {
      kind: 'fit',
      muX: meanX,
      muY: meanY,
      sigmaX,
      sigmaY,
      rho: Math.sign(rho) * RHO_MAX,
      n,
      clamped: true,
    };
  }

  return { kind: 'fit', muX: meanX, muY: meanY, sigmaX, sigmaY, rho, n };
}
