import * as THREE from 'three';
import { PLOT_SIZE, STD_RANGE } from './types';
import { toNum } from './stats';

const POINT_SIZE = 0.07; // world units (sizeAttenuation)
const POINT_Y = 0.02; // just above the floor, clear of the grid at -0.05

export interface PointsResult {
  plotted: number;
  clipped: number;
}

/**
 * Scatter of the raw data pairs in the same standardized space as the
 * surface: (x−μx)/σx, (y−μy)/σy mapped onto the world footprint. Points are
 * opaque and render before the translucent surface, so the cloud reads
 * through the fitted bell. The position buffer grows geometrically and is
 * reused via setDrawRange, so pagination updates don't churn GPU memory.
 */
export class DataPoints {
  points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private capacity = 0;

  constructor() {
    this.material = new THREE.PointsMaterial({
      color: new THREE.Color('#1e293b'),
      size: POINT_SIZE,
      sizeAttenuation: true,
    });
    this.geometry = new THREE.BufferGeometry();
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.visible = false;
    this.clear();
  }

  update(
    xs: readonly unknown[],
    ys: readonly unknown[],
    fit: { muX: number; muY: number; sigmaX: number; sigmaY: number },
  ): PointsResult {
    const len = Math.min(xs.length, ys.length);
    const shrink = this.capacity > 1024 && len < this.capacity / 4;
    if (len > this.capacity || shrink) {
      // Replace the whole geometry so the old GPU buffer is actually freed.
      this.capacity = Math.max(1024, 2 ** Math.ceil(Math.log2(Math.max(len, 1))));
      this.geometry.dispose();
      this.geometry = new THREE.BufferGeometry();
      this.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(this.capacity * 3), 3),
      );
      this.points.geometry = this.geometry;
    }

    const attr = this.geometry.attributes.position as THREE.BufferAttribute;
    const scale = PLOT_SIZE / (2 * STD_RANGE); // std units → world units
    let k = 0;
    let clipped = 0;
    for (let i = 0; i < len; i++) {
      const x = toNum(xs[i]);
      const y = toNum(ys[i]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const u = (x - fit.muX) / fit.sigmaX;
      const v = (y - fit.muY) / fit.sigmaY;
      if (Math.abs(u) > STD_RANGE || Math.abs(v) > STD_RANGE) {
        clipped++;
        continue;
      }
      attr.setXYZ(k++, u * scale, POINT_Y, v * scale);
    }

    this.geometry.setDrawRange(0, k);
    // Only upload the vertices actually written — without an update range,
    // three re-uploads the whole backing buffer (6 MB at the 500k cap) on
    // every pagination chunk.
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, k * 3);
    attr.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    this.points.visible = k > 0;
    return { plotted: k, clipped };
  }

  clear(): void {
    this.geometry.setDrawRange(0, 0);
    this.points.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
