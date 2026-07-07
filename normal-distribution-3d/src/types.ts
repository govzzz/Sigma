/** Side length of the square surface footprint, in world units. */
export const PLOT_SIZE = 10;

/** Grid segments per axis (121×121 vertices ≈ 14.6k — trivial for WebGL). */
export const SEGMENTS = 120;

/** The surface spans μ ± STD_RANGE·σ on each axis. */
export const STD_RANGE = 3;

/** Peak of the surface always renders at this height, regardless of fit. */
export const PEAK_HEIGHT = 0.45 * PLOT_SIZE;

/** Orbit target sits slightly above the floor for nicer framing. */
export const CAMERA_TARGET_Y = 0.3 * PEAK_HEIGHT;

/** Correlation is clamped to ±RHO_MAX to keep 1/(1−ρ²) finite. */
export const RHO_MAX = 0.99;

export type FitResult =
  | {
      kind: 'fit';
      muX: number;
      muY: number;
      sigmaX: number;
      sigmaY: number;
      rho: number;
      n: number;
      /** True when |ρ| exceeded RHO_MAX and was clamped. */
      clamped?: boolean;
      note?: string;
    }
  | { kind: 'fallback'; reason: string };

export interface ColumnInfo {
  name: string;
}

export type ColumnMap = Record<string, ColumnInfo>;
export type ElementData = Record<string, unknown[]>;
