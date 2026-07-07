import * as THREE from 'three';
import { PLOT_SIZE, SEGMENTS, STD_RANGE, PEAK_HEIGHT, RHO_MAX } from './types';

// Height ramp: deep blue → teal → warm yellow.
const STOPS = [new THREE.Color('#1e3a8a'), new THREE.Color('#14b8a6'), new THREE.Color('#facc15')];

function rampColor(t: number, out: THREE.Color): void {
  const s = Math.min(Math.max(t, 0), 1) * (STOPS.length - 1);
  const i = Math.min(Math.floor(s), STOPS.length - 2);
  out.lerpColors(STOPS[i], STOPS[i + 1], s - i);
}

/**
 * The bivariate normal PDF surface.
 *
 * Geometry is allocated once at fixed resolution; every update overwrites
 * the height and color buffers in place (no per-update allocation, no GPU
 * leaks). The grid maps the world footprint [−PLOT_SIZE/2, PLOT_SIZE/2]² to
 * standardized coordinates u,v ∈ [−STD_RANGE, STD_RANGE] (i.e. μ ± 3σ), so
 * the rendered shape depends only on ρ — real units belong in the legend.
 */
export class Surface {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.MeshStandardMaterial;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(PLOT_SIZE, PLOT_SIZE, SEGMENTS, SEGMENTS);
    this.geometry.rotateX(-Math.PI / 2); // XZ ground plane, Y = height
    const count = this.geometry.attributes.position.count;
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.55,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.update(0);
  }

  /** Rewrite heights/colors from the analytic normal PDF for the given ρ. */
  update(rho: number): void {
    const r = Math.max(-RHO_MAX, Math.min(RHO_MAX, Number.isFinite(rho) ? rho : 0));
    const q = 1 - r * r;
    const gMax = 1 / (2 * Math.PI * Math.sqrt(q)); // analytic peak of the standardized PDF
    this.setField((u, v) => gMax * Math.exp(-(u * u - 2 * r * u * v + v * v) / (2 * q)), gMax);
  }

  /**
   * Rewrite heights/colors from an arbitrary density field over standardized
   * coords, scaled so `peak` renders at PEAK_HEIGHT. Never throws — any
   * non-finite value falls back to the standard normal.
   */
  setField(field: (u: number, v: number) => number, peak: number): void {
    const zScale = peak > 0 && Number.isFinite(peak) ? PEAK_HEIGHT / peak : 0;
    const toStd = (2 * STD_RANGE) / PLOT_SIZE;

    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    const col = this.geometry.attributes.color as THREE.BufferAttribute;
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) * toStd;
      const v = pos.getZ(i) * toStd;
      const y = field(u, v) * zScale;
      if (!Number.isFinite(y)) {
        // Degenerate math slipped through every guard — render the standard normal.
        this.update(0);
        return;
      }
      pos.setY(i, y);
      rampColor(y / PEAK_HEIGHT, tmp);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
  }

  /**
   * Translucent while the data-point cloud is shown, so it reads through.
   * depthWrite stays off in that mode: with DoubleSide geometry, depth writes
   * during the transparent pass reject faces in draw order and the bell goes
   * patchy/milky.
   */
  setTranslucent(on: boolean): void {
    if (this.material.transparent === on) return;
    this.material.transparent = on;
    this.material.opacity = on ? 0.72 : 1;
    this.material.depthWrite = !on;
    this.material.needsUpdate = true; // toggling `transparent` swaps the program
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
