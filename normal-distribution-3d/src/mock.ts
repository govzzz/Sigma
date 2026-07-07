/**
 * Standalone test mode: `?mock=<rho>` (e.g. /?mock=0.7) generates correlated
 * pairs and feeds them through the exact same fit → surface → legend path as
 * Sigma data, with zero Sigma dependency. Seeded PRNG so every load renders
 * the identical surface.
 */

const MU_X = 50;
const MU_Y = 120;
const SIGMA_X = 10;
const SIGMA_Y = 25;

export type MockSpec = { kind: 'rho'; rho: number } | { kind: 'bimodal' };

/**
 * Test params live in the URL hash (#mock=bimodal&surface=fit): the Sigma SDK
 * JSON-parses every regular query param for its own config transport and logs
 * an error for each non-JSON value.
 */
export function urlParam(name: string): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get(name);
  if (hash !== null) return hash;
  return new URLSearchParams(window.location.search).get(name);
}

export function mockSpec(): MockSpec | null {
  const p = urlParam('mock');
  if (p === null) return null;
  if (p === 'bimodal') return { kind: 'bimodal' };
  const rho = Number(p);
  if (!Number.isFinite(rho)) return { kind: 'rho', rho: 0.7 };
  return { kind: 'rho', rho: Math.max(-0.99, Math.min(0.99, rho)) };
}

export function generateMockData(spec: MockSpec, n = 2000): { xs: number[]; ys: number[] } {
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0; // LCG (Numerical Recipes constants)
    return seed / 4294967296;
  };
  // Box–Muller pair of independent standard normals.
  const normals = (): [number, number] => {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    const m = Math.sqrt(-2 * Math.log(u1));
    return [m * Math.cos(2 * Math.PI * u2), m * Math.sin(2 * Math.PI * u2)];
  };

  const xs: number[] = [];
  const ys: number[] = [];
  if (spec.kind === 'bimodal') {
    // Two well-separated clusters — the empirical-density surface should show
    // two humps here, while the normal fit can only ever draw one bell.
    for (let i = 0; i < n; i++) {
      const [z1, z2] = normals();
      if (rand() < 0.5) {
        xs.push(38 + 6 * z1);
        ys.push(95 + 14 * z2);
      } else {
        xs.push(64 + 7 * z1);
        ys.push(148 + 18 * z2);
      }
    }
  } else {
    const comp = Math.sqrt(1 - spec.rho * spec.rho); // Cholesky for ρ
    for (let i = 0; i < n; i++) {
      const [z1, z2] = normals();
      xs.push(MU_X + SIGMA_X * z1);
      ys.push(MU_Y + SIGMA_Y * (spec.rho * z1 + comp * z2));
    }
  }
  return { xs, ys };
}
