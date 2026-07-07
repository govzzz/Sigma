import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLOT_SIZE, CAMERA_TARGET_Y } from './types';

const TARGET = new THREE.Vector3(0, CAMERA_TARGET_Y, 0);

// Bounding radius of the content around TARGET: the footprint corners sweep
// a lateral radius of PLOT_SIZE/√2 during rotation; 8% breathing room.
const FRAME_RADIUS = 1.08 * Math.hypot(Math.SQRT1_2 * PLOT_SIZE, CAMERA_TARGET_Y);
const MAX_CAMERA_DISTANCE = 120; // don't chase degenerate sliver aspects

/** Renderer + camera + lights + sizing. Built once at module load. */
export class Viewer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly labelRenderer: CSS2DRenderer;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Separate DOM layer for crisp axis labels, overlaid on the canvas.
    // pointer-events:none so it never intercepts OrbitControls drag/wheel.
    this.labelRenderer = new CSS2DRenderer();
    const labelEl = this.labelRenderer.domElement;
    labelEl.style.position = 'absolute';
    labelEl.style.top = '0';
    labelEl.style.left = '0';
    labelEl.style.pointerEvents = 'none';
    container.appendChild(labelEl);

    this.scene.background = new THREE.Color('#f7f8fa');

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.set(12, 9, 12);
    this.camera.lookAt(TARGET);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 7);
    this.scene.add(dir);

    const grid = new THREE.GridHelper(PLOT_SIZE, 10, 0xb0b6c0, 0xd8dce2);
    grid.position.y = -0.05; // far enough below the surface skirt to avoid z-fighting
    this.scene.add(grid);

    // The Sigma element resizes without any window "resize" event —
    // ResizeObserver is the source of truth. It also fires once on observe,
    // which handles initial layout; the iframe can briefly be 0×0.
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width < 2 || height < 2) return;
      this.renderer.setSize(width, height, false);
      this.labelRenderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.frameContent();
      this.camera.updateProjectionMatrix();
    });
    ro.observe(container);

    // three.js recompiles programs and re-uploads buffers on restore; this
    // listener exists only so a lost context is visible in the console.
    this.renderer.domElement.addEventListener('webglcontextlost', () => {
      console.warn('normal-distribution-3d: WebGL context lost; awaiting restore');
    });
  }

  /**
   * Dolly the camera along its current view direction so the whole surface
   * fits the frustum at any aspect. Zoom is disabled, so without this a
   * portrait tile (aspect < ~0.92) would clip the plot with no way to recover.
   */
  private frameContent(): void {
    const halfV = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * this.camera.aspect);
    const distance = Math.min(FRAME_RADIUS / Math.sin(Math.min(halfV, halfH)), MAX_CAMERA_DISTANCE);
    const dir = this.camera.position.clone().sub(TARGET);
    if (dir.lengthSq() < 1e-6) dir.set(12, 9 - CAMERA_TARGET_Y, 12);
    this.camera.position.copy(TARGET).addScaledVector(dir.normalize(), distance);
  }

  /**
   * Continuous loop — required every frame by OrbitControls damping and
   * autoRotate. The frame delta (seconds) is passed through because
   * OrbitControls.update(undefined) assumes 60 calls/sec, which would spin
   * the idle rotation 2x too fast on a 120Hz display.
   */
  start(onFrame: (dtSeconds: number) => void): void {
    let last: number | null = null;
    this.renderer.setAnimationLoop((time: number) => {
      // Clamp big gaps (hidden tab suspends rAF) so the camera doesn't lurch.
      const dt = last === null ? 1 / 60 : Math.min((time - last) / 1000, 0.1);
      last = time;
      onFrame(dt);
      this.renderer.render(this.scene, this.camera);
      this.labelRenderer.render(this.scene, this.camera);
    });
  }
}
