import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLOT_SIZE, STD_RANGE, PEAK_HEIGHT, type FitResult } from './types';
import { formatValue } from './format';

const EDGE = PLOT_SIZE / 2;
const TICK_LEN = 0.22;
const LABEL_OFFSET = 0.85; // pushed out enough that the two axes' corner ticks don't collide
const TITLE_OFFSET = 1.9;
const TICKS = [-3, -2, -1, 0, 1, 2, 3];

// Standardized u,v ∈ [−3,3] → world coordinate on the footprint edge.
const worldFromStd = (s: number): number => (s / STD_RANGE) * EDGE;

type Vec3 = [number, number, number];

/**
 * A 3D axis frame around the surface footprint: the X and Y column axes on
 * two adjacent floor edges and a vertical "relative density" axis at the
 * corner. Tick labels sit at each ±σ node and show REAL data values
 * (μ + k·σ) even though the surface is drawn in standardized space. Labels
 * are CSS2D DOM elements, so they stay crisp and reproject as the chart
 * rotates. Line/tick geometry is built once; update() only rewrites the
 * tick text and axis titles (no DOM churn on data refreshes).
 */
export class Axes {
  readonly group = new THREE.Group();
  private readonly xTickEls: HTMLElement[] = [];
  private readonly yTickEls: HTMLElement[] = [];
  private xTitleEl!: HTMLElement;
  private yTitleEl!: HTMLElement;
  private readonly labels: CSS2DObject[] = [];
  private readonly lineGeometry: THREE.BufferGeometry;
  private readonly lineMaterial: THREE.LineBasicMaterial;

  constructor() {
    const pts: number[] = [];
    const seg = (a: Vec3, b: Vec3) => pts.push(...a, ...b);

    // Main axis lines.
    seg([-EDGE, 0, -EDGE], [EDGE, 0, -EDGE]); // X column axis (along z = −EDGE)
    seg([-EDGE, 0, -EDGE], [-EDGE, 0, EDGE]); // Y column axis (along x = −EDGE)
    seg([-EDGE, 0, -EDGE], [-EDGE, PEAK_HEIGHT, -EDGE]); // density axis (vertical)

    // Tick marks.
    for (const k of TICKS) {
      const x = worldFromStd(k);
      seg([x, 0, -EDGE], [x, 0, -EDGE - TICK_LEN]);
    }
    for (const k of TICKS) {
      const z = worldFromStd(k);
      seg([-EDGE, 0, z], [-EDGE - TICK_LEN, 0, z]);
    }
    for (const y of [0, PEAK_HEIGHT / 2, PEAK_HEIGHT]) {
      seg([-EDGE, y, -EDGE], [-EDGE - TICK_LEN, y, -EDGE]);
    }

    this.lineGeometry = new THREE.BufferGeometry();
    this.lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.lineMaterial = new THREE.LineBasicMaterial({ color: 0x94a3b8 });
    this.group.add(new THREE.LineSegments(this.lineGeometry, this.lineMaterial));

    // Tick value labels (text filled in by update()).
    for (const k of TICKS) {
      const el = this.addLabel('axis-tick', [worldFromStd(k), 0, -EDGE - LABEL_OFFSET]);
      this.xTickEls.push(el);
    }
    for (const k of TICKS) {
      const el = this.addLabel('axis-tick', [-EDGE - LABEL_OFFSET, 0, worldFromStd(k)]);
      this.yTickEls.push(el);
    }

    // Vertical axis markers are relative (height is normalized to a constant
    // peak), so absolute density values would be meaningless. The base (0)
    // is omitted — it coincides with the shared origin corner.
    const densTicks: Array<[number, string]> = [
      [PEAK_HEIGHT / 2, '50%'],
      [PEAK_HEIGHT, '100%'],
    ];
    for (const [y, text] of densTicks) {
      this.addLabel('axis-tick', [-EDGE - LABEL_OFFSET, y, -EDGE]).textContent = text;
    }

    // Axis titles.
    this.xTitleEl = this.addLabel('axis-title', [0, 0, -EDGE - TITLE_OFFSET]);
    this.yTitleEl = this.addLabel('axis-title', [-EDGE - TITLE_OFFSET, 0, 0]);
    this.addLabel('axis-title', [-EDGE - LABEL_OFFSET, PEAK_HEIGHT + 0.6, -EDGE]).textContent =
      'Relative density';
  }

  private addLabel(cls: string, position: Vec3): HTMLElement {
    const el = document.createElement('div');
    el.className = cls;
    const obj = new CSS2DObject(el);
    obj.position.set(...position);
    this.group.add(obj);
    this.labels.push(obj);
    return el;
  }

  /** Rewrite tick values (real units) and axis titles. */
  update(fit: FitResult, xName: string, yName: string): void {
    const muX = fit.kind === 'fit' ? fit.muX : 0;
    const sigmaX = fit.kind === 'fit' ? fit.sigmaX : 1;
    const muY = fit.kind === 'fit' ? fit.muY : 0;
    const sigmaY = fit.kind === 'fit' ? fit.sigmaY : 1;
    TICKS.forEach((k, j) => {
      this.xTickEls[j].textContent = formatValue(muX + k * sigmaX);
      this.yTickEls[j].textContent = formatValue(muY + k * sigmaY);
    });
    this.xTitleEl.textContent = xName;
    this.yTitleEl.textContent = yName;
  }

  setVisible(visible: boolean): void {
    // The line geometry follows group.visible, but CSS2DRenderer checks each
    // label's own .visible flag (it does not honor ancestor visibility).
    this.group.visible = visible;
    for (const label of this.labels) label.visible = visible;
  }

  dispose(): void {
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    for (const label of this.labels) label.element.remove();
  }
}
