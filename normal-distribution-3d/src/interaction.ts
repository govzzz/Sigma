import type { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_TARGET_Y } from './types';

const RESUME_DELAY_MS = 2500;
const AUTO_ROTATE_SPEED = 0.8; // OrbitControls default 2.0 ≈ one orbit per 30s

/**
 * Drag-to-rotate with slow idle auto-rotation.
 *
 * State machine: AUTO —(start)→ INTERACTING —(end)→ IDLE-PENDING —(2.5s)→ AUTO.
 * 'start' must both stop the rotation AND cancel any pending resume timer,
 * otherwise a timer from a previous interaction re-enables spin mid-drag.
 *
 * Zoom and pan are disabled on purpose: OrbitControls' wheel handler would
 * hijack workbook page scroll whenever the cursor crosses the plugin. With
 * enableZoom=false the handler returns before preventDefault, so wheel
 * events pass through to the page. Camera distance is fixed to frame ±3σ.
 */
export function createControls(camera: PerspectiveCamera, domElement: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = true;
  controls.autoRotateSpeed = AUTO_ROTATE_SPEED;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.495; // never below the floor
  controls.target.set(0, CAMERA_TARGET_Y, 0);
  controls.update();

  let resumeTimer: number | undefined;

  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    window.clearTimeout(resumeTimer);
  });

  controls.addEventListener('end', () => {
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      controls.autoRotate = true;
    }, RESUME_DELAY_MS);
  });

  return controls;
}
